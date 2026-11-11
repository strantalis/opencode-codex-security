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
test('package policy requires the compiled TUI artifact when it is exported', () => {
  const compiledManifest = {
    ...manifest,
    exports: { ...manifest.exports, './tui': './dist/tui.js' },
  };
  assert.throws(() => assertPackagePolicy(archive(), compiledManifest), /Missing export/);
  assertPackagePolicy(
    archive(['package.json', 'LICENSE', 'DISCLOSURE', 'src/plugin.ts', 'dist/tui.js']),
    compiledManifest,
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
test('package policy requires public dual-use metadata, exports and bounded bundles', () => {
  assert.throws(() => assertPackagePolicy(archive(), { ...manifest, private: true }));
  assert.throws(() => assertPackagePolicy(archive(), { ...manifest, license: 'MIT' }));
  assert.throws(() => assertPackagePolicy(archive(['package.json', 'LICENSE']), manifest));
  assert.throws(() => assertPackagePolicy(archive(['package.json', 'src/plugin.ts']), manifest));
  assert.throws(() => assertPackagePolicy({ ...archive(), unpackedSize: 2_000_000 }, manifest));
  assert.throws(() => assertPackagePolicy({ ...archive(), filename: '../evil.tgz' }, manifest));
});

test('package policy requires persistent disclosure and forbids lifecycle execution', () => {
  assert.throws(() => assertPackagePolicy(archive(), { ...manifest, contentPolicy: {} }));
  assert.throws(() => assertPackagePolicy(archive(), { ...manifest, publishConfig: {} }));
  assert.throws(() =>
    assertPackagePolicy(archive(['package.json', 'LICENSE', 'src/plugin.ts']), manifest),
  );
  for (const hook of [
    'preinstall',
    'install',
    'postinstall',
    'prepare',
    'prepublish',
    'prepublishOnly',
    'publish',
    'postpublish',
    'prepack',
    'postpack',
  ]) {
    assert.throws(
      () => assertPackagePolicy(archive(), { ...manifest, scripts: { [hook]: 'evil' } }),
      /Forbidden lifecycle hook/,
    );
  }
});
