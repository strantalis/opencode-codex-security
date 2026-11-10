import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CodexScanService, mapSdkFinding } from '../src/core/codex-adapter.ts';
const finding = {
  findingId: 'f1',
  occurrenceId: 'o1',
  title: 'Synthetic SQL injection',
  severity: { level: 'high' },
  locations: [{ path: 'app.js', startLine: 12 }],
  taxonomy: { cwe: ['CWE-89'] },
  summary: 'Fixture summary',
  codeEvidence: [{ code: 'query(input)' }],
  remediation: 'Parameterize query',
  confidence: { level: 'high' },
};
const result = { findings: { scanId: 'sdk-1', findings: [finding] } };
const approval = (service) => ({
  approved: true,
  repository: service.root,
  allowNetworkModelInference: true,
  maxCostUsd: 1,
});
test('SDK factory is untouched until valid per-run approval', async () => {
  let created = 0;
  const service = new CodexScanService('/tmp/fixture', {
    createClient() {
      created++;
      throw new Error('should not run');
    },
  });
  assert.equal(service.getState().engine, 'codex-security-sdk');
  for (const value of [
    undefined,
    {},
    { ...approval(service), repository: '/other' },
    { ...approval(service), maxCostUsd: NaN },
    { ...approval(service), maxCostUsd: 0 },
    { ...approval(service), allowNetworkModelInference: false },
  ])
    assert.throws(() => service.start(value), /approval required/);
  assert.equal(created, 0);
  await service.dispose();
});
test('real SDK run contract maps lifecycle, progress and final findings; next scan needs fresh approval', async () => {
  let closed = 0,
    calls = 0;
  const snapshots = [];
  const service = new CodexScanService('/tmp/fixture', {
    createClient: () => ({
      async run(root, options) {
        calls++;
        assert.equal(root, service.root);
        assert.equal(options.maxCostUsd, 1);
        assert.equal(options.mode, 'standard');
        assert.equal(options.ownerSuggestions, false);
        assert.ok(options.signal instanceof AbortSignal);
        options.onLifecycle({ scanId: 'sdk-1' });
        options.onProgress({ phase: 'discovery', filesCompleted: 1, filesTotal: 3 });
        options.onProgress({
          phase: 'validation',
          filesCompleted: 1,
          filesTotal: 3,
          reviewItems: { completed: 2, total: 4 },
        });
        options.onActivity({
          kind: 'command',
          status: 'running',
          description: 'SECRET DO NOT DISPLAY',
        });
        return result;
      },
      async close() {
        closed++;
      },
    }),
  });
  service.subscribe((state) => snapshots.push(state));
  service.subscribe(() => {
    throw new Error('view failed');
  });
  service.start(approval(service));
  service.start(); // An already-running request is idempotent, not another scan.
  const completed = await service.wait();
  assert.equal(completed.status, 'completed');
  assert.equal(completed.scanId, 'sdk-1');
  assert.equal(completed.findings[0].cwe, 'CWE-89');
  assert.equal(completed.findings[0].line, 12);
  assert.ok(
    snapshots.some(
      (s) => s.phase.includes('reviews') && s.progress.total === 4 && s.progress.unit === 'reviews',
    ),
  );
  assert.ok(!JSON.stringify(completed).includes('SECRET'));
  assert.equal(closed, 1);
  assert.equal(calls, 1);
  assert.throws(() => service.start(), /approval required/);
  service.start(approval(service));
  await service.wait();
  assert.ok(snapshots.every((s, i) => i === 0 || s.revision > snapshots[i - 1].revision));
  await service.dispose();
});
test('cancellation aborts SDK signal, suppresses late results and closes client', async () => {
  let entered,
    closed = false;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  const service = new CodexScanService('/tmp/fixture', {
    createClient: () => ({
      async run(root, { signal }) {
        entered();
        await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
        return result;
      },
      async close() {
        closed = true;
      },
    }),
  });
  service.start(approval(service));
  await ready;
  service.cancel();
  const state = await service.wait();
  assert.equal(state.status, 'cancelled');
  assert.equal(state.findings.length, 0);
  assert.equal(closed, true);
  await service.dispose();
  assert.throws(() => service.start(approval(service)), /closed/);
});
test('SDK failure closes client and does not expose raw diagnostics', async () => {
  let closed = false;
  const service = new CodexScanService('/tmp/fixture', {
    createClient: () => ({
      async run() {
        throw new Error('SECRET');
      },
      async close() {
        closed = true;
      },
    }),
  });
  service.start(approval(service));
  const state = await service.wait();
  assert.equal(state.status, 'error');
  assert.ok(!JSON.stringify(state).includes('SECRET'));
  assert.equal(closed, true);
});
test('informational findings are not relabeled as low severity', () => {
  assert.equal(mapSdkFinding({ ...finding, severity: { level: 'informational' } }), null);
});

test('cleanup stays running, ignores late callbacks and prevents early restart', async () => {
  let release,
    entered,
    callbacks,
    factories = 0;
  const closing = new Promise((resolve) => {
    entered = resolve;
  });
  const service = new CodexScanService('/tmp/fixture', {
    createClient() {
      factories++;
      return {
        async run(root, options) {
          callbacks = options;
          assert.equal(options.auth, 'chatgpt');
          return result;
        },
        async close() {
          entered();
          await new Promise((resolve) => {
            release = resolve;
          });
        },
      };
    },
  });
  service.start(approval(service));
  await closing;
  assert.equal(service.getState().status, 'running');
  assert.equal(service.getState().finishedAt, null);
  const state = service.getState();
  callbacks.onProgress({ phase: 'discovery', filesCompleted: 999, filesTotal: 999 });
  callbacks.onLifecycle({ scanId: 'late-id' });
  assert.deepEqual(service.getState(), state);
  service.start(approval(service));
  assert.equal(factories, 1);
  release();
  assert.equal((await service.wait()).status, 'completed');
  callbacks.onProgress({ phase: 'discovery', filesCompleted: 999, filesTotal: 999 });
  assert.notEqual(service.getState().progress.total, 999);
  await service.dispose();
});
test('immediate cancellation while lazy client factory resolves never invokes run', async () => {
  let release,
    runs = 0,
    closed = 0;
  const service = new CodexScanService('/tmp/fixture', {
    createClient: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  service.start(approval(service));
  service.cancel();
  release({
    async run() {
      runs++;
      return result;
    },
    async close() {
      closed++;
    },
  });
  const state = await service.wait();
  assert.equal(state.status, 'cancelled');
  assert.equal(runs, 0);
  assert.equal(closed, 1);
});
test('multiple evidence snippets survive mapping; primary location is displayed', () => {
  const mapped = mapSdkFinding({
    ...finding,
    locations: [
      { path: 'primary.js', startLine: 5 },
      { path: 'secondary.js', startLine: 9 },
    ],
    codeEvidence: [{ code: 'first snippet' }, { code: 'second snippet' }],
  });
  assert.equal(mapped.path, 'primary.js');
  assert.equal(mapped.line, 5);
  assert.equal(mapped.evidence, 'first snippet\n\nsecond snippet');
});

test('budget-stop failure displays numeric estimates without raw diagnostic paths', async () => {
  const error = Object.assign(new Error('SECRET RAW DIAGNOSTIC'), {
    name: 'ScanCostLimitExceededError',
    maxCostUsd: 1,
    cost: { estimatedUsd: 1.0344056, estimatedUsdRange: { min: 1.0344056, max: 1.9210712 } },
    scanDir: '/private/SECRET',
  });
  const service = new CodexScanService('/tmp/fixture', {
    createClient: () => ({
      async run() {
        throw error;
      },
      async close() {},
    }),
  });
  service.start(approval(service));
  const state = await service.wait();
  assert.equal(state.status, 'error');
  assert.equal(state.estimatedCostUsd, 1.0344056);
  assert.match(state.error, /USD 1.03 baseline exceeded the USD 1.00 limit/);
  assert.match(state.error, /USD 1.03 to 1.92/);
  assert.match(state.error, /No completed assessment/);
  assert.doesNotMatch(JSON.stringify(state), /SECRET/);
  assert.equal(state.findings.length, 0);
});
