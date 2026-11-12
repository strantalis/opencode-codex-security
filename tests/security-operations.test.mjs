import './helpers/isolated-codex.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { configure, project, tick } from './helpers/project.mjs';
import { SecurityOperationsService } from '../src/core/security-operations.ts';

const draft = (repository, path = '.') => ({
  repository,
  targetPath: join(repository, path, 'SECURITY.md'),
  content: '# Security policy\nOwner review required.',
  reviewNotes: ['Confirm public exposure.'],
  cost: { estimatedUsd: 0.02 },
});
const client = (overrides = {}) => ({
  generatePolicy: async (repository, options) => draft(repository, options.path),
  validate: async () => ({ disposition: 'deferred', report: 'Insufficient source evidence.' }),
  close: async () => {},
  ...overrides,
});
function service(t, root, createClient = () => client()) {
  const instance = new SecurityOperationsService(root, { createClient, mock: true });
  t.after(() => instance.dispose());
  return instance;
}

test('a policy preview names its target and starts nothing', async (t) => {
  const root = await project(t);
  let created = 0;
  const operations = service(t, root, () => (created++, client()));
  const state = await operations.prepare({
    kind: 'policy',
    path: 'services/api',
    contextFiles: ['ARCHITECTURE.md'],
  });
  assert.equal(state.status, 'prepared');
  assert.equal(state.repository, root);
  assert.equal(state.plan.path, 'services/api');
  assert.equal(state.plan.targetPath, join(root, 'services', 'api', 'SECURITY.md'));
  assert.match(state.plan.costNotice, /No cost limit/);
  assert.equal(created, 0);
  const whole = await operations.prepare({ kind: 'policy' });
  assert.equal(whole.plan.path, undefined);
  assert.equal(whole.plan.targetPath, join(root, 'SECURITY.md'));
});

test('a policy run passes the previewed inputs and returns an unapplied draft', async (t) => {
  const root = await project(t);
  await configure(t, { plugin: { scan: { maxCostUsd: 3 } } });
  let received;
  const operations = service(t, root, (config) =>
    client({
      generatePolicy: async (repository, options) => {
        received = { config, repository, options };
        options.onStage('threat_model');
        options.onCost({ estimatedUsd: 0.5 });
        return draft(repository, options.path);
      },
    }),
  );
  const prepared = await operations.prepare({ kind: 'policy', path: 'services/api' });
  assert.match(prepared.plan.costNotice, /estimated USD 3/);
  await operations.start({ operationId: prepared.operationId });
  const done = await operations.wait(prepared.operationId);
  assert.equal(done.status, 'completed');
  assert.deepEqual(done.result, {
    kind: 'policy',
    content: '# Security policy\nOwner review required.',
    reviewNotes: ['Confirm public exposure.'],
    targetPath: join(root, 'services', 'api', 'SECURITY.md'),
    replacesExisting: false,
    applied: false,
    truncated: false,
  });
  assert.equal(done.estimatedCostUsd, 0.02);
  assert.equal(received.repository, root);
  assert.equal(received.options.path, 'services/api');
  assert.equal(received.options.maxCostUsd, 3);
  assert.equal(received.options.auth, 'auto');
  assert.deepEqual(received.config, { codexOverrides: {} });
  await assert.rejects(operations.start({ operationId: prepared.operationId }), /already used/);
});

test('a draft that replaces an existing SECURITY.md carries the SDK diff', async (t) => {
  const root = await project(t);
  const previous = '# Security policy\nReport issues by email.\n';
  await writeFile(join(root, 'SECURITY.md'), previous);
  const operations = service(t, root, () =>
    client({
      // A hand-built SecurityPolicyDraft: securityPolicyDiff reads only these fields and the disk.
      generatePolicy: async (repository) => ({
        ...draft(repository),
        scope: '.',
        content: '# Security policy\nReport issues through the private advisory form.\n',
        previousContent: previous,
        inheritedPolicySha256: createHash('sha256').update('[]').digest('hex'),
      }),
    }),
  );
  const { operationId } = await operations.prepare({ kind: 'policy' });
  await operations.start({ operationId });
  const done = await operations.wait(operationId);
  assert.equal(done.status, 'completed', done.error);
  assert.equal(done.result.replacesExisting, true);
  assert.match(done.result.diff, /^--- a\/SECURITY\.md/m);
  assert.match(done.result.diff, /^\+\+\+ b\/SECURITY\.md/m);
  assert.match(done.result.diff, /^-Report issues by email\.$/m);
  assert.match(done.result.diff, /^\+Report issues through the private advisory form\.$/m);

  // The SDK refuses a diff against a file that changed after the draft read it.
  // The draft is still returned, without the diff.
  await writeFile(join(root, 'SECURITY.md'), '# Edited meanwhile\n');
  const second = await operations.prepare({ kind: 'policy' });
  await operations.start({ operationId: second.operationId });
  const stale = await operations.wait(second.operationId);
  assert.equal(stale.status, 'completed', stale.error);
  assert.equal(stale.result.replacesExisting, true);
  assert.equal(stale.result.diff, undefined);
});

test('owner questions pause a policy until the exact batch is answered', async (t) => {
  const root = await project(t);
  let answer;
  const operations = service(t, root, () =>
    client({
      generatePolicy: async (repository, options) => {
        answer = await options.answerQuestions(['Who approves releases?'], options.signal);
        return draft(repository);
      },
    }),
  );
  const { operationId } = await operations.prepare({ kind: 'policy' });
  await operations.start({ operationId });
  await tick();
  const waiting = operations.getState(operationId);
  assert.equal(waiting.status, 'awaiting_answers');
  assert.deepEqual(waiting.question.questions, ['Who approves releases?']);
  assert.throws(
    () => operations.answer({ operationId, questionId: 'other', answer: 'x' }),
    /no longer pending/,
  );
  assert.throws(
    () => operations.answer({ operationId, questionId: waiting.question.id, answer: ' ' }),
    /nonempty/,
  );
  operations.answer({ operationId, questionId: waiting.question.id, answer: ' Maintainers. ' });
  const done = await operations.wait(operationId);
  assert.equal(answer, 'Maintainers.');
  assert.equal(done.status, 'completed');
  assert.equal(done.question, null);
});

test('validation sends the finding as given, including credential-shaped text', async (t) => {
  const root = await project(t);
  let received;
  const operations = service(t, root, () =>
    client({
      validate: async (options) => {
        received = options;
        return { disposition: 'reportable', report: 'Confirmed in src/app.js.' };
      },
    }),
  );
  // Findings about hardcoded secrets end in key=value text; these used to be rejected.
  const finding = { title: 'Hardcoded secret', summary: 'config sets client_secret=[REDACTED]' };
  const prepared = await operations.prepare({ kind: 'validation', finding });
  assert.match(prepared.plan.costNotice, /no cost limit/);
  await operations.start({ operationId: prepared.operationId });
  const done = await operations.wait(prepared.operationId);
  assert.deepEqual(done.result, {
    kind: 'validation',
    disposition: 'reportable',
    report: 'Confirmed in src/app.js.',
    truncated: false,
  });
  assert.equal(received.repositoryPath, root);
  assert.equal(received.finding, JSON.stringify(finding));
  await assert.rejects(operations.prepare({ kind: 'validation' }), /finding is needed/);
  await assert.rejects(
    operations.prepare({ kind: 'validation', finding: 'x', path: 'src' }),
    /Policy takes a path/,
  );
});

test('typed SDK errors are shown; unexpected ones stay generic', async (t) => {
  const root = await project(t);
  class CodexSecurityError extends Error {}
  const failures = [
    new CodexSecurityError('Security-policy generation exceeded its $1.00 limit.'),
    new Error('boom'),
  ];
  const operations = service(t, root, () =>
    client({
      generatePolicy: async () => {
        throw failures.shift();
      },
    }),
  );
  const run = async () => {
    const { operationId } = await operations.prepare({ kind: 'policy' });
    await operations.start({ operationId });
    return operations.wait(operationId);
  };
  assert.equal((await run()).error, 'Security-policy generation exceeded its $1.00 limit.');
  const generic = await run();
  assert.equal(generic.status, 'error');
  assert.match(generic.error, /Operation failed/);
  await assert.rejects(operations.prepare({ kind: 'policy', path: 'missing' }), /does not exist/);
});

test('cancellation aborts the SDK call, and two operations run at once at most', async (t) => {
  const root = await project(t);
  const signals = [];
  const operations = service(t, root, () =>
    client({
      validate: (options) =>
        new Promise((_resolve, reject) => {
          signals.push(options.signal);
          options.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    }),
  );
  const ids = [];
  for (const finding of ['one', 'two', 'three'])
    ids.push((await operations.prepare({ kind: 'validation', finding })).operationId);
  await operations.start({ operationId: ids[0] });
  await operations.start({ operationId: ids[1] });
  await assert.rejects(operations.start({ operationId: ids[2] }), /Two operations/);
  await tick();
  operations.cancel(ids[0]);
  const cancelled = await operations.wait(ids[0]);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.error, null);
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
  assert.equal(operations.cancel(ids[2]).status, 'cancelled');
  assert.equal(operations.list().length, 3);
});

test('validation ignores a scan budget for an unpriced model', async (t) => {
  const root = await project(t);
  await configure(t, {
    plugin: { codex: { model: 'custom-unpriced-model' }, scan: { maxCostUsd: 1 } },
  });
  let received;
  const operations = service(t, root, () =>
    client({
      validate: async (options) => {
        received = options;
        return { disposition: 'deferred', report: 'Review complete.' };
      },
    }),
  );
  const prepared = await operations.prepare({ kind: 'validation', finding: 'Missing authz.' });
  assert.match(prepared.plan.costNotice, /no cost limit/);
  await operations.start({ operationId: prepared.operationId });
  assert.equal((await operations.wait(prepared.operationId)).status, 'completed');
  assert.equal(received.maxCostUsd, undefined);
  await assert.rejects(operations.prepare({ kind: 'policy' }), /scan cost limit is not available/);
});

test('operation previews and events never expose execution-only provider headers', async (t) => {
  const root = await project(t);
  const secret = 'synthetic-private-header';
  await configure(t, {
    plugin: {
      codex: {
        model: 'custom-model',
        model_provider: 'gateway',
        model_providers: {
          gateway: {
            base_url: 'https://gateway.example.test/v1',
            wire_api: 'responses',
            http_headers: { Authorization: secret },
          },
        },
      },
    },
  });
  let received;
  const operations = service(t, root, (config) => {
    received = config;
    return client();
  });
  const events = [];
  operations.subscribe((state) => events.push(state));
  const prepared = await operations.prepare({ kind: 'validation', finding: 'Missing authz.' });
  assert.equal('sdk' in prepared.plan, false);
  assert.doesNotMatch(JSON.stringify(prepared), /synthetic-private-header/);
  await operations.start({ operationId: prepared.operationId });
  await operations.wait(prepared.operationId);
  assert.equal(received.codexOverrides.model_providers.gateway.http_headers.Authorization, secret);
  assert.doesNotMatch(JSON.stringify(events), /synthetic-private-header/);
  assert.doesNotMatch(JSON.stringify(operations.list()), /synthetic-private-header/);
});

test('a fix is written in a throwaway worktree, then applied or discarded', async (t) => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { readFile, writeFile, access } = await import('node:fs/promises');
  const root = await project(t);
  const git = (...args) =>
    promisify(execFile)('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', ...args], {
      cwd: root,
    });
  await assert.rejects(
    service(t, root).prepare({ kind: 'fix', finding: 'x' }),
    /needs a git repository/,
  );
  await git('init', '--quiet', '--initial-branch=main');
  await git('add', '-A');
  await git('commit', '--quiet', '-m', 'base');
  const app = join(root, 'src', 'app.js');
  const workspaces = [];
  let outcome = { status: 'verified', verificationReport: 'Checked the guard.', changedFiles: [] };
  const operations = service(t, root, () =>
    client({
      patch: async (options) => {
        workspaces.push(options.repositoryPath);
        assert.notEqual(options.repositoryPath, root);
        const { write = 'export const ok = 1;\n', ...result } = outcome;
        if (result.status === 'verified')
          await writeFile(join(options.repositoryPath, 'src', 'app.js'), write);
        return { ...result, threadId: null, cost: { estimatedUsd: 0.4 } };
      },
    }),
  );
  const propose = async () => {
    const prepared = await operations.prepare({ kind: 'fix', finding: { title: 'Weak check' } });
    assert.match(prepared.plan.costNotice, /no cost limit/);
    await operations.start({ operationId: prepared.operationId });
    return operations.wait(prepared.operationId);
  };

  // Discard: the checkout is untouched and the worktree is gone.
  const first = await propose();
  assert.equal(first.status, 'completed', first.error);
  assert.equal(first.result.status, 'verified');
  assert.equal(first.result.resolution, 'pending');
  assert.match(first.result.diff, /^-export const ok = true;$/m);
  assert.match(first.result.diff, /^\+export const ok = 1;$/m);
  assert.equal(first.estimatedCostUsd, 0.4);
  assert.equal(await readFile(app, 'utf8'), 'export const ok = true;\n');
  const discarded = await operations.resolve({ operationId: first.operationId, action: 'discard' });
  assert.equal(discarded.result.resolution, 'discarded');
  await assert.rejects(access(workspaces[0]));
  await assert.rejects(
    operations.resolve({ operationId: first.operationId, action: 'apply' }),
    /no fix waiting/,
  );

  // Apply fails cleanly when the working tree has moved on, and stays pending.
  const second = await propose();
  await writeFile(app, 'export const ok = "edited";\n');
  await assert.rejects(
    operations.resolve({ operationId: second.operationId, action: 'apply' }),
    /no longer applies/,
  );
  assert.equal(operations.getState(second.operationId).result.resolution, 'pending');
  await git('checkout', '--', 'src/app.js');
  const applied = await operations.resolve({ operationId: second.operationId, action: 'apply' });
  assert.equal(applied.result.resolution, 'applied');
  assert.equal(await readFile(app, 'utf8'), 'export const ok = 1;\n');
  await assert.rejects(access(workspaces[1]));

  // What is applied is the diff that was shown, even if the worktree changes afterwards,
  // and a credential the fix deletes is not echoed in the preview.
  await git('commit', '--quiet', '-am', 'applied');
  await writeFile(app, 'const password = "hunter2-synthetic";\nexport const ok = 1;\n');
  await git('commit', '--quiet', '-am', 'secret');
  outcome = {
    status: 'verified',
    verificationReport: 'Removed.',
    changedFiles: [],
    write: 'export const ok = 2;\n',
  };
  const third = await propose();
  assert.doesNotMatch(third.result.diff, /hunter2-synthetic/);
  assert.match(third.result.diff, /^\+export const ok = 2;$/m);
  await writeFile(join(workspaces.at(-1), 'src', 'app.js'), 'export const ok = "tampered";\n');
  await operations.resolve({ operationId: third.operationId, action: 'apply' });
  assert.equal(await readFile(app, 'utf8'), 'export const ok = 2;\n');

  // Nothing changed: no decision to make, and no worktree left behind.
  outcome = { status: 'blocked', reason: 'Needs a schema change.', changedFiles: [] };
  const blocked = await propose();
  assert.equal(blocked.result.resolution, 'none');
  assert.equal(blocked.result.report, 'Needs a schema change.');
  await assert.rejects(access(workspaces.at(-1)));
  assert.equal((await git('worktree', 'list')).stdout.trim().split('\n').length, 1);
});
