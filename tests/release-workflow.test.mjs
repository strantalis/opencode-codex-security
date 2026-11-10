import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  assert.match(staging, /NPM_CONFIG_USERCONFIG="\$config_dir\/user\.npmrc"/);
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

test('isolated npm configuration loads distinct empty user and global files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'npm-stage-config-'));
  try {
    const user = join(dir, 'user.npmrc');
    const global = join(dir, 'global.npmrc');
    await writeFile(user, '');
    await writeFile(global, '');
    const result = spawnSync('npm', ['config', 'get', 'registry'], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        NPM_CONFIG_USERCONFIG: user,
        NPM_CONFIG_GLOBALCONFIG: global,
        NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org/',
        NPM_CONFIG_IGNORE_SCRIPTS: 'true',
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'https://registry.npmjs.org/');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('actual staging shell requires provenance commit to match the tested artifact', async () => {
  const step = staging.split('      - name: Stage exact tested tarball with OIDC\n')[1];
  assert.ok(step, 'Staging step must exist');
  const shell = step
    .split('        run: |\n')[1]
    .split('\n')
    .map((line) => line.replace(/^ {10}/, ''))
    .join('\n');
  const source = 'a'.repeat(40);
  for (const [label, workflowSha, allowed] of [
    ['matching commit', source, true],
    ['different workflow commit despite current main matching', 'b'.repeat(40), false],
    ['missing provenance commit', undefined, false],
  ]) {
    const dir = await mkdtemp(join(tmpdir(), 'npm-provenance-'));
    try {
      await mkdir(join(dir, 'assets'));
      // Execute the real workflow shell, but replace both network-capable commands
      // with inert functions. Any attempted staging is observable without npm access.
      const mocks = `
        npm() {
          if [[ "$*" == "--version" ]]; then printf '11.20.0\\n';
          elif [[ "$1 $2" == "stage publish" ]]; then printf 'STAGING_ATTEMPT\\n';
          else return 91; fi
        }
        gh() {
          if [[ "$*" == *git/ref/heads/main* ]]; then printf '%s\\n' "$SOURCE_SHA";
          else printf 'public\\n'; fi
        }
      `;
      const env = {
        ...process.env,
        SOURCE_SHA: source,
        REPOSITORY: 'strantalis/opencode-codex-security',
        ARCHIVE: 'opencode-codex-security-0.1.0.tgz',
        NPM_TAG: 'latest',
        NODE_AUTH_TOKEN: '',
        NPM_TOKEN: '',
        TMPDIR: dir,
        GITHUB_STEP_SUMMARY: join(dir, 'summary'),
      };
      delete env.GITHUB_SHA;
      if (workflowSha !== undefined) env.GITHUB_SHA = workflowSha;
      const result = spawnSync('bash', ['--noprofile', '--norc', '-c', mocks + shell], {
        cwd: dir,
        encoding: 'utf8',
        env,
      });
      assert.equal(result.status === 0, allowed, `${label}: ${result.stderr}`);
      assert.equal(result.stdout.includes('STAGING_ATTEMPT'), allowed, label);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
});
