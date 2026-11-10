import { open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from 'smol-toml';

export interface ProviderSettings {
  id: string;
  baseUrl: string;
  envKey: string;
  wireApi: 'responses';
}
export interface ProviderSource {
  path: string;
  profile?: string;
  /** Hash of the allowlisted selection only. Never hash credentials or the full source file. */
  digest: string;
}
export class ProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderConfigurationError';
  }
}
const fail = (message: string): never => {
  throw new ProviderConfigurationError(message);
};
export const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const reserved = new Set([
  'openai',
  'ollama',
  'lmstudio',
  'amazon-bedrock',
  'amazon-bedrock-runtime',
  'gcp',
  '__proto__',
  'prototype',
  'constructor',
]);
export function validateProvider(raw: unknown): ProviderSettings {
  if (
    !record(raw) ||
    Object.keys(raw).some((key) => !['id', 'baseUrl', 'envKey', 'wireApi'].includes(key))
  )
    return fail(
      'Provider accepts only id, baseUrl, envKey, and wireApi. Inline credentials, headers, and auth commands are unsupported.',
    );
  const { id, baseUrl, envKey, wireApi } = raw;
  if (
    typeof id !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id) ||
    reserved.has(id.toLowerCase())
  )
    return fail('Use a custom provider ID, not a built-in provider or reserved name.');
  if (typeof envKey !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(envKey))
    return fail('Provider envKey must be an environment-variable name, never a key value.');
  if (wireApi !== 'responses')
    return fail('Provider wireApi must be responses. Chat Completions is unsupported.');
  if (typeof baseUrl !== 'string' || baseUrl.length > 2048 || /[\s\x00-\x1f\x7f\\]/.test(baseUrl))
    return fail('Provider baseUrl must be a credential-free HTTPS URL.');
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return fail('Provider baseUrl must be a credential-free HTTPS URL.');
  }
  // Keep URLs safe to show in approval plans. No userinfo, query, fragment, opaque
  // schemes, encoded components, or token-bearing path segments are supported.
  if (
    url.protocol !== 'https:' ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    /[%@]/.test(baseUrl) ||
    !/^\/[A-Za-z0-9/_.-]*$/.test(url.pathname) ||
    url.pathname
      .split('/')
      .some((part) => part.length > 64 || /^(?:sk-|Bearer|token[=:]|key[=:])/i.test(part))
  )
    return fail(
      'Provider baseUrl must be HTTPS without credentials, query parameters, fragments, or encoded paths.',
    );
  return { id, baseUrl: url.href.replace(/\/$/, ''), envKey, wireApi };
}
export function validateConfigFile(value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length > 4096 ||
    /[\x00-\x1f\x7f]/.test(value) ||
    (!isAbsolute(value) && !value.startsWith('~/')) ||
    !value.endsWith('.toml')
  )
    fail('codex.configFile must be an absolute or ~/ path to a TOML file.');
}
export function validateProfile(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value))
    fail('codex.profile must be a simple named profile in the selected TOML file.');
}
/** Explicit opt-in only. Nothing here resolves ambient config, authentication, or SDK profiles. */
export async function readProviderConfiguration(configFile: string, profile?: string) {
  validateConfigFile(configFile);
  if (profile !== undefined) validateProfile(profile);
  const requested = configFile.startsWith('~/') ? join(homedir(), configFile.slice(2)) : configFile;
  let content: string;
  let path: string;
  try {
    const file = await open(
      requested,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > 256 * 1024) throw new Error();
      const bytes = Buffer.alloc(256 * 1024 + 1);
      const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
      if (bytesRead > 256 * 1024 || bytes.subarray(0, bytesRead).includes(0)) throw new Error();
      content = bytes.subarray(0, bytesRead).toString('utf8');
      path = await realpath(requested);
    } finally {
      await file.close();
    }
  } catch {
    return fail(
      'Cannot read the selected Codex config. Use a regular, nonsymlink TOML file of at most 256 KiB.',
    );
  }
  let root: Record<string, unknown>;
  try {
    root = parse(content);
  } catch {
    return fail(
      'Cannot parse the selected Codex TOML config. Parser details are withheld because they may contain credentials.',
    );
  }
  const selectedName = profile ?? root.profile;
  let selected: Record<string, unknown> = root;
  let profileFields: Record<string, unknown> = {};
  if (selectedName !== undefined) {
    validateProfile(selectedName);
    if (
      !record(root.profiles) ||
      !Object.hasOwn(root.profiles, selectedName) ||
      !record(root.profiles[selectedName])
    )
      return fail('The selected Codex profile is missing or invalid.');
    profileFields = root.profiles[selectedName];
    selected = { ...root, ...profileFields };
  }
  const id = selected.model_provider;
  if (typeof id !== 'string')
    return fail(
      'The selected Codex config must define its custom model_provider and model_providers entry.',
    );
  if (
    (root.model_providers !== undefined && !record(root.model_providers)) ||
    (profileFields.model_providers !== undefined && !record(profileFields.model_providers))
  )
    return fail('The selected Codex provider table must be an object.');
  const rootProviders = record(root.model_providers) ? root.model_providers : {};
  const profileProviders = record(profileFields.model_providers)
    ? profileFields.model_providers
    : {};
  // Inherit only the selected provider's fields, never whole profile/runtime configuration.
  const inherited = Object.hasOwn(rootProviders, id) ? rootProviders[id] : undefined;
  const override = Object.hasOwn(profileProviders, id) ? profileProviders[id] : undefined;
  if (
    (!record(inherited) && !record(override)) ||
    (inherited !== undefined && !record(inherited)) ||
    (override !== undefined && !record(override))
  )
    return fail(
      'The selected Codex config must define its custom model_provider and model_providers entry.',
    );
  const native = { ...(record(inherited) ? inherited : {}), ...(record(override) ? override : {}) };
  const ignoredHints = [
    'env_key_instructions',
    'request_max_retries',
    'stream_max_retries',
    'stream_idle_timeout_ms',
  ];
  if (
    Object.keys(native).some(
      (key) =>
        ![
          'name',
          'base_url',
          'env_key',
          'wire_api',
          'requires_openai_auth',
          ...ignoredHints,
        ].includes(key),
    ) ||
    (native.requires_openai_auth !== undefined && native.requires_openai_auth !== false)
  )
    return fail(
      'The selected provider uses unsupported options. Only Responses routing with env_key and requires_openai_auth=false is supported; headers, inline tokens, auth commands, and OAuth are not imported.',
    );
  const provider = validateProvider({
    id,
    baseUrl: native.base_url,
    envKey: native.env_key,
    wireApi: native.wire_api === undefined ? 'responses' : native.wire_api,
  });
  const settings = {
    provider,
    ...(selected.model === undefined ? {} : { model: selected.model }),
    ...(selected.model_reasoning_effort === undefined
      ? {}
      : { reasoningEffort: selected.model_reasoning_effort }),
    ...(selected.daybreak === undefined ? {} : { daybreak: selected.daybreak }),
  };
  // Only known non-secret configuration reaches the digest or callers. Validate
  // model/reasoning/daybreak in sdk-settings before exposing this selection.
  return { settings, path, profile: selectedName };
}
export function providerSource(
  path: string,
  profile: string | undefined,
  settings: unknown,
): ProviderSource {
  return {
    path,
    ...(profile === undefined ? {} : { profile }),
    digest: createHash('sha256').update(JSON.stringify(settings)).digest('hex'),
  };
}
