import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type {
  CodexSecurity,
  CodexSecurityConfig,
  SecurityPolicyOptions,
  ValidationOptions,
  ValidationResult,
  PatchResult,
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
import {
  createPatchWorkspace,
  gitRoot,
  type PatchWorkspace,
  type PatchWorkspaceFactory,
} from './patch-workspace.ts';
import { loadSdk } from './sdk.ts';

export type SecurityOperationKind = 'policy' | 'validation' | 'fix';
export type SecurityOperationStatus =
  'prepared' | 'running' | 'awaiting_answers' | 'completed' | 'cancelled' | 'error';
export interface SecurityOperationInputs {
  kind: SecurityOperationKind;
  repository?: string;
  /** Existing repository-relative directory. Policy generation only. */
  path?: string;
  contextFiles?: string[];
  /** Literal finding text or a JSON object, never a filename. Validation and fix. */
  finding?: string | Record<string, unknown>;
  /** The scan finding this is about, so the outcome can be shown and saved with it. */
  source?: { runId: string; findingId: string };
}
export interface SecurityOperationPlan extends ScanPlan {
  kind: SecurityOperationKind;
  /** Policy component, relative to the repository. Absent for the repository root. */
  path?: string;
  /** Where an accepted policy draft belongs. The plugin never writes it. */
  targetPath?: string;
  finding?: string;
  source?: { runId: string; findingId: string };
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
      /** True when targetPath already holds a SECURITY.md that this draft would replace. */
      replacesExisting: boolean;
      /** Unified diff from the existing file to the draft. Present only when replacing. */
      diff?: string;
      applied: false;
      truncated: boolean;
    }
  | {
      kind: 'validation';
      disposition: ValidationResult['disposition'];
      report: string;
      truncated: boolean;
    }
  | {
      kind: 'fix';
      /** The SDK's verdict on its own change. */
      status: PatchResult['status'];
      /** Verification report, or the reason the fix was blocked or failed. */
      report: string;
      /** The proposed change against the last commit. Empty when nothing changed. */
      diff: string;
      /** `pending` until the user applies or discards the diff. */
      resolution: 'pending' | 'applied' | 'discarded' | 'none';
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
export type SecurityOperationsClient = Pick<
  CodexSecurity,
  'generatePolicy' | 'validate' | 'patch' | 'close'
>;
export type SecurityOperationsFactory = (
  config: CodexSecurityConfig,
) => SecurityOperationsClient | Promise<SecurityOperationsClient>;
export interface SecurityOperationsOptions {
  createClient?: SecurityOperationsFactory;
  createWorkspace?: PatchWorkspaceFactory;
  mock?: boolean;
}

type Entry = {
  execution: PreparedScanPlan['sdk'];
  /** The worktree holding a proposed fix, until it is applied or discarded. */
  workspace?: PatchWorkspace;
  /** The exact change the user was shown. Apply uses this, not the worktree's later state. */
  fixDiff?: string;
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
  new (await loadSdk()).CodexSecurity(config);
const active = (state: SecurityOperationState) =>
  state.status === 'running' || state.status === 'awaiting_answers';
const textLimit = 48_000;
/** A rewrite diff carries both the old and new text. */
const diffLimit = 2 * textLimit;

function parseInputs(raw: unknown): SecurityOperationInputs {
  const value = (raw ?? {}) as Record<string, unknown>;
  if (value.kind !== 'policy' && value.kind !== 'validation' && value.kind !== 'fix')
    throw new SecurityInputError('Choose policy, validation or fix.');
  if (value.kind === 'policy' ? value.finding !== undefined : value.path !== undefined)
    throw new SecurityInputError('Policy takes a path; validation and fix take a finding.');
  if (value.path !== undefined && typeof value.path !== 'string')
    throw new SecurityInputError('Policy path must be a directory inside the repository.');
  // Callers may reuse their input object while preparation awaits I/O.
  return structuredClone(value) as unknown as SecurityOperationInputs;
}
function findingText(value: SecurityOperationInputs['finding']): string {
  const text = typeof value === 'string' ? value : value ? JSON.stringify(value) : '';
  if (!text.trim() || Buffer.byteLength(text) > 32 * 1024)
    throw new SecurityInputError('A finding is needed, as text or an object of at most 32 KiB.');
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
  #workspace: PatchWorkspaceFactory;
  #mock: boolean;
  #disposed = false;
  #entries = new Map<string, Entry>();
  #listeners = new Set<(state: SecurityOperationState) => void>();
  constructor(project: string, options: SecurityOperationsOptions = {}) {
    this.#project = project;
    this.#factory = options.createClient ?? realClient;
    this.#workspace = options.createWorkspace ?? createPatchWorkspace;
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
    const finding = input.kind === 'policy' ? undefined : findingText(input.finding);
    if (input.kind === 'fix') await gitRoot(resolve(this.#project, input.repository ?? '.'));
    const scan = await prepareScan(
      this.#project,
      { repository: input.repository, contextFiles: input.contextFiles },
      this.#mock,
      input.kind === 'policy' ? 'scan' : 'validation',
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
        : { finding, ...(input.source ? { source: input.source } : {}) }),
      costNotice:
        input.kind === 'validation'
          ? 'Validation has no cost limit in the SDK; scan.maxCostUsd does not apply.'
          : input.kind === 'fix'
            ? 'Proposing a fix has no cost limit in the SDK; scan.maxCostUsd does not apply.'
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
    entry.state.phase = {
      policy: 'Generating security policy draft',
      validation: 'Validating finding',
      fix: 'Writing and verifying a fix',
    }[entry.state.kind];
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
        const replacesExisting = typeof result.previousContent === 'string';
        // Computed in Node with no model call. The SDK refuses if SECURITY.md changed since the
        // draft read it; the draft has been paid for, so return it without a diff instead.
        const diff = replacesExisting
          ? await loadSdk()
              .then((sdk) => sdk.securityPolicyDiff(result, undefined, signal))
              .catch(() => undefined)
          : undefined;
        signal.throwIfAborted();
        entry.state.result = {
          kind: 'policy',
          content: safeReportText(result.content),
          reviewNotes: result.reviewNotes.slice(0, 100).map((note) => safeReportText(note, 2000)),
          targetPath: result.targetPath,
          replacesExisting,
          ...(diff === undefined ? {} : { diff: safeReportText(diff, diffLimit) }),
          applied: false,
          truncated:
            result.content.length > textLimit ||
            result.reviewNotes.length > 100 ||
            (diff?.length ?? 0) > diffLimit,
        };
        if (
          result.cost &&
          Number.isFinite(result.cost.estimatedUsd) &&
          result.cost.estimatedUsd >= 0
        )
          entry.state.estimatedCostUsd = result.cost.estimatedUsd;
      } else if (plan.kind === 'fix') {
        // The SDK edits files, so it works on a copy of the last commit, never the checkout.
        const workspace = (entry.workspace = await this.#workspace(
          plan.repository,
          entry.state.operationId,
        ));
        signal.throwIfAborted();
        const result = await client.patch({
          repositoryPath: workspace.directory,
          finding: plan.finding!,
          auth: entry.execution.auth,
          signal,
          onCost: (cost) => {
            if (observing() && Number.isFinite(cost.estimatedUsd) && cost.estimatedUsd >= 0) {
              entry.state.estimatedCostUsd = cost.estimatedUsd;
              this.#emit(entry);
            }
          },
        });
        signal.throwIfAborted();
        const diff = (entry.fixDiff = await workspace.diff());
        const report = ('verificationReport' in result && result.verificationReport) || '';
        const reason = ('reason' in result && result.reason) || '';
        entry.state.result = {
          kind: 'fix',
          status: result.status,
          report: safeReportText([reason, report].filter(Boolean).join('\n\n')),
          // Filtered like other report text: a fix may delete a hardcoded credential.
          diff: safeReportText(diff, diffLimit),
          resolution: diff ? 'pending' : 'none',
          truncated: diff.length > diffLimit,
        };
        if (result.cost && Number.isFinite(result.cost.estimatedUsd))
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
      // Keep the worktree only while a diff is waiting for the user's decision.
      const pending =
        entry.state.result?.kind === 'fix' && entry.state.result.resolution === 'pending';
      if (!pending && entry.workspace) {
        await entry.workspace.remove().catch(() => {});
        entry.workspace = undefined;
      }
      entry.state.status = outcome;
      entry.state.phase =
        outcome === 'completed'
          ? {
              policy: 'Security policy draft ready; not applied',
              validation: 'Validation assessment ready',
              fix: pending ? 'Fix ready to review' : 'No change proposed',
            }[plan.kind]
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
  /** Apply a proposed fix to the working tree, or throw it away. */
  async resolve(input: {
    operationId: string;
    action: 'apply' | 'discard';
  }): Promise<SecurityOperationState> {
    const entry = this.#entry(input?.operationId);
    const result = entry.state.result;
    if (result?.kind !== 'fix' || result.resolution !== 'pending' || !entry.workspace)
      throw new SecurityInputError('This operation has no fix waiting for a decision.');
    if (input.action !== 'apply' && input.action !== 'discard')
      throw new SecurityInputError('Choose apply or discard.');
    // A failed apply leaves the fix pending, so the user can retry or discard it.
    if (input.action === 'apply') await entry.workspace.apply(entry.fixDiff ?? '');
    await entry.workspace.remove();
    entry.workspace = undefined;
    entry.fixDiff = undefined;
    result.resolution = input.action === 'apply' ? 'applied' : 'discarded';
    entry.state.phase = input.action === 'apply' ? 'Fix applied' : 'Fix discarded';
    this.#emit(entry);
    return this.getState(input.operationId);
  }
  async dispose() {
    this.#disposed = true;
    for (const id of this.#entries.keys()) this.cancel(id);
    await Promise.all([...this.#entries.values()].map((entry) => entry.task));
    // Operations do not survive a restart, so neither do their worktrees.
    await Promise.all(
      [...this.#entries.values()].map((entry) => entry.workspace?.remove().catch(() => {})),
    );
    this.#listeners.clear();
  }
}
