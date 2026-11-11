import type { ScanState } from './types';
import type { ScanInputs, ScanPlan } from './core/scan-plan';
export function describeCostLimit(limit?: number): string {
  return limit === undefined
    ? 'No cost limit is configured.'
    : `Stops at an estimated USD ${limit}. This is an estimate, not a billing cap.`;
}
/** Where source and context are sent, as the SDK resolved it. */
export function describeInferenceRoute(settings: ScanPlan['settings']): string {
  const { provider, baseUrl, auth, model, reasoningEffort } = settings.codex;
  return `${provider}${baseUrl ? ` (${baseUrl})` : ''} · ${model}, ${reasoningEffort} reasoning · ${auth}`;
}

export function describePlan(plan: ScanPlan): string {
  return [
    ...(plan.mock ? ['MOCK SDK TEST: no model calls or uploads.'] : []),
    `Repository: ${plan.repository}`,
    `Scope: ${plan.scopePaths.join(', ') || 'whole repository'}`,
    `Mode: ${plan.settings.scan.mode}`,
    ...(plan.scanPrompt ? [`Instructions: ${plan.scanPrompt}`] : []),
    ...(plan.contextFiles.length
      ? [`Context: ${plan.contextFiles.map((file) => file.path).join(', ')}`]
      : []),
    `Sent to: ${describeInferenceRoute(plan.settings)}`,
    describeCostLimit(plan.settings.scan.maxCostUsd),
  ].join('\n');
}

/** A UI choice affects only the next preview, never the global file. */
export function withScanMode(
  inputs: ScanInputs,
  mode: 'default' | 'standard' | 'deep',
): ScanInputs {
  const { mode: previous, ...rest } = inputs;
  return mode === 'default' ? rest : { ...rest, mode };
}

/** Only a verified local session workspace may route Desktop RPC; never use the sidecar's default home. */
export function localProjectDirectory(session: {
  server: { id: string };
  directory: string;
  location?: { directory: string };
}): string | undefined {
  if (
    session.server.id !== 'sidecar' ||
    !isAbsoluteLocalDirectory(session.directory) ||
    session.location?.directory !== session.directory
  )
    return undefined;
  return session.directory;
}

/** Pure path check for UI defaults; the service still verifies the target on disk. */
export function isAbsoluteLocalDirectory(directory: string | undefined): directory is string {
  return !!directory && (directory.startsWith('/') || /^[A-Za-z]:[\\/]/.test(directory));
}

/** Preview is the latest server preparation; never infer it from history insertion order. */
export function latestAvailableDraft(
  catalog: { drafts: ScanState[]; preview?: ScanState } | undefined,
  now = Date.now(),
  planId?: string,
): ScanState | undefined {
  const valid = (draft: ScanState | undefined): draft is ScanState =>
    !!draft?.plan && !draft.planConsumed && Date.parse(draft.plan.expiresAt) > now;
  if (planId) return catalog?.drafts.find((draft) => draft.plan?.id === planId && valid(draft));
  if (valid(catalog?.preview)) return catalog.preview;
  return undefined;
}
