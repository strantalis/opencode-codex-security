import { createMemo, createSignal, For, Show } from 'solid-js';
import type { SecurityOperationState } from '../core/security-operations';
import { projectName, splitPaths, userError } from '../scan-display';
import { shortTime, statusLabel } from './format';
import { OperationDetail } from './OperationDetail';
import type { OperationPort, SecurityStore } from './store';

const title = (op: SecurityOperationState) =>
  op.kind === 'validation'
    ? (op.plan.finding?.split('\n')[0] ?? 'Finding validation')
    : `Policy · ${projectName(op.repository)}${op.plan.path && op.plan.path !== '.' ? ` / ${op.plan.path}` : ''}`;

/** Policy drafts and every validation in this session. Validations start from a finding. */
export function Operations(props: {
  directory: string;
  port: OperationPort;
  store: SecurityStore;
  policy: boolean;
}) {
  const operations = () => props.store.operations();
  const [selected, select] = createSignal<string>();
  const [composing, setComposing] = createSignal(false);
  const current = createMemo(
    () =>
      operations().find((op) => op.operationId === selected()) ??
      operations().find((op) => op.status === 'awaiting_answers') ??
      operations()[0],
  );
  const showForm = () => props.policy && (composing() || operations().length === 0);
  return (
    <section class="gs-operations" aria-label="Policy and validation">
      <div class="gs-section-heading">
        <h3>Policy and validation</h3>
        <Show when={props.policy && !showForm()}>
          <button class="gs-button" onClick={() => setComposing(true)}>
            New policy draft
          </button>
        </Show>
      </div>
      <Show when={showForm()}>
        <PolicyForm
          directory={props.directory}
          port={props.port}
          store={props.store}
          onClose={operations().length ? () => setComposing(false) : undefined}
          onPrepared={(id) => {
            select(id);
            setComposing(false);
          }}
        />
      </Show>
      <Show when={!operations().length}>
        <p class="gs-muted">To validate a finding, open it in a completed scan.</p>
      </Show>
      <Show when={operations().length > 1}>
        <ul class="gs-list" aria-label="Recent operations">
          <For each={operations()}>
            {(op) => (
              <li>
                <button
                  class="gs-list-item"
                  aria-pressed={current()?.operationId === op.operationId}
                  onClick={() => select(op.operationId)}
                >
                  <span class="gs-list-top">
                    <span class="gs-list-title">{title(op)}</span>
                    <span class="gs-status" data-status={op.status}>
                      {statusLabel(op.status)}
                    </span>
                  </span>
                  <span class="gs-list-meta">
                    {op.kind === 'validation' ? 'Validation' : 'Policy draft'} ·{' '}
                    {shortTime(op.createdAt)}
                  </span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={!showForm() && current()?.operationId} keyed>
        {(id) => (
          <Show when={current()?.operationId === id ? current() : undefined}>
            {(op) => (
              <article class="gs-detail" aria-label="Selected operation">
                <Show when={op().kind === 'validation'}>
                  <h3 class="gs-wrap">{title(op())}</h3>
                </Show>
                <OperationDetail op={op()} port={props.port} store={props.store} />
              </article>
            )}
          </Show>
        )}
      </Show>
    </section>
  );
}

function PolicyForm(props: {
  directory: string;
  port: OperationPort;
  store: SecurityStore;
  onClose?: () => void;
  onPrepared(operationId: string): void;
}) {
  const [repository, setRepository] = createSignal(props.directory);
  const [path, setPath] = createSignal('');
  const [documents, setDocuments] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal('');
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (busy()) return;
    setBusy(true);
    setError('');
    try {
      const op = (await props.port.prepare({
        kind: 'policy',
        repository: repository().trim() || props.directory,
        contextFiles: splitPaths(documents()),
        ...(path().trim() ? { path: path().trim() } : {}),
      })) as SecurityOperationState;
      await props.store.refreshOperations();
      props.onPrepared(op.operationId);
    } catch (e) {
      setError(userError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form class="gs-form gs-composer" onSubmit={(e) => void submit(e)}>
      <p class="gs-muted">
        Drafts a security policy from the repository and asks you about anything it can't infer.
      </p>
      <Show when={error()}>
        <p class="gs-alert" role="alert">
          {error()}
        </p>
      </Show>
      <fieldset disabled={busy()}>
        <label>
          Repository
          <input
            aria-label="Operation repository"
            value={repository()}
            required
            spellcheck={false}
            onInput={(e) => {
              setRepository(e.currentTarget.value);
              setPath('');
              setDocuments('');
            }}
          />
        </label>
        <label>
          Directory <span class="gs-muted">optional</span>
          <input
            aria-label="Policy component directory"
            value={path()}
            spellcheck={false}
            onInput={(e) => setPath(e.currentTarget.value)}
            placeholder="src/api"
          />
          <span class="gs-help">Limit the draft to one part of the repository.</span>
        </label>
        <details class="gs-disclosure">
          <summary>Context files</summary>
          <label>
            Context files
            <textarea
              aria-label="Operation context files"
              value={documents()}
              onInput={(e) => setDocuments(e.currentTarget.value)}
              placeholder="docs/architecture.md"
            />
            <span class="gs-help">One path per line.</span>
          </label>
        </details>
        <div class="gs-actions">
          <button class="gs-button gs-primary" type="submit">
            {busy() ? 'Preparing…' : 'Review policy draft'}
          </button>
          <Show when={props.onClose}>
            <button class="gs-button" type="button" onClick={() => props.onClose?.()}>
              Back
            </button>
          </Show>
        </div>
      </fieldset>
    </form>
  );
}
