// Offline tests must never read a developer's real Codex or plugin configuration.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after } from 'node:test';
const directory = await mkdtemp(join(tmpdir(), 'isolated-codex-'));
const isolated = {
  CODEX_HOME: join(directory, 'codex'),
  XDG_CONFIG_HOME: join(directory, 'config'),
  OPENAI_API_KEY: undefined,
  CODEX_API_KEY: undefined,
  OPENAI_BASE_URL: undefined,
};
const previous = Object.fromEntries(Object.keys(isolated).map((key) => [key, process.env[key]]));
const apply = (values) => {
  for (const [key, value] of Object.entries(values))
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
};
apply(isolated);
export const configHome = isolated.XDG_CONFIG_HOME;
export const codexHome = isolated.CODEX_HOME;
after(async () => {
  apply(previous);
  await rm(directory, { recursive: true, force: true });
});
