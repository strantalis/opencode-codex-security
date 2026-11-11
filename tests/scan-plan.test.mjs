import './helpers/isolated-codex.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { configure, project } from './helpers/project.mjs';
import { prepareScan } from '../src/core/scan-plan.ts';
import { PlannedScanService } from '../src/core/planned-scan.ts';
import { describeInferenceRoute, describePlan } from '../src/plan-view.ts';

const fakeResult = { findings: { scanId: 'sdk-1', findings: [] } };
const gateway = `
model = "gateway-model"
model_provider = "gateway"
[model_providers.gateway]
base_url = "https://gateway.example.test/v1"
env_key = "GATEWAY_KEY"
`;

test('a preview resolves the workspace, scope and default route through the SDK', async (t) => {
  const root = await project(t);
  const plan = await prepareScan(root, {
    scopePaths: ['src'],
    scanPrompt: 'Check authz only.',
    contextFiles: ['ARCHITECTURE.md'],
    mode: 'deep',
  });
  assert.equal(plan.repository, root);
  assert.deepEqual(plan.scopePaths, ['src']);
  assert.deepEqual(plan.contextFiles, [{ path: 'ARCHITECTURE.md' }]);
  assert.equal(plan.settings.scan.mode, 'deep');
  assert.equal(plan.settings.codex.provider, 'openai');
  assert.equal(plan.settings.codex.auth, 'Codex Security sign-in');
  assert.ok(plan.settings.codex.model);
  assert.match(describePlan(plan), /Scope: src\nMode: deep\nInstructions: Check authz only\./);
});

test("a preview shows the gateway from the user's Codex config", async (t) => {
  const root = await project(t);
  await configure(t, { codex: gateway });
  assert.match((await prepareScan(root, {})).settings.codex.auth, /GATEWAY_KEY \(not set/);
  process.env.GATEWAY_KEY = 'synthetic';
  t.after(() => delete process.env.GATEWAY_KEY);
  const plan = await prepareScan(root, {});
  assert.equal(
    describeInferenceRoute(plan.settings),
    'gateway (https://gateway.example.test/v1) · gateway-model, xhigh reasoning · API key from GATEWAY_KEY',
  );
  assert.equal(plan.sdk.codexOverrides.model_provider, 'gateway');
  assert.doesNotMatch(JSON.stringify(plan), /synthetic/);
});

test('Bedrock and explicit API-key routes come straight from native settings', async (t) => {
  const root = await project(t);
  await configure(t, {
    plugin: {
      codex: {
        model: 'openai.gpt-test',
        model_provider: 'amazon-bedrock',
        model_providers: { 'amazon-bedrock': { aws: { region: 'us-east-2' } } },
      },
    },
  });
  const bedrock = await prepareScan(root, {});
  assert.equal(bedrock.settings.codex.provider, 'amazon-bedrock');
  assert.match(bedrock.settings.codex.auth, /^AWS credentials/);
  await configure(t, { plugin: { auth: 'api-key' } });
  await assert.rejects(prepareScan(root, {}), /OPENAI_API_KEY or CODEX_API_KEY/);
});

test('bad targets are rejected with a clear message', async (t) => {
  const root = await project(t);
  await assert.rejects(prepareScan(root, { scopePaths: ['missing'] }), /does not exist: missing/);
  await assert.rejects(prepareScan(root, { contextFiles: ['missing.md'] }), /missing\.md/);
  await assert.rejects(prepareScan(root, { repository: homedir() }), /not your home folder/);
  await assert.rejects(prepareScan('', {}), /absolute repository path/);
  await assert.rejects(prepareScan(root, { repository: join(root, 'nope') }), /not a directory/);
  await assert.rejects(prepareScan(root, { mode: 'turbo' }), /Scan inputs are/);
});

test('a scoped scan may target directories named like credentials', async (t) => {
  const root = await project(t);
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(join(root, 'src', 'credentials'));
  await writeFile(join(root, 'src', 'credentials', 'store.js'), 'export {};\n');
  const plan = await prepareScan(root, { scopePaths: ['src/credentials'] });
  assert.deepEqual(plan.scopePaths, ['src/credentials']);
});

test('starting a preview runs exactly what was previewed, once', async (t) => {
  const root = await project(t);
  await configure(t, { plugin: { scan: { maxCostUsd: 2 } } });
  let captured,
    calls = 0;
  const service = new PlannedScanService(root, {
    createClient: (config) => ({
      run: async (repository, options) => {
        calls++;
        captured = { config, repository, options };
        return fakeResult;
      },
      close: async () => {},
    }),
    mock: true,
  });
  t.after(() => service.dispose());
  const { plan } = await service.prepare({
    scopePaths: ['src'],
    scanPrompt: 'Check authz only.',
    contextFiles: ['ARCHITECTURE.md'],
  });
  assert.equal(calls, 0);
  // Settings edited after the preview do not change the run.
  await configure(t, { plugin: { codex: { model: 'changed' }, scan: { maxCostUsd: 99 } } });
  await service.start({ planId: plan.id });
  assert.equal((await service.wait()).status, 'completed');
  assert.equal(captured.repository, root);
  assert.deepEqual(captured.config, { codexOverrides: {} });
  assert.deepEqual(captured.options.target, ['src']);
  assert.equal(captured.options.scanPrompt, 'Check authz only.');
  assert.deepEqual(captured.options.knowledgeBasePaths, [join(root, 'ARCHITECTURE.md')]);
  assert.equal(captured.options.auth, 'auto');
  assert.equal(captured.options.mode, 'standard');
  assert.equal(captured.options.maxCostUsd, 2);
  await assert.rejects(service.start({ planId: plan.id }), /already used/);
  await assert.rejects(service.start({ planId: 'unknown' }), /Prepare a scan preview/);
  assert.equal(calls, 1);
});

test('whole-repository scans omit optional inputs, and expired previews do not start', async (t) => {
  const root = await project(t);
  let options;
  const service = new PlannedScanService(root, {
    createClient: () => ({
      run: async (_repository, received) => {
        options = received;
        return fakeResult;
      },
      close: async () => {},
    }),
    mock: true,
  });
  t.after(() => service.dispose());
  const first = await service.prepare({});
  await service.start({ planId: first.plan.id });
  await service.wait();
  assert.equal(options.target, 'repository');
  assert.equal('scanPrompt' in options, false);
  assert.equal(options.maxCostUsd, undefined);
  const stale = await service.prepare({});
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 11 * 60_000 });
  await assert.rejects(service.start({ planId: stale.plan.id }), /expired/);
});

test('execution headers stay private across previews, events, lists and saved history', async (t) => {
  const { readdir, readFile } = await import('node:fs/promises');
  const root = await project(t);
  const secret = 'synthetic-private-authorization';
  await configure(t, {
    plugin: {
      codex: {
        model: 'custom',
        model_provider: 'gateway',
        model_providers: {
          gateway: { base_url: 'https://gateway.test/v1', http_headers: { Authorization: secret } },
        },
      },
    },
  });
  let captured;
  const events = [];
  const service = new PlannedScanService(root, {
    historyDirectory: join(root, 'history'),
    createClient: (config) => ({
      run: async () => {
        captured = config;
        return fakeResult;
      },
      close: async () => {},
    }),
    mock: true,
  });
  t.after(() => service.dispose());
  service.subscribe((state) => events.push(state));
  const preview = await service.prepare({});
  await service.start({ planId: preview.plan.id });
  await service.wait();
  assert.equal(captured.codexOverrides.model_providers.gateway.http_headers.Authorization, secret);
  for (const value of [
    preview,
    service.getPlan(preview.plan.id),
    service.getState(),
    await service.list(),
    events,
  ]) {
    assert.doesNotMatch(JSON.stringify(value), /synthetic-private-authorization|codexOverrides/);
  }
  for (const name of await readdir(join(root, 'history')))
    assert.doesNotMatch(
      await readFile(join(root, 'history', name), 'utf8'),
      /synthetic-private-authorization|codexOverrides/,
    );
});
