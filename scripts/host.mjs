import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { OpenCode } from '@opencode/client';

export const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');

/**
 * Start a real OpenCode server with its own home, config and state under `.runtime/`.
 * `config` is the OpenCode config (the plugin entry); `settings` is `codex-security.json`.
 */
export async function startHost({ port, config, settings, cwd = root }) {
  await mkdir(`${root}/.runtime`, { recursive: true });
  const isolated = await mkdtemp(`${root}/.runtime/host-`);
  const configPath = `${isolated}/config/opencode/opencode.json`;
  await mkdir(`${isolated}/config/opencode`, { recursive: true });
  await mkdir(`${isolated}/home`, { recursive: true });
  await writeFile(configPath, JSON.stringify(config));
  if (settings)
    await writeFile(`${isolated}/config/opencode/codex-security.json`, JSON.stringify(settings));
  const env = {
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
    ['serve', '--hostname', '127.0.0.1', '--port', String(port), '--print-logs'],
    { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '',
    stderr = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (stderr += d));
  const stop = async () => {
    child.kill('SIGTERM');
    const timeout = setTimeout(() => child.kill('SIGKILL'), 3000);
    await new Promise((resolve) => child.once('exit', resolve));
    clearTimeout(timeout);
  };
  try {
    for (let i = 0; i < 100 && !/server password ([^\s]+)/.test(output); i++) {
      if (child.exitCode !== null) throw new Error('OpenCode exited before ready: ' + stderr);
      await sleep(100);
    }
    const password = output.match(/server password ([^\s]+)/)?.[1];
    if (!password) throw new Error('OpenCode did not report ready within 10 seconds');
    const client = OpenCode.make({
      baseUrl: `http://127.0.0.1:${port}`,
      headers: { Authorization: `Basic ${Buffer.from('opencode:' + password).toString('base64')}` },
    });
    /** Open a workspace and wait for the Security plugin to register there. */
    const open = async (directory) => {
      const location = { directory };
      await client.location.get({ location });
      for (let i = 0; i < 50; i++) {
        const plugins = await client.plugin.list({ location });
        if (plugins.data.some((p) => p.id === 'opencode-codex-security')) return location;
        await sleep(100);
      }
      throw new Error(`Security plugin did not register.\n${stderr}`);
    };
    return { client, env, isolated, open, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
