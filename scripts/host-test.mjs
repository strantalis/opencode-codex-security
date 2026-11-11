import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpenCode } from '@opencode/client';
import { Security } from '../src/rpc.ts';
const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const packageArgument = process.argv.indexOf('--package');
const packageRoot = packageArgument < 0 ? root : process.argv[packageArgument + 1];
assert.ok(packageRoot, 'Provide the extracted package path after --package.');
await mkdir(`${root}/.runtime`, { recursive: true });
const isolated = await mkdtemp(`${root}/.runtime/host-`);
const configPath = `${isolated}/config/opencode/opencode.json`;
await mkdir(`${isolated}/config/opencode`, { recursive: true });
await mkdir(`${isolated}/home`, { recursive: true });
// Outside this checkout: the SDK refuses a state directory inside the repository it scans.
const project = await realpath(await mkdtemp(join(tmpdir(), 'opencode-security-host-')));
await mkdir(`${project}/src`, { recursive: true });
await writeFile(`${project}/src/example.js`, '// Synthetic preview target.\n');
await writeFile(configPath, JSON.stringify({ plugins: [{ package: packageRoot }] }));
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
  const gui = await client.plugin.gui({ location, id: 'gill.security' });
  assert.ok(gui.data.code.includes('Security'));
  console.log('Actual OpenCode GUI bundle endpoint:', Object.keys(gui.data).join(', '));
  console.log('HOST INTEGRATION PASSED (no model calls)');
} finally {
  child.kill('SIGTERM');
  const timeout = setTimeout(() => child.kill('SIGKILL'), 3000);
  await new Promise((resolve) => child.once('exit', resolve));
  clearTimeout(timeout);
  await rm(project, { recursive: true, force: true });
}
