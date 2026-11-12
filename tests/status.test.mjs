import './helpers/isolated-codex.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configure, project } from './helpers/project.mjs';
import { prepareScan } from '../src/core/scan-plan.ts';
import { setupStatus } from '../src/core/status.ts';

test('status shows the same route a preview would, with config files and profiles', async (t) => {
  const root = await project(t);
  await configure(t, {
    codex: `
model = "gateway-model"
model_provider = "gateway"
profile = "work"
[model_providers.gateway]
base_url = "https://gateway.example.test/v1"
env_key = "GATEWAY_KEY"
[profiles.work]
model_reasoning_effort = "low"
`,
  });
  const status = await setupStatus(root);
  assert.deepEqual(status.route, (await prepareScan(root, {})).settings.codex);
  assert.equal(status.route.baseUrl, 'https://gateway.example.test/v1');
  assert.equal(status.route.reasoningEffort, 'low');
  assert.equal(status.profile, 'work');
  assert.deepEqual(status.profiles, ['work']);
  assert.match(status.codexConfigFile, /codex\/config\.toml$/);
});

test('status reports the node and python3 found on PATH, or null', async (t) => {
  const root = await project(t);
  const bin = await mkdtemp(join(tmpdir(), 'status-path-'));
  t.after(() => rm(bin, { recursive: true, force: true }));
  await writeFile(join(bin, 'python3'), '#!/bin/sh\necho "Python 3.12.4"\n');
  await chmod(join(bin, 'python3'), 0o755);
  const path = process.env.PATH;
  process.env.PATH = bin;
  t.after(() => (process.env.PATH = path));
  assert.deepEqual((await setupStatus(root)).runtime, { node: null, python: '3.12.4' });
});

test('a provider with no credential is not sent to sign-in, and says how to start', async (t) => {
  const root = await project(t);
  await configure(t, {
    codex: `
model = "gateway-model"
model_provider = "gateway"
[model_providers.gateway]
base_url = "https://gateway.example.test/v1"
`,
  });
  const signIn = { status: async () => ({ state: 'needed' }) };
  const blocked = await setupStatus(root, signIn);
  assert.match(blocked.route.auth, /^No API key .* set CODEX_API_KEY=unused/);
  assert.equal(blocked.signIn, undefined);

  process.env.CODEX_API_KEY = 'unused';
  t.after(() => delete process.env.CODEX_API_KEY);
  const ready = await setupStatus(root, signIn);
  assert.equal(ready.route.auth, 'No API key (this provider has none configured)');
  assert.equal(ready.signIn, undefined);
});
