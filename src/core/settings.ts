import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse } from 'smol-toml';
import type { JsonObject, ScanAuthMode, ScanSettings } from '@openai/codex-security';
import { SecurityInputError } from './errors.ts';

/** What the SDK receives: native Codex overrides, its auth mode, and its scan settings. */
export interface PluginSettings {
  codex: JsonObject;
  auth: ScanAuthMode;
  scan: ScanSettings;
  /** The selected Codex profile: `codex.profile` here, else `profile` in config.toml. */
  profile?: string;
  /** The plugin settings file, whether or not it exists. */
  path: string;
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const codexHome = () => process.env.CODEX_HOME || join(homedir(), '.codex');
export const codexConfigPath = () => join(codexHome(), 'config.toml');
export const settingsPath = () =>
  join(
    process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
    'opencode',
    'codex-security.json',
  );

/** Model and provider routing only. MCP servers, hooks and the rest stay out of scans. */
const routingKeys = [
  'model',
  'model_reasoning_effort',
  'model_provider',
  'model_providers',
  'openai_base_url',
  'daybreak',
];
const routing = (table: Record<string, unknown>) =>
  Object.fromEntries(routingKeys.filter((key) => key in table).map((key) => [key, table[key]]));

async function readCodexConfig(): Promise<Record<string, unknown>> {
  const path = codexConfigPath();
  try {
    return parse(await readFile(path, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new SecurityInputError(
      `Could not read ${path}. Fix it, or set "useCodexConfig": false in codex-security.json.`,
    );
  }
}

/** The user's own Codex routing, with the selected `[profiles.<name>]` applied. */
function codexRouting(root: Record<string, unknown>, name: unknown): JsonObject {
  const selected =
    typeof name === 'string' && record(root.profiles) ? root.profiles[name] : undefined;
  // smol-toml tables have no prototype; hand the SDK plain JSON.
  return JSON.parse(
    JSON.stringify({ ...routing(root), ...(record(selected) ? routing(selected) : {}) }),
  );
}

/** `[profiles.*]` tables in config.toml, plus `<name>.config.toml` file profiles. */
export async function codexProfiles(): Promise<string[]> {
  const root = await readCodexConfig();
  const files = await readdir(codexHome()).catch(() => [] as string[]);
  const names = [
    ...(record(root.profiles) ? Object.keys(root.profiles) : []),
    ...files.flatMap((file) => /^([A-Za-z0-9_-]+)\.config\.toml$/.exec(file)?.[1] ?? []),
  ];
  return [...new Set(names)].sort();
}

const renamed: Record<string, string> = {
  reasoningEffort: 'model_reasoning_effort',
  provider: 'model_provider and model_providers',
  bedrock: 'model_provider = "amazon-bedrock" and model_providers',
  configFile: 'profile',
  auth: 'the top-level "auth"',
  useCodexConfig: 'the top-level "useCodexConfig"',
};

async function readPluginFile(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new SecurityInputError(`${path} is not readable JSON.`);
  }
}

/**
 * Settings come from the user's Codex config, then `codex-security.json` on top.
 * The SDK validates the values; this only checks the file's shape.
 */
export async function loadSettings(mode?: 'standard' | 'deep'): Promise<PluginSettings> {
  const path = settingsPath();
  const file = await readPluginFile(path);
  const {
    codex = {},
    scan = {},
    auth = 'auto',
    useCodexConfig = true,
    ...unknown
  } = record(file) ? file : { invalid: true };
  if (!record(codex) || !record(scan) || Object.keys(unknown).length)
    throw new SecurityInputError(
      `${path} accepts "codex" and "scan" objects, "auth" and "useCodexConfig".`,
    );
  if (!['auto', 'chatgpt', 'api-key'].includes(auth as string))
    throw new SecurityInputError('"auth" must be auto, chatgpt or api-key.');
  for (const [key, replacement] of Object.entries(renamed))
    if (key in codex)
      throw new SecurityInputError(
        `codex.${key} is no longer supported; "codex" takes native Codex config keys. Use ${replacement}.`,
      );
  const root = useCodexConfig === false ? {} : await readCodexConfig();
  const profile = codex.profile ?? root.profile;
  const inherited = codexRouting(root, profile);
  const providers = {
    ...(inherited.model_providers as object),
    ...(codex.model_providers as object),
  };
  return {
    codex: {
      ...inherited,
      ...codex,
      ...(Object.keys(providers).length ? { model_providers: providers } : {}),
    } as JsonObject,
    auth: auth as ScanAuthMode,
    scan: { ...scan, ...(mode ? { mode } : {}) } as ScanSettings,
    ...(typeof profile === 'string' ? { profile } : {}),
    path,
  };
}

/** Set `codex.profile` in codex-security.json, keeping every other key. Empty removes it. */
export async function saveProfile(
  profile: string,
): Promise<{ configFile: string; profile?: string }> {
  const path = settingsPath();
  const file = await readPluginFile(path);
  if (!record(file) || (file.codex !== undefined && !record(file.codex)))
    throw new SecurityInputError(`${path} must hold a JSON object whose "codex" is an object.`);
  const { profile: _previous, ...codex } = (file.codex ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...file, codex: profile ? { ...codex, profile } : codex };
  if (!profile && !Object.keys(codex).length) delete next.codex;
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(next, null, 2) + '\n');
  await rename(temporary, path);
  return { configFile: path, ...(profile ? { profile } : {}) };
}
