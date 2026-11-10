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

function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function storedList<T>(
  value: unknown,
  project: (entry: unknown) => T | null,
): SummaryList<T> | undefined {
  const row = record(value);
  if (!row || !Array.isArray(row.items) || !count(row.omitted)) return;
  if (row.total === null) {
    if (row.items.length || row.omitted !== 0) return;
    return { total: null, items: [], omitted: 0 };
  }
  if (!count(row.total) || row.total - row.items.length !== row.omitted) return;
  const projected = list(row.items, project);
  return { total: row.total, items: projected.items, omitted: row.total - projected.items.length };
}

function storedStrings(value: unknown, max = MAX_TEXT): SummaryList<string> | undefined {
  return storedList(value, (entry) => text(entry, max));
}

function storedCounts<K extends string>(
  value: Record<string, unknown>,
  total: number | null,
  keys: readonly K[],
): Record<K, number | null> | undefined {
  const result = {} as Record<K, number | null>;
  for (const key of keys) {
    const item = value[key];
    if (total === null) {
      if (item !== null) return;
      result[key] = null;
    } else {
      if (!count(item) || item > total) return;
      result[key] = item;
    }
  }
  return result;
}

/**
 * Revalidate persisted metadata independently of the enclosing run. Reject malformed schema or
 * contradictory counts, re-sanitize text, and rebuild the whitelist. Never trust saved notes or
 * recompute whole-scan counts from the bounded item samples. undefined discards only the assessment.
 */
export function sanitizeStoredOutcomeSummary(value: unknown): ScanOutcomeSummary | undefined {
  const root = record(value);
  if (root?.source !== 'final-sdk-result' || typeof root.repository !== 'string') return;
  const returned = record(root.returnedFindings);
  const coverage = record(root.coverage);
  const repository = record(root.repositoryFindings);
  if (!returned || !coverage || !repository) return;
  if (returned.total !== null && !count(returned.total)) return;
  const returnedCounts = storedCounts(returned, returned.total, [
    'reportable',
    'informational',
    'unclassified',
  ]);
  if (
    !returnedCounts ||
    (returned.total !== null &&
      Object.values(returnedCounts).reduce<number>((sum, value) => sum + (value ?? 0), 0) !==
        returned.total)
  )
    return;
  if (coverage.source !== 'manifest-review-state' && coverage.source !== 'unavailable') return;
  const rawSurfaces = record(coverage.surfaces);
  const surfaceList = storedList(coverage.surfaces, (entry) => surfaces([entry]).items[0] ?? null);
  if (!rawSurfaces || !surfaceList) return;
  let dispositions: ScanOutcomeSummary['coverage']['surfaces']['dispositions'] = null;
  if (surfaceList.total === null) {
    if (rawSurfaces.dispositions !== null) return;
  } else {
    const rawCounts = record(rawSurfaces.dispositions);
    if (!rawCounts) return;
    const counts = storedCounts(rawCounts, surfaceList.total, [
      ...DISPOSITIONS,
      'unknown',
    ] as const);
    if (
      !counts ||
      Object.values(counts).reduce<number>((sum, value) => sum + (value ?? 0), 0) !==
        surfaceList.total
    )
      return;
    // The numeric total branch above excludes null values for every disposition.
    dispositions = counts as Record<SurfaceDisposition | 'unknown', number>;
  }
  const explicitExclusions = storedList(coverage.explicitExclusions, (entry) => {
    const row = record(entry);
    return row ? { pattern: text(row.pattern, MAX_PATH), reason: text(row.reason) } : null;
  });
  const deferred = storedList(coverage.deferred, (entry) => {
    const row = record(entry);
    if (!row) return null;
    const paths = storedStrings(row.paths, MAX_PATH);
    const surfaceIds = storedStrings(row.surfaceIds, MAX_ID);
    return paths && surfaceIds
      ? { id: text(row.id, MAX_ID), reason: text(row.reason), paths, surfaceIds }
      : null;
  });
  const resolvedDeferred = storedList(coverage.resolvedDeferred, (entry) => {
    const row = record(entry);
    return row ? { id: text(row.id, MAX_ID), reason: text(row.reason) } : null;
  });
  const openQuestions = storedList(coverage.openQuestions, (entry) => {
    const row = record(entry);
    return row ? { question: text(row.question) } : null;
  });
  const scopeIncludePaths = storedStrings(coverage.scopeIncludePaths, MAX_PATH);
  const scopeExcludePaths = storedStrings(coverage.scopeExcludePaths, MAX_PATH);
  const reviewExcludedPaths = storedStrings(coverage.reviewExcludedPaths, MAX_PATH);
  const limitations = storedStrings(coverage.limitations);
  const artifacts = storedList(root.artifacts, artifact);
  if (
    !explicitExclusions ||
    !deferred ||
    !resolvedDeferred ||
    !openQuestions ||
    !scopeIncludePaths ||
    !scopeExcludePaths ||
    !reviewExcludedPaths ||
    !limitations ||
    !artifacts
  )
    return;
  if (
    coverage.source === 'unavailable' &&
    [surfaceList, explicitExclusions, deferred, resolvedDeferred, openQuestions].some(
      (collection) => collection.total !== null,
    )
  )
    return;
  const repositoryList = storedList(repository, (entry): RepositoryFindingSummary | null => {
    const row = record(entry);
    if (!row) return null;
    const knownScanIds = storedStrings(row.knownScanIds, MAX_ID);
    const matchedFindingIds = storedStrings(row.matchedFindingIds, MAX_ID);
    if (!knownScanIds || !matchedFindingIds) return null;
    return {
      findingId: text(row.findingId, MAX_ID),
      occurrenceId: text(row.occurrenceId, MAX_ID),
      status: repositoryStatus(row.status),
      confirmedInLatestScan: confirmation(row.confirmedInLatestScan),
      knownSince: text(row.knownSince, 64),
      knownScanIds,
      matchedFindingIds,
    };
  });
  if (!repositoryList || repository.available !== (repositoryList.total !== null)) return;
  const repositoryCounts = storedCounts(repository, repositoryList.total, [
    'open',
    'closed',
    'unknownStatus',
    'confirmedInLatestScan',
    'notConfirmedInLatestScan',
    'unknownConfirmation',
    'withKnownSince',
    'withMatchedFindingIds',
  ]);
  if (!repositoryCounts) return;
  if (
    repositoryList.total !== null &&
    ((repositoryCounts.open ?? 0) +
      (repositoryCounts.closed ?? 0) +
      (repositoryCounts.unknownStatus ?? 0) !==
      repositoryList.total ||
      (repositoryCounts.confirmedInLatestScan ?? 0) +
        (repositoryCounts.notConfirmedInLatestScan ?? 0) +
        (repositoryCounts.unknownConfirmation ?? 0) !==
        repositoryList.total)
  )
    return;
  return {
    source: 'final-sdk-result',
    repository: text(basename(root.repository), MAX_ID) ?? '',
    returnedFindings: { total: returned.total, ...returnedCounts },
    coverage: {
      source: coverage.source,
      surfaces: { ...surfaceList, dispositions },
      explicitExclusions,
      deferred,
      resolvedDeferred,
      openQuestions,
      scopeIncludePaths,
      scopeExcludePaths,
      reviewExcludedPaths,
      limitations,
    },
    repositoryFindings: {
      ...repositoryList,
      ...repositoryCounts,
      available: repositoryList.total !== null,
    },
    artifacts,
    notes: [...SUMMARY_NOTES],
  };
}
