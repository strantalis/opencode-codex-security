import './helpers/isolated-codex.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readdir, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveSettings, sdkConfiguration } from '../src/core/sdk-settings.ts';
import { validateBedrock, bedrockBaseUrl } from '../src/core/bedrock-config.ts';
import { requireSdkCredentials } from '../src/core/credential-guard.ts';
import { prepareScan, validatePlan } from '../src/core/scan-plan.ts';
import { PlannedScanService } from '../src/core/planned-scan.ts';
import { SecurityOperationsService } from '../src/core/security-operations.ts';
import { describePlan } from '../src/plan-view.ts';

const bedrock = { region: 'us-east-2', profile: 'synthetic-security' };
const model = 'openai.gpt-daybreak-blue-5.6-sol';
const settings = { codex: { bedrock, model, reasoningEffort: 'high' } };
function environment(t, key, value) {
  const old = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  t.after(() => {
    if (old === undefined) delete process.env[key];
    else process.env[key] = old;
  });
}
async function fixture(t, value = settings) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'bedrock-routing-')));
  await mkdir(join(root, '.git'));
  await mkdir(join(root, 'config', 'opencode'), { recursive: true });
  await writeFile(join(root, 'example.js'), '// synthetic offline fixture');
  const globalFile = join(root, 'config', 'opencode', 'codex-security.json');
  await writeFile(globalFile, JSON.stringify(value));
  environment(t, 'CODEX_HOME', root);
  environment(t, 'XDG_CONFIG_HOME', join(root, 'config'));
  environment(t, 'AWS_REGION', undefined);
  environment(t, 'AWS_DEFAULT_REGION', undefined);
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, globalFile, codexFile: join(root, 'config.toml') };
}

test('native Bedrock selection pins AWS endpoint and labels AWS auth without a fake env key', async (t) => {
  const { root } = await fixture(t);
  const before = await readdir(root);
  const plan = await prepareScan(root);
  assert.equal(plan.settings.codex.auth, 'aws');
  assert.equal(plan.settings.codex.model, model);
  assert.equal(plan.settings.codex.daybreak, false);
  assert.deepEqual(sdkConfiguration(plan.settings).codexOverrides.model_providers, {
    'amazon-bedrock': { base_url: bedrockBaseUrl(bedrock), aws: bedrock },
  });
  assert.match(describePlan(plan), /Amazon Bedrock.*us-east-2/);
  assert.match(describePlan(plan), /AWS profile synthetic-security/);
  assert.match(describePlan(plan), /may use existing AWS credential helpers and identity services/);
  assert.doesNotMatch(JSON.stringify(plan.settings), /envKey|api.key/);
  // No auth.json, profile file, or identity service is read by the plugin guard.
  await requireSdkCredentials(sdkConfiguration(plan.settings), { CODEX_HOME: root }, 'aws');
  assert.deepEqual(await readdir(root), before);
  await assert.rejects(
    requireSdkCredentials(sdkConfiguration(plan.settings), {}, 'chatgpt'),
    /Invalid native Bedrock/,
  );
});

test('native Codex Bedrock import safely inherits region/profile and rejects credential or routing overrides', async (t) => {
  const { codexFile } = await fixture(t, {});
  const native = `model_provider = "amazon-bedrock"\nmodel = "${model}"\n[model_providers.amazon-bedrock.aws]\nregion = "us-east-2"\nprofile = "root-profile"\n`;
  await writeFile(
    codexFile,
    native + '\n[profiles.review.model_providers.amazon-bedrock.aws]\nprofile = "review-profile"\n',
  );
  const selected = await resolveSettings({ codex: { profile: 'review' } });
  assert.deepEqual(selected.codex.bedrock, { region: 'us-east-2', profile: 'review-profile' });
  assert.equal(selected.codex.auth, 'aws');
  assert.equal(sdkConfiguration(selected).codexOverrides.profile, undefined);
  for (const unsafe of [
    '\ncredential_export = { command = "DO_NOT_RUN" }',
    '\nauth_refresh = { command = "DO_NOT_RUN" }',
    '\naccess_key_id = "SYNTHETIC_HIDDEN"',
  ]) {
    await writeFile(codexFile, native + unsafe);
    await assert.rejects(resolveSettings({}), (error) => {
      assert.doesNotMatch(error.message, /DO_NOT_RUN|SYNTHETIC_HIDDEN/);
      return /Credential values/.test(error.message);
    });
  }
  await writeFile(
    codexFile,
    `model_provider = "amazon-bedrock"\nmodel = "${model}"\n[model_providers.amazon-bedrock]\nbase_url = "https://unapproved.example.test"\n`,
  );
  await assert.rejects(resolveSettings({}), /without endpoint/);
});

test('discovered AWS region is snapshotted and changes invalidate the preview', async (t) => {
  const { root, codexFile } = await fixture(t, {});
  await writeFile(codexFile, `model_provider = "amazon-bedrock"\nmodel = "${model}"\n`);
  await assert.rejects(resolveSettings({}), /explicit AWS region/);
  environment(t, 'AWS_REGION', 'us-east-2');
  const plan = await prepareScan(root);
  assert.equal(plan.settings.codex.bedrock.region, 'us-east-2');
  environment(t, 'AWS_REGION', 'us-east-1');
  await assert.rejects(validatePlan(plan));
});

test('Bedrock rejects ambiguous auth/model selection and distinguishes the OpenAI Daybreak toggle', async (t) => {
  await fixture(t);
  for (const codex of [
    { bedrock },
    { model, auth: 'aws' },
    { bedrock, model, auth: 'chatgpt' },
    { bedrock, model, auth: 'api-key' },
    { bedrock, model, useCodexConfig: true },
    {
      bedrock,
      model,
      provider: {
        id: 'gateway',
        baseUrl: 'https://gateway.example.test',
        envKey: 'KEY',
        wireApi: 'responses',
      },
    },
  ])
    await assert.rejects(resolveSettings({ codex }));
  await assert.rejects(
    resolveSettings({ codex: { bedrock, model, daybreak: true } }),
    /provisioned model ID/,
  );
  await assert.rejects(
    resolveSettings({ ...settings, scan: { cyberAccessProgram: 'daybreak_blue' } }),
    /provisioned model ID/,
  );
  assert.equal((await resolveSettings(settings)).codex.model, model);
  for (const raw of [
    {},
    { region: 'us-east-2?token=hidden' },
    { region: 'cn-north-1' },
    { region: 'us-iso-east-1' },
    { region: 'us-east-2', profile: '../secret' },
    { ...bedrock, secretAccessKey: 'HIDDEN' },
  ])
    assert.throws(
      () => validateBedrock(raw),
      (error) => !/hidden|secret|HIDDEN/.test(error.message),
    );
});

test('ambient AWS endpoint overrides and tampered runtime endpoints fail without echoing values', async (t) => {
  await fixture(t);
  const config = sdkConfiguration(await resolveSettings(settings));
  for (const name of ['AWS_ENDPOINT_URL', 'AWS_ENDPOINT_URL_BEDROCK', 'aws_endpoint_url_sts'])
    await assert.rejects(
      requireSdkCredentials(config, { [name]: 'https://HIDDEN.example.test' }, 'aws'),
      (error) => /AWS_ENDPOINT_URL/.test(error.message) && !/HIDDEN/.test(error.message),
    );
  config.codexOverrides.model_providers['amazon-bedrock'].base_url =
    'https://unapproved.example.test';
  await assert.rejects(requireSdkCredentials(config, {}, 'aws'), /approved regional AWS endpoint/);
});

for (const mode of ['standard', 'deep'])
  test(`native Bedrock routes ${mode} scans, policy and validation through AWS with unchanged budget`, async (t) => {
    const { root } = await fixture(t);
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
    const scan = await scans.prepare({ mode });
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
    for (const item of captured) {
      if (item.config) {
        assert.equal(item.auth, 'aws');
        assert.deepEqual(item.config, sdkConfiguration(scan.plan.settings));
      } else assert.equal(item.options.auth, 'auto');
    }
    assert.equal(captured.length, 6);
    assert.equal(captured[1].options.mode, mode);
    assert.equal(captured[1].options.maxCostUsd, undefined);
    assert.equal(captured[3].options.maxCostUsd, undefined);
    assert.equal(
      captured[5].options.maxCostUsd,
      undefined,
      'validation remains separately authorized and uncapped',
    );
  });

for (const [field, replacement] of [
  ['profile', 'changed-profile'],
  ['model', 'openai.gpt-5.6-luna'],
]) {
  test(`changed imported Bedrock ${field} invalidates approval`, async (t) => {
    const { root, codexFile } = await fixture(t, {});
    const native = `model_provider = "amazon-bedrock"\nmodel = "${model}"\n[model_providers.amazon-bedrock.aws]\nregion = "us-east-2"\nprofile = "original-profile"\n`;
    await writeFile(codexFile, native);
    const plan = await prepareScan(root);
    await writeFile(
      codexFile,
      native.replace(field === 'model' ? model : 'original-profile', replacement),
    );
    await assert.rejects(validatePlan(plan));
  });
}
