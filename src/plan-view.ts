import { bedrockBaseUrl } from './core/bedrock-config.ts';
import type { ResolvedSdkSettings } from './core/sdk-settings';
import type { ScanState } from './types';
import type { ScanInputs, ScanPlan } from './core/scan-plan';
/** Public route details only: never resolve credentials or read configuration in the UI. */
export function describeInferenceRoute(settings: ResolvedSdkSettings): string {
  const { provider, bedrock, auth, source, model } = settings.codex;
  const destination = bedrock
    ? `Amazon Bedrock (${bedrockBaseUrl(bedrock)}, region ${bedrock.region})`
    : provider
      ? `${provider.id} (${provider.baseUrl})`
      : auth === 'api-key'
        ? 'OpenAI (https://api.openai.com/v1)'
        : 'OpenAI';
  const authentication = bedrock
    ? `existing AWS ${bedrock.profile ? `profile ${bedrock.profile}` : 'credential chain'} (access unverified; may use existing AWS credential helpers and identity services); no OpenAI sign-in or key`
    : auth === 'api-key'
      ? provider
        ? `API key from environment variable ${provider.envKey} (name only)`
        : 'OpenAI API key from OPENAI_API_KEY, otherwise CODEX_API_KEY (names only; no sign-in or credential import)'
      : 'dedicated ChatGPT sign-in';
  const headers =
    provider?.envHttpHeaders && Object.keys(provider.envHttpHeaders).length
      ? `; additional request headers from environment (names only): ${Object.entries(
          provider.envHttpHeaders,
        )
          .map(([header, variable]) => `${header} ← ${variable}`)
          .join(', ')}`
      : '';
  const temporaryCredentials =
    headers && settings.scan.mode === 'deep'
      ? '; Deep workers may use private temporary credential files; interrupted runs may leave them'
      : '';
  const configuration = source
    ? `; config ${source.path}${source.profile ? `, profile ${source.profile}` : ''}, SHA-256 ${source.digest}`
    : '';
  return `${destination}; auth: ${authentication}${headers}; model: ${model}${configuration}${provider ? '; gateway upstream routing is not verified' : ''}${temporaryCredentials}`;
}

export function describePlan(plan: ScanPlan): string {
  return `${plan.mock ? 'MOCK SDK TEST: no model calls or uploads.\n' : ''}Repository: ${plan.repository}\nScope: ${plan.scopePaths.join(', ') || 'whole repository'}\nScan prompt:\n${plan.scanPrompt || '(none)'}\nContext files: ${plan.contextFiles.map((f) => `${f.path} (${f.bytes} bytes, SHA-256 ${f.sha256})`).join('; ') || '(none)'}\nSDK settings: model ${plan.settings.codex.model}, reasoning ${plan.settings.codex.reasoningEffort}, Daybreak ${plan.settings.codex.daybreak ? 'on' : 'off'}; mode ${plan.settings.scan.mode} (${plan.inputs.mode ? 'per-scan choice' : 'global default'}), access program ${plan.settings.scan.cyberAccessProgram ?? 'Codex default'}, estimated cost stop USD ${plan.settings.scan.maxCostUsd}. Account/model/Daybreak access is not verified by these settings.\nGlobal config: ${plan.globalConfigFile}${plan.globalConfigDigest ? '' : ' (not present)'}\nOnly this explicit prompt and these files are added as context; conversation history is not copied. Scoped paths guide the scan, not a filesystem sandbox.\n${plan.mock ? 'Synthetic SDK responses only.' : `Repository source and listed context go to ${describeInferenceRoute(plan.settings)}. Local results. USD ${plan.settings.scan.maxCostUsd} estimated stop threshold, not a hard cap; in-flight usage may exceed it.`}`;
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
