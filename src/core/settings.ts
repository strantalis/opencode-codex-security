import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'smol-toml';
import type { JsonObject, ScanAuthMode, ScanSettings } from '@openai/codex-security';
import { SecurityInputError } from './errors.ts';

/** What the SDK receives: native Codex overrides, its auth mode, and its scan settings. */
export interface PluginSettings {
  codex: JsonObject;
  auth: ScanAuthMode;
  scan: ScanSettings;
  /** The plugin settings file, whether or not it exists. */
  path: string;
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const codexHome = () => process.env.CODEX_HOME || join(homedir(), '.codex');
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

/** The user's own Codex routing, with the selected `[profiles.<name>]` applied. */
async function codexConfig(profile: unknown): Promise<JsonObject> {
  const path = join(codexHome(), 'config.toml');
  let root: Record<string, unknown>;
  try {
    root = parse(await readFile(path, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new SecurityInputError(
      `Could not read ${path}. Fix it, or set "useCodexConfig": false in codex-security.json.`,
    );
  }
  const name = profile ?? root.profile;
  const selected =
    typeof name === 'string' && record(root.profiles) ? root.profiles[name] : undefined;
  // smol-toml tables have no prototype; hand the SDK plain JSON.
  return JSON.parse(
    JSON.stringify({ ...routing(root), ...(record(selected) ? routing(selected) : {}) }),
  );
}

const renamed: Record<string, string> = {
  reasoningEffort: 'model_reasoning_effort',
  provider: 'model_provider and model_providers',
  bedrock: 'model_provider = "amazon-bedrock" and model_providers',
  configFile: 'profile',
  auth: 'the top-level "auth"',
  useCodexConfig: 'the top-level "useCodexConfig"',
};

/**
 * Settings come from the user's Codex config, then `codex-security.json` on top.
 * The SDK validates the values; this only checks the file's shape.
 */
export async function loadSettings(mode?: 'standard' | 'deep'): Promise<PluginSettings> {
  const path = settingsPath();
  let file: unknown = {};
  try {
    file = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw new SecurityInputError(`${path} is not readable JSON.`);
  }
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
  const inherited = useCodexConfig === false ? {} : await codexConfig(codex.profile);
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
    path,
  };
}
