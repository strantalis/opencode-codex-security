import { createSignal, For, Show } from 'solid-js';
import { asState, type ScanState } from '../types';
import type { ScanPlan } from '../core/scan-plan';
import {
  depthLabel,
  elapsedLabel,
  findingsPendingLabel,
  hasDeterminateProgress,
  hasPhaseProgress,
  partialLabel,
  resumeProblem,
  phaseCounts,
  progressLabel,
  runPhaseLabel,
  runTitle,
  scanScope,
  scopeItems,
  timeLimitLabel,
  usageLabel,
  userError,
} from '../scan-display';
import { Coverage } from './Coverage';
import { shortTime } from './format';
import { Findings } from './Findings';
import { RunActivity, RunInfo } from './RunActivity';
import type { OperationPort, SecurityPort, SecurityStore } from './store';

const maxPaths = 3;

/** One scan. Mount one instance per run so disclosures reset when the selection changes. */
export function RunDetail(props: {
  run: ScanState;
  port: SecurityPort;
  store: SecurityStore;
  validation?: OperationPort;
  /** Open a new scan filled in with this one's target and settings. */
  onAgain?(plan: ScanPlan): void;
  /** Review a prepared plan, such as one that resumes this scan. */
  onReview?(plan: ScanPlan): void;
}) {
  const run = () => props.run;
  const paths = () =>
    scopeItems(run())
      .filter((item) => item.path)
      .map((item) => item.text);
  const [allPaths, setAllPaths] = createSignal(false);
  const [cancelling, setCancelling] = createSignal(false);
  const [error, setError] = createSignal('');
  const cancel = async () => {
    const runId = run().runId;
    if (cancelling() || !runId) return;
    setCancelling(true);
    setError('');
    try {
      await props.port.cancel({ runId });
      await props.store.refreshScans();
    } catch (e) {
      setError(userError(e));
    } finally {
      setCancelling(false);
    }
  };
  const resume = async () => {
    setError('');
    try {
      const next = asState(await props.port.prepare({ resumeRunId: run().runId }));
      if (next.plan) props.onReview?.(next.plan);
    } catch (e) {
      setError(userError(e));
    }
  };
  return (
    <article class="gs-detail" aria-label="Selected scan">
      <header class="gs-detail-title">
        <h3>{runTitle(run())}</h3>
        <p class="gs-meta">
          <span class="gs-tag" data-kind="depth">
            {depthLabel(run())} scan
          </span>
          <span>
            {[
              paths().length
                ? `${paths().length} ${paths().length === 1 ? 'path' : 'paths'}`
                : scanScope(run()),
              run().model ?? run().plan?.settings.codex.model,
              run().startedAt ? `started ${shortTime(run().startedAt)}` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </p>
        <Show when={paths().length}>
          <ul class="gs-paths" aria-label="Paths in scope">
            <For each={allPaths() ? paths() : paths().slice(0, maxPaths)}>
              {(path) => (
                <li>
                  <code>{path}</code>
                </li>
              )}
            </For>
            <Show when={paths().length > maxPaths}>
              <li>
                <button class="gs-link" onClick={() => setAllPaths((value) => !value)}>
                  {allPaths() ? 'Show fewer' : `Show all ${paths().length}`}
                </button>
              </li>
            </Show>
          </ul>
        </Show>
        <p class="gs-mono gs-muted">{run().repository}</p>
      </header>
      <div class="gs-progress-heading" role="status" aria-live="polite">
        <h3 data-status={run().status}>{runPhaseLabel(run())}</h3>
        <span class="gs-muted gs-tabular">
          {elapsedLabel(run().startedAt, run().finishedAt, props.store.now())}
          <Show when={run().plan?.settings.scan.maxTimeMinutes}>
            {' '}
            · limit {timeLimitLabel(run().plan?.settings.scan)}
          </Show>
        </span>
      </div>
      <Show when={hasDeterminateProgress(run())}>
        <progress
          class="gs-progress"
          aria-label={`${runPhaseLabel(run())} progress`}
          value={phaseCounts(run()).done}
          max={phaseCounts(run()).total}
        />
      </Show>
      <Show when={hasPhaseProgress(run())}>
        <div class="gs-progress-meta gs-muted">
          <span>{progressLabel(run())}</span>
        </div>
      </Show>
      <div class="gs-scan-actions">
        <span class="gs-muted gs-tabular">{usageLabel(run())}</span>
        <span class="gs-link-row">
          <Show when={run().status === 'running'}>
            <button class="gs-link" disabled={cancelling()} onClick={() => void cancel()}>
              {cancelling() ? 'Stopping…' : 'Cancel scan'}
            </button>
          </Show>
          <Show when={props.onReview && !resumeProblem(run())}>
            <button class="gs-link" onClick={() => void resume()}>
              Resume
            </button>
          </Show>
          <Show when={run().status !== 'running' && props.onAgain && run().plan}>
            {(plan) => (
              <button class="gs-link" onClick={() => props.onAgain?.(plan())}>
                Run again
              </button>
            )}
          </Show>
        </span>
      </div>
      <Show when={error() || run().error}>
        <p class="gs-alert" role="alert">
          {error() || run().error}
        </p>
      </Show>
      <Show when={run().status === 'running'}>
        <p class="gs-lede">{findingsPendingLabel(run())}</p>
      </Show>
      <Show when={run().status === 'cancelled' && !run().partial}>
        <p class="gs-note">Cancelled before it finished, so results are incomplete.</p>
      </Show>
      <Show when={partialLabel(run())}>
        <p class="gs-note" role="status">
          {partialLabel(run())}
        </p>
      </Show>
      <Show when={run().status === 'completed' && run().findings.length === 0}>
        <div class="gs-empty">
          <h3>No findings reported</h3>
          <p>Check coverage to see what was reviewed.</p>
        </div>
      </Show>
      <Show when={run().findings.length}>
        <Findings
          run={run()}
          store={props.store}
          validation={props.validation}
          discuss={props.port.discuss}
        />
      </Show>
      <Show when={run().status === 'completed' || run().partial}>
        <Coverage run={run()} />
      </Show>
      <RunActivity run={run()} />
      <RunInfo run={run()} />
    </article>
  );
}
