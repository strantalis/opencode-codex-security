import { basename } from 'node:path';
import type { RepositoryFinding, ScanResult, SurfaceDisposition } from '@openai/codex-security';
import { safeReportText } from './report-safety.ts';

/** Counts describe returned records, not unique vulnerabilities or review completeness. */
export interface SummaryList<T> {
  /** null means the source collection was unavailable, not empty. */
  total: number | null;
  items: T[];
  /** Includes invalid entries that could not safely be projected. */
  omitted: number;
}

export interface ReviewSurfaceSummary {
  id: string | null;
  label: string | null;
  disposition: SurfaceDisposition | 'unknown';
  riskArea: string | null;
}

export interface RepositoryFindingSummary {
  findingId: string | null;
  occurrenceId: string | null;
  status: RepositoryFinding['status'] | 'unknown';
  confirmedInLatestScan: boolean | null;
  knownSince: string | null;
  knownScanIds: SummaryList<string>;
  matchedFindingIds: SummaryList<string>;
}

export interface ScanOutcomeSummary {
  source: 'final-sdk-result';
  repository: string;
  returnedFindings: {
    total: number | null;
    reportable: number | null;
    informational: number | null;
    unclassified: number | null;
  };
  coverage: {
    /** reviewState is a guarded, non-schema-stable projection, never a completeness claim. */
    source: 'manifest-review-state' | 'unavailable';
    surfaces: SummaryList<ReviewSurfaceSummary> & {
      dispositions: Record<SurfaceDisposition | 'unknown', number> | null;
    };
    explicitExclusions: SummaryList<{ pattern: string | null; reason: string | null }>;
    deferred: SummaryList<{
      id: string | null;
      reason: string | null;
      paths: SummaryList<string>;
      surfaceIds: SummaryList<string>;
    }>;
    resolvedDeferred: SummaryList<{ id: string | null; reason: string | null }>;
    openQuestions: SummaryList<{ question: string | null }>;
    scopeIncludePaths: SummaryList<string>;
    scopeExcludePaths: SummaryList<string>;
    reviewExcludedPaths: SummaryList<string>;
    limitations: SummaryList<string>;
  };
  repositoryFindings: SummaryList<RepositoryFindingSummary> & {
    available: boolean;
    open: number | null;
    closed: number | null;
    unknownStatus: number | null;
    confirmedInLatestScan: number | null;
    notConfirmedInLatestScan: number | null;
    unknownConfirmation: number | null;
    withKnownSince: number | null;
    withMatchedFindingIds: number | null;
  };
  /** Manifest-declared metadata only. No file reads, existence checks, or clickable URLs. */
  artifacts: SummaryList<{ path: string; mediaType: string | null }>;
  notes: string[];
}

const MAX_ITEMS = 20;
const MAX_TEXT = 320;
const MAX_ID = 160;
const MAX_PATH = 320;
const DISPOSITIONS: readonly SurfaceDisposition[] = [
  'reported',
  'no_issue_found',
  'rejected',
  'not_applicable',
  'needs_follow_up',
];
const REPORTABLE_LEVELS = ['critical', 'high', 'medium', 'low'];
const SUMMARY_NOTES = [
  'Final returned finding counts are records, not new or unique vulnerability counts.',
  'Review details describe recorded dispositions, not exhaustive coverage or proof of security. Missing detail is unavailable, not zero.',
  'Repository status, confirmation, and matching fields are returned SDK metadata. Unconfirmed does not mean fixed; missing matches do not mean new. No deduplication progress is inferred.',
  'Artifact metadata is manifest-declared only. File contents and existence were not checked.',
];

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown, max = MAX_TEXT): string | null {
  const sanitized = safeReportText(value, max).trim();
  return sanitized || null;
}

function list<T>(value: unknown, project: (value: unknown) => T | null): SummaryList<T> {
  if (!Array.isArray(value)) return { total: null, items: [], omitted: 0 };
  const items: T[] = [];
  // Bound projection work as well as output. Aggregate counts below inspect all returned rows.
  for (const entry of value.slice(0, MAX_ITEMS)) {
    const projected = project(entry);
    if (projected !== null) items.push(projected);
  }
  return { total: value.length, items, omitted: value.length - items.length };
}

function strings(value: unknown, max = MAX_TEXT): SummaryList<string> {
  return list(value, (entry) => text(entry, max));
}

function disposition(value: unknown): SurfaceDisposition | 'unknown' {
  return DISPOSITIONS.includes(value as SurfaceDisposition)
    ? (value as SurfaceDisposition)
    : 'unknown';
}

function repositoryStatus(value: unknown): RepositoryFindingSummary['status'] {
  return value === 'open' || value === 'closed' ? value : 'unknown';
}

function confirmation(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function returnedCounts(value: unknown): ScanOutcomeSummary['returnedFindings'] {
  if (!Array.isArray(value))
    return { total: null, reportable: null, informational: null, unclassified: null };
  let reportable = 0,
    informational = 0,
    unclassified = 0;
  for (const finding of value) {
    const level = record(record(finding)?.severity)?.level;
    if (typeof level === 'string' && REPORTABLE_LEVELS.includes(level)) reportable++;
    else if (level === 'informational') informational++;
    else unclassified++;
  }
  return { total: value.length, reportable, informational, unclassified };
}

function surfaces(value: unknown): ScanOutcomeSummary['coverage']['surfaces'] {
  const projected = list(value, (entry): ReviewSurfaceSummary | null => {
    const row = record(entry);
    return row
      ? {
          id: text(row.id, MAX_ID),
          label: text(row.label),
          disposition: disposition(row.disposition),
          riskArea: text(row.riskArea),
        }
      : null;
  });
  if (!Array.isArray(value)) return { ...projected, dispositions: null };
  const dispositions: Record<SurfaceDisposition | 'unknown', number> = {
    reported: 0,
    no_issue_found: 0,
    rejected: 0,
    not_applicable: 0,
    needs_follow_up: 0,
    unknown: 0,
  };
  for (const row of value) dispositions[disposition(record(row)?.disposition)]++;
  return { ...projected, dispositions };
}

function repositoryFindings(value: unknown): ScanOutcomeSummary['repositoryFindings'] {
  const projected = list(value, (entry): RepositoryFindingSummary | null => {
    const row = record(entry);
    return row
      ? {
          findingId: text(row.findingId, MAX_ID),
          occurrenceId: text(row.occurrenceId, MAX_ID),
          status: repositoryStatus(row.status),
          confirmedInLatestScan: confirmation(row.confirmedInLatestScan),
          knownSince: text(row.knownSince, 64),
          knownScanIds: strings(row.knownScanIds, MAX_ID),
          matchedFindingIds: strings(row.matchedFindingIds, MAX_ID),
        }
      : null;
  });
  if (!Array.isArray(value))
    return {
      ...projected,
      available: false,
      open: null,
      closed: null,
      unknownStatus: null,
      confirmedInLatestScan: null,
      notConfirmedInLatestScan: null,
      unknownConfirmation: null,
      withKnownSince: null,
      withMatchedFindingIds: null,
    };
  let open = 0,
    closed = 0,
    unknownStatus = 0,
    confirmedInLatestScan = 0,
    notConfirmedInLatestScan = 0,
    unknownConfirmation = 0,
    withKnownSince = 0,
    withMatchedFindingIds = 0;
  for (const entry of value) {
    const row = record(entry);
    const status = repositoryStatus(row?.status);
    if (status === 'open') open++;
    else if (status === 'closed') closed++;
    else unknownStatus++;
    const confirmed = confirmation(row?.confirmedInLatestScan);
    if (confirmed === true) confirmedInLatestScan++;
    else if (confirmed === false) notConfirmedInLatestScan++;
    else unknownConfirmation++;
    if (text(row?.knownSince, 64)) withKnownSince++;
    if (
      Array.isArray(row?.matchedFindingIds) &&
      row.matchedFindingIds.some((id) => typeof id === 'string' && id.trim().length > 0)
    )
      withMatchedFindingIds++;
  }
  return {
    ...projected,
    available: true,
    open,
    closed,
    unknownStatus,
    confirmedInLatestScan,
    notConfirmedInLatestScan,
    unknownConfirmation,
    withKnownSince,
    withMatchedFindingIds,
  };
}

function artifact(entry: unknown): ScanOutcomeSummary['artifacts']['items'][number] | null {
  const row = record(entry);
  const path = row?.path;
  // A display-only relative manifest path, never an arbitrary file or a URL to open.
  if (
    typeof path !== 'string' ||
    path.length > MAX_PATH ||
    !path ||
    path.startsWith('/') ||
    /[\\:?#%]/.test(path) ||
    path.split('/').some((part) => !part || part === '.' || part === '..') ||
    [...path].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    return null;
  const safePath = text(path, MAX_PATH);
  if (!safePath) return null;
  return { path: safePath, mediaType: text(row?.mediaType, 100) };
}

/**
 * Project only final returned SDK metadata. This never reads artifacts or serializes a ScanResult,
 * turnResult, report, finding evidence, command, or arbitrary reviewState extension.
 * SDK 0.9.1 can remove reviewState during sealing and does not retain options.coverage. Missing
 * detail therefore stays unavailable; even a populated reviewState cannot establish completeness.
 */
export function summarizeScanResult(result: ScanResult, repository: string): ScanOutcomeSummary {
  const scan = record(result?.manifest?.scan);
  const scope = record(scan?.scope);
  const reviewState = record(scan?.reviewState);
  const review = record(result?.review) ?? record(scan?.review);
  return {
    source: 'final-sdk-result',
    repository: text(basename(repository), MAX_ID) ?? '',
    returnedFindings: returnedCounts(result?.findings?.findings),
    coverage: {
      source: reviewState ? 'manifest-review-state' : 'unavailable',
      surfaces: surfaces(reviewState?.surfaces),
      explicitExclusions: list(reviewState?.explicitExclusions, (entry) => {
        const row = record(entry);
        return row ? { pattern: text(row.pattern, MAX_PATH), reason: text(row.reason) } : null;
      }),
      deferred: list(reviewState?.deferred, (entry) => {
        const row = record(entry);
        return row
          ? {
              id: text(row.id, MAX_ID),
              reason: text(row.reason),
              paths: strings(row.paths, MAX_PATH),
              surfaceIds: strings(row.surfaceIds, MAX_ID),
            }
          : null;
      }),
      resolvedDeferred: list(reviewState?.resolvedDeferred, (entry) => {
        const row = record(entry);
        return row ? { id: text(row.id, MAX_ID), reason: text(row.reason) } : null;
      }),
      openQuestions: list(reviewState?.openQuestions, (entry) => {
        const row = record(entry);
        return row ? { question: text(row.question) } : null;
      }),
      scopeIncludePaths: strings(scope?.includePaths, MAX_PATH),
      scopeExcludePaths: strings(scope?.excludePaths, MAX_PATH),
      reviewExcludedPaths: strings(review?.excludedPaths, MAX_PATH),
      limitations: strings(scope?.limitations),
    },
    repositoryFindings: repositoryFindings(result?.repositoryFindings),
    artifacts: list(scan?.artifacts, artifact),
    notes: [...SUMMARY_NOTES],
  };
}
