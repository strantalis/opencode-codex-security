import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Security } from '../src/rpc.ts';
import { root, startHost } from './host.mjs';
const packageArgument = process.argv.indexOf('--package');
const packageRoot = packageArgument < 0 ? root : process.argv[packageArgument + 1];
assert.ok(packageRoot, 'Provide the extracted package path after --package.');
// Outside this checkout: the SDK refuses a state directory inside the repository it scans.
const project = await realpath(await mkdtemp(join(tmpdir(), 'opencode-security-host-')));
await mkdir(`${project}/src`, { recursive: true });
await writeFile(`${project}/src/example.js`, '// Synthetic preview target.\n');
const { client, isolated, open, stop } = await startHost({
  port: 4109,
  config: { plugins: [{ package: packageRoot }] },
});
try {
  const location = await open(project);
  console.log('Actual OpenCode host registered the plugin.');
  const rpc = client.rpc(Security);
  let state = await rpc.status({}, { location });
  assert.equal(state.status, 'idle');
  assert.equal(state.engine, 'codex-security-sdk');
  const setupError = (pattern) => (error) =>
    error.type === 'security.setup' && pattern.test(error.message);
  await assert.rejects(rpc.start({}, { location }), setupError(/Prepare a scan preview/));
  const prepared = await rpc.prepare({ scopePaths: ['src'] }, { location });
  assert.equal(prepared.status, 'idle');
  assert.equal(prepared.plan.repository, project);
  assert.deepEqual(prepared.plan.scopePaths, ['src']);
  assert.equal(prepared.plan.settings.codex.provider, 'openai');
  await assert.rejects(
    rpc.prepare({ scopePaths: ['missing'] }, { location }),
    setupError(/does not exist: missing/),
  );
  // Routing follows the user's own Codex config without any plugin settings.
  await mkdir(`${isolated}/home/.codex`, { recursive: true });
  await writeFile(
    `${isolated}/home/.codex/config.toml`,
    'model = "gateway-model"\nmodel_provider = "gateway"\n[model_providers.gateway]\nbase_url = "https://gateway.example.test/v1"\nenv_key = "SYNTHETIC_GATEWAY_KEY"\n',
  );
  const gateway = await rpc.prepare({}, { location });
  assert.equal(gateway.plan.settings.codex.provider, 'gateway');
  assert.equal(gateway.plan.settings.codex.baseUrl, 'https://gateway.example.test/v1');
  assert.match(gateway.plan.settings.codex.auth, /SYNTHETIC_GATEWAY_KEY \(not set/);
  const setup = await rpc.setup({}, { location });
  assert.deepEqual(setup.route, gateway.plan.settings.codex);
  assert.equal(setup.codexConfigFile, `${isolated}/home/.codex/config.toml`);
  const skills = await client.skill.list({ location });
  assert.ok(skills.data.some((skill) => skill.id === 'codex-security'));
  console.log('Actual OpenCode lists the bundled skill and answers the setup RPC.');
  const policy = await rpc.operationPrepare({ kind: 'policy' }, { location });
  assert.equal(policy.plan.targetPath, `${project}/SECURITY.md`);
  // The plugin settings file wins, and SDK setup errors are shown as written.
  await writeFile(
    `${isolated}/config/opencode/codex-security.json`,
    JSON.stringify({ auth: 'api-key', useCodexConfig: false }),
  );
  await assert.rejects(
    rpc.prepare({}, { location }),
    setupError(/OPENAI_API_KEY or CODEX_API_KEY/),
  );
  // Previews never start anything.
  assert.equal((await rpc.list({}, { location })).runs.length, 0);
  console.log(
    'Actual OpenCode prepares previews through the SDK, follows the Codex config, and reports setup errors; no model calls.',
  );
  const gui = await client.plugin.gui({ location, id: 'opencode-codex-security' });
  assert.ok(gui.data.code.includes('Security'));
  console.log('Actual OpenCode GUI bundle endpoint:', Object.keys(gui.data).join(', '));
  console.log('HOST INTEGRATION PASSED (no model calls)');
} finally {
  await stop();
  await rm(project, { recursive: true, force: true });
}
