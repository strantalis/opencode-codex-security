import { createSignal, For, Show } from 'solid-js';
import type { SecurityOperationState } from '../core/security-operations';
import { describeInferenceRoute, inferenceDestination } from '../plan-view';
import { fixStatusLabel, elapsedLabel, phaseLabel, userError } from '../scan-display';
import { dispositionLabel, statusLabel } from './format';
import type { OperationPort, SecurityStore } from './store';

const disposition = (result: unknown) => (result as { disposition: string }).disposition;

/**
 * One policy draft or finding validation: approval, progress, owner questions and result.
 * Mount one instance per operation so local inputs reset when the operation changes.
 */
export function OperationDetail(props: {
  op: SecurityOperationState;
  port: OperationPort;
  store: SecurityStore;
  /** Inline under a finding: skip the target line, which the finding already shows. */
  compact?: boolean;
}) {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal('');
  const op = () => props.op;
  const validation = () => op().kind === 'validation';
  const fix = () => op().kind === 'fix';
  const active = () => op().status === 'running' || op().status === 'awaiting_answers';
  const expired = () => Date.parse(op().plan.expiresAt) <= props.store.now();
  const perform = async (action: () => Promise<unknown>) => {
    if (busy()) return;
    setBusy(true);
    setError('');
    try {
      await action();
      await props.store.refreshOperations();
    } catch (e) {
      setError(userError(e));
    } finally {
      setBusy(false);
    }
  };
  const start = () => perform(() => props.port.start({ operationId: op().operationId }));

  return (
    <div class="gs-operation" classList={{ 'gs-operation-compact': props.compact }}>
      <div class="gs-operation-head">
        <strong>
          {{ policy: 'Policy draft', validation: 'Validation', fix: 'Fix' }[op().kind]}
        </strong>
        <span class="gs-status" data-status={op().status}>
          {statusLabel(op().status)}
        </span>
      </div>
      <Show when={!props.compact}>
        <p class="gs-muted gs-wrap">
          {op().repository}
          {op().plan.path && op().plan.path !== '.' ? ` / ${op().plan.path}` : ''}
        </p>
      </Show>
      <Show when={error() || op().error}>
        <p class="gs-alert" role="alert">
          {error() || op().error}
        </p>
      </Show>

      <Show when={op().status === 'prepared'}>
        <div class="gs-approval">
          <Show
            when={!op().plan.mock}
            fallback={<p>Mock operation: synthetic results, no model calls.</p>}
          >
            <p>
              Approving sends repository source{validation() || fix() ? ', this finding' : ''} and
              any context files to {inferenceDestination(op().plan.settings)}.
            </p>
            <p>
              <strong>{op().plan.costNotice}</strong>
            </p>
            <Show when={op().kind === 'policy'}>
              <p>You get a draft to review. Nothing is written to the repository.</p>
            </Show>
            <Show when={fix()}>
              <p>
                The fix is written in a copy of the last commit. Your files change only if you apply
                the diff.
              </p>
            </Show>
          </Show>
          <details class="gs-disclosure">
            <summary>Model and route</summary>
            <p>
              {op().plan.settings.codex.model} · {op().plan.settings.codex.reasoningEffort}{' '}
              reasoning
            </p>
            <p>{describeInferenceRoute(op().plan.settings)}</p>
          </details>
        </div>
        <Show when={expired()}>
          <p class="gs-note gs-danger">This preview has expired. Prepare it again.</p>
        </Show>
        <div class="gs-actions">
          <button
            class="gs-button gs-primary"
            disabled={busy() || expired()}
            onClick={() => void start()}
          >
            {busy() ? 'Starting…' : op().plan.mock ? 'Start mock run' : 'Approve and start'}
          </button>
        </div>
      </Show>

      <Show when={active()}>
        <p class="gs-muted gs-tabular">
          {phaseLabel(op().phase)} · {elapsedLabel(op().startedAt, null, props.store.now())}
          <Show when={op().estimatedCostUsd !== undefined}>
            {' '}
            · estimated USD {(op().estimatedCostUsd ?? 0).toFixed(2)}
          </Show>
        </p>
      </Show>

      <Show when={op().question?.id} keyed>
        {(questionId) => (
          <Questions
            questions={op().question?.questions ?? []}
            destination={inferenceDestination(op().plan.settings)}
            busy={busy()}
            onAnswer={(answer) =>
              perform(() =>
                props.port.answer({ operationId: op().operationId, questionId, answer }),
              )
            }
          />
        )}
      </Show>

      <Show when={active()}>
        <div class="gs-actions">
          <button
            class="gs-button"
            disabled={busy()}
            onClick={() => void perform(() => props.port.cancel({ operationId: op().operationId }))}
          >
            Cancel
          </button>
        </div>
      </Show>

      <Show when={op().result}>
        {(result) => {
          const r = result();
          if (r.kind === 'fix')
            return (
              <div class="gs-result">
                <p class="gs-disposition" data-disposition={r.status}>
                  {fixStatusLabel(r.status)}
                  {r.resolution === 'applied' || r.resolution === 'discarded'
                    ? ` · ${r.resolution}`
                    : ''}
                </p>
                <Show when={r.report}>
                  <p class="gs-report">{r.report}</p>
                </Show>
                <Show when={r.diff} fallback={<p class="gs-muted">No files were changed.</p>}>
                  <pre aria-label="Proposed change">{r.diff}</pre>
                </Show>
                <Show when={r.truncated}>
                  <p class="gs-note">Diff truncated here; applying uses the whole change.</p>
                </Show>
                <Show when={r.resolution === 'pending'}>
                  <div class="gs-actions">
                    <button
                      class="gs-button gs-primary"
                      disabled={busy()}
                      onClick={() =>
                        void perform(() =>
                          props.port.resolve({ operationId: op().operationId, action: 'apply' }),
                        )
                      }
                    >
                      Apply to working tree
                    </button>
                    <button
                      class="gs-button"
                      disabled={busy()}
                      onClick={() =>
                        void perform(() =>
                          props.port.resolve({ operationId: op().operationId, action: 'discard' }),
                        )
                      }
                    >
                      Discard
                    </button>
                    <span class="gs-muted">Applying does not commit.</span>
                  </div>
                </Show>
              </div>
            );
          return (
            <div class="gs-result">
              <Show
                when={r.kind === 'policy' ? r : undefined}
                fallback={
                  <p class="gs-disposition" data-disposition={disposition(r)}>
                    {dispositionLabel(disposition(r))} · static source review
                  </p>
                }
              >
                {(policy) => (
                  <p class="gs-muted">
                    Draft for {policy().targetPath}. Not written to disk; copy what you want to
                    keep.
                  </p>
                )}
              </Show>
              <Show
                when={r.kind === 'policy' ? r.content : undefined}
                fallback={<p class="gs-report">{r.kind === 'validation' ? r.report : ''}</p>}
              >
                {(content) => <pre>{content()}</pre>}
              </Show>
              <Show when={r.kind === 'policy' ? r.reviewNotes : undefined}>
                {(notes) => <For each={notes()}>{(note) => <p class="gs-muted">{note}</p>}</For>}
              </Show>
              <Show when={r.truncated}>
                <p class="gs-note">
                  Preview truncated. The full result is in the local SDK output.
                </p>
              </Show>
            </div>
          );
        }}
      </Show>
    </div>
  );
}

function Questions(props: {
  questions: string[];
  destination: string;
  busy: boolean;
  onAnswer(answer: string): Promise<void>;
}) {
  const [answer, setAnswer] = createSignal('');
  return (
    <form
      class="gs-form gs-questions"
      onSubmit={(e) => {
        e.preventDefault();
        void props.onAnswer(answer());
      }}
    >
      <h4>Questions from the policy draft</h4>
      <ol>
        <For each={props.questions}>{(text) => <li>{text}</li>}</For>
      </ol>
      <label>
        Your answer
        <textarea
          aria-label="Answer security questions"
          maxLength={8000}
          required
          value={answer()}
          disabled={props.busy}
          onInput={(e) => setAnswer(e.currentTarget.value)}
        />
        <span class="gs-help">
          Answer each question, or say you don't know. Sent to {props.destination}.
        </span>
      </label>
      <div class="gs-actions">
        <button
          class="gs-button gs-primary"
          disabled={props.busy || !answer().trim()}
          type="submit"
        >
          Send answer
        </button>
      </div>
    </form>
  );
}
