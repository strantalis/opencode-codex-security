import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  encoding: 'utf8',
});
assert.equal(result.status, 0, result.stderr || result.stdout);
const [archive] = JSON.parse(result.stdout);
const paths = archive.files.map((file) => file.path);
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(manifest.private, true, 'Publishing stays disabled until explicitly approved.');
for (const entry of Object.values(manifest.exports)) {
  assert.ok(paths.includes(entry.replace(/^\.\//, '')), `Missing export: ${entry}`);
}
for (const path of paths) {
  assert.ok(
    !/(^|\/)(?:node_modules|\.runtime|\.git|evidence|tests|coverage)(\/|$)/.test(path),
    `Private/dev path: ${path}`,
  );
  assert.ok(
    !/(^|\/)(?:\.env(?:\..*)?|auth\.json|credentials\.json)$/.test(path),
    `Credential path: ${path}`,
  );
  assert.ok(!/\.(?:log|tgz|zip|png|jpg|sqlite3?)$/.test(path), `Unexpected artifact: ${path}`);
}
assert.ok(archive.unpackedSize < 2_000_000, 'Package unexpectedly exceeds 2 MB.');
console.log(
  `Package preview passed: ${paths.length} files, ${archive.unpackedSize} unpacked bytes; every export included, no runtime/test artifacts. Nothing published.`,
);
