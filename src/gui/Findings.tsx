import { createMemo, createSignal, For, Show, type JSX } from 'solid-js';
import type { Finding, ScanState } from '../types';
import type { SecurityOperationState } from '../core/security-operations';
import {
  findingStatus,
  findingText,
  severitySummary,
  sortedFindings,
  userError,
} from '../scan-display';
import { OperationDetail } from './OperationDetail';
import type { OperationPort, SecurityStore } from './store';

/** The host's highlighted code block and Markdown, as the chat timeline renders them. */
export type HostUi = {
  Code(props: { content: string; language?: string }): JSX.Element;
  Markdown(props: { text: string }): JSX.Element;
};

/** The file extension, which the host's highlighter accepts as a language alias. */
const language = (path: string) => /\.([A-Za-z0-9]+)$/.exec(path)?.[1]?.toLowerCase();

export function Findings(props: {
  run: ScanState;
  store: SecurityStore;
  /** Present when the server supports validation. */
  validation?: OperationPort;
  /** Hands a finding to the session's conversation. */
  discuss?: (input: { runId: string; findingId: string }) => Promise<unknown>;
  ui?: HostUi;
}) {
  return (
    <section class="gs-findings" aria-label="Scan findings">
      <div class="gs-section-heading">
        <h3>Findings</h3>
        <span class="gs-muted">{severitySummary(props.run)}</span>
      </div>
      <For each={sortedFindings(props.run)}>
        {(finding) => (
          <details class="gs-finding">
            <summary>
              <span class="gs-severity" data-severity={finding.severity}>
                {finding.severity}
              </span>
              <span class="gs-finding-title">{finding.title}</span>
              <Show when={findingStatus(props.run, finding.id)}>
                {(status) => (
                  <span class="gs-finding-status" data-tone={status().tone}>
                    {status().label}
                  </span>
                )}
              </Show>
            </summary>
            <div class="gs-finding-body">
              <p class="gs-mono gs-muted">
                {finding.path}:{finding.line} · {finding.cwe} · {finding.confidence} confidence
              </p>
              <p>{finding.summary}</p>
              <Show when={finding.evidence}>
                <For each={finding.snippets ?? [{ path: '', line: 0, code: finding.evidence }]}>
                  {(snippet) => (
                    <>
                      <Show when={snippet.path}>
                        <p class="gs-mono gs-muted gs-snippet">
                          {snippet.path}
                          {snippet.line ? `:${snippet.line}` : ''}
                        </p>
                      </Show>
                      <Show when={props.ui} keyed fallback={<pre>{snippet.code}</pre>}>
                        {(ui) => (
                          <ui.Code
                            content={snippet.code}
                            language={language(snippet.path || finding.path)}
                          />
                        )}
                      </Show>
                    </>
                  )}
                </For>
              </Show>
              <h4>Suggested fix</h4>
              <Show when={props.ui} keyed fallback={<p>{finding.remediation}</p>}>
                {(ui) => <ui.Markdown text={finding.remediation} />}
              </Show>
              <FindingActions
                run={props.run}
                finding={finding}
                store={props.store}
                validation={props.validation}
                discuss={props.discuss}
              />
            </div>
          </details>
        )}
      </For>
    </section>
  );
}

/** Results of the latest validation and fix for this exact finding text, then one row of actions. */
function FindingActions(props: {
  run: ScanState;
  finding: Finding;
  store: SecurityStore;
  validation?: OperationPort;
  discuss?: (input: { runId: string; findingId: string }) => Promise<unknown>;
}) {
  const text = () => findingText(props.finding);
  const [busy, setBusy] = createSignal<'validation' | 'fix'>();
  const [error, setError] = createSignal('');
  const action = (kind: 'validation' | 'fix') => {
    const latest = createMemo(() =>
      props.store
        .operations()
        .filter((op) => op.kind === kind && op.plan.finding === text())
        .reduce<SecurityOperationState | undefined>(
          (best, op) => (!best || op.createdAt > best.createdAt ? op : best),
          undefined,
        ),
    );
    const idle = () => {
      const status = latest()?.status;
      return !status || status === 'completed' || status === 'cancelled' || status === 'error';
    };
    const prepare = async () => {
      if (busy()) return;
      setBusy(kind);
      setError('');
      try {
        await props.validation!.prepare({
          kind,
          source: { runId: props.run.runId!, findingId: props.finding.id },
          repository: props.run.repository,
          finding: text(),
        });
        await props.store.refreshOperations();
      } catch (e) {
        setError(userError(e));
      } finally {
        setBusy(undefined);
      }
    };
    return { kind, latest, idle, prepare };
  };
  const validation = action('validation');
  const fix = action('fix');
  const shown = () =>
    props.validation
      ? (props.validation.capabilities?.fix ?? true)
        ? [validation, fix]
        : [validation]
      : [];
  const label = (item: typeof validation) =>
    busy() === item.kind
      ? 'Preparing…'
      : item.kind === 'fix'
        ? item.latest()
          ? 'Propose another fix'
          : 'Propose fix'
        : item.latest()
          ? 'Validate again'
          : 'Validate finding';
  return (
    <div class="gs-finding-validation">
      <For each={shown()}>
        {(item) => (
          <Show when={item.latest()?.operationId} keyed>
            {(id) => (
              <Show when={item.latest()?.operationId === id ? item.latest() : undefined}>
                {(op) => (
                  <OperationDetail op={op()} port={props.validation!} store={props.store} compact />
                )}
              </Show>
            )}
          </Show>
        )}
      </For>
      <Show when={error()}>
        <p class="gs-alert" role="alert">
          {error()}
        </p>
      </Show>
      <div class="gs-actions">
        <For each={shown()}>
          {(item) => (
            <Show when={item.idle()}>
              <button
                class="gs-button"
                disabled={!!busy()}
                title={
                  item.kind === 'fix'
                    ? 'Writes a fix in a copy of the last commit. You review the diff first.'
                    : 'Checks the finding against the source. You approve first.'
                }
                onClick={() => void item.prepare()}
              >
                {label(item)}
              </button>
            </Show>
          )}
        </For>
        <Show when={props.discuss}>
          {(discuss) => (
            <button
              class="gs-button"
              title="Asks this session's model to explain it."
              onClick={() =>
                void discuss()({ runId: props.run.runId!, findingId: props.finding.id })
              }
            >
              Discuss in chat
            </button>
          )}
        </Show>
      </div>
    </div>
  );
}
