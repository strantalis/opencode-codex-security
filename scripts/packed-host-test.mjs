import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const runtime = join(root, '.runtime');
await mkdir(runtime, { recursive: true });
const temporary = await mkdtemp(join(runtime, 'packed-host-'));
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, env: process.env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}
const archiveArgument = process.argv.indexOf('--archive');
let archivePath;
if (archiveArgument >= 0) {
  assert.ok(process.argv[archiveArgument + 1], 'Provide the tarball path after --archive.');
  archivePath = resolve(process.argv[archiveArgument + 1]);
} else {
  const [archive] = JSON.parse(
    run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', temporary]),
  );
  archivePath = join(temporary, archive.filename);
}
const consumer = join(temporary, 'consumer');
run('npm', [
  'install',
  '--ignore-scripts',
  '--no-audit',
  '--no-fund',
  '--prefix',
  consumer,
  archivePath,
]);
const packageRoot = join(consumer, 'node_modules', 'opencode-codex-security');
for (const extra of [[], ['--codex-gate']]) {
  process.stdout.write(
    run(process.execPath, ['scripts/host-test.mjs', '--package', packageRoot, ...extra]),
  );
}
console.log(
  'Exact packed artifact passed fixture and unapproved-SDK tests in the real OpenCode host. Nothing published.',
);
