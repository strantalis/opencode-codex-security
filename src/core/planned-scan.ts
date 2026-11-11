import { randomUUID } from 'node:crypto';
import { CodexScanService, type SecurityFactory } from './codex-adapter.ts';
import {
  prepareScan,
  publicScanPlan,
  type PreparedScanPlan,
  type ScanInputs,
  type ScanPlan,
} from './scan-plan.ts';
import { SecurityInputError } from './errors.ts';
import { RunHistory } from './run-history.ts';
import type { ScanState, ScanList } from '../types.ts';
type Draft = { plan: PreparedScanPlan; consumed: boolean; runId?: string };
type Run = {
  state: ScanState;
  service: CodexScanService;
  unsubscribe: () => void;
  lastSavedAt?: number;
};
/**
 * Independent approved runs. A draft or another run never mutates a running scan's inputs.
 * `#runs` holds live runs only; a finished run keeps just its final state in `#archived`.
 */
export class PlannedScanService {
  #project: string;
  #factory?: SecurityFactory;
  #mock: boolean;
  #disposed = false;
  #instance = randomUUID();
  #revision = 0;
  #drafts = new Map<string, Draft>();
  #runs = new Map<string, Run>();
  #archived = new Map<string, ScanState>();
  #latestDraft?: string;
  #latestRun?: string;
  #listeners = new Set<(s: ScanState) => void>();
  #history?: RunHistory;
  #loadError?: string;
  /** Runs whose latest state is not on disk. Cleared by that run's next successful save. */
  #unsaved = new Set<string>();
  #ready: Promise<void>;
  #writes = Promise.resolve();
  readonly maxConcurrent = 2;
  readonly historyLimit = 50;
  constructor(
    project: string,
    options: { createClient?: SecurityFactory; mock?: boolean; historyDirectory?: string } = {},
  ) {
    this.#project = project;
    this.#factory = options.createClient;
    this.#mock = options.mock ?? false;
    if (options.historyDirectory)
      this.#history = new RunHistory(options.historyDirectory, this.historyLimit);
    this.#ready = this.#load();
  }
  async #load() {
    if (!this.#history) return;
    try {
      for (const s of await this.#history.load()) this.#archived.set(s.runId!, s);
    } catch {
      this.#loadError = 'Local scan history could not be read, so earlier runs are not listed.';
    }
  }
  get #historyError() {
    return (
      this.#loadError ??
      (this.#unsaved.size
        ? 'Some scan history could not be saved. Those runs will be missing after a restart.'
        : undefined)
    );
  }
  async ready() {
    await this.#ready;
  }
  async flushHistory() {
    await this.#writes;
  }
  #idle(plan?: ScanPlan): ScanState {
    return {
      instanceId: this.#instance,
      status: 'idle',
      scanId: null,
      phase: plan ? 'Ready to review' : 'Choose a project scan',
      progress: { done: 0, total: 0 },
      findings: [],
      events: [],
      error: null,
      startedAt: null,
      finishedAt: null,
      repository: plan?.repository ?? this.#project,
      engine: 'codex-security-sdk',
      skipped: 0,
      revision: this.#revision,
      ...(plan
        ? {
            plan: publicScanPlan(plan),
            planConsumed: this.#drafts.get(plan.id)?.consumed ?? false,
            mode: plan.settings.scan.mode,
            model: plan.settings.codex.model,
          }
        : {}),
    };
  }
  getState(input: { runId?: string; planId?: string } = {}): ScanState {
    if (input.runId) {
      const state = this.#runs.get(input.runId)?.state ?? this.#archived.get(input.runId);
      if (!state) throw new SecurityInputError('Unknown scan run.');
      return structuredClone(state);
    }
    if (input.planId) {
      const d = this.#drafts.get(input.planId);
      if (!d) throw new SecurityInputError('Unknown scan preview.');
      return this.#idle(d.plan);
    }
    const d = this.#latestDraft ? this.#drafts.get(this.#latestDraft) : undefined;
    if (d && !d.consumed) return this.#idle(d.plan);
    if (this.#latestRun) return this.getState({ runId: this.#latestRun });
    return this.#idle();
  }
  getPlan(planId: string) {
    const d = this.#drafts.get(planId);
    return d ? publicScanPlan(d.plan) : undefined;
  }
  async list(): Promise<ScanList> {
    await this.#ready;
    const runs = [...this.#runs.values()].map((r) => structuredClone(r.state));
    for (const s of this.#archived.values())
      if (!this.#runs.has(s.runId!)) runs.push(structuredClone(s));
    runs.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
    const drafts = [...this.#drafts.values()]
      .filter((d) => !d.consumed && Date.parse(d.plan.expiresAt) > Date.now())
      .map((d) => this.#idle(d.plan));
    const preview = this.#latestDraft
      ? drafts.find((s) => s.plan?.id === this.#latestDraft)
      : undefined;
    return {
      engine: 'codex-security-sdk',
      instanceId: this.#instance,
      revision: this.#revision,
      runs: runs.slice(0, this.historyLimit),
      drafts,
      ...(preview ? { preview } : {}),
      maxConcurrent: this.maxConcurrent,
      historyLimit: this.historyLimit,
      ...(this.#historyError ? { historyError: this.#historyError } : {}),
    };
  }
  subscribe(listener: (s: ScanState) => void) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  #emit(state: ScanState) {
    this.#revision++;
    for (const listener of this.#listeners) {
      try {
        listener(structuredClone(state));
      } catch {}
    }
  }
  /** History is a record, not a gate: a failed write is reported and never stops a scan. */
  #save(state: ScanState) {
    if (!this.#history) return;
    const snapshot = structuredClone(state),
      runId = state.runId!;
    this.#writes = this.#writes
      .then(() => this.#history!.save(snapshot))
      .then(
        () => this.#unsaved.delete(runId),
        () => this.#unsaved.add(runId),
      )
      .then(() => {});
  }
  /** Keep only the final state of a finished run; drop its service and subscription. */
  #finish(runId: string, entry: Run) {
    entry.unsubscribe();
    this.#runs.delete(runId);
    this.#archived.set(runId, entry.state);
    if (this.#archived.size > this.historyLimit) {
      const oldest = [...this.#archived.values()].reduce((a, b) =>
        (a.startedAt ?? '') <= (b.startedAt ?? '') ? a : b,
      );
      this.#archived.delete(oldest.runId!);
    }
  }
  async prepare(input: ScanInputs = {}): Promise<ScanState> {
    if (this.#disposed) throw new Error('Scan service is closed');
    await this.#ready;
    const plan = await prepareScan(this.#project, input, this.#mock);
    if (this.#disposed) throw new Error('Scan service is closed');
    // An expired preview can never start again; keep only those whose run is still live.
    for (const [id, d] of this.#drafts)
      if (!(d.runId && this.#runs.has(d.runId)) && Date.parse(d.plan.expiresAt) <= Date.now())
        this.#drafts.delete(id);
    this.#drafts.set(plan.id, { plan, consumed: false });
    this.#latestDraft = plan.id;
    const state = this.#idle(plan);
    this.#emit(state);
    return state;
  }
  /** Starting a preview is the approval; callers show the preview first. */
  async start(input: { planId?: string } = {}): Promise<ScanState> {
    if (this.#disposed) throw new Error('Scan service is closed');
    await this.#ready;
    if (this.#disposed) throw new Error('Scan service is closed');
    const d = input.planId ? this.#drafts.get(input.planId) : undefined;
    if (!d) throw new SecurityInputError('Prepare a scan preview first.');
    if (d.runId && this.#runs.has(d.runId)) return this.getState({ runId: d.runId });
    if (d.consumed)
      throw new SecurityInputError('This preview is already used. Prepare a new scan.');
    if (Date.now() >= Date.parse(d.plan.expiresAt))
      throw new SecurityInputError('Scan preview expired. Prepare it again.');
    if (this.#runs.size >= this.maxConcurrent)
      throw new SecurityInputError(
        'Two scans are already active in this project. Wait or cancel one before starting another.',
      );
    return this.#start(d);
  }
  #start(d: Draft): ScanState {
    const runId = randomUUID(),
      plan = structuredClone(d.plan),
      service = new CodexScanService(plan.repository, { createClient: this.#factory });
    d.consumed = true;
    d.runId = runId;
    this.#latestRun = runId;
    const decorate = (state: ScanState): ScanState => ({
      ...state,
      runId,
      repository: plan.repository,
      plan: publicScanPlan(plan),
      planConsumed: true,
      mode: plan.settings.scan.mode,
      model: plan.settings.codex.model,
    });
    const entry: Run = {
      service,
      state: decorate({
        ...service.getState(),
        status: 'running',
        phase: 'Starting scan',
        startedAt: new Date().toISOString(),
      }),
      unsubscribe: () => {},
    };
    this.#runs.set(runId, entry);
    this.#save(entry.state);
    entry.unsubscribe = service.subscribe((state) => {
      const previous = entry.state;
      entry.state = decorate(state);
      this.#emit(entry.state);
      if (
        state.status !== 'running' ||
        state.scanId !== previous.scanId ||
        state.phase !== previous.phase ||
        Date.now() - (entry.lastSavedAt ?? 0) > 10_000
      ) {
        entry.lastSavedAt = Date.now();
        this.#save(entry.state);
      }
      if (state.status !== 'running') this.#finish(runId, entry);
    });
    service.start(plan);
    return structuredClone(entry.state);
  }
  cancel(input: { runId?: string } = {}): ScanState {
    let id = input.runId;
    if (!id) {
      const active = [...this.#runs.entries()].filter(([, r]) => r.state.status === 'running');
      if (active.length !== 1) throw new SecurityInputError('Select the run to cancel.');
      id = active[0][0];
    }
    const run = this.#runs.get(id);
    if (!run) throw new SecurityInputError('That run is not active.');
    run.service.cancel();
    return structuredClone(run.state);
  }
  async wait(runId = this.#latestRun) {
    if (!runId) return this.getState();
    const run = this.#runs.get(runId);
    if (!run) return this.getState({ runId });
    await run.service.wait();
    await this.#writes;
    return this.getState({ runId });
  }
  async dispose() {
    this.#disposed = true;
    await Promise.all([...this.#runs.values()].map((r) => r.service.dispose()));
    await this.#writes;
    for (const r of this.#runs.values()) r.unsubscribe();
    this.#listeners.clear();
  }
}
