import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpenCode } from '@opencode/client';
import { Rpc } from '@opencode/plugin/rpc';
import { Security } from '../src/rpc.ts';
const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
// Synthetic projects outside this checkout, so nothing resolves to the plugin's own repository.
async function sampleProject(name) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), `opencode-security-${name}-`)));
  await mkdir(join(directory, 'src'));
  await mkdir(join(directory, 'docs'));
  await writeFile(join(directory, 'src', 'accounts.js'), 'export const accounts = [];\n');
  await writeFile(join(directory, 'docs', 'ARCHITECTURE.md'), '# Synthetic architecture\n');
  return directory;
}
const fixture = await sampleProject('first');
const secondFixture = await sampleProject('second');
const configPath = `${root}/.runtime/plan/config/opencode/opencode.json`;
await mkdir(`${root}/.runtime/plan/config/opencode`, { recursive: true });
await mkdir(`${root}/.runtime/plan/home`, { recursive: true });
await writeFile(
  configPath,
  JSON.stringify({
    plugins: [{ package: `${root}/tests/mock-host-plugin` }],
    // A session woken by a scan notice must never reach a model.
    policies: [{ action: 'provider.use', resource: '*', effect: 'deny' }],
  }),
);
await writeFile(
  `${root}/.runtime/plan/config/opencode/codex-security.json`,
  JSON.stringify({
    codex: { model_reasoning_effort: 'high', daybreak: true },
    scan: { mode: 'standard', maxCostUsd: 2, cyberAccessProgram: 'daybreak_blue' },
  }),
);
const TestRpc = Rpc.define({
  id: 'gill.security.mock-test',
  events: {},
  methods: {
    inspect: { input: { type: 'object' }, output: { type: 'object' } },
    toolCall: {
      input: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          args: { type: 'object' },
          context: { type: 'object' },
        },
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
  let state = await rpc.prepare(
    {
      mode: 'deep',
      scopePaths: ['src'],
      scanPrompt: 'Check synthetic request boundaries.',
      contextFiles: ['docs/ARCHITECTURE.md'],
    },
    { location },
  );
  assert.equal((await rpc.status({}, { location })).plan.id, state.plan.id);
  assert.equal(state.repository, fixture);
  assert.equal(state.status, 'idle');
  assert.equal(state.plan.mock, true);
  assert.equal(state.plan.settings.scan.mode, 'deep');
  assert.equal((await test.inspect({}, { location })).calls.length, 0);
  await assert.rejects(rpc.start({}, { location }));
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
  await rpc.start({ planId: state.plan.id }, { location });
  for (let i = 0; i < 100; i++) {
    state = await rpc.status({}, { location });
    if (state.status !== 'running') break;
    await sleep(50);
  }
  assert.equal(state.status, 'completed');
  assert.equal(state.findings.length, 1);
  const inspected = await test.inspect({}, { location });
  assert.deepEqual(inspected.constructorConfig.codexOverrides, {
    model_reasoning_effort: 'high',
    daybreak: true,
  });
  assert.equal('sdk' in state.plan, false);
  const calls = inspected.calls;
  assert.equal(calls[0].mode, 'deep');
  assert.equal(calls[0].maxCostUsd, 2);
  assert.equal(calls[0].cyberAccessProgram, 'daybreak_blue');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].repository, fixture);
  assert.deepEqual(calls[0].target, ['src/accounts.js']);
  assert.equal(calls[0].scanPrompt, 'Focused synthetic scan.');
  assert.deepEqual(calls[0].knowledgeBasePaths, [`${fixture}/docs/ARCHITECTURE.md`]);
  await assert.rejects(rpc.start({ planId: state.plan.id }, { location }));
  const first = await rpc.prepare({ scanPrompt: 'Concurrent A' }, { location });
  const second = await rpc.prepare({ scanPrompt: 'Concurrent B', mode: 'deep' }, { location });
  const [a, b] = await Promise.all([
    rpc.start({ planId: first.plan.id }, { location }),
    rpc.start({ planId: second.plan.id }, { location }),
  ]);
  assert.notEqual(a.runId, b.runId);
  const live = await rpc.list({}, { location });
  assert.equal(live.runs.filter((s) => s.status === 'running').length, 2);
  const modelList = await test.toolCall({ name: 'security_scans', args: {} }, { location });
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
    { name: 'security_scan_status', args: { runId: b.runId, activity: true } },
    { location },
  );
  const activity = JSON.parse(activityRead.result.content);
  assert.equal(activity.activity.length, 1);
  assert.equal(activity.activity[0].label, 'Reading source');
  assert.deepEqual(activity.activity[0].paths, ['src/accounts.js']);
  assert.doesNotMatch(activityRead.result.content, /SECRET|password/);
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
  const finalStatus = await rpc.status({ runId: b.runId }, { location });
  assert.equal(finalStatus.telemetry.measurement.coverage, 'complete');
  assert.equal(finalStatus.telemetry.activity.length, 1);
  assert.equal(finalStatus.telemetry.activity[0].status, 'completed');
  assert.ok((await test.inspect({}, { location })).toolNames.includes('security_cancel_scan'));
  const caps = await rpc.capabilities({}, { location });
  assert.equal(caps.policy, true);
  assert.equal(caps.validation, true);
  assert.equal(caps.fix, true);
  // The sample project is not a git repository, so a fix is refused before anything runs.
  await assert.rejects(
    rpc.operationPrepare({ kind: 'fix', finding: 'Synthetic finding.' }, { location }),
    (error) => error.type === 'security.setup' && /git repository/.test(error.message),
  );
  const changes = await rpc.prepare({ changes: 'uncommitted' }, { location }).catch((e) => e);
  assert.ok(changes.type === 'security.setup', 'a diff scan of a non-git folder is refused');
  const policyPreview = await rpc.operationPrepare({ kind: 'policy' }, { location });
  assert.equal(policyPreview.plan.targetPath, join(fixture, 'SECURITY.md'));
  assert.equal((await test.inspect({}, { location })).operationCalls.length, 0);
  await rpc.operationStart({ operationId: policyPreview.operationId }, { location });
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
          { name: 'security_operations', args: { operationId: policy.operationId } },
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
          name: 'security_scan_results',
          args: { runId: b.runId, findingId: completeB.findings[0].id },
        },
        { location },
      )
    ).result.content,
  );
  assert.equal(detail.finding.evidence, '// synthetic test evidence');
  const validation = await rpc.operationPrepare(
    { kind: 'validation', repository: completeB.repository, finding: completeB.findings[0] },
    { location },
  );
  await rpc.operationStart({ operationId: validation.operationId }, { location });
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
      (await test.toolCall({ name: 'security_operations', args: {} }, { location })).result.content,
    ).operations.length,
    2,
  );
  console.log(
    'Actual host: policy owner-question callback resumes with answer; unapplied draft and validation passed (mock SDK).',
  );
  console.log(
    'Actual host: two independent mock runs, stable IDs, per-run cancellation, list/status/activity/results tools and optional telemetry passed.',
  );
  const reset = await rpc.prepare({}, { location });
  assert.equal(reset.plan.settings.scan.mode, 'standard');
  assert.equal(reset.plan.inputs.mode, undefined);
  console.log(
    'Actual host: previews start nothing, reuse is rejected, and exact inputs reached the mock SDK once.',
  );
  const skill = (await client.skill.list({ location })).data.find((s) => s.id === 'codex-security');
  assert.equal(skill?.path, 'skill://codex-security/SKILL.md');
  const settingsFile = `${root}/.runtime/plan/config/opencode/codex-security.json`;
  const setup = await rpc.setup({}, { location });
  assert.equal(setup.configFile, settingsFile);
  assert.equal(setup.route.reasoningEffort, 'high');
  assert.equal(setup.route.daybreak, true);
  assert.equal(setup.codexConfigFile, `${root}/.runtime/plan/home/.codex/config.toml`);
  assert.equal(typeof setup.runtime.node, 'string');
  const before = JSON.parse(await readFile(settingsFile, 'utf8'));
  assert.equal((await rpc.setProfile({ profile: 'work' }, { location })).profile, 'work');
  assert.deepEqual(JSON.parse(await readFile(settingsFile, 'utf8')), {
    ...before,
    codex: { ...before.codex, profile: 'work' },
  });
  assert.equal((await rpc.setup({}, { location })).profile, 'work');
  await rpc.setProfile({ profile: '' }, { location });
  assert.deepEqual(JSON.parse(await readFile(settingsFile, 'utf8')), before);
  console.log('Actual host: the bundled skill is listed; setup and setProfile RPC passed.');
  const session = await client.session.create({
    location,
    permissions: ['codex_security_scan', 'codex_security_policy'].map((action) => ({
      action,
      resource: '*',
      effect: 'allow',
    })),
  });
  const toolContext = { sessionID: session.id, agent: 'build', messageID: 'msg_t', id: 'call_t' };
  const started = await test.toolCall(
    { name: 'security_scan', args: { scopePaths: ['src'] }, context: toolContext },
    { location },
  );
  const noticeRun = /Run ID: (\S+)/.exec(started.result.content)[1];
  let messages = [];
  for (let i = 0; i < 100; i++) {
    messages = await client.session.context({ sessionID: session.id });
    if (messages.some((m) => m.type === 'idle')) break;
    await sleep(100);
  }
  const notice = messages.find((m) => m.type === 'synthetic');
  assert.deepEqual(notice?.metadata, {
    source: 'codex-security',
    runId: noticeRun,
    status: 'completed',
  });
  assert.match(notice.text, /completed with 1 finding \(1 medium\)\. Call security_scan_results/);
  // The notice resumed the session, which stopped for want of a model: no inference ran.
  const idle = messages.find((m) => m.type === 'idle');
  assert.equal(idle.error?.type, 'provider.no-route');
  const asked = JSON.parse(
    (await test.toolCall({ name: 'security_policy', args: {}, context: toolContext }, { location }))
      .result.content,
  );
  let question;
  for (let i = 0; i < 100 && !question; i++) {
    messages = await client.session.context({ sessionID: session.id });
    question = messages.find((m) => m.metadata?.operationId === asked.operationId);
    if (!question) await sleep(100);
  }
  assert.equal(question?.metadata.status, 'awaiting_answers');
  assert.match(question.text, /waiting for owner answers/);
  await rpc.operationCancel({ operationId: asked.operationId }, { location });
  console.log(
    'Actual host: finished scans and pending owner questions post a notice into the session that started them, which resumes (no model allowed).',
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
