import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { assertPackagePolicy } from './package-policy.mjs';

const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  encoding: 'utf8',
});
assert.equal(result.status, 0, result.stderr || result.stdout);
const [archive] = JSON.parse(result.stdout);
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
assertPackagePolicy(archive, manifest);
console.log(
  `Package preview passed: ${archive.files.length} files, ${archive.unpackedSize} unpacked bytes; every export included, strict file allowlist. Nothing published.`,
);
