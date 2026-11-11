import { For, Show } from 'solid-js';
import type { ScanState } from '../types';
import {
  coverageDetails,
  coverageLabel,
  repositoryMatchingLabel,
  resultCountsLabel,
} from '../scan-display';

export function Coverage(props: { run: ScanState }) {
  const matching = () => props.run.assessment?.repositoryFindings;
  return (
    <section class="gs-outcome" aria-label="Scan outcome">
      <p class="gs-muted">{resultCountsLabel(props.run)}</p>
      <details class="gs-section gs-coverage">
        <summary>Coverage</summary>
        <p>{coverageLabel(props.run)}</p>
        <dl class="gs-facts">
          <For each={coverageDetails(props.run)}>
            {(row) => (
              <>
                <Show when={row.label}>
                  <dt>{row.label}</dt>
                </Show>
                <dd>{row.value}</dd>
              </>
            )}
          </For>
          <dt>Repository matching</dt>
          <dd>{repositoryMatchingLabel(props.run)}</dd>
          <Show when={matching()?.available}>
            <dd class="gs-muted">
              {matching()?.withMatchedFindingIds ?? 'Unknown'} records match finding IDs ·{' '}
              {matching()?.notConfirmedInLatestScan ?? 'Unknown'} not confirmed in this scan
            </dd>
          </Show>
        </dl>
        <For each={props.run.assessment?.notes ?? []}>
          {(note) => <p class="gs-muted">{note}</p>}
        </For>
        <Show when={props.run.skipped || props.run.assessment?.returnedFindings.informational}>
          <p class="gs-muted">
            Informational and unclassified items are not listed here. They are in the full local SDK
            result.
          </p>
        </Show>
      </details>
    </section>
  );
}
