/** @jsxImportSource @opentui/solid */
// Actual plugin renderer with an in-memory RPC client. No OpenCode service,
// account, credential, repository read, or model call is used by this harness.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { testRender } from '@opentui/solid';
import { createSignal, getOwner, onCleanup, Show, type JSX } from 'solid-js';
import plugin from '../src/tui';
import type { ScanInputs, ScanPlan } from '../src/core/scan-plan';
import type { SecurityOperationState } from '../src/core/security-operations';
import { emptyState, type Finding, type ScanState } from '../src/types';

const finding = (n: number, severity: Finding['severity'] = 'medium'): Finding => ({
  id: `finding-${n}`,
  title: n === 1 ? 'Missing tenant check' : `Synthetic finding ${n}`,
  severity: n === 1 ? 'high' : severity,
  path: `src/module-${n}.ts`,
  line: 10 + n,
  cwe: 'CWE-862',
  summary: `Summary for finding ${n}.`,
  evidence: `Evidence for finding ${n}.`,
  remediation: `Remediation for finding ${n}.`,
  confidence: 'high',
});
const live: ScanState = {
  ...emptyState(),
  runId: 'synthetic-live',
  engine: 'codex-security',
  repository: '/synthetic/shop-api',
  status: 'running',
  phase: 'discovery',
  mode: 'standard',
  startedAt: new Date(Date.now() - 65_000).toISOString(),
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
  revision: 1,
};
const complete: ScanState = {
  ...emptyState(),
  runId: 'synthetic-complete',
  engine: 'codex-security',
  repository: '/synthetic/payments-api',
  status: 'completed',
  phase: 'reporting',
  mode: 'standard',
  findings: Array.from({ length: 12 }, (_, i) => finding(i + 1)),
  revision: 1,
};
const runs = [live, complete];
const settings = {
  codex: {
    provider: 'openai',
    model: 'synthetic-model',
    reasoningEffort: 'high',
    daybreak: false,
    auth: 'ChatGPT sign-in',
  },
  scan: { mode: 'standard' },
};
const policyOp: SecurityOperationState = {
  operationId: 'op-policy',
  kind: 'policy',
  repository: '/synthetic/shop-api',
  status: 'awaiting_answers',
  phase: 'Drafting policy',
  plan: { path: 'src/api', settings, contextFiles: [], mock: true } as never,
  question: { id: 'q1', questions: ['Who may read invoices?'], createdAt: '' },
  answeredQuestionCount: 0,
  result: null,
  error: null,
  createdAt: '',
  startedAt: null,
  finishedAt: null,
  revision: 1,
};
const operations: SecurityOperationState[] = [policyOp];

// Record every call and every interval, to prove nothing runs before /security.
const calls: string[] = [];
const intervals = new Set<unknown>();
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
globalThis.setInterval = ((fn: () => void, ms?: number) => {
  const handle = realSetInterval(fn, ms);
  intervals.add(handle);
  return handle;
}) as typeof setInterval;
globalThis.clearInterval = ((handle: ReturnType<typeof setInterval>) => {
  intervals.delete(handle);
  realClearInterval(handle);
}) as typeof clearInterval;

const prepared: ScanInputs[] = [];
const started: unknown[] = [];
const cancelled: string[] = [];
const opCalls: Array<[string, unknown]> = [];
const handlers = new Map<string, Set<(event: { data: unknown }) => void>>();
const emit = (name: string, data: unknown) => handlers.get(name)?.forEach((h) => h({ data }));
const rpc = {
  list: async () => {
    calls.push('list');
    return structuredClone({ runs, drafts: [], maxConcurrent: 2, engine: 'codex-security' });
  },
  prepare: async (input: ScanInputs) => {
    calls.push('prepare');
    prepared.push(structuredClone(input));
    if (input.repository?.includes('missing')) throw { message: 'Repository not found.' };
    return {
      ...emptyState(),
      plan: {
        id: 'plan-' + prepared.length,
        repository: input.repository,
        scopePaths: input.scopePaths ?? [],
        scanPrompt: input.scanPrompt ?? '',
        contextFiles: (input.contextFiles ?? []).map((path) => ({ path })),
        inputs: structuredClone(input),
        settings: { ...settings, scan: { mode: input.mode ?? 'standard' } },
        globalConfigFile: '/synthetic/config.json',
        mock: false,
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      } as unknown as ScanPlan,
    };
  },
  start: async (input: unknown) => {
    calls.push('start');
    started.push(input);
    return { ...live, runId: 'synthetic-live' };
  },
  cancel: async ({ runId }: { runId: string }) => {
    cancelled.push(runId);
    return {};
  },
  setup: async () => ({
    route: {
      provider: 'openai',
      model: 'gpt-test',
      reasoningEffort: 'high',
      daybreak: false,
      auth: 'Codex Security sign-in',
    },
    configFile: '/synthetic/codex-security.json',
    codexConfigFile: '/synthetic/config.toml',
    profiles: [],
    runtime: { node: 'v24.0.0', python: '3.12.0' },
  }),
  capabilities: async () => {
    calls.push('capabilities');
    return { policy: true, validation: true, questionAnswers: true };
  },
  operationList: async () => {
    calls.push('operationList');
    return { operations: structuredClone(operations) };
  },
  operationPrepare: async (input: { kind: string; finding?: string }) => {
    opCalls.push(['prepare', input]);
    const op: SecurityOperationState = {
      ...policyOp,
      operationId: 'op-validate',
      kind: 'validation',
      status: 'prepared',
      question: null,
      plan: {
        settings,
        contextFiles: [],
        mock: true,
        finding: input.finding,
        source: (input as { source?: unknown }).source,
        costNotice: 'No cost limit.',
      } as never,
    };
    operations.push(op);
    return op;
  },
  operationStart: async (input: unknown) => {
    opCalls.push(['start', input]);
    operations[1] = { ...operations[1], status: 'running', revision: 2 };
    return operations[1];
  },
  operationAnswer: async (input: unknown) => {
    opCalls.push(['answer', input]);
    return {};
  },
  operationResolve: async (input: unknown) => {
    opCalls.push(['resolve', input]);
    return {};
  },
  operationCancel: async (input: unknown) => {
    opCalls.push(['cancel', input]);
    return {};
  },
  events: {
    on: (name: string, handler: (event: { data: unknown }) => void) => {
      const set = handlers.get(name) ?? new Set();
      set.add(handler);
      handlers.set(name, set);
      return () => set.delete(handler);
    },
  },
};

type Layer = {
  mode?: string;
  priority?: number;
  enabled?: boolean | (() => boolean);
  commands?: Array<{
    id?: string;
    bind?: string | false;
    enabled?: boolean | (() => boolean);
    run: () => unknown;
  }>;
};
const layers = new Set<() => Layer>();
const on = (value: boolean | (() => boolean) | undefined) =>
  value === undefined ? true : typeof value === 'function' ? value() : value;

// A dialog stack that, like the host, replaces the open dialog on show().
type Dialog = { render: () => JSX.Element; onClose?: () => void };
const [dialog, setDialog] = createSignal<Dialog>();
const closeDialog = () => {
  const open = dialog();
  setDialog(undefined);
  open?.onClose?.();
};
const replies: Array<string | boolean | undefined> = [];
const reply = <T,>() => {
  closeDialog();
  return replies.shift() as T;
};
const toasts: string[] = [];
const [route, setRoute] = createSignal<{ type: string; name?: string }>({ type: 'session' });
let page: undefined | (() => JSX.Element);
const context = {
  location: { directory: '/synthetic' },
  renderer: { height: 24, width: 80 },
  client: { rpc: () => rpc },
  theme: undefined,
  keymap: {
    layer: (factory: () => Layer) => {
      layers.add(factory);
      if (getOwner()) onCleanup(() => layers.delete(factory));
    },
    mode: { current: () => (dialog() ? 'modal' : 'base') },
  },
  ui: {
    toast: { show: ({ message }: { message: string }) => toasts.push(message) },
    router: {
      register: ({ render }: { render: () => JSX.Element }) => {
        page = render;
        return () => {};
      },
      current: () => route(),
      navigate: (to: { type: string; name?: string }) => setRoute(to),
    },
    dialog: {
      show: (render: Dialog['render'], onClose?: () => void) => {
        closeDialog();
        setDialog({ render, onClose });
      },
      set: () => {},
      clear: closeDialog,
      select: async () => reply(),
      prompt: async () => reply(),
      confirm: async () => reply(),
      alert: async () => reply(),
    },
  },
};

let cleanup: undefined | (() => void);
const app = await testRender(
  () => {
    cleanup = plugin.setup(context as never) as () => void;
    return (
      <box width="100%" height="100%">
        <Show when={route().name === 'security'}>{page!()}</Show>
        <Show when={dialog()}>
          {(open) => (
            <box
              position="absolute"
              top={1}
              left={2}
              right={2}
              bottom={1}
              backgroundColor="#101010"
              border
              zIndex={10}
            >
              {open().render()}
            </box>
          )}
        </Show>
      </box>
    );
  },
  { width: 80, height: 24 },
);
const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await app.flush();
  }
};
const frame = async () => {
  await settle();
  return app.captureCharFrame();
};
/** Dispatch a key the way the host does: active mode, enabled layer and command, highest priority. */
const press = async (key: string) => {
  const mode = context.keymap.mode.current();
  const match = [...layers]
    .map((factory) => factory())
    .filter((layer) => (layer.mode ?? 'base') === mode || layer.mode === 'global')
    .filter((layer) => on(layer.enabled))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .flatMap((layer) => layer.commands ?? [])
    .find((cmd) => cmd.bind && cmd.bind.split(',').includes(key) && on(cmd.enabled));
  if (!match && key === 'escape' && dialog()) closeDialog();
  else if (match) void match.run();
  await settle();
  return !!match;
};
const slash = async (id: string) => {
  const cmd = [...layers].flatMap((f) => f().commands ?? []).find((c) => c.id === id);
  assert.ok(cmd, `${id} is registered`);
  void cmd.run();
  await settle();
};

try {
  // Nothing runs before the route opens.
  await settle();
  assert.equal(intervals.size, 0, 'no timers before /security');
  assert.deepEqual(calls, [], 'no RPC calls before /security');
  const slashIds = [...layers].flatMap((f) => f().commands ?? []).map((c) => c.id);
  assert.deepEqual(slashIds, [
    'security.open',
    'security.scan',
    'security.policy',
    'security.validate',
  ]);
  assert.equal(await press('n'), false, 'view keys are inactive off the Security route');

  await slash('security.open');
  const main = await frame();
  assert.ok(calls.includes('list') && calls.includes('operationList'), 'one initial fetch');
  assert.equal(intervals.size, 2, 'fallback poll and elapsed ticker while open');
  assert.match(main, /Scans 2/);
  assert.match(main, /1 question waiting/);
  assert.match(main, /Reviewing source · 1m \d+s · 8 of 20 files/);
  assert.match(main, /Partial estimate USD 0.24/);
  assert.match(main, /h all keys/);
  assert.doesNotMatch(main, /\/security-|History workspace|does not guarantee/);

  // Events update the view without a fetch.
  const before = calls.length;
  emit('changed', { ...live, progress: { done: 15, total: 20, unit: 'files' }, revision: 2 });
  assert.match(await frame(), /15 of 20 files/);
  assert.equal(calls.length, before, 'known-run events apply without refetching');

  // Move to the completed scan and walk all 12 findings.
  await press('j');
  let view = await frame();
  assert.match(view, /Scan complete/);
  assert.match(view, /Findings 1 high · 11 medium/);
  await press('return');
  for (let i = 0; i < 11; i++) await press('down');
  view = await frame();
  assert.match(view, /› HIGH|›\s+MEDIUM/);
  assert.match(view, /Synthetic finding 12/, 'last finding scrolled into view');
  await press('return');
  const detail = await frame();
  assert.match(detail, /Synthetic finding 12/);
  assert.match(detail, /src\/module-12\.ts:22 · CWE-862 · high confidence/);
  assert.match(detail, /Remediation/);
  assert.match(detail, /v validate/);

  // Validate from the finding detail: the result stays with the finding.
  replies.push(true);
  await press('v');
  assert.deepEqual(opCalls[0][0], 'prepare');
  const asked = opCalls[0][1] as { finding: string; source: unknown };
  assert.match(String(asked.finding), /Synthetic finding 12/);
  assert.deepEqual(asked.source, { runId: 'synthetic-complete', findingId: 'finding-12' });
  assert.deepEqual(opCalls[1], ['start', { operationId: 'op-validate' }]);
  view = await frame();
  assert.match(view, /Synthetic finding 12/, 'still on the finding');
  assert.match(view, /Operations 2/);
  await press('escape');
  await press('escape');
  await press('tab');

  // Operations: move, open, answer, cancel.
  await press('k');
  view = await frame();
  assert.match(view, /Policy draft · Awaiting answers/);
  await press('return');
  view = await frame();
  assert.match(view, /Who may read invoices\?/);
  replies.push('Only the owning tenant.');
  await press('a');
  assert.deepEqual(opCalls.at(-1), [
    'answer',
    { operationId: 'op-policy', questionId: 'q1', answer: 'Only the owning tenant.' },
  ]);
  await press('c');
  assert.deepEqual(opCalls.at(-1), ['cancel', { operationId: 'op-policy' }]);
  await press('escape');
  await press('tab');
  assert.match(await frame(), /Scans 2/);

  // Review dialog: depth cycles in place, target and scope re-prepare.
  await press('n');
  let review = await frame();
  assert.match(review, /Review this scan/);
  assert.match(review, /Whole repository/);
  assert.match(review, /standard \(default\)/);
  assert.deepEqual(prepared.at(-1), { repository: '/synthetic' });
  assert.equal(await press('n'), false, 'view keys are inactive behind the dialog');
  await press('d');
  await press('d');
  review = await frame();
  assert.match(review, /Depth\s+deep/);
  assert.deepEqual(prepared.at(-1), { repository: '/synthetic', mode: 'deep' });
  replies.push('paths');
  replies.push('src/api, src/auth');
  await press('s');
  assert.deepEqual(prepared.at(-1), {
    repository: '/synthetic',
    mode: 'deep',
    scopePaths: ['src/api', 'src/auth'],
  });
  replies.push('/synthetic/other');
  await press('t');
  review = await frame();
  assert.deepEqual(prepared.at(-1), { repository: '/synthetic/other', mode: 'deep' });
  assert.match(review, /\/synthetic\/other/);
  replies.push('relative/path');
  const count = prepared.length;
  await press('t');
  review = await frame();
  assert.equal(prepared.length, count, 'relative target never reaches prepare');
  assert.match(review, /Use an absolute repository path/);
  replies.push('/synthetic/missing');
  await press('t');
  review = await frame();
  assert.match(review, /Repository not found/);
  assert.match(review, /\/synthetic\/other/, 'failed prepare keeps the last good preview');
  await press('y');
  assert.deepEqual(started.at(-1), {
    planId: `plan-${prepared.length - 1}`,
  });
  assert.equal(dialog(), undefined);

  // Back out of the review without starting.
  await press('n');
  const startedCount = started.length;
  await press('escape');
  assert.equal(started.length, startedCount, 'esc in the review starts nothing');

  // Cancel the running scan.
  replies.push(true);
  await press('c');
  assert.deepEqual(cancelled, ['synthetic-live']);

  // Escape returns to the route the user came from.
  await press('escape');
  assert.deepEqual(route(), { type: 'session' });
  await settle();
  assert.equal(intervals.size, 0, 'timers stop when the route closes');
  const fetches = calls.length;
  emit('changed', { ...live, revision: 9 });
  await settle();
  assert.equal(calls.length, fetches, 'no fetches from events after the route closes');
  emit('operationChanged', { ...policyOp, question: { id: 'q2', questions: ['x'] } });
  assert.equal(toasts.length, 1, 'question toast while the view is closed');

  // Narrow terminal still reads.
  await slash('security.open');
  await press('j');
  await press('return');
  await press('return');
  const findingDetail = await frame();
  await mkdir('evidence/run-details', { recursive: true });
  await writeFile('evidence/run-details/isolated-tui-main.txt', main);
  await writeFile('evidence/run-details/isolated-tui-review.txt', review);
  await writeFile('evidence/run-details/isolated-tui-finding.txt', findingDetail);
  console.log(
    'Actual TUI renderer smoke passed (80x24, synthetic RPC): no timers or RPC before /security, events update without refetch, all 12 findings reachable, finding detail, validate from finding, operations answer/cancel, review depth/scope/target re-prepare with error handling, start, esc returns to origin and stops timers, question toast.',
  );
} finally {
  cleanup?.();
  await app.dispose();
}
