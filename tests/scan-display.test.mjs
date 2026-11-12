import test from 'node:test';
import assert from 'node:assert/strict';
import {
  progressLabel,
  phaseLabel,
  elapsedLabel,
  runTitle,
  scanScope,
  scopeItems,
  splitPaths,
  phaseCounts,
  phaseContext,
  hasDeterminateProgress,
  runPhaseLabel,
  deepProgressLabel,
  findingsPendingLabel,
  activityRows,
  workerActivityRows,
  activityActor,
  activityStatusLabel,
  workerSummary,
  resultCountsLabel,
  coverageLabel,
  coverageDetails,
  repositoryMatchingLabel,
  trustedAccessLabel,
  targetChangedLabel,
} from '../src/scan-display.ts';
import { emptyState } from '../src/types.ts';
test('unknown totals never become a false zero percent or a 0/0 claim', () => {
  const state = emptyState();
  assert.equal(progressLabel(state), 'Waiting for progress details');
  state.progress = { done: 3, total: 0, unit: 'reviews' };
  assert.equal(progressLabel(state), '3 reviews completed');
  state.progress = { done: 3, total: 10, unit: 'reviews' };
  assert.equal(progressLabel(state), '3 of 10 reviews');
});
test('run display uses actual phase, bounded focus title and stable elapsed time', () => {
  assert.equal(phaseLabel('threat_model (reviews)'), 'Threat model');
  assert.equal(elapsedLabel('2026-11-10T00:00:00Z', '2026-11-10T00:01:05Z'), '1m 5s');
  assert.equal(elapsedLabel(null, null), '');
  assert.equal(runTitle({ ...emptyState(), repository: '/Projects/example' }), 'example');
  // Paths are scope, not a title: one tag each, and a short line for lists.
  const scoped = {
    ...emptyState(),
    repository: '/Projects/example',
    plan: { scopePaths: ['src/a.ts', 'src/b.ts', 'src/c.ts'] },
  };
  assert.equal(runTitle(scoped), 'example');
  assert.deepEqual(
    scopeItems(scoped).map((item) => item.text),
    ['src/a.ts', 'src/b.ts', 'src/c.ts'],
  );
  assert.equal(scanScope(scoped), 'src/a.ts, src/b.ts +1 more');
  assert.deepEqual(scopeItems({ ...emptyState(), plan: { scopePaths: [], changes: 'main' } }), [
    { text: 'Changes since main', path: false },
  ]);
  assert.equal(
    runTitle({ ...emptyState(), plan: { scanPrompt: 'Tenant checks\nOther context' } }),
    'Tenant checks',
  );
  assert.deepEqual(splitPaths(' src/api\n\n docs/model.md '), ['src/api', 'docs/model.md']);
});

const live = () => ({
  ...emptyState(),
  status: 'running',
  telemetry: { activity: [], observedWorkers: [] },
});
test('phase review counts fall back to files and do not treat Deep caps as progress', () => {
  const state = live();
  state.telemetry.phaseProgress = {
    phase: 'discovery',
    files: { done: 12, total: 20 },
    reviews: { done: 0, total: 0 },
  };
  assert.deepEqual(phaseCounts(state), { done: 12, total: 20, unit: 'files' });
  assert.equal(progressLabel(state), '12 of 20 files');
  assert.equal(hasDeterminateProgress(state), true);
  state.telemetry.phaseProgress.reviews = { done: 3, total: 10 };
  assert.equal(progressLabel(state), '3 of 10 reviews');
  assert.equal(phaseContext(state), 'Current phase only · 12 of 20 files');
  state.deepProgress = { completed: 3, active: 0, maximum: 8, consolidating: true };
  assert.equal(runPhaseLabel(state), 'Consolidating deep review');
  assert.equal(hasDeterminateProgress(state), false);
  assert.equal(deepProgressLabel(state), '3 deep passes complete · 0 active · cap 8');
  assert.equal(activityStatusLabel('running', state), 'Last reported running');
});
test('core lifecycle completion does not present completed findings or a full progress bar', () => {
  const state = live();
  state.progress = { done: 10, total: 10 };
  state.telemetry.lifecycle = {
    status: 'completed',
    hasReportableFindings: true,
    finishedAt: '2026-11-10T00:01:00Z',
  };
  assert.equal(runPhaseLabel(state), 'Finalizing results');
  assert.equal(hasDeterminateProgress(state), false);
  assert.match(findingsPendingLabel(state), /Waiting for the SDK’s final result/);
  assert.deepEqual(state.findings, []);
  assert.equal(activityStatusLabel('running', state), 'Last reported running');
  state.status = 'completed';
  assert.equal(runPhaseLabel(state), 'Scan complete');
});
test('activity keeps safe labels and worker identity without inferring worker completion', () => {
  const state = live();
  state.telemetry.activity = [
    {
      id: 'a',
      label: 'Reading source',
      status: 'running',
      worker: 1,
      updatedAt: '2026-11-10T00:00:00Z',
    },
    { id: 'b', label: 'Searching source', status: 'completed', updatedAt: '2026-11-10T00:00:01Z' },
  ];
  state.telemetry.observedWorkers = [1, 2];
  assert.deepEqual(
    activityRows(state).map((row) => row.id),
    ['b', 'a'],
  );
  assert.equal(activityActor(), 'Coordinator');
  assert.equal(activityActor(0), 'Worker 0');
  assert.equal(workerSummary(state), '2 worker sessions observed');
  state.status = 'cancelled';
  assert.equal(activityStatusLabel('running', state), 'Last reported running');
  assert.equal(activityStatusLabel('failed', state), 'Failed');
  assert.equal(runPhaseLabel(state), 'Scan cancelled');
});
test('missing and inconsistent phase totals never generate a misleading progress bar', () => {
  const state = live();
  for (const progress of [
    { done: 2, total: 0 },
    { done: 3, total: 2 },
    { done: NaN, total: NaN },
  ]) {
    state.progress = progress;
    assert.equal(hasDeterminateProgress(state), false);
  }
});
test('informational-only results and unavailable coverage are not presented as a clean scan', async () => {
  const { summarizeScanResult } = await import('../src/core/result-summary.ts');
  const state = { ...emptyState(), status: 'completed', skipped: 1 };
  state.assessment = summarizeScanResult(
    { findings: { findings: [{ severity: { level: 'informational' } }] }, manifest: { scan: {} } },
    '/Projects/atlas',
  );
  assert.equal(resultCountsLabel(state), '0 reportable · 1 informational');
  assert.equal(coverageLabel(state), 'Coverage details unavailable');
  assert.equal(repositoryMatchingLabel(state), 'Repository matching unavailable');
  const rows = coverageDetails(state);
  assert.equal(rows.find((row) => row.label === 'Deferred work').value, 'Not reported');
  assert.equal(rows.find((row) => row.label === 'Open questions').value, 'Not reported');
  assert.equal(rows.find((row) => row.label === 'Review surfaces').value, 'Not reported');
});
test('the compact activity view shows each actor once without losing keyed history', () => {
  const state = live();
  state.telemetry.activity = [
    { id: 'old', worker: 1, updatedAt: '2026-11-10T00:00:00Z' },
    { id: 'latest', worker: 1, updatedAt: '2026-11-10T00:00:02Z' },
    { id: 'coordinator', updatedAt: '2026-11-10T00:00:01Z' },
    { id: 'other', worker: 2, updatedAt: '2026-11-10T00:00:01Z' },
  ];
  assert.deepEqual(
    workerActivityRows(state).map((row) => row.id),
    ['latest', 'coordinator', 'other'],
  );
  assert.equal(activityRows(state).length, 4);
});

test('SDK failure or cancellation while cleanup is pending hides ordinary progress', () => {
  for (const status of ['failed', 'canceled']) {
    const state = live();
    state.progress = { done: 3, total: 10 };
    state.telemetry.lifecycle = { status, hasReportableFindings: null, finishedAt: null };
    assert.equal(
      runPhaseLabel(state),
      status === 'failed' ? 'Finishing failed scan' : 'Finishing cancelled scan',
    );
    assert.equal(hasDeterminateProgress(state), false);
    assert.match(findingsPendingLabel(state), /Waiting for the final result/);
    assert.match(findingsPendingLabel(state), /not a completed assessment/);
    assert.equal(activityStatusLabel('running', state), 'Last reported running');
    assert.equal(state.status, 'running');
  }
});

test('trusted access is shown only when missing or unverified', () => {
  const state = emptyState();
  assert.equal(trustedAccessLabel(state), '');
  state.telemetry = { activity: [], observedWorkers: [], trustedAccess: 'granted' };
  assert.equal(trustedAccessLabel(state), '');
  state.telemetry.trustedAccess = 'not_granted';
  assert.equal(trustedAccessLabel(state), 'Trusted Access for Cyber: not granted');
  state.telemetry.trustedAccess = 'unknown';
  assert.equal(trustedAccessLabel(state), 'Trusted Access for Cyber: not verified');
});

test('a target change is called out; other warnings are not', () => {
  const state = emptyState();
  assert.equal(targetChangedLabel(state), '');
  state.telemetry = {
    activity: [],
    observedWorkers: [],
    warnings: { count: 1, targetChanged: false },
  };
  assert.equal(targetChangedLabel(state), '');
  state.telemetry.warnings.targetChanged = true;
  assert.equal(targetChangedLabel(state), 'The repository changed during the scan');
});
