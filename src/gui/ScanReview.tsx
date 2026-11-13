import { Show } from 'solid-js';
import { scopeLabel, timeLimitLabel } from '../scan-display';
import type { ScanPlan } from '../core/scan-plan';
import { describeCostLimit, describeInferenceRoute, inferenceDestination } from '../plan-view';
import type { SecurityStore } from './store';

export function ScanReview(props: {
  plan: ScanPlan;
  store: SecurityStore;
  busy: boolean;
  onStart(): void;
  onEdit(): void;
}) {
  const expired = () => Date.parse(props.plan.expiresAt) <= props.store.now();
  const full = () => props.store.running() >= props.store.catalog.maxConcurrent;
  return (
    <div class="gs-review">
      <h3>{props.plan.resume ? 'Resume scan' : 'Review scan'}</h3>
      <Show when={props.plan.resume}>
        <p class="gs-note">
          Continues the interrupted scan in its original session. Work it had finished is kept.
        </p>
      </Show>
      <dl class="gs-facts">
        <dt>Repository</dt>
        <dd>{props.plan.repository}</dd>
        <dt>Scope</dt>
        <dd>{scopeLabel(props.plan)}</dd>
        <dt>Depth</dt>
        <dd>{props.plan.settings.scan.mode === 'deep' ? 'Deep' : 'Standard'}</dd>
        <dt>Time limit</dt>
        <dd>{timeLimitLabel(props.plan.settings.scan)}</dd>
        <Show when={props.plan.scanPrompt}>
          <dt>Focus</dt>
          <dd>{props.plan.scanPrompt}</dd>
        </Show>
        <Show when={props.plan.contextFiles.length}>
          <dt>Context files</dt>
          <dd>{props.plan.contextFiles.map((file) => file.path).join(', ')}</dd>
        </Show>
        <dt>Model</dt>
        <dd>
          {props.plan.settings.codex.model} · {props.plan.settings.codex.reasoningEffort} reasoning
          {props.plan.settings.codex.daybreak ? ' · Daybreak' : ''}
        </dd>
      </dl>
      <div class="gs-approval">
        <Show
          when={!props.plan.mock}
          fallback={<p>Mock scan: synthetic results, no model calls.</p>}
        >
          <p>
            Approving sends source from this repository and the listed files to{' '}
            {inferenceDestination(props.plan.settings)}. Results are saved on this machine.
          </p>
          <p>{describeCostLimit(props.plan.settings.scan.maxCostUsd)}</p>
        </Show>
        <details class="gs-disclosure">
          <summary>Route and configuration</summary>
          <p>{describeInferenceRoute(props.plan.settings)}</p>
          <p class="gs-mono">{props.plan.globalConfigFile}</p>
        </details>
      </div>
      <Show when={full()}>
        <p class="gs-note" role="status">
          {props.store.catalog.maxConcurrent} scans are running. Start this one when a scan
          finishes.
        </p>
      </Show>
      <Show when={expired()}>
        <p class="gs-note gs-danger">
          This preview has expired. Edit the scan to prepare it again.
        </p>
      </Show>
      <div class="gs-actions">
        <button
          class="gs-button gs-primary"
          disabled={props.busy || full() || expired()}
          onClick={() => props.onStart()}
        >
          {props.busy
            ? 'Starting…'
            : props.plan.mock
              ? 'Start mock scan'
              : props.plan.resume
                ? 'Approve and resume'
                : 'Approve and start'}
        </button>
        <Show when={!props.plan.resume}>
          <button class="gs-button" disabled={props.busy} onClick={() => props.onEdit()}>
            Edit scan
          </button>
        </Show>
      </div>
    </div>
  );
}
