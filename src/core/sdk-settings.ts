import { readFile, lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
export interface CodexSettings {
  model?: string;
  reasoningEffort?: string;
  daybreak?: boolean;
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
  codex: Required<CodexSettings>;
  scan: ScanSettings & { mode: 'standard' | 'deep'; maxCostUsd: number };
}
export const defaultSettings: ResolvedSdkSettings = {
  codex: { model: 'gpt-5.6-sol', reasoningEffort: 'xhigh', daybreak: false },
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
        ? ['model', 'reasoningEffort', 'daybreak']
        : ['mode', 'maxCostUsd', 'maxTimeMinutes', 'cyberAccessProgram', 'workers', 'subagents'];
    for (const [key, val] of Object.entries(group)) {
      if (!allowed.includes(key))
        throw new Error(
          `Unsupported ${section} setting: ${key}. Credentials and arbitrary runtime overrides are not accepted.`,
        );
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
    const raw = JSON.parse(content.toString('utf8'));
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
export function mergeSettings(...sources: SdkSettings[]): ResolvedSdkSettings {
  const result = structuredClone(defaultSettings);
  for (const source of sources) {
    Object.assign(result.codex, source.codex);
    Object.assign(result.scan, source.scan);
  }
  return result;
}
