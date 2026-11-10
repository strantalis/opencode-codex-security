import { ProviderConfigurationError, record } from './provider-validation.ts';
import { open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';
import { validateBedrock } from './bedrock-config.ts';
import { parse } from 'smol-toml';

export const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';

export interface ProviderSettings {
  id: string;
  baseUrl: string;
  envKey: string;
  wireApi: 'responses';
  envHttpHeaders?: Record<string, string>;
}
export interface ProviderSource {
  path: string;
  profile?: string;
  /** Hash of the allowlisted selection only. Never hash credentials or the full source file. */
  digest: string;
}
export { ProviderConfigurationError, record } from './provider-validation.ts';
const fail = (message: string): never => {
  throw new ProviderConfigurationError(message);
};
/** Endpoint overrides must not silently redirect an approved built-in API route. */
export function validateOpenAiApiEndpointEnvironment(
  environment: Record<string, string | undefined> = process.env,
) {
  if (
    Object.keys(environment).some(
      (name) =>
        name.toUpperCase() === 'OPENAI_BASE_URL' &&
        environment[name] !== undefined &&
        environment[name] !== '',
    )
  )
    fail(
      'Built-in OpenAI API-key mode does not accept OPENAI_BASE_URL overrides. Remove the override or explicitly configure an approved custom provider. No endpoint value was exposed and no request was sent.',
    );
}
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
/** Only variable names, never inline header values, enter settings and previews. */
export function validateEnvironmentHeaders(raw: unknown): Record<string, string> {
  if (!record(raw) || Object.keys(raw).length > 16)
    return fail(
      'Provider envHttpHeaders must map at most 16 header names to environment-variable names.',
    );
  const result: Record<string, string> = {};
  const forbidden = new Set([
    'authorization',
    'proxy-authorization',
    'host',
    'content-length',
    'transfer-encoding',
    'connection',
    'proxy-connection',
    'cookie',
    'set-cookie',
    'upgrade',
    'te',
    'trailer',
    'keep-alive',
    'forwarded',
    'x-original-url',
    'x-rewrite-url',
    'x-original-host',
    'constructor',
    'prototype',
  ]);
  for (const [header, variable] of Object.entries(raw).sort(([a], [b]) => a.localeCompare(b))) {
    const name = header.toLowerCase();
    if (
      !/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(header) ||
      forbidden.has(name) ||
      name.startsWith('x-forwarded-') ||
      Object.hasOwn(result, name)
    )
      return fail(
        'Provider environment headers must have unique safe HTTP names; authorization, cookie, routing, and hop-by-hop overrides are unsupported.',
      );
    if (typeof variable !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(variable))
      return fail(
        'Provider environment header entries must be environment-variable names, never header values.',
      );
    result[name] = variable;
  }
  return result;
}
export function validateProvider(raw: unknown): ProviderSettings {
  if (
    !record(raw) ||
    Object.keys(raw).some(
      (key) => !['id', 'baseUrl', 'envKey', 'wireApi', 'envHttpHeaders'].includes(key),
    )
  )
    return fail(
      'Provider accepts only id, baseUrl, envKey, wireApi, and envHttpHeaders. Inline credentials, literal headers, and auth commands are unsupported.',
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
  return {
    id,
    baseUrl: url.href.replace(/\/$/, ''),
    envKey,
    wireApi,
    ...(raw.envHttpHeaders === undefined
      ? {}
      : { envHttpHeaders: validateEnvironmentHeaders(raw.envHttpHeaders) }),
  };
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
/** Standard Codex location for prepare-time discovery. No file or credential reads. */
export function defaultCodexConfigFile(
  environment: { CODEX_HOME?: string } = process.env,
  home = homedir(),
): string {
  const configured = environment.CODEX_HOME;
  let path: string;
  try {
    if (configured !== undefined && configured !== '' && !isAbsolute(configured)) throw new Error();
    const directory =
      configured === undefined || configured === '' ? join(home, '.codex') : configured;
    // Check the raw directory before path normalization can erase a control
    // character segment or turn a relative value into an accepted ~/ path.
    validateConfigFile(`${directory}/config.toml`);
    path = join(directory, 'config.toml');
    validateConfigFile(path);
  } catch {
    return fail(
      'CODEX_HOME must be an absolute directory path without control characters. Leave it unset or empty to use ~/.codex/config.toml.',
    );
  }

  return path;
}
export function validateProfile(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value))
    fail('codex.profile must be a simple named profile in the selected TOML file.');
}
/** Read only allowlisted routing settings. Never import authentication or SDK runtime profiles. */
export async function readProviderConfiguration(
  configFile: string,
  profile?: string,
  allowMissing = false,
) {
  validateConfigFile(configFile);
  if (profile !== undefined) validateProfile(profile);
  const requested = configFile.startsWith('~/') ? join(homedir(), configFile.slice(2)) : configFile;
  let content: string;
  let path: string;
  let file;
  try {
    file = await open(requested, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (allowMissing && (error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    return fail(
      'Cannot read the selected Codex config. Use a regular, nonsymlink TOML file of at most 256 KiB.',
    );
  }
  // Only an initially absent file permits default routing. Once opened, errors
  // (including removal before realpath) must never silently change the provider.
  try {
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
  const id = selected.model_provider ?? 'openai';
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
  const modelSettings = {
    ...(selected.model === undefined ? {} : { model: selected.model }),
    ...(selected.model_reasoning_effort === undefined
      ? {}
      : { reasoningEffort: selected.model_reasoning_effort }),
    ...(selected.daybreak === undefined ? {} : { daybreak: selected.daybreak }),
  };
  if (id === 'openai') {
    if (selected.openai_base_url !== undefined || selected.chatgpt_base_url !== undefined)
      return fail(
        'Custom built-in OpenAI endpoints are not imported. Configure an explicit supported custom provider instead; no fallback endpoint was selected.',
      );
    if (Object.hasOwn(rootProviders, id) || Object.hasOwn(profileProviders, id))
      return fail(
        'Overriding the built-in OpenAI provider is unsupported. Configure a custom Responses provider with env_key, or remove the override to use dedicated Codex Security ChatGPT authentication.',
      );
    return { settings: modelSettings, path, profile: selectedName };
  }
  if (id === 'amazon-bedrock') {
    const base = rootProviders[id];
    const override = profileProviders[id];
    if ((base !== undefined && !record(base)) || (override !== undefined && !record(override)))
      return fail('The native Bedrock provider table must be an object.');
    const native = { ...(record(base) ? base : {}), ...(record(override) ? override : {}) };
    if (
      Object.keys(native).some(
        (key) => !['name', 'aws', 'wire_api', 'requires_openai_auth'].includes(key),
      ) ||
      (native.wire_api !== undefined && native.wire_api !== 'responses') ||
      (native.requires_openai_auth !== undefined && native.requires_openai_auth !== false) ||
      (native.aws !== undefined && !record(native.aws)) ||
      (record(base) && base.aws !== undefined && !record(base.aws))
    )
      return fail(
        'Native Bedrock import supports AWS region/profile only, without endpoint, credential, or authentication overrides.',
      );
    const aws = {
      ...(record(base) && record(base.aws) ? base.aws : {}),
      ...(record(native.aws) ? native.aws : {}),
    };
    // Snapshot the public region during preparation so later environment changes invalidate approval.
    const bedrock = validateBedrock({
      ...aws,
      region: aws.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION,
    });
    return { settings: { bedrock, ...modelSettings }, path, profile: selectedName };
  }
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
  // Native provider profiles deep-merge header maps. Preserve inherited names
  // when a profile overrides only one header; validation rejects case aliases.
  if (
    record(inherited) &&
    record(override) &&
    record(inherited.env_http_headers) &&
    record(override.env_http_headers)
  )
    native.env_http_headers = { ...inherited.env_http_headers, ...override.env_http_headers };
  if (native.env_key === undefined)
    return fail(
      'The selected custom Codex provider has no env_key. Keyless network identity is not supported by the current SDK 0.9.1 authentication flow. This plugin currently supports custom providers through an existing environment-variable API key; other authentication methods are not imported. Do not create a dummy or second key to work around this. No credentials were imported, no scan started, and no fallback provider was selected.',
    );
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
          'env_http_headers',
          'wire_api',
          'requires_openai_auth',
          ...ignoredHints,
        ].includes(key),
    ) ||
    (native.requires_openai_auth !== undefined && native.requires_openai_auth !== false)
  )
    return fail(
      'The selected provider uses unsupported options. Only Responses routing with env_key and requires_openai_auth=false is supported; literal headers, inline tokens, auth commands, and OAuth are not imported.',
    );
  const provider = validateProvider({
    id,
    baseUrl: native.base_url,
    envKey: native.env_key,
    ...(native.env_http_headers === undefined ? {} : { envHttpHeaders: native.env_http_headers }),
    wireApi: native.wire_api === undefined ? 'responses' : native.wire_api,
  });
  const settings = { provider, ...modelSettings };
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
