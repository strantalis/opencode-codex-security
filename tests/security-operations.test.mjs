import './helpers/isolated-codex.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, realpath, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { SecurityOperationsService } from '../src/core/security-operations.ts';
import { safeFinding, safeReportText } from '../src/core/report-safety.ts';

async function fixture(t, settings = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'security-operations-')));
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'config', 'opencode'), { recursive: true });
  await writeFile(join(root, 'src', 'app.js'), '// Synthetic fixture; no secrets.');
  await writeFile(join(root, 'ARCHITECTURE.md'), 'Synthetic architecture context.');
  const config = join(root, 'config', 'opencode', 'codex-security.json');
  await writeFile(config, JSON.stringify(settings));
  const old = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = join(root, 'config');
  t.after(async () => {
    if (old === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = old;
    await rm(root, { recursive: true, force: true });
  });
  return { root, config };
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
async function until(check) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.fail('Expected state was not reached.');
}
function draft(repository, path = '.', content = '# Security policy\nOwner review required.') {
  return {
    repository,
    targetPath: join(repository, path, 'SECURITY.md'),
    content,
    reviewNotes: ['Confirm public exposure.'],
    cost: { estimatedUsd: 0.02 },
  };
}
function client(overrides = {}) {
  return {
    generatePolicy: async (repository, options) => draft(repository, options.path),
    validate: async () => ({
      disposition: 'deferred',
      report: 'Insufficient source evidence.',
      outputDir: '/private/artifacts',
      threadId: 'private-thread',
    }),
    close: async () => {},
    ...overrides,
  };
}
function service(t, root, createClient) {
  const instance = new SecurityOperationsService(root, { createClient, mock: true });
  t.after(() => instance.dispose());
  return instance;
}
const approval = (operation) => ({
  operationId: operation.operationId,
  approveOpenAIInference: true,
});

test('preparation is SDK-free, immutable, strict, and separately authorized', async (t) => {
  const { root } = await fixture(t);
  let created = 0;
  const operations = service(t, root, () => {
    created++;
    return client();
  });
  const state = await operations.prepare({
    kind: 'policy',
    path: 'src',
    contextFiles: ['ARCHITECTURE.md'],
  });
  assert.equal(state.status, 'prepared');
  assert.equal(state.plan.id, state.operationId);
  assert.equal(state.plan.mock, true);
  assert.equal(state.plan.costLimitEnforced, true);
  assert.match(state.plan.costNotice, /estimated.*not a guaranteed/);
  state.plan.path = '.';
  state.plan.settings.scan.maxCostUsd = 900;
  assert.equal(operations.getState(state.operationId).plan.path, 'src');
  assert.equal(operations.getState(state.operationId).plan.settings.scan.maxCostUsd, 1);
  await assert.rejects(operations.start({ operationId: state.operationId }), /authorize/);
  await assert.rejects(
    operations.start({ operationId: 'wrong', approveOpenAIInference: true }),
    /Unknown/,
  );
  for (const extra of [
    { approveOpenAIInference: true },
    { auth: 'api-key' },
    { maxCostUsd: 10 },
    { outputDir: '/tmp' },
    { scanPrompt: 'custom' },
  ]) {
    await assert.rejects(
      operations.prepare({ kind: 'policy', ...extra }),
      /Unsupported operation input/,
    );
  }
  assert.equal(created, 0);
  assert.throws(() => new SecurityOperationsService(root, { mock: true }), /injected/);
});

test('policy sends approved SDK settings and resumes each callback with exact operation-bound answers', async (t) => {
  const { root } = await fixture(t, {
    codex: { model: 'gpt-6.1-sol', reasoningEffort: 'high', daybreak: true },
    scan: { maxCostUsd: 2 },
  });
  await writeFile(join(root, 'src', 'SECURITY.md'), 'Original policy');
  let config,
    args,
    closed = 0;
  const answers = [];
  const operations = service(t, root, (value) => {
    config = value;
    return client({
      generatePolicy: async (repository, options) => {
        args = { repository, options };
        options.onStage('architecture');
        options.onCost({ estimatedUsd: 0.01 });
        answers.push(
          await options.answerQuestions(['Is the API public?', 'Who can deploy?'], options.signal),
        );
        answers.push(await options.answerQuestions(['Are tenants isolated?'], options.signal));
        options.onStage('policy');
        return draft(repository, options.path);
      },
      close: async () => {
        closed++;
      },
    });
  });
  const prepared = await operations.prepare({
    kind: 'policy',
    path: 'src',
    contextFiles: ['ARCHITECTURE.md'],
  });
  const snapshots = [];
  operations.subscribe((value) => snapshots.push(value));
  operations.subscribe(() => {
    throw new Error('Broken view');
  });
  await operations.start(approval(prepared));
  await until(() => operations.getState(prepared.operationId).status === 'awaiting_answers');
  const first = operations.getState(prepared.operationId).question;
  assert.equal(first.questions.length, 2);
  assert.throws(
    () =>
      operations.answer({ operationId: prepared.operationId, questionId: 'wrong', answer: 'No' }),
    /no longer pending/,
  );
  assert.throws(
    () =>
      operations.answer({ operationId: prepared.operationId, questionId: first.id, answer: '' }),
    /nonempty/,
  );
  operations.answer({
    operationId: prepared.operationId,
    questionId: first.id,
    answer: 'Public API; only administrators deploy.',
  });
  assert.throws(
    () =>
      operations.answer({
        operationId: prepared.operationId,
        questionId: first.id,
        answer: 'Duplicate',
      }),
    /no longer pending/,
  );
  await until(
    () =>
      operations.getState(prepared.operationId).question?.id !== first.id &&
      operations.getState(prepared.operationId).question,
  );
  const second = operations.getState(prepared.operationId).question;
  operations.answer({
    operationId: prepared.operationId,
    questionId: second.id,
    answer: 'Isolation is unknown and requires owner review.',
  });
  const result = await operations.wait(prepared.operationId);
  assert.equal(result.status, 'completed');
  assert.equal(result.answeredQuestionCount, 3);
  assert.equal(result.question, null);
  assert.equal(result.result.applied, false);
  assert.equal(result.estimatedCostUsd, 0.02);
  assert.equal(await readFile(join(root, 'src', 'SECURITY.md'), 'utf8'), 'Original policy');
  assert.deepEqual(answers, [
    'Public API; only administrators deploy.',
    'Isolation is unknown and requires owner review.',
  ]);
  assert.deepEqual(config.codexOverrides, {
    model_provider: 'openai',
    model: 'gpt-6.1-sol',
    model_reasoning_effort: 'high',
    daybreak: true,
  });
  assert.equal(args.repository, root);
  assert.equal(args.options.path, 'src');
  assert.equal(args.options.maxCostUsd, 2);
  assert.equal(args.options.auth, 'chatgpt');
  assert.deepEqual(args.options.knowledgeBasePaths, [join(root, 'ARCHITECTURE.md')]);
  assert.equal('onSessionEvent' in args.options, false);
  assert.equal('onAuthentication' in args.options, false);
  assert.equal('Public API; only administrators deploy.' in result, false);
  assert.equal(JSON.stringify(result).includes('only administrators deploy'), false);
  assert.ok(snapshots.some((state) => state.phase === 'Mapping architecture'));
  assert.equal(closed, 1);
  await assert.rejects(operations.start(approval(prepared)), /already used/);
});

test('validation requires explicit uncapped approval and does not pretend to pass a scan budget', async (t) => {
  const { root } = await fixture(t, { scan: { maxCostUsd: 0.5, cyberAccessProgram: 'standard' } });
  let called = 0,
    options;
  const operations = service(t, root, () =>
    client({
      validate: async (value) => {
        called++;
        options = value;
        return {
          disposition: 'reportable',
          report: 'Source evidence supports the finding.',
          outputDir: '/hidden',
          threadId: 'hidden',
        };
      },
    }),
  );
  const finding = { title: 'Possible unsafe query', location: 'src/app.js:1' };
  const prepared = await operations.prepare({
    kind: 'validation',
    finding,
    contextFiles: ['ARCHITECTURE.md'],
  });
  finding.title = 'Mutated later';
  assert.equal(prepared.plan.costLimitEnforced, false);
  assert.match(prepared.plan.costNotice, /no SDK cost limit/);
  await assert.rejects(
    operations.start(approval(prepared)),
    /Explicit approval required.*no cost limit/,
  );
  assert.equal(called, 0);
  await operations.start({ ...approval(prepared), approveUncappedValidation: true });
  const result = await operations.wait(prepared.operationId);
  assert.equal(result.status, 'completed');
  assert.equal(result.result.disposition, 'reportable');
  assert.equal(result.result.report, 'Source evidence supports the finding.');
  assert.equal('outputDir' in result.result, false);
  assert.equal('threadId' in result.result, false);
  assert.equal('maxCostUsd' in options, false);
  assert.equal('onCost' in options, false);
  assert.equal(options.repositoryPath, root);
  assert.equal(JSON.parse(options.finding).title, 'Possible unsafe query');
  assert.equal(options.cyberAccessProgram, 'standard');
  assert.deepEqual(options.knowledgeBasePaths, [join(root, 'ARCHITECTURE.md')]);
  assert.equal(called, 1);
});

test('literal validation finding strings are never read as paths', async (t) => {
  const { root } = await fixture(t);
  let actual;
  const operations = service(t, root, () =>
    client({
      validate: async (value) => {
        actual = value.finding;
        return { disposition: 'deferred', report: 'Insufficient evidence.' };
      },
    }),
  );
  const prepared = await operations.prepare({
    kind: 'validation',
    finding: '/not/a/real/file.json',
  });
  await operations.start({ ...approval(prepared), approveUncappedValidation: true });
  await operations.wait(prepared.operationId);
  assert.equal(actual, '/not/a/real/file.json');
  for (const finding of [undefined, '', [], 1, 'x'.repeat(32769), { password: 'do-not-transmit' }])
    await assert.rejects(operations.prepare({ kind: 'validation', finding }));
  await assert.rejects(
    operations.prepare({ kind: 'validation', path: 'src', finding: 'Example finding' }),
    /not a validation scope/,
  );
  await assert.rejects(
    operations.prepare({ kind: 'policy', finding: 'Example finding' }),
    /only supported for validation/,
  );
  await assert.rejects(operations.prepare({ kind: 'patch' }), /isolated workspace/);
});

test('cancel rejects outstanding question callbacks and prevents later answers/results', async (t) => {
  const { root } = await fixture(t);
  let rejected = false,
    closed = 0;
  const operations = service(t, root, () =>
    client({
      generatePolicy: async (repository, options) => {
        try {
          await options.answerQuestions(['Who owns deployment?'], options.signal);
        } catch {
          rejected = true;
        }
        return draft(repository, options.path, 'Late result must be discarded.');
      },
      close: async () => {
        closed++;
      },
    }),
  );
  const prepared = await operations.prepare({ kind: 'policy' });
  await operations.start(approval(prepared));
  await until(() => operations.getState(prepared.operationId).question);
  const question = operations.getState(prepared.operationId).question;
  operations.cancel(prepared.operationId);
  assert.throws(
    () =>
      operations.answer({
        operationId: prepared.operationId,
        questionId: question.id,
        answer: 'Late',
      }),
    /no longer pending/,
  );
  const state = await operations.wait(prepared.operationId);
  assert.equal(rejected, true);
  assert.equal(state.status, 'cancelled');
  assert.equal(state.result, null);
  assert.equal(state.question, null);
  assert.equal(state.error, null);
  assert.equal(closed, 1);
});

test('cancellation during lazy SDK creation closes the client without calling operations', async (t) => {
  const { root } = await fixture(t);
  const ready = deferred();
  let created = false,
    calls = 0,
    closed = 0;
  const operations = service(t, root, async () => {
    created = true;
    return ready.promise;
  });
  const prepared = await operations.prepare({ kind: 'policy' });
  await operations.start(approval(prepared));
  await until(() => created);
  operations.cancel(prepared.operationId);
  ready.resolve(
    client({
      generatePolicy: async () => {
        calls++;
      },
      close: async () => {
        closed++;
      },
    }),
  );
  const result = await operations.wait(prepared.operationId);
  assert.equal(result.status, 'cancelled');
  assert.equal(calls, 0);
  assert.equal(closed, 1);
});

test('disposal rejects pending questions and cancellation of a preview never creates the SDK', async (t) => {
  const { root } = await fixture(t);
  let calls = 0,
    rejected = false;
  const operations = service(t, root, () => {
    calls++;
    return client({
      generatePolicy: async (repository, options) => {
        try {
          await options.answerQuestions(['Clarify production exposure.'], options.signal);
        } catch {
          rejected = true;
          throw new Error('Cancelled');
        }
        return draft(repository);
      },
    });
  });
  const cancelled = await operations.prepare({ kind: 'policy' });
  operations.cancel(cancelled.operationId);
  await assert.rejects(operations.start(approval(cancelled)), /already used/);
  assert.equal(calls, 0);
  const pending = await operations.prepare({ kind: 'policy' });
  await operations.start(approval(pending));
  await until(() => operations.getState(pending.operationId).question);
  await operations.dispose();
  assert.equal(rejected, true);
  assert.equal(operations.getState(pending.operationId).status, 'cancelled');
  await assert.rejects(operations.prepare({ kind: 'policy' }), /closed/);
});

test('policy and validation inherit path guards and reject home/ancestor/credential targets', async (t) => {
  const { root } = await fixture(t);
  let calls = 0;
  const operations = service(t, root, () => {
    calls++;
    return client();
  });
  await symlink(homedir(), join(root, 'home-link'));
  await mkdir(join(root, '.ssh'));
  await writeFile(join(root, '.env'), 'Synthetic secret');
  await symlink('/tmp', join(root, 'outside'));
  for (const repository of [homedir(), '/', join(root, 'home-link'), join(root, '.ssh')]) {
    for (const kind of ['policy', 'validation'])
      await assert.rejects(
        operations.prepare({
          kind,
          repository,
          ...(kind === 'validation' ? { finding: 'Synthetic finding' } : {}),
        }),
      );
  }
  for (const path of ['../', '/tmp', 'src/*', '.ssh', '.env', 'outside', 'src/app.js'])
    await assert.rejects(operations.prepare({ kind: 'policy', path }));
  for (const contextFiles of [['.env'], ['../file.md'], ['outside/missing.md']])
    await assert.rejects(
      operations.prepare({ kind: 'validation', finding: 'Synthetic finding', contextFiles }),
    );
  assert.equal(calls, 0);
});

test('policy preparation never permits silent expansion to enclosing or nested Git roots', async (t) => {
  const { root } = await fixture(t);
  await mkdir(join(root, '.git'));
  const operations = service(t, root, () => client());
  await assert.rejects(
    operations.prepare({ kind: 'policy', repository: join(root, 'src') }),
    /Git repository root/,
  );
  const valid = await operations.prepare({ kind: 'policy', path: 'src' });
  assert.equal(valid.repository, root);
  await writeFile(join(root, 'src', '.git'), 'gitdir: synthetic-only');
  await assert.rejects(operations.prepare({ kind: 'policy', path: 'src' }), /Git repository root/);
  await assert.rejects(operations.start(approval(valid)), /Git repository root/);
  assert.equal(operations.getState(valid.operationId).status, 'error');
});

test('changed context or settings invalidate the operation before SDK creation', async (t) => {
  const { root, config } = await fixture(t);
  let calls = 0;
  const operations = service(t, root, () => {
    calls++;
    return client();
  });
  const first = await operations.prepare({ kind: 'policy', contextFiles: ['ARCHITECTURE.md'] });
  await writeFile(join(root, 'ARCHITECTURE.md'), 'Changed context');
  await assert.rejects(operations.start(approval(first)), /changed/);
  const second = await operations.prepare({ kind: 'validation', finding: 'Synthetic finding' });
  await writeFile(config, '{"scan":{"maxCostUsd":5}}');
  await assert.rejects(
    operations.start({ ...approval(second), approveUncappedValidation: true }),
    /changed/,
  );
  assert.equal(calls, 0);
});

test('operation IDs isolate concurrent answers and duplicate starts share one invocation', async (t) => {
  const { root } = await fixture(t);
  let calls = 0;
  const received = [];
  const operations = service(t, root, () =>
    client({
      generatePolicy: async (repository, options) => {
        calls++;
        received.push(await options.answerQuestions(['Describe this component.'], options.signal));
        return draft(repository, options.path);
      },
    }),
  );
  const first = await operations.prepare({ kind: 'policy' });
  const second = await operations.prepare({ kind: 'policy', path: 'src' });
  const third = await operations.prepare({ kind: 'policy' });
  await Promise.all([operations.start(approval(first)), operations.start(approval(first))]);
  await operations.start(approval(second));
  await until(() => operations.list().filter((state) => state.question).length === 2);
  assert.equal(calls, 2);
  await assert.rejects(operations.start(approval(third)), /Two operations/);
  const firstQuestion = operations.getState(first.operationId).question;
  const secondQuestion = operations.getState(second.operationId).question;
  assert.throws(
    () =>
      operations.answer({
        operationId: first.operationId,
        questionId: secondQuestion.id,
        answer: 'Cross-run answer',
      }),
    /no longer pending/,
  );
  operations.answer({
    operationId: second.operationId,
    questionId: secondQuestion.id,
    answer: 'Component answer',
  });
  operations.answer({
    operationId: first.operationId,
    questionId: firstQuestion.id,
    answer: 'Repository answer',
  });
  await Promise.all([operations.wait(first.operationId), operations.wait(second.operationId)]);
  assert.deepEqual(received.sort(), ['Component answer', 'Repository answer']);
  const states = operations.list();
  states[0].plan.path = 'modified';
  assert.notEqual(operations.getState(third.operationId).plan.path, 'modified');
});

test('final reports and questions redact conventional secrets and never expose errors or raw events', async (t) => {
  const { root } = await fixture(t);
  const secret = 'sk-abcdefghijklmnopqrstuvwxyz123456789';
  const operations = service(t, root, () =>
    client({
      generatePolicy: async (repository, options) => {
        await options.answerQuestions([`Do not echo this credential ${secret}`], options.signal);
        return draft(
          repository,
          options.path,
          `# Policy\napi_key="${secret}"\nAuthorization: Bearer abcdefghijklmnopqrstuv`,
        );
      },
    }),
  );
  const prepared = await operations.prepare({ kind: 'policy' });
  await operations.start(approval(prepared));
  await until(() => operations.getState(prepared.operationId).question);
  const question = operations.getState(prepared.operationId).question;
  assert.equal(question.questions[0].includes(secret), false);
  assert.throws(
    () =>
      operations.answer({
        operationId: prepared.operationId,
        questionId: question.id,
        answer: secret,
      }),
    /credential/,
  );
  operations.answer({
    operationId: prepared.operationId,
    questionId: question.id,
    answer: 'Do not use credentials in policy documentation.',
  });
  const result = await operations.wait(prepared.operationId);
  assert.equal(result.status, 'completed');
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(result.result.content.includes('abcdefghijklmnopqrstuv'), false);
  const failed = service(t, root, () =>
    client({
      validate: async () => {
        throw new Error(`Bearer ${secret}; private source and chain-of-thought`);
      },
    }),
  );
  const preview = await failed.prepare({ kind: 'validation', finding: 'Synthetic finding' });
  await failed.start({ ...approval(preview), approveUncappedValidation: true });
  const failure = await failed.wait(preview.operationId);
  assert.equal(failure.status, 'error');
  assert.equal(JSON.stringify(failure).includes(secret), false);
  assert.equal(JSON.stringify(failure).includes('chain-of-thought'), false);
});

test('malformed or wrong-target results fail closed and oversized final text is visibly truncated', async (t) => {
  const { root } = await fixture(t);
  const wrong = service(t, root, () =>
    client({ generatePolicy: async () => draft('/different-repository') }),
  );
  const first = await wrong.prepare({ kind: 'policy' });
  await wrong.start(approval(first));
  assert.equal((await wrong.wait(first.operationId)).status, 'error');
  const large = service(t, root, () =>
    client({ validate: async () => ({ disposition: 'deferred', report: 'a'.repeat(50_000) }) }),
  );
  const second = await large.prepare({ kind: 'validation', finding: 'Synthetic finding' });
  await large.start({ ...approval(second), approveUncappedValidation: true });
  const final = await large.wait(second.operationId);
  assert.equal(final.result.report.length, 48_000);
  assert.equal(final.result.truncated, true);
});

test('shared finding redaction covers report prose and evidence, bounds strings, and preserves useful code', () => {
  const key = 'sk-synthetic012345678901234567890';
  const value = {
    id: `finding-${key}`,
    title: `Exposed ${key}`,
    severity: 'high',
    path: `src/${key}/app.js`,
    line: 42,
    cwe: `CWE-798 ${key}`,
    summary: `A token was exposed: ${key}`,
    evidence: `const user = request.user;\nconst api_key = "${key}";\n-----BEGIN PRIVATE KEY-----\nsynthetic-private-value\n-----END PRIVATE KEY-----`,
    remediation:
      'Rotate password="synthetic-password" and Authorization: Bearer synthetictoken1234567890',
    confidence: `high ${key}`,
    unexpectedRawOutput: key,
  };
  const safe = safeFinding(value);
  assert.equal(JSON.stringify(safe).includes(key), false);
  assert.equal(JSON.stringify(safe).includes('synthetic-password'), false);
  assert.equal(JSON.stringify(safe).includes('synthetictoken1234567890'), false);
  assert.equal(JSON.stringify(safe).includes('synthetic-private-value'), false);
  assert.equal('unexpectedRawOutput' in safe, false);
  assert.match(safe.evidence, /const user = request.user;/);
  assert.equal(safe.severity, 'high');
  assert.equal(safe.line, 42);
  assert.deepEqual(safeFinding(safe), safe);
  assert.equal(value.summary.includes(key), true, 'Redaction does not mutate the caller.');
  const huge = 'a'.repeat(100_000);
  const bounded = safeFinding({
    ...value,
    id: huge,
    title: huge,
    path: huge,
    cwe: huge,
    summary: huge,
    evidence: huge,
    remediation: huge,
    confidence: huge,
  });
  for (const [field, length] of Object.entries({
    id: 512,
    title: 1000,
    path: 4096,
    cwe: 512,
    summary: 16000,
    evidence: 24000,
    remediation: 16000,
    confidence: 128,
  }))
    assert.equal(bounded[field].length, length);
  assert.equal(safeReportText('a\u0000b\u001bc'), 'abc');
  assert.equal(safeReportText(undefined), '');
});

test('policy and validation require a known session or explicit absolute target', async (t) => {
  const { root } = await fixture(t);
  let created = 0;
  const operations = service(t, '', () => {
    created++;
    return client();
  });
  for (const input of [{ kind: 'policy' }, { kind: 'validation', finding: 'Synthetic issue' }]) {
    await assert.rejects(operations.prepare(input), /No local project/);
    assert.equal((await operations.prepare({ ...input, repository: root })).repository, root);
  }
  assert.equal(created, 0);
});
