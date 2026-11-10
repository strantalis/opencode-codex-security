import { randomUUID } from 'node:crypto';
import { basename, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { collectFiles, scanFile } from './scanner.mjs';

export function initialState(repository = '', instanceId = '') {
  return {
    instanceId,
    status: 'idle',
    scanId: null,
    phase: 'Ready',
    progress: { done: 0, total: 0 },
    findings: [],
    events: [],
    error: null,
    startedAt: null,
    finishedAt: null,
    repository,
    engine: 'local-patterns (prototype)',
    skipped: 0,
    revision: 0,
  };
}

export class ScanService {
  #instanceId = randomUUID();
  #state;
  #listeners = new Set();
  #controller;
  #task;
  #disposed = false;
  constructor(root, { delayMs = 0 } = {}) {
    this.root = resolve(root);
    this.delayMs = Math.max(0, Math.min(delayMs, 2000));
    this.#state = initialState(basename(this.root), this.#instanceId);
  }
  getState() {
    return structuredClone(this.#state);
  }
  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  #emit(message) {
    if (message) this.#state.events.push({ time: new Date().toISOString(), message });
    this.#state.events = this.#state.events.slice(-100);
    this.#state.revision++;
    for (const listener of this.#listeners) {
      try {
        listener(this.getState());
      } catch {
        /* A broken view must not stop the scan. */
      }
    }
  }
  start() {
    if (this.#disposed) throw new Error('Scan service is closed');
    // Idempotent under repeated clicks; only one read-only scan per instance.
    if (this.#state.status === 'running') return this.getState();
    const revision = this.#state.revision;
    this.#state = {
      ...initialState(basename(this.root), this.#instanceId),
      revision,
      status: 'running',
      scanId: randomUUID(),
      phase: 'Discovering source files',
      startedAt: new Date().toISOString(),
    };
    this.#controller = new AbortController();
    this.#emit('Local scan started. No provider, credentials, or network calls.');
    this.#task = this.#run(this.#controller.signal);
    return this.getState();
  }
  async #run(signal) {
    try {
      const { base, files } = await collectFiles(this.root, signal);
      this.#state.progress.total = files.length;
      this.#emit(
        `Found ${files.length} supported source files; hidden paths, dependencies, and symlinks excluded.`,
      );
      for (const path of files) {
        signal.throwIfAborted();
        if (this.delayMs) await delay(this.delayMs, undefined, { signal });
        const result = await scanFile(base, path, signal);
        this.#state.findings.push(...result.findings);
        this.#state.progress.done++;
        if (result.skipped) this.#state.skipped++;
        this.#state.phase = `Checking files (${this.#state.progress.done}/${files.length})`;
        this.#emit(
          result.findings.length
            ? `${result.findings.length} candidate finding(s) in ${result.findings[0].path}`
            : undefined,
        );
      }
      signal.throwIfAborted();
      this.#state.status = 'completed';
      this.#state.phase = 'Pattern scan complete';
      this.#emit(
        `Completed with ${this.#state.findings.length} candidate findings. Not a security clearance or Codex Security scan.`,
      );
    } catch (error) {
      this.#state.status = signal.aborted ? 'cancelled' : 'error';
      this.#state.phase = signal.aborted ? 'Cancelled; partial results retained' : 'Scan failed';
      this.#state.error = signal.aborted ? null : String(error.message ?? error);
      this.#emit(
        signal.aborted
          ? 'Scan cancelled. Partial findings are not a complete result.'
          : `Scan failed: ${this.#state.error}`,
      );
    } finally {
      this.#state.finishedAt = new Date().toISOString();
      this.#emit();
    }
  }
  cancel() {
    if (this.#state.status === 'running') this.#controller.abort();
    return this.getState();
  }
  async wait() {
    await this.#task;
    return this.getState();
  }
  async dispose() {
    this.#disposed = true;
    this.cancel();
    await this.#task;
    this.#listeners.clear();
  }
}
