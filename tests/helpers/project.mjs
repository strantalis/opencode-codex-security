import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { codexHome, configHome } from './isolated-codex.mjs';

/** A throwaway repository with one source file and one document. */
export async function project(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'security-project-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'services', 'api'), { recursive: true });
  await writeFile(join(root, 'src', 'app.js'), 'export const ok = true;\n');
  await writeFile(join(root, 'ARCHITECTURE.md'), '# Architecture\n');
  return root;
}
/** Write the plugin settings file and the user's Codex config for one test. */
export async function configure(t, { plugin, codex } = {}) {
  const files = [
    [join(configHome, 'opencode'), 'codex-security.json', plugin && JSON.stringify(plugin)],
    [codexHome, 'config.toml', codex],
  ];
  for (const [directory, name, content] of files) {
    if (content === undefined) continue;
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, name), content);
  }
  t.after(() => Promise.all(files.map(([d, n]) => rm(join(d, n), { force: true }))));
}
/** A fake plugin host: collects tools, skills, RPC handlers, permission requests and session input. */
export function host(directory, { allow = () => true } = {}) {
  const tools = [],
    skills = [],
    permissions = [],
    synthetic = [];
  const context = {
    signal: new AbortController().signal,
    sessionID: 'session',
    agent: 'agent',
    messageID: 'message',
    id: 'call',
  };
  const ctx = {
    options: {},
    location: { directory },
    permission: {
      assert: async (request) => {
        permissions.push(request);
        if (!allow(request)) throw new Error('Denied');
      },
    },
    rpc: {
      register: async (_definition, handlers) => {
        ctx.handlers = handlers;
        return { events: { emit: async () => {} }, dispose: async () => {} };
      },
    },
    tool: {
      transform: async (register) => {
        register({ add: (tool) => tools.push(tool) });
        return { dispose: async () => {} };
      },
    },
    skill: {
      transform: async (register) => {
        const added = [];
        register({ add: (skill) => added.push(skill) && skills.push(skill) });
        return {
          dispose: async () => {
            for (const skill of added) skills.splice(skills.indexOf(skill), 1);
          },
        };
      },
    },
    session: {
      synthetic: async (input) => {
        synthetic.push(input);
        return { id: `msg_${synthetic.length}`, type: 'synthetic' };
      },
    },
  };
  const call = async (name, input = {}) => {
    const { content } = await tools.find((tool) => tool.name === name).execute(input, context);
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  };
  return { ctx, tools, skills, permissions, synthetic, call };
}
export const tick = () => new Promise((resolve) => setImmediate(resolve));
