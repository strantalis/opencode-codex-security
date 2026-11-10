import test from 'node:test';
import assert from 'node:assert/strict';
import {
  progressLabel,
  phaseLabel,
  elapsedLabel,
  runTitle,
  splitPaths,
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
  assert.equal(
    runTitle({ ...emptyState(), plan: { scanPrompt: 'Tenant checks\nOther context' } }),
    'Tenant checks',
  );
  assert.deepEqual(splitPaths(' src/api\n\n docs/model.md '), ['src/api', 'docs/model.md']);
});
