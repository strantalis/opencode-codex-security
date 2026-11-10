import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { OpenCode } from '@opencode/client';
import { Security } from '../src/rpc.ts';
const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const codexGate = process.argv.includes('--codex-gate');
const packageArgument = process.argv.indexOf('--package');
const packageRoot = packageArgument < 0 ? root : process.argv[packageArgument + 1];
assert.ok(packageRoot, 'Provide the extracted package path after --package.');
await mkdir(`${root}/.runtime`, { recursive: true });
const isolated = await mkdtemp(`${root}/.runtime/host-`);
const configPath = `${isolated}/config/opencode/opencode.json`;
await mkdir(`${isolated}/config/opencode`, { recursive: true });
await mkdir(`${isolated}/home`, { recursive: true });
const project = codexGate ? `${isolated}/project` : root;
if (codexGate) {
  await mkdir(`${project}/src`, { recursive: true });
  await writeFile(`${project}/src/example.js`, '// Synthetic scan-free onboarding target.\n');
}
await writeFile(
  configPath,
  JSON.stringify({
    plugins: [
      codexGate
        ? { package: packageRoot }
        : { package: packageRoot, options: { engine: 'fixture' } },
    ],
  }),
);
const processEnv = {
  PATH: process.env.PATH,
  HOME: `${isolated}/home`,
  XDG_DATA_HOME: `${isolated}/data`,
  XDG_CONFIG_HOME: `${isolated}/config`,
  XDG_STATE_HOME: `${isolated}/state`,
  XDG_CACHE_HOME: `${isolated}/cache`,
  OPENCODE_CONFIG: configPath,
  OPENCODE_DISABLE_AUTOUPDATE: '1',
  OPENCODE_DISABLE_MODELS_FETCH: '1',
};
const child = spawn(
  `${root}/node_modules/.bin/opencode`,
  ['serve', '--hostname', '127.0.0.1', '--port', '4109', '--print-logs', '--log-level', 'debug'],
  { cwd: root, env: processEnv, stdio: ['ignore', 'pipe', 'pipe'] },
);
let output = '';
let stderr = '';
child.stdout.on('data', (d) => (output += d));
child.stderr.on('data', (d) => (stderr += d));
try {
  for (let i = 0; i < 100 && !/server password ([^\s]+)/.test(output); i++) {
    if (child.exitCode !== null) throw new Error('OpenCode exited before ready: ' + stderr);
    await sleep(100);
  }
  const password = output.match(/server password ([^\s]+)/)?.[1];
  if (!password) throw new Error('OpenCode did not report ready within 10 seconds');
  const client = OpenCode.make({
    baseUrl: 'http://127.0.0.1:4109',
    headers: { Authorization: `Basic ${Buffer.from('opencode:' + password).toString('base64')}` },
  });
  const location = { directory: project };
  await client.location.get({ location });
  let plugins, plugin;
  for (let i = 0; i < 50 && !plugin; i++) {
    plugins = await client.plugin.list({ location });
    plugin = plugins.data.find((p) => p.id === 'gill.security');
    if (!plugin) await sleep(100);
  }
  if (!plugin) {
    console.log('Config', JSON.stringify(await client.config.get({ location })));
    console.log(
      'Server diagnostics',
      stderr,
      output.replace(/server password [^\s]+/, 'server password [redacted]'),
    );
  }
  assert.ok(plugin, JSON.stringify(plugins));
  console.log('Actual OpenCode host registered plugin:', plugin.id);
  const rpc = client.rpc(Security);
  let state = await rpc.status({}, { location });
  assert.equal(state.status, 'idle');
  if (codexGate) {
    assert.equal(state.engine, 'codex-security-sdk');
    await assert.rejects(rpc.start({}, { location }));
    assert.equal((await rpc.status({}, { location })).status, 'idle');
    const catalog = await rpc.list({}, { location });
    assert.equal(catalog.engine, 'codex-security-sdk');
    assert.equal(catalog.runs.length, 0);
    assert.equal(catalog.drafts.length, 0);
    const prepared = await rpc.prepare({ scopePaths: ['src'] }, { location });
    assert.equal(prepared.status, 'idle');
    assert.equal(prepared.plan.repository, project);
    assert.deepEqual(prepared.plan.scopePaths, ['src']);
    assert.equal((await rpc.list({}, { location })).runs.length, 0);
    await assert.rejects(rpc.start({ planId: prepared.plan.id }, { location }));
    assert.equal((await rpc.list({}, { location })).runs.length, 0);
    await mkdir(`${isolated}/home/.codex`, { recursive: true });
    await writeFile(
      `${isolated}/home/.codex/config.toml`,
      'model_provider = "network"\n[model_providers.network]\nbase_url = "https://gateway.example.test/v1"\nrequires_openai_auth = false\n',
    );
    for (const prepare of [
      () => rpc.prepare({}, { location }),
      () => rpc.operationPrepare({ kind: 'policy' }, { location }),
    ])
      await assert.rejects(
        prepare(),
        (error) =>
          error.type === 'security.setup' && /Keyless network identity/.test(error.message),
      );
    assert.equal((await rpc.list({}, { location })).runs.length, 0);
    await writeFile(
      `${isolated}/config/opencode/codex-security.json`,
      JSON.stringify({ codex: { auth: 'api-key' } }),
    );
    const openAi = await rpc.prepare({}, { location });
    assert.equal(openAi.plan.settings.codex.auth, 'api-key');
    assert.equal(openAi.plan.settings.codex.provider, undefined);
    await assert.rejects(rpc.start({ planId: openAi.plan.id }, { location }));
    const provider = {
      id: 'gateway',
      baseUrl: 'https://gateway.example.test/v1',
      envKey: 'SYNTHETIC_GATEWAY_KEY',
      wireApi: 'responses',
      envHttpHeaders: { 'X-Workspace': 'SYNTHETIC_WORKSPACE' },
    };
    await writeFile(
      `${isolated}/config/opencode/codex-security.json`,
      JSON.stringify({ codex: { provider } }),
    );
    const gateway = await rpc.prepare({}, { location });
    assert.deepEqual(gateway.plan.settings.codex.provider.envHttpHeaders, {
      'x-workspace': 'SYNTHETIC_WORKSPACE',
    });
    await assert.rejects(rpc.start({ planId: gateway.plan.id }, { location }));
    assert.equal((await rpc.list({}, { location })).runs.length, 0);
    console.log(
      'Actual OpenCode defaults to real SDK, prepares workspace scope, rejects unapproved start, and surfaces unsupported setup errors and prepares explicit API-key/header routes without fallback; no model calls.',
    );
  } else {
    state = await rpc.start({}, { location });
    assert.equal(state.status, 'running');
    const duplicate = await rpc.start({}, { location });
    assert.equal(duplicate.scanId, state.scanId);
    for (let i = 0; i < 100 && state.status === 'running'; i++) {
      await sleep(100);
      state = await rpc.status({}, { location });
    }
    assert.equal(state.status, 'completed');
    assert.equal(state.findings.length, 4);
    console.log('Actual OpenCode RPC scan passed: 4 seeded findings; repeated start idempotent.');
  }
  const gui = await client.plugin.gui({ location, id: 'gill.security' });
  assert.ok(gui.data.code.includes('Security'));
  console.log('Actual OpenCode GUI bundle endpoint:', Object.keys(gui.data).join(', '));
  console.log('HOST INTEGRATION PASSED (no model calls)');
} finally {
  child.kill('SIGTERM');
  const timeout = setTimeout(() => child.kill('SIGKILL'), 3000);
  await new Promise((resolve) => child.once('exit', resolve));
  clearTimeout(timeout);
}
