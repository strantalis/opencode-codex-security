import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyTelemetry,
  recordActivity,
  measurementSummary,
  sanitizeStoredTelemetry,
  safeActivityPaths,
} from '../src/core/run-telemetry.ts';
import { CodexScanService } from '../src/core/codex-adapter.ts';
const now = '2026-11-10T10:00:00.000Z';
const approve = (service) => ({
  approved: true,
  repository: service.root,
  allowNetworkModelInference: true,
  maxCostUsd: 1,
});
test('activity preserves safe identities, mentions and terminal transitions, never raw descriptions or IDs', () => {
  const telemetry = emptyTelemetry();
  const activity = {
    id: 'SECRET reasoning-id',
    kind: 'command',
    status: 'running',
    description: 'cat src/api.ts; password=SECRET',
    paths: ['src/api.ts', '../../private/SECRET', '.env', 'auth.json', '/outside/SECRET'],
    worker: 2,
  };
  recordActivity(telemetry, activity, '/tmp/project', now);
  recordActivity(
    telemetry,
    { ...activity, status: 'completed' },
    '/tmp/project',
    '2026-11-10T10:00:01.000Z',
  );
  recordActivity(telemetry, activity, '/tmp/project', '2026-11-10T10:00:02.000Z');
  assert.equal(telemetry.activity.length, 1);
  assert.equal(telemetry.activity[0].status, 'completed');
  assert.equal(telemetry.activity[0].label, 'Reading source');
  assert.deepEqual(telemetry.activity[0].paths, ['src/api.ts']);
  assert.equal(telemetry.activity[0].worker, 2);
  assert.equal(telemetry.activity[0].startedAt, now);
  assert.doesNotMatch(JSON.stringify(telemetry), /SECRET|password/);
  for (let i = 0; i < 120; i++)
    recordActivity(
      telemetry,
      { ...activity, id: String(i), kind: 'reasoning', description: 'SECRET' },
      '/tmp/project',
      now,
    );
  assert.equal(telemetry.activity.length, 100);
  assert.doesNotMatch(JSON.stringify(telemetry), /SECRET/);
});
test('partial measured subtotal and unavailable upper estimate remain explicitly uncertain', () => {
  const measurement = measurementSummary({
    coverage: 'partial',
    observedAt: now,
    threadCount: 2,
    missingThreadCount: 1,
    usage: {
      input_tokens: 10,
      cached_input_tokens: 5,
      output_tokens: 2,
      reasoning_output_tokens: 1,
      total_tokens: 12,
    },
    cost: {
      estimatedUsd: 0.2,
      estimatedUsdRange: { min: 0.2, max: null, context: 'unknown' },
      model: 'model',
      pricing: { source: 'https://attacker.invalid/SECRET', asOf: '2026-11-10' },
    },
  });
  assert.equal(measurement.coverage, 'partial');
  assert.equal(measurement.missingThreadCount, 1);
  assert.equal(measurement.cost.range.max, null);
  assert.equal(measurement.usage.totalTokens, 12);
  assert.equal(measurement.cost.pricingSource, undefined);
  assert.equal(
    measurementSummary({
      coverage: 'unavailable',
      observedAt: now,
      usage: null,
      cost: null,
      threadCount: 0,
      missingThreadCount: 1,
    }).cost,
    undefined,
  );
});
test('stored telemetry is bounded and re-sanitized instead of trusting extra local JSON fields', () => {
  const stored = {
    activity: [
      {
        id: 'a'.repeat(24),
        kind: 'tool',
        status: 'completed',
        label: 'SECRET',
        paths: ['src/api.ts', '/outside/SECRET'],
        startedAt: now,
        updatedAt: now,
        raw: 'SECRET',
      },
    ],
    observedWorkers: [2, 2, -1],
    measurement: {
      coverage: 'partial',
      observedAt: now,
      cost: { baselineUsd: 1, model: 'password=SECRET', range: { min: 1, max: null } },
    },
    raw: 'SECRET',
  };
  const restored = sanitizeStoredTelemetry(stored, '/tmp/project');
  assert.deepEqual(restored.observedWorkers, [2]);
  assert.equal(restored.activity[0].label, 'Tool call');
  assert.doesNotMatch(JSON.stringify(restored), /SECRET|raw/);
  assert.deepEqual(
    safeActivityPaths(['src/line\nbreak.ts', '.codex/auth.json'], '/tmp/project'),
    [],
  );
});
test('SDK lifecycle completion waits for final result, with review-zero fallback and independent partial measurements', async () => {
  let release, ready;
  const entered = new Promise((resolve) => {
    ready = resolve;
  });
  const service = new CodexScanService('/tmp/project', {
    createClient: () => ({
      async run(_root, options) {
        options.onProgress({
          phase: 'discovery',
          filesCompleted: 1,
          filesTotal: 3,
          reviewItems: { completed: 0, total: 0 },
        });
        options.onMeasurement({
          coverage: 'partial',
          observedAt: now,
          usage: null,
          cost: { estimatedUsd: 0.25, model: 'model' },
          threadCount: 1,
          missingThreadCount: 1,
        });
        options.onWorkerEvent({ kind: 'observed', worker: 3 });
        options.onWorkerEvent({ kind: 'observed', worker: 3 });
        options.onReconnect(1, 3, { reason: 'network', retryAfterSeconds: 2 });
        options.onLifecycle({
          scanId: 'sdk-lifecycle',
          status: 'completed',
          hasReportableFindings: false,
          finishedAt: now,
        });
        ready();
        await new Promise((resolve) => {
          release = resolve;
        });
        return { findings: { scanId: 'sdk-lifecycle', findings: [] } };
      },
      async close() {},
    }),
  });
  service.start(approve(service));
  await entered;
  const pending = service.getState();
  assert.equal(pending.status, 'running');
  assert.equal(pending.phase, 'Finishing SDK result');
  assert.deepEqual(pending.progress, { done: 1, total: 3, unit: 'files' });
  assert.equal(pending.telemetry.measurement.coverage, 'partial');
  assert.deepEqual(pending.telemetry.observedWorkers, [3]);
  assert.equal(pending.telemetry.lastReconnect.reason, 'network');
  assert.equal(pending.assessment, undefined);
  release();
  const result = await service.wait();
  assert.equal(result.status, 'completed');
  assert.equal(result.assessment.returnedFindings.total, 0);
  assert.equal(result.telemetry.measurement.coverage, 'partial');
});

test('private history restores safe telemetry and discards invalid assessment without dropping the run', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { RunHistory } = await import('../src/core/run-history.ts');
  const directory = await mkdtemp(join(tmpdir(), 'security-history-telemetry-'));
  try {
    const history = new RunHistory(directory);
    await history.load();
    const state = {
      ...new CodexScanService('/tmp/project', {
        createClient: () => {
          throw Error('No SDK');
        },
      }).getState(),
      runId: '12345678-1234-1234-1234-123456789abc',
      status: 'completed',
      startedAt: now,
      finishedAt: now,
      telemetry: {
        activity: [
          {
            id: 'b'.repeat(24),
            kind: 'tool',
            status: 'completed',
            label: 'SECRET',
            paths: ['src/api.ts'],
            startedAt: now,
            updatedAt: now,
          },
        ],
        observedWorkers: [],
      },
      assessment: { source: 'SECRET' },
    };
    await history.save(state);
    const [saved] = await history.load();
    assert.equal(saved.status, 'completed');
    assert.equal(saved.telemetry.activity[0].label, 'Tool call');
    assert.equal(saved.assessment, undefined);
    assert.doesNotMatch(JSON.stringify(saved), /SECRET/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
