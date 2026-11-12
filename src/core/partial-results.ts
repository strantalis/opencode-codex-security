import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { stateDirectory } from './settings.ts';

/** What a scan had saved when it stopped. Unfinished work, never a completed assessment. */
export interface SavedScan {
  directory: string;
  findings: unknown[];
  /** `scope`, `reviewState` and `threatModel` as the checkpoint recorded them. */
  scan: Record<string, unknown>;
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const json = async (path: string) => {
  try {
    const value: unknown = JSON.parse(await readFile(path, 'utf8'));
    return record(value) ? value : undefined;
  } catch {
    return undefined;
  }
};
const names = (directory: string) => readdir(directory).catch(() => [] as string[]);

/** The SDK's newest checkpoint in a scan directory, else its unsealed findings file. */
async function read(directory: string, scanId: string): Promise<SavedScan | undefined> {
  const heads = [
    join(directory, 'checkpoint-head.json'),
    ...(await names(join(directory, 'checkpoint-heads'))).map((name) =>
      join(directory, 'checkpoint-heads', name),
    ),
  ];
  const saved: { at: bigint; value: Record<string, unknown> }[] = [];
  for (const path of heads) {
    const head = await json(path);
    if (typeof head?.checkpoint !== 'string') continue;
    const value = await json(join(directory, 'checkpoints', basename(head.checkpoint)));
    if (value?.scanId !== scanId || !Array.isArray(value.findings)) continue;
    let at = 0n;
    try {
      at = BigInt(head.observedAtNs as string);
    } catch {}
    saved.push({ at, value });
  }
  const latest = saved.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))[0]?.value;
  if (latest) {
    const { findings, scanId: _id, ...scan } = latest;
    return { directory, findings: findings as unknown[], scan };
  }
  const file = await json(join(directory, 'findings.json'));
  if (file?.scanId !== scanId || !Array.isArray(file.findings)) return;
  const manifest = await json(join(directory, 'scan-manifest.json'));
  return { directory, findings: file.findings, scan: record(manifest?.scan) ? manifest.scan : {} };
}

/**
 * Saved work of a scan that did not finish. `directory` is the SDK's output directory when the
 * run reported one; otherwise the SDK's scan directories for that repository are searched.
 */
export async function savedScan(
  scanId: string,
  repository: string,
  directory?: string,
): Promise<SavedScan | undefined> {
  if (directory) return read(directory, scanId);
  const parent = join(stateDirectory(), 'scans', basename(repository));
  for (const name of (await names(parent)).sort().reverse().slice(0, 200)) {
    const found = await read(join(parent, name), scanId);
    if (found) return found;
  }
}
