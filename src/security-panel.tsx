import { createEffect, createMemo, createSignal, Show } from 'solid-js';
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

type Composer = { plan?: ScanPlan; edit?: boolean };
const blankComposer: Composer = {};

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
  // A policy belongs to one repository: the selected scan's, else the workspace.
  const [drafting, setDrafting] = createSignal<string>();
  const draftPolicy = (repository: string) => {
    setDrafting(repository);
    queueMicrotask(showOther);
  };
  let other: HTMLDetailsElement | undefined;
  const [selectedId, selectRun] = createSignal<string>();
  const [composer, setComposer] = createSignal<Composer>();

  const runs = () => store.catalog.runs;
  const current = createMemo(() => runs().find((run) => run.runId === selectedId()) ?? runs()[0]);
  const draft = createMemo(() => latestAvailableDraft(store.catalog, store.now())?.plan);
  const openComposer = () =>
    composer() ?? (store.loaded() && !runs().length ? blankComposer : undefined);
  const capabilities = () => props.operations?.capabilities;
  const showOperations = () => !!props.operations && store.loaded();
  const canDraft = () => showOperations() && (capabilities()?.policy ?? true);
  // Validations and fixes started from a finding are shown on that finding.
  const unattached = createMemo(() => store.operations().filter((op) => !op.plan.source));
  const attention = () =>
    !!drafting() ||
    unattached().some((op) => ['prepared', 'running', 'awaiting_answers'].includes(op.status));
  const showOther = () => {
    if (!other) return;
    other.open = true;
    other.scrollIntoView({ block: 'nearest' });
  };
  // Open on its own only when something there needs the user; otherwise it stays as they left it.
  createEffect(() => {
    if (attention() && other) other.open = true;
  });
  const validation = () =>
    props.operations && (capabilities()?.validation ?? true) ? props.operations : undefined;
  const waiting = () => store.operations().filter((op) => op.status === 'awaiting_answers').length;

  return (
    <section class="codex-security" aria-label="Security">
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
          <div class="gs-header-actions">
            <Show when={canDraft() && !runs().length}>
              <button class="gs-button" onClick={() => draftPolicy(props.directory)}>
                Draft policy
              </button>
            </Show>
            <Show when={!openComposer()}>
              <button class="gs-button gs-primary" onClick={() => setComposer({})}>
                New scan
              </button>
            </Show>
          </div>
        </header>

        <Show when={props.setup}>
          {(setup) => <SetupCard setup={setup()} onChange={() => void store.refresh()} />}
        </Show>

        <Show when={store.connectionError()}>
          <p class="gs-alert" role="alert">
            {store.connectionError()}{' '}
            <button class="gs-link" onClick={() => void store.refresh()}>
              Retry
            </button>
          </p>
        </Show>

        <Show when={waiting() && showOperations()}>
          <div class="gs-banner">
            <span>A policy draft is waiting for your answers.</span>
            <button class="gs-button" onClick={showOther}>
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
              edit={state.edit}
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
                  onAgain={(plan) => setComposer({ plan, edit: true })}
                  onReview={(plan) => setComposer({ plan })}
                  onPolicy={canDraft() ? draftPolicy : undefined}
                />
              )}
            </Show>
          )}
        </Show>
        <Show when={props.operations && showOperations() && (unattached().length || drafting())}>
          <details ref={(element) => (other = element)} class="gs-section gs-other">
            <summary>
              Policy drafts and other activity
              <Show when={unattached().length}>
                <span class="gs-summary-note">{unattached().length}</span>
              </Show>
            </summary>
            <Operations
              directory={drafting() ?? props.directory}
              port={props.operations!}
              store={store}
              policy={capabilities()?.policy ?? true}
              list={unattached()}
              composing={!!drafting()}
              onComposing={(open) => setDrafting(open ? props.directory : undefined)}
            />
          </details>
        </Show>
      </div>
    </section>
  );
}
