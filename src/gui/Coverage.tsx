import { For, Show, type JSX } from 'solid-js';
import type { ScanState } from '../types';
import { coverageLabel, resultCountsLabel } from '../scan-display';

const dispositions: Record<string, { label: string; tone?: 'good' | 'warn' }> = {
  reported: { label: 'Finding reported', tone: 'warn' },
  needs_follow_up: { label: 'Needs follow-up', tone: 'warn' },
  no_issue_found: { label: 'No issue found', tone: 'good' },
  rejected: { label: 'Rejected' },
  not_applicable: { label: 'Not applicable' },
};
type Counted = { total: number | null; items: unknown[]; omitted: number };

/** One titled block of coverage. Hidden when the scan reported nothing for it. */
function Group(props: { title: string; list: Counted; children: JSX.Element }) {
  return (
    <Show when={props.list.total}>
      <section class="gs-group">
        <h4>
          {props.title} <span class="gs-count">{props.list.total}</span>
        </h4>
        {props.children}
        <Show when={props.list.omitted}>
          <p class="gs-muted gs-small">{props.list.omitted} more not shown.</p>
        </Show>
      </section>
    </Show>
  );
}
const Paths = (props: { items: string[] }) => (
  <span class="gs-chips">
    <For each={props.items}>{(path) => <code class="gs-chip">{path}</code>}</For>
  </span>
);

export function Coverage(props: { run: ScanState }) {
  const coverage = () => props.run.assessment?.coverage;
  const matching = () => props.run.assessment?.repositoryFindings;
  const stat = (value: number | null | undefined) => value ?? '–';
  const empty = () => {
    const c = coverage();
    if (!c) return [];
    return (
      [
        ['review surfaces', c.surfaces],
        ['deferred work', c.deferred],
        ['open questions', c.openQuestions],
        ['exclusions', c.explicitExclusions],
        ['limitations', c.limitations],
      ] as const
    )
      .filter(([, list]) => !list.total)
      .map(([name]) => name);
  };
  return (
    <section class="gs-outcome" aria-label="Scan outcome">
      <p class="gs-muted">{resultCountsLabel(props.run)}</p>
      <details class="gs-section gs-coverage">
        <summary>
          Coverage <span class="gs-summary-note">{coverageLabel(props.run)}</span>
        </summary>
        <Show
          when={coverage()?.source !== 'unavailable' ? coverage() : undefined}
          fallback={<p class="gs-muted">The scan did not report what it reviewed.</p>}
        >
          {(c) => (
            <>
              <dl class="gs-stats">
                <div>
                  <dd>{stat(c().surfaces.total)}</dd>
                  <dt>Surfaces reviewed</dt>
                </div>
                <div>
                  <dd>{stat(c().deferred.total)}</dd>
                  <dt>Deferred</dt>
                </div>
                <div>
                  <dd>{stat(c().openQuestions.total)}</dd>
                  <dt>Open questions</dt>
                </div>
              </dl>
              <Group title="Review surfaces" list={c().surfaces}>
                <ul class="gs-rows">
                  <For each={c().surfaces.items}>
                    {(surface) => (
                      <li>
                        <span class="gs-row-main">
                          <span class="gs-row-title">{surface.label ?? 'Unnamed surface'}</span>
                          <Show when={surface.riskArea}>
                            <span class="gs-muted gs-small">{surface.riskArea}</span>
                          </Show>
                        </span>
                        <span
                          class="gs-finding-status"
                          data-tone={dispositions[surface.disposition]?.tone}
                        >
                          {dispositions[surface.disposition]?.label ?? 'Unknown'}
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              </Group>
              <Group title="Deferred work" list={c().deferred}>
                <ul class="gs-rows">
                  <For each={c().deferred.items}>
                    {(item) => (
                      <li>
                        <span class="gs-row-main">
                          <span>{item.reason ?? 'No reason reported'}</span>
                          <Show when={item.paths.items.length}>
                            <Paths items={item.paths.items} />
                          </Show>
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              </Group>
              <Group title="Open questions" list={c().openQuestions}>
                <ul class="gs-rows">
                  <For each={c().openQuestions.items}>
                    {(item) => <li>{item.question ?? 'Question details unavailable'}</li>}
                  </For>
                </ul>
              </Group>
              <Show
                when={
                  c().scopeIncludePaths.total ||
                  c().scopeExcludePaths.total ||
                  c().reviewExcludedPaths.total ||
                  c().explicitExclusions.total
                }
              >
                <section class="gs-group">
                  <h4>Scope</h4>
                  <dl class="gs-grid">
                    <Show when={c().scopeIncludePaths.total}>
                      <dt>Included</dt>
                      <dd>
                        <Paths items={c().scopeIncludePaths.items} />
                      </dd>
                    </Show>
                    <Show when={c().scopeExcludePaths.total || c().reviewExcludedPaths.total}>
                      <dt>Excluded</dt>
                      <dd>
                        <Paths
                          items={[...c().scopeExcludePaths.items, ...c().reviewExcludedPaths.items]}
                        />
                      </dd>
                    </Show>
                    <For each={c().explicitExclusions.items}>
                      {(item) => (
                        <>
                          <dt>Skipped</dt>
                          <dd>
                            <Paths items={[item.pattern ?? 'Unspecified']} />
                            <Show when={item.reason}>
                              <span class="gs-muted gs-block">{item.reason}</span>
                            </Show>
                          </dd>
                        </>
                      )}
                    </For>
                  </dl>
                </section>
              </Show>
              <Group title="Limitations" list={c().limitations}>
                <ul class="gs-rows">
                  <For each={c().limitations.items}>{(item) => <li>{item}</li>}</For>
                </ul>
              </Group>
              <Show when={empty().length}>
                <p class="gs-muted gs-small">Nothing reported for {empty().join(', ')}.</p>
              </Show>
            </>
          )}
        </Show>
        <Show when={matching()?.available}>
          <section class="gs-group">
            <h4>Known findings in this repository</h4>
            <dl class="gs-stats">
              <div>
                <dd>{stat(matching()?.open)}</dd>
                <dt>Open</dt>
              </div>
              <div>
                <dd>{stat(matching()?.closed)}</dd>
                <dt>Closed</dt>
              </div>
              <div>
                <dd>{stat(matching()?.confirmedInLatestScan)}</dd>
                <dt>Seen in this scan</dt>
              </div>
            </dl>
          </section>
        </Show>
        <div class="gs-footnotes">
          <For each={props.run.assessment?.notes ?? []}>{(note) => <p>{note}</p>}</For>
          <Show when={props.run.skipped || props.run.assessment?.returnedFindings.informational}>
            <p>
              Informational and unclassified items are not listed here. They are in the full local
              SDK result.
            </p>
          </Show>
        </div>
      </details>
    </section>
  );
}
