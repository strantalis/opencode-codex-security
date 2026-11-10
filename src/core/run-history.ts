import { safeFinding } from './report-safety.ts';
import { mkdir, readdir, lstat, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ScanState } from '../types.ts';
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Private per-run files avoid read/modify/write races between independent runs. */
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
    const result: ScanState[] = [];
    for (const name of await readdir(this.directory)) {
      if (!name.endsWith('.json') || !idPattern.test(name.slice(0, -5))) continue;
      try {
        const path = join(this.directory, name),
          info = await lstat(path);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 4 * 1024 * 1024) continue;
        const s = JSON.parse(await readFile(path, 'utf8')) as ScanState;
        if (
          s.runId !== name.slice(0, -5) ||
          typeof s.instanceId !== 'string' ||
          !s.instanceId ||
          !Array.isArray(s.findings) ||
          !Array.isArray(s.events) ||
          !['running', 'completed', 'cancelled', 'error'].includes(s.status)
        )
          continue;
        if (
          typeof s.startedAt !== 'string' ||
          !Number.isFinite(Date.parse(s.startedAt)) ||
          (s.finishedAt !== null &&
            (typeof s.finishedAt !== 'string' || !Number.isFinite(Date.parse(s.finishedAt))))
        )
          continue;
        if (
          typeof s.repository !== 'string' ||
          typeof s.engine !== 'string' ||
          typeof s.phase !== 'string' ||
          !Number.isFinite(s.revision) ||
          !Number.isFinite(s.skipped) ||
          !s.progress ||
          !Number.isFinite(s.progress.done) ||
          !Number.isFinite(s.progress.total)
        )
          continue;
        if (
          s.events.some((e) => !e || typeof e.time !== 'string' || typeof e.message !== 'string') ||
          s.findings.some(
            (f) =>
              !f ||
              typeof f.id !== 'string' ||
              typeof f.title !== 'string' ||
              typeof f.path !== 'string' ||
              typeof f.summary !== 'string' ||
              typeof f.evidence !== 'string' ||
              typeof f.remediation !== 'string' ||
              typeof f.cwe !== 'string' ||
              typeof f.confidence !== 'string' ||
              !Number.isFinite(f.line) ||
              !['critical', 'high', 'medium', 'low'].includes(f.severity),
          )
        )
          continue;
        s.findings = s.findings.map(safeFinding);
        s.archived = true;
        if (s.status === 'running') {
          s.status = 'error';
          s.phase = 'Previous run is no longer tracked';
          s.error =
            'Completion is unknown after the previous plugin instance ended. Check SDK history before running again.';
        }
        result.push(s);
      } catch {
        /* A malformed record cannot prevent other history from loading. */
      }
    }
    return result
      .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))
      .slice(0, this.limit);
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
