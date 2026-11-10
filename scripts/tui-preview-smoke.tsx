/** @jsxImportSource @opentui/solid */
// Actual plugin renderer with an in-memory RPC client. No OpenCode service,
// account, credential, repository read, or model call is used by this harness.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { testRender } from '@opentui/solid';
import plugin from '../src/tui';
import { emptyState, type ScanState } from '../src/types';

const live: ScanState = {
  ...emptyState(),
  runId: 'synthetic-live',
  engine: 'codex-security',
  repository: '/synthetic/shop-api',
  status: 'running',
  phase: 'discovery',
  mode: 'standard',
  model: 'synthetic-model',
  progress: { done: 8, total: 20, unit: 'files' },
  telemetry: {
    activity: [],
    observedWorkers: [1, 2],
    measurement: {
      coverage: 'partial',
      observedAt: '2026-11-10T00:00:00Z',
      missingThreadCount: 1,
      cost: { baselineUsd: 0.24, range: { min: 0.24, max: null } },
    },
  },
};
const complete: ScanState = {
  ...emptyState(),
  runId: 'synthetic-complete',
  engine: 'codex-security',
  repository: '/synthetic/payments-api',
  status: 'completed',
  phase: 'reporting',
  mode: 'standard',
  findings: [
    {
      id: 'finding-1',
      title: 'Missing tenant check',
      severity: 'high',
      path: 'src/payments.ts',
      line: 12,
      cwe: 'CWE-862',
      summary: 'Synthetic finding for a renderer test.',
      evidence: 'Synthetic only.',
      remediation: 'Check tenant ownership.',
      confidence: 'high',
    },
  ],
};
const runs = [live, complete];
const layers: Array<() => { commands?: Array<{ id?: string; run: () => unknown }> }> = [];
let nextSelection = complete.runId;
let cleanup: undefined | (() => void);
let view: undefined | (() => unknown);
const cancelled: string[] = [];
const rpc = {
  list: async () => ({ runs, drafts: [], maxConcurrent: 2, engine: 'codex-security' }),
  capabilities: async () => ({ policy: false, validation: false, questionAnswers: false }),
  cancel: async ({ runId }: { runId: string }) => {
    cancelled.push(runId);
  },
};
const context = {
  location: { directory: '/synthetic' },
  renderer: { height: 24 },
  client: { rpc: () => rpc },
  keymap: {
    layer: (factory: (typeof layers)[number]) => {
      layers.push(factory);
    },
  },
  ui: {
    router: {
      register: ({ render }: { render: () => unknown }) => {
        view = render;
        return () => {};
      },
      current: () => ({ type: 'plugin', name: 'security' }),
      navigate: () => {},
    },
    dialog: { select: async () => nextSelection, alert: async () => {} },
  },
};
const app = await testRender(
  () => {
    cleanup = plugin.setup(context as never) as () => void;
    assert.ok(view);
    return view() as never;
  },
  { width: 80, height: 24 },
);
const command = async (id: string) => {
  const entry = layers.flatMap((layer) => layer().commands ?? []).find((item) => item.id === id);
  assert.ok(entry, `Plugin command ${id} is registered`);
  await entry.run();
  await app.flush();
};
const frame = async () => {
  await app.flush();
  return app.captureCharFrame();
};
try {
  const active = await frame();
  assert.match(active, /Reviewing source/);
  assert.match(active, /8 of 20 files/);
  assert.match(active, /Partial estimate USD 0.24/);
  assert.doesNotMatch(active, /RECENT SCANS|SCAN DETAILS|Repository matching|synthetic-live/);
  await command('security.details');
  app.resize(100, 70);
  const expanded = await frame();
  assert.match(expanded, /SCAN DETAILS/);
  assert.match(expanded, /synthetic-live/);
  assert.match(expanded, /missing/);
  await command('security.details');
  assert.doesNotMatch(await frame(), /SCAN DETAILS/);
  await command('security.details');
  app.resize(80, 24);
  await command('security.runs');
  const result = await frame();
  assert.match(result, /Scan complete/);
  assert.match(result, /Missing tenant check/);
  assert.doesNotMatch(result, /RECENT SCANS|SCAN DETAILS|Repository matching/);
  nextSelection = live.runId;
  await command('security.runs');
  await command('security.cancel');
  assert.deepEqual(cancelled, ['synthetic-live']);
  await mkdir('evidence/run-details', { recursive: true });
  await writeFile('evidence/run-details/isolated-tui-live.txt', active);
  await writeFile('evidence/run-details/isolated-tui-results.txt', result);
  console.log(
    'Actual TUI renderer smoke passed: 80x24 stage/progress/findings, repeated detail toggles, disclosure reset on selection, exact-run cancellation. Synthetic RPC only.',
  );
} finally {
  cleanup?.();
  await app.dispose();
}
