import './helpers/isolated-codex.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexScanService, providerFailure, recoverPartial } from '../src/core/codex-adapter.ts';
import { stateDirectory } from '../src/core/settings.ts';
import { partialLabel, progressLabel, timeLimitLabel } from '../src/scan-display.ts';
import { emptyState } from '../src/types.ts';
import { plan } from './helpers/plan.mjs';

// The layout the SDK writes: a head per writer naming a checkpoint, newest wins.
const checkpointFinding = (title, level = 'high') => ({
  title,
  identity: { anchor: title.toLowerCase().replaceAll(' ', '-') },
  severity: { level },
  locations: [{ path: 'src/api.ts', startLine: 7 }],
  summary: 'Saved before the scan stopped.',
});
async function scanDirectory(t, scanId, parent) {
  const directory = parent ?? (await mkdtemp(join(tmpdir(), 'saved-scan-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const name of ['checkpoints', 'checkpoint-heads'])
    await mkdir(join(directory, name), { recursive: true });
  const save = async (name, at, findings) => {
    await writeFile(
      join(directory, 'checkpoints', `${name}.json`),
      JSON.stringify({
        scanId,
        findings,
        scope: { limitations: ['Stopped early.'] },
        reviewState: { surfaces: [{ id: 'api', label: 'API', disposition: 'needs_follow_up' }] },
      }),
    );
    await writeFile(
      join(directory, 'checkpoint-heads', `${name}.json`),
      JSON.stringify({ checkpoint: `${name}.json`, observedAtNs: at }),
    );
  };
  await save('early', '1794505183170442053', []);
  await save('late', '1794505999170442053', [
    checkpointFinding('Missing tenant check'),
    checkpointFinding('Verbose errors', 'informational'),
  ]);
  return directory;
}

test('a scan that fails keeps the findings of its last checkpoint, marked partial', async (t) => {
  const directory = await scanDirectory(t, 'sdk-9');
  const service = new CodexScanService('/tmp/fixture', {
    createClient: () => ({
      async run(_root, options) {
        options.onOutputDirReady(directory);
        options.onLifecycle({ scanId: 'sdk-9' });
        options.onReconnect(1, 5, { reason: 'authorization' });
        throw Object.assign(new (class CodexSecurityError extends Error {})(), {
          message: 'Reconnecting... 1/5 (unexpected status 403 Forbidden: model not available)',
        });
      },
      async close() {},
    }),
  });
  service.start(plan(service.root));
  const state = await service.wait();
  assert.equal(state.status, 'error');
  assert.equal(state.partial, true);
  assert.deepEqual(
    state.findings.map((finding) => [finding.title, finding.id]),
    [['Missing tenant check', 'missing-tenant-check:src/api.ts:7']],
  );
  assert.equal(state.skipped, 1);
  assert.equal(state.assessment.coverage.surfaces.dispositions.needs_follow_up, 1);
  assert.match(state.error, /^The model provider refused the request\. .* 403 Forbidden/);
  assert.doesNotMatch(state.error, /Reconnecting/);
  assert.match(partialLabel(state), /^Partial results\. .* 1 finding was saved/);
});

test('an earlier stopped scan is found again by its scan ID', async (t) => {
  const repository = '/work/billing';
  await scanDirectory(t, 'sdk-4', join(stateDirectory(), 'scans', 'billing', 'codex-security-a'));
  const stopped = { ...emptyState(), status: 'error', scanId: 'sdk-4' };
  assert.equal(await recoverPartial(stopped, repository), true);
  assert.equal(stopped.findings.length, 1);

  // Another scan's saved work is never shown, and a completed scan is left alone.
  const other = { ...emptyState(), status: 'error', scanId: 'sdk-5' };
  assert.equal(await recoverPartial(other, repository), false);
  const done = { ...emptyState(), status: 'completed', scanId: 'sdk-4' };
  assert.equal(await recoverPartial(done, repository), false);
});

test('a provider failure says whether trying again can help', () => {
  assert.match(
    providerFailure('Reconnecting... 5/5 (stream disconnected before completion)', 'network'),
    /^The model provider stopped answering and the retries ran out\. stream disconnected/,
  );
  assert.equal(providerFailure('Python 3.10 is required.'), 'Python 3.10 is required.');
  assert.equal(
    providerFailure('stream disconnected\nResume when connected: codex-security scans resume abc'),
    'stream disconnected',
  );
});

test('progress before review starts names the phase instead of counting zero files', () => {
  const run = (phase, done) => ({
    ...emptyState(),
    status: 'running',
    telemetry: { phaseProgress: { phase, files: { done, total: 261 } } },
  });
  assert.equal(
    progressLabel(run('threat_model', 0)),
    'Mapping the architecture · 261 files to review next',
  );
  assert.equal(progressLabel(run('discovery', 0)), '0 of 261 files');
  assert.equal(progressLabel(run('discovery', 12)), '12 of 261 files');
});

test('the time limit reads as a target for Standard and a deadline for Deep', () => {
  assert.equal(timeLimitLabel({ mode: 'standard' }), 'None');
  assert.equal(
    timeLimitLabel({ mode: 'standard', maxTimeMinutes: 20 }),
    '20m target, not a hard stop',
  );
  assert.equal(timeLimitLabel({ mode: 'deep', maxTimeMinutes: 180 }), '3h of discovery');
  assert.equal(timeLimitLabel({ mode: 'deep' }), 'SDK default');
});

test('an interrupted scan resumes in its original session and directory', async (t) => {
  const { PlannedScanService } = await import('../src/core/planned-scan.ts');
  const { project } = await import('./helpers/project.mjs');
  const root = await project(t);
  const seen = [];
  const service = new PlannedScanService(root, {
    createClient: () => ({
      async run(_root, options) {
        seen.push({ resumeScanId: options.resumeScanId, outputDir: options.outputDir });
        options.onOutputDirReady('/state/scans/deep-1');
        options.onLifecycle({ scanId: 'sdk-deep' });
        if (seen.length === 3) throw new Error('refused');
        if (seen.length !== 2) throw new (class ScanInterruptedError extends Error {})('dropped');
        return { findings: { scanId: 'sdk-deep', findings: [] } };
      },
      async close() {},
    }),
  });
  t.after(() => service.dispose());
  const first = await service.start({ planId: (await service.prepare({ mode: 'deep' })).plan.id });
  const stopped = await service.wait(first.runId);
  assert.equal(stopped.status, 'error');

  const preview = await service.prepare({ resumeRunId: first.runId });
  assert.deepEqual(preview.plan.resume, { runId: first.runId, scanId: 'sdk-deep' });
  assert.equal(JSON.stringify(preview).includes('codexOverrides'), false);
  const resumed = await service.wait((await service.start({ planId: preview.plan.id })).runId);
  assert.equal(resumed.status, 'completed');
  assert.deepEqual(seen, [
    { resumeScanId: undefined, outputDir: undefined },
    { resumeScanId: 'sdk-deep', outputDir: '/state/scans/deep-1' },
  ]);

  // A scan that finished has nothing to resume. A stopped Standard scan resumes as Standard.
  await assert.rejects(service.prepare({ resumeRunId: resumed.runId }), /stopped before finishing/);
  const standard = await service.wait(
    (await service.start({ planId: (await service.prepare({})).plan.id })).runId,
  );
  // A scan the provider refused is closed by the SDK. One that lost its connection is not.
  await assert.rejects(service.prepare({ resumeRunId: standard.runId }), /cannot be resumed/);
  const dropped = await service.wait(
    (await service.start({ planId: (await service.prepare({})).plan.id })).runId,
  );
  const again = await service.prepare({ resumeRunId: dropped.runId });
  assert.equal(again.plan.settings.scan.mode, 'standard');
  assert.equal(again.plan.resume.scanId, 'sdk-deep');
});
