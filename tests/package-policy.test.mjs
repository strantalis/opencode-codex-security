import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPackagePolicy } from '../scripts/package-policy.mjs';
const manifest = {
  version: '0.1.0',
  private: true,
  license: 'UNLICENSED',
  exports: { '.': './src/plugin.ts' },
};
const archive = (paths = ['package.json', 'src/plugin.ts']) => ({
  name: 'opencode-codex-security',
  version: '0.1.0',
  filename: 'opencode-codex-security-0.1.0.tgz',
  unpackedSize: 123,
  files: paths.map((path) => ({ path })),
});
test('package policy accepts only intended package content', () => {
  assertPackagePolicy(
    archive([
      'package.json',
      'src/plugin.ts',
      'src/core/scanner.ts',
      'dist/gui-experimental.cjs',
      'SECURITY.md',
      'fixtures/vulnerable/src/accounts.js',
    ]),
    manifest,
  );
});
test('package policy rejects hidden files, credentials, dev output and path traversal', () => {
  for (const path of [
    'src/.env',
    'src/credentials.json',
    'src/secrets.ts',
    'src/api.pem',
    'src/../secrets.ts',
    'src//plugin.ts',
    'src/leak.log',
    'src/leak.png',
    '.runtime/state.json',
    'tests/mock.ts',
    'dist/unexpected.cjs',
    'docs/private-notes.md',
  ]) {
    assert.throws(
      () => assertPackagePolicy(archive(['src/plugin.ts', path]), manifest),
      undefined,
      path,
    );
  }
});
test('package policy refuses accidental publication, missing exports and oversized bundles', () => {
  assert.throws(() => assertPackagePolicy(archive(), { ...manifest, private: false }));
  assert.throws(() => assertPackagePolicy(archive(), { ...manifest, license: 'MIT' }));
  assert.throws(() => assertPackagePolicy(archive(['package.json']), manifest));
  assert.throws(() => assertPackagePolicy({ ...archive(), unpackedSize: 2_000_000 }, manifest));
  assert.throws(() => assertPackagePolicy({ ...archive(), filename: '../evil.tgz' }, manifest));
});
