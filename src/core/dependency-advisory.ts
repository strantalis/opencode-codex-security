import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, type ParseError } from 'jsonc-parser';
import semver from 'semver';
import { SecurityInputError } from './errors.ts';

const lockfileLimit = 16 * 1024 * 1024;
const advisoryLimit = 2 * 1024 * 1024;
export const advisoryHost = 'https://api.github.com';
export const lockfiles = ['bun.lock', 'package-lock.json'] as const;
export type AdvisoryLockfile = (typeof lockfiles)[number];
const npmName = /^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function normalizeCve(value: unknown) {
  if (typeof value !== 'string' || !/^CVE-\d{4}-\d{4,12}$/i.test(value.trim()))
    throw new SecurityInputError('Enter one published CVE ID, such as CVE-2099-0001.');
  return value.trim().toUpperCase();
}

export async function advisoryLockfilePath(directory: string, name: unknown) {
  if (!lockfiles.includes(name as AdvisoryLockfile))
    throw new SecurityInputError('Choose bun.lock or package-lock.json.');
  const path = join(await realpath(directory), name as string);
  if ((await realpath(path).catch(() => null)) !== path)
    throw new SecurityInputError('Choose an existing, non-symlink lockfile at the workspace root.');
  return path;
}

export function parseLockedNpmVersions(source: string, name: AdvisoryLockfile) {
  const errors: ParseError[] = [];
  const value: unknown = parse(source, errors, {
    allowTrailingComma: name === 'bun.lock',
    disallowComments: name !== 'bun.lock',
  });
  if (errors.length || !record(value) || !record(value.packages))
    throw new SecurityInputError('Could not read the lockfile package table.');
  if (name === 'package-lock.json' && value.lockfileVersion !== 2 && value.lockfileVersion !== 3)
    throw new SecurityInputError('Only npm package-lock versions 2 and 3 are supported.');
  if (name === 'bun.lock' && value.lockfileVersion !== 1)
    throw new SecurityInputError('Only Bun text lockfile version 1 is supported.');

  const versions = new Map<string, Set<string>>();
  let skipped = 0;
  for (const [key, entry] of Object.entries(value.packages)) {
    let pkg: unknown;
    let version: unknown;
    if (name === 'bun.lock') {
      const spec = Array.isArray(entry) && typeof entry[0] === 'string' ? entry[0] : '';
      const separator = spec.lastIndexOf('@');
      if (separator > 0) {
        pkg = spec.slice(0, separator);
        version = spec.slice(separator + 1);
      }
    } else {
      const pathName = /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)$/.exec(key)?.[1];
      if (!pathName) continue; // Root/workspace package, not an installed dependency entry.
      if (record(entry) && entry.link !== true) {
        pkg = entry.name ?? pathName;
        version = entry.version;
      }
    }
    if (typeof pkg !== 'string' || !npmName.test(pkg) || typeof version !== 'string') {
      skipped++;
      continue;
    }
    const valid = semver.valid(version);
    if (!valid) {
      skipped++;
      continue;
    }
    const normalized = pkg.toLowerCase();
    if (!versions.has(normalized)) versions.set(normalized, new Set());
    versions.get(normalized)!.add(valid);
  }
  return { versions, skipped };
}

export async function readLockedNpmVersions(path: string, name: AdvisoryLockfile) {
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  ).catch(() => {
    throw new SecurityInputError('Could not open the chosen lockfile.');
  });
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > lockfileLimit)
      throw new SecurityInputError('The lockfile must be a regular file no larger than 16 MiB.');
    const bytes = Buffer.alloc(stat.size + 1);
    let position = 0;
    while (position < bytes.length) {
      const chunk = await file.read(bytes, position, bytes.length - position, position);
      if (!chunk.bytesRead) break;
      position += chunk.bytesRead;
    }
    if (position !== stat.size)
      throw new SecurityInputError('The lockfile changed while it was being read.');
    return parseLockedNpmVersions(bytes.toString('utf8', 0, position), name);
  } finally {
    await file.close();
  }
}

export function compareAdvisories(
  cve: string,
  locked: ReturnType<typeof parseLockedNpmVersions>,
  advisories: unknown,
) {
  if (!Array.isArray(advisories))
    throw new SecurityInputError('GitHub returned an unexpected advisory response.');
  const sources = new Set<string>();
  const hits = new Map<string, { package: string; version: string }>();
  let checkedRanges = 0;
  let unsupportedRanges = 0;
  for (const advisory of advisories) {
    if (!record(advisory) || advisory.cve_id !== cve || advisory.withdrawn_at) continue;
    if (typeof advisory.ghsa_id === 'string' && /^GHSA(?:-[a-z0-9]{4}){3}$/i.test(advisory.ghsa_id))
      sources.add('https://github.com/advisories/' + advisory.ghsa_id);
    if (!Array.isArray(advisory.vulnerabilities)) continue;
    for (const item of advisory.vulnerabilities) {
      if (!record(item) || !record(item.package) || item.package.ecosystem !== 'npm') continue;
      const pkg = item.package.name;
      const range =
        typeof item.vulnerable_version_range === 'string'
          ? item.vulnerable_version_range.replace(/,/g, ' ').trim()
          : '';
      if (typeof pkg !== 'string' || !npmName.test(pkg) || !range || !semver.validRange(range)) {
        unsupportedRanges++;
        continue;
      }
      checkedRanges++;
      const key = pkg.toLowerCase();
      for (const version of locked.versions.get(key) ?? []) {
        if (semver.satisfies(version, range))
          hits.set(key + '@' + version, { package: key, version });
        else if (semver.prerelease(version)) unsupportedRanges++;
      }
    }
  }
  return {
    cve,
    result: hits.size
      ? 'version_match'
      : !checkedRanges || unsupportedRanges || locked.skipped
        ? 'inconclusive'
        : 'no_match_in_lockfile',
    matches: [...hits.values()].slice(0, 100),
    matchCount: hits.size,
    comparedRanges: checkedRanges,
    unsupportedRanges,
    skippedLockfileEntries: locked.skipped,
    advisories: [...sources].slice(0, 20),
    scope: 'Locked npm versions only. No reachability, runtime, or exploitability assessment.',
  };
}

export async function getPublicAdvisories(cve: string, signal: AbortSignal | undefined) {
  const url = new URL('/advisories', advisoryHost);
  url.search = new URLSearchParams({
    cve_id: cve,
    ecosystem: 'npm',
    is_withdrawn: 'false',
    per_page: '100',
  }).toString();
  const deadline = AbortSignal.timeout(10_000);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
      credentials: 'omit',
      redirect: 'error',
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    });
    if (!response.ok || !response.body || /rel="next"/.test(response.headers.get('link') ?? ''))
      throw new SecurityInputError('Could not load a complete advisory from GitHub.');
    const buffer = Buffer.alloc(advisoryLimit);
    let bytes = 0;
    for await (const part of response.body) {
      if (bytes + part.length > buffer.length)
        throw new SecurityInputError('The advisory response exceeded the read limit.');
      buffer.set(part, bytes);
      bytes += part.length;
    }
    return JSON.parse(buffer.toString('utf8', 0, bytes)) as unknown;
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof SecurityInputError) throw error;
    throw new SecurityInputError('Could not load the public advisory from GitHub.');
  }
}
