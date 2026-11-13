import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  authenticationSummary,
  emptyTelemetry,
  recordActivity,
  recordWarning,
  measurementSummary,
} from '../src/core/run-telemetry.ts';
import { CodexScanService } from '../src/core/codex-adapter.ts';
import { plan } from './helpers/plan.mjs';
const now = '2026-11-10T10:00:00.000Z';
test('activity keeps what each step said, redacted, and never raw IDs or outside paths', () => {
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
  assert.equal(telemetry.activity[0].detail, 'cat src/api.ts; password=[REDACTED]');
  assert.doesNotMatch(JSON.stringify(telemetry), /SECRET/);
  // Tool payloads that are not readable text are reduced to the tool's name.
  const tools = emptyTelemetry();
  recordActivity(
    tools,
    { id: 't', kind: 'tool', status: 'running', description: `spawn_agent · ${'g'.repeat(300)}` },
    '/tmp/project',
    now,
  );
  recordActivity(
    tools,
    { id: 'u', kind: 'tool', status: 'running', description: `exec · ${'x'.repeat(80)}` },
    '/tmp/project',
    now,
  );
  recordActivity(
    tools,
    {
      id: 'v',
      kind: 'message',
      status: 'completed',
      description: `Checked\n the ${'a '.repeat(400)}`,
    },
    '/tmp/project',
    now,
  );
  assert.deepEqual(
    tools.activity.map((item) => item.detail?.slice(0, 20)),
    ['Starting a worker', 'exec', 'Checked the a a a a '],
  );
  assert.equal(tools.activity[2].detail.length, 400);
  for (let i = 0; i < 120; i++)
    recordActivity(
      telemetry,
      { ...activity, id: `SECRET-${i}`, kind: 'reasoning', description: 'Planning the review' },
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
  service.start(plan(service.root));
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
test('authentication is described the way the preview describes it, without secrets', () => {
  assert.equal(
    authenticationSummary({ method: 'api_key', source: 'OPENAI_API_KEY', verified: false }),
    'API key from OPENAI_API_KEY',
  );
  assert.equal(
    authenticationSummary({ method: 'aws_credentials', source: 'AWS_PROFILE', verified: false }),
    'AWS credentials (AWS PROFILE)',
  );
  assert.equal(
    authenticationSummary({
      method: 'stored_credentials',
      credentialType: 'chatgpt',
      verified: false,
    }),
    'Codex Security sign-in',
  );
  assert.equal(
    authenticationSummary({ method: 'command', verified: false }),
    'provider command authentication',
  );
});
test('warnings count every report and remember a target change', () => {
  const telemetry = emptyTelemetry();
  recordWarning(telemetry, undefined);
  assert.deepEqual(telemetry.warnings, { count: 1, targetChanged: false });
  recordWarning(telemetry, { kind: 'target_changed' });
  recordWarning(telemetry, undefined);
  assert.deepEqual(telemetry.warnings, { count: 3, targetChanged: true });
});
