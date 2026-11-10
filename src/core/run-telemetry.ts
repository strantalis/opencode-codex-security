import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { ScanOptions } from '@openai/codex-security';
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

/** Restore only our projected schema, never arbitrary extra fields from a local JSON record. */
export function sanitizeStoredTelemetry(
  value: unknown,
  repository: string,
): ScanTelemetry | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const stored = value as Partial<ScanTelemetry>,
    output = emptyTelemetry();
  const labels = [
    'Analysis update',
    'Scan update',
    'Searching source',
    'Reading source',
    'Listing files',
    'Repository command',
    'Tool call',
    'Command',
  ];
  for (const item of Array.isArray(stored.activity) ? stored.activity.slice(-100) : []) {
    if (
      !item ||
      !/^[a-f0-9]{24}$/.test(item.id) ||
      !['command', 'tool', 'reasoning', 'message'].includes(item.kind) ||
      !['running', 'completed', 'failed'].includes(item.status)
    )
      continue;
    const startedAt = timestamp(item.startedAt, '');
    const updatedAt = timestamp(item.updatedAt, '');
    if (!startedAt || !updatedAt) continue;
    output.activity.push({
      id: item.id,
      kind: item.kind,
      status: item.status,
      label: labels.includes(item.label) ? item.label : activityLabel(item.kind, ''),
      paths: safeActivityPaths(item.paths, repository),
      ...(finite(item.worker) ? { worker: count(item.worker) } : {}),
      startedAt,
      updatedAt,
    });
  }
  output.observedWorkers = [
    ...new Set(
      (Array.isArray(stored.observedWorkers) ? stored.observedWorkers : [])
        .filter(finite)
        .map(count),
    ),
  ].slice(0, 128);
  if (stored.lifecycle)
    output.lifecycle = lifecycleSummary(stored.lifecycle as CallbackValue<'onLifecycle'>);
  const progress = stored.phaseProgress;
  if (progress && typeof progress === 'object')
    output.phaseProgress = phaseSummary({
      phase: progress.phase,
      filesCompleted: progress.files?.done,
      filesTotal: progress.files?.total,
      ...(progress.reviews
        ? { reviewItems: { completed: progress.reviews.done, total: progress.reviews.total } }
        : {}),
    } as CallbackValue<'onProgress'>);
  const m = stored.measurement;
  if (
    m &&
    ['complete', 'partial', 'unavailable'].includes(m.coverage) &&
    timestamp(m.observedAt, '')
  ) {
    const c = m.cost;
    const cost =
      c && typeof c === 'object'
        ? costSummary({
            estimatedUsd: c.baselineUsd,
            model: c.model,
            estimatedUsdRange: c.range,
            pricing: { asOf: c.pricingAsOf, source: c.pricingSource },
          } as CallbackValue<'onCost'>)
        : undefined;
    output.measurement = {
      coverage: m.coverage,
      observedAt: timestamp(m.observedAt, ''),
      ...(finite(m.threadCount) ? { threadCount: count(m.threadCount) } : {}),
      ...(finite(m.missingThreadCount) ? { missingThreadCount: count(m.missingThreadCount) } : {}),
      ...(cost ? { cost } : {}),
      ...(m.usage &&
      [
        m.usage.inputTokens,
        m.usage.cachedInputTokens,
        m.usage.outputTokens,
        m.usage.reasoningOutputTokens,
        m.usage.totalTokens,
      ].every(finite)
        ? {
            usage: {
              inputTokens: count(m.usage.inputTokens),
              cachedInputTokens: count(m.usage.cachedInputTokens),
              outputTokens: count(m.usage.outputTokens),
              reasoningOutputTokens: count(m.usage.reasoningOutputTokens),
              totalTokens: count(m.usage.totalTokens),
            },
          }
        : {}),
    };
  }
  const r = stored.lastReconnect;
  if (r && finite(r.attempt) && finite(r.maxAttempts) && timestamp(r.at, ''))
    output.lastReconnect = {
      attempt: count(r.attempt),
      maxAttempts: count(r.maxAttempts),
      at: timestamp(r.at, ''),
      ...(['rate_limit', 'network', 'authentication', 'authorization'].includes(r.reason ?? '')
        ? { reason: r.reason }
        : {}),
      ...(finite(r.retryAfterSeconds) ? { retryAfterSeconds: r.retryAfterSeconds } : {}),
    };
  return output;
}
