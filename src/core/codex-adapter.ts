import {
  authenticationSummary,
  costSummary,
  count,
  emptyTelemetry,
  lifecycleSummary,
  measurementSummary,
  phaseSummary,
  recordActivity,
  recordWarning,
} from './run-telemetry.ts';
import { summarizeScanResult } from './result-summary.ts';
import { safeFinding } from './report-safety.ts';
import { randomUUID } from 'node:crypto';
import { basename, resolve } from 'node:path';
import type {
  CodexSecurityConfig,
  CodexSecurity,
  ScanOptions,
  ScanResult,
  Finding as SdkFinding,
} from '@openai/codex-security';
import { scanTarget, type PreparedScanPlan } from './scan-plan.ts';
import { userMessage } from './errors.ts';
import { savedScan } from './partial-results.ts';
import type { Finding, ScanState } from '../types.js';

export type SecurityClient = Pick<CodexSecurity, 'run' | 'close'>;
export type SecurityFactory = (
  config: CodexSecurityConfig,
) => SecurityClient | Promise<SecurityClient>;
const realClient: SecurityFactory = async (config) =>
  new (await import('@openai/codex-security')).CodexSecurity(config);
function initial(repository: string, revision = 0, instanceId = ''): ScanState {
  return {
    telemetry: emptyTelemetry(),
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
    engine: 'codex-security-sdk',
    skipped: 0,
    revision,
  };
}
export function mapSdkFinding(finding: SdkFinding): Finding | null {
  // UI contract has four severities. Never silently upgrade informational items.
  // A checkpoint finding has no IDs yet and may be missing fields, so nothing here is assumed.
  const level = finding.severity?.level;
  if (level !== 'critical' && level !== 'high' && level !== 'medium' && level !== 'low')
    return null;
  const location = finding.locations?.[0];
  const anchor = (finding as { identity?: { anchor?: string } }).identity?.anchor;
  return safeFinding({
    id:
      finding.occurrenceId ||
      finding.findingId ||
      [anchor ?? finding.ruleId ?? finding.title, location?.path, location?.startLine].join(':'),
    title: finding.title,
    severity: level,
    path: location?.path ?? '',
    line: location?.startLine ?? 0,
    cwe: (finding.taxonomy?.cwe ?? []).join(', '),
    summary: finding.summary,
    evidence: (finding.codeEvidence ?? finding.code_evidence ?? [])
      .map((item) => item.code)
      .join('\n\n'),
    remediation: finding.remediation,
    confidence: finding.confidence?.level,
  });
}

/**
 * The harness reports a refused or failed request as its last reconnect notice. Say what the
 * provider answered, and whether trying again can help.
 */
export function providerFailure(message: string, reason?: string): string {
  const answer = /^Reconnecting\.\.\. \d+\/\d+ \((.*)\)$/s.exec(message.trim())?.[1];
  if (!answer) return message;
  const status = /unexpected status (\d{3})/.exec(answer)?.[1];
  const refused =
    reason === 'authorization' ||
    reason === 'authentication' ||
    status === '401' ||
    status === '403';
  return refused
    ? `The model provider refused the request. This is an access problem, not a network one, so running the scan again will fail until it is fixed. ${answer}`
    : `The model provider stopped answering and the retries ran out. ${answer}`;
}

/**
 * Show what a scan had saved before it stopped. The SDK checkpoints its threat model and
 * findings as it goes; a stopped scan keeps them in its output directory.
 */
export async function recoverPartial(state: ScanState, root: string, directory?: string) {
  if (!state.scanId || state.status === 'completed' || state.findings.length) return false;
  const saved = await savedScan(state.scanId, root, directory).catch(() => undefined);
  if (!saved) return false;
  const findings = saved.findings as SdkFinding[];
  state.findings = findings.flatMap((finding) => mapSdkFinding(finding) ?? []);
  state.skipped = findings.length - state.findings.length;
  state.assessment = summarizeScanResult(
    { findings: { findings }, manifest: { scan: saved.scan } } as unknown as ScanResult,
    root,
  );
  state.partial = true;
  state.scanDirectory ??= saved.directory;
  return true;
}

/** Whitelist numeric budget diagnostics; never surface the SDK's raw error text or artifact paths. */
export function scanBudgetFailure(
  error: unknown,
): { message: string; estimatedCostUsd: number } | undefined {
  if (!(error instanceof Error) || error.name !== 'ScanCostLimitExceededError') return;
  const value = error as Error & {
    maxCostUsd?: number;
    cost?: { estimatedUsd?: number; estimatedUsdRange?: { min?: number; max?: number } };
  };
  const estimate = value.cost?.estimatedUsd,
    limit = value.maxCostUsd;
  if (
    typeof estimate !== 'number' ||
    !Number.isFinite(estimate) ||
    estimate < 0 ||
    typeof limit !== 'number' ||
    !Number.isFinite(limit) ||
    limit <= 0
  )
    return;
  const range = value.cost?.estimatedUsdRange;
  const detail =
    typeof range?.min === 'number' &&
    Number.isFinite(range.min) &&
    typeof range.max === 'number' &&
    Number.isFinite(range.max) &&
    range.min >= 0 &&
    range.max >= range.min
      ? ` Estimated range: USD ${range.min.toFixed(2)} to ${range.max.toFixed(2)}.`
      : '';
  return {
    estimatedCostUsd: estimate,
    message: `Stopped at the estimated cost guard: USD ${estimate.toFixed(2)} baseline exceeded the USD ${limit.toFixed(2)} limit.${detail} This is an estimate, not a billing total. No completed assessment; review the budget before choosing whether to retry.`,
  };
}

/** Runs one approved plan through the SDK and projects its callbacks into scan state. */
export class CodexScanService {
  readonly root: string;
  #instanceId = randomUUID();
  #factory: SecurityFactory;
  #state: ScanState;
  #listeners = new Set<(state: ScanState) => void>();
  #controller?: AbortController;
  #task?: Promise<void>;
  #disposed = false;
  #busy = false;
  constructor(
    root: string,
    { createClient = realClient }: { createClient?: SecurityFactory } = {},
  ) {
    this.root = resolve(root);
    this.#factory = createClient;
    this.#state = initial(basename(this.root), 0, this.#instanceId);
  }
  getState(): ScanState {
    return structuredClone(this.#state);
  }
  subscribe(listener: (state: ScanState) => void) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  #emit(message?: string) {
    if (message) this.#state.events.push({ time: new Date().toISOString(), message });
    this.#state.events = this.#state.events.slice(-100);
    this.#state.updatedAt = new Date().toISOString();
    this.#state.revision++;
    for (const listener of this.#listeners) {
      try {
        listener(this.getState());
      } catch {
        /* View isolation. */
      }
    }
  }
  start(plan: PreparedScanPlan): ScanState {
    if (this.#disposed) throw new Error('Scan service is closed');
    if (this.#busy) return this.getState();
    this.#state = {
      ...initial(basename(this.root), this.#state.revision, this.#instanceId),
      status: 'running',
      startedAt: new Date().toISOString(),
      phase: 'Starting Codex Security',
    };
    this.#busy = true;
    this.#controller = new AbortController();
    this.#emit('Scan started.');
    this.#task = this.#run(structuredClone(plan), this.#controller.signal);
    return this.getState();
  }
  async #run(plan: PreparedScanPlan, signal: AbortSignal) {
    let client: SecurityClient | undefined;
    let observing = true;
    let outcome: 'completed' | 'cancelled' | 'error' = 'error';
    let terminalMessage = '';
    let terminalPhase = 'Codex Security scan failed';
    let scanDirectory: string | undefined;
    try {
      signal.throwIfAborted();
      client = await this.#factory({ codexOverrides: plan.sdk.codexOverrides });
      signal.throwIfAborted();
      const telemetry = (this.#state.telemetry ??= emptyTelemetry());
      const options: ScanOptions = {
        ...plan.settings.scan,
        auth: plan.sdk.auth,
        target: await scanTarget(plan),
        ...(plan.scanPrompt ? { scanPrompt: plan.scanPrompt } : {}),
        knowledgeBasePaths: plan.contextFiles.map((file) => resolve(this.root, file.path)),
        // Not in the SDK's public types: its CLI resumes a Deep scan with these two options.
        ...(plan.sdk.resume
          ? { resumeScanId: plan.sdk.resume.scanId, outputDir: plan.sdk.resume.outputDir }
          : {}),
        signal,
        onOutputDirReady: (directory) => {
          scanDirectory = directory;
          this.#state.scanDirectory = directory;
        },
        onProgress: (progress) => {
          if (!observing || signal.aborted) return;
          const detail = phaseSummary(progress);
          telemetry.phaseProgress = detail;
          const counts = detail.reviews && detail.reviews.total > 0 ? detail.reviews : detail.files;
          const unit = detail.reviews && detail.reviews.total > 0 ? 'reviews' : 'files';
          this.#state.progress = { ...counts, unit };
          const phase =
            telemetry.lifecycle?.status === 'completed'
              ? 'Finishing SDK result'
              : `${detail.phase.replaceAll('_', ' ')} (${unit})`;
          const changed = phase !== this.#state.phase;
          this.#state.phase = phase;
          this.#emit(changed ? `Phase: ${phase}` : undefined);
        },
        onMeasurement: (measurement) => {
          if (!observing || signal.aborted) return;
          telemetry.measurement = measurementSummary(measurement);
          if (telemetry.measurement.cost)
            this.#state.estimatedCostUsd = telemetry.measurement.cost.baselineUsd;
          else delete this.#state.estimatedCostUsd;
          this.#emit();
        },
        onCost: (cost) => {
          if (!observing || signal.aborted) return;
          // onMeasurement carries coverage/timestamps. Never replace it with a thinner callback.
          if (!telemetry.measurement) {
            const summary = costSummary(cost);
            if (summary) {
              telemetry.measurement = {
                coverage: 'complete',
                observedAt: new Date().toISOString(),
                cost: summary,
              };
              this.#state.estimatedCostUsd = summary.baselineUsd;
              this.#emit();
            }
          }
        },
        onWorkerEvent: (worker) => {
          if (!observing || signal.aborted || !Number.isInteger(worker.worker) || worker.worker < 0)
            return;
          if (
            !telemetry.observedWorkers.includes(worker.worker) &&
            telemetry.observedWorkers.length < 128
          ) {
            telemetry.observedWorkers.push(worker.worker);
            this.#emit(`Worker ${worker.worker} session observed`);
          }
        },
        onReconnect: (attempt, maxAttempts, details) => {
          if (!observing || signal.aborted) return;
          telemetry.lastReconnect = {
            attempt: count(attempt),
            maxAttempts: count(maxAttempts),
            at: new Date().toISOString(),
            ...(details &&
            ['rate_limit', 'network', 'authentication', 'authorization'].includes(details.reason)
              ? { reason: details.reason }
              : {}),
            ...(details &&
            Number.isFinite(details.retryAfterSeconds) &&
            details.retryAfterSeconds! >= 0
              ? { retryAfterSeconds: details.retryAfterSeconds }
              : {}),
          };
          this.#emit(`SDK reconnect attempt ${count(attempt)} of ${count(maxAttempts)}`);
        },
        onWorkerStatus: (worker) => {
          if (observing && !signal.aborted) {
            this.#state.workers = {
              phase: ['ranking', 'file_review', 'validation', 'attack_path'].includes(worker.phase)
                ? worker.phase
                : 'unknown',
              planned: count(worker.planned),
              started: count(worker.started),
            };
            this.#emit();
          }
        },
        onDeepProgress: (progress) => {
          if (observing && !signal.aborted) {
            this.#state.deepProgress = {
              completed: count(progress.completed),
              active: count(progress.active),
              maximum: count(progress.maximum),
              consolidating: progress.consolidating === true,
            };
            this.#emit();
          }
        },
        onLifecycle: (lifecycle) => {
          if (observing && !signal.aborted) {
            this.#state.scanId = lifecycle.scanId;
            telemetry.lifecycle = lifecycleSummary(lifecycle);
            if (telemetry.lifecycle?.status === 'completed')
              this.#state.phase = 'Finishing SDK result';
            this.#emit(
              telemetry.lifecycle?.status === 'completed'
                ? 'SDK core scan completed; waiting for the final result. This is not a deduplication progress signal.'
                : undefined,
            );
          }
        },
        // Avoid exposing raw model messages, command arguments, auth details, or tool output in UI events.
        onActivity: (activity) => {
          if (observing && !signal.aborted) {
            recordActivity(telemetry, activity, this.root);
            this.#emit();
          }
        },
        onAuthentication: (authentication) => {
          if (!observing || signal.aborted) return;
          telemetry.authentication = authenticationSummary(authentication);
          this.#emit();
        },
        onTrustedAccessStatus: (status) => {
          if (!observing || signal.aborted) return;
          telemetry.trustedAccess = status;
          this.#emit();
        },
        // Warning text can quote raw error output (SDK api.js formats caught errors into it), so
        // only the structured kind is kept.
        onWarning: (_warning, details) => {
          if (!observing || signal.aborted) return;
          recordWarning(telemetry, details);
          this.#emit(
            details?.kind === 'target_changed'
              ? 'The repository changed while the scan was running.'
              : 'SDK reported a warning; inspect local SDK artifacts before relying on results.',
          );
        },
      };
      const result: ScanResult = await client.run(this.root, options);
      signal.throwIfAborted();
      this.#state.findings = result.findings.findings.flatMap((finding) => {
        const mapped = mapSdkFinding(finding);
        if (!mapped) this.#state.skipped++;
        return mapped ? [mapped] : [];
      });
      this.#state.scanId = result.findings.scanId;
      this.#state.assessment = summarizeScanResult(result, this.root);
      if (!telemetry.measurement && result.cost) {
        telemetry.measurement = {
          coverage: 'unavailable',
          observedAt: new Date().toISOString(),
          cost: costSummary(result.cost),
        };
        this.#state.estimatedCostUsd = telemetry.measurement.cost?.baselineUsd;
      }
      outcome = 'completed';
      terminalPhase = 'Codex Security scan complete';
      terminalMessage = `Completed with ${this.#state.findings.length} findings; ${this.#state.skipped} informational items omitted from this four-severity view. Review full local SDK artifacts. Findings are available at completion, not streamed.`;
    } catch (error) {
      outcome = signal.aborted ? 'cancelled' : 'error';
      terminalPhase = signal.aborted
        ? 'Cancelled; results incomplete'
        : 'Codex Security scan failed';
      const budget = signal.aborted ? undefined : scanBudgetFailure(error);
      if (budget) {
        this.#state.estimatedCostUsd = budget.estimatedCostUsd;
        const cost = costSummary((error as { cost: Parameters<typeof costSummary>[0] }).cost);
        (this.#state.telemetry ??= emptyTelemetry()).measurement = {
          coverage: 'partial',
          observedAt: new Date().toISOString(),
          cost,
        };
        terminalPhase = 'Stopped at estimated cost guard';
      }
      this.#state.error = signal.aborted
        ? null
        : (budget?.message ??
          providerFailure(
            userMessage(error, 'Scan failed. Check the Codex Security logs and runtime setup.'),
            this.#state.telemetry?.lastReconnect?.reason,
          ));
      terminalMessage = signal.aborted
        ? 'Cancellation requested; SDK run stopped. Partial results are not a completed scan.'
        : this.#state.error!;
    } finally {
      observing = false;
      this.#state.phase = 'Closing Codex Security runtime';
      this.#emit();
      try {
        await client?.close();
      } catch {
        this.#emit('SDK cleanup failed; inspect local runtime.');
      }
      if (signal.aborted) {
        outcome = 'cancelled';
        terminalPhase = 'Cancelled; results incomplete';
        terminalMessage =
          'Cancellation requested; SDK run stopped. Partial results are not a completed scan.';
        this.#state.error = null;
      }
      this.#state.status = outcome;
      if (outcome !== 'completed' && (await recoverPartial(this.#state, this.root, scanDirectory)))
        terminalMessage += ` ${this.#state.findings.length} findings were saved before it stopped; they are partial results.`;
      this.#state.phase = terminalPhase;
      this.#busy = false;
      this.#state.finishedAt = new Date().toISOString();
      this.#emit(terminalMessage);
    }
  }
  cancel(): ScanState {
    if (this.#state.status === 'running' && !this.#controller?.signal.aborted) {
      this.#controller?.abort();
      this.#state.phase = 'Cancellation requested';
      this.#emit('Cancellation requested; waiting for the runtime to stop.');
    }
    return this.getState();
  }
  async wait(): Promise<ScanState> {
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
