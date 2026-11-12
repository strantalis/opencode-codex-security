import { For, Show } from 'solid-js';
import type { ScanState } from '../types';
import {
  activityActor,
  activityRows,
  activityStatusLabel,
  deepProgressLabel,
  dispatchLabel,
  reconnectLabel,
  scanScope,
  usageContext,
  trustedAccessLabel,
  targetChangedLabel,
  usageLabel,
  usageRangeLabel,
  workerActivityRows,
  workerSummary,
} from '../scan-display';
import { clockTime } from './format';

export function RunActivity(props: { run: ScanState }) {
  const run = () => props.run;
  return (
    <details class="gs-section gs-activity" aria-label="Scan activity">
      <summary>Activity</summary>
      <Show when={workerSummary(run()) || dispatchLabel(run())}>
        <p class="gs-muted">
          {[workerSummary(run()), dispatchLabel(run())].filter(Boolean).join(' · ')}
        </p>
      </Show>
      <Show
        when={activityRows(run()).length}
        fallback={
          <p class="gs-muted">
            {run().status === 'running' ? 'Waiting for activity.' : 'No activity recorded.'}
          </p>
        }
      >
        <ul class="gs-workers">
          <For each={workerActivityRows(run()).slice(0, 4)}>
            {(activity) => (
              <li data-activity-id={activity.id}>
                <span class="gs-worker-name">{activityActor(activity.worker)}</span>
                <span class="gs-worker-label">{activity.label}</span>
                <span class="gs-status" data-status={activity.status}>
                  {activityStatusLabel(activity.status, run())}
                </span>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={activityRows(run()).length || run().events.length}>
        <details class="gs-disclosure">
          <summary>History</summary>
          <ol class="gs-timeline">
            <For each={activityRows(run())}>
              {(activity) => (
                <li>
                  <time dateTime={activity.updatedAt}>{clockTime(activity.updatedAt)}</time>
                  <span>
                    {activityActor(activity.worker)} · {activity.label} ·{' '}
                    {activityStatusLabel(activity.status, run())}
                    <Show when={activity.paths.length}>
                      <span class="gs-mono gs-muted gs-block">{activity.paths.join(', ')}</span>
                    </Show>
                  </span>
                </li>
              )}
            </For>
            <For each={[...run().events].reverse().slice(0, 20)}>
              {(event) => (
                <li>
                  <time dateTime={event.time}>{clockTime(event.time)}</time>
                  <span>{event.message}</span>
                </li>
              )}
            </For>
          </ol>
        </details>
      </Show>
    </details>
  );
}

export function RunInfo(props: { run: ScanState }) {
  const run = () => props.run;
  const usage = () => run().telemetry?.measurement?.usage;
  const cost = () => run().telemetry?.measurement?.cost;
  return (
    <details class="gs-section gs-info">
      <summary>Usage and details</summary>
      <dl class="gs-facts">
        <dt>Estimated usage</dt>
        <dd>{usageLabel(run())}</dd>
        <dd class="gs-muted">{usageContext(run())}</dd>
        <Show when={run().telemetry?.authentication}>
          <dt>Signed in with</dt>
          <dd>{run().telemetry?.authentication}</dd>
        </Show>
        <Show when={trustedAccessLabel(run()) || targetChangedLabel(run())}>
          <dt>Notices</dt>
          <dd>
            {[trustedAccessLabel(run()), targetChangedLabel(run())].filter(Boolean).join(' · ')}
          </dd>
        </Show>
        <Show when={usageRangeLabel(run())}>
          <dt>Range</dt>
          <dd>{usageRangeLabel(run())}</dd>
        </Show>
        <Show when={cost()?.model || cost()?.pricingAsOf}>
          <dt>Pricing</dt>
          <dd>{[cost()?.model, cost()?.pricingAsOf].filter(Boolean).join(' · ')}</dd>
        </Show>
        <Show when={usage()}>
          {(tokens) => (
            <>
              <dt>Tokens</dt>
              <dd>
                {tokens().inputTokens.toLocaleString()} input ·{' '}
                {tokens().cachedInputTokens.toLocaleString()} cached ·{' '}
                {tokens().outputTokens.toLocaleString()} output
              </dd>
            </>
          )}
        </Show>
        <Show when={run().deepProgress}>
          <dt>Deep review</dt>
          <dd>{deepProgressLabel(run())}</dd>
        </Show>
        <Show when={reconnectLabel(run())}>
          <dt>Connection</dt>
          <dd>{reconnectLabel(run())}</dd>
        </Show>
        <dt>Repository</dt>
        <dd class="gs-wrap">{run().repository}</dd>
        <dt>Scope</dt>
        <dd>{scanScope(run())}</dd>
        <Show when={run().model ?? run().plan?.settings.codex.model}>
          <dt>Model</dt>
          <dd>{run().model ?? run().plan?.settings.codex.model}</dd>
        </Show>
        <Show when={run().plan?.scanPrompt}>
          <dt>Focus</dt>
          <dd>{run().plan?.scanPrompt}</dd>
        </Show>
        <Show when={run().plan?.contextFiles.length}>
          <dt>Context files</dt>
          <dd>
            {run()
              .plan?.contextFiles.map((file) => file.path)
              .join(', ')}
          </dd>
        </Show>
        <dt>Run ID</dt>
        <dd class="gs-mono">{run().runId}</dd>
        <Show when={run().scanId}>
          <dt>SDK scan ID</dt>
          <dd class="gs-mono">{run().scanId}</dd>
        </Show>
      </dl>
      <Show when={run().archived}>
        <p class="gs-muted">Restored from local history.</p>
      </Show>
    </details>
  );
}
