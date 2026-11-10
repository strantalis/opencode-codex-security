import { randomUUID } from 'node:crypto';
import { lstat, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type {
  CodexSecurity,
  CodexSecurityConfig,
  SecurityPolicyDraft,
  SecurityPolicyOptions,
  ValidationOptions,
  ValidationResult,
} from '@openai/codex-security';
import { prepareScan, validatePlan, type ScanPlan } from './scan-plan.ts';
import { safeReportText } from './report-safety.ts';
import { sdkConfiguration } from './sdk-settings.ts';
import { ProviderConfigurationError } from './provider-config.ts';
import { unsupportedPricingMessage } from './codex-adapter.ts';
import {
  requireSdkCredentials,
  ProviderCredentialsRequiredError,
  DedicatedSecurityCredentialsRequiredError,
} from './credential-guard.ts';

export type SecurityOperationKind = 'policy' | 'validation';
export type SecurityOperationStatus =
  'prepared' | 'running' | 'awaiting_answers' | 'completed' | 'cancelled' | 'error';
export interface SecurityOperationInputs {
  kind: SecurityOperationKind;
  repository?: string;
  /** Existing repository-relative directory. Policy generation only. */
  path?: string;
  contextFiles?: string[];
  /** Literal finding text or a JSON object, never a filename. Validation only. */
  finding?: string | Record<string, unknown>;
}
export interface SecurityOperationPlan extends ScanPlan {
  kind: SecurityOperationKind;
  path?: string;
  finding?: string;
  /** Policy has an estimated SDK limit, not a guaranteed billing cap. Validation has none. */
  costLimitEnforced: boolean;
  costNotice: string;
}
export interface SecurityOperationQuestion {
  id: string;
  questions: string[];
  createdAt: string;
}
export type SecurityOperationResult =
  | {
      kind: 'policy';
      content: string;
      reviewNotes: string[];
      targetPath: string;
      applied: false;
      truncated: boolean;
    }
  | {
      kind: 'validation';
      disposition: ValidationResult['disposition'];
      report: string;
      truncated: boolean;
    };
export interface SecurityOperationState {
  operationId: string;
  kind: SecurityOperationKind;
  repository: string;
  status: SecurityOperationStatus;
  phase: string;
  plan: SecurityOperationPlan;
  question: SecurityOperationQuestion | null;
  answeredQuestionCount: number;
  result: SecurityOperationResult | null;
  estimatedCostUsd?: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  revision: number;
}
export type SecurityOperationsClient = Pick<CodexSecurity, 'generatePolicy' | 'validate' | 'close'>;
export type SecurityOperationsFactory = (
  config?: CodexSecurityConfig,
) => SecurityOperationsClient | Promise<SecurityOperationsClient>;
export interface SecurityOperationsOptions {
  createClient?: SecurityOperationsFactory;
  mock?: boolean;
}
export interface SecurityOperationApproval {
  operationId: string;
  /** Trusted UI/host permission decision. Never expose approval booleans as model input. */
  approveOpenAIInference: true;
  /** Required separately because SDK 0.9.1 validation has no maxCostUsd support. */
  approveUncappedValidation?: true;
}

type Entry = {
  state: SecurityOperationState;
  controller: AbortController;
  starting?: Promise<SecurityOperationState>;
  task?: Promise<void>;
  pending?: {
    id: string;
    resolve: (answer: string | undefined) => void;
    reject: (error: Error) => void;
    cleanup: () => void;
  };
};
const realClient: SecurityOperationsFactory = async (config) => {
  await requireSdkCredentials(config);
  const { CodexSecurity } = await import('@openai/codex-security');
  return new CodexSecurity(config);
};
const active = (state: SecurityOperationState) =>
  state.status === 'running' || state.status === 'awaiting_answers';
const textLimit = 48_000;

function parseInputs(raw: unknown): SecurityOperationInputs {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Operation inputs must be an object.');
  const value = raw as Record<string, unknown>;
  for (const key of Object.keys(value))
    if (!['kind', 'repository', 'path', 'contextFiles', 'finding'].includes(key))
      throw new Error(
        'Unsupported operation input. Approval, authentication, and SDK settings cannot come from model input.',
      );
  if (value.kind !== 'policy' && value.kind !== 'validation')
    throw new Error(
      'Choose policy or validation. Patch and fix verification require a separate isolated workspace.',
    );
  if (value.kind === 'policy' && value.finding !== undefined)
    throw new Error('Finding input is only supported for validation.');
  if (value.kind === 'validation' && value.path !== undefined)
    throw new Error(
      'Validation reviews the selected repository. Policy path is not a validation scope.',
    );
  if (
    value.path !== undefined &&
    (typeof value.path !== 'string' || !value.path || value.path.length > 4096)
  )
    throw new Error('Invalid policy directory.');
  // The caller may reuse or mutate its input object while path checks await I/O.
  // Capture it now rather than letting later edits change the operation kind/scope.
  return structuredClone(value) as unknown as SecurityOperationInputs;
}
function findingText(value: SecurityOperationInputs['finding']): string {
  let text: string | undefined;
  if (typeof value === 'string') text = value;
  else if (value && typeof value === 'object' && !Array.isArray(value)) {
    try {
      text = JSON.stringify(value);
    } catch {
      throw new Error('Finding must be JSON serializable.');
    }
  }
  if (!text?.trim() || Buffer.byteLength(text) > 32 * 1024)
    throw new Error('Validation requires literal finding text or an object of at most 32 KiB.');
  if (safeReportText(text) !== text)
    throw new Error(
      'Remove credential-like values and control characters from the finding before preparing validation.',
    );
  return text;
}
async function checkPolicyDirectory(plan: ScanPlan) {
  const directory = resolve(plan.repository, plan.scopePaths[0] || '.');
  if (!(await stat(directory)).isDirectory())
    throw new Error('Policy path must be an existing directory.');
  // SDK policy generation discovers the enclosing Git root. Do not silently broaden
  // the approved repository, or cross a nested worktree boundary.
  for (let current = directory; ; current = dirname(current)) {
    try {
      await lstat(join(current, '.git'));
      if (current !== plan.repository)
        throw new Error(
          'Select the Git repository root as repository and its component as policy path.',
        );
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (dirname(current) === current) break;
  }
}
function checkRepositoryPath(repository: string) {
  if (
    repository
      .split(/[\\/]/)
      .some(
        (part) =>
          ['.git', '.ssh', '.aws', '.codex', '.runtime', 'node_modules'].includes(part) ||
          /^\.env(?:\.|$)/.test(part),
      )
  )
    throw new Error('Credential, runtime, and dependency directories cannot be operation targets.');
}

/**
 * Memory-only, project-bound operation coordinator. Preparation never creates the SDK.
 * Each immutable preview can start once. Auth/paid execution belongs to the trusted host.
 * Generated policies remain drafts; this class never applies a file or publishes findings.
 */
export class SecurityOperationsService {
  readonly maxConcurrent = 2;
  #project: string;
  #factory: SecurityOperationsFactory;
  #mock: boolean;
  #disposed = false;
  #entries = new Map<string, Entry>();
  #listeners = new Set<(state: SecurityOperationState) => void>();
  constructor(project: string, options: SecurityOperationsOptions = {}) {
    this.#project = project; // prepareScan validates the anchor; never guess process.cwd().
    this.#factory = options.createClient ?? realClient;
    this.#mock = options.mock ?? false;
    if (this.#mock && !options.createClient)
      throw new Error('Mock operations require an injected mock SDK client.');
  }
  #entry(operationId: string) {
    const entry = this.#entries.get(operationId);
    if (!entry) throw new Error('Unknown security operation.');
    return entry;
  }
  getState(operationId: string): SecurityOperationState {
    return structuredClone(this.#entry(operationId).state);
  }
  list(): SecurityOperationState[] {
    return [...this.#entries.values()].map((entry) => structuredClone(entry.state)).reverse();
  }
  subscribe(listener: (state: SecurityOperationState) => void) {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
  #emit(entry: Entry) {
    entry.state.revision++;
    for (const listener of this.#listeners) {
      try {
        listener(structuredClone(entry.state));
      } catch {
        /* Isolate views. */
      }
    }
  }
  async prepare(raw: SecurityOperationInputs): Promise<SecurityOperationState> {
    if (this.#disposed) throw new Error('Security operations service is closed.');
    const input = parseInputs(raw);
    const finding = input.kind === 'validation' ? findingText(input.finding) : undefined;
    const scan = await prepareScan(
      this.#project,
      {
        ...(input.repository === undefined ? {} : { repository: input.repository }),
        contextFiles: input.contextFiles ?? [],
        ...(input.kind === 'policy' ? { scopePaths: [input.path ?? '.'] } : {}),
      },
      this.#mock,
    );
    checkRepositoryPath(scan.repository);
    if (input.kind === 'policy') await checkPolicyDirectory(scan);
    if (this.#disposed) throw new Error('Security operations service is closed.');
    // Keep bounded per-session state. Never evict running operations or outstanding questions.
    for (const [id, entry] of this.#entries)
      if (
        !active(entry.state) &&
        !entry.starting &&
        Date.parse(entry.state.plan.expiresAt) <= Date.now()
      )
        this.#entries.delete(id);
    if (this.#entries.size >= 50)
      throw new Error(
        'Too many recent operations. Wait for previews to expire or open a fresh session.',
      );
    const plan: SecurityOperationPlan = {
      ...scan,
      kind: input.kind,
      ...(input.kind === 'policy' ? { path: scan.scopePaths[0] } : { finding }),
      costLimitEnforced: input.kind === 'policy',
      costNotice:
        input.kind === 'policy'
          ? `Model inference uses an estimated USD ${scan.settings.scan.maxCostUsd} SDK limit, not a guaranteed billing cap.`
          : 'Model inference has no SDK cost limit for validation in version 0.9.1. The scan budget does not apply.',
    };
    const entry: Entry = {
      controller: new AbortController(),
      state: {
        operationId: scan.id,
        kind: input.kind,
        repository: scan.repository,
        plan,
        status: 'prepared',
        phase: 'Prepared; review and authorize model inference',
        question: null,
        answeredQuestionCount: 0,
        result: null,
        error: null,
        createdAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
        revision: 0,
      },
    };
    this.#entries.set(scan.id, entry);
    this.#emit(entry);
    return this.getState(scan.id);
  }
  async start(approval: SecurityOperationApproval): Promise<SecurityOperationState> {
    if (this.#disposed) throw new Error('Security operations service is closed.');
    if (approval?.approveOpenAIInference !== true)
      throw new Error('Prepare and authorize this exact operation before model inference.');
    const entry = this.#entry(approval.operationId);
    if (entry.state.kind === 'validation' && approval.approveUncappedValidation !== true)
      throw new Error(
        'Explicit approval required: SDK validation has no cost limit; the scan budget does not apply.',
      );
    if (entry.starting) return entry.starting;
    if (active(entry.state)) return this.getState(approval.operationId);
    if (entry.state.status !== 'prepared')
      throw new Error('This operation is already used. Prepare and authorize a new operation.');
    if (
      [...this.#entries.values()].filter((other) => other.starting || active(other.state)).length >=
      this.maxConcurrent
    )
      throw new Error('Two operations are already active. Wait or cancel one.');
    entry.starting = this.#start(entry);
    try {
      return await entry.starting;
    } finally {
      entry.starting = undefined;
    }
  }
  async #start(entry: Entry): Promise<SecurityOperationState> {
    try {
      await validatePlan(entry.state.plan);
      checkRepositoryPath(entry.state.plan.repository);
      if (entry.state.kind === 'policy') await checkPolicyDirectory(entry.state.plan);
    } catch (error) {
      if (!entry.controller.signal.aborted) {
        entry.state.status = 'error';
        entry.state.phase = 'Preview invalid; prepare again';
        entry.state.error =
          'Target, context, or settings changed, or the preview expired. Prepare and authorize a new operation.';
        entry.state.finishedAt = new Date().toISOString();
        this.#emit(entry);
      }
      throw error;
    }
    if (this.#disposed || entry.controller.signal.aborted)
      return this.getState(entry.state.operationId);
    entry.state.status = 'running';
    entry.state.phase =
      entry.state.kind === 'policy'
        ? 'Generating security policy draft'
        : 'Validating finding with source evidence';
    entry.state.startedAt = new Date().toISOString();
    this.#emit(entry);
    entry.task = this.#run(entry);
    return this.getState(entry.state.operationId);
  }
  async #run(entry: Entry) {
    const { plan } = entry.state;
    const { signal } = entry.controller;
    let client: SecurityOperationsClient | undefined;
    let outcome: SecurityOperationStatus = 'error';
    const observing = () => !signal.aborted && active(entry.state);
    try {
      signal.throwIfAborted();
      client = await this.#factory(sdkConfiguration(plan.settings));
      signal.throwIfAborted();
      const context = plan.contextFiles.map((file) => resolve(plan.repository, file.path));
      if (plan.kind === 'policy') {
        const options: SecurityPolicyOptions = {
          auth: plan.settings.codex.auth,
          path: plan.path,
          knowledgeBasePaths: context,
          maxCostUsd: plan.settings.scan.maxCostUsd,
          signal,
          onStage: (stage) => {
            if (!observing()) return;
            const phases = {
              architecture: 'Mapping architecture',
              threat_model: 'Building threat model',
              policy: 'Drafting security policy',
            };
            if (Object.hasOwn(phases, stage)) {
              entry.state.phase = phases[stage];
              this.#emit(entry);
            }
          },
          onCost: (cost) => {
            if (observing() && Number.isFinite(cost.estimatedUsd) && cost.estimatedUsd >= 0) {
              entry.state.estimatedCostUsd = cost.estimatedUsd;
              this.#emit(entry);
            }
          },
          answerQuestions: (questions, questionSignal) =>
            this.#ask(entry, questions, questionSignal),
        };
        const result = await client.generatePolicy(plan.repository, options);
        signal.throwIfAborted();
        entry.state.result = this.#policyResult(plan, result);
        if (
          result.cost &&
          Number.isFinite(result.cost.estimatedUsd) &&
          result.cost.estimatedUsd >= 0
        )
          entry.state.estimatedCostUsd = result.cost.estimatedUsd;
      } else {
        const options: ValidationOptions = {
          repositoryPath: plan.repository,
          finding: plan.finding!,
          auth: plan.settings.codex.auth,
          knowledgeBasePaths: context,
          signal,
          ...(plan.settings.scan.cyberAccessProgram
            ? { cyberAccessProgram: plan.settings.scan.cyberAccessProgram }
            : {}),
        };
        const result = await client.validate(options);
        signal.throwIfAborted();
        if (
          !['reportable', 'suppressed', 'not_applicable', 'deferred'].includes(
            result.disposition,
          ) ||
          typeof result.report !== 'string'
        )
          throw new Error('Invalid validation result.');
        entry.state.result = {
          kind: 'validation',
          disposition: result.disposition,
          report: safeReportText(result.report),
          truncated: result.report.length > textLimit,
        };
      }
      outcome = 'completed';
    } catch (error) {
      outcome = signal.aborted ? 'cancelled' : 'error';
      entry.state.result = null;
      entry.state.error = signal.aborted
        ? null
        : error instanceof DedicatedSecurityCredentialsRequiredError ||
            error instanceof ProviderCredentialsRequiredError ||
            error instanceof ProviderConfigurationError
          ? error.message
          : (unsupportedPricingMessage(error) ??
            'SDK operation failed. Review local SDK diagnostics and runtime prerequisites. Raw output is not exposed.');
    } finally {
      this.#rejectQuestion(entry, new Error('Operation ended before this question was answered.'));
      try {
        await client?.close();
      } catch {
        /* Never surface potentially sensitive SDK errors. */
      }
      if (signal.aborted) {
        outcome = 'cancelled';
        entry.state.error = null;
        entry.state.result = null;
      }
      entry.state.status = outcome;
      entry.state.phase =
        outcome === 'completed'
          ? plan.kind === 'policy'
            ? 'Security policy draft ready; not applied'
            : 'Validation assessment ready'
          : outcome === 'cancelled'
            ? 'Cancelled; results incomplete'
            : 'Security operation failed';
      entry.state.finishedAt = new Date().toISOString();
      this.#emit(entry);
    }
  }
  #policyResult(plan: SecurityOperationPlan, draft: SecurityPolicyDraft): SecurityOperationResult {
    const expectedPath = resolve(plan.repository, plan.path || '.', 'SECURITY.md');
    if (
      draft.repository !== plan.repository ||
      resolve(draft.targetPath) !== expectedPath ||
      typeof draft.content !== 'string' ||
      !Array.isArray(draft.reviewNotes)
    )
      throw new Error('Policy draft did not match approved target.');
    return {
      kind: 'policy',
      content: safeReportText(draft.content),
      reviewNotes: draft.reviewNotes.slice(0, 100).map((note) => safeReportText(note, 2000)),
      targetPath: expectedPath,
      applied: false,
      truncated: draft.content.length > textLimit || draft.reviewNotes.length > 100,
    };
  }
  #ask(
    entry: Entry,
    questions: readonly string[],
    signal: AbortSignal,
  ): Promise<string | undefined> {
    if (entry.controller.signal.aborted || signal.aborted)
      return Promise.reject(new Error('Operation cancelled.'));
    if (entry.pending) return Promise.reject(new Error('A question batch is already pending.'));
    if (
      !Array.isArray(questions) ||
      questions.length > 12 ||
      questions.some((question) => typeof question !== 'string' || question.length > 8000)
    )
      return Promise.reject(new Error('Invalid question batch.'));
    if (!questions.length) return Promise.resolve(undefined);
    return new Promise((resolveAnswer, reject) => {
      const id = randomUUID();
      const abort = () => this.#rejectQuestion(entry, new Error('Operation cancelled.'));
      const cleanup = () => {
        signal.removeEventListener('abort', abort);
        entry.controller.signal.removeEventListener('abort', abort);
      };
      entry.pending = { id, resolve: resolveAnswer, reject, cleanup };
      signal.addEventListener('abort', abort, { once: true });
      entry.controller.signal.addEventListener('abort', abort, { once: true });
      entry.state.question = {
        id,
        questions: questions.map((question) => safeReportText(question, 8000)),
        createdAt: new Date().toISOString(),
      };
      entry.state.status = 'awaiting_answers';
      entry.state.phase = 'Waiting for repository owner clarification';
      this.#emit(entry);
    });
  }
  #rejectQuestion(entry: Entry, error: Error) {
    const pending = entry.pending;
    if (!pending) return;
    entry.pending = undefined;
    entry.state.question = null;
    pending.cleanup();
    pending.reject(error);
  }
  answer(input: {
    operationId: string;
    questionId: string;
    answer: string;
  }): SecurityOperationState {
    const entry = this.#entry(input.operationId);
    if (
      this.#disposed ||
      entry.controller.signal.aborted ||
      entry.state.status !== 'awaiting_answers' ||
      !entry.pending ||
      entry.pending.id !== input.questionId
    )
      throw new Error('This question is no longer pending for this operation.');
    if (
      typeof input.answer !== 'string' ||
      !input.answer.trim() ||
      Buffer.byteLength(input.answer) > 16 * 1024
    )
      throw new Error('Answer must be nonempty text of at most 16 KiB. State unknowns explicitly.');
    if (safeReportText(input.answer) !== input.answer)
      throw new Error('Remove credential-like values and control characters from your answer.');
    const pending = entry.pending;
    const count = entry.state.question?.questions.length ?? 0;
    entry.pending = undefined;
    pending.cleanup();
    entry.state.question = null;
    entry.state.answeredQuestionCount += count;
    entry.state.status = 'running';
    entry.state.phase = 'Continuing with supplied clarification';
    // Answers are passed to this SDK call only; no answer transcript is retained in state.
    pending.resolve(input.answer.trim());
    this.#emit(entry);
    return this.getState(input.operationId);
  }
  cancel(operationId: string): SecurityOperationState {
    const entry = this.#entry(operationId);
    if (entry.state.status === 'prepared' || active(entry.state)) {
      entry.controller.abort(new Error('Operation cancelled.'));
      this.#rejectQuestion(entry, new Error('Operation cancelled.'));
      entry.state.question = null;
      entry.state.result = null;
      entry.state.phase = 'Cancellation requested';
      if (entry.state.status === 'prepared') {
        entry.state.status = 'cancelled';
        entry.state.finishedAt = new Date().toISOString();
      }
      this.#emit(entry);
    }
    return this.getState(operationId);
  }
  async wait(operationId: string): Promise<SecurityOperationState> {
    const entry = this.#entry(operationId);
    await entry.starting;
    await entry.task;
    return this.getState(operationId);
  }
  async dispose() {
    this.#disposed = true;
    for (const id of this.#entries.keys()) this.cancel(id);
    await Promise.all(
      [...this.#entries.values()].map(async (entry) => {
        await entry.starting?.catch(() => {});
        await entry.task;
      }),
    );
    this.#listeners.clear();
  }
}
