import { For, Show } from 'solid-js';
import type { ScanState } from '../types';
import {
  activityActor,
  activityRows,
  activityStatusLabel,
  deepProgressLabel,
  dispatchLabel,
  reconnectLabel,
  scopeItems,
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
      <section class="gs-group">
        <h4>Usage</h4>
        <dl class="gs-grid">
          <dt>Cost</dt>
          <dd>
            {usageLabel(run())}
            <span class="gs-muted gs-small gs-block">{usageContext(run())}</span>
          </dd>
          <Show when={usageRangeLabel(run())}>
            <dt>Range</dt>
            <dd>{usageRangeLabel(run())}</dd>
          </Show>
          <Show when={usage()}>
            {(tokens) => (
              <>
                <dt>Input tokens</dt>
                <dd class="gs-tabular">
                  {tokens().inputTokens.toLocaleString()}{' '}
                  <span class="gs-muted">
                    ({tokens().cachedInputTokens.toLocaleString()} cached)
                  </span>
                </dd>
                <dt>Output tokens</dt>
                <dd class="gs-tabular">{tokens().outputTokens.toLocaleString()}</dd>
              </>
            )}
          </Show>
          <Show when={cost()?.model || cost()?.pricingAsOf}>
            <dt>Priced as</dt>
            <dd>{[cost()?.model, cost()?.pricingAsOf].filter(Boolean).join(', prices of ')}</dd>
          </Show>
        </dl>
      </section>
      <section class="gs-group">
        <h4>Scan</h4>
        <dl class="gs-grid">
          <dt>Repository</dt>
          <dd class="gs-mono">{run().repository}</dd>
          <dt>Scope</dt>
          <dd>
            <For each={scopeItems(run())}>
              {(item) => (
                <span class="gs-block" classList={{ 'gs-mono': item.path }}>
                  {item.text}
                </span>
              )}
            </For>
          </dd>
          <Show when={run().model ?? run().plan?.settings.codex.model}>
            <dt>Model</dt>
            <dd>{run().model ?? run().plan?.settings.codex.model}</dd>
          </Show>
          <Show when={run().telemetry?.authentication}>
            <dt>Signed in with</dt>
            <dd>{run().telemetry?.authentication}</dd>
          </Show>
          <Show when={run().plan?.scanPrompt}>
            <dt>Focus</dt>
            <dd>{run().plan?.scanPrompt}</dd>
          </Show>
          <Show when={run().plan?.contextFiles.length}>
            <dt>Context files</dt>
            <dd class="gs-mono">
              <For each={run().plan?.contextFiles}>
                {(file) => <span class="gs-block">{file.path}</span>}
              </For>
            </dd>
          </Show>
          <Show when={run().deepProgress}>
            <dt>Deep review</dt>
            <dd>{deepProgressLabel(run())}</dd>
          </Show>
          <Show when={reconnectLabel(run())}>
            <dt>Connection</dt>
            <dd>{reconnectLabel(run())}</dd>
          </Show>
          <Show when={trustedAccessLabel(run()) || targetChangedLabel(run())}>
            <dt>Notices</dt>
            <dd>
              <For each={[trustedAccessLabel(run()), targetChangedLabel(run())].filter(Boolean)}>
                {(notice) => <span class="gs-block">{notice}</span>}
              </For>
            </dd>
          </Show>
        </dl>
      </section>
      <section class="gs-group">
        <h4>Reference</h4>
        <dl class="gs-grid">
          <dt>Run ID</dt>
          <dd class="gs-mono">{run().runId}</dd>
          <Show when={run().scanId}>
            <dt>SDK scan ID</dt>
            <dd class="gs-mono">{run().scanId}</dd>
          </Show>
          <Show when={run().scanDirectory}>
            <dt>Saved files</dt>
            <dd class="gs-mono">{run().scanDirectory}</dd>
          </Show>
        </dl>
      </section>
      <Show when={run().archived}>
        <p class="gs-muted">Restored from local history.</p>
      </Show>
    </details>
  );
}
