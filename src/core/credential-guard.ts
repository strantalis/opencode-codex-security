import { lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

type Environment = Record<string, string | undefined>;

/** Fixed, non-sensitive guidance is safe for UI/model errors. Never attach filesystem errors. */
export class DedicatedSecurityCredentialsRequiredError extends Error {
  constructor() {
    super(
      'Dedicated Codex Security authentication is missing or is not private and safe. Set it up explicitly before retrying. This plugin will not initialize authentication or import ambient credentials.',
    );
    this.name = 'DedicatedSecurityCredentialsRequiredError';
  }
}

function environmentValue(environment: Environment, requested: string, preserveWhitespace = false) {
  const exact = environment[requested];
  const value = exact?.trim()
    ? exact
    : Object.entries(environment).find(
        ([name, entry]) => name.toUpperCase() === requested && entry?.trim(),
      )?.[1];
  return preserveWhitespace ? value : value?.trim();
}

/** Pure equivalent of SDK 0.9.1 runtime path selection; no credential or SDK access. */
export function dedicatedSecurityAuthPath(
  environment: Environment = process.env,
  defaultHome = homedir(),
): string {
  const expandHome = (value: string) => {
    const home =
      (process.platform === 'win32'
        ? (environmentValue(environment, 'USERPROFILE') ?? environmentValue(environment, 'HOME'))
        : (environmentValue(environment, 'HOME') ??
          environmentValue(environment, 'USERPROFILE'))) ?? defaultHome;
    if (value === '~') return home;
    if (value.startsWith('~/')) return join(home, value.slice(2));
    if (value.startsWith('~\\')) return join(home, ...value.slice(2).split('\\'));
    return value;
  };
  const configured = environmentValue(environment, 'CODEX_SECURITY_STATE_DIR');
  const stateDirectory =
    configured !== undefined
      ? resolve(expandHome(configured))
      : resolve(
          expandHome(
            environmentValue(environment, 'CODEX_HOME', true) ?? join(defaultHome, '.codex'),
          ),
          'state',
          'plugins',
          'codex-security',
        );
  return join(stateDirectory, 'codex-home', 'auth.json');
}

/**
 * Read metadata only. Do not call account/login/prepare/import helpers: SDK 0.9.1
 * otherwise copies ambient auth when the dedicated auth file is absent.
 * This is a precondition, not a token-validity check or an atomic SDK auth policy.
 */
export async function requireDedicatedSecurityCredentials(
  environment: Environment = process.env,
): Promise<void> {
  try {
    // POSIX mode bits cannot establish Windows ACL privacy. Fail closed rather
    // than invoke the SDK's ACL helper, which can change security permissions.
    if (process.platform === 'win32') throw new DedicatedSecurityCredentialsRequiredError();
    const path = dedicatedSecurityAuthPath(environment);
    const home = await lstat(dirname(path));
    const auth = await lstat(path);
    const uid = process.geteuid?.() ?? process.getuid?.();
    if (!home.isDirectory() || home.isSymbolicLink() || !auth.isFile() || auth.isSymbolicLink())
      throw new DedicatedSecurityCredentialsRequiredError();
    if ((home.mode & 0o077) !== 0 || (auth.mode & 0o077) !== 0)
      throw new DedicatedSecurityCredentialsRequiredError();
    if (uid !== undefined && (home.uid !== uid || auth.uid !== uid))
      throw new DedicatedSecurityCredentialsRequiredError();
  } catch {
    throw new DedicatedSecurityCredentialsRequiredError();
  }
}

/** A fixed message, safe to expose without leaking credential values or SDK diagnostics. */
export class ProviderCredentialsRequiredError extends Error {
  constructor() {
    super(
      'The selected provider environment key is missing or blank. Make the configured envKey available to the OpenCode process before retrying. No sign-in or credential import was attempted.',
    );
    this.name = 'ProviderCredentialsRequiredError';
  }
}

/** The only API-key readiness check: validate routing, then check the named key's presence. */
export async function requireSdkCredentials(
  config: import('@openai/codex-security').CodexSecurityConfig | undefined,
  environment: Environment = process.env,
): Promise<void> {
  const routing = config?.codexOverrides;
  const id = routing?.model_provider;
  if (id === undefined || id === 'openai') return requireDedicatedSecurityCredentials(environment);
  const { validateProvider, record, ProviderConfigurationError } =
    await import('./provider-config.ts');
  const providers = routing?.model_providers;
  const native = typeof id === 'string' && record(providers) ? providers[id] : undefined;
  if (
    !record(native) ||
    native.requires_openai_auth !== false ||
    Object.keys(native).some(
      (key) => !['name', 'base_url', 'env_key', 'wire_api', 'requires_openai_auth'].includes(key),
    )
  )
    throw new ProviderConfigurationError(
      'Invalid API-key provider routing. No authentication was initialized.',
    );
  const provider = validateProvider({
    id,
    baseUrl: native.base_url,
    envKey: native.env_key,
    wireApi: native.wire_api,
  });
  // Exact environment-variable selection on POSIX, case-insensitive on Windows.
  // Never enumerate or copy environment values, return a key, or inspect auth.json.
  const name =
    process.platform === 'win32'
      ? Object.keys(environment).find((key) => key.toUpperCase() === provider.envKey.toUpperCase())
      : provider.envKey;
  if (!name || !environment[name]?.trim()) throw new ProviderCredentialsRequiredError();
}
