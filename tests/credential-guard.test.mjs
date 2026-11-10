import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, chmod, symlink, readdir, realpath, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import {
  dedicatedSecurityAuthPath,
  requireDedicatedSecurityCredentials,
  DedicatedSecurityCredentialsRequiredError,
} from '../src/core/credential-guard.ts';
import { SecurityOperationsService } from '../src/core/security-operations.ts';

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'credential-metadata-test-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('dedicated auth resolution matches SDK state-dir and Codex-home precedence without filesystem access', () => {
  const home = '/synthetic-home';
  assert.equal(
    dedicatedSecurityAuthPath({}, home),
    join(home, '.codex/state/plugins/codex-security/codex-home/auth.json'),
  );
  assert.equal(
    dedicatedSecurityAuthPath({ CODEX_HOME: '/custom-codex' }, home),
    '/custom-codex/state/plugins/codex-security/codex-home/auth.json',
  );
  assert.equal(
    dedicatedSecurityAuthPath(
      { CODEX_SECURITY_STATE_DIR: ' /custom-state ', CODEX_HOME: '/ignored' },
      home,
    ),
    '/custom-state/codex-home/auth.json',
  );
  assert.equal(
    dedicatedSecurityAuthPath({ CODEX_SECURITY_STATE_DIR: '~/private-state', HOME: home }, home),
    '/synthetic-home/private-state/codex-home/auth.json',
  );
  assert.equal(
    dedicatedSecurityAuthPath({ CODEX_HOME: '~\\private-codex', HOME: home }, home),
    '/synthetic-home/private-codex/state/plugins/codex-security/codex-home/auth.json',
  );
  assert.equal(
    dedicatedSecurityAuthPath({ CODEX_HOME: '   ', codex_home: '/case-insensitive' }, home),
    '/case-insensitive/state/plugins/codex-security/codex-home/auth.json',
  );
  assert.equal(
    dedicatedSecurityAuthPath(
      { CODEX_SECURITY_STATE_DIR: ' ', codex_security_state_dir: '/fallback' },
      home,
    ),
    '/fallback/codex-home/auth.json',
  );
  assert.equal(
    dedicatedSecurityAuthPath({ CODEX_HOME: ' relative home ' }, home),
    resolve(' relative home ', 'state/plugins/codex-security/codex-home/auth.json'),
  );
});

test('missing dedicated auth fails without creating state or consulting ambient credentials', async (t) => {
  const root = await fixture(t);
  // Empty synthetic file deliberately contains no credentials. Its presence as
  // ambient auth must not cause any copying or dedicated-directory creation.
  await writeFile(join(root, 'auth.json'), '', { mode: 0o600 });
  const before = await readdir(root);
  await assert.rejects(
    requireDedicatedSecurityCredentials({ CODEX_HOME: root }),
    DedicatedSecurityCredentialsRequiredError,
  );
  assert.deepEqual(await readdir(root), before);
});

test('regular private dedicated auth passes metadata check without parsing file content', async (t) => {
  const root = await fixture(t);
  const environment = { CODEX_SECURITY_STATE_DIR: join(root, 'state') };
  const path = dedicatedSecurityAuthPath(environment);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, '', { mode: 0o600 });
  await requireDedicatedSecurityCredentials(environment);
  await chmod(path, 0o400);
  await requireDedicatedSecurityCredentials(environment);
});

test('symlink, directory, and nonprivate dedicated auth fail closed', async (t) => {
  const root = await fixture(t);
  const environment = { CODEX_SECURITY_STATE_DIR: root };
  const path = dedicatedSecurityAuthPath(environment);
  await mkdir(dirname(path), { mode: 0o700 });
  await writeFile(join(root, 'empty-synthetic.json'), '', { mode: 0o600 });
  await symlink(join(root, 'empty-synthetic.json'), path);
  await assert.rejects(
    requireDedicatedSecurityCredentials(environment),
    DedicatedSecurityCredentialsRequiredError,
  );
  await rm(path);
  await mkdir(path, { mode: 0o700 });
  await assert.rejects(
    requireDedicatedSecurityCredentials(environment),
    DedicatedSecurityCredentialsRequiredError,
  );
  await rm(path, { recursive: true });
  await writeFile(path, '', { mode: 0o600 });
  await chmod(path, 0o644);
  await assert.rejects(
    requireDedicatedSecurityCredentials(environment),
    DedicatedSecurityCredentialsRequiredError,
  );
  await chmod(path, 0o600);
  await chmod(dirname(path), 0o755);
  await assert.rejects(
    requireDedicatedSecurityCredentials(environment),
    DedicatedSecurityCredentialsRequiredError,
  );
});

test('symlinked dedicated credential home is rejected', async (t) => {
  const root = await fixture(t);
  const environment = { CODEX_SECURITY_STATE_DIR: root };
  await mkdir(join(root, 'other-home'), { mode: 0o700 });
  await writeFile(join(root, 'other-home/auth.json'), '', { mode: 0o600 });
  await symlink(join(root, 'other-home'), join(root, 'codex-home'));
  await assert.rejects(
    requireDedicatedSecurityCredentials(environment),
    DedicatedSecurityCredentialsRequiredError,
  );
});

test('real operation factory fails on missing dedicated metadata before SDK import; mocks remain unaffected', async (t) => {
  const root = await fixture(t);
  const names = ['CODEX_SECURITY_STATE_DIR', 'XDG_CONFIG_HOME'];
  const old = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.CODEX_SECURITY_STATE_DIR = join(root, 'missing-state');
  process.env.XDG_CONFIG_HOME = join(root, 'empty-config');
  t.after(() => {
    for (const name of names) {
      if (old[name] === undefined) delete process.env[name];
      else process.env[name] = old[name];
    }
  });
  const real = new SecurityOperationsService(root);
  t.after(() => real.dispose());
  const preview = await real.prepare({ kind: 'validation', finding: 'Synthetic fixture finding.' });
  await real.start({
    operationId: preview.operationId,
    approveOpenAIInference: true,
    approveUncappedValidation: true,
  });
  const result = await real.wait(preview.operationId);
  assert.equal(result.status, 'error');
  assert.match(result.error, /Dedicated Codex Security authentication/);
  assert.equal((await readdir(root)).includes('missing-state'), false);
  let calls = 0;
  const mock = new SecurityOperationsService(root, {
    mock: true,
    createClient: () => ({
      validate: async () => {
        calls++;
        return { disposition: 'deferred', report: 'Synthetic report.' };
      },
      generatePolicy: async () => {
        throw new Error('Unexpected policy operation');
      },
      close: async () => {},
    }),
  });
  t.after(() => mock.dispose());
  const mockPreview = await mock.prepare({
    kind: 'validation',
    finding: 'Synthetic fixture finding.',
  });
  await mock.start({
    operationId: mockPreview.operationId,
    approveOpenAIInference: true,
    approveUncappedValidation: true,
  });
  assert.equal((await mock.wait(mockPreview.operationId)).status, 'completed');
  assert.equal(calls, 1);
});
