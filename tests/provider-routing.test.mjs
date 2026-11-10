import test from 'node:test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, realpath, rm, symlink, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveSettings, sdkConfiguration, loadGlobalSettings } from '../src/core/sdk-settings.ts';
import {
  validateProvider,
  readProviderConfiguration,
  defaultCodexConfigFile,
} from '../src/core/provider-config.ts';
import {
  requireSdkCredentials,
  ProviderCredentialsRequiredError,
  DedicatedSecurityCredentialsRequiredError,
} from '../src/core/credential-guard.ts';
import { prepareScan, validatePlan } from '../src/core/scan-plan.ts';
import { PlannedScanService } from '../src/core/planned-scan.ts';
import { SecurityOperationsService } from '../src/core/security-operations.ts';
import { CodexScanService } from '../src/core/codex-adapter.ts';
import { createSecurityPlugin } from '../src/plugin.ts';
import { describePlan, describeInferenceRoute } from '../src/plan-view.ts';

const provider = {
  id: 'litellm',
  baseUrl: 'https://gateway.example.test/v1',
  envKey: 'SYNTHETIC_LITELLM_KEY',
  wireApi: 'responses',
};
const nativeConfig = `model = "gpt-5.6-sol"
model_provider = "litellm"
model_reasoning_effort = "high"
[model_providers.litellm]
name = "Synthetic gateway"
base_url = "https://gateway.example.test/v1"
wire_api = "responses"
env_key = "SYNTHETIC_LITELLM_KEY"
requires_openai_auth = false
`;
async function fixture(t, settings) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'provider-routing-')));
  const codexFile = join(root, 'codex.toml');
  const configHome = join(root, 'config');
  await mkdir(join(configHome, 'opencode'), { recursive: true });
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src', 'fixture.js'), '// Synthetic offline fixture.');
  await writeFile(codexFile, nativeConfig);
  const globalFile = join(configHome, 'opencode', 'codex-security.json');
  await writeFile(globalFile, JSON.stringify(settings ?? { codex: { configFile: codexFile } }));
  const old = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = configHome;
  t.after(async () => {
    if (old === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = old;
    await rm(root, { recursive: true, force: true });
  });
  return { root, codexFile, globalFile };
}
const scanResult = { findings: { scanId: 'synthetic', findings: [] } };
const mockOperations = () => ({
  generatePolicy: async (root) => ({
    repository: root,
    targetPath: join(root, 'SECURITY.md'),
    content: '# Synthetic draft',
    reviewNotes: [],
  }),
  validate: async () => ({ disposition: 'deferred', report: 'Synthetic only.' }),
  close: async () => {},
});

test('existing Codex config opt-in resolves only the selected Responses route, with explicit model precedence', async (t) => {
  const { codexFile } = await fixture(t);
  // These unrelated capabilities and credential-like placeholders must never be copied, logged, or hashed.
  await writeFile(
    codexFile,
    nativeConfig +
      `\n[mcp_servers.ignored]\ncommand = "DO_NOT_RUN_SYNTHETIC"\n[unrelated]\ntoken = "SYNTHETIC_NOT_A_CREDENTIAL_ONE"\n`,
  );
  const settings = await resolveSettings({
    codex: { configFile: codexFile, model: 'gpt-6.1-sol', reasoningEffort: 'medium' },
  });
  assert.deepEqual(settings.codex.provider, provider);
  assert.equal(settings.codex.auth, 'api-key');
  assert.equal(settings.codex.model, 'gpt-6.1-sol');
  assert.equal(settings.codex.reasoningEffort, 'medium');
  assert.equal(settings.codex.source.path, codexFile);
  assert.match(settings.codex.source.digest, /^[a-f0-9]{64}$/);
  const config = sdkConfiguration(settings);
  assert.deepEqual(config.codexOverrides, {
    model_provider: 'litellm',
    model: 'gpt-6.1-sol',
    model_reasoning_effort: 'medium',
    daybreak: false,
    analytics: { enabled: false },
    model_providers: {
      litellm: {
        name: 'litellm',
        base_url: provider.baseUrl,
        env_key: provider.envKey,
        wire_api: 'responses',
        requires_openai_auth: false,
      },
    },
  });
  assert.doesNotMatch(
    JSON.stringify({ settings, config }),
    /DO_NOT_RUN|SYNTHETIC_NOT|mcp_servers|profile|configFile/,
  );
  await writeFile(
    codexFile,
    nativeConfig + `\n[unrelated]\ntoken = "SYNTHETIC_NOT_A_CREDENTIAL_TWO"\n`,
  );
  const same = await resolveSettings({
    codex: { configFile: codexFile, model: 'gpt-6.1-sol', reasoningEffort: 'medium' },
  });
  assert.deepEqual(
    same,
    settings,
    'unrelated content and credential values cannot affect the retained digest',
  );
});

test('named native profiles select model/provider without passing SDK profiles or unsafe settings', async (t) => {
  const { codexFile } = await fixture(t);
  await writeFile(
    codexFile,
    nativeConfig +
      `\n[profiles.work]\nmodel = "gpt-6.1-sol"\nmodel_reasoning_effort = "medium"\napproval_policy = "never"\n[profiles.other]\nmodel_provider = "missing"\n`,
  );
  const settings = await resolveSettings({ codex: { configFile: codexFile, profile: 'work' } });
  assert.equal(settings.codex.model, 'gpt-6.1-sol');
  assert.equal(settings.codex.source.profile, 'work');
  assert.equal(sdkConfiguration(settings).codexOverrides.profile, undefined);
  assert.equal(sdkConfiguration(settings).codexOverrides.approval_policy, undefined);
  await assert.rejects(
    resolveSettings({ codex: { configFile: codexFile, profile: 'missing' } }),
    /profile is missing/,
  );
  await assert.rejects(
    resolveSettings({ codex: { configFile: codexFile, profile: 'other' } }),
    /must define/,
  );
  await assert.rejects(
    resolveSettings({ codex: { configFile: codexFile, profile: '../work' } }),
    /simple named/,
  );
  await assert.rejects(resolveSettings({ codex: { profile: 'work' } }), /requires/);
  await writeFile(
    codexFile,
    `profile = "work"\n` + nativeConfig + `\n[profiles.work]\nmodel = "gpt-6.1-sol"\n`,
  );
  assert.equal(
    (await resolveSettings({ codex: { configFile: codexFile } })).codex.source.profile,
    'work',
  );
});

test('configuration is never imported implicitly; existing ChatGPT defaults stay intact', async (t) => {
  const { root } = await fixture(t, {});
  const settings = await resolveSettings({});
  assert.deepEqual(settings.codex, {
    model: 'gpt-5.6-sol',
    reasoningEffort: 'xhigh',
    daybreak: false,
    auth: 'chatgpt',
  });
  assert.equal((await prepareScan(root)).settings.codex.source, undefined);
  assert.deepEqual(sdkConfiguration().codexOverrides, { model_provider: 'openai' });
  await assert.rejects(
    resolveSettings({ codex: { auth: 'api-key' } }),
    /requires an explicit custom provider/,
  );
});

test('explicit provider settings support no-login routing but reject contradictory or unsupported auth and Daybreak', async (t) => {
  const { codexFile } = await fixture(t);
  const settings = await resolveSettings({ codex: { provider }, scan: { maxCostUsd: 2 } });
  assert.equal(settings.codex.auth, 'api-key');
  assert.equal(settings.scan.maxCostUsd, 2);
  for (const codex of [
    { provider, auth: 'chatgpt' },
    { provider, auth: 'auto' },
    { provider, configFile: codexFile },
    { provider, daybreak: true },
    { provider, apiKey: 'SYNTHETIC_NO_SECRET' },
  ])
    await assert.rejects(resolveSettings({ codex }));
  await assert.rejects(
    resolveSettings({ codex: { provider }, scan: { cyberAccessProgram: 'daybreak_blue' } }),
    /Daybreak is not supported/,
  );
  assert.equal(
    (await resolveSettings({ codex: { provider }, scan: { cyberAccessProgram: 'standard' } })).codex
      .auth,
    'api-key',
  );
});

for (const [label, patch] of [
  ['HTTP URL', { baseUrl: 'http://gateway.example.test/v1' }],
  ['userinfo', { baseUrl: 'https://synthetic:placeholder@gateway.example.test/v1' }],
  ['query', { baseUrl: 'https://gateway.example.test/v1?key=placeholder' }],
  ['fragment', { baseUrl: 'https://gateway.example.test/v1#placeholder' }],
  ['encoded path', { baseUrl: 'https://gateway.example.test/%61' }],
  ['key-looking path', { baseUrl: 'https://gateway.example.test/sk-placeholder' }],
  ['non-URL', { baseUrl: 'gateway.example.test' }],
  ['control characters', { baseUrl: 'https://gateway.example.test/\n' }],
  ['reserved built-in', { id: 'openai' }],
  ['reserved provider authentication', { id: 'amazon-bedrock' }],
  ['prototype ID', { id: '__proto__' }],
  ['invalid key name', { envKey: 'not a variable' }],
  ['wrong wire API', { wireApi: 'chat' }],
  ['inline token', { apiKey: 'SYNTHETIC_PLACEHOLDER' }],
])
  test(`provider validation rejects ${label} without echoing values`, () => {
    assert.throws(
      () => validateProvider({ ...provider, ...patch }),
      (error) => {
        assert.doesNotMatch(error.message, /placeholder|SYNTHETIC_PLACEHOLDER|not a variable/);
        return true;
      },
    );
  });

test('TOML parsing, unsupported provider fields, bounded files, and symlinks fail closed without revealing source lines', async (t) => {
  const { root, codexFile } = await fixture(t);
  for (const extra of [
    'http_headers = { Authorization = "SYNTHETIC_HIDDEN" }',
    'env_http_headers = { X = "OTHER_ENV" }',
    'auth = { command = "DO_NOT_RUN" }',
    'api_key = "SYNTHETIC_HIDDEN"',
    'model_catalog_url = "https://other.example.test"',
    'requires_openai_auth = true',
  ]) {
    await writeFile(codexFile, nativeConfig.replace('requires_openai_auth = false', extra));
    await assert.rejects(resolveSettings({ codex: { configFile: codexFile } }), (error) => {
      assert.doesNotMatch(error.message, /SYNTHETIC_HIDDEN|DO_NOT_RUN|OTHER_ENV|other.example/);
      return /unsupported options/.test(error.message);
    });
  }
  await writeFile(codexFile, 'model = "SYNTHETIC_HIDDEN\n');
  await assert.rejects(
    readProviderConfiguration(codexFile),
    (error) => !error.message.includes('SYNTHETIC_HIDDEN') && /Cannot parse/.test(error.message),
  );
  await writeFile(codexFile, '#'.repeat(256 * 1024 + 1));
  await assert.rejects(readProviderConfiguration(codexFile), /256 KiB/);
  await writeFile(codexFile, '\0');
  await assert.rejects(readProviderConfiguration(codexFile), /Cannot read/);
  const link = join(root, 'link.toml');
  await symlink(codexFile, link);
  await assert.rejects(readProviderConfiguration(link), /nonsymlink/);
  await assert.rejects(readProviderConfiguration(join(root, 'missing.toml')), /Cannot read/);
  await assert.rejects(readProviderConfiguration('relative.toml'), /absolute/);
  await writeFile(join(root, 'config', 'opencode', 'codex-security.json'), '{"SYNTHETIC_HIDDEN');
  await assert.rejects(
    loadGlobalSettings(),
    (error) => !error.message.includes('SYNTHETIC_HIDDEN') && /valid JSON/.test(error.message),
  );
});

test('custom credential guard checks only the selected key and never requires, imports, or creates ChatGPT credentials', async (t) => {
  const { root } = await fixture(t);
  const config = sdkConfiguration(await resolveSettings({ codex: { provider } }));
  const before = await readdir(root);
  const environment = {
    CODEX_HOME: root,
    CODEX_SECURITY_STATE_DIR: join(root, 'missing-state'),
    [provider.envKey]: 'synthetic-test-value-only',
  };
  await requireSdkCredentials(config, environment);
  for (const key of [undefined, '', '   '])
    await assert.rejects(
      requireSdkCredentials(config, { ...environment, [provider.envKey]: key }),
      ProviderCredentialsRequiredError,
    );
  await assert.rejects(
    requireSdkCredentials(config, {
      OPENAI_API_KEY: 'unrelated-synthetic',
      CODEX_API_KEY: 'unrelated-synthetic',
    }),
    ProviderCredentialsRequiredError,
  );
  assert.deepEqual(await readdir(root), before);
  await assert.rejects(
    requireSdkCredentials(sdkConfiguration(), { CODEX_HOME: root }),
    DedicatedSecurityCredentialsRequiredError,
  );
  assert.deepEqual(await readdir(root), before);
});

test('approval preview binds provider recipient/auth/model and safe selected source digest', async (t) => {
  const { root, codexFile } = await fixture(t);
  const plan = await prepareScan(root);
  const text = describePlan(plan);
  assert.match(text, /gateway\.example\.test\/v1/);
  assert.match(text, /SYNTHETIC_LITELLM_KEY/);
  assert.match(text, /api key/i);
  assert.match(text, /gpt-5.6-sol/);
  assert.ok(text.includes(codexFile));
  assert.ok(text.includes(plan.settings.codex.source.digest));
  assert.doesNotMatch(text, /dedicated ChatGPT|go to OpenAI/);
  assert.match(describeInferenceRoute(plan.settings), /upstream routing is not verified/);
  for (const forbidden of [
    { provider },
    { baseUrl: provider.baseUrl },
    { auth: 'api-key' },
    { configFile: codexFile },
    { model: 'different' },
  ])
    await assert.rejects(prepareScan(root, forbidden), /Unsupported scan input/);
});

test('scan, policy, and validation pass the same resolved provider snapshot and api-key auth to injected SDKs', async (t) => {
  const { root } = await fixture(t);
  const captured = [];
  const scans = new PlannedScanService(root, {
    createClient(config) {
      captured.push(['scan-config', config]);
      return {
        run: async (_root, options) => {
          captured.push(['scan-options', options]);
          return scanResult;
        },
        close: async () => {},
      };
    },
  });
  const operations = new SecurityOperationsService(root, {
    createClient(config) {
      captured.push(['operation-config', config]);
      return {
        ...mockOperations(),
        generatePolicy: async (directory, options) => {
          captured.push(['policy-options', options]);
          return mockOperations().generatePolicy(directory);
        },
        validate: async (options) => {
          captured.push(['validation-options', options]);
          return mockOperations().validate();
        },
      };
    },
  });
  t.after(() => Promise.all([scans.dispose(), operations.dispose()]));
  const preview = await scans.prepare();
  await scans.start({ planId: preview.plan.id, approveOpenAIInference: true });
  assert.equal((await scans.wait()).status, 'completed');
  for (const kind of ['policy', 'validation']) {
    const op = await operations.prepare({
      kind,
      ...(kind === 'validation' ? { finding: 'Synthetic finding.' } : {}),
    });
    await operations.start({
      operationId: op.operationId,
      approveOpenAIInference: true,
      ...(kind === 'validation' ? { approveUncappedValidation: true } : {}),
    });
    assert.equal((await operations.wait(op.operationId)).status, 'completed');
  }
  for (const [name, value] of captured) {
    if (name.endsWith('config')) assert.deepEqual(value, sdkConfiguration(preview.plan.settings));
    else {
      assert.equal(value.auth, 'api-key');
      assert.equal(value.maxCostUsd, name === 'validation-options' ? undefined : 1);
    }
  }
  assert.equal(captured.length, 6);
});

for (const mutation of ['route', 'model', 'key-name', 'source', 'auth'])
  test(`${mutation} changes invalidate scan, policy, and validation before SDK creation`, async (t) => {
    const { root, codexFile, globalFile } = await fixture(t);
    let created = 0;
    const scans = new PlannedScanService(root, {
      createClient() {
        created++;
        throw new Error('Must not execute.');
      },
    });
    const operations = new SecurityOperationsService(root, {
      createClient() {
        created++;
        throw new Error('Must not execute.');
      },
    });
    t.after(() => Promise.all([scans.dispose(), operations.dispose()]));
    const scan = await scans.prepare();
    const policy = await operations.prepare({ kind: 'policy' });
    const validation = await operations.prepare({
      kind: 'validation',
      finding: 'Synthetic finding.',
    });
    if (mutation === 'route')
      await writeFile(
        codexFile,
        nativeConfig.replace('gateway.example.test', 'changed.example.test'),
      );
    if (mutation === 'model')
      await writeFile(codexFile, nativeConfig.replace('gpt-5.6-sol', 'gpt-6.1-sol'));
    if (mutation === 'key-name')
      await writeFile(
        codexFile,
        nativeConfig.replace('SYNTHETIC_LITELLM_KEY', 'SYNTHETIC_OTHER_KEY'),
      );
    if (mutation === 'source') {
      const next = join(root, 'next.toml');
      await writeFile(next, nativeConfig);
      await writeFile(globalFile, JSON.stringify({ codex: { configFile: next } }));
    }
    if (mutation === 'auth') await writeFile(globalFile, '{}');
    await assert.rejects(validatePlan(scan.plan), /changed after preview/);
    await assert.rejects(
      scans.start({ planId: scan.plan.id, approveOpenAIInference: true }),
      /changed after preview/,
    );
    for (const op of [policy, validation])
      await assert.rejects(
        operations.start({
          operationId: op.operationId,
          approveOpenAIInference: true,
          approveUncappedValidation: true,
        }),
        /changed after preview/,
      );
    assert.equal(created, 0);
  });

test('unknown model pricing fails closed with a useful redacted message and retained budget', async (t) => {
  const { root } = await fixture(t, { codex: { provider, model: 'gateway-alias' } });
  const createClient = () => ({
    ...mockOperations(),
    run: async (_root, options) => {
      assert.equal(options.maxCostUsd, 1);
      throw new Error(
        'A scan cost limit is not available for the configured model: SYNTHETIC_HIDDEN',
      );
    },
    generatePolicy: async (_root, options) => {
      assert.equal(options.maxCostUsd, 1);
      throw new Error(
        'A scan cost limit is not available for the configured model: SYNTHETIC_HIDDEN',
      );
    },
  });
  const scan = new CodexScanService(root, { createClient });
  scan.start({
    approved: true,
    repository: root,
    allowNetworkModelInference: true,
    maxCostUsd: 1,
    settings: await resolveSettings({ codex: { provider, model: 'gateway-alias' } }),
  });
  const state = await scan.wait();
  assert.equal(state.status, 'error');
  assert.match(state.error, /cannot estimate costs/);
  assert.doesNotMatch(state.error, /SYNTHETIC_HIDDEN/);
  const operations = new SecurityOperationsService(root, { createClient });
  t.after(() => Promise.all([scan.dispose(), operations.dispose()]));
  const op = await operations.prepare({ kind: 'policy' });
  await operations.start({ operationId: op.operationId, approveOpenAIInference: true });
  const result = await operations.wait(op.operationId);
  assert.equal(result.status, 'error');
  assert.match(result.error, /without removing its cost limit/);
  assert.doesNotMatch(result.error, /SYNTHETIC_HIDDEN/);
});

test('native permission denial prevents SDK creation for custom-provider scan, policy, and validation', async (t) => {
  const { root } = await fixture(t);
  const tools = [],
    permissions = [];
  let handlers,
    created = 0;
  const plugin = createSecurityPlugin({
    createClient() {
      created++;
      throw new Error('Must not execute.');
    },
    createOperationsClient() {
      created++;
      throw new Error('Must not execute.');
    },
  });
  const cleanup = await plugin.setup({
    options: { engine: 'codex' },
    location: { directory: root },
    permission: {
      assert: async (info) => {
        permissions.push(info);
        throw new Error('Denied by native host');
      },
    },
    rpc: {
      register: async (_definition, value) => {
        handlers = value;
        return { events: { emit: async () => {} }, dispose: async () => {} };
      },
    },
    tool: {
      transform: async (callback) => {
        callback({ add: (tool) => tools.push(tool) });
        return { dispose: async () => {} };
      },
    },
  });
  t.after(cleanup);
  const context = {
    signal: new AbortController().signal,
    sessionID: 'synthetic',
    agent: 'synthetic',
    messageID: 'synthetic',
    id: 'synthetic',
  };
  const call = (name, input) => tools.find((tool) => tool.name === name).execute(input, context);
  const preview = await call('security_prepare_scan', {});
  await assert.rejects(
    call('security_run_scan', { planId: preview.content.match(/Preview ID: (.+)/)[1] }),
    /Denied by native host/,
  );
  const policy = JSON.parse((await call('security_prepare_policy', {})).content);
  await assert.rejects(
    call('security_start_operation', { operationId: policy.operationId }),
    /Denied by native host/,
  );
  const validation = await handlers.operationPrepare({
    kind: 'validation',
    finding: 'Synthetic finding only.',
  });
  await assert.rejects(
    call('security_start_operation', { operationId: validation.operationId }),
    /Denied by native host/,
  );
  assert.equal(created, 0);
  assert.deepEqual(
    permissions.map((info) => info.action),
    ['codex_security_scan', 'codex_security_policy', 'codex_security_validation_uncapped'],
  );
  for (const info of permissions) {
    assert.ok(info.resources.includes(info.metadata.settings));
    assert.match(info.metadata.settings, /gateway\.example\.test/);
    assert.match(info.metadata.settings, /SYNTHETIC_LITELLM_KEY/);
    assert.match(info.metadata.settings, /"auth":"api-key"/);
    assert.match(info.metadata.settings, /"source"/);
  }
});

for (const action of ['cancel', 'dispose'])
  test(`${action} during the final asynchronous route check prevents SDK creation`, () => {
    // Module mocking is confined to a synthetic child process; production has no bypass seam.
    const script = `
    import { mock } from 'node:test';
    import { mkdtemp, mkdir, writeFile, realpath, rm } from 'node:fs/promises';
    import { tmpdir } from 'node:os';
    import { join } from 'node:path';
    const original = await import('./src/core/scan-plan.ts');
    let calls = 0, entered, release;
    const paused = new Promise(resolve => entered = resolve);
    const gate = new Promise(resolve => release = resolve);
    mock.module('./src/core/scan-plan.ts', { namedExports: { ...original, validatePlan: async plan => {
      await original.validatePlan(plan);
      if (++calls === 2) { entered(); await gate; }
    } } });
    const { PlannedScanService } = await import('./src/core/planned-scan.ts');
    const root = await realpath(await mkdtemp(join(tmpdir(), 'provider-cancel-')));
    await mkdir(join(root, 'config', 'opencode'), { recursive: true });
    await writeFile(join(root, 'config', 'opencode', 'codex-security.json'), '{}');
    process.env.XDG_CONFIG_HOME = join(root, 'config');
    let created = 0, runs = 0;
    const service = new PlannedScanService(root, { createClient: () => {
      created++; return { run: async () => { runs++; return { findings: { scanId: 'synthetic', findings: [] } }; }, close: async () => {} };
    } });
    try {
      const preview = await service.prepare();
      const started = service.start({ planId: preview.plan.id, approveOpenAIInference: true });
      await paused;
      const runId = service.getState().runId;
      const disposing = ${JSON.stringify(action)} === 'dispose' ? service.dispose() : undefined;
      if (!disposing) service.cancel({ runId });
      release();
      await started;
      await disposing;
      const state = await service.wait(runId);
      console.log(JSON.stringify({ created, runs, status: state.status }));
    } finally { await service.dispose(); await rm(root, { recursive: true, force: true }); }
  `;
    const child = spawnSync(
      process.execPath,
      ['--experimental-test-module-mocks', '--input-type=module', '-e', script],
      {
        cwd: new URL('..', import.meta.url),
        encoding: 'utf8',
        timeout: 10000,
        env: { PATH: process.env.PATH },
      },
    );
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), { created: 0, runs: 0, status: 'cancelled' });
  });

test('native profile provider fields inherit safely; ignored hints never enter snapshots or digests', async (t) => {
  const { codexFile } = await fixture(t);
  await writeFile(
    codexFile,
    nativeConfig +
      `\n[profiles.work]\nmodel = "gpt-6.1-sol"\n[profiles.work.model_providers.litellm]\nbase_url = "https://work.example.test/v1"\n`,
  );
  const baseline = await resolveSettings({ codex: { configFile: codexFile, profile: 'work' } });
  assert.equal(baseline.codex.provider.baseUrl, 'https://work.example.test/v1');
  assert.equal(baseline.codex.provider.envKey, provider.envKey);
  assert.equal(baseline.codex.provider.wireApi, 'responses');
  await writeFile(
    codexFile,
    nativeConfig +
      `\n[profiles.work]\nmodel = "gpt-6.1-sol"\n[profiles.work.model_providers.litellm]\nbase_url = "https://work.example.test/v1"\nenv_key_instructions = "SYNTHETIC_IGNORED"\nrequest_max_retries = 3\nstream_max_retries = 4\nstream_idle_timeout_ms = 1000\n`,
  );
  const hints = await resolveSettings({ codex: { configFile: codexFile, profile: 'work' } });
  assert.deepEqual(hints, baseline);
  assert.doesNotMatch(JSON.stringify(hints), /SYNTHETIC_IGNORED|retries|timeout/);
  assert.equal(sdkConfiguration(hints).codexOverrides.analytics.enabled, false);
});

test('native provider omission of wire_api uses the native Responses default, but explicit incompatible values reject', async (t) => {
  const { codexFile } = await fixture(t);
  await writeFile(codexFile, nativeConfig.replace('wire_api = "responses"\n', ''));
  assert.equal(
    (await resolveSettings({ codex: { configFile: codexFile } })).codex.provider.wireApi,
    'responses',
  );
  await writeFile(codexFile, nativeConfig.replace('wire_api = "responses"', 'wire_api = "chat"'));
  await assert.rejects(resolveSettings({ codex: { configFile: codexFile } }), /must be responses/);
});

test('profile inheritance rejects unsafe inherited fields and malformed provider-table overrides', async (t) => {
  const { codexFile } = await fixture(t);
  await writeFile(
    codexFile,
    nativeConfig +
      `http_headers = { Authorization = "SYNTHETIC_HIDDEN" }\n[profiles.work.model_providers.litellm]\nbase_url = "https://work.example.test/v1"\n`,
  );
  await assert.rejects(
    resolveSettings({ codex: { configFile: codexFile, profile: 'work' } }),
    /unsupported options/,
  );
  await writeFile(
    codexFile,
    nativeConfig + `\n[profiles.work]\nmodel_providers = "SYNTHETIC_INVALID"\n`,
  );
  await assert.rejects(
    resolveSettings({ codex: { configFile: codexFile, profile: 'work' } }),
    /table must be an object/,
  );
});

function setEnvironmentPath(t, name, value) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
}

test('standard Codex config path uses CODEX_HOME then home without reading files or credentials', () => {
  const home = '/synthetic/home';
  assert.equal(defaultCodexConfigFile({}, home), '/synthetic/home/.codex/config.toml');
  assert.equal(
    defaultCodexConfigFile({ CODEX_HOME: '' }, home),
    '/synthetic/home/.codex/config.toml',
  );
  assert.equal(
    defaultCodexConfigFile({ CODEX_HOME: '/synthetic/work codex' }, home),
    '/synthetic/work codex/config.toml',
  );
  assert.equal(
    defaultCodexConfigFile({ CODEX_HOME: '/synthetic/work codex ' }, home),
    '/synthetic/work codex /config.toml',
  );
  for (const value of [
    ' ',
    '  \t ',
    '.',
    'relative/path',
    '~/work',
    '~',
    '/synthetic/\npath',
    '/synthetic/\0path',
    '/synthetic/\n/../selected',
    '/synthetic/\0/../selected',
    'relative/../~/work',
  ])
    assert.throws(() => defaultCodexConfigFile({ CODEX_HOME: value }, home), /CODEX_HOME must be/);
});

test('useCodexConfig opts into the standard file; profile/model selection stays independent of path choice', async (t) => {
  const { root, codexFile } = await fixture(t);
  const directory = join(root, 'custom home');
  await mkdir(directory);
  await writeFile(
    join(directory, 'config.toml'),
    nativeConfig + '\n[profiles.work]\nmodel = "gpt-6.1-sol"\n',
  );
  setEnvironmentPath(t, 'CODEX_HOME', directory);
  const settings = await resolveSettings({ codex: { useCodexConfig: true, profile: 'work' } });
  assert.equal(settings.codex.source.path, join(directory, 'config.toml'));
  assert.equal(settings.codex.source.profile, 'work');
  assert.equal(settings.codex.model, 'gpt-6.1-sol');
  assert.equal(settings.codex.auth, 'api-key');
  assert.deepEqual(settings.codex.provider, provider);
  assert.equal(settings.codex.useCodexConfig, undefined);
  const overridden = await resolveSettings({
    codex: { useCodexConfig: true, configFile: codexFile },
  });
  assert.equal(overridden.codex.source.path, codexFile);
  assert.equal(overridden.codex.model, 'gpt-5.6-sol');
});

test('unset and empty CODEX_HOME opt-in resolves the synthetic home config', async (t) => {
  const { root } = await fixture(t);
  const home = join(root, 'isolated home');
  await mkdir(join(home, '.codex'), { recursive: true });
  await writeFile(join(home, '.codex', 'config.toml'), nativeConfig);
  setEnvironmentPath(t, 'HOME', home);
  setEnvironmentPath(t, 'CODEX_HOME', undefined);
  assert.equal(
    (await resolveSettings({ codex: { useCodexConfig: true } })).codex.source.path,
    join(home, '.codex', 'config.toml'),
  );
  process.env.CODEX_HOME = '';
  assert.equal(
    (await resolveSettings({ codex: { useCodexConfig: true } })).codex.source.path,
    join(home, '.codex', 'config.toml'),
  );
});

test('without import opt-in, malformed ambient location is ignored and ChatGPT defaults remain; explicit path also wins', async (t) => {
  const { codexFile } = await fixture(t);
  setEnvironmentPath(t, 'CODEX_HOME', 'SYNTHETIC_INVALID_RELATIVE_HOME');
  for (const source of [{}, { codex: { useCodexConfig: false } }]) {
    const settings = await resolveSettings(source);
    assert.equal(settings.codex.auth, 'chatgpt');
    assert.equal(settings.codex.provider, undefined);
    assert.equal(settings.codex.source, undefined);
  }
  for (const codex of [{ configFile: codexFile }, { useCodexConfig: true, configFile: codexFile }])
    assert.equal((await resolveSettings({ codex })).codex.source.path, codexFile);
  await assert.rejects(
    resolveSettings({ codex: { useCodexConfig: true } }),
    (error) =>
      /CODEX_HOME must be/.test(error.message) && !error.message.includes('SYNTHETIC_INVALID'),
  );
});

test('import option combinations are explicit and missing default config never falls back to ChatGPT', async (t) => {
  const { root, codexFile } = await fixture(t);
  setEnvironmentPath(t, 'CODEX_HOME', join(root, 'missing'));
  await assert.rejects(resolveSettings({ codex: { useCodexConfig: true } }), /Cannot read/);
  await assert.rejects(
    resolveSettings({ codex: { useCodexConfig: false, configFile: codexFile } }),
    /cannot be combined/,
  );
  await assert.rejects(resolveSettings({ codex: { useCodexConfig: true, provider } }), /not both/);
  await assert.rejects(
    resolveSettings({ codex: { useCodexConfig: false, profile: 'work' } }),
    /requires/,
  );
  await assert.rejects(
    resolveSettings({ codex: { useCodexConfig: 'true' } }),
    /must be true or false/,
  );
  assert.equal(
    (await resolveSettings({ codex: { useCodexConfig: false, provider } })).codex.auth,
    'api-key',
  );
});

test('changed CODEX_HOME invalidates scan, policy, and validation even with identical selected config', async (t) => {
  const { root, globalFile } = await fixture(t, { codex: { useCodexConfig: true } });
  const first = join(root, 'first'),
    second = join(root, 'second');
  for (const directory of [first, second]) {
    await mkdir(directory);
    await writeFile(join(directory, 'config.toml'), nativeConfig);
  }
  setEnvironmentPath(t, 'CODEX_HOME', first);
  let created = 0;
  const scans = new PlannedScanService(root, {
    createClient() {
      created++;
      throw new Error('Must not create.');
    },
  });
  const operations = new SecurityOperationsService(root, {
    createClient() {
      created++;
      throw new Error('Must not create.');
    },
  });
  t.after(() => Promise.all([scans.dispose(), operations.dispose()]));
  const scan = await scans.prepare();
  const policy = await operations.prepare({ kind: 'policy' });
  const validation = await operations.prepare({
    kind: 'validation',
    finding: 'Synthetic finding.',
  });
  assert.equal(scan.plan.settings.codex.source.path, join(first, 'config.toml'));
  process.env.CODEX_HOME = second;
  const current = await prepareScan(root);
  assert.equal(current.globalConfigFile, globalFile);
  assert.equal(current.globalConfigDigest, scan.plan.globalConfigDigest);
  assert.equal(current.settings.codex.source.digest, scan.plan.settings.codex.source.digest);
  assert.notEqual(current.settings.codex.source.path, scan.plan.settings.codex.source.path);
  await assert.rejects(
    scans.start({ planId: scan.plan.id, approveOpenAIInference: true }),
    /changed after preview/,
  );
  for (const op of [policy, validation])
    await assert.rejects(
      operations.start({
        operationId: op.operationId,
        approveOpenAIInference: true,
        approveUncappedValidation: true,
      }),
      /changed after preview/,
    );
  assert.equal(created, 0);
});
