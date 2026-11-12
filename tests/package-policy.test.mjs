import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPackagePolicy } from '../scripts/package-policy.mjs';
const manifest = {
  version: '0.1.0',
  private: false,
  contentPolicy: { class: 'dual-use' },
  publishConfig: { access: 'public', registry: 'https://registry.npmjs.org/' },
  license: 'Apache-2.0',
  exports: { '.': './src/plugin.ts' },
};
const archive = (paths = ['package.json', 'LICENSE', 'DISCLOSURE', 'src/plugin.ts']) => ({
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
      'LICENSE',
      'DISCLOSURE',
      'src/plugin.ts',
      'src/core/scan-plan.ts',
      'dist/gui-experimental.cjs',
      'dist/tui.js',
      'SECURITY.md',
      'docs/CONFIG.md',
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
      () =>
        assertPackagePolicy(archive(['src/plugin.ts', 'LICENSE', 'DISCLOSURE', path]), manifest),
      undefined,
      path,
    );
  }
});
