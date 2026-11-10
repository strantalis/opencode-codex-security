import { createMemo, createSignal, For, Show, onCleanup } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { asState, type ScanState } from './types';
import type { ScanInputs, ScanPlan } from './core/scan-plan';
import { describePlan } from './plan-view';
import {
  elapsedLabel,
  findingText,
  phaseLabel,
  progressLabel,
  projectName,
  runTitle,
  scanScope,
  splitPaths,
  userError,
} from './scan-display';
import {
  SecurityOperationsPanel,
  type OperationPort,
  type ValidationSeed,
} from './security-operations-panel';
import { securityStyles } from './security-styles';

export interface SecurityPort {
  list(): Promise<unknown>;
  prepare(input: ScanInputs): Promise<unknown>;
  start(input: { planId?: string; approveOpenAIInference?: boolean }): Promise<unknown>;
  cancel(input: { runId: string }): Promise<unknown>;
}
interface Catalog {
  engine?: string;
  instanceId?: string;
  revision?: number;
  runs: ScanState[];
  drafts: ScanState[];
  maxConcurrent: number;
  historyError?: string;
}
function readCatalog(value: unknown): Catalog {
  if (!value || typeof value !== 'object' || !('runs' in value) || !Array.isArray(value.runs))
    throw new Error(
      'Could not read scan history. Reopen Security after updating the server plugin.',
    );
  const catalog = value as Catalog;
  return {
    ...catalog,
    runs: catalog.runs.map(asState),
    drafts: (catalog.drafts ?? []).map(asState),
    maxConcurrent: catalog.maxConcurrent ?? 2,
  };
}
const clockTime = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const startedTime = (value: string | null) =>
  value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

/** Actual Desktop panel, also mounted by the isolated mock visual harness. */
export function SecurityPanel(props: {
  directory: string;
  port: SecurityPort;
  operations?: OperationPort;
  pollMs?: number;
}) {
  const [catalogStore, updateCatalog] = createStore<Catalog>({
    runs: [],
    drafts: [],
    maxConcurrent: 2,
  });
  const catalog = () => catalogStore;
  const setCatalog = (next: Catalog | ((previous: Catalog) => Catalog)) =>
    updateCatalog(
      reconcile(typeof next === 'function' ? next(catalogStore) : next, {
        key: 'runId',
        merge: true,
      }),
    );
  const [loaded, setLoaded] = createSignal(false);
  const [view, setView] = createSignal<'scans' | 'policy' | 'validation'>('scans');
  const [pendingQuestions, setPendingQuestions] = createSignal(0);
  const [validationSeed, setValidationSeed] = createSignal<ValidationSeed>();
  const [selectedId, selectRun] = createSignal<string>();
  const [composer, setComposer] = createSignal(true);
  const [preview, setPreview] = createSignal<ScanPlan>();
  const [repository, setRepository] = createSignal(props.directory);
  const [mode, setMode] = createSignal<'default' | 'standard' | 'deep'>('default');
  const [focus, setFocus] = createSignal('');
  const [paths, setPaths] = createSignal('');
  const [documents, setDocuments] = createSignal('');
  const [busy, setBusy] = createSignal<'prepare' | 'start' | 'cancel' | null>(null);
  const [error, setError] = createSignal('');
  const [connectionError, setConnectionError] = createSignal('');
  const [now, setNow] = createSignal(Date.now());
  let stopped = false,
    refreshing = false,
    touched = false,
    refreshSequence = 0;
  let acceptedSequence = 0,
    draftRevision = 0;
  const activeCount = createMemo(() => catalog().runs.filter((r) => r.status === 'running').length);
  const current = createMemo(
    () => catalog().runs.find((r) => r.runId === selectedId()) ?? catalog().runs[0],
  );
  const availableDraft = createMemo(() =>
    catalog().drafts.find((d) => d.plan && !d.planConsumed && Date.parse(d.plan.expiresAt) > now()),
  );
  const fixture = createMemo(
    () =>
      catalog().engine?.startsWith('local-patterns') ||
      catalog().runs[0]?.engine?.startsWith('local-patterns') ||
      catalog().drafts[0]?.engine?.startsWith('local-patterns'),
  );
  const refresh = async () => {
    if (refreshing || stopped) return;
    refreshing = true;
    const sequence = ++refreshSequence;
    try {
      const next = readCatalog(await props.port.list());
      if (stopped || sequence < acceptedSequence) return;
      acceptedSequence = sequence;
      setCatalog(next);
      setConnectionError('');
      if (props.operations) {
        try {
          const result = (await props.operations.list()) as { operations?: { status: string }[] };
          if (!stopped)
            setPendingQuestions(
              (result.operations ?? []).filter((op) => op.status === 'awaiting_answers').length,
            );
        } catch {
          /* A secondary operation refresh must not hide scan state. */
        }
      }
      if (!loaded()) {
        setLoaded(true);
        if (!touched && next.runs.length) setComposer(false);
      }
    } catch (e) {
      if (!stopped) setConnectionError(userError(e));
    } finally {
      refreshing = false;
    }
  };
  const edit = () => {
    draftRevision++;
    touched = true;
    setPreview(undefined);
  };
  const openComposer = () => {
    touched = true;
    setComposer(true);
    setError('');
  };
  const adoptDraft = (plan: ScanPlan) => {
    touched = true;
    setRepository(plan.repository);
    setMode(plan.inputs.mode ?? 'default');
    setFocus(plan.scanPrompt);
    setPaths(plan.scopePaths.join('\n'));
    setDocuments(plan.contextFiles.map((f) => f.path).join('\n'));
    setPreview(plan);
    setComposer(true);
    setError('');
  };
  const prepare = async (event: SubmitEvent) => {
    event.preventDefault();
    if (busy() || stopped) return;
    setBusy('prepare');
    setError('');
    const preparingRevision = draftRevision;
    try {
      const input: ScanInputs = {
        repository: repository().trim() || props.directory,
        scanPrompt: focus(),
        scopePaths: splitPaths(paths()),
        contextFiles: splitPaths(documents()),
        ...(mode() !== 'default' ? { mode: mode() as 'standard' | 'deep' } : {}),
      };
      const next = asState(await props.port.prepare(input));
      if (stopped) return;
      if (!next.plan)
        throw new Error('The server did not return a scan preview. Nothing was started.');
      if (draftRevision === preparingRevision) setPreview(next.plan);
      await refresh();
    } catch (e) {
      if (!stopped) setError(userError(e));
    } finally {
      if (!stopped) setBusy(null);
    }
  };
  const start = async () => {
    if (busy() || stopped || (!preview() && !fixture())) return;
    setBusy('start');
    setError('');
    try {
      const plan = preview();
      const run = asState(
        await props.port.start(plan ? { planId: plan.id, approveOpenAIInference: true } : {}),
      );
      if (stopped) return;
      acceptedSequence = ++refreshSequence;
      selectRun(run.runId);
      setComposer(false);
      setPreview(undefined);
      setCatalog((old) => ({
        ...old,
        runs: [run, ...old.runs.filter((r) => r.runId !== run.runId)],
      }));
      await refresh();
    } catch (e) {
      if (!stopped) setError(userError(e));
    } finally {
      if (!stopped) setBusy(null);
    }
  };
  const cancel = async (run: ScanState) => {
    if (busy() || stopped || !run.runId) return;
    setBusy('cancel');
    setError('');
    try {
      await props.port.cancel({ runId: run.runId });
      if (!stopped) await refresh();
    } catch (e) {
      if (!stopped) setError(userError(e));
    } finally {
      if (!stopped) setBusy(null);
    }
  };
  void refresh();
  const timer = setInterval(() => {
    setNow(Date.now());
    void refresh();
  }, props.pollMs ?? 1500);
  onCleanup(() => {
    stopped = true;
    clearInterval(timer);
  });

  return (
    <section class="gill-security" aria-label="Security scans">
      <style>{securityStyles}</style>
      <div class="gs-body">
        <header class="gs-header">
          <div>
            <h2>Security</h2>
            <p class="gs-muted">
              {projectName(props.directory)}
              {activeCount() > 0 ? ` · ${activeCount()} running` : ''}
            </p>
          </div>
          <Show when={view() === 'scans' && !composer()}>
            <button class="gs-button gs-primary" onClick={openComposer}>
              New scan
            </button>
          </Show>
        </header>
        <Show when={props.operations && loaded() && !fixture()}>
          <nav class="gs-tabs" aria-label="Security actions">
            <button
              aria-current={view() === 'scans' ? 'page' : undefined}
              onClick={() => setView('scans')}
            >
              Scans
            </button>
            <Show when={props.operations?.capabilities?.policy ?? !!props.operations}>
              <button
                aria-current={view() === 'policy' ? 'page' : undefined}
                onClick={() => setView('policy')}
              >
                Policy{pendingQuestions() ? ` · ${pendingQuestions()} waiting` : ''}
              </button>
            </Show>
            <Show when={props.operations?.capabilities?.validation ?? !!props.operations}>
              <button
                aria-current={view() === 'validation' ? 'page' : undefined}
                onClick={() => {
                  setValidationSeed(undefined);
                  setView('validation');
                }}
              >
                Validate
              </button>
            </Show>
          </nav>
        </Show>
        <Show when={view() !== 'scans' ? view() : undefined} keyed>
          {(kind) => (
            <SecurityOperationsPanel
              kind={kind as 'policy' | 'validation'}
              directory={props.directory}
              port={props.operations!}
              seed={validationSeed()}
            />
          )}
        </Show>
        <Show when={view() === 'scans'}>
          <Show when={pendingQuestions()}>
            <div class="gs-pending">
              <span>A policy draft needs your input.</span>
              <button class="gs-button" onClick={() => setView('policy')}>
                Answer questions
              </button>
            </div>
          </Show>
          <Show when={connectionError()}>
            <div class="gs-notice gs-error" role="alert">
              {connectionError()}{' '}
              <button class="gs-link" onClick={() => void refresh()}>
                Retry connection
              </button>
            </div>
          </Show>
          <Show when={catalog().historyError}>
            <p class="gs-notice gs-error" role="alert">
              {catalog().historyError}
            </p>
          </Show>
          <Show when={error()}>
            <p class="gs-notice gs-error" role="alert">
              {error()}
            </p>
          </Show>
          <Show when={!composer() && availableDraft()?.plan}>
            {(_plan) => (
              <div class="gs-pending">
                <span>A scan is prepared for review.</span>
                <button class="gs-button" onClick={() => adoptDraft(availableDraft()!.plan!)}>
                  Review draft
                </button>
              </div>
            )}
          </Show>
          <Show when={composer()}>
            <section class="gs-form" aria-label="New scan">
              <div class="gs-section-heading">
                <h3>New scan</h3>
                <Show when={catalog().runs.length}>
                  <button class="gs-link" disabled={!!busy()} onClick={() => setComposer(false)}>
                    Close
                  </button>
                </Show>
              </div>
              <Show
                when={!fixture()}
                fallback={
                  <>
                    <p class="gs-muted gs-small">
                      Synthetic fixture test. Local pattern matching only, with no source upload or
                      model calls.
                    </p>
                    <button
                      class="gs-button gs-primary"
                      disabled={!!busy()}
                      onClick={() => void start()}
                    >
                      Scan fixture
                    </button>
                  </>
                }
              >
                <Show
                  when={preview()}
                  fallback={
                    <form onSubmit={(event) => void prepare(event)}>
                      <Show when={availableDraft()?.plan}>
                        <button
                          type="button"
                          class="gs-link"
                          onClick={() => adoptDraft(availableDraft()!.plan!)}
                        >
                          Use scan prepared in chat
                        </button>
                      </Show>
                      <label>
                        Repository
                        <input
                          value={repository()}
                          onInput={(e) => {
                            edit();
                            setRepository(e.currentTarget.value);
                          }}
                          required
                          aria-label="Repository"
                          spellcheck={false}
                        />
                      </label>
                      <label>
                        Scan depth
                        <select
                          value={mode()}
                          onChange={(e) => {
                            edit();
                            setMode(e.currentTarget.value as 'default' | 'standard' | 'deep');
                          }}
                          aria-label="Scan depth"
                        >
                          <option value="default">Use global default</option>
                          <option value="standard">Standard</option>
                          <option value="deep">Deep</option>
                        </select>
                        <span class="gs-help">
                          Deep can take longer and cost more. This choice applies only to this scan.
                        </span>
                      </label>
                      <label>
                        What should this scan focus on? <span class="gs-muted">Optional</span>
                        <textarea
                          value={focus()}
                          maxLength={8000}
                          onInput={(e) => {
                            edit();
                            setFocus(e.currentTarget.value);
                          }}
                          placeholder="For example, review authorization and tenant isolation."
                          aria-label="Scan focus"
                        />
                      </label>
                      <details>
                        <summary>Scope and supporting documents</summary>
                        <label>
                          Paths to review
                          <textarea
                            value={paths()}
                            onInput={(e) => {
                              edit();
                              setPaths(e.currentTarget.value);
                            }}
                            placeholder={'src/auth\nsrc/api'}
                            aria-label="Scope paths"
                          />
                          <span class="gs-help">
                            One repository-relative path per line. Leave blank for the whole
                            repository.
                          </span>
                        </label>
                        <label>
                          Context files
                          <textarea
                            value={documents()}
                            onInput={(e) => {
                              edit();
                              setDocuments(e.currentTarget.value);
                            }}
                            placeholder={'docs/architecture.md\nSECURITY.md'}
                            aria-label="Context files"
                          />
                          <span class="gs-help">
                            Optional text documents within this repository. Do not include secrets.
                          </span>
                        </label>
                      </details>
                      <div class="gs-actions">
                        <button
                          type="submit"
                          class="gs-button gs-primary"
                          disabled={!!busy() || !loaded()}
                        >
                          {busy() === 'prepare' ? 'Preparing preview…' : 'Review scan'}
                        </button>
                        <span class="gs-muted gs-small">Nothing is sent to OpenAI yet.</span>
                      </div>
                    </form>
                  }
                >
                  {(plan) => (
                    <div class="gs-review">
                      <h3>Review this scan</h3>
                      <dl>
                        <dt>Repository</dt>
                        <dd>{plan().repository}</dd>
                        <dt>Scope</dt>
                        <dd>{plan().scopePaths.join(', ') || 'Whole repository'}</dd>
                        <dt>Depth</dt>
                        <dd>{plan().settings.scan.mode === 'deep' ? 'Deep' : 'Standard'}</dd>
                        <Show when={plan().scanPrompt}>
                          <dt>Focus</dt>
                          <dd>{plan().scanPrompt}</dd>
                        </Show>
                        <Show when={plan().contextFiles.length}>
                          <dt>Supporting documents</dt>
                          <dd>
                            {plan()
                              .contextFiles.map((f) => f.path)
                              .join(', ')}
                          </dd>
                        </Show>
                      </dl>
                      <details class="gs-advanced">
                        <summary>Model and advanced settings</summary>
                        <dl class="gs-details-list">
                          <dt>Model</dt>
                          <dd>
                            {plan().settings.codex.model} · {plan().settings.codex.reasoningEffort}{' '}
                            reasoning
                          </dd>
                          <dt>Daybreak</dt>
                          <dd>{plan().settings.codex.daybreak ? 'On' : 'Off'}</dd>
                          <dt>Global configuration</dt>
                          <dd>{plan().globalConfigFile}</dd>
                        </dl>
                        <p class="gs-muted">Model and account access have not been verified.</p>
                        <details>
                          <summary>Full approval details</summary>
                          <pre>{describePlan(plan())}</pre>
                        </details>
                      </details>
                      <div class="gs-approval">
                        <Show
                          when={plan().mock}
                          fallback={
                            <>
                              <p>
                                Repository source and listed context will be sent to OpenAI. Results
                                are stored locally.
                              </p>
                              <p>
                                Estimated cost stop:{' '}
                                <strong>USD {plan().settings.scan.maxCostUsd}</strong> for this
                                scan. This is not a hard cap; in-flight usage may exceed it.
                              </p>
                              <p>
                                Only the focus and documents above are added as context, not your
                                conversation. Scope guides the review; it is not a filesystem
                                sandbox.
                              </p>
                            </>
                          }
                        >
                          <p>
                            Mock SDK test. Synthetic responses only; no model calls or source
                            uploads.
                          </p>
                        </Show>
                      </div>
                      <Show when={activeCount() >= catalog().maxConcurrent}>
                        <p role="status" class="gs-small gs-muted">
                          {catalog().maxConcurrent} scans are already running. Start this scan after
                          one finishes.
                        </p>
                      </Show>
                      <Show when={Date.parse(plan().expiresAt) <= now()}>
                        <p class="gs-small gs-error">
                          This preview has expired. Edit and review it again.
                        </p>
                      </Show>
                      <div class="gs-actions">
                        <button
                          class="gs-button gs-primary"
                          disabled={
                            !!busy() ||
                            activeCount() >= catalog().maxConcurrent ||
                            Date.parse(plan().expiresAt) <= now()
                          }
                          onClick={() => void start()}
                        >
                          {busy() === 'start'
                            ? 'Starting…'
                            : plan().mock
                              ? 'Start mock scan'
                              : 'Approve and start'}
                        </button>
                        <button
                          class="gs-button"
                          disabled={!!busy()}
                          onClick={() => setPreview(undefined)}
                        >
                          Edit scan
                        </button>
                      </div>
                    </div>
                  )}
                </Show>
              </Show>
            </section>
          </Show>
          <Show
            when={catalog().runs.length}
            fallback={
              <Show when={loaded() && !composer()}>
                <div class="gs-empty">
                  <h3>No scans yet</h3>
                  <p>Start a scan to review findings and follow its activity here.</p>
                </div>
              </Show>
            }
          >
            <section class="gs-runs" aria-label="Scan history">
              <div class="gs-section-heading">
                <h3>Scans</h3>
                <span>
                  {activeCount()
                    ? `${activeCount()} of ${catalog().maxConcurrent} running`
                    : `${catalog().runs.length} recent`}
                </span>
              </div>
              <ul class="gs-run-list">
                <For each={catalog().runs}>
                  {(run) => (
                    <li>
                      <button
                        class="gs-run-button"
                        aria-pressed={current()?.runId === run.runId}
                        onClick={() => selectRun(run.runId)}
                      >
                        <div class="gs-run-top">
                          <span class="gs-run-title">{runTitle(run)}</span>
                          <span class="gs-status" data-status={run.status}>
                            {run.status === 'error' ? 'Failed' : run.status}
                          </span>
                        </div>
                        <div class="gs-run-meta">
                          {projectName(run.repository)} ·{' '}
                          {run.mode ?? run.plan?.settings.scan.mode ?? 'Fixture'} · {scanScope(run)}{' '}
                          · {startedTime(run.startedAt)}
                          {run.status === 'completed'
                            ? ` · ${run.findings.length} ${run.findings.length === 1 ? 'finding' : 'findings'}`
                            : ''}
                        </div>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </section>
          </Show>
          <Show when={current()}>
            {(run) => (
              <article class="gs-detail" aria-label="Selected scan">
                <div class="gs-detail-title">
                  <h3>{runTitle(run())}</h3>
                  <p>{run().repository}</p>
                </div>
                <div class="gs-progress-heading">
                  <strong>{phaseLabel(run().phase)}</strong>
                  <span>{elapsedLabel(run().startedAt, run().finishedAt, now())}</span>
                </div>
                <Show when={run().status === 'running' && run().progress.total > 0}>
                  <progress
                    class="gs-progress"
                    aria-label="Reported phase progress"
                    value={run().progress.done}
                    max={run().progress.total}
                  />
                </Show>
                <Show when={run().status === 'running'}>
                  <div class="gs-progress-meta">
                    <span>{progressLabel(run())}</span>
                    <span>Counts are for the current phase</span>
                  </div>
                  <p class="gs-live-note">
                    Findings appear when the scan finishes. Activity below updates as the SDK
                    reports it.
                  </p>
                </Show>
                <div class="gs-facts">
                  <Show when={run().estimatedCostUsd !== undefined}>
                    <span>Estimated usage USD {(run().estimatedCostUsd ?? 0).toFixed(2)}</span>
                  </Show>
                  <Show when={run().workers}>
                    <span>
                      Workers started: {run().workers?.started}
                      {run().workers?.planned !== undefined
                        ? ` of ${run().workers?.planned} planned`
                        : ''}
                    </span>
                  </Show>
                  <Show when={run().status === 'running' && run().deepProgress}>
                    <span>
                      {run().deepProgress?.completed} deep passes complete ·{' '}
                      {run().deepProgress?.active} active
                    </span>
                  </Show>
                </div>
                <Show when={run().status === 'running'}>
                  <button class="gs-button" disabled={!!busy()} onClick={() => void cancel(run())}>
                    {busy() === 'cancel' ? 'Requesting stop…' : 'Cancel this scan'}
                  </button>
                </Show>
                <Show when={run().error}>
                  <p class="gs-notice gs-error" role="alert">
                    {run().error}
                  </p>
                </Show>
                <Show when={run().status === 'cancelled'}>
                  <p class="gs-notice">
                    Cancelled. This scan is incomplete and is not a clean result.
                  </p>
                </Show>
                <Show when={run().status === 'completed' && run().findings.length === 0}>
                  <div class="gs-empty">
                    <h3>No findings reported</h3>
                    <p>
                      This scan completed without reported findings. That does not guarantee the
                      repository is secure.
                    </p>
                  </div>
                </Show>
                <Show when={run().findings.length}>
                  <section class="gs-findings" aria-label="Scan findings">
                    <div class="gs-section-heading">
                      <h3>Findings</h3>
                      <span>{run().findings.length} to review</span>
                    </div>
                    <For each={run().findings}>
                      {(finding) => (
                        <details>
                          <summary>
                            <span class="gs-severity" data-severity={finding.severity}>
                              {finding.severity}
                            </span>{' '}
                            {finding.title}
                          </summary>
                          <div class="gs-finding-location">
                            {finding.path}:{finding.line} · {finding.cwe}
                          </div>
                          <p>{finding.summary}</p>
                          <Show when={finding.evidence}>
                            <pre>{finding.evidence}</pre>
                          </Show>
                          <strong class="gs-small">Suggested next step</strong>
                          <p>{finding.remediation}</p>
                          <p class="gs-muted gs-small">
                            Confidence: {finding.confidence}. Review the evidence before making
                            changes.
                          </p>
                          <Show
                            when={
                              props.operations &&
                              (props.operations.capabilities?.validation ?? true) &&
                              !fixture()
                            }
                          >
                            <button
                              class="gs-button"
                              onClick={() => {
                                setValidationSeed({
                                  repository: run().repository,
                                  finding: findingText(finding),
                                });
                                setView('validation');
                              }}
                            >
                              Validate this finding
                            </button>
                          </Show>
                        </details>
                      )}
                    </For>
                    <Show when={run().skipped}>
                      <p class="gs-muted gs-small">
                        {run().skipped} informational items are available in the full local SDK
                        artifacts.
                      </p>
                    </Show>
                  </section>
                </Show>
                <section class="gs-activity" aria-label="Scan activity">
                  <div class="gs-section-heading">
                    <h3>Activity</h3>
                    <span>Latest first</span>
                  </div>
                  <Show
                    when={run().events.length}
                    fallback={
                      <p class="gs-muted gs-small">Waiting for the SDK to report activity.</p>
                    }
                  >
                    <ol class="gs-activity-list">
                      <For each={[...run().events].reverse().slice(0, 20)}>
                        {(event) => (
                          <li>
                            <time dateTime={event.time}>{clockTime(event.time)}</time>
                            <span>{event.message}</span>
                          </li>
                        )}
                      </For>
                    </ol>
                  </Show>
                </section>
                <details class="gs-advanced">
                  <summary>Scan details</summary>
                  <dl class="gs-details-list">
                    <dt>Run ID</dt>
                    <dd class="gs-id">{run().runId}</dd>
                    <Show when={run().scanId}>
                      <dt>SDK scan ID</dt>
                      <dd class="gs-id">{run().scanId}</dd>
                    </Show>
                    <dt>Scope</dt>
                    <dd>{scanScope(run())}</dd>
                    <dt>Depth</dt>
                    <dd>
                      {run().mode ?? run().plan?.settings.scan.mode ?? 'Fixture pattern checks'}
                    </dd>
                    <Show when={run().model ?? run().plan?.settings.codex.model}>
                      <dt>Model</dt>
                      <dd>{run().model ?? run().plan?.settings.codex.model}</dd>
                    </Show>
                    <Show when={run().plan?.scanPrompt}>
                      <dt>Focus</dt>
                      <dd>{run().plan?.scanPrompt}</dd>
                    </Show>
                    <Show when={run().plan?.contextFiles.length}>
                      <dt>Supporting documents</dt>
                      <dd>
                        {run()
                          .plan?.contextFiles.map((f) => f.path)
                          .join(', ')}
                      </dd>
                    </Show>
                  </dl>
                  <Show when={run().archived}>
                    <p class="gs-muted">Restored from local history.</p>
                  </Show>
                </details>
              </article>
            )}
          </Show>
        </Show>
        <footer class="gs-footer">
          {fixture()
            ? 'Fixture engine · not a security assessment'
            : 'Codex Security · local results, OpenAI inference'}
          <Show when={catalog().runs.length}>
            {' '}
            · Up to {catalog().maxConcurrent} concurrent scans per project
          </Show>
        </footer>
      </div>
    </section>
  );
}
