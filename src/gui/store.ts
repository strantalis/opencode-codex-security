import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { asState, type ScanState } from '../types';
import type { ScanInputs } from '../core/scan-plan';
import type { SecurityOperationInputs, SecurityOperationState } from '../core/security-operations';
import { userError } from '../scan-display';

export interface SecurityPort {
  list(): Promise<unknown>;
  prepare(input: ScanInputs): Promise<unknown>;
  start(input: { planId: string }): Promise<unknown>;
  cancel(input: { runId: string }): Promise<unknown>;
  /**
   * Calls `listener` when the server reports a scan (`changed`) or operation (`operationChanged`)
   * update for this workspace. Returns an unsubscribe function.
   */
  subscribe?(listener: (event: 'changed' | 'operationChanged') => void): () => void;
}
export interface OperationPort {
  capabilities?: { policy: boolean; validation: boolean; fix?: boolean };
  list(): Promise<unknown>;
  prepare(input: SecurityOperationInputs): Promise<unknown>;
  start(input: { operationId: string }): Promise<unknown>;
  answer(input: { operationId: string; questionId: string; answer: string }): Promise<unknown>;
  cancel(input: { operationId: string }): Promise<unknown>;
  /** Apply a proposed fix to the working tree, or discard it. */
  resolve(input: { operationId: string; action: 'apply' | 'discard' }): Promise<unknown>;
}
export interface Catalog {
  engine?: string;
  runs: ScanState[];
  drafts: ScanState[];
  preview?: ScanState;
  maxConcurrent: number;
  historyError?: string;
}

function readCatalog(value: unknown): Catalog {
  if (!value || typeof value !== 'object' || !('runs' in value) || !Array.isArray(value.runs))
    throw new Error('Could not read scan history. Update the server plugin and reopen Security.');
  const catalog = value as Catalog;
  return {
    ...catalog,
    runs: catalog.runs.map(asState),
    drafts: (catalog.drafts ?? []).map(asState),
    maxConcurrent: catalog.maxConcurrent ?? 2,
  };
}
function readOperations(value: unknown): SecurityOperationState[] {
  const list = Array.isArray(value)
    ? value
    : (value as { operations?: SecurityOperationState[] } | null)?.operations;
  if (!Array.isArray(list)) throw new Error('Could not read policy and validation operations.');
  return list as SecurityOperationState[];
}

/**
 * Serialises fetches: a request made while one is in flight runs once after it finishes, so the
 * last applied result always started after the last change notification.
 */
function coalesced(task: () => Promise<void>) {
  let running: Promise<void> | undefined;
  let again = false;
  return function request(): Promise<void> {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          again = false;
          await task();
        } while (again);
      } finally {
        running = undefined;
      }
    })();
    return running;
  };
}

/** One owner for scan and operation state: an initial fetch, server events, and a slow fallback. */
export function createSecurityStore(props: {
  port: SecurityPort;
  operations?: OperationPort;
  fallbackMs?: number;
}) {
  const [catalog, setCatalog] = createStore<Catalog>({ runs: [], drafts: [], maxConcurrent: 2 });
  const [ops, setOps] = createStore<{ list: SecurityOperationState[] }>({ list: [] });
  const [loaded, setLoaded] = createSignal(false);
  const [connectionError, setConnectionError] = createSignal('');
  const [now, setNow] = createSignal(Date.now());
  let stopped = false;

  const refreshScans = coalesced(async () => {
    try {
      const next = readCatalog(await props.port.list());
      if (stopped) return;
      setCatalog(reconcile(next, { key: 'runId', merge: true }));
      setNow(Date.now());
      setConnectionError('');
      setLoaded(true);
    } catch (error) {
      if (!stopped) setConnectionError(userError(error));
    }
  });
  const refreshOperations = coalesced(async () => {
    if (!props.operations) return;
    try {
      const next = readOperations(await props.operations.list());
      if (!stopped) setOps('list', reconcile(next, { key: 'operationId', merge: true }));
    } catch {
      /* Operation errors surface on the action that caused them; scans stay usable. */
    }
  });
  const refresh = () => Promise.all([refreshScans(), refreshOperations()]).then(() => {});

  const unsubscribe = props.port.subscribe?.(
    (event) => void (event === 'changed' ? refreshScans() : refreshOperations()),
  );
  void refresh();
  const fallback = setInterval(() => void refresh(), props.fallbackMs ?? 30_000);

  const running = createMemo(() => catalog.runs.filter((run) => run.status === 'running').length);
  const operationsActive = createMemo(() =>
    ops.list.some((op) => op.status === 'running' || op.status === 'awaiting_answers'),
  );
  // The elapsed-time label is the only thing that changes without a server update.
  createEffect(() => {
    if (!running() && !operationsActive()) return;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => clearInterval(tick));
  });
  onCleanup(() => {
    stopped = true;
    clearInterval(fallback);
    unsubscribe?.();
  });

  return {
    catalog,
    operations: () => ops.list,
    loaded,
    connectionError,
    now,
    running,
    refresh,
    refreshScans,
    refreshOperations,
  };
}
export type SecurityStore = ReturnType<typeof createSecurityStore>;
