import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const staging = await readFile(
  new URL('../.github/workflows/npm-stage.yml', import.meta.url),
  'utf8',
);
const preview = await readFile(
  new URL('../.github/workflows/release.yml', import.meta.url),
  'utf8',
);

test('npm workflow stages only and never executes repository code under OIDC', () => {
  assert.match(staging, /workflow_dispatch:/);
  assert.match(staging, /github\.ref == 'refs\/heads\/main'/);
  assert.match(staging, /github\.repository == 'strantalis\/opencode-codex-security'/);
  assert.equal((staging.match(/id-token: write/g) ?? []).length, 1);
  assert.doesNotMatch(
    staging,
    /contents: write|checkout@|npm (?:ci|install|run|exec|publish)\b|npx\b/,
  );
  assert.doesNotMatch(staging, /npm stage approve|secrets\./);
  assert.match(
    staging,
    /npm stage publish "\.\/\$ARCHIVE" --access public --tag "\$NPM_TAG" --provenance --ignore-scripts/,
  );
  assert.match(staging, /NPM_CONFIG_IGNORE_SCRIPTS: 'true'/);
  assert.match(staging, /NPM_CONFIG_USERCONFIG=\/dev\/null NPM_CONFIG_GLOBALCONFIG=\/dev\/null/);
  assert.match(
    staging,
    /if \[\[ "\$version" == \*-\* \]\]; then \[\[ "\$NPM_TAG" == next \]\]; fi/,
  );
  for (const action of staging.matchAll(/uses: ([^\n]+)/g)) {
    assert.match(action[1], /@[a-f0-9]{40}(?: |$)/);
  }
});

test('both promotion paths retain source, policy and exact-byte verification', () => {
  for (const workflow of [staging, preview]) {
    for (const guard of [
      '.repository.id == $repo_id',
      '.head_repository.id == $repo_id',
      '.workflow_id == $workflow_id',
      '.event == "push"',
      '.head_branch == "main"',
      '.conclusion == "success"',
      '[[ "$sha" == "$current" ]]',
      '.private == false',
      '.contentPolicy.class == "dual-use"',
      '.sourceRepository == "git+https://github.com/strantalis/opencode-codex-security.git"',
      '[[ $(find . -type f | wc -l) -eq 3 ]]',
      '[[ $(find . -type l | wc -l) -eq 0 ]]',
      '[[ "$(sha256sum "$archive" | cut -d \' \' -f 1)" == "$expected" ]]',
      'cmp SHA256SUMS expected-checksums',
    ]) {
      assert.ok(workflow.includes(guard), `Missing guard: ${guard}`);
    }
  }
});
