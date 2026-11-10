import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const root = fileURLToPath(new URL('..', import.meta.url));
const runtime = join(root, '.runtime');
await mkdir(runtime, { recursive: true });
// A consumer below the checkout could silently resolve missing dependencies
// from the checkout's developer node_modules, hiding packaging regressions.
const temporary = await mkdtemp(join(tmpdir(), 'opencode-security-package-'));
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, env: process.env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}
try {
  for (let parent = dirname(await realpath(temporary)); ; parent = dirname(parent)) {
    let hasModules = false;
    try {
      await access(join(parent, 'node_modules'));
      hasModules = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    assert.ok(!hasModules, 'Choose a neutral TMPDIR without ancestor node_modules.');
    if (parent === dirname(parent)) break;
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
  // The consumer resolves transitive dependencies afresh; audit that tree too.
  run('npm', ['audit', '--prefix', consumer, '--omit=dev', '--audit-level=high']);
  const packageRoot = join(consumer, 'node_modules', 'opencode-codex-security');
  for (const extra of [[], ['--codex-gate']]) {
    process.stdout.write(
      run(process.execPath, ['scripts/host-test.mjs', '--package', packageRoot, ...extra]),
    );
  }
  for (const mode of [
    [],
    ['--real-default'],
    ['--keyless-config'],
    ['--openai-key'],
    ['--header-config'],
    ['--bedrock-config'],
  ])
    process.stdout.write(
      run('python3', ['scripts/packed-tui-test.py', '--package', packageRoot, ...mode]),
    );
  console.log(
    'Exact packed artifact passed fixture, unapproved-SDK and native TUI tests in OpenCode. Nothing published.',
  );
} finally {
  // These tarball/consumer files are disposable; never remove the supplied archive.
  await rm(temporary, { recursive: true, force: true });
}
