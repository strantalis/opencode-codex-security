import './helpers/isolated-codex.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  realpath,
  rm,
  readFile,
  readdir,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PlannedScanService } from '../src/core/planned-scan.ts';
import { RunHistory } from '../src/core/run-history.ts';
const result = (id) => ({ findings: { scanId: id, findings: [] } });
async function root(t) {
  const p = await realpath(await mkdtemp(join(tmpdir(), 'multi-scan-')));
  t.after(() => rm(p, { recursive: true, force: true }));
  await mkdir(join(p, 'src'));
  return p;
}
function controlled() {
  const calls = [];
  return {
    calls,
    factory: () => ({
      run: (repo, opts) =>
        new Promise((resolve, reject) => {
          const call = { repo, opts, resolve, reject };
          calls.push(call);
          opts.signal.addEventListener('abort', () => reject(new Error('cancelled')), {
            once: true,
          });
        }),
      close: async () => {},
    }),
  };
}
const tick = () => new Promise((r) => setImmediate(r));
test('two independent concurrent runs keep stable IDs, snapshots and cancellation; third waits', async (t) => {
  const p = await root(t),
    c = controlled(),
    s = new PlannedScanService(p, { createClient: c.factory, mock: true });
  t.after(() => s.dispose());
  const a = await s.prepare({ scanPrompt: 'A', scopePaths: ['src'] }),
    b = await s.prepare({ scanPrompt: 'B', mode: 'deep' });
  const [r1, r2] = await Promise.all([
    s.start({ planId: a.plan.id }),
    s.start({ planId: b.plan.id }),
  ]);
  await tick();
  const ca = c.calls.find((c) => c.opts.scanPrompt === 'A'),
    cb = c.calls.find((c) => c.opts.scanPrompt === 'B');
  assert.notEqual(r1.runId, r2.runId);
  assert.equal(c.calls.length, 2);
  assert.equal((await s.list()).runs.length, 2);
  const draft = await s.prepare({ scanPrompt: 'C' });
  await assert.rejects(s.start({ planId: draft.plan.id }), /Two scans/);
  assert.throws(() => s.cancel(), /Select the run/);
  assert.equal(ca.opts.signal.aborted, false);
  ca.opts.onLifecycle({ scanId: 'sdk-A' });
  ca.opts.onProgress({ phase: 'discovery', filesCompleted: 2, filesTotal: 5 });
  ca.opts.onCost({ estimatedUsd: 0.15 });
  ca.opts.onWorkerStatus({ phase: 'file_review', planned: 3, started: 2 });
  cb.opts.onDeepProgress({ completed: 1, active: 2, maximum: 4 });
  let one = s.getState({ runId: r1.runId }),
    two = s.getState({ runId: r2.runId });
  assert.equal(one.runId, r1.runId);
  assert.equal(one.scanId, 'sdk-A');
  assert.equal(one.progress.done, 2);
  assert.equal(two.progress.done, 0);
  assert.equal(one.estimatedCostUsd, 0.15);
  assert.equal(two.deepProgress.completed, 1);
  assert.equal(one.plan.scanPrompt, 'A');
  assert.equal(two.plan.scanPrompt, 'B');
  const repeated = await s.start({ planId: a.plan.id });
  assert.equal(repeated.runId, r1.runId);
  assert.equal(c.calls.length, 2);
  s.cancel({ runId: r1.runId });
  await s.wait(r1.runId);
  assert.equal(s.getState({ runId: r1.runId }).status, 'cancelled');
  assert.equal(s.getState({ runId: r2.runId }).status, 'running');
  assert.equal(cb.opts.signal.aborted, false);
  cb.resolve(result('sdk-B'));
  await s.wait(r2.runId);
  assert.equal(s.getState({ runId: r2.runId }).status, 'completed');
  ca.opts.onProgress({ phase: 'reporting', filesCompleted: 99, filesTotal: 99 });
  assert.equal(s.getState({ runId: r1.runId }).progress.done, 2);
  await assert.rejects(s.start({ planId: a.plan.id }), /already used/);
});
test('terminal local history survives instance restart, with private files and no inference', async (t) => {
  const p = await root(t),
    history = join(p, 'history');
  let count = 0;
  const factory = () => ({
    run: async () => {
      count++;
      return result('saved-sdk');
    },
    close: async () => {},
  });
  const s = new PlannedScanService(p, {
    createClient: factory,
    mock: true,
    historyDirectory: history,
  });
  const d = await s.prepare({ scanPrompt: 'Saved context' }),
    run = await s.start({ planId: d.plan.id });
  await s.wait(run.runId);
  await s.dispose();
  const files = (await readdir(history)).filter((p) => p.endsWith('.json'));
  assert.equal(files.length, 1);
  assert.equal((await stat(join(history, files[0]))).mode & 0o777, 0o600);
  const restored = new PlannedScanService(p, {
    createClient: factory,
    mock: true,
    historyDirectory: history,
  });
  t.after(() => restored.dispose());
  const list = await restored.list();
  assert.equal(list.runs[0].runId, run.runId);
  assert.equal(list.runs[0].status, 'completed');
  assert.equal(list.runs[0].archived, true);
  assert.equal(list.runs[0].plan.scanPrompt, 'Saved context');
  assert.equal(count, 1);
});
test('untracked prior running receipt is not resumed or reported completed', async (t) => {
  const p = await root(t),
    history = join(p, 'history'),
    c = controlled();
  const s = new PlannedScanService(p, {
    createClient: c.factory,
    mock: true,
    historyDirectory: history,
  });
  t.after(() => s.dispose());
  const d = await s.prepare({}),
    r = await s.start({ planId: d.plan.id });
  await tick();
  c.calls[0].opts.onLifecycle({ scanId: 'sdk-durable-id' });
  await s.flushHistory();
  const restored = new PlannedScanService(p, {
    createClient: () => {
      throw new Error('Must not resume');
    },
    historyDirectory: history,
  });
  t.after(() => restored.dispose());
  const list = await restored.list();
  assert.equal(list.runs[0].runId, r.runId);
  assert.equal(list.runs[0].scanId, 'sdk-durable-id');
  assert.equal(list.runs[0].status, 'error');
  assert.match(list.runs[0].error, /unknown/);
  assert.equal(c.calls.length, 1);
  s.cancel({ runId: r.runId });
  await s.wait(r.runId);
});
test('malformed history record cannot hide valid runs or block new previews', async (t) => {
  const p = await root(t),
    history = join(p, 'history'),
    factory = () => ({ run: async () => result('valid'), close: async () => {} });
  const s = new PlannedScanService(p, {
    createClient: factory,
    mock: true,
    historyDirectory: history,
  });
  const d = await s.prepare({}),
    r = await s.start({ planId: d.plan.id });
  await s.wait(r.runId);
  await s.dispose();
  const good = JSON.parse(await readFile(join(history, r.runId + '.json'), 'utf8'));
  const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  await writeFile(
    join(history, id + '.json'),
    JSON.stringify({ ...good, runId: id, startedAt: {} }),
  );
  const restored = new PlannedScanService(p, {
    createClient: factory,
    mock: true,
    historyDirectory: history,
  });
  t.after(() => restored.dispose());
  const list = await restored.list();
  assert.equal(list.runs.length, 1);
  assert.equal(list.runs[0].runId, r.runId);
  assert.equal(list.historyError, undefined);
  assert.equal((await restored.prepare({})).status, 'idle');
});

test('loading keeps the newest records by modification time and deletes the rest', async (t) => {
  const p = await root(t),
    history = join(p, 'history');
  await mkdir(history);
  const ids = [];
  for (let i = 0; i < 55; i++) {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    ids.push(id);
    const file = join(history, `${id}.json`);
    await writeFile(
      file,
      JSON.stringify({
        runId: id,
        status: 'completed',
        startedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
        findings: [],
        events: [],
      }),
    );
    // Record i was last written at minute i.
    const at = new Date(Date.UTC(2026, 0, 1, 0, i));
    await utimes(file, at, at);
  }
  await writeFile(join(history, 'notes.txt'), 'not a record');
  const records = await new RunHistory(history, 50).load();
  assert.equal(records.length, 50);
  assert.deepEqual(
    records.map((r) => r.runId),
    ids.slice(5).reverse(),
  );
  const left = await readdir(history);
  assert.equal(left.filter((n) => n.endsWith('.json')).length, 50);
  assert.ok(left.includes('notes.txt'));
  for (const id of ids.slice(0, 5)) assert.ok(!left.includes(`${id}.json`));
});

test('a failed history write never blocks a scan, and the error clears once writes succeed', async (t) => {
  const p = await root(t),
    history = join(p, 'history'),
    c = controlled();
  const s = new PlannedScanService(p, {
    createClient: c.factory,
    mock: true,
    historyDirectory: history,
  });
  t.after(() => s.dispose());
  await s.ready();
  // Replace the directory with a file so every write fails.
  await rm(history, { recursive: true });
  await writeFile(history, '');
  const d = await s.prepare({}),
    r = await s.start({ planId: d.plan.id });
  assert.equal(r.status, 'running');
  await tick();
  assert.equal(c.calls.length, 1);
  await s.flushHistory();
  assert.match((await s.list()).historyError, /could not be saved/);
  await rm(history);
  await mkdir(history);
  c.calls[0].resolve(result('recovered'));
  await s.wait(r.runId);
  assert.equal((await s.list()).historyError, undefined);
  assert.equal(
    JSON.parse(await readFile(join(history, `${r.runId}.json`), 'utf8')).status,
    'completed',
  );
});

test('finished runs keep their state but release their service and old previews', async (t) => {
  const p = await root(t),
    c = controlled();
  const s = new PlannedScanService(p, { createClient: c.factory, mock: true });
  t.after(() => s.dispose());
  const d = await s.prepare({ scanPrompt: 'Released' }),
    r = await s.start({ planId: d.plan.id });
  await tick();
  c.calls[0].resolve(result('released'));
  await s.wait(r.runId);
  // Cancelling a finished run reports it is no longer live; its state remains readable.
  assert.throws(() => s.cancel({ runId: r.runId }), /not active/);
  assert.equal(s.getState({ runId: r.runId }).status, 'completed');
  assert.equal((await s.list()).runs[0].plan.scanPrompt, 'Released');
  await assert.rejects(s.start({ planId: d.plan.id }), /already used/);
  // After the preview expires, the next prepare drops it; the run is still listed.
  const realNow = Date.now;
  Date.now = () => realNow() + 11 * 60_000;
  try {
    await s.prepare({});
  } finally {
    Date.now = realNow;
  }
  assert.throws(() => s.getState({ planId: d.plan.id }), /Unknown scan preview/);
  assert.equal(s.getState({ runId: r.runId }).status, 'completed');
});

test('session locations and explicit targets stay distinct even with identical repository names', async (t) => {
  const parent = await root(t);
  const first = join(parent, 'one', 'app');
  const second = join(parent, 'two', 'app');
  await mkdir(first, { recursive: true });
  await mkdir(second, { recursive: true });
  const a = controlled(),
    b = controlled();
  const firstSession = new PlannedScanService(first, { createClient: a.factory, mock: true });
  const secondSession = new PlannedScanService(second, { createClient: b.factory, mock: true });
  t.after(() => Promise.all([firstSession.dispose(), secondSession.dispose()]));
  const override = await firstSession.prepare({ repository: second });
  const ordinary = await secondSession.prepare({});
  const runA = await firstSession.start({ planId: override.plan.id });
  const runB = await secondSession.start({ planId: ordinary.plan.id });
  await tick();
  assert.equal(a.calls[0].repo, second);
  assert.equal(b.calls[0].repo, second);
  assert.equal((await firstSession.prepare({})).repository, first);
  assert.deepEqual(
    (await firstSession.list()).runs.map((r) => r.runId),
    [runA.runId],
  );
  assert.deepEqual(
    (await secondSession.list()).runs.map((r) => r.runId),
    [runB.runId],
  );
  assert.throws(() => secondSession.getState({ runId: runA.runId }), /Unknown scan run/);
  firstSession.cancel({ runId: runA.runId });
  await firstSession.wait(runA.runId);
  assert.equal(b.calls[0].opts.signal.aborted, false);
  assert.equal(secondSession.getState({ runId: runB.runId }).status, 'running');
  b.calls[0].resolve(result('session-two'));
  await secondSession.wait(runB.runId);
});
