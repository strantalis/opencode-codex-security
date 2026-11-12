import { realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  CodexSecurity,
  JsonObject,
  ScanAuthMode,
  ScanAuthentication,
  ScanSettings,
} from '@openai/codex-security';
import { codexHome, loadSettings } from './settings.ts';
import { SecurityInputError } from './errors.ts';
import { storedState } from './sign-in.ts';

export interface ScanInputs {
  mode?: 'standard' | 'deep';
  repository?: string;
  scopePaths?: string[];
  /** Scan a diff instead: "uncommitted", or a base ref to compare with HEAD. */
  changes?: string;
  scanPrompt?: string;
  contextFiles?: string[];
}
/** Where inference goes, as the SDK resolved it. For display only. */
export interface Route {
  provider: string;
  baseUrl?: string;
  model: string;
  reasoningEffort: string;
  daybreak: boolean;
  auth: string;
}
/** An immutable preview. A run executes exactly this, whatever changes on disk afterwards. */
export interface ScanPlan {
  id: string;
  repository: string;
  scopePaths: string[];
  /** Set for a diff scan: "uncommitted" or the base ref. */
  changes?: string;
  scanPrompt: string;
  contextFiles: { path: string }[];
  settings: { codex: Route; scan: ScanSettings & { mode: 'standard' | 'deep' } };
  globalConfigFile: string;
  expiresAt: string;
  mock: boolean;
  inputs: ScanInputs;
}

/** Execution-only configuration. Never serialize this into RPC, events or history. */
export interface PreparedScanPlan extends ScanPlan {
  sdk: { codexOverrides: JsonObject; auth: ScanAuthMode };
}
export function publicScanPlan(plan: ScanPlan): ScanPlan {
  const copy = structuredClone(plan) as ScanPlan & { sdk?: unknown };
  delete copy.sdk;
  return copy;
}

function parseInputs(value: unknown): ScanInputs {
  const data = (value ?? {}) as Record<string, unknown>;
  const strings = (list: unknown) =>
    list === undefined || (Array.isArray(list) && list.every((item) => typeof item === 'string'));
  if (
    typeof data !== 'object' ||
    Array.isArray(data) ||
    !['undefined', 'string'].includes(typeof data.repository) ||
    !['undefined', 'string'].includes(typeof data.scanPrompt) ||
    !['undefined', 'string'].includes(typeof data.changes) ||
    !strings(data.scopePaths) ||
    !strings(data.contextFiles) ||
    ![undefined, 'standard', 'deep'].includes(data.mode as string)
  )
    throw new SecurityInputError(
      'Scan inputs are repository, scopePaths, changes, scanPrompt, contextFiles and mode (standard or deep).',
    );
  if (data.changes && (data.scopePaths as string[] | undefined)?.length)
    throw new SecurityInputError('Scan either paths or changes, not both.');
  return data as ScanInputs;
}

/** The SDK target for a plan: the whole repository, paths, or a diff. */
export async function scanTarget(input: Pick<ScanInputs, 'scopePaths' | 'changes'>) {
  if (input.changes) {
    const { DiffTarget } = await import('@openai/codex-security');
    return input.changes === 'uncommitted'
      ? DiffTarget.workingTree()
      : DiffTarget.refs({ base: input.changes });
  }
  return input.scopePaths?.length ? [...input.scopePaths] : ('repository' as const);
}

async function resolveRepository(workspace: string, requested = '.') {
  // Anchor on the session workspace or an explicit path, never the plugin's own cwd.
  if (!isAbsolute(requested) && !isAbsolute(workspace ?? ''))
    throw new SecurityInputError('No local project is selected. Give an absolute repository path.');
  let repository: string;
  try {
    repository = await realpath(resolve(workspace ?? '', requested));
    if (!(await stat(repository)).isDirectory()) throw new Error();
  } catch {
    throw new SecurityInputError(`Repository is not a directory: ${requested}`);
  }
  const fromRepository = relative(repository, await realpath(homedir()));
  if (!fromRepository.startsWith('..' + sep) && fromRepository !== '..')
    throw new SecurityInputError('Choose a project, not your home folder or one of its parents.');
  return repository;
}

function describeAuthentication(authentication: ScanAuthentication): string {
  switch (authentication.method) {
    case 'api_key':
      // Preflight names the key without checking it; say so now rather than at run time.
      return `API key from ${authentication.source}${process.env[authentication.source] ? '' : " (not set in OpenCode's environment)"}`;
    case 'aws_credentials':
      return `AWS credentials (${authentication.source.replaceAll('_', ' ')})`;
    case 'stored_credentials':
      return 'Codex Security sign-in';
    default:
      return `provider ${authentication.method} authentication`;
  }
}

/** Run one offline SDK call. Creating a client starts nothing and reads no credentials. */
export async function withSdk<T>(
  codexOverrides: JsonObject,
  use: (client: CodexSecurity, sdk: typeof import('@openai/codex-security')) => Promise<T>,
): Promise<T> {
  const sdk = await import('@openai/codex-security');
  const client = new sdk.CodexSecurity({ codexOverrides });
  try {
    return await use(client, sdk);
  } finally {
    await client.close();
  }
}

/** A custom provider that declares no credential, such as a gateway behind a network identity. */
const keyless = (provider: string, entry: Record<string, unknown> | undefined) =>
  provider !== 'openai' &&
  !!entry &&
  !entry.env_key &&
  !entry.auth &&
  !entry.aws &&
  !entry.experimental_bearer_token &&
  entry.requires_openai_auth !== true;

/**
 * The SDK refuses to start without some credential, even for a provider that takes none.
 * Any key or sign-in satisfies it, and none is sent to such a provider.
 */
async function describeKeyless(authentication: ScanAuthentication): Promise<string> {
  const label = 'No API key (this provider has none configured)';
  if (authentication.method !== 'stored_credentials' || (await storedState()) !== 'needed')
    return label;
  return `${label}. The SDK still needs one to start: set CODEX_API_KEY=unused in OpenCode's environment`;
}

/** The route a preflight resolved, with the endpoint from the same config merge the SDK runs. */
export async function routeFrom(
  sdk: typeof import('@openai/codex-security'),
  codexOverrides: JsonObject,
  preflight: Awaited<ReturnType<CodexSecurity['preflight']>>,
): Promise<{ route: Route; signIn: boolean }> {
  // Includes a `<profile>.config.toml` file profile.
  const config = await sdk.mergedCodexConfig({ codexOverrides }, codexHome());
  const provider = preflight.modelProvider ?? 'openai';
  const entry = (config.model_providers as Record<string, Record<string, unknown>> | undefined)?.[
    provider
  ];
  const baseUrl = provider === 'openai' ? config.openai_base_url : entry?.base_url;
  const { authentication } = preflight;
  const noKey =
    keyless(provider, entry) && ['stored_credentials', 'api_key'].includes(authentication.method);
  return {
    route: {
      provider,
      ...(typeof baseUrl === 'string' ? { baseUrl } : {}),
      model: preflight.model,
      reasoningEffort: preflight.reasoningEffort,
      daybreak: config.daybreak === true,
      auth: noKey ? await describeKeyless(authentication) : describeAuthentication(authentication),
    },
    signIn: !noKey && authentication.method === 'stored_credentials',
  };
}

/** Resolve inputs and settings through the SDK's own preflight. No inference, no network. */
export async function prepareScan(
  workspace: string,
  raw: unknown = {},
  mock = false,
  purpose: 'scan' | 'validation' = 'scan',
): Promise<PreparedScanPlan> {
  const input = parseInputs(raw);
  const repository = await resolveRepository(workspace, input.repository);
  const settings = await loadSettings(input.mode);
  const contextFiles = [...new Set(input.contextFiles ?? [])];
  const scanSettings = { ...settings.scan };
  if (purpose === 'validation') delete scanSettings.maxCostUsd;
  const changes = input.changes?.trim() || undefined;
  const target = await scanTarget({ scopePaths: input.scopePaths, changes });
  return withSdk(settings.codex, async (client, sdk) => {
    const preflight = await client.preflight(repository, {
      ...scanSettings,
      auth: settings.auth,
      target,
      // Relative to the repository; absolute paths may name files in other checkouts.
      knowledgeBasePaths: contextFiles.map((path) => resolve(repository, path)),
    });
    const scopePaths = preflight.target.kind === 'paths' ? [...preflight.target.paths] : [];
    return {
      id: randomUUID(),
      repository: preflight.repository,
      scopePaths,
      ...(changes ? { changes } : {}),
      scanPrompt: input.scanPrompt ?? '',
      contextFiles: contextFiles.map((path) => ({ path })),
      settings: {
        codex: (await routeFrom(sdk, settings.codex, preflight)).route,
        scan: { ...scanSettings, mode: preflight.mode },
      },
      globalConfigFile: settings.path,
      sdk: { codexOverrides: settings.codex, auth: settings.auth },
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      mock,
      // No undefined members: the host only carries JSON values over RPC.
      inputs: {
        ...input,
        repository: preflight.repository,
        scopePaths,
        ...(changes ? { changes } : {}),
        contextFiles,
      },
    };
  });
}
