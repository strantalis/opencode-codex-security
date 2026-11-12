import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('published TUI exports precompiled ESM and keeps host runtimes external', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.exports['./tui'], './dist/tui.js');
  assert.ok(manifest.files.includes('dist/tui.js'));
  assert.equal(manifest.dependencies['@opentui/solid'], undefined);
  assert.equal(manifest.dependencies['@opentui/core'], undefined);
  const bundle = await readFile(new URL('../dist/tui.js', import.meta.url), 'utf8');
  const imports = [...bundle.matchAll(/^import .* from ["']([^"']+)["'];?$/gm)].map(
    (match) => match[1],
  );
  assert.deepEqual(imports.sort(), [
    '@opencode/plugin/rpc',
    '@opencode/plugin/tui',
    '@opentui/solid',
    'solid-js',
  ]);
  assert.doesNotMatch(bundle, /jsx-runtime|React\.createElement|<\/?(?:box|text|Show|For)\b/);
  assert.match(bundle, /createElement/);
  assert.match(bundle, /opencode-codex-security\.tui/);
});
