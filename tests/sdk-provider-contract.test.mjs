import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { sdkConfiguration } from '../src/core/sdk-settings.ts';

const execute = promisify(execFile);

// Exercise only public SDK APIs. Preflight classifies authentication; it does
// not verify credentials or prove that an actual scan can reach inference.
const probe = `
import { createSecurity, AuthenticationRequiredError, estimateScanCost } from '@openai/codex-security';
const [repository, outputDir, configuration] = process.argv.slice(1);
const gateway = createSecurity({ codexOverrides: {
  model: 'test-model',
  model_provider: 'keyless-gateway',
  model_providers: { 'keyless-gateway': {
    name: 'Keyless gateway',
    base_url: 'http://127.0.0.1:1/v1',
    wire_api: 'responses',
    requires_openai_auth: false,
  } },
} });
let keyless;
let apiKeyRejected = false;
try {
  keyless = (await gateway.preflight(repository, { auth: 'auto', outputDir })).authentication;
  try {
    await gateway.preflight(repository, { auth: 'api-key', outputDir });
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error;
    apiKeyRejected = true;
  }
} finally {
  await gateway.close();
}
const bedrock = createSecurity(JSON.parse(configuration));
let aws;
let bedrockModel;
try {
  const preflight = await bedrock.preflight(repository, { auth: 'auto', outputDir });
  aws = preflight.authentication;
  bedrockModel = preflight.model;
} finally {
  await bedrock.close();
}
const usage = { input_tokens: 1000000, cached_input_tokens: 0, output_tokens: 0 };
const price = (region) => estimateScanCost('openai.gpt-5.6-luna', usage, {
  provider: 'amazon-bedrock', region,
});
const daybreakPrice = (model) => estimateScanCost(model, usage, {
  provider: 'amazon-bedrock', region: 'us-east-2',
});
console.log(JSON.stringify({ keyless, apiKeyRejected, aws, bedrockModel,
  commercial: price('us-east-2'), government: price('us-gov-west-1'),
  unknownRegion: price(null),
  daybreak: daybreakPrice(bedrockModel), gatewayAlias: daybreakPrice('gateway-daybreak-alias'),
}));
`;

test('public SDK provider contract stays explicit about keyless and Bedrock auth', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sdk-provider-contract-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, 'home');
  const codexHome = join(home, '.codex');
  const repository = join(root, 'source');
  const outputDir = join(root, 'output');
  await Promise.all(
    [codexHome, repository, outputDir].map((path) => mkdir(path, { recursive: true })),
  );

  // Do not inherit API keys, AWS profiles, NODE_OPTIONS, proxy settings, or
  // ambient Codex configuration. No run(), login(), or credential helpers.
  const env = {
    PATH: process.env.PATH ?? '',
    ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {}),
    HOME: home,
    USERPROFILE: home,
    CODEX_HOME: codexHome,
    XDG_CONFIG_HOME: join(home, '.config'),
    TMPDIR: root,
    TMP: root,
    TEMP: root,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: join(home, '.gitconfig'),
  };
  const { stdout } = await execute(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      probe,
      repository,
      outputDir,
      JSON.stringify(
        sdkConfiguration({
          codex: {
            model: 'openai.gpt-daybreak-blue-5.6-sol',
            reasoningEffort: 'high',
            daybreak: false,
            auth: 'aws',
            bedrock: { region: 'us-east-2', profile: 'synthetic-profile' },
          },
          scan: { mode: 'standard', maxCostUsd: 1 },
        }),
      ),
    ],
    { cwd: new URL('..', import.meta.url), env, timeout: 30000 },
  );
  const result = JSON.parse(stdout);

  await t.test('keyless auto is classified as unverified stored credentials', () => {
    assert.deepEqual(result.keyless, { method: 'stored_credentials', verified: false });
  });
  await t.test('explicit API-key auth rejects missing keys during preflight', () => {
    assert.equal(result.apiKeyRejected, true);
  });
  await t.test('Bedrock selects the unverified AWS default credential chain', () => {
    assert.equal(result.bedrockModel, 'openai.gpt-daybreak-blue-5.6-sol');
    assert.deepEqual(result.aws, {
      method: 'aws_credentials',
      source: 'default_credential_chain',
      verified: false,
    });
  });
  await t.test('Bedrock estimates respect regional pricing and unresolved regions', () => {
    assert.ok(result.commercial?.estimatedUsd > 0);
    assert.ok(result.government?.estimatedUsd > result.commercial.estimatedUsd);
    assert.equal(result.unknownRegion, null);
  });
  await t.test(
    'Bedrock recognizes the exact Daybreak model but not an arbitrary gateway alias',
    () => {
      assert.ok(result.daybreak?.estimatedUsd > 0);
      assert.equal(result.gatewayAlias, null);
    },
  );
});
