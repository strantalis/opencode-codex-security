import { createMemo, createSignal, For, Show } from 'solid-js';
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

export function Findings(props: {
  run: ScanState;
  store: SecurityStore;
  /** Present when the server supports validation. */
  validation?: OperationPort;
  /** Hands a finding to the session's conversation. */
  discuss?: (input: { runId: string; findingId: string }) => Promise<unknown>;
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
                <pre>{finding.evidence}</pre>
              </Show>
              <h4>Suggested fix</h4>
              <p>{finding.remediation}</p>
              <Show when={props.discuss}>
                {(discuss) => (
                  <div class="gs-actions">
                    <button
                      class="gs-button"
                      onClick={() =>
                        void discuss()({ runId: props.run.runId!, findingId: finding.id })
                      }
                    >
                      Discuss in chat
                    </button>
                    <span class="gs-muted">Asks this session's model to explain it.</span>
                  </div>
                )}
              </Show>
              <Show when={props.validation}>
                {(port) => (
                  <>
                    <FindingAction
                      kind="validation"
                      run={props.run}
                      finding={finding}
                      port={port()}
                      store={props.store}
                    />
                    <Show when={port().capabilities?.fix ?? true}>
                      <FindingAction
                        kind="fix"
                        run={props.run}
                        finding={finding}
                        port={port()}
                        store={props.store}
                      />
                    </Show>
                  </>
                )}
              </Show>
            </div>
          </details>
        )}
      </For>
    </section>
  );
}

/** The latest validation or fix for this exact finding text, or a button to prepare one. */
function FindingAction(props: {
  kind: 'validation' | 'fix';
  run: ScanState;
  finding: Finding;
  port: OperationPort;
  store: SecurityStore;
}) {
  const text = () => findingText(props.finding);
  const latest = createMemo(() =>
    props.store
      .operations()
      .filter((op) => op.kind === props.kind && op.plan.finding === text())
      .reduce<SecurityOperationState | undefined>(
        (best, op) => (!best || op.createdAt > best.createdAt ? op : best),
        undefined,
      ),
  );
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal('');
  const prepare = async () => {
    if (busy()) return;
    setBusy(true);
    setError('');
    try {
      await props.port.prepare({
        kind: props.kind,
        source: { runId: props.run.runId!, findingId: props.finding.id },
        repository: props.run.repository,
        finding: text(),
      });
      await props.store.refreshOperations();
    } catch (e) {
      setError(userError(e));
    } finally {
      setBusy(false);
    }
  };
  const canRetry = () => {
    const status = latest()?.status;
    return !status || status === 'completed' || status === 'cancelled' || status === 'error';
  };
  return (
    <div class="gs-finding-validation">
      <Show when={latest()?.operationId} keyed>
        {(id) => (
          <Show when={latest()?.operationId === id ? latest() : undefined}>
            {(op) => <OperationDetail op={op()} port={props.port} store={props.store} compact />}
          </Show>
        )}
      </Show>
      <Show when={error()}>
        <p class="gs-alert" role="alert">
          {error()}
        </p>
      </Show>
      <Show when={canRetry()}>
        <div class="gs-actions">
          <button class="gs-button" disabled={busy()} onClick={() => void prepare()}>
            {busy()
              ? 'Preparing…'
              : props.kind === 'fix'
                ? latest()
                  ? 'Propose another fix'
                  : 'Propose fix'
                : latest()
                  ? 'Validate again'
                  : 'Validate finding'}
          </button>
          <Show when={!latest()}>
            <span class="gs-muted">
              {props.kind === 'fix'
                ? 'Writes a fix in a copy of the last commit. You review the diff first.'
                : 'Checks the finding against the source. You approve first.'}
            </span>
          </Show>
        </div>
      </Show>
    </div>
  );
}
