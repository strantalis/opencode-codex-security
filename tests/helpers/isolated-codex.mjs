// Offline tests must never discover a developer's real Codex configuration.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after } from 'node:test';
const directory = await mkdtemp(join(tmpdir(), 'isolated-codex-'));
const previous = process.env.CODEX_HOME;
process.env.CODEX_HOME = directory;
after(async () => {
  if (previous === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = previous;
  await rm(directory, { recursive: true, force: true });
});
