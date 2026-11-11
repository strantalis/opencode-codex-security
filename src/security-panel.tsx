import { createMemo, createSignal, Show } from 'solid-js';
import type { ScanPlan } from './core/scan-plan';
import { latestAvailableDraft } from './plan-view';
import { projectName } from './scan-display';
import { createSecurityStore, type OperationPort, type SecurityPort } from './gui/store';
import { Operations } from './gui/Operations';
import { RunDetail } from './gui/RunDetail';
import { RunList } from './gui/RunList';
import { ScanComposer } from './gui/ScanComposer';
import { SetupCard, type SetupPort } from './gui/SetupCard';
import { securityStyles } from './security-styles';

export type { OperationPort, SecurityPort } from './gui/store';
export type { SetupInfo, SetupPort } from './gui/SetupCard';

const blankComposer: { plan?: ScanPlan } = {};

/** The Desktop panel: layout and routing. State lives in the store; each area is a component. */
export function SecurityPanel(props: {
  directory: string;
  port: SecurityPort;
  operations?: OperationPort;
  setup?: SetupPort;
  /** Fallback refresh interval when events are missed. Defaults to 30 seconds. */
  fallbackMs?: number;
}) {
  const store = createSecurityStore({
    port: props.port,
    operations: props.operations,
    fallbackMs: props.fallbackMs,
  });
  const [view, setView] = createSignal<'scans' | 'operations'>('scans');
  const [selectedId, selectRun] = createSignal<string>();
  const [composer, setComposer] = createSignal<{ plan?: ScanPlan }>();

  const runs = () => store.catalog.runs;
  const current = createMemo(() => runs().find((run) => run.runId === selectedId()) ?? runs()[0]);
  const draft = createMemo(() => latestAvailableDraft(store.catalog, store.now())?.plan);
  const openComposer = () =>
    composer() ?? (store.loaded() && !runs().length ? blankComposer : undefined);
  const capabilities = () => props.operations?.capabilities;
  const showOperations = () => !!props.operations && store.loaded();
  const validation = () =>
    props.operations && (capabilities()?.validation ?? true) ? props.operations : undefined;
  const waiting = () => store.operations().filter((op) => op.status === 'awaiting_answers').length;

  return (
    <section class="gill-security" aria-label="Security">
      <style>{securityStyles}</style>
      <div class="gs-body">
        <header class="gs-header">
          <div>
            <h2>Security</h2>
            <p class="gs-muted" title={props.directory}>
              {projectName(props.directory)}
              {store.running() ? ` · ${store.running()} running` : ''}
            </p>
          </div>
          <Show when={view() === 'scans' && !openComposer()}>
            <button class="gs-button gs-primary" onClick={() => setComposer({})}>
              New scan
            </button>
          </Show>
        </header>

        <Show when={props.setup}>
          {(setup) => <SetupCard setup={setup()} onChange={() => void store.refresh()} />}
        </Show>

        <Show when={showOperations()}>
          <nav class="gs-tabs" aria-label="Security views">
            <button
              aria-current={view() === 'scans' ? 'page' : undefined}
              onClick={() => setView('scans')}
            >
              Scans
            </button>
            <button
              aria-current={view() === 'operations' ? 'page' : undefined}
              onClick={() => setView('operations')}
            >
              Policy and validation
              <Show when={waiting()}>
                <span class="gs-badge">{waiting()}</span>
              </Show>
            </button>
          </nav>
        </Show>

        <Show when={store.connectionError()}>
          <p class="gs-alert" role="alert">
            {store.connectionError()}{' '}
            <button class="gs-link" onClick={() => void store.refresh()}>
              Retry
            </button>
          </p>
        </Show>

        <Show when={view() === 'operations' && props.operations}>
          {(port) => (
            <Operations
              directory={props.directory}
              port={port()}
              store={store}
              policy={capabilities()?.policy ?? true}
            />
          )}
        </Show>

        <Show when={view() === 'scans'}>
          <Show when={waiting() && showOperations()}>
            <div class="gs-banner">
              <span>A policy draft is waiting for your answers.</span>
              <button class="gs-button" onClick={() => setView('operations')}>
                Answer
              </button>
            </div>
          </Show>
          <Show when={store.catalog.historyError}>
            <p class="gs-alert" role="alert">
              {store.catalog.historyError}
            </p>
          </Show>
          <Show when={!openComposer() && draft()}>
            {(plan) => (
              <div class="gs-banner">
                <span class="gs-wrap">A prepared scan is ready: {plan().repository}</span>
                <button class="gs-button" onClick={() => setComposer({ plan: plan() })}>
                  Review
                </button>
              </div>
            )}
          </Show>
          <Show when={openComposer()} keyed>
            {(state) => (
              <ScanComposer
                directory={props.directory}
                port={props.port}
                store={store}
                plan={state.plan}
                onClose={runs().length ? () => setComposer(undefined) : undefined}
                onStarted={(runId) => {
                  selectRun(runId);
                  setComposer(undefined);
                }}
              />
            )}
          </Show>
          <Show when={runs().length}>
            <RunList runs={runs()} selectedId={current()?.runId} onSelect={selectRun} />
          </Show>
          <Show when={current()?.runId} keyed>
            {(runId) => (
              <Show when={current()?.runId === runId ? current() : undefined}>
                {(run) => (
                  <RunDetail
                    run={run()}
                    port={props.port}
                    store={store}
                    validation={validation()}
                  />
                )}
              </Show>
            )}
          </Show>
        </Show>
      </div>
    </section>
  );
}
