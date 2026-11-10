import { createEffect, createMemo, createSignal, For, Show, on, onCleanup } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import type {
  SecurityOperationInputs,
  SecurityOperationState,
  SecurityOperationApproval,
} from './core/security-operations';
import { elapsedLabel, phaseLabel, projectName, splitPaths, userError } from './scan-display';

export interface OperationPort {
  capabilities?: { policy: boolean; validation: boolean; questionAnswers: boolean };
  list(): Promise<unknown>;
  prepare(input: SecurityOperationInputs): Promise<unknown>;
  start(input: SecurityOperationApproval): Promise<unknown>;
  answer(input: { operationId: string; questionId: string; answer: string }): Promise<unknown>;
  cancel(input: { operationId: string }): Promise<unknown>;
}
export interface ValidationSeed {
  repository: string;
  finding: string;
}
export function SecurityOperationsPanel(props: {
  kind: 'policy' | 'validation';
  directory: string;
  port: OperationPort;
  seed?: ValidationSeed;
}) {
  const [data, setData] = createStore<{ operations: SecurityOperationState[] }>({ operations: [] });
  const [selected, select] = createSignal<string>();
  const [form, setForm] = createSignal(true);
  const [repository, setRepository] = createSignal(props.seed?.repository ?? props.directory);
  const [path, setPath] = createSignal('');
  const [documents, setDocuments] = createSignal('');
  const [finding, setFinding] = createSignal(props.seed?.finding ?? '');
  const [seeded, setSeeded] = createSignal(!!props.seed);
  const [answer, setAnswer] = createSignal('');
  const [uncapped, setUncapped] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal('');
  const [now, setNow] = createSignal(Date.now());
  const [loaded, setLoaded] = createSignal(false);
  let stopped = false,
    polling = false,
    contextRevision = 0;
  const resetForm = (seed?: ValidationSeed) => {
    contextRevision++;
    setRepository(seed?.repository ?? props.directory);
    setSeeded(!!seed);
    setFinding(seed?.finding ?? '');
    setPath('');
    setDocuments('');
    setAnswer('');
    setUncapped(false);
    setError('');
    select(undefined);
    setForm(true);
  };
  createEffect(
    on(
      () => [props.kind, props.directory, props.seed] as const,
      () => resetForm(props.seed),
      { defer: true },
    ),
  );
  const operations = createMemo(() => data.operations.filter((op) => op.kind === props.kind));
  const current = createMemo(
    () =>
      operations().find((op) => op.operationId === selected()) ??
      operations().find((op) => op.status === 'awaiting_answers') ??
      operations()[0],
  );
  const label = () => (props.kind === 'policy' ? 'Policy draft' : 'Finding validation');
  createEffect(() => {
    void current()?.question?.id;
    setAnswer('');
  });
  createEffect(() => {
    void current()?.operationId;
    setUncapped(false);
  });
  const refresh = async () => {
    if (stopped || polling) return;
    polling = true;
    try {
      const response = await props.port.list();
      const next = Array.isArray(response)
        ? response
        : (response as { operations?: SecurityOperationState[] })?.operations;
      if (!Array.isArray(next)) throw new Error('Could not read security operations.');
      if (!stopped) {
        setData('operations', reconcile(next, { key: 'operationId', merge: true }));
        if (!loaded()) {
          setLoaded(true);
          if (!props.seed && next.some((op) => op.kind === props.kind)) setForm(false);
        }
      }
    } catch (e) {
      if (!stopped) setError(userError(e));
    } finally {
      polling = false;
    }
  };
  const perform = async (action: () => Promise<unknown>) => {
    if (busy() || stopped) return;
    setBusy(true);
    setError('');
    try {
      await action();
      if (!stopped) await refresh();
    } catch (e) {
      if (!stopped) setError(userError(e));
    } finally {
      if (!stopped) setBusy(false);
    }
  };
  const prepare = (event: SubmitEvent) => {
    event.preventDefault();
    const preparingRevision = contextRevision;
    void perform(async () => {
      const op = (await props.port.prepare({
        kind: props.kind,
        repository: repository().trim() || props.directory,
        contextFiles: splitPaths(documents()),
        ...(props.kind === 'policy'
          ? path().trim()
            ? { path: path().trim() }
            : {}
          : { finding: finding() }),
      })) as SecurityOperationState;
      if (!stopped && preparingRevision === contextRevision) {
        select(op.operationId);
        setData(
          'operations',
          reconcile(
            [op, ...data.operations.filter((item) => item.operationId !== op.operationId)],
            { key: 'operationId', merge: true },
          ),
        );
        setForm(false);
      }
    });
  };
  const start = (op: SecurityOperationState) =>
    void perform(() =>
      props.port.start({
        operationId: op.operationId,
        approveOpenAIInference: true,
        ...(op.kind === 'validation' ? { approveUncappedValidation: true as const } : {}),
      }),
    );
  void refresh();
  const timer = setInterval(() => {
    setNow(Date.now());
    void refresh();
  }, 1500);
  onCleanup(() => {
    stopped = true;
    clearInterval(timer);
  });
  return (
    <section aria-label={label()}>
      <div class="gs-section-heading">
        <h3>{label()}</h3>
        <Show when={!form()}>
          <button class="gs-button" disabled={busy()} onClick={() => resetForm()}>
            New {props.kind === 'policy' ? 'draft' : 'validation'}
          </button>
        </Show>
      </div>
      <p class="gs-muted gs-small">
        {props.kind === 'policy'
          ? 'Build security guidance from the repository, with questions when context is missing. Draft only: existing files stay unchanged.'
          : 'Assess a finding against the source. This does not run an exploit or prove runtime reproduction.'}
      </p>
      <Show when={error()}>
        <p class="gs-notice gs-error" role="alert">
          {error()}
        </p>
      </Show>
      <Show when={form()}>
        <form class="gs-form" onSubmit={prepare}>
          <label>
            Target repository
            <input
              aria-label="Operation repository"
              value={repository()}
              required
              disabled={busy()}
              onInput={(event) => {
                setRepository(event.currentTarget.value);
                setPath('');
                setDocuments('');
                setFinding('');
                setSeeded(false);
              }}
            />
            <span class="gs-help">
              {seeded()
                ? 'Starts from the selected finding’s repository. Check the target before review.'
                : 'Defaults to this workspace. Changing it affects only this operation.'}
            </span>
          </label>
          <Show
            when={props.kind === 'policy'}
            fallback={
              <label>
                Finding to assess
                <textarea
                  aria-label="Finding to assess"
                  value={finding()}
                  required
                  maxLength={16000}
                  disabled={busy()}
                  onInput={(event) => setFinding(event.currentTarget.value)}
                  placeholder="Describe the suspected issue, location, and evidence."
                />
                <span class="gs-help">Use finding text or JSON. Do not include credentials.</span>
              </label>
            }
          >
            <label>
              Component directory <span class="gs-muted">Optional</span>
              <input
                aria-label="Policy component directory"
                value={path()}
                disabled={busy()}
                onInput={(event) => setPath(event.currentTarget.value)}
                placeholder="src/api"
              />
              <span class="gs-help">
                Relative to the repository. Leave blank for the whole project.
              </span>
            </label>
          </Show>
          <details>
            <summary>Supporting documents</summary>
            <label>
              Context files
              <textarea
                aria-label="Operation context files"
                value={documents()}
                disabled={busy()}
                onInput={(event) => setDocuments(event.currentTarget.value)}
                placeholder="docs/architecture.md"
              />
              <span class="gs-help">
                One repository-relative text document per line. Do not include secrets.
              </span>
            </label>
          </details>
          <div class="gs-actions">
            <button class="gs-button gs-primary" disabled={busy()} type="submit">
              {busy()
                ? 'Preparing…'
                : 'Review ' + (props.kind === 'policy' ? 'policy draft' : 'validation')}
            </button>
            <Show when={operations().length}>
              <button
                class="gs-button"
                type="button"
                disabled={busy()}
                onClick={() => setForm(false)}
              >
                Back
              </button>
            </Show>
          </div>
          <p class="gs-muted gs-small">Preparation makes no model calls.</p>
        </form>
      </Show>
      <Show when={operations().length > 1}>
        <ul class="gs-run-list" aria-label="Recent operations">
          <For each={operations()}>
            {(op) => (
              <li>
                <button
                  class="gs-run-button"
                  aria-pressed={current()?.operationId === op.operationId}
                  onClick={() => {
                    select(op.operationId);
                    setForm(false);
                  }}
                >
                  <div class="gs-run-top">
                    <span class="gs-run-title">
                      {projectName(op.repository)}
                      {op.plan.path ? ' / ' + op.plan.path : ''}
                    </span>
                    <span class="gs-status" data-status={op.status}>
                      {op.status === 'awaiting_answers'
                        ? 'Needs your answer'
                        : phaseLabel(op.status)}
                    </span>
                  </div>
                  <div class="gs-run-target">Target: {op.repository}</div>
                  <div class="gs-run-meta">
                    {new Date(op.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    · {op.operationId.slice(0, 8)}
                  </div>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={!form() && current()}>
        {(op) => (
          <article class="gs-detail" aria-label="Selected operation">
            <div class="gs-detail-title">
              <h3>{phaseLabel(op().phase)}</h3>
              <p>
                Target: {op().repository}
                {op().plan.path ? ' / ' + op().plan.path : ''}
              </p>
            </div>
            <Show when={op().status === 'prepared'}>
              <div class="gs-review">
                <h3>
                  Review {props.kind === 'policy' ? 'policy generation' : 'source validation'}
                </h3>
                <dl>
                  <dt>Repository</dt>
                  <dd>{op().repository}</dd>
                  <Show when={op().plan.path}>
                    <dt>Component</dt>
                    <dd>{op().plan.path}</dd>
                  </Show>
                  <Show when={op().plan.contextFiles.length}>
                    <dt>Supporting documents</dt>
                    <dd>
                      {op()
                        .plan.contextFiles.map((file) => file.path)
                        .join(', ')}
                    </dd>
                  </Show>
                </dl>
                <Show when={op().kind === 'validation'}>
                  <details class="gs-advanced">
                    <summary>Finding to assess</summary>
                    <pre>{op().plan.finding}</pre>
                  </details>
                </Show>
                <div class="gs-approval">
                  <Show
                    when={op().plan.mock}
                    fallback={
                      <>
                        <p>
                          Repository source{op().kind === 'validation' ? ', the finding,' : ''} and
                          selected context will be sent to OpenAI.
                        </p>
                        <p>
                          <strong>{op().plan.costNotice}</strong>
                        </p>
                        <p>
                          {op().kind === 'policy'
                            ? 'A policy draft will be returned for review. No files will be applied.'
                            : 'This is static source assessment, not runtime reproduction. No patch will be applied.'}
                        </p>
                      </>
                    }
                  >
                    <p>Mock operation only. No model calls or source uploads.</p>
                  </Show>
                </div>
                <Show when={op().kind === 'validation' && !op().plan.mock}>
                  <label class="gs-check">
                    <input
                      type="checkbox"
                      checked={uncapped()}
                      onChange={(e) => setUncapped(e.currentTarget.checked)}
                    />{' '}
                    I approve validation without a cost ceiling.
                  </label>
                </Show>
                <details class="gs-advanced">
                  <summary>Model settings</summary>
                  <p>
                    {op().plan.settings.codex.model} · {op().plan.settings.codex.reasoningEffort}{' '}
                    reasoning · Daybreak {op().plan.settings.codex.daybreak ? 'on' : 'off'}
                  </p>
                  <p class="gs-muted">
                    Account and model access are not verified. {op().plan.globalConfigFile}
                  </p>
                </details>
                <Show when={Date.parse(op().plan.expiresAt) <= now()}>
                  <p class="gs-error">This preview expired. Prepare a new one before starting.</p>
                </Show>
                <div class="gs-actions">
                  <button
                    class="gs-button gs-primary"
                    disabled={
                      busy() ||
                      Date.parse(op().plan.expiresAt) <= now() ||
                      (op().kind === 'validation' && !op().plan.mock && !uncapped())
                    }
                    onClick={() => start(op())}
                  >
                    {busy()
                      ? 'Starting…'
                      : op().plan.mock
                        ? 'Start mock operation'
                        : 'Approve and start'}
                  </button>
                  <button
                    class="gs-button"
                    disabled={busy()}
                    onClick={() => {
                      setRepository(op().repository);
                      setPath(op().plan.path ?? '');
                      setDocuments(
                        op()
                          .plan.contextFiles.map((file) => file.path)
                          .join('\n'),
                      );
                      setFinding(op().plan.finding ?? '');
                      setForm(true);
                    }}
                  >
                    Edit request
                  </button>
                </div>
              </div>
            </Show>
            <Show when={op().status === 'running' || op().status === 'awaiting_answers'}>
              <div class="gs-facts">
                <span>{elapsedLabel(op().startedAt, null, now())}</span>
                <Show when={op().estimatedCostUsd !== undefined}>
                  <span>Estimated usage USD {(op().estimatedCostUsd ?? 0).toFixed(2)}</span>
                </Show>
              </div>
            </Show>
            <Show when={op().question}>
              {(question) => (
                <form
                  class="gs-form gs-questions"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const q = question();
                    void perform(() =>
                      props.port.answer({
                        operationId: op().operationId,
                        questionId: q.id,
                        answer: answer(),
                      }),
                    );
                  }}
                >
                  <h3>Your input is needed</h3>
                  <ol>
                    <For each={question().questions}>{(text) => <li>{text}</li>}</For>
                  </ol>
                  <label>
                    Your answer
                    <textarea
                      aria-label="Answer security questions"
                      maxLength={8000}
                      required
                      value={answer()}
                      disabled={busy()}
                      onInput={(e) => setAnswer(e.currentTarget.value)}
                    />
                    <span class="gs-help">
                      Answer each question, or say what is unknown. Your answer goes to OpenAI for
                      this operation; do not include secrets.
                    </span>
                  </label>
                  <button
                    class="gs-button gs-primary"
                    disabled={busy() || !answer().trim()}
                    type="submit"
                  >
                    Send answer and continue
                  </button>
                </form>
              )}
            </Show>
            <Show when={op().status === 'running' || op().status === 'awaiting_answers'}>
              <button
                class="gs-button"
                disabled={busy()}
                onClick={() =>
                  void perform(() => props.port.cancel({ operationId: op().operationId }))
                }
              >
                Cancel this operation
              </button>
            </Show>
            <Show when={op().error}>
              <p class="gs-notice gs-error" role="alert">
                {op().error}
              </p>
            </Show>
            <Show when={op().status === 'cancelled'}>
              <p class="gs-notice">Cancelled. No completed assessment is available.</p>
            </Show>
            <Show when={op().result}>
              {(result) => (
                <section class="gs-operation-result">
                  <h3>{result().kind === 'policy' ? 'Policy draft' : 'Source assessment'}</h3>
                  <Show
                    when={result().kind === 'policy'}
                    fallback={
                      <p>
                        <strong>
                          {phaseLabel((result() as { disposition: string }).disposition)}
                        </strong>{' '}
                        · Static review, not runtime reproduction.
                      </p>
                    }
                  >
                    <p class="gs-muted gs-small">
                      Draft only. Review it before applying. No repository files were changed.
                    </p>
                  </Show>
                  <pre>
                    {result().kind === 'policy'
                      ? (result() as { content: string }).content
                      : (result() as { report: string }).report}
                  </pre>
                  <Show when={result().kind === 'policy'}>
                    <For each={(result() as { reviewNotes: string[] }).reviewNotes}>
                      {(note) => <p class="gs-muted gs-small">{note}</p>}
                    </For>
                  </Show>
                  <Show when={result().truncated}>
                    <p class="gs-notice">
                      This preview is truncated. Read the full local SDK artifact before relying on
                      it.
                    </p>
                  </Show>
                </section>
              )}
            </Show>
            <details class="gs-advanced">
              <summary>Operation details</summary>
              <p class="gs-id">{op().operationId}</p>
              <p class="gs-muted">
                {op().answeredQuestionCount} questions answered. Operation history is kept for this
                server session.
              </p>
            </details>
          </article>
        )}
      </Show>
    </section>
  );
}
