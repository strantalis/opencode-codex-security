import './helpers/isolated-codex.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { host, project, tick } from './helpers/project.mjs';
import { createSecurityPlugin } from '../src/plugin.ts';

const sdkFinding = {
  findingId: 'f1',
  occurrenceId: 'o1',
  title: 'Missing authorization check',
  severity: { level: 'high' },
  locations: [{ path: 'src/app.js', startLine: 1 }],
  taxonomy: { cwe: ['CWE-862'] },
  summary: 'Any user can read any account.',
  codeEvidence: [{ code: 'export const ok = true;' }],
  remediation: 'Check ownership.',
  confidence: { level: 'high' },
};
async function setup(t, clients = {}) {
  const root = await project(t);
  const calls = { scans: [], policy: 0, validation: [] };
  let allowed = true;
  const fake = host(root, { allow: () => allowed });
  const plugin = createSecurityPlugin({
    createClient: () => ({
      run:
        clients.run ??
        (async (repository, options) => {
          calls.scans.push({ repository, options });
          return { findings: { scanId: 'sdk-1', findings: [sdkFinding] } };
        }),
      close: async () => {},
    }),
    createOperationsClient: () => ({
      generatePolicy: async (repository, options) => {
        calls.policy++;
        const answer = await options.answerQuestions(['Who approves releases?'], options.signal);
        return {
          repository,
          targetPath: join(repository, 'SECURITY.md'),
          content: `# Policy\n${answer}`,
          reviewNotes: [],
        };
      },
      validate: async (options) => {
        calls.validation.push(options);
        return { disposition: 'reportable', report: 'Confirmed.' };
      },
      patch: async (options) => {
        const { writeFile } = await import('node:fs/promises');
        await writeFile(join(options.repositoryPath, 'src', 'app.js'), 'export const ok = 1;\n');
        return { status: 'verified', verificationReport: 'Guard added.', changedFiles: [] };
      },
      close: async () => {},
    }),
  });
  t.after(await plugin.setup(fake.ctx));
  return { ...fake, root, calls, deny: (value = true) => (allowed = !value) };
}
const settled = async (read) => {
  // Fixes shell out to git, so allow real time as well as event-loop turns.
  for (let i = 0; i < 500; i++) {
    const state = await read();
    if (!['running', 'prepared'].includes(state.status)) return state;
    await new Promise((resolve) => setTimeout(resolve, i < 200 ? 0 : 10));
  }
  assert.fail('did not settle');
};

test('thirteen tools are registered, with short descriptions', async (t) => {
  const { tools } = await setup(t);
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [
    'security_answer_questions',
    'security_apply_fix',
    'security_cancel_operation',
    'security_cancel_scan',
    'security_fix',
    'security_operations',
    'security_policy',
    'security_scan',
    'security_scan_results',
    'security_scan_status',
    'security_scans',
    'security_status',
    'security_validate',
  ]);
  for (const tool of tools) assert.ok(tool.description.length < 340, tool.name);
});

test('the bundled skill registers once and is removed on cleanup', async (t) => {
  const root = await project(t);
  const fake = host(root);
  const cleanup = await createSecurityPlugin({ createClient: () => ({}) }).setup(fake.ctx);
  assert.equal(fake.skills.length, 1);
  const [skill] = fake.skills;
  assert.equal(skill.id, 'codex-security');
  assert.equal(skill.path, 'skill://codex-security/SKILL.md');
  assert.ok(skill.description);
  assert.ok(skill.content.split(/\s+/).length < 400);
  assert.match(skill.content, /opencode\/codex-security\/workspaces/);
  await cleanup();
  assert.equal(fake.skills.length, 0);
});

test('a scan started by the tool tells its session when it ends', async (t) => {
  const { call, synthetic } = await setup(t, {
    run: async () => ({
      findings: {
        scanId: 'sdk-1',
        findings: [
          sdkFinding,
          { ...sdkFinding, occurrenceId: 'o2', severity: { level: 'high' } },
          { ...sdkFinding, occurrenceId: 'o3', severity: { level: 'low' } },
        ],
      },
    }),
  });
  const runId = /Run ID: (\S+)/.exec(await call('security_scan'))[1];
  await settled(() => call('security_scan_status', { runId }));
  await tick();
  assert.equal(synthetic.length, 1);
  const [notice] = synthetic;
  assert.equal(notice.sessionID, 'session');
  assert.equal(notice.delivery, 'queue');
  assert.deepEqual(notice.metadata, { source: 'codex-security', runId, status: 'completed' });
  assert.match(
    notice.text,
    new RegExp(`scan ${runId} completed with 3 findings \\(2 high, 1 low\\)`),
  );
  assert.match(notice.text, /security_scan_results/);
});

test('a failed scan is reported too, and nothing is sent for shutdown', async (t) => {
  let fail;
  const { call, synthetic } = await setup(t, {
    run: (_repository, options) =>
      new Promise((_resolve, reject) => {
        fail = reject;
        options.signal.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  });
  const failed = /Run ID: (\S+)/.exec(await call('security_scan'))[1];
  await tick();
  fail(new Error('boom'));
  await settled(() => call('security_scan_status', { runId: failed }));
  await tick();
  assert.equal(synthetic.length, 1);
  assert.match(synthetic[0].text, new RegExp(`scan ${failed} ended: error`));
  // Left running: disposal cancels it, and the session is not woken for that.
  await call('security_scan');
  await tick();
  t.after(() => assert.equal(synthetic.length, 1));
});

test('policy and validation notices: owner questions, then completion', async (t) => {
  const { call, synthetic } = await setup(t);
  const policy = await call('security_policy');
  await tick();
  assert.equal(synthetic.length, 1);
  assert.match(synthetic[0].text, /policy draft .* is waiting for owner answers/);
  assert.doesNotMatch(synthetic[0].text, /Who approves releases/);
  const waiting = await call('security_operations', { operationId: policy.operationId });
  await call('security_answer_questions', {
    operationId: policy.operationId,
    questionId: waiting.question.id,
    answer: 'Maintainers.',
  });
  await settled(() => call('security_operations', { operationId: policy.operationId }));
  await tick();
  assert.equal(synthetic.length, 2);
  assert.match(synthetic[1].text, /policy draft .* completed/);
  assert.equal(synthetic[1].metadata.operationId, policy.operationId);

  const runId = /Run ID: (\S+)/.exec(await call('security_scan'))[1];
  await settled(() => call('security_scan_status', { runId }));
  const validation = await call('security_validate', { runId, findingId: 'o1' });
  await settled(() => call('security_operations', { operationId: validation.operationId }));
  await tick();
  assert.match(synthetic.at(-1).text, /validation .* completed\. .*disposition/);
  assert.equal(synthetic.length, 4);
});

test('security_status and the setup RPC report the resolved setup', async (t) => {
  const { call, ctx } = await setup(t);
  const status = await call('security_status');
  assert.equal(status.route.provider, 'openai');
  assert.ok(status.route.model);
  assert.match(status.configFile, /codex-security\.json$/);
  assert.match(status.codexConfigFile, /config\.toml$/);
  assert.deepEqual(status.profiles, []);
  assert.match(status.runtime.node, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(await ctx.handlers.setup({}, {}), status);
  const saved = await ctx.handlers.setProfile({ profile: 'work' }, {});
  assert.equal(saved.profile, 'work');
  t.after(() => ctx.handlers.setProfile({ profile: '' }, {}));
  assert.equal((await ctx.handlers.setup({}, {})).profile, 'work');
});

test('security_scan asks permission with the preview, then runs and reports', async (t) => {
  const { call, calls, permissions, deny, root } = await setup(t);
  deny();
  await assert.rejects(call('security_scan', { scopePaths: ['src'] }), /Denied/);
  assert.equal(calls.scans.length, 0);
  assert.equal(permissions[0].action, 'codex_security_scan');
  assert.match(permissions[0].metadata.preview, /Scope: src/);
  assert.match(permissions[0].metadata.preview, /Sent to: openai/);
  assert.equal(permissions[0].resources[0], root);
  deny(false);
  const started = await call('security_scan', { scopePaths: ['src'], scanPrompt: 'Authz.' });
  const runId = /Run ID: (\S+)/.exec(started)[1];
  const status = await settled(() => call('security_scan_status', { runId }));
  assert.equal(status.status, 'completed');
  assert.equal(status.findingCount, 1);
  assert.deepEqual(calls.scans[0].options.target, ['src']);
  assert.equal((await call('security_scans')).runs[0].runId, runId);
  const results = await call('security_scan_results', { runId });
  assert.equal(results.complete, true);
  assert.equal('evidence' in results.findings[0], false);
  const detail = await call('security_scan_results', { runId, findingId: 'o1' });
  assert.equal(detail.finding.evidence, 'export const ok = true;');
  await assert.rejects(call('security_scan_results', { runId, findingId: 'nope' }), /No finding/);
  await assert.rejects(call('security_scan_status', { runId: 'nope' }), /Unknown scan run/);
  await assert.rejects(call('security_scan', { scopePaths: ['missing'] }), /does not exist/);
});

test('status hides raw activity text, and cancel stops only the named run', async (t) => {
  let options;
  const { call } = await setup(t, {
    run: (_repository, received) =>
      new Promise((_resolve, reject) => {
        options = received;
        received.signal.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  });
  const runId = /Run ID: (\S+)/.exec(await call('security_scan'))[1];
  await tick();
  options.onActivity({ id: 'a', kind: 'reasoning', status: 'running', description: 'SECRET' });
  const status = await call('security_scan_status', { runId, activity: true });
  assert.equal(status.activity[0].label, 'Analysis update');
  assert.doesNotMatch(JSON.stringify(status), /SECRET/);
  assert.equal((await call('security_scan_results', { runId })).complete, false);
  await call('security_cancel_scan', { runId });
  assert.equal(options.signal.aborted, true);
  assert.equal((await settled(() => call('security_scan_status', { runId }))).status, 'cancelled');
});

test('policy and validation each ask permission; answers need it too', async (t) => {
  const { call, calls, permissions, deny } = await setup(t);
  deny();
  await assert.rejects(call('security_policy'), /Denied/);
  assert.equal(calls.policy, 0);
  assert.equal(permissions.at(-1).action, 'codex_security_policy');
  deny(false);
  const policy = await call('security_policy');
  await tick();
  const waiting = await call('security_operations', { operationId: policy.operationId });
  assert.equal(waiting.status, 'awaiting_answers');
  const answer = {
    operationId: policy.operationId,
    questionId: waiting.question.id,
    answer: 'Maintainers.',
  };
  deny();
  await assert.rejects(call('security_answer_questions', answer), /Denied/);
  assert.equal(permissions.at(-1).action, 'codex_security_answer');
  assert.deepEqual(permissions.at(-1).metadata.questions, ['Who approves releases?']);
  deny(false);
  await call('security_answer_questions', answer);
  const done = await settled(() =>
    call('security_operations', { operationId: policy.operationId }),
  );
  assert.equal(done.result.content, '# Policy\nMaintainers.');
  assert.equal(done.result.applied, false);

  const runId = /Run ID: (\S+)/.exec(await call('security_scan'))[1];
  await settled(() => call('security_scan_status', { runId }));
  const validation = await call('security_validate', { runId, findingId: 'o1' });
  assert.equal(permissions.at(-1).action, 'codex_security_validation');
  assert.match(permissions.at(-1).metadata.cost, /no cost limit/);
  const validated = await settled(() =>
    call('security_operations', { operationId: validation.operationId }),
  );
  assert.equal(validated.result.disposition, 'reportable');
  // The validator gets the code evidence that list results leave out.
  assert.match(calls.validation[0].finding, /export const ok = true;/);
  // The denied policy preview stays listed until it expires.
  assert.equal((await call('security_operations')).operations.length, 3);
  await assert.rejects(
    call('security_validate', { runId, findingId: 'nope' }),
    /scan that has results/,
  );
});

test('RPC returns input problems as declared setup errors', async (t) => {
  const { ctx } = await setup(t);
  const errors = [];
  const context = { error: (type, message) => errors.push({ type, message }) };
  await ctx.handlers.prepare({ scopePaths: ['missing'] }, context);
  await ctx.handlers.start({ planId: 'unknown' }, context);
  await ctx.handlers.status({ runId: 'unknown' }, context);
  assert.deepEqual(
    errors.map((error) => error.type),
    ['security.setup', 'security.setup', 'security.setup'],
  );
  assert.match(errors[0].message, /does not exist: missing/);
  assert.match(errors[1].message, /Prepare a scan preview/);
  const prepared = await ctx.handlers.prepare({}, context);
  assert.equal(prepared.plan.mock, true);
  assert.equal(errors.length, 3);
});

test('aborted tools never start scans or operations, including after permission', async (t) => {
  const { tools, ctx, calls } = await setup(t);
  for (const name of ['security_scan', 'security_policy']) {
    for (const abortAfterPermission of [false, true]) {
      const controller = new AbortController();
      if (!abortAfterPermission) controller.abort();
      ctx.permission.assert = async () => controller.abort();
      const tool = tools.find((tool) => tool.name === name);
      await assert.rejects(
        tool.execute(
          {},
          {
            signal: controller.signal,
            sessionID: 'session',
            agent: 'agent',
            messageID: 'm',
            id: 'call',
          },
        ),
        /aborted/,
      );
    }
  }
  assert.equal(calls.scans.length, 0);
  assert.equal(calls.policy, 0);
});

test('policy approval identifies the context files sent to inference', async (t) => {
  const { call, deny, permissions } = await setup(t);
  deny();
  await assert.rejects(call('security_policy', { contextFiles: ['ARCHITECTURE.md'] }), /Denied/);
  assert.deepEqual(permissions.at(-1).metadata.contextFiles, ['ARCHITECTURE.md']);
});

test('a fix is proposed in the background and applied only with permission', async (t) => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { readFile } = await import('node:fs/promises');
  const { call, permissions, deny, root, synthetic } = await setup(t);
  const git = (...args) =>
    promisify(execFile)('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', ...args], {
      cwd: root,
    });
  await git('init', '--quiet', '--initial-branch=main');
  await git('add', '-A');
  await git('commit', '--quiet', '-m', 'base');
  const runId = /Run ID: (\S+)/.exec(await call('security_scan'))[1];
  await settled(() => call('security_scan_status', { runId }));
  const fix = await call('security_fix', { runId, findingId: 'o1' });
  assert.equal(permissions.at(-1).action, 'codex_security_fix');
  const done = await settled(() => call('security_operations', { operationId: fix.operationId }));
  assert.equal(done.result.resolution, 'pending');
  assert.match(done.result.diff, /^\+export const ok = 1;$/m);
  await tick();
  assert.match(
    synthetic.at(-1).text,
    /fix .* completed\. .*security_apply_fix only if they accept/,
  );
  const app = join(root, 'src', 'app.js');
  deny();
  await assert.rejects(call('security_apply_fix', { operationId: fix.operationId }), /Denied/);
  assert.equal(permissions.at(-1).action, 'codex_security_apply_fix');
  assert.match(permissions.at(-1).metadata.diff, /export const ok = 1/);
  assert.equal(await readFile(app, 'utf8'), 'export const ok = true;\n');
  deny(false);
  const applied = await call('security_apply_fix', { operationId: fix.operationId });
  assert.equal(applied.result.resolution, 'applied');
  assert.equal(await readFile(app, 'utf8'), 'export const ok = 1;\n');

  // The outcome is kept with the finding, for the views and for later sessions.
  const validation = await call('security_validate', { runId, findingId: 'o1' });
  await settled(() => call('security_operations', { operationId: validation.operationId }));
  const { reviews } = await call('security_scan_results', { runId });
  assert.equal(reviews.o1.fix.resolution, 'applied');
  assert.equal(reviews.o1.validation.disposition, 'reportable');
});
