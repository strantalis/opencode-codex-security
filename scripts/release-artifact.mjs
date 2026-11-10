import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPackagePolicy } from './package-policy.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = join(root, '.runtime', 'release');
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const sourceCommit = run('git', ['rev-parse', 'HEAD']);
assert.match(sourceCommit, /^[a-f0-9]{40}$/);
assert.equal(
  run('git', ['status', '--porcelain', '--untracked-files=normal']),
  '',
  'Commit changes before creating a release artifact.',
);
if (process.env.GITHUB_SHA) {
  assert.equal(sourceCommit, process.env.GITHUB_SHA, 'Checkout does not match the CI commit.');
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const [archive] = JSON.parse(
  run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', output]),
);
assertPackagePolicy(archive, manifest);
const archivePath = join(output, archive.filename);
// Exercise these exact bytes in a separate installed consumer, including the SDK permission gate.
process.stdout.write(
  run(process.execPath, ['scripts/packed-host-test.mjs', '--archive', archivePath]) + '\n',
);
const artifact = {
  schemaVersion: 1,
  package: archive.name,
  version: archive.version,
  private: manifest.private,
  contentPolicy: manifest.contentPolicy,
  sourceCommit,
  sourceRepository: manifest.repository.url,
  nodeVersion: process.version,
  lockfileSha256: sha256(await readFile(join(root, 'package-lock.json'))),
  archive: archive.filename,
  archiveSha256: sha256(await readFile(archivePath)),
  verification:
    'Exact tarball installed in isolated OpenCode; explicit fixture scan, GUI endpoint, real-default and explicit API-key/header previews, scope, unapproved-SDK gate and native TUI setup-error/cancel checks passed. TUI test has no Node/npm/Bun on PATH. No real model calls.',
};
const artifactBytes = JSON.stringify(artifact, null, 2) + '\n';
await writeFile(join(output, 'build-manifest.json'), artifactBytes);
await writeFile(
  join(output, 'SHA256SUMS'),
  `${artifact.archiveSha256}  ${archive.filename}\n${sha256(artifactBytes)}  build-manifest.json\n`,
);
console.log(`Verified artifact: ${archivePath}\nSource: ${sourceCommit}\nNothing published.`);
