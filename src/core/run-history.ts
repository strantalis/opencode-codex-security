import { mkdir, readdir, lstat, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ScanState } from '../types.ts';
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** One private JSON file per run, so concurrent runs never rewrite each other. */
export class RunHistory {
  readonly directory: string;
  readonly limit: number;
  constructor(directory: string, limit = 50) {
    this.directory = directory;
    this.limit = limit;
  }
  async load(): Promise<ScanState[]> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    if (!(await lstat(this.directory)).isDirectory()) throw new Error('Invalid history directory.');
    // Every save rewrites the file, so mtime orders records by last activity without parsing them.
    const files: { name: string; path: string; mtime: number }[] = [];
    for (const name of await readdir(this.directory)) {
      if (!name.endsWith('.json') || !idPattern.test(name.slice(0, -5))) continue;
      const path = join(this.directory, name);
      const info = await lstat(path).catch(() => undefined);
      if (info?.isFile() && info.size <= 4 * 1024 * 1024)
        files.push({ name, path, mtime: info.mtimeMs });
    }
    files.sort((a, b) => b.mtime - a.mtime);
    const result: ScanState[] = [];
    let kept = 0;
    for (const { name, path } of files) {
      if (result.length >= this.limit) break;
      kept++;
      try {
        const s = JSON.parse(await readFile(path, 'utf8')) as ScanState;
        if (
          s.runId !== name.slice(0, -5) ||
          typeof s.startedAt !== 'string' ||
          !Array.isArray(s.findings) ||
          !Array.isArray(s.events) ||
          !['running', 'completed', 'cancelled', 'error'].includes(s.status)
        )
          continue;
        s.archived = true;
        if (s.status === 'running') {
          s.status = 'error';
          s.phase = 'Interrupted';
          s.error =
            'This scan was still running when OpenCode last stopped, so its outcome is unknown.';
        }
        result.push(s);
      } catch {
        /* Skip an unreadable record; the rest of the history still loads. */
      }
    }
    // Older records would never be shown again. Pruning is best effort.
    await Promise.all(files.slice(kept).map(({ path }) => unlink(path).catch(() => {})));
    return result.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
  }
  async save(state: ScanState) {
    if (!state.runId || !idPattern.test(state.runId)) throw new Error('Invalid run ID.');
    const content = JSON.stringify(state);
    if (Buffer.byteLength(content) > 4 * 1024 * 1024)
      throw new Error('History record is too large.');
    const target = join(this.directory, `${state.runId}.json`),
      temp = join(this.directory, `.${state.runId}.${randomUUID()}.tmp`);
    await writeFile(temp, content, { mode: 0o600, flag: 'wx' });
    try {
      await rename(temp, target);
    } finally {
      await unlink(temp).catch(() => {});
    }
  }
}
