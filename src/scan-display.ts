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
  return clean ? clean[0].toUpperCase() + clean.slice(1) : 'Starting scan';
}
export function progressLabel(run: ScanState) {
  const { done, total, unit = 'files' } = run.progress;
  return total > 0
    ? `${done} of ${total} ${unit}`
    : done > 0
      ? `${done} ${unit} completed`
      : 'Waiting for progress details';
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
