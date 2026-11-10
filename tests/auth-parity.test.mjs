import './helpers/isolated-codex.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, writeFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveSettings, sdkConfiguration } from '../src/core/sdk-settings.ts';
import { validateProvider, OPENAI_API_BASE_URL } from '../src/core/provider-config.ts';
import {
  requireSdkCredentials,
  ProviderCredentialsRequiredError,
  DedicatedSecurityCredentialsRequiredError,
} from '../src/core/credential-guard.ts';
import { prepareScan, validatePlan } from '../src/core/scan-plan.ts';
import { PlannedScanService } from '../src/core/planned-scan.ts';
import { CodexScanService } from '../src/core/codex-adapter.ts';
import { SecurityOperationsService } from '../src/core/security-operations.ts';
import { describePlan } from '../src/plan-view.ts';

const provider = {
  id: 'gateway',
  baseUrl: 'https://gateway.example.test/v1',
  envKey: 'GATEWAY_KEY',
  wireApi: 'responses',
  envHttpHeaders: { 'X-Tenant-Token': 'TENANT_TOKEN', 'X-Client-Id': 'CLIENT_ID' },
};
const native = `model_provider = "gateway"
[model_providers.gateway]
base_url = "https://gateway.example.test/v1"
env_key = "GATEWAY_KEY"
requires_openai_auth = false
[model_providers.gateway.env_http_headers]
X-Tenant-Token = "TENANT_TOKEN"
X-Client-Id = "CLIENT_ID"
`;
function environment(t, name, value) {
  const old = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  t.after(() => {
    if (old === undefined) delete process.env[name];
    else process.env[name] = old;
  });
}
async function fixture(t, settings = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'auth-parity-')));
  // Isolate policy root discovery from any enclosing checkout or sandbox marker.
  await mkdir(join(root, '.git'), { recursive: true });
  await mkdir(join(root, 'config', 'opencode'), { recursive: true });
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src', 'example.js'), '// synthetic fixture');
  const global = join(root, 'config', 'opencode', 'codex-security.json');
  await writeFile(global, JSON.stringify(settings));
  environment(t, 'XDG_CONFIG_HOME', join(root, 'config'));
  environment(t, 'CODEX_HOME', root);
  environment(t, 'OPENAI_BASE_URL', undefined);
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, global };
}

test('built-in OpenAI API-key mode is explicit, endpoint-bound, and disclosed without inspecting credentials', async (t) => {
  const { root } = await fixture(t, { codex: { auth: 'api-key' } });
  const before = await readdir(root);
  const plan = await prepareScan(root);
  assert.equal(plan.settings.codex.auth, 'api-key');
  assert.equal(plan.settings.codex.provider, undefined);
  assert.equal(sdkConfiguration(plan.settings).codexOverrides.openai_base_url, OPENAI_API_BASE_URL);
  assert.match(describePlan(plan), /OpenAI \(https:\/\/api.openai.com\/v1\)/);
  assert.match(describePlan(plan), /OPENAI_API_KEY, otherwise CODEX_API_KEY/);
  assert.equal((await resolveSettings({})).codex.auth, 'chatgpt');
  await writeFile(join(root, 'config.toml'), 'model_provider = "openai"\n');
  assert.equal((await resolveSettings({})).codex.auth, 'chatgpt');
  assert.deepEqual(await readdir(root), [...before, 'config.toml'].sort());
});

test('built-in API-key guard requires an existing supported key and never consults stored authentication', async (t) => {
  const { root } = await fixture(t);
  const config = sdkConfiguration(await resolveSettings({ codex: { auth: 'api-key' } }));
  const before = await readdir(root);
  for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'openai_api_key'])
    await requireSdkCredentials(config, { CODEX_HOME: root, [key]: 'synthetic-only' }, 'api-key');
  for (const env of [{}, { OPENAI_API_KEY: ' ' }, { GATEWAY_KEY: 'unrelated' }])
    await assert.rejects(
      requireSdkCredentials(config, { CODEX_HOME: root, ...env }, 'api-key'),
      ProviderCredentialsRequiredError,
    );
  await assert.rejects(
    requireSdkCredentials(config, { CODEX_HOME: root, OPENAI_API_KEY: 'synthetic' }, 'chatgpt'),
    DedicatedSecurityCredentialsRequiredError,
  );
  assert.deepEqual(await readdir(root), before);
});

test('built-in API endpoint overrides fail closed without exposing their value', async (t) => {
  const { root } = await fixture(t);
  const config = sdkConfiguration(await resolveSettings({ codex: { auth: 'api-key' } }));
  const hidden = 'https://SYNTHETIC_PRIVATE_ENDPOINT.example.test/v1';
  for (const name of ['OPENAI_BASE_URL', 'openai_base_url'])
    await assert.rejects(
      requireSdkCredentials(config, { OPENAI_API_KEY: 'synthetic', [name]: hidden }, 'api-key'),
      (error) =>
        /OPENAI_BASE_URL/.test(error.message) && !error.message.includes('SYNTHETIC_PRIVATE'),
    );
  await assert.rejects(
    requireSdkCredentials(
      { codexOverrides: { model_provider: 'openai', openai_base_url: hidden } },
      { OPENAI_API_KEY: 'synthetic' },
      'api-key',
    ),
    /approved OpenAI API endpoint/,
  );
  environment(t, 'OPENAI_BASE_URL', hidden);
  await assert.rejects(resolveSettings({ codex: { auth: 'api-key' } }), /OPENAI_BASE_URL/);
  delete process.env.OPENAI_BASE_URL;
  for (const setting of ['openai_base_url', 'chatgpt_base_url']) {
    await writeFile(join(root, 'config.toml'), `${setting} = "${hidden}"\n`);
    await assert.rejects(
      resolveSettings({}),
      (error) =>
        /Custom built-in OpenAI endpoints/.test(error.message) &&
        !error.message.includes('SYNTHETIC_PRIVATE'),
    );
  }
});

test('native and explicit environment-header routes retain only validated names and stable snapshots', async (t) => {
  const { root } = await fixture(t);
  await writeFile(join(root, 'config.toml'), native);
  const imported = await resolveSettings({});
  const explicit = await resolveSettings({ codex: { provider } });
  assert.deepEqual(imported.codex.provider, explicit.codex.provider);
  assert.deepEqual(imported.codex.provider.envHttpHeaders, {
    'x-client-id': 'CLIENT_ID',
    'x-tenant-token': 'TENANT_TOKEN',
  });
  assert.deepEqual(
    sdkConfiguration(imported).codexOverrides.model_providers.gateway.env_http_headers,
    imported.codex.provider.envHttpHeaders,
  );
  const plan = await prepareScan(root);
  assert.match(describePlan(plan), /x-tenant-token ← TENANT_TOKEN/);
  assert.doesNotMatch(describePlan(plan), /temporary credential files/);
  const deep = await prepareScan(root, { mode: 'deep' });
  assert.match(
    describePlan(deep),
    /Deep workers may use private temporary credential files; interrupted runs may leave them/,
  );
  environment(t, 'TENANT_TOKEN', 'SYNTHETIC_SECRET_ONE');
  const a = await resolveSettings({});
  process.env.TENANT_TOKEN = 'SYNTHETIC_SECRET_TWO';
  const b = await resolveSettings({});
  assert.deepEqual(a, b);
  assert.doesNotMatch(JSON.stringify({ a, plan, text: describePlan(plan) }), /SYNTHETIC_SECRET/);
  await writeFile(join(root, 'config.toml'), native.replace('TENANT_TOKEN', 'NEXT_TENANT_TOKEN'));
  await assert.rejects(validatePlan(plan), /changed after preview/);
});

test('environment-header validation rejects literal secrets, duplicate names, unsafe headers and oversized mappings', () => {
  for (const envHttpHeaders of [
    { Forwarded: 'ROUTING' },
    { 'X-Forwarded-Host': 'ROUTING' },
    { 'X-Forwarded-Proto': 'ROUTING' },
    { 'X-Original-URL': 'ROUTING' },
    { 'X-Rewrite-URL': 'ROUTING' },
    { constructor: 'ROUTING' },
    { Authorization: 'OTHER_KEY' },
    { Cookie: 'COOKIE' },
    { Host: 'HOST_NAME' },
    { 'Content-Length': 'LENGTH' },
    { 'X-Unsafe\r\n': 'TOKEN' },
    { 'X-One': 'A', 'x-one': 'B' },
    { 'X-One': 'Bearer SYNTHETIC_PRIVATE' },
    { 'X-One': 'synthetic-secret-with-hyphens' },
    { 'X-One': 1 },
    [],
    Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`X-${i}`, `ENV_${i}`])),
  ])
    assert.throws(
      () => validateProvider({ ...provider, envHttpHeaders }),
      (error) => !error.message.includes('SYNTHETIC_PRIVATE'),
    );
  assert.throws(
    () => validateProvider({ ...provider, httpHeaders: { 'X-One': 'SYNTHETIC_PRIVATE' } }),
    /literal headers/,
  );
});

test('custom header guard checks all selected variables without reading auth files or accepting malformed values', async (t) => {
  const { root } = await fixture(t);
  const config = sdkConfiguration(await resolveSettings({ codex: { provider } }));
  const env = {
    CODEX_HOME: root,
    GATEWAY_KEY: 'synthetic-key',
    CLIENT_ID: 'synthetic-client',
    TENANT_TOKEN: 'synthetic-token',
  };
  const before = await readdir(root);
  await requireSdkCredentials(config, env, 'api-key');
  for (const value of [
    undefined,
    '',
    ' ',
    'SYNTHETIC_PRIVATE\r\nInjected: yes',
    'SYNTHETIC_PRIVATE\0',
  ])
    await assert.rejects(
      requireSdkCredentials(config, { ...env, TENANT_TOKEN: value }, 'api-key'),
      (error) =>
        error instanceof ProviderCredentialsRequiredError &&
        !error.message.includes('SYNTHETIC_PRIVATE'),
    );
  await assert.rejects(requireSdkCredentials(config, env, 'chatgpt'), /will not be forwarded/);
  assert.deepEqual(await readdir(root), before);
});

for (const codex of [{ auth: 'api-key' }, { provider }])
  test(`scan, policy and validation bind factory and operation auth for ${codex.provider ? 'custom environment headers' : 'built-in OpenAI API keys'}`, async (t) => {
    const { root } = await fixture(t, { codex });
    const captured = [];
    const factory = (config, auth) => {
      captured.push({ config, auth });
      return {
        run: async (_root, options) => {
          captured.push({ options });
          return { findings: { scanId: 'synthetic', findings: [] } };
        },
        generatePolicy: async (repository, options) => {
          captured.push({ options });
          return {
            repository,
            targetPath: join(repository, 'SECURITY.md'),
            content: '# Synthetic policy',
            reviewNotes: [],
          };
        },
        validate: async (options) => {
          captured.push({ options });
          return { disposition: 'deferred', report: 'Synthetic only.' };
        },
        close: async () => {},
      };
    };
    const scans = new PlannedScanService(root, { createClient: factory });
    const operations = new SecurityOperationsService(root, { createClient: factory });
    t.after(() => Promise.all([scans.dispose(), operations.dispose()]));
    const scan = await scans.prepare({ mode: 'deep' });
    await scans.start({ planId: scan.plan.id, approveOpenAIInference: true });
    assert.equal((await scans.wait()).status, 'completed');
    for (const kind of ['policy', 'validation']) {
      const operation = await operations.prepare({
        kind,
        ...(kind === 'validation' ? { finding: 'Synthetic finding' } : {}),
      });
      await operations.start({
        operationId: operation.operationId,
        approveOpenAIInference: true,
        approveUncappedValidation: true,
      });
      assert.equal((await operations.wait(operation.operationId)).status, 'completed');
    }
    assert.equal(captured.length, 6);
    for (const entry of captured) {
      if (entry.config) {
        assert.equal(entry.auth, 'api-key');
        assert.deepEqual(entry.config, sdkConfiguration(scan.plan.settings));
      } else assert.equal(entry.options.auth, 'api-key');
    }
    assert.equal(captured[1].options.mode, 'deep');
  });

test('built-in auth mismatch rejects before client creation', async (t) => {
  const { root } = await fixture(t);
  let created = 0;
  const service = new CodexScanService(root, {
    createClient: () => {
      created++;
      throw new Error('Must not create');
    },
  });
  t.after(() => service.dispose());
  service.start({
    approved: true,
    repository: root,
    allowNetworkModelInference: true,
    maxCostUsd: 1,
    auth: 'chatgpt',
    settings: await resolveSettings({ codex: { auth: 'api-key' } }),
  });
  const state = await service.wait();
  assert.equal(created, 0);
  assert.match(state.error, /does not match/);
});

test('profile header overrides preserve inherited names and reject ambiguous case aliases', async (t) => {
  const { root } = await fixture(t);
  const file = join(root, 'config.toml');
  await writeFile(
    file,
    native +
      '\n[profiles.work.model_providers.gateway.env_http_headers]\nX-Client-Id = "WORK_CLIENT_ID"\n',
  );
  const settings = await resolveSettings({ codex: { profile: 'work' } });
  assert.deepEqual(settings.codex.provider.envHttpHeaders, {
    'x-client-id': 'WORK_CLIENT_ID',
    'x-tenant-token': 'TENANT_TOKEN',
  });
  await writeFile(
    file,
    native +
      '\n[profiles.work.model_providers.gateway.env_http_headers]\nx-client-id = "WORK_CLIENT_ID"\n',
  );
  await assert.rejects(resolveSettings({ codex: { profile: 'work' } }), /unique safe HTTP names/);
});
