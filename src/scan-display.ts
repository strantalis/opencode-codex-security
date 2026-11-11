import type { ScanState, Finding } from './types';

export const projectName = (path: string) =>
  path
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .at(-1) ||
  path ||
  'Project';
export function runTitle(run: ScanState) {
  return (
    run.plan?.scanPrompt?.split('\n')[0].slice(0, 72) ||
    (run.plan?.scopePaths.length ? run.plan.scopePaths.join(', ') : projectName(run.repository))
  );
}
export function scanScope(run: ScanState) {
  return run.plan?.scopePaths.join(', ') || 'Whole repository';
}
export function phaseLabel(phase: string) {
  const clean = phase.replace(/\s*\((files|reviews)\)$/, '').replaceAll('_', ' ');
  const labels: Record<string, string> = {
    preflight: 'Preparing scan',
    discovery: 'Reviewing source',
    'attack path': 'Reviewing attack paths',
    'file review': 'Reviewing source',
    ranking: 'Prioritizing findings',
    validation: 'Validating findings',
    reporting: 'Preparing report',
  };
  if (labels[clean]) return labels[clean];
  return clean ? clean[0].toUpperCase() + clean.slice(1) : 'Starting scan';
}
/** Phase counts are independent. A Deep maximum is a cap, never a denominator. */
export function phaseCounts(run: ScanState) {
  const progress = run.telemetry?.phaseProgress;
  const counts = progress
    ? progress.reviews && progress.reviews.total > 0
      ? { ...progress.reviews, unit: 'reviews' as const }
      : { ...progress.files, unit: 'files' as const }
    : { ...run.progress, unit: run.progress.unit ?? 'files' };
  return {
    ...counts,
    done: Number.isFinite(counts.done) ? Math.max(0, counts.done) : 0,
    total: Number.isFinite(counts.total) ? Math.max(0, counts.total) : 0,
  };
}
export function finalizingRun(run: ScanState) {
  return run.status === 'running' && run.telemetry?.lifecycle?.status === 'completed';
}
function sdkResultPending(run: ScanState) {
  const lifecycle = run.telemetry?.lifecycle?.status;
  return run.status === 'running' && lifecycle !== undefined && lifecycle !== 'running';
}
export function runPhaseLabel(run: ScanState) {
  if (run.status === 'cancelled') return 'Scan cancelled';
  if (run.status === 'error') return 'Scan stopped';
  if (run.status === 'completed') return 'Scan complete';
  if (finalizingRun(run)) return 'Finalizing results';
  if (sdkResultPending(run))
    return run.telemetry?.lifecycle?.status === 'failed'
      ? 'Finishing failed scan'
      : 'Finishing cancelled scan';
  if (run.deepProgress?.consolidating) return 'Consolidating deep review';
  return phaseLabel(run.telemetry?.phaseProgress?.phase ?? run.phase);
}
export function hasPhaseProgress(run: ScanState) {
  return run.status === 'running' && !sdkResultPending(run) && !run.deepProgress?.consolidating;
}
export function hasDeterminateProgress(run: ScanState) {
  const { done, total } = phaseCounts(run);
  return hasPhaseProgress(run) && total > 0 && done <= total;
}
export function progressLabel(run: ScanState) {
  const { done, total, unit } = phaseCounts(run);
  return total > 0
    ? `${done} of ${total} ${unit}`
    : done > 0
      ? `${done} ${unit} completed`
      : 'Waiting for progress details';
}
export function phaseContext(run: ScanState) {
  const progress = run.telemetry?.phaseProgress;
  return progress?.reviews && progress.reviews.total > 0 && progress.files.total > 0
    ? `Current phase only · ${progress.files.done} of ${progress.files.total} files`
    : 'Current phase only';
}
export function deepProgressLabel(run: ScanState) {
  const deep = run.deepProgress;
  if (!deep) return '';
  return `${deep.completed} deep ${deep.completed === 1 ? 'pass' : 'passes'} complete · ${deep.active} active · cap ${deep.maximum}`;
}
export function findingsPendingLabel(run: ScanState) {
  if (sdkResultPending(run) && !finalizingRun(run))
    return `The SDK reported ${run.telemetry?.lifecycle?.status === 'failed' ? 'a scan failure' : 'cancellation'}. Waiting for the final result; this is not a completed assessment.`;
  return finalizingRun(run)
    ? 'Analysis complete. Waiting for the SDK’s final result and findings.'
    : 'Findings will appear when the scan finishes.';
}
const usd = (value: number) => (value > 0 && value < 0.01 ? '<0.01' : value.toFixed(2));
export function usageLabel(run: ScanState) {
  const measurement = run.telemetry?.measurement;
  if (measurement) {
    const cost = measurement.cost;
    if (!cost || !Number.isFinite(cost.baselineUsd)) return 'Cost estimate unavailable';
    const amount = `USD ${usd(cost.baselineUsd)}`;
    if (measurement.coverage === 'partial') return `Partial estimate ${amount}`;
    if (measurement.coverage === 'unavailable')
      return `Last estimate ${amount} · coverage unavailable`;
    return `Estimated usage ${amount}`;
  }
  return run.estimatedCostUsd !== undefined && Number.isFinite(run.estimatedCostUsd)
    ? `Estimated usage USD ${usd(run.estimatedCostUsd)} · coverage unknown`
    : 'Cost estimate unavailable';
}
export function usageContext(run: ScanState) {
  const measurement = run.telemetry?.measurement;
  if (!measurement) return 'Usage coverage was not reported. Estimates are not invoices.';
  const missing = measurement.missingThreadCount;
  if (measurement.coverage === 'partial')
    return `Measured subtotal only${missing ? `; ${missing} ${missing === 1 ? 'session is' : 'sessions are'} missing` : ''}. The full estimate may be higher.`;
  if (measurement.coverage === 'unavailable') return 'The SDK could not establish usage coverage.';
  return 'All reported sessions are included. This is a usage estimate, not an invoice.';
}
export function usageRangeLabel(run: ScanState) {
  const range = run.telemetry?.measurement?.cost?.range;
  if (!range) return '';
  return range.max === null
    ? `USD ${usd(range.min)} or more; upper estimate unavailable`
    : `USD ${usd(range.min)}–${usd(range.max)}`;
}
export function activityRows(run: ScanState) {
  return [...(run.telemetry?.activity ?? [])].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}
/** Show each observed actor once; the disclosure retains the individual keyed activities. */
export function workerActivityRows(run: ScanState) {
  const seen = new Set<number | 'coordinator'>();
  return activityRows(run).filter((activity) => {
    const actor = activity.worker ?? 'coordinator';
    if (seen.has(actor)) return false;
    seen.add(actor);
    return true;
  });
}
export function activityActor(worker?: number) {
  return worker === undefined ? 'Coordinator' : `Worker ${worker}`;
}
export function activityStatusLabel(status: string, run: ScanState) {
  if (
    status === 'running' &&
    (run.status !== 'running' || sdkResultPending(run) || run.deepProgress?.consolidating)
  )
    return 'Last reported running';
  return status === 'running' ? 'Working' : status === 'failed' ? 'Failed' : 'Done';
}
export function workerSummary(run: ScanState) {
  const count = run.telemetry?.observedWorkers.length;
  return count ? `${count} worker ${count === 1 ? 'session' : 'sessions'} observed` : '';
}
export function dispatchLabel(run: ScanState) {
  const workers = run.workers;
  return workers
    ? `${phaseLabel(workers.phase)}: ${workers.started} started · ${workers.planned} planned`
    : '';
}
export function reconnectLabel(run: ScanState) {
  const retry = run.telemetry?.lastReconnect;
  if (!retry) return '';
  const reason = retry.reason ? ` · ${retry.reason.replaceAll('_', ' ')}` : '';
  return `Last connection retry: ${retry.attempt} of ${retry.maxAttempts}${reason}`;
}
/** Empty unless access is missing or unverified; a granted status is not worth a line. */
export function trustedAccessLabel(run: ScanState) {
  const status = run.telemetry?.trustedAccess;
  return status === 'not_granted'
    ? 'Trusted Access for Cyber: not granted'
    : status === 'unknown'
      ? 'Trusted Access for Cyber: not verified'
      : '';
}
export function targetChangedLabel(run: ScanState) {
  return run.telemetry?.warnings?.targetChanged ? 'The repository changed during the scan' : '';
}
export function resultCountsLabel(run: ScanState) {
  const counts = run.assessment?.returnedFindings;
  if (!counts)
    return `${run.findings.length} ${run.findings.length === 1 ? 'finding' : 'findings'} shown${run.skipped ? ` · ${run.skipped} other items omitted` : ''}`;
  if (counts.total === null) return 'Returned finding counts unavailable';
  return [
    `${counts.reportable ?? 'Unknown'} reportable`,
    `${counts.informational ?? 'Unknown'} informational`,
    ...(counts.unclassified ? [`${counts.unclassified} unclassified`] : []),
  ].join(' · ');
}
export function coverageLabel(run: ScanState) {
  const coverage = run.assessment?.coverage;
  if (!coverage || coverage.source === 'unavailable') return 'Coverage details unavailable';
  return [
    coverage.surfaces.total === null
      ? 'Surfaces unavailable'
      : `${coverage.surfaces.total} review ${coverage.surfaces.total === 1 ? 'surface' : 'surfaces'}`,
    coverage.deferred.total === null
      ? 'Deferred work unavailable'
      : `${coverage.deferred.total} deferred`,
    coverage.openQuestions.total === null
      ? 'Open questions unavailable'
      : `${coverage.openQuestions.total} open ${coverage.openQuestions.total === 1 ? 'question' : 'questions'}`,
  ].join(' · ');
}
export function repositoryMatchingLabel(run: ScanState) {
  const matches = run.assessment?.repositoryFindings;
  if (!matches?.available) return 'Repository matching unavailable';
  return `${matches.open ?? 'Unknown'} open · ${matches.closed ?? 'Unknown'} closed · ${matches.confirmedInLatestScan ?? 'Unknown'} confirmed in this scan`;
}
export function coverageDetails(run: ScanState) {
  const coverage = run.assessment?.coverage;
  if (!coverage) return [];
  const rows: { label: string; value: string }[] = [];
  const add = <T>(
    label: string,
    list: { total: number | null; items: T[]; omitted: number },
    describe: (item: T) => string,
  ) => {
    rows.push({
      label,
      value:
        list.total === null
          ? 'Not reported'
          : list.total === 0
            ? 'None reported'
            : `${list.total} reported${list.omitted ? `; ${list.omitted} not shown` : ''}`,
    });
    for (const item of list.items) rows.push({ label: '', value: describe(item) });
  };
  add(
    'Review surfaces',
    coverage.surfaces,
    (surface) =>
      `${surface.label ?? 'Unnamed surface'} · ${surface.disposition.replaceAll('_', ' ')}${surface.riskArea ? ` · ${surface.riskArea}` : ''}`,
  );
  add(
    'Explicit exclusions',
    coverage.explicitExclusions,
    (item) => `${item.pattern ?? 'Unspecified scope'}${item.reason ? ` · ${item.reason}` : ''}`,
  );
  add(
    'Deferred work',
    coverage.deferred,
    (item) =>
      `${item.reason ?? 'No reason reported'}${item.paths.items.length ? ` · ${item.paths.items.join(', ')}` : ''}`,
  );
  add(
    'Resolved deferred work',
    coverage.resolvedDeferred,
    (item) => item.reason ?? 'Resolution recorded',
  );
  add(
    'Open questions',
    coverage.openQuestions,
    (item) => item.question ?? 'Question details unavailable',
  );
  add('Included scope', coverage.scopeIncludePaths, (item) => item);
  add('Excluded scope', coverage.scopeExcludePaths, (item) => item);
  add('Review-excluded paths', coverage.reviewExcludedPaths, (item) => item);
  add('Limitations', coverage.limitations, (item) => item);
  return rows;
}
export function elapsedLabel(start: string | null, end: string | null, now = Date.now()) {
  if (!start) return '';
  const seconds = Math.max(
    0,
    Math.floor(((end ? Date.parse(end) : now) - Date.parse(start)) / 1000),
  );
  if (!Number.isFinite(seconds)) return '';
  return seconds < 60
    ? `${seconds}s`
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m ${seconds % 60}s`
      : `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
export function splitPaths(input: string) {
  return input
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}
export function userError(error: unknown) {
  return error && typeof error === 'object' && 'message' in error
    ? String(error.message)
    : String(error);
}

export function findingText(finding: Finding) {
  return `${finding.title}\nSeverity: ${finding.severity} · ${finding.cwe}\nLocation: ${finding.path}:${finding.line}\n\n${finding.summary}\n\nEvidence:\n${finding.evidence}\n\nSuggested remediation:\n${finding.remediation}`;
}

/** What the SDK needs on OpenCode's PATH to run a scan, and what was found instead. */
export function runtimeProblems(runtime: { node: string | null; python: string | null }) {
  const parts = (version: string | null) => (version?.match(/\d+/g) ?? []).map(Number);
  const [nodeMajor = 0, nodeMinor = 0] = parts(runtime.node);
  const [pythonMajor = 0, pythonMinor = 0] = parts(runtime.python);
  const found = (version: string | null) => (version ? `found ${version}` : 'not found');
  return [
    ...(nodeMajor === 24 || nodeMajor === 26 || (nodeMajor === 22 && nodeMinor >= 20)
      ? []
      : [`Node 22.20+, 24 or 26 (${found(runtime.node)})`]),
    ...(pythonMajor > 3 || (pythonMajor === 3 && pythonMinor >= 10)
      ? []
      : [`Python 3.10+ (${found(runtime.python)})`]),
  ];
}
