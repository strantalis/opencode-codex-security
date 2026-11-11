import './helpers/isolated-codex.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
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
  await assert.rejects(operations.prepare({ kind: 'validation' }), /finding text/);
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
