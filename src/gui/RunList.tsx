import { createMemo, createSignal, For, Show } from 'solid-js';
import type { ScanState } from '../types';
import { depthLabel, runTitle, scanScope } from '../scan-display';
import { shortTime, statusLabel } from './format';

const shown = 3;
const outcome = (run: ScanState) =>
  run.status === 'completed' || run.partial
    ? `${run.findings.length} ${run.findings.length === 1 ? 'finding' : 'findings'}${run.partial ? ' so far' : ''}`
    : statusLabel(run.status);

/** Every scan at a glance: running ones first, the selected one highlighted. */
export function RunList(props: {
  runs: ScanState[];
  selectedId?: string;
  onSelect(runId: string | undefined): void;
}) {
  const [all, setAll] = createSignal(false);
  const ordered = createMemo(() => [
    ...props.runs.filter((run) => run.status === 'running'),
    ...props.runs.filter((run) => run.status !== 'running'),
  ]);
  // The selected scan is always in view, even when it is further down than the short list.
  const visible = () =>
    all()
      ? ordered()
      : ordered().filter((run, index) => index < shown || run.runId === props.selectedId);
  const hidden = () => ordered().length - visible().length;
  // Only worth a line when the scans are not all of the same repository.
  const several = () => new Set(props.runs.map((run) => run.repository)).size > 1;
  return (
    <section class="gs-runs" aria-label="Scans">
      <ul class="gs-list">
        <For each={visible()}>
          {(run) => (
            <li>
              <button
                class="gs-list-item gs-run-row"
                aria-pressed={props.selectedId === run.runId}
                onClick={() => props.onSelect(run.runId)}
              >
                <span class="gs-dot" data-status={run.status} aria-hidden="true" />
                <span class="gs-run-main">
                  <span class="gs-list-title">{runTitle(run)}</span>
                  <span class="gs-list-meta">
                    {depthLabel(run)} · {scanScope(run)} · {shortTime(run.startedAt)}
                  </span>
                  <Show when={several()}>
                    <span class="gs-list-meta gs-mono">{run.repository}</span>
                  </Show>
                </span>
                <span class="gs-status" data-status={run.status}>
                  {outcome(run)}
                </span>
              </button>
            </li>
          )}
        </For>
      </ul>
      <Show when={hidden() > 0 || all()}>
        <button class="gs-link gs-small" onClick={() => setAll((value) => !value)}>
          {all() ? 'Show fewer' : `Show ${hidden()} more`}
        </button>
      </Show>
    </section>
  );
}
