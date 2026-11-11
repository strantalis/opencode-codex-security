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

export interface ScanInputs {
  mode?: 'standard' | 'deep';
  repository?: string;
  scopePaths?: string[];
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
    !strings(data.scopePaths) ||
    !strings(data.contextFiles) ||
    ![undefined, 'standard', 'deep'].includes(data.mode as string)
  )
    throw new SecurityInputError(
      'Scan inputs are repository, scopePaths, scanPrompt, contextFiles and mode (standard or deep).',
    );
  return data as ScanInputs;
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
  const sdk = await import('@openai/codex-security');
  // Resolve file profiles once, before preflight; execution must not reread a changed file.
  const config = await sdk.mergedCodexConfig({ codexOverrides: settings.codex }, codexHome());
  const profiles = config.profiles as Record<string, unknown> | undefined;
  if (typeof config.profile === 'string' && !profiles?.[config.profile]) delete config.profile;
  // SDK defaults include its own plugin-loading flag, which cannot be supplied as an override.
  if (config.features && typeof config.features === 'object')
    delete (config.features as JsonObject).plugins;
  return withSdk(config, async (client) => {
    const preflight = await client.preflight(repository, {
      ...scanSettings,
      auth: settings.auth,
      target: input.scopePaths?.length ? input.scopePaths : 'repository',
      knowledgeBasePaths: contextFiles.map((path) => resolve(repository, path)),
    });
    const provider = preflight.modelProvider ?? 'openai';
    const providers = config.model_providers as Record<string, { base_url?: string }> | undefined;
    const baseUrl =
      provider === 'openai' ? config.openai_base_url : providers?.[provider]?.base_url;
    const scopePaths = preflight.target.kind === 'paths' ? [...preflight.target.paths] : [];
    return {
      id: randomUUID(),
      repository: preflight.repository,
      scopePaths,
      scanPrompt: input.scanPrompt ?? '',
      contextFiles: contextFiles.map((path) => ({ path })),
      settings: {
        codex: {
          provider,
          ...(typeof baseUrl === 'string' ? { baseUrl } : {}),
          model: preflight.model,
          reasoningEffort: preflight.reasoningEffort,
          daybreak: config.daybreak === true,
          auth: describeAuthentication(preflight.authentication),
        },
        scan: { ...scanSettings, mode: preflight.mode },
      },
      globalConfigFile: settings.path,
      sdk: { codexOverrides: config, auth: settings.auth },
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      mock,
      inputs: { ...input, repository: preflight.repository, scopePaths, contextFiles },
    };
  });
}
