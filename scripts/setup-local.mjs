import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const env = {
  ...process.env,
  HOME: `${root}/.runtime/home`,
  XDG_DATA_HOME: `${root}/.runtime/data`,
  XDG_CONFIG_HOME: `${root}/.runtime/config`,
  XDG_STATE_HOME: `${root}/.runtime/state`,
  XDG_CACHE_HOME: `${root}/.runtime/cache`,
};
for (const path of [
  env.HOME,
  env.XDG_DATA_HOME,
  env.XDG_CONFIG_HOME + '/opencode',
  env.XDG_STATE_HOME,
  env.XDG_CACHE_HOME,
])
  await mkdir(path, { recursive: true });
await writeFile(
  env.XDG_CONFIG_HOME + '/opencode/opencode.json',
  JSON.stringify({ plugins: [{ package: root, options: { engine: 'fixture' } }] }, null, 2),
);
const child = spawnSync(process.execPath, ['node_modules/@opencode/cli/postinstall.mjs'], {
  cwd: root,
  env,
  stdio: 'inherit',
});
if (child.status !== 0) process.exit(child.status ?? 1);
console.log(
  'Isolated OpenCode fixture configuration ready. Your normal settings and credentials are unchanged.',
);
