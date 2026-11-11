import { createSignal, Show } from 'solid-js';
import type { ScanState } from '../types';
import {
  elapsedLabel,
  findingsPendingLabel,
  hasDeterminateProgress,
  hasPhaseProgress,
  phaseContext,
  phaseCounts,
  progressLabel,
  runPhaseLabel,
  runTitle,
  scanScope,
  usageLabel,
  userError,
} from '../scan-display';
import { Coverage } from './Coverage';
import { Findings } from './Findings';
import { RunActivity, RunInfo } from './RunActivity';
import type { OperationPort, SecurityPort, SecurityStore } from './store';

/** One scan. Mount one instance per run so disclosures reset when the selection changes. */
export function RunDetail(props: {
  run: ScanState;
  port: SecurityPort;
  store: SecurityStore;
  validation?: OperationPort;
}) {
  const run = () => props.run;
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
  return (
    <article class="gs-detail" aria-label="Selected scan">
      <header class="gs-detail-title">
        <h3>{runTitle(run())}</h3>
        <p class="gs-muted gs-wrap">{run().repository}</p>
        <p class="gs-muted">
          {run().mode ?? run().plan?.settings.scan.mode ?? 'standard'} · {scanScope(run())}
        </p>
      </header>
      <div class="gs-progress-heading" role="status" aria-live="polite">
        <h3 data-status={run().status}>{runPhaseLabel(run())}</h3>
        <span class="gs-muted gs-tabular">
          {elapsedLabel(run().startedAt, run().finishedAt, props.store.now())}
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
          <span>{phaseContext(run())}</span>
        </div>
      </Show>
      <div class="gs-scan-actions">
        <span class="gs-muted gs-tabular">{usageLabel(run())}</span>
        <Show when={run().status === 'running'}>
          <button class="gs-link" disabled={cancelling()} onClick={() => void cancel()}>
            {cancelling() ? 'Stopping…' : 'Cancel scan'}
          </button>
        </Show>
      </div>
      <Show when={error() || run().error}>
        <p class="gs-alert" role="alert">
          {error() || run().error}
        </p>
      </Show>
      <Show when={run().status === 'running'}>
        <p class="gs-lede">{findingsPendingLabel(run())}</p>
      </Show>
      <Show when={run().status === 'cancelled'}>
        <p class="gs-note">Cancelled before it finished, so results are incomplete.</p>
      </Show>
      <Show when={run().status === 'completed' && run().findings.length === 0}>
        <div class="gs-empty">
          <h3>No findings reported</h3>
          <p>Check coverage to see what was reviewed.</p>
        </div>
      </Show>
      <Show when={run().findings.length}>
        <Findings run={run()} store={props.store} validation={props.validation} />
      </Show>
      <Show when={run().status === 'completed'}>
        <Coverage run={run()} />
      </Show>
      <RunActivity run={run()} />
      <RunInfo run={run()} />
    </article>
  );
}
