import assert from 'node:assert/strict';

const allowedDocs = new Set([
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'docs/GLOBAL-CONFIG.md',
  'docs/MULTI-SCAN.md',
  'docs/SDK.md',
  'docs/PUBLISHING.md',
  'docs/RELEASING.md',
]);

export function assertPackagePolicy(archive, manifest) {
  assert.equal(manifest.private, true, 'Publishing stays disabled until explicitly approved.');
  assert.equal(
    manifest.license,
    'UNLICENSED',
    'Choose release terms explicitly before changing this guard.',
  );
  assert.equal(archive.name, 'opencode-codex-security');
  assert.equal(archive.version, manifest.version);
  assert.equal(archive.filename, `opencode-codex-security-${manifest.version}.tgz`);
  assert.ok(
    /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(manifest.version),
    'Unsafe package version.',
  );
  const paths = archive.files.map((file) => file.path);
  for (const entry of Object.values(manifest.exports)) {
    assert.ok(paths.includes(entry.replace(/^\.\//, '')), `Missing export: ${entry}`);
  }
  for (const path of paths) {
    assert.ok(
      !path.split('/').some((part) => part.startsWith('.') || !part),
      `Hidden/unsafe path: ${path}`,
    );
    const allowed =
      path === 'package.json' ||
      path === 'dist/gui-experimental.cjs' ||
      allowedDocs.has(path) ||
      /^src\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:ts|tsx|mjs)$/.test(path) ||
      /^fixtures\/vulnerable\/(?:src\/[a-z-]+\.js|docs\/ARCHITECTURE\.md)$/.test(path);
    assert.ok(allowed, `File outside package allowlist: ${path}`);
    assert.ok(!/(^|\/)(?:auth|credentials|secrets?)\./i.test(path), `Credential path: ${path}`);
  }
  assert.ok(archive.unpackedSize < 2_000_000, 'Package unexpectedly exceeds 2 MB.');
}
