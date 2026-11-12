import { createSignal, Show } from 'solid-js';
import { asState } from '../types';
import type { ScanInputs, ScanPlan } from '../core/scan-plan';
import { splitPaths, userError } from '../scan-display';
import { ScanReview } from './ScanReview';
import type { SecurityPort, SecurityStore } from './store';

type Mode = 'default' | 'standard' | 'deep';

/** New-scan form and its review. Mount a fresh instance to reset it. */
export function ScanComposer(props: {
  directory: string;
  port: SecurityPort;
  store: SecurityStore;
  /** A prepared plan to review, e.g. one a model tool prepared. */
  plan?: ScanPlan;
  onClose?: () => void;
  onStarted(runId?: string): void;
}) {
  const initial = props.plan;
  const [repository, setRepository] = createSignal(initial?.repository ?? props.directory);
  const [mode, setMode] = createSignal<Mode>(initial?.inputs.mode ?? 'default');
  const [focus, setFocus] = createSignal(initial?.scanPrompt ?? '');
  const [paths, setPaths] = createSignal(initial?.scopePaths.join('\n') ?? '');
  type Scope = 'repository' | 'paths' | 'uncommitted' | 'since';
  const [scope, setScope] = createSignal<Scope>(
    initial?.changes
      ? initial.changes === 'uncommitted'
        ? 'uncommitted'
        : 'since'
      : initial?.scopePaths.length
        ? 'paths'
        : 'repository',
  );
  const [base, setBase] = createSignal(
    initial?.changes && initial.changes !== 'uncommitted' ? initial.changes : '',
  );
  const [documents, setDocuments] = createSignal(
    initial?.contextFiles.map((file) => file.path).join('\n') ?? '',
  );
  const [preview, setPreview] = createSignal<ScanPlan | undefined>(initial);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal('');

  const act = async (action: () => Promise<void>) => {
    if (busy()) return;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(userError(e));
    } finally {
      setBusy(false);
    }
  };
  const prepare = (event: SubmitEvent) => {
    event.preventDefault();
    void act(async () => {
      const input: ScanInputs = {
        repository: repository().trim() || props.directory,
        scanPrompt: focus(),
        ...(scope() === 'uncommitted'
          ? { changes: 'uncommitted' }
          : scope() === 'since'
            ? { changes: base().trim() }
            : { scopePaths: scope() === 'paths' ? splitPaths(paths()) : [] }),
        contextFiles: splitPaths(documents()),
        ...(mode() !== 'default' ? { mode: mode() as 'standard' | 'deep' } : {}),
      };
      const next = asState(await props.port.prepare(input));
      if (!next.plan) throw new Error('The server did not return a scan preview.');
      setPreview(next.plan);
      void props.store.refreshScans();
    });
  };
  const start = (plan: ScanPlan) =>
    void act(async () => {
      const run = asState(await props.port.start({ planId: plan.id }));
      await props.store.refreshScans();
      props.onStarted(run.runId);
    });

  return (
    <section class="gs-composer" aria-label="New scan">
      <div class="gs-section-heading">
        <h3>New scan</h3>
        <Show when={props.onClose}>
          <button class="gs-link" disabled={busy()} onClick={() => props.onClose?.()}>
            Close
          </button>
        </Show>
      </div>
      <Show when={!props.onClose && !preview()}>
        <p class="gs-intro">
          Scan a repository for security issues. You review what will be sent before it starts.
        </p>
      </Show>
      <Show when={error()}>
        <p class="gs-alert" role="alert">
          {error()}
        </p>
      </Show>
      <Show
        when={preview()}
        fallback={
          <form class="gs-form" onSubmit={prepare}>
            <fieldset disabled={busy()}>
              <label>
                Repository
                <input
                  value={repository()}
                  onInput={(e) => {
                    setRepository(e.currentTarget.value);
                    setScope('repository');
                    setPaths('');
                    setDocuments('');
                  }}
                  required
                  aria-label="Repository"
                  spellcheck={false}
                />
                <span class="gs-help">Changing the repository clears paths and files.</span>
              </label>
              <label>
                Depth
                <select
                  value={mode()}
                  onChange={(e) => setMode(e.currentTarget.value as Mode)}
                  aria-label="Scan depth"
                >
                  <option value="default">Default from settings</option>
                  <option value="standard">Standard</option>
                  <option value="deep">Deep</option>
                </select>
                <span class="gs-help">Deep takes longer and costs more.</span>
              </label>
              <label>
                Focus <span class="gs-muted">optional</span>
                <textarea
                  value={focus()}
                  maxLength={8000}
                  onInput={(e) => setFocus(e.currentTarget.value)}
                  placeholder="For example: authorization and tenant isolation"
                  aria-label="Scan focus"
                />
              </label>
              <label>
                What to scan
                <select
                  aria-label="Scope"
                  value={scope()}
                  onChange={(e) => setScope(e.currentTarget.value as Scope)}
                >
                  <option value="repository">Whole repository</option>
                  <option value="paths">Selected paths</option>
                  <option value="uncommitted">Uncommitted changes</option>
                  <option value="since">Changes since a branch or commit</option>
                </select>
              </label>
              <Show when={scope() === 'paths'}>
                <label>
                  Paths
                  <textarea
                    value={paths()}
                    onInput={(e) => setPaths(e.currentTarget.value)}
                    placeholder={'src/auth\nsrc/api'}
                    aria-label="Scope paths"
                    required
                  />
                  <span class="gs-help">One path per line, relative to the repository.</span>
                </label>
              </Show>
              <Show when={scope() === 'since'}>
                <label>
                  Compare with
                  <input
                    value={base()}
                    onInput={(e) => setBase(e.currentTarget.value)}
                    placeholder="origin/main"
                    aria-label="Base ref"
                    spellcheck={false}
                    required
                  />
                  <span class="gs-help">Scans what changed between this ref and HEAD.</span>
                </label>
              </Show>
              <Show when={scope() === 'uncommitted' || scope() === 'since'}>
                <p class="gs-help">Change scans run at Standard depth.</p>
              </Show>
              <details class="gs-disclosure">
                <summary>Context files</summary>
                <label>
                  Context files
                  <textarea
                    value={documents()}
                    onInput={(e) => setDocuments(e.currentTarget.value)}
                    placeholder={'docs/architecture.md\nSECURITY.md'}
                    aria-label="Context files"
                  />
                  <span class="gs-help">Documents that explain the system, one per line.</span>
                </label>
              </details>
              <div class="gs-actions">
                <button type="submit" class="gs-button gs-primary" disabled={!props.store.loaded()}>
                  {busy() ? 'Preparing…' : 'Review scan'}
                </button>
              </div>
            </fieldset>
          </form>
        }
      >
        {(plan) => (
          <ScanReview
            plan={plan()}
            store={props.store}
            busy={busy()}
            onStart={() => start(plan())}
            onEdit={() => setPreview(undefined)}
          />
        )}
      </Show>
    </section>
  );
}
