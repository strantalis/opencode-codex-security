import {
  costSummary,
  count,
  emptyTelemetry,
  lifecycleSummary,
  measurementSummary,
  phaseSummary,
  recordActivity,
} from './run-telemetry.ts';
import { summarizeScanResult } from './result-summary.ts';
import {
  requireSdkCredentials,
  ProviderCredentialsRequiredError,
  DedicatedSecurityCredentialsRequiredError,
} from './credential-guard.ts';
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
import { sdkConfiguration, sdkAuthentication, type ResolvedSdkSettings } from './sdk-settings.ts';
import { ProviderConfigurationError } from './provider-config.ts';
import type { Finding, ScanState } from '../types.js';

/** Per-run consent, never persisted. The caller must obtain this from the user. */
export interface CodexScanApproval {
  approved: true;
  repository: string;
  allowNetworkModelInference: true;
  maxCostUsd?: number;
  auth?: 'chatgpt' | 'api-key' | 'aws';
  settings?: ResolvedSdkSettings;
  scopePaths?: string[];
  scanPrompt?: string;
  contextFiles?: string[];
}
export type SecurityClient = Pick<CodexSecurity, 'run' | 'close'>;
export type SecurityFactory = (
  config?: CodexSecurityConfig,
  auth?: 'chatgpt' | 'api-key' | 'aws',
) => SecurityClient | Promise<SecurityClient>;
const realClient: SecurityFactory = async (config, auth) => {
  await requireSdkCredentials(config, process.env, auth);
  const { CodexSecurity } = await import('@openai/codex-security');
  return new CodexSecurity(config ?? sdkConfiguration());
};
function initial(repository: string, revision = 0, instanceId = ''): ScanState {
  return {
    telemetry: emptyTelemetry(),
    instanceId,
    status: 'idle',
    scanId: null,
    phase: 'Awaiting per-scan approval',
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
  if (finding.severity.level === 'informational') return null;
  const location = finding.locations[0];
  return safeFinding({
    id: finding.occurrenceId || finding.findingId,
    title: finding.title,
    severity: finding.severity.level,
    path: location?.path ?? '',
    line: location?.startLine ?? 0,
    cwe: finding.taxonomy.cwe.join(', '),
    summary: finding.summary,
    evidence: (finding.codeEvidence ?? finding.code_evidence ?? [])
      .map((item) => item.code)
      .join('\n\n'),
    remediation: finding.remediation,
    confidence: finding.confidence.level,
  });
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

export function unsupportedPricingMessage(error: unknown): string | undefined {
  if (
    error instanceof Error &&
    error.message.startsWith('A scan cost limit is not available for the configured model:')
  )
    return 'The SDK cannot estimate costs for this model or gateway alias, so the operation stopped without removing its cost limit. This is a missing price entry, not evidence that the model is unavailable or retired. The configured model and provider were not changed. Verify which backend the alias routes to and its pricing before choosing a supported route; do not substitute a different model ID or remove the guard automatically. Estimates are not gateway billing totals or hard caps.';
}

/** Local coordinator; SDK inference is network-backed, not an offline scanner. */
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
  start(approval?: CodexScanApproval): ScanState {
    if (this.#disposed) throw new Error('Scan service is closed');
    if (this.#busy) return this.getState();
    if (
      !approval ||
      approval.approved !== true ||
      approval.allowNetworkModelInference !== true ||
      approval.repository !== this.root ||
      (approval.maxCostUsd !== undefined &&
        (!Number.isFinite(approval.maxCostUsd) || approval.maxCostUsd <= 0))
    ) {
      throw new Error(
        'Per-scan approval required for this exact repository, network model inference, and a positive estimated USD cost limit if supplied.',
      );
    }
    this.#state = {
      ...initial(basename(this.root), this.#state.revision, this.#instanceId),
      status: 'running',
      scanId: null,
      startedAt: new Date().toISOString(),
      phase: 'Starting Codex Security',
    };
    this.#busy = true;
    this.#controller = new AbortController();
    this.#emit(
      'Approved SDK scan started. Local runner and artifacts; network model inference. Any configured cost limit is estimated, not a guaranteed billing cap. No dollar limit applies when omitted.',
    );
    this.#task = this.#run(structuredClone(approval), this.#controller.signal);
    return this.getState();
  }
  async #run(approval: CodexScanApproval, signal: AbortSignal) {
    let client: SecurityClient | undefined;
    let observing = true;
    let outcome: 'completed' | 'cancelled' | 'error' = 'error';
    let terminalMessage = '';
    let terminalPhase = 'Codex Security scan failed';
    try {
      signal.throwIfAborted();
      if (approval.settings && approval.auth && approval.auth !== approval.settings.codex.auth)
        throw new ProviderConfigurationError(
          'Approved authentication does not match the selected provider.',
        );
      client = await this.#factory(
        sdkConfiguration(approval.settings, approval.auth),
        approval.settings?.codex.auth ?? approval.auth ?? 'chatgpt',
      );
      signal.throwIfAborted();
      const telemetry = (this.#state.telemetry ??= emptyTelemetry());
      const options: ScanOptions = {
        target: approval.scopePaths?.length ? [...approval.scopePaths] : 'repository',
        scanPrompt: approval.scanPrompt ?? '',
        knowledgeBasePaths: [...(approval.contextFiles ?? [])],
        ...approval.settings?.scan,
        mode: approval.settings?.scan.mode ?? 'standard',
        auth: sdkAuthentication(approval.settings?.codex.auth ?? approval.auth ?? 'chatgpt'),
        ...(approval.maxCostUsd !== undefined ? { maxCostUsd: approval.maxCostUsd } : {}),
        ownerSuggestions: false,
        signal,
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
        onWarning: () => {
          if (observing && !signal.aborted)
            this.#emit(
              'SDK reported a warning; inspect local SDK artifacts before relying on results.',
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
      // SDK errors can contain source, credentials, or command output. Do not send raw details to views.
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
          (error instanceof DedicatedSecurityCredentialsRequiredError ||
          error instanceof ProviderCredentialsRequiredError ||
          error instanceof ProviderConfigurationError
            ? error.message
            : (unsupportedPricingMessage(error) ??
              'SDK scan failed. Check authentication, runtime prerequisites, and local SDK diagnostics.')));
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
