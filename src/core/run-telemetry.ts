import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type {
  ScanAuthentication,
  ScanOptions,
  ScanTrustedAccessStatus,
} from '@openai/codex-security';
import { safeReportText } from './report-safety.ts';

type CallbackValue<K extends keyof ScanOptions> = Parameters<
  NonNullable<ScanOptions[K]> extends (...args: infer A) => unknown
    ? (...args: A) => unknown
    : never
>[0];
export interface ScanActivityEntry {
  id: string;
  kind: 'command' | 'tool' | 'reasoning' | 'message';
  status: 'running' | 'completed' | 'failed';
  label: string;
  /** What the step said, for the user's own screen. Never returned to the session model. */
  detail?: string;
  paths: string[];
  worker?: number;
  startedAt: string;
  updatedAt: string;
}
export interface ScanMeasurement {
  coverage: 'complete' | 'partial' | 'unavailable';
  observedAt: string;
  threadCount?: number;
  missingThreadCount?: number;
  usage?: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningOutputTokens: number;
    totalTokens: number;
  };
  cost?: {
    baselineUsd: number;
    range?: { min: number; max: number | null };
    model?: string;
    pricingAsOf?: string;
    pricingSource?: string;
  };
}
export interface ScanTelemetry {
  activity: ScanActivityEntry[];
  observedWorkers: number[];
  lifecycle?: {
    status: 'running' | 'completed' | 'failed' | 'canceled';
    hasReportableFindings: boolean | null;
    finishedAt: string | null;
  };
  phaseProgress?: {
    phase: string;
    files: { done: number; total: number };
    reviews?: { done: number; total: number };
  };
  measurement?: ScanMeasurement;
  lastReconnect?: {
    attempt: number;
    maxAttempts: number;
    reason?: 'rate_limit' | 'network' | 'authentication' | 'authorization';
    retryAfterSeconds?: number;
    at: string;
  };
  /** The authentication the SDK actually used, described without secrets. */
  authentication?: string;
  /** Trusted Access for Cyber, as the SDK observed it. Not reported for Bedrock routes. */
  trustedAccess?: ScanTrustedAccessStatus;
  /** SDK warnings. Their text is not kept: it can carry raw error output. */
  warnings?: { count: number; targetChanged: boolean };
}
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
export const count = (n: unknown) =>
  finite(n) ? Math.min(Math.floor(n), Number.MAX_SAFE_INTEGER) : 0;
const timestamp = (value: unknown, fallback: string) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : fallback;
export const emptyTelemetry = (): ScanTelemetry => ({ activity: [], observedWorkers: [] });

/** Mentioned repository paths only; never expose command arguments or outside/credential paths. */
export function safeActivityPaths(values: unknown, repository: string): string[] {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values.slice(0, 8).flatMap((value) => {
        if (
          typeof value !== 'string' ||
          value.length > 1000 ||
          safeReportText(value) !== value ||
          value.includes('\\') ||
          /[\r\n\t\u202a-\u202e\u2066-\u2069]/.test(value)
        )
          return [];
        const path = relative(resolve(repository), resolve(repository, value));
        if (!path || path === '..' || path.startsWith('..' + sep) || isAbsolute(path)) return [];
        const parts = path.split(sep);
        if (
          parts.some(
            (part) =>
              [
                '.git',
                '.ssh',
                '.aws',
                '.codex',
                '.runtime',
                'node_modules',
                'auth.json',
                'credentials.json',
                'id_rsa',
                'id_ed25519',
              ].includes(part) || /^\.env(?:\.|$)/.test(part),
          )
        )
          return [];
        return [parts.join('/')];
      }),
    ),
  ];
}
function activityLabel(kind: ScanActivityEntry['kind'], description: string): string {
  // Raw descriptions include commands, arguments and reasoning. Extract only a fixed category.
  if (kind === 'reasoning') return 'Analysis update';
  if (kind === 'message') return 'Scan update';
  const executable = /^\s*(?:\/(?:usr\/)?bin\/)?([a-z][a-z0-9_-]*)(?:\s|$)/i
    .exec(description)?.[1]
    ?.toLowerCase();
  if (['rg', 'grep'].includes(executable ?? '')) return 'Searching source';
  if (['cat', 'sed', 'head', 'tail', 'read_file'].includes(executable ?? ''))
    return 'Reading source';
  if (['ls', 'find', 'list_files'].includes(executable ?? '')) return 'Listing files';
  if (executable === 'git') return 'Repository command';
  return kind === 'tool' ? 'Tool call' : 'Command';
}
/** One redacted line of what a step said. Opaque tool payloads are reduced to the tool's name. */
function activityDetail(kind: ScanActivityEntry['kind'], description: string): string | undefined {
  const text = safeReportText(description, 4000).replace(/\s+/g, ' ').trim();
  if (!text) return;
  if (kind === 'tool') {
    const [name = '', payload = ''] = text.split(' · ', 2);
    if (name === 'spawn_agent') return 'Starting a worker';
    if (/\S{60,}/.test(payload)) return name;
  }
  return text.length > 400 ? `${text.slice(0, 399)}…` : text;
}
export function recordActivity(
  telemetry: ScanTelemetry,
  value: CallbackValue<'onActivity'>,
  repository: string,
  now = new Date().toISOString(),
): void {
  if (
    !value ||
    typeof value.id !== 'string' ||
    !['command', 'tool', 'reasoning', 'message'].includes(value.kind) ||
    !['running', 'completed', 'failed'].includes(value.status)
  )
    return;
  const worker = finite(value.worker) ? count(value.worker) : undefined;
  // Some SDK activity IDs contain raw prose. Hash before storage or any presentation.
  const id = createHash('sha256')
    .update(`${worker ?? 'coordinator'}:${value.kind}:${value.id}`)
    .digest('hex')
    .slice(0, 24);
  const previous = telemetry.activity.find((item) => item.id === id);
  if (previous && previous.status !== 'running' && value.status === 'running') return;
  const item: ScanActivityEntry = {
    id,
    kind: value.kind,
    status: value.status,
    label: activityLabel(value.kind, value.description ?? ''),
    ...(activityDetail(value.kind, value.description ?? '')
      ? { detail: activityDetail(value.kind, value.description ?? '') }
      : {}),
    paths: safeActivityPaths(value.paths, repository),
    ...(worker === undefined ? {} : { worker }),
    startedAt: previous?.startedAt ?? now,
    updatedAt: now,
  };
  if (previous) telemetry.activity[telemetry.activity.indexOf(previous)] = item;
  else telemetry.activity.push(item);
  telemetry.activity = telemetry.activity.slice(-100);
}
export function costSummary(value: CallbackValue<'onCost'>): ScanMeasurement['cost'] {
  if (!value || !finite(value.estimatedUsd)) return;
  const range = value.estimatedUsdRange;
  return {
    baselineUsd: value.estimatedUsd,
    ...(range &&
    finite(range.min) &&
    (range.max === null || (finite(range.max) && range.max >= range.min))
      ? { range: { min: range.min, max: range.max } }
      : {}),
    model: safeReportText(value.model, 200),
    ...(value.pricing?.asOf ? { pricingAsOf: safeReportText(value.pricing.asOf, 40) } : {}),
    ...(value.pricing?.source === 'https://developers.openai.com/api/docs/pricing'
      ? { pricingSource: value.pricing.source }
      : {}),
  };
}
export function measurementSummary(
  value: CallbackValue<'onMeasurement'>,
  now = new Date().toISOString(),
): ScanMeasurement {
  const usage = value.usage;
  return {
    coverage: ['complete', 'partial', 'unavailable'].includes(value.coverage)
      ? value.coverage
      : 'unavailable',
    observedAt: timestamp(value.observedAt, now),
    threadCount: count(value.threadCount),
    missingThreadCount: count(value.missingThreadCount),
    ...(usage &&
    [
      usage.input_tokens,
      usage.cached_input_tokens,
      usage.output_tokens,
      usage.reasoning_output_tokens,
      usage.total_tokens,
    ].every(finite)
      ? {
          usage: {
            inputTokens: count(usage.input_tokens),
            cachedInputTokens: count(usage.cached_input_tokens),
            outputTokens: count(usage.output_tokens),
            reasoningOutputTokens: count(usage.reasoning_output_tokens),
            totalTokens: count(usage.total_tokens),
          },
        }
      : {}),
    ...(value.cost ? { cost: costSummary(value.cost) } : {}),
  };
}
export function lifecycleSummary(value: CallbackValue<'onLifecycle'>): ScanTelemetry['lifecycle'] {
  if (!['running', 'completed', 'failed', 'canceled'].includes(value.status)) return;
  return {
    status: value.status,
    hasReportableFindings:
      typeof value.hasReportableFindings === 'boolean' ? value.hasReportableFindings : null,
    finishedAt: value.finishedAt ? timestamp(value.finishedAt, '') || null : null,
  };
}
/**
 * Same wording as the preview's route description (scan-plan.ts), minus its preflight-only
 * "not set" note: by now the SDK has resolved the credential it will use.
 */
export function authenticationSummary(authentication: ScanAuthentication): string {
  switch (authentication.method) {
    case 'api_key':
      return `API key from ${authentication.source}`;
    case 'aws_credentials':
      return `AWS credentials (${authentication.source.replaceAll('_', ' ')})`;
    case 'stored_credentials':
      return 'Codex Security sign-in';
    default:
      return `provider ${authentication.method} authentication`;
  }
}
export function recordWarning(
  telemetry: ScanTelemetry,
  details: Parameters<NonNullable<ScanOptions['onWarning']>>[1],
): void {
  const warnings = (telemetry.warnings ??= { count: 0, targetChanged: false });
  warnings.count = count(warnings.count + 1);
  if (details?.kind === 'target_changed') warnings.targetChanged = true;
}
export function phaseSummary(
  value: CallbackValue<'onProgress'>,
): NonNullable<ScanTelemetry['phaseProgress']> {
  return {
    phase: [
      'preflight',
      'threat_model',
      'discovery',
      'validation',
      'attack_path',
      'reporting',
    ].includes(value.phase)
      ? value.phase
      : 'unknown',
    files: { done: count(value.filesCompleted), total: count(value.filesTotal) },
    ...(value.reviewItems
      ? {
          reviews: {
            done: count(value.reviewItems.completed),
            total: count(value.reviewItems.total),
          },
        }
      : {}),
  };
}
