import { readFile, lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  validateBedrock,
  bedrockBaseUrl,
  validateBedrockEnvironment,
  type BedrockSettings,
} from './bedrock-config.ts';
import type { CodexSecurityConfig } from '@openai/codex-security';
import {
  readProviderConfiguration,
  OPENAI_API_BASE_URL,
  validateOpenAiApiEndpointEnvironment,
  defaultCodexConfigFile,
  providerSource,
  validateProvider,
  validateConfigFile,
  validateProfile,
  ProviderConfigurationError,
  type ProviderSettings,
  type ProviderSource,
} from './provider-config.ts';
export type CodexAuthentication = 'chatgpt' | 'api-key' | 'aws';

/** The SDK selects the AWS credential chain by provider, not by an aws auth option. */
export function sdkAuthentication(auth: CodexAuthentication): 'chatgpt' | 'api-key' | 'auto' {
  return auth === 'aws' ? 'auto' : auth;
}

export interface CodexSettings {
  model?: string;
  reasoningEffort?: string;
  daybreak?: boolean;
  auth?: CodexAuthentication;
  bedrock?: BedrockSettings;
  provider?: ProviderSettings;
  configFile?: string;
  useCodexConfig?: boolean;
  profile?: string;
}
export interface ScanSettings {
  mode?: 'standard' | 'deep';
  maxCostUsd?: number;
  maxTimeMinutes?: number;
  cyberAccessProgram?: 'standard' | 'daybreak_blue' | 'daybreak_red';
  workers?: number;
  subagents?: number;
}
export interface SdkSettings {
  codex?: CodexSettings;
  scan?: ScanSettings;
}
export interface ResolvedSdkSettings {
  codex: Required<Pick<CodexSettings, 'model' | 'reasoningEffort' | 'daybreak' | 'auth'>> & {
    provider?: ProviderSettings;
    bedrock?: BedrockSettings;
    source?: ProviderSource;
  };
  scan: ScanSettings & { mode: 'standard' | 'deep'; maxCostUsd: number };
}
export const defaultSettings: ResolvedSdkSettings = {
  codex: { model: 'gpt-5.6-sol', reasoningEffort: 'xhigh', daybreak: false, auth: 'chatgpt' },
  scan: { mode: 'standard', maxCostUsd: 1 },
};
export function validateSettings(raw: unknown): SdkSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('SDK settings must be objects.');
  const value = raw as Record<string, unknown>;
  for (const section of ['codex', 'scan']) {
    if (value[section] === undefined) continue;
    const group = value[section];
    if (!group || typeof group !== 'object' || Array.isArray(group))
      throw new Error(`${section} settings must be an object.`);
    const allowed =
      section === 'codex'
        ? [
            'model',
            'reasoningEffort',
            'daybreak',
            'auth',
            'provider',
            'bedrock',
            'configFile',
            'useCodexConfig',
            'profile',
          ]
        : ['mode', 'maxCostUsd', 'maxTimeMinutes', 'cyberAccessProgram', 'workers', 'subagents'];
    for (const [key, val] of Object.entries(group)) {
      if (!allowed.includes(key))
        throw new Error(
          `Unsupported ${section} setting. Credentials and arbitrary runtime overrides are not accepted.`,
        );
      if (key === 'auth' && !['chatgpt', 'api-key', 'aws'].includes(val as string))
        throw new ProviderConfigurationError('codex.auth must be chatgpt, api-key, or aws.');
      if (key === 'useCodexConfig' && typeof val !== 'boolean')
        throw new ProviderConfigurationError('codex.useCodexConfig must be true or false.');
      if (key === 'provider') validateProvider(val);
      if (key === 'bedrock') validateBedrock(val);
      if (key === 'configFile') validateConfigFile(val);
      if (key === 'profile') validateProfile(val);
      if (
        key === 'model' &&
        (typeof val !== 'string' || !val.trim() || val.length > 200 || /[\x00-\x1f]/.test(val))
      )
        throw new Error('model must be a nonempty model ID.');
      if (
        key === 'reasoningEffort' &&
        !['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(val as string)
      )
        throw new Error('Unsupported reasoningEffort.');
      if (key === 'daybreak' && typeof val !== 'boolean')
        throw new Error('daybreak must be true or false.');
      if (key === 'mode' && !['standard', 'deep'].includes(val as string))
        throw new Error('mode must be standard or deep.');
      if (
        key === 'cyberAccessProgram' &&
        !['standard', 'daybreak_blue', 'daybreak_red'].includes(val as string)
      )
        throw new Error('Unsupported cyberAccessProgram.');
      if (
        ['maxCostUsd', 'maxTimeMinutes', 'workers', 'subagents'].includes(key) &&
        (typeof val !== 'number' ||
          !Number.isFinite(val) ||
          (key === 'subagents' ? val < 0 : val <= 0) ||
          (['workers', 'subagents'].includes(key) && !Number.isInteger(val)))
      )
        throw new Error(
          `${key} must be positive${['workers', 'subagents'].includes(key) ? ' and integral' : ''}.`,
        );
    }
  }
  return {
    codex: value.codex as CodexSettings | undefined,
    scan: value.scan as ScanSettings | undefined,
  };
}
export async function loadGlobalSettings(
  path = join(
    process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
    'opencode',
    'codex-security.json',
  ),
) {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 32768)
      throw new Error('Global config must be a regular JSON file of at most 32 KiB.');
    const content = await readFile(path);
    if (content.length > 32768) throw new Error('Global config too large.');
    let raw: unknown;
    try {
      raw = JSON.parse(content.toString('utf8'));
    } catch {
      throw new Error('Global config is not valid JSON. Parser details are withheld.');
    }
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      Object.keys(raw).some((k) => !['codex', 'scan'].includes(k))
    )
      throw new Error('Global config accepts only codex and scan sections.');
    return {
      settings: validateSettings(raw),
      path,
      digest: createHash('sha256').update(content).digest('hex'),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { settings: {}, path, digest: null };
    throw error;
  }
}
/** Resolve only user-owned global settings; model tool inputs cannot select routing. */
export async function resolveSettings(
  source: SdkSettings,
  mode?: 'standard' | 'deep',
): Promise<ResolvedSdkSettings> {
  validateSettings(source);
  const explicit = source.codex ?? {};
  if (explicit.useCodexConfig === false && explicit.configFile)
    throw new ProviderConfigurationError(
      'codex.configFile cannot be combined with useCodexConfig=false.',
    );
  const requestedImport = explicit.useCodexConfig === true || explicit.configFile !== undefined;
  const discovering =
    !requestedImport &&
    explicit.useCodexConfig !== false &&
    explicit.provider === undefined &&
    explicit.bedrock === undefined &&
    explicit.auth === undefined;
  const importing = requestedImport || discovering;
  if (importing && (explicit.provider || explicit.bedrock))
    throw new ProviderConfigurationError(
      'Choose existing Codex config import or explicit provider/bedrock settings, not both.',
    );
  if (explicit.profile && !importing)
    throw new ProviderConfigurationError(
      'codex.profile requires Codex config discovery, useCodexConfig=true, or codex.configFile.',
    );
  // Explicit paths take precedence without even consulting ignored CODEX_HOME.
  const imported = importing
    ? await readProviderConfiguration(
        explicit.configFile ?? defaultCodexConfigFile(),
        explicit.profile,
        discovering && explicit.profile === undefined,
      )
    : undefined;
  const selected = imported ? validateSettings({ codex: imported.settings }).codex! : {};
  const {
    configFile: _configFile,
    useCodexConfig: _useCodexConfig,
    profile: _profile,
    ...overrides
  } = explicit;
  const codex = { ...defaultSettings.codex, ...selected, ...overrides };
  if (codex.bedrock) {
    codex.bedrock = validateBedrock(codex.bedrock);
    validateBedrockEnvironment();
    if (codex.provider || (explicit.auth !== undefined && explicit.auth !== 'aws'))
      throw new ProviderConfigurationError(
        'Native Bedrock requires AWS authentication and cannot be combined with a custom provider or OpenAI authentication.',
      );
    if (!selected.model && !explicit.model)
      throw new ProviderConfigurationError(
        'Native Bedrock requires an explicit Bedrock model ID. No default model or provider was selected.',
      );
    codex.auth = 'aws';
  } else if (codex.auth === 'aws') {
    throw new ProviderConfigurationError(
      'AWS authentication requires native codex.bedrock settings.',
    );
  }
  if (codex.provider) {
    codex.provider = validateProvider(codex.provider);
    if (explicit.auth !== undefined && explicit.auth !== 'api-key')
      throw new ProviderConfigurationError(
        'Custom providers require api-key authentication; ChatGPT credentials will not be forwarded.',
      );
    codex.auth = 'api-key';
  }
  if (
    (codex.provider || codex.bedrock) &&
    (codex.daybreak ||
      (source.scan?.cyberAccessProgram && source.scan.cyberAccessProgram !== 'standard'))
  ) {
    throw new ProviderConfigurationError(
      'The OpenAI Daybreak access-program toggle is not supported for this route. Bedrock Daybreak is selected by its provisioned model ID, not this toggle. Use daybreak=false and omit cyberAccessProgram or use standard; this does not change the selected model.',
    );
  }
  if (!codex.provider && codex.auth === 'api-key') validateOpenAiApiEndpointEnvironment();
  if (imported) codex.source = providerSource(imported.path, imported.profile, selected);
  return { codex, scan: { ...defaultSettings.scan, ...source.scan, ...(mode ? { mode } : {}) } };
}

/** Build the entire routing override from validated, non-secret fields. Never pass a profile. */
export function sdkConfiguration(
  settings?: ResolvedSdkSettings,
  auth?: CodexAuthentication,
): CodexSecurityConfig {
  const codex = settings?.codex;
  const provider = codex?.provider ? validateProvider(codex.provider) : undefined;
  const bedrock = codex?.bedrock ? validateBedrock(codex.bedrock) : undefined;
  if (
    (bedrock && (provider || codex?.auth !== 'aws')) ||
    (!bedrock && (codex?.auth ?? auth) === 'aws')
  )
    throw new ProviderConfigurationError(
      'AWS authentication must match the approved native Bedrock route.',
    );
  if (provider && codex?.auth !== 'api-key')
    throw new ProviderConfigurationError('Custom providers require api-key authentication.');
  return {
    codexOverrides: {
      model_provider: bedrock ? 'amazon-bedrock' : (provider?.id ?? 'openai'),
      ...(bedrock
        ? {
            analytics: { enabled: false },
            model_providers: {
              'amazon-bedrock': { base_url: bedrockBaseUrl(bedrock), aws: { ...bedrock } },
            },
          }
        : {}),
      ...(!provider && (codex?.auth ?? auth) === 'api-key'
        ? { openai_base_url: OPENAI_API_BASE_URL }
        : {}),
      ...(codex
        ? {
            model: codex.model,
            model_reasoning_effort: codex.reasoningEffort,
            daybreak: codex.daybreak,
          }
        : {}),
      ...(provider
        ? {
            analytics: { enabled: false },
            model_providers: {
              [provider.id]: {
                name: provider.id,
                base_url: provider.baseUrl,
                env_key: provider.envKey,
                ...(provider.envHttpHeaders ? { env_http_headers: provider.envHttpHeaders } : {}),
                wire_api: provider.wireApi,
                requires_openai_auth: false,
              },
            },
          }
        : {}),
    },
  };
}
