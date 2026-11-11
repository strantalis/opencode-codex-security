import './helpers/isolated-codex.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { configure } from './helpers/project.mjs';
import { loadSettings } from '../src/core/settings.ts';

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
