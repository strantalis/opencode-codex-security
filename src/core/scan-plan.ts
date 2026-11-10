import { loadGlobalSettings, mergeSettings, type ResolvedSdkSettings } from './sdk-settings.ts';
import { realpath, stat, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, relative, resolve, sep, extname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export interface ScanInputs {
  mode?: 'standard' | 'deep';
  repository?: string;
  scopePaths?: string[];
  scanPrompt?: string;
  contextFiles?: string[];
}
export interface ScanPlan {
  settings: ResolvedSdkSettings;
  globalConfigFile: string;
  globalConfigDigest: string | null;
  id: string;
  repository: string;
  scopePaths: string[];
  scanPrompt: string;
  contextFiles: { path: string; bytes: number; sha256: string }[];
  expiresAt: string;
  mock: boolean;
  inputs: ScanInputs;
}
const hash = (s: Buffer | string) => createHash('sha256').update(s).digest('hex');
const inside = (root: string, path: string) => {
  const r = relative(root, path);
  return r !== '..' && !r.startsWith('..' + sep) && !isAbsolute(r);
};
const denied = new Set(['.git', '.ssh', '.aws', '.codex', '.runtime', 'node_modules']);
function validateRelative(path: string) {
  if (
    !path ||
    isAbsolute(path) ||
    path.includes('\\') ||
    path.split('/').some((p) => p === '..' || denied.has(p)) ||
    /[\x00-\x1f*?[\]{}]/.test(path)
  )
    throw new Error(
      'Use existing repository-relative paths without traversal, globs, credentials, or runtime directories.',
    );
  if (
    path
      .split('/')
      .some(
        (p) =>
          /^\.env(?:\.|$)/.test(p) ||
          /^(auth\.json|credentials(?:\.json)?|id_rsa|id_ed25519)$/.test(p),
      )
  )
    throw new Error('Credential files cannot be supplied as scan context or scope.');
}
async function checkedPath(root: string, path: string) {
  validateRelative(path);
  const canonical = await realpath(resolve(root, path));
  if (!inside(root, canonical)) throw new Error('Path escapes the selected repository.');
  validateRelative(relative(root, canonical) || '.');
  return canonical;
}
async function contextInfo(root: string, path: string) {
  const canonical = await checkedPath(root, path);
  if (!['.md', '.txt', '.rst', '.json', '.yaml', '.yml'].includes(extname(path).toLowerCase()))
    throw new Error(
      'Context files must be text documentation (.md, .txt, .rst, .json, .yaml, .yml).',
    );
  const file = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 64 * 1024)
      throw new Error('Each context file must be a regular file of at most 64 KiB.');
    const bytes = Buffer.alloc(64 * 1024 + 1);
    const result = await file.read(bytes, 0, bytes.length, 0);
    const content = bytes.subarray(0, result.bytesRead);
    if (content.length > 64 * 1024 || content.includes(0))
      throw new Error('Context file must be bounded text.');
    return {
      path: relative(root, canonical).split(sep).join('/'),
      bytes: content.length,
      sha256: hash(content),
    };
  } finally {
    await file.close();
  }
}
function parseInputs(value: unknown): ScanInputs {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Scan inputs must be an object.');
  const data = value as Record<string, unknown>;
  const allowed = ['repository', 'scopePaths', 'scanPrompt', 'contextFiles', 'mode'];
  for (const key of Object.keys(data))
    if (!allowed.includes(key))
      throw new Error(
        `Unsupported scan input: ${key}. Approval, auth and SDK settings cannot come from model tool input.`,
      );
  for (const key of ['repository', 'scanPrompt'])
    if (
      data[key] !== undefined &&
      (typeof data[key] !== 'string' ||
        (data[key] as string).length > (key === 'scanPrompt' ? 8000 : 4096))
    )
      throw new Error(`Invalid ${key}.`);
  for (const key of ['scopePaths', 'contextFiles'])
    if (
      data[key] !== undefined &&
      (!Array.isArray(data[key]) ||
        data[key].length > (key === 'scopePaths' ? 32 : 8) ||
        data[key].some((p: unknown) => typeof p !== 'string' || p.length > 4096))
    )
      throw new Error(`Invalid ${key}.`);
  if (data.mode !== undefined && data.mode !== 'standard' && data.mode !== 'deep')
    throw new Error('mode must be standard or deep.');
  return data as ScanInputs;
}
export async function prepareScan(
  currentProject: string,
  raw: unknown = {},
  mock = false,
): Promise<ScanPlan> {
  const input = parseInputs(raw);
  // Never let node:path fall back to the plugin process's working directory.
  // A verified session location or an explicit absolute target must anchor the request.
  const target = input.repository || '.';
  if (!isAbsolute(target) && (!currentProject || !isAbsolute(currentProject)))
    throw new Error('No local project is selected. Choose an absolute repository path explicitly.');
  const repository = await realpath(isAbsolute(target) ? target : resolve(currentProject, target));
  if (!(await stat(repository)).isDirectory()) throw new Error('Repository must be a directory.');
  const home = await realpath(homedir());
  if (inside(repository, home))
    throw new Error(
      'Choose a specific project repository explicitly. Your home folder and its parent directories cannot be scan targets.',
    );
  const global = await loadGlobalSettings();
  const settings = mergeSettings(global.settings, input.mode ? { scan: { mode: input.mode } } : {});
  const merged = input;
  const scopePaths: string[] = [];
  for (const path of merged.scopePaths ?? [])
    scopePaths.push(
      relative(repository, await checkedPath(repository, path))
        .split(sep)
        .join('/') || '.',
    );
  const contextFiles = [];
  for (const path of merged.contextFiles ?? [])
    contextFiles.push(await contextInfo(repository, path));
  if (contextFiles.reduce((n, f) => n + f.bytes, 0) > 128 * 1024)
    throw new Error('Combined context is limited to 128 KiB.');
  const scanPrompt = merged.scanPrompt ?? '';
  const normalized = {
    ...(input.mode ? { mode: input.mode } : {}),
    repository,
    scopePaths: [...new Set(scopePaths)],
    scanPrompt,
    contextFiles: [...new Set(contextFiles.map((f) => f.path))],
  };
  return {
    settings,
    globalConfigFile: global.path,
    globalConfigDigest: global.digest,
    id: randomUUID(),
    ...normalized,
    contextFiles,
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    mock,
    inputs: normalized,
  };
}
export async function validatePlan(plan: ScanPlan) {
  if (Date.now() >= Date.parse(plan.expiresAt))
    throw new Error('Scan preview expired. Prepare and review it again.');
  const current = await prepareScan(plan.repository, plan.inputs, plan.mock);
  if (
    current.repository !== plan.repository ||
    current.globalConfigDigest !== plan.globalConfigDigest ||
    JSON.stringify(current.settings) !== JSON.stringify(plan.settings) ||
    JSON.stringify(current.contextFiles) !== JSON.stringify(plan.contextFiles) ||
    JSON.stringify(current.scopePaths) !== JSON.stringify(plan.scopePaths)
  )
    throw new Error('Target or context changed after preview. Prepare and review it again.');
}
