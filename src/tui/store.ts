import type { Plugin } from '@opencode/plugin/tui';
import { createSignal } from 'solid-js';
import { Security } from '../rpc';
import type { ScanList, ScanState } from '../types';
import type { SecurityOperationState } from '../core/security-operations';
import { userError } from '../scan-display';

export const FALLBACK_POLL_MS = 30_000;

export interface Capabilities {
  policy: boolean;
  validation: boolean;
  fix: boolean;
}

/** Shared data for the Security route and its commands. Nothing here polls on its own. */
export function createStore(ctx: Plugin.Context) {
  const client = ctx.client.rpc(Security);
  const location = ctx.location ?? ctx.data.location.default();
  const [catalog, setCatalog] = createSignal<ScanList>();
  const [operations, setOperations] = createSignal<SecurityOperationState[]>([]);
  const [capabilities, setCapabilities] = createSignal<Capabilities>({
    policy: false,
    validation: false,
    fix: false,
  });
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  let disposed = false;
  let capabilityLoad: Promise<void> | undefined;

  const loadCapabilities = () =>
    (capabilityLoad ??= client
      .capabilities({}, { location })
      .then((value) => {
        const caps = value as Partial<Capabilities>;
        if (!disposed)
          setCapabilities({
            policy: !!caps.policy,
            validation: !!caps.validation,
            fix: !!caps.fix,
          });
      })
      .catch(() => {
        capabilityLoad = undefined;
      }));

  /** Coalesce overlapping refreshes into at most one follow-up request. */
  const coalesced = (load: () => Promise<void>) => {
    let running: Promise<void> | undefined;
    let again = false;
    const run = async (): Promise<void> => {
      if (running) {
        again = true;
        return running;
      }
      running = (async () => {
        do {
          again = false;
          try {
            await load();
          } catch (e) {
            if (!disposed) setError(userError(e));
          }
        } while (again && !disposed);
      })();
      try {
        await running;
      } finally {
        running = undefined;
      }
    };
    return run;
  };

  const refreshScans = coalesced(async () => {
    const next = (await client.list({}, { location })) as unknown as ScanList;
    if (!disposed) setCatalog(next);
  });
  const refreshOperations = coalesced(async () => {
    await loadCapabilities();
    const caps = capabilities();
    if (!caps.policy && !caps.validation) return;
    const result = (await client.operationList({}, { location })) as unknown as {
      operations: SecurityOperationState[];
    };
    if (!disposed) setOperations(result.operations);
  });

  /** Apply a pushed scan state; unknown runs trigger one list fetch. */
  const applyScan = (data: ScanState) => {
    const id = data.runId ?? data.scanId ?? undefined;
    const list = catalog();
    const index = list?.runs.findIndex((run) => run.runId === id) ?? -1;
    if (!list || !id || index < 0) return void refreshScans();
    if ((data.revision ?? 0) < (list.runs[index].revision ?? 0)) return;
    const runs = [...list.runs];
    runs[index] = { ...data, runId: id };
    setCatalog({ ...list, runs });
  };
  const applyOperation = (data: SecurityOperationState) => {
    const list = operations();
    const index = list.findIndex((op) => op.operationId === data.operationId);
    if (index < 0) return void refreshOperations();
    if (data.revision < list[index].revision) return;
    const next = [...list];
    next[index] = data;
    setOperations(next);
  };

  /**
   * Live updates while the Security route is mounted: one fetch, the server's
   * `changed`/`operationChanged` events, and a slow fallback poll in case the
   * event stream drops. Returns the cleanup.
   */
  const watch = () => {
    void refreshScans();
    void refreshOperations();
    const stopScans = client.events.on('changed', (event) => applyScan(event.data as never));
    const stopOperations = client.events.on('operationChanged', (event) =>
      applyOperation(event.data as never),
    );
    const timer = setInterval(() => {
      void refreshScans();
      void refreshOperations();
    }, FALLBACK_POLL_MS);
    return () => {
      stopScans();
      stopOperations();
      clearInterval(timer);
    };
  };

  /** Run one user action at a time and surface its error in the view. */
  const perform = async (action: () => Promise<unknown>) => {
    if (disposed || busy()) return;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      if (!disposed) setError(userError(e));
    } finally {
      if (!disposed) setBusy(false);
    }
  };

  return {
    client,
    location,
    catalog,
    runs: () => catalog()?.runs ?? [],
    operations,
    capabilities,
    loadCapabilities,
    error,
    setError,
    busy,
    perform,
    refreshScans,
    refreshOperations,
    watch,
    dispose: () => {
      disposed = true;
    },
    isDisposed: () => disposed,
  };
}

export type Store = ReturnType<typeof createStore>;
