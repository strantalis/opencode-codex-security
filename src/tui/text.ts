import type { ScanState } from '../types';
import type { SecurityOperationState } from '../core/security-operations';
import { runtimeProblems, elapsedLabel, phaseLabel, projectName } from '../scan-display';

/**
 * Shape of the planned `setup` RPC result. Not called yet: wire it up by fetching
 * `client.setup({})` in the view and passing the result to `setupLine`.
 */
export interface SetupInfo {
  route: {
    provider: string;
    baseUrl?: string;
    model: string;
    reasoningEffort: string;
    daybreak: boolean;
    auth: string;
  };
  configFile: string;
  codexConfigFile: string;
  profile?: string;
  profiles: string[];
  runtime: { node: string | null; python: string | null };
}

/** SETUP LINE: "provider · model · credential source", plus a warning when a runtime is missing. */
export function setupLine(setup: SetupInfo): { text: string; warning?: string } {
  const { route, profile, runtime } = setup;
  const text = [
    route.provider,
    `${route.model} (${route.reasoningEffort})`,
    route.auth,
    ...(profile ? [`profile ${profile}`] : []),
  ].join(' · ');
  const problems = runtimeProblems(runtime);
  return problems.length ? { text, warning: `Scans need ${problems.join(' and ')}.` } : { text };
}

export function costLine(limit?: number) {
  return limit === undefined
    ? 'No cost limit set. Usage shown is an estimate.'
    : `Stops near USD ${limit} (estimated; in-flight work can go over).`;
}

export function runStatus(run: ScanState) {
  return run.status === 'running'
    ? 'Running'
    : run.status === 'completed'
      ? 'Done'
      : run.status === 'cancelled'
        ? 'Cancelled'
        : run.status === 'error'
          ? 'Failed'
          : 'Idle';
}

export function runRow(run: ScanState, now: number) {
  const parts = [
    runStatus(run),
    projectName(run.repository),
    run.plan?.scopePaths.length ? run.plan.scopePaths.join(', ') : 'Whole repository',
    run.mode ?? 'fixture',
  ];
  if (run.status === 'running') parts.push(elapsedLabel(run.startedAt, null, now));
  else if (run.status === 'completed')
    parts.push(`${run.findings.length} ${run.findings.length === 1 ? 'finding' : 'findings'}`);
  return parts.filter(Boolean).join(' · ');
}

export function operationTitle(op: SecurityOperationState) {
  return op.kind === 'policy' ? 'Policy draft' : 'Validation';
}

export function operationRow(op: SecurityOperationState) {
  return [
    operationTitle(op),
    phaseLabel(op.status),
    projectName(op.repository),
    ...(op.kind === 'policy' && op.plan.path ? [op.plan.path] : []),
  ].join(' · ');
}

export const cancellable = (op?: SecurityOperationState) =>
  !!op && ['prepared', 'running', 'awaiting_answers'].includes(op.status);

/** Cut a single line to `width` columns. */
export function fit(text: string, width: number) {
  const line = text.replace(/\s+/g, ' ');
  return line.length <= width ? line : line.slice(0, Math.max(0, width - 1)) + '…';
}

/** Keep `index` visible in a window of `size` rows. */
export function windowed<T>(items: T[], index: number, size: number) {
  const start = Math.max(0, Math.min(index - Math.floor(size / 2), items.length - size));
  return { start, items: items.slice(start, start + size) };
}

/** Comma- or newline-separated list from a prompt. */
export function splitList(value: string) {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
