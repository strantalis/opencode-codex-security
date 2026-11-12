import { For } from 'solid-js';
import type { ScanState } from '../types';
import { runTitle, scanScope } from '../scan-display';
import { shortTime, statusLabel } from './format';

/** Collapsed scan history; choosing a run closes it. */
export function RunList(props: {
  runs: ScanState[];
  selectedId?: string;
  onSelect(runId: string | undefined): void;
}) {
  let element: HTMLDetailsElement | undefined;
  return (
    <details ref={(el) => (element = el)} class="gs-runs" aria-label="Scan history">
      <summary>
        <span>Switch scan</span>
        <span class="gs-muted">{props.runs.length} recent</span>
      </summary>
      <ul class="gs-list">
        <For each={props.runs}>
          {(run) => (
            <li>
              <button
                class="gs-list-item"
                aria-pressed={props.selectedId === run.runId}
                onClick={() => {
                  props.onSelect(run.runId);
                  if (element) element.open = false;
                }}
              >
                <span class="gs-list-top">
                  <span class="gs-list-title">{runTitle(run)}</span>
                  <span class="gs-status" data-status={run.status}>
                    {statusLabel(run.status)}
                  </span>
                </span>
                <span class="gs-list-meta">{run.repository}</span>
                <span class="gs-list-meta">
                  {run.mode ?? run.plan?.settings.scan.mode ?? 'standard'} · {scanScope(run)} ·{' '}
                  {shortTime(run.startedAt)}
                  {run.status === 'completed'
                    ? ` · ${run.findings.length} ${run.findings.length === 1 ? 'finding' : 'findings'}`
                    : ''}
                </span>
              </button>
            </li>
          )}
        </For>
      </ul>
    </details>
  );
}
