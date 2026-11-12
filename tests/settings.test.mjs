import './helpers/isolated-codex.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { codexHome } from './helpers/isolated-codex.mjs';
import { configure, project } from './helpers/project.mjs';
import { prepareScan } from '../src/core/scan-plan.ts';
import { codexProfiles, loadSettings, saveProfile, settingsPath } from '../src/core/settings.ts';

test('with no files, the SDK defaults apply', async () => {
  const settings = await loadSettings();
  assert.deepEqual(settings.codex, {});
  assert.equal(settings.auth, 'auto');
  assert.deepEqual(settings.scan, {});
});

test("the user's Codex config supplies routing, and nothing else", async (t) => {
  await configure(t, {
    codex: `
model = "gateway-model"
model_provider = "gateway"
approval_policy = "never"
[model_providers.gateway]
base_url = "https://gateway.example.test/v1"
env_key = "GATEWAY_KEY"
[mcp_servers.tracker]
command = "tracker"
`,
  });
  assert.deepEqual((await loadSettings()).codex, {
    model: 'gateway-model',
    model_provider: 'gateway',
    model_providers: {
      gateway: { base_url: 'https://gateway.example.test/v1', env_key: 'GATEWAY_KEY' },
    },
  });
});

test('the selected Codex profile applies, and the plugin file can pick another', async (t) => {
  await configure(t, {
    codex: `
model = "root-model"
profile = "work"
[profiles.work]
model = "work-model"
[profiles.deep]
model = "deep-model"
model_reasoning_effort = "xhigh"
`,
  });
  assert.equal((await loadSettings()).codex.model, 'work-model');
  await configure(t, { plugin: { codex: { profile: 'deep' } } });
  const { codex } = await loadSettings();
  assert.equal(codex.model, 'deep-model');
  assert.equal(codex.model_reasoning_effort, 'xhigh');
});

test('codex-security.json overrides the Codex config and carries scan settings', async (t) => {
  await configure(t, {
    codex: 'model = "from-codex"\n[model_providers.a]\nbase_url = "https://a.example.test/v1"\n',
    plugin: {
      codex: { model: 'from-plugin', model_providers: { b: { base_url: 'https://b.test/v1' } } },
      auth: 'api-key',
      scan: { mode: 'deep', maxCostUsd: 5 },
    },
  });
  const settings = await loadSettings();
  assert.equal(settings.codex.model, 'from-plugin');
  assert.deepEqual(Object.keys(settings.codex.model_providers), ['a', 'b']);
  assert.equal(settings.auth, 'api-key');
  assert.deepEqual(settings.scan, { mode: 'deep', maxCostUsd: 5 });
  assert.equal((await loadSettings('standard')).scan.mode, 'standard');
});

test('useCodexConfig false ignores the Codex config', async (t) => {
  await configure(t, { codex: 'model = "from-codex"\n', plugin: { useCodexConfig: false } });
  assert.deepEqual((await loadSettings()).codex, {});
});

test('shape errors and renamed keys are explained', async (t) => {
  await configure(t, { plugin: { codex: { reasoningEffort: 'high' } } });
  await assert.rejects(loadSettings(), /model_reasoning_effort/);
  await configure(t, { plugin: { scans: {} } });
  await assert.rejects(loadSettings(), /accepts "codex" and "scan"/);
  await configure(t, { plugin: { auth: 'aws' } });
  await assert.rejects(loadSettings(), /auto, chatgpt or api-key/);
  await configure(t, { plugin: {}, codex: 'model = [unterminated' });
  await assert.rejects(loadSettings(), /Could not read .*config\.toml/);
});

test('profiles come from config.toml tables and file profiles in the Codex home', async (t) => {
  await configure(t, {
    codex: 'profile = "work"\n[profiles.work]\nmodel = "w"\n[profiles.deep]\n',
  });
  for (const name of ['bedrock.config.toml', 'not a profile.config.toml']) {
    await writeFile(join(codexHome, name), '');
    t.after(() => rm(join(codexHome, name)));
  }
  assert.deepEqual(await codexProfiles(), ['bedrock', 'deep', 'work']);
  assert.equal((await loadSettings()).profile, 'work');
});

test('saveProfile sets and removes codex.profile, keeping every other key', async (t) => {
  t.after(() => rm(settingsPath(), { force: true }));
  const read = async () => JSON.parse(await readFile(settingsPath(), 'utf8'));
  assert.deepEqual(await saveProfile('bedrock'), {
    configFile: settingsPath(),
    profile: 'bedrock',
  });
  assert.deepEqual(await read(), { codex: { profile: 'bedrock' } });
  await writeFile(
    settingsPath(),
    JSON.stringify({ auth: 'chatgpt', codex: { model: 'm', profile: 'old' }, scan: {} }),
  );
  await saveProfile('work');
  assert.deepEqual(await read(), {
    auth: 'chatgpt',
    codex: { model: 'm', profile: 'work' },
    scan: {},
  });
  assert.equal((await loadSettings()).profile, 'work');
  assert.deepEqual(await saveProfile(''), { configFile: settingsPath() });
  assert.deepEqual((await read()).codex, { model: 'm' });
  await writeFile(settingsPath(), JSON.stringify({ codex: { profile: 'x' } }));
  await saveProfile('');
  assert.deepEqual(await read(), {});
  await writeFile(settingsPath(), '[1]');
  await assert.rejects(saveProfile('x'), /must hold a JSON object/);
});

test("the model's size limits are inherited from the Codex config", async (t) => {
  await configure(t, {
    codex: `
model = "gateway-alias"
model_context_window = 400000
model_auto_compact_token_limit = 320000
mcp_servers = { ignored = { command = "x" } }
`,
  });
  const { codex } = await loadSettings();
  assert.equal(codex.model_context_window, 400000);
  assert.equal(codex.model_auto_compact_token_limit, 320000);
  assert.equal(codex.mcp_servers, undefined);
  // The SDK accepts them: a preview with these settings still resolves.
  const root = await project(t);
  assert.equal((await prepareScan(root, {})).settings.codex.model, 'gateway-alias');
});
