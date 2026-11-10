import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpenCode } from '@opencode/client';
import { Rpc } from '@opencode/plugin/rpc';
import { Security, scanInputSchema } from '../src/rpc.ts';
const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
// Keep policy fixtures outside this checkout with their own Git markers. The real
// SDK can expand nested policy paths; production guards correctly reject that.
const fixture = await realpath(await mkdtemp(join(tmpdir(), 'opencode-security-fixture-')));
await cp(`${root}/fixtures/vulnerable`, fixture, { recursive: true });
await mkdir(join(fixture, '.git'));
const secondFixture = await realpath(await mkdtemp(join(tmpdir(), 'opencode-security-second-')));
await cp(`${root}/fixtures/vulnerable`, secondFixture, { recursive: true });
await mkdir(join(secondFixture, '.git'));
const configPath = `${root}/.runtime/plan/config/opencode/opencode.json`;
await mkdir(`${root}/.runtime/plan/config/opencode`, { recursive: true });
await mkdir(`${root}/.runtime/plan/home`, { recursive: true });
await writeFile(
  configPath,
  JSON.stringify({
    plugins: [{ package: `${root}/tests/mock-host-plugin`, options: { engine: 'codex' } }],
  }),
);
await writeFile(
  `${root}/.runtime/plan/config/opencode/codex-security.json`,
  JSON.stringify({
    codex: { model: 'gpt-6.1-sol', reasoningEffort: 'high', daybreak: true },
    scan: { mode: 'standard', maxCostUsd: 2, cyberAccessProgram: 'daybreak_blue' },
  }),
);
const TestRpc = Rpc.define({
  id: 'gill.security.mock-test',
  events: {},
  methods: {
    prepareByTool: { input: scanInputSchema, output: { type: 'object' } },
    inspect: { input: { type: 'object' }, output: { type: 'object' } },
    toolCall: {
      input: {
        type: 'object',
        properties: { name: { type: 'string' }, args: { type: 'object' } },
        required: ['name', 'args'],
      },
      output: { type: 'object' },
    },
  },
});
const env = {
  PATH: process.env.PATH,
  HOME: `${root}/.runtime/plan/home`,
  XDG_DATA_HOME: `${root}/.runtime/plan/data`,
  XDG_CONFIG_HOME: `${root}/.runtime/plan/config`,
  XDG_STATE_HOME: `${root}/.runtime/plan/state`,
  XDG_CACHE_HOME: `${root}/.runtime/plan/cache`,
  OPENCODE_CONFIG: configPath,
  OPENCODE_DISABLE_AUTOUPDATE: '1',
  OPENCODE_DISABLE_MODELS_FETCH: '1',
};
const child = spawn(
  `${root}/node_modules/.bin/opencode`,
  ['serve', '--hostname', '127.0.0.1', '--port', '4110'],
  { cwd: fixture, env, stdio: ['ignore', 'pipe', 'pipe'] },
);
let output = '',
  stderr = '';
child.stdout.on('data', (d) => (output += d));
child.stderr.on('data', (d) => (stderr += d));
try {
  for (let i = 0; i < 100 && !/server password ([^\s]+)/.test(output); i++) {
    if (child.exitCode !== null) throw new Error(stderr);
    await sleep(100);
  }
  const password = output.match(/server password ([^\s]+)/)?.[1];
  assert.ok(password, 'host ready');
  const client = OpenCode.make({
    baseUrl: 'http://127.0.0.1:4110',
    headers: { Authorization: `Basic ${Buffer.from('opencode:' + password).toString('base64')}` },
  });
  const location = { directory: fixture };
  await client.location.get({ location });
  const rpc = client.rpc(Security),
    test = client.rpc(TestRpc);
  for (let i = 0; i < 50; i++) {
    const plugins = await client.plugin.list({ location });
    if (plugins.data.some((p) => p.id === 'gill.security')) break;
    await sleep(100);
  }
  await assert.rejects(rpc.prepare({ repository: env.HOME }, { location }));
  assert.equal((await test.inspect({}, { location })).calls.length, 0);
  const response = await test.prepareByTool(
    {
      mode: 'deep',
      scopePaths: ['src'],
      scanPrompt: 'Check synthetic request boundaries.',
      contextFiles: ['docs/ARCHITECTURE.md'],
    },
    { location },
  );
  assert.match(response.result.content, /Prepared, not executed/);
  let state = await rpc.status({}, { location });
  assert.equal(state.repository, fixture);
  assert.equal(state.status, 'idle');
  assert.equal(state.plan.mock, true);
  assert.equal(state.plan.settings.scan.mode, 'deep');
  assert.equal((await test.inspect({}, { location })).calls.length, 0);
  await assert.rejects(rpc.start({ approveOpenAIInference: true }, { location }));
  await assert.rejects(rpc.start({ planId: state.plan.id }, { location }));
  const old = state.plan.id;
  state = await rpc.prepare(
    {
      mode: 'deep',
      repository: fixture,
      scopePaths: ['src/accounts.js'],
      scanPrompt: 'Focused synthetic scan.',
      contextFiles: ['docs/ARCHITECTURE.md'],
    },
    { location },
  );
  assert.equal((await rpc.status({ planId: old }, { location })).plan.id, old); // Independent previews remain usable.
  await rpc.start({ planId: state.plan.id, approveOpenAIInference: true }, { location });
  for (let i = 0; i < 100; i++) {
    state = await rpc.status({}, { location });
    if (state.status !== 'running') break;
    await sleep(50);
  }
  assert.equal(state.status, 'completed');
  assert.equal(state.findings.length, 1);
  const inspected = await test.inspect({}, { location });
  assert.deepEqual(inspected.constructorConfig.codexOverrides, {
    model_provider: 'openai',
    model: 'gpt-6.1-sol',
    model_reasoning_effort: 'high',
    daybreak: true,
  });
  const calls = inspected.calls;
  assert.equal(calls[0].mode, 'deep');
  assert.equal(calls[0].maxCostUsd, 2);
  assert.equal(calls[0].cyberAccessProgram, 'daybreak_blue');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].repository, fixture);
  assert.deepEqual(calls[0].target, ['src/accounts.js']);
  assert.equal(calls[0].scanPrompt, 'Focused synthetic scan.');
  assert.deepEqual(calls[0].knowledgeBasePaths, [`${fixture}/docs/ARCHITECTURE.md`]);
  await assert.rejects(
    rpc.start({ planId: state.plan.id, approveOpenAIInference: true }, { location }),
  );
  const first = await rpc.prepare({ scanPrompt: 'Concurrent A' }, { location });
  const second = await rpc.prepare({ scanPrompt: 'Concurrent B', mode: 'deep' }, { location });
  const [a, b] = await Promise.all([
    rpc.start({ planId: first.plan.id, approveOpenAIInference: true }, { location }),
    rpc.start({ planId: second.plan.id, approveOpenAIInference: true }, { location }),
  ]);
  assert.notEqual(a.runId, b.runId);
  const live = await rpc.list({}, { location });
  assert.equal(live.runs.filter((s) => s.status === 'running').length, 2);
  const modelList = await test.toolCall({ name: 'security_list_scans', args: {} }, { location });
  assert.equal(
    JSON.parse(modelList.result.content).runs.filter((s) => s.status === 'running').length,
    2,
  );
  const modelStatus = JSON.parse(
    (await test.toolCall({ name: 'security_scan_status', args: { runId: b.runId } }, { location }))
      .result.content,
  );
  assert.equal(modelStatus.mode, 'deep');
  assert.equal(modelStatus.estimatedCostUsd, 0.12);
  assert.equal(modelStatus.telemetry.measurement.coverage, 'partial');
  assert.equal(modelStatus.telemetry.measurement.cost.range.max, null);
  assert.deepEqual(modelStatus.telemetry.observedWorkers, [1]);
  assert.equal(modelStatus.telemetry.lastReconnect.reason, 'network');
  const activityRead = await test.toolCall(
    { name: 'security_scan_activity', args: { runId: b.runId } },
    { location },
  );
  const activity = JSON.parse(activityRead.result.content);
  assert.equal(activity.activity.length, 1);
  assert.equal(activity.activity[0].label, 'Reading source');
  assert.deepEqual(activity.activity[0].paths, ['src/accounts.js']);
  assert.doesNotMatch(activityRead.result.content, /SECRET|password/);
  await test.toolCall({ name: 'security_scan_activity', args: { runId: a.runId } }, { location });
  assert.equal(
    JSON.parse(
      (
        await test.toolCall(
          { name: 'security_scan_results', args: { runId: a.runId } },
          { location },
        )
      ).result.content,
    ).complete,
    false,
  );
  await assert.rejects(rpc.cancel({}, { location }));
  await rpc.cancel({ runId: a.runId }, { location });
  for (let i = 0; i < 60; i++) {
    if (
      (await rpc.status({ runId: a.runId }, { location })).status !== 'running' &&
      (await rpc.status({ runId: b.runId }, { location })).status !== 'running'
    )
      break;
    await sleep(50);
  }
  assert.equal((await rpc.status({ runId: a.runId }, { location })).status, 'cancelled');
  assert.equal((await rpc.status({ runId: b.runId }, { location })).status, 'completed');
  assert.equal(
    JSON.parse(
      (
        await test.toolCall(
          { name: 'security_scan_results', args: { runId: b.runId } },
          { location },
        )
      ).result.content,
    ).complete,
    true,
  );
  const finalResults = JSON.parse(
    (await test.toolCall({ name: 'security_scan_results', args: { runId: b.runId } }, { location }))
      .result.content,
  );
  assert.equal(finalResults.assessment.returnedFindings.reportable, 1);
  assert.equal(finalResults.assessment.coverage.surfaces.total, 1);
  assert.equal(finalResults.assessment.repositoryFindings.withMatchedFindingIds, 1);
  assert.equal(finalResults.sdkLifecycle.hasReportableFindings, true);
  const finalStatus = await rpc.status({ runId: b.runId }, { location });
  assert.equal(finalStatus.telemetry.measurement.coverage, 'complete');
  assert.equal(finalStatus.telemetry.activity.length, 1);
  assert.equal(finalStatus.telemetry.activity[0].status, 'completed');
  assert.ok((await test.inspect({}, { location })).toolNames.includes('security_cancel_scan'));
  const caps = await rpc.capabilities({}, { location });
  assert.equal(caps.policy, true);
  assert.equal(caps.validation, true);
  assert.equal(caps.patch, false);
  const policyPreview = JSON.parse(
    (await test.toolCall({ name: 'security_prepare_policy', args: {} }, { location })).result
      .content,
  );
  assert.equal((await test.inspect({}, { location })).operationCalls.length, 0);
  await assert.rejects(
    rpc.operationStart({ operationId: policyPreview.operationId }, { location }),
  );
  await rpc.operationStart(
    { operationId: policyPreview.operationId, approveOpenAIInference: true },
    { location },
  );
  let policy;
  for (let i = 0; i < 40; i++) {
    policy = await rpc.operationStatus({ operationId: policyPreview.operationId }, { location });
    if (policy.question) break;
    await sleep(25);
  }
  assert.equal(policy.status, 'awaiting_answers');
  assert.ok(policy.question.id);
  assert.equal(
    JSON.parse(
      (
        await test.toolCall(
          { name: 'security_operation_status', args: { operationId: policy.operationId } },
          { location },
        )
      ).result.content,
    ).question.id,
    policy.question.id,
  );
  await rpc.operationAnswer(
    {
      operationId: policy.operationId,
      questionId: policy.question.id,
      answer: 'Only project maintainers.',
    },
    { location },
  );
  for (let i = 0; i < 40; i++) {
    policy = await rpc.operationStatus({ operationId: policy.operationId }, { location });
    if (policy.status === 'completed') break;
    await sleep(25);
  }
  assert.equal(policy.result.applied, false);
  assert.match(policy.result.content, /Only project maintainers/);
  const completeB = await rpc.status({ runId: b.runId }, { location });
  const detail = JSON.parse(
    (
      await test.toolCall(
        {
          name: 'security_finding_detail',
          args: { runId: b.runId, findingId: completeB.findings[0].id },
        },
        { location },
      )
    ).result.content,
  );
  assert.equal('evidence' in detail.finding, false);
  const validation = JSON.parse(
    (
      await test.toolCall(
        {
          name: 'security_prepare_validation',
          args: { runId: b.runId, findingId: completeB.findings[0].id },
        },
        { location },
      )
    ).result.content,
  );
  await assert.rejects(
    rpc.operationStart(
      { operationId: validation.operationId, approveOpenAIInference: true },
      { location },
    ),
  );
  await rpc.operationStart(
    {
      operationId: validation.operationId,
      approveOpenAIInference: true,
      approveUncappedValidation: true,
    },
    { location },
  );
  let validated;
  for (let i = 0; i < 40; i++) {
    validated = await rpc.operationStatus({ operationId: validation.operationId }, { location });
    if (validated.status === 'completed') break;
    await sleep(25);
  }
  assert.equal(validated.result.disposition, 'reportable');
  assert.equal((await rpc.operationList({}, { location })).operations.length, 2);
  assert.equal(
    JSON.parse(
      (await test.toolCall({ name: 'security_list_operations', args: {} }, { location })).result
        .content,
    ).operations.length,
    2,
  );
  console.log(
    'Actual host: policy owner-question callback resumes with answer; unapplied draft and separately authorized uncapped validation passed (mock SDK).',
  );
  console.log(
    'Actual host: two independent mock runs, stable IDs, per-run cancellation, list/status/activity/results tools and optional telemetry passed.',
  );
  const reset = await rpc.prepare({}, { location });
  assert.equal(reset.plan.settings.scan.mode, 'standard');
  assert.equal(reset.plan.inputs.mode, undefined);
  console.log(
    'Actual OpenCode 2.2.6: registered model tool prepared current-project target/context, no model execution.',
  );
  console.log(
    'Missing approval, missing/stale plan IDs and reuse rejected. Explicit Deep mode and exact inputs reached injected mock SDK once; omitted mode restored global Standard.',
  );
  const secondLocation = { directory: secondFixture };
  await client.location.get({ location: secondLocation });
  for (let i = 0; i < 50; i++) {
    const plugins = await client.plugin.list({ location: secondLocation });
    if (plugins.data.some((p) => p.id === 'gill.security')) break;
    await sleep(100);
  }
  assert.equal((await rpc.list({}, { location: secondLocation })).runs.length, 0);
  assert.equal((await rpc.operationList({}, { location: secondLocation })).operations.length, 0);
  await assert.rejects(rpc.status({ runId: b.runId }, { location: secondLocation }));
  await assert.rejects(
    rpc.operationStatus({ operationId: validation.operationId }, { location: secondLocation }),
  );
  const secondDefault = await rpc.prepare({}, { location: secondLocation });
  assert.equal(secondDefault.repository, secondFixture);
  const explicitTarget = await rpc.prepare({ repository: fixture }, { location: secondLocation });
  assert.equal(explicitTarget.repository, fixture);
  assert.equal((await rpc.prepare({}, { location: secondLocation })).repository, secondFixture);
  assert.equal((await test.inspect({}, { location: secondLocation })).calls.length, 0);
  assert.equal((await rpc.status({ runId: b.runId }, { location })).status, 'completed');
  console.log(
    'Actual host: separate local sessions isolate run/operation history; target overrides do not change the next session default. No inference started in the second session.',
  );
  console.log('HOST SCAN-PLAN INTEGRATION PASSED (mock SDK only; no paid inference or login).');
} finally {
  child.kill('SIGTERM');
  const timeout = setTimeout(() => child.kill('SIGKILL'), 3000);
  await new Promise((resolve) => child.once('exit', resolve));
  clearTimeout(timeout);
  await Promise.all(
    [fixture, secondFixture].map((path) => rm(path, { recursive: true, force: true })),
  );
}
