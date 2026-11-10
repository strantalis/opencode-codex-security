import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createSecurityPlugin } from '../src/plugin.ts';
const tick = () => new Promise((r) => setImmediate(r));
test('registered model operations check separate permissions and exact question answers', async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'operation-tools-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  let allowed = false,
    policyCalls = 0,
    validationCalls = 0,
    answerReceived,
    handlers;
  const permissions = [],
    tools = [];
  const plugin = createSecurityPlugin({
    createClient: () => ({
      run: async () => ({ findings: { scanId: 'mock', findings: [] } }),
      close: async () => {},
    }),
    createOperationsClient: () => ({
      generatePolicy: async (repo, options) => {
        policyCalls++;
        answerReceived = await options.answerQuestions(
          ['Which roles approve releases?'],
          options.signal,
        );
        return {
          repository: repo,
          targetPath: resolve(repo, 'SECURITY.md'),
          content: '# Policy draft',
          reviewNotes: [],
        };
      },
      validate: async () => {
        validationCalls++;
        return { disposition: 'reportable', report: 'Synthetic validation.' };
      },
      close: async () => {},
    }),
  });
  const cleanup = await plugin.setup({
    options: { engine: 'codex' },
    location: { directory: root },
    permission: {
      assert: async (info) => {
        permissions.push(info);
        if (!allowed) throw new Error('Denied');
      },
    },
    rpc: {
      register: async (_d, h) => {
        handlers = h;
        return { events: { emit: async () => {} }, dispose: async () => {} };
      },
    },
    tool: {
      transform: async (cb) => {
        cb({ add: (t) => tools.push(t) });
        return { dispose: async () => {} };
      },
    },
  });
  t.after(cleanup);
  const ctx = {
    signal: new AbortController().signal,
    sessionID: 'test',
    agent: 'test',
    messageID: 'test',
    id: 'test',
  };
  const call = async (name, input) =>
    JSON.parse((await tools.find((t) => t.name === name).execute(input, ctx)).content);
  const policy = await call('security_prepare_policy', {});
  assert.equal(policyCalls, 0);
  await assert.rejects(
    call('security_start_operation', { operationId: policy.operationId }),
    /Denied/,
  );
  assert.equal(policyCalls, 0);
  allowed = true;
  await call('security_start_operation', { operationId: policy.operationId });
  await tick();
  let state = await call('security_operation_status', { operationId: policy.operationId });
  assert.equal(state.status, 'awaiting_answers');
  assert.equal(permissions.at(-1).action, 'codex_security_policy');
  allowed = false;
  await assert.rejects(
    call('security_answer_questions', {
      operationId: state.operationId,
      questionId: state.question.id,
      answer: 'Repository maintainers.',
    }),
    /Denied/,
  );
  assert.equal(answerReceived, undefined);
  allowed = true;
  await call('security_answer_questions', {
    operationId: state.operationId,
    questionId: state.question.id,
    answer: 'Repository maintainers.',
  });
  await tick();
  assert.equal(answerReceived, 'Repository maintainers.');
  assert.equal(permissions.at(-1).action, 'codex_security_answer');
  assert.equal(
    (await call('security_operation_status', { operationId: state.operationId })).result.applied,
    false,
  );
  const validation = await handlers.operationPrepare({
    kind: 'validation',
    finding: 'Synthetic missing authorization check.',
  });
  allowed = false;
  await assert.rejects(
    call('security_start_operation', { operationId: validation.operationId }),
    /Denied/,
  );
  assert.equal(validationCalls, 0);
  assert.equal(permissions.at(-1).action, 'codex_security_validation_uncapped');
  assert.match(permissions.at(-1).metadata.costNotice, /no SDK cost limit/);
  allowed = true;
  await call('security_start_operation', { operationId: validation.operationId });
  await tick();
  assert.equal(validationCalls, 1);
  assert.equal(
    (await call('security_operation_status', { operationId: validation.operationId })).result
      .disposition,
    'reportable',
  );
  const pending = await call('security_prepare_policy', {});
  await call('security_cancel_operation', { operationId: pending.operationId });
  assert.equal(policyCalls, 1);
  assert.equal(
    (await call('security_operation_status', { operationId: pending.operationId })).status,
    'cancelled',
  );
});
