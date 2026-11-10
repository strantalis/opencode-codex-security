import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, rm, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PlannedScanService } from '../src/core/planned-scan.ts';
import { createSecurityPlugin } from '../src/plugin.ts';
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
    s.start({ planId: a.plan.id, approveOpenAIInference: true }),
    s.start({ planId: b.plan.id, approveOpenAIInference: true }),
  ]);
  await tick();
  const ca = c.calls.find((c) => c.opts.scanPrompt === 'A'),
    cb = c.calls.find((c) => c.opts.scanPrompt === 'B');
  assert.notEqual(r1.runId, r2.runId);
  assert.equal(c.calls.length, 2);
  assert.equal((await s.list()).runs.length, 2);
  const draft = await s.prepare({ scanPrompt: 'C' });
  await assert.rejects(
    s.start({ planId: draft.plan.id, approveOpenAIInference: true }),
    /Two scans/,
  );
  assert.throws(() => s.cancel(), /exact run/);
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
  const repeated = await s.start({ planId: a.plan.id, approveOpenAIInference: true });
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
  await assert.rejects(
    s.start({ planId: a.plan.id, approveOpenAIInference: true }),
    /already used/,
  );
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
    run = await s.start({ planId: d.plan.id, approveOpenAIInference: true });
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
    r = await s.start({ planId: d.plan.id, approveOpenAIInference: true });
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
test('model tools expose safe run telemetry/results and permissioned exact cancellation', async (t) => {
  const p = await root(t),
    c = controlled(),
    tools = [];
  let handlers,
    allowed = false,
    checks = 0;
  const plugin = createSecurityPlugin({ createClient: c.factory });
  const cleanup = await plugin.setup({
    options: { engine: 'codex' },
    location: { directory: p },
    permission: {
      assert: async (info) => {
        checks++;
        assert.equal(info.action, 'codex_security_cancel');
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
  const names = [
    'security_list_scans',
    'security_scan_status',
    'security_scan_activity',
    'security_scan_results',
    'security_cancel_scan',
  ];
  for (const name of names) assert.ok(tools.find((t) => t.name === name));
  const d = await handlers.prepare({}),
    r = await handlers.start({ planId: d.plan.id, approveOpenAIInference: true });
  await tick();
  c.calls[0].opts.onActivity({
    kind: 'reasoning',
    status: 'running',
    description: 'SECRET raw reasoning',
  });
  const call = async (name, input = {}) =>
    JSON.parse((await tools.find((t) => t.name === name).execute(input, {})).content);
  assert.equal((await call(names[0])).runs[0].runId, r.runId);
  assert.equal((await call(names[1], { runId: r.runId })).status, 'running');
  assert.ok(!JSON.stringify(await call(names[2], { runId: r.runId })).includes('SECRET'));
  assert.equal((await call(names[3], { runId: r.runId })).complete, false);
  const cancel = tools.find((t) => t.name === names[4]),
    ctx = {
      signal: new AbortController().signal,
      sessionID: 'test',
      agent: 'test',
      messageID: 'test',
      id: 'test',
    };
  await assert.rejects(cancel.execute({ runId: r.runId }, ctx), /Denied/);
  assert.equal(c.calls[0].opts.signal.aborted, false);
  allowed = true;
  await cancel.execute({ runId: r.runId }, ctx);
  assert.equal(c.calls[0].opts.signal.aborted, true);
  assert.equal(checks, 2);
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
    r = await s.start({ planId: d.plan.id, approveOpenAIInference: true });
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
  const runA = await firstSession.start({ planId: override.plan.id, approveOpenAIInference: true });
  const runB = await secondSession.start({
    planId: ordinary.plan.id,
    approveOpenAIInference: true,
  });
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
