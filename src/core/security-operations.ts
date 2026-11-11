import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type {
  CodexSecurity,
  CodexSecurityConfig,
  SecurityPolicyOptions,
  ValidationOptions,
  ValidationResult,
} from '@openai/codex-security';
import {
  prepareScan,
  publicScanPlan,
  withSdk,
  type ScanPlan,
  type PreparedScanPlan,
} from './scan-plan.ts';
import { safeReportText } from './report-safety.ts';
import { SecurityInputError, userMessage } from './errors.ts';

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
  /** Policy component, relative to the repository. Absent for the repository root. */
  path?: string;
  /** Where an accepted policy draft belongs. The plugin never writes it. */
  targetPath?: string;
  finding?: string;
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
  config: CodexSecurityConfig,
) => SecurityOperationsClient | Promise<SecurityOperationsClient>;
export interface SecurityOperationsOptions {
  createClient?: SecurityOperationsFactory;
  mock?: boolean;
}

type Entry = {
  execution: PreparedScanPlan['sdk'];
  state: SecurityOperationState;
  controller: AbortController;
  task?: Promise<void>;
  pending?: {
    id: string;
    resolve: (answer: string | undefined) => void;
    reject: (error: Error) => void;
    cleanup: () => void;
  };
};
const realClient: SecurityOperationsFactory = async (config) =>
  new (await import('@openai/codex-security')).CodexSecurity(config);
const active = (state: SecurityOperationState) =>
  state.status === 'running' || state.status === 'awaiting_answers';
const textLimit = 48_000;

function parseInputs(raw: unknown): SecurityOperationInputs {
  const value = (raw ?? {}) as Record<string, unknown>;
  if (value.kind !== 'policy' && value.kind !== 'validation')
    throw new SecurityInputError('Choose policy or validation.');
  if (value.kind === 'policy' ? value.finding !== undefined : value.path !== undefined)
    throw new SecurityInputError('Policy takes a path; validation takes a finding.');
  if (value.path !== undefined && typeof value.path !== 'string')
    throw new SecurityInputError('Policy path must be a directory inside the repository.');
  // Callers may reuse their input object while preparation awaits I/O.
  return structuredClone(value) as unknown as SecurityOperationInputs;
}
function findingText(value: SecurityOperationInputs['finding']): string {
  const text = typeof value === 'string' ? value : value ? JSON.stringify(value) : '';
  if (!text.trim() || Buffer.byteLength(text) > 32 * 1024)
    throw new SecurityInputError('Validation needs finding text or an object of at most 32 KiB.');
  return text;
}

/**
 * Policy drafts and finding validation, in memory for the session. Each preview starts
 * once. Policies come back as drafts; nothing here writes to the repository.
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
    this.#project = project;
    this.#factory = options.createClient ?? realClient;
    this.#mock = options.mock ?? false;
    if (this.#mock && !options.createClient)
      throw new Error('Mock operations require an injected mock SDK client.');
  }
  #entry(operationId: string) {
    const entry = this.#entries.get(operationId);
    if (!entry) throw new SecurityInputError('Unknown security operation.');
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
      { repository: input.repository, contextFiles: input.contextFiles },
      this.#mock,
      input.kind === 'validation' ? 'validation' : 'scan',
    );
    const limit = scan.settings.scan.maxCostUsd;
    // The SDK decides which repository and SECURITY.md a policy path belongs to.
    const target =
      input.kind === 'policy'
        ? await withSdk(scan.sdk.codexOverrides, (client) =>
            client.preflightPolicy(scan.repository, {
              auth: scan.sdk.auth,
              ...(input.path ? { path: input.path } : {}),
              ...(limit === undefined ? {} : { maxCostUsd: limit }),
            }),
          )
        : undefined;
    if (this.#disposed) throw new Error('Security operations service is closed.');
    for (const [id, entry] of this.#entries)
      if (entry.state.status === 'prepared' && Date.parse(entry.state.plan.expiresAt) <= Date.now())
        this.#entries.delete(id);
    const plan: SecurityOperationPlan = {
      ...publicScanPlan(scan),
      kind: input.kind,
      ...(target
        ? {
            repository: target.repository,
            targetPath: target.targetPath,
            ...(target.scope === '.' ? {} : { path: target.scope }),
          }
        : { finding }),
      costNotice:
        input.kind === 'validation'
          ? 'Validation has no cost limit in the SDK; scan.maxCostUsd does not apply.'
          : limit === undefined
            ? 'No cost limit is configured.'
            : `Stops at an estimated USD ${limit}. This is an estimate, not a billing cap.`,
    };
    const entry: Entry = {
      execution: structuredClone(scan.sdk),
      controller: new AbortController(),
      state: {
        operationId: scan.id,
        kind: input.kind,
        repository: plan.repository,
        plan,
        status: 'prepared',
        phase: 'Ready to review',
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
  /** Starting a preview is the approval; callers show the preview first. */
  async start(input: { operationId: string }): Promise<SecurityOperationState> {
    if (this.#disposed) throw new Error('Security operations service is closed.');
    const entry = this.#entry(input?.operationId);
    if (active(entry.state)) return this.getState(input.operationId);
    if (entry.state.status !== 'prepared')
      throw new SecurityInputError('This operation is already used. Prepare a new one.');
    if (Date.now() >= Date.parse(entry.state.plan.expiresAt))
      throw new SecurityInputError('Operation preview expired. Prepare it again.');
    if (
      [...this.#entries.values()].filter((other) => active(other.state)).length >=
      this.maxConcurrent
    )
      throw new SecurityInputError('Two operations are already active. Wait or cancel one.');
    entry.state.status = 'running';
    entry.state.phase =
      entry.state.kind === 'policy' ? 'Generating security policy draft' : 'Validating finding';
    entry.state.startedAt = new Date().toISOString();
    this.#emit(entry);
    entry.task = this.#run(entry);
    return this.getState(input.operationId);
  }
  async #run(entry: Entry) {
    const { plan } = entry.state;
    const { signal } = entry.controller;
    let client: SecurityOperationsClient | undefined;
    let outcome: SecurityOperationStatus = 'error';
    const observing = () => !signal.aborted && active(entry.state);
    try {
      signal.throwIfAborted();
      client = await this.#factory({ codexOverrides: entry.execution.codexOverrides });
      signal.throwIfAborted();
      const context = plan.contextFiles.map((file) => resolve(plan.repository, file.path));
      if (plan.kind === 'policy') {
        const options: SecurityPolicyOptions = {
          auth: entry.execution.auth,
          ...(plan.path ? { path: plan.path } : {}),
          knowledgeBasePaths: context,
          ...(plan.settings.scan.maxCostUsd !== undefined
            ? { maxCostUsd: plan.settings.scan.maxCostUsd }
            : {}),
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
        entry.state.result = {
          kind: 'policy',
          content: safeReportText(result.content),
          reviewNotes: result.reviewNotes.slice(0, 100).map((note) => safeReportText(note, 2000)),
          targetPath: result.targetPath,
          applied: false,
          truncated: result.content.length > textLimit || result.reviewNotes.length > 100,
        };
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
          auth: entry.execution.auth,
          knowledgeBasePaths: context,
          signal,
          ...(plan.settings.scan.cyberAccessProgram
            ? { cyberAccessProgram: plan.settings.scan.cyberAccessProgram }
            : {}),
        };
        const result = await client.validate(options);
        signal.throwIfAborted();
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
        : userMessage(error, 'Operation failed. Check the Codex Security logs and runtime setup.');
    } finally {
      this.#rejectQuestion(entry, new Error('Operation ended before this question was answered.'));
      try {
        await client?.close();
      } catch {
        /* Nothing useful to report from a failed close. */
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
      throw new SecurityInputError('This question is no longer pending.');
    if (
      typeof input.answer !== 'string' ||
      !input.answer.trim() ||
      Buffer.byteLength(input.answer) > 16 * 1024
    )
      throw new SecurityInputError('Answer must be nonempty text of at most 16 KiB.');
    const pending = entry.pending;
    const count = entry.state.question?.questions.length ?? 0;
    entry.pending = undefined;
    pending.cleanup();
    entry.state.question = null;
    entry.state.answeredQuestionCount += count;
    entry.state.status = 'running';
    entry.state.phase = 'Continuing with supplied clarification';
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
    await entry.task;
    return this.getState(operationId);
  }
  async dispose() {
    this.#disposed = true;
    for (const id of this.#entries.keys()) this.cancel(id);
    await Promise.all([...this.#entries.values()].map((entry) => entry.task));
    this.#listeners.clear();
  }
}
