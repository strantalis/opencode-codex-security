import './helpers/isolated-codex.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, realpath, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { prepareScan, validatePlan } from '../src/core/scan-plan.ts';
import { PlannedScanService } from '../src/core/planned-scan.ts';
import { createSecurityPlugin } from '../src/plugin.ts';
async function project(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'scan-plan-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src/app.js'), '// synthetic only');
  await writeFile(join(root, 'ARCHITECTURE.md'), 'Synthetic architecture context.');
  return root;
}
async function globalConfig(t, value = {}) {
  const directory = await project(t);
  const old = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = directory;
  t.after(() => {
    if (old === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = old;
  });
  await mkdir(join(directory, 'opencode'));
  const path = join(directory, 'opencode/codex-security.json');
  await writeFile(path, JSON.stringify(value));
  return path;
}
const fakeResult = { findings: { scanId: 'mock', findings: [] } };
test('session inputs stay explicit; project config is ignored; global SDK defaults apply', async (t) => {
  const root = await project(t);
  await writeFile(
    join(root, '.opencode-security.json'),
    JSON.stringify({
      scopePaths: ['src'],
      scanPrompt: 'Check tenant boundaries.',
      contextFiles: ['ARCHITECTURE.md'],
    }),
  );
  await globalConfig(t, {
    codex: { daybreak: true, model: 'gpt-6.1-sol', reasoningEffort: 'high' },
    scan: { maxCostUsd: 2 },
  });
  const blank = await prepareScan(root, {});
  assert.deepEqual(blank.scopePaths, []);
  assert.equal(blank.scanPrompt, '');
  assert.equal(blank.settings.codex.daybreak, true);
  assert.equal(blank.settings.scan.maxCostUsd, 2);
  const plan = await prepareScan(root, {
    scopePaths: ['src'],
    scanPrompt: 'Check tenant boundaries.',
    contextFiles: ['ARCHITECTURE.md'],
  });
  assert.equal(plan.repository, root);
  assert.deepEqual(plan.scopePaths, ['src']);
  assert.equal(plan.scanPrompt, 'Check tenant boundaries.');
  assert.equal(plan.contextFiles[0].bytes, 31);
  const other = await project(t);
  const override = await prepareScan(root, {
    repository: other,
    scopePaths: [],
    scanPrompt: '',
    contextFiles: [],
  });
  assert.equal(override.repository, other);
  assert.deepEqual(override.scopePaths, []);
  assert.equal(override.scanPrompt, '');
  assert.deepEqual(override.contextFiles, []);
  await validatePlan(plan);
});
test('reject invalid config, credential paths, traversal, symlinks outside root, and oversized/binary context', async (t) => {
  const root = await project(t),
    other = await project(t);
  await symlink(other, join(root, 'escape'));
  for (const input of [
    { scopePaths: ['../'] },
    { scopePaths: ['/tmp'] },
    { scopePaths: ['src/*'] },
    { scopePaths: ['escape'] },
    { contextFiles: ['escape/ARCHITECTURE.md'] },
    { contextFiles: ['.env'] },
    { approveOpenAIInference: true },
  ])
    await assert.rejects(prepareScan(root, input));
  await writeFile(join(root, 'huge.md'), 'x'.repeat(65537));
  await assert.rejects(prepareScan(root, { contextFiles: ['huge.md'] }), /64 KiB/);
  await writeFile(join(root, 'binary.md'), 'a\0b');
  await assert.rejects(prepareScan(root, { contextFiles: ['binary.md'] }), /text/);
  const settings = await globalConfig(t, { codex: { daybreak: 'yes' } });
  await assert.rejects(prepareScan(root), /daybreak/);
  await writeFile(settings, '{"auth":"api-key"}');
  await assert.rejects(prepareScan(root), /only codex/);
});
test('changed context/config and expired previews fail before SDK creation', async (t) => {
  const root = await project(t);
  const settings = await globalConfig(t);
  let created = 0;
  const service = new PlannedScanService(root, {
    createClient() {
      created++;
      return { run: async () => fakeResult, close: async () => {} };
    },
  });
  t.after(() => service.dispose());
  let state = await service.prepare({ contextFiles: ['ARCHITECTURE.md'] });
  await assert.rejects(service.start({ approveOpenAIInference: true, planId: 'wrong' }), /exact/);
  await writeFile(join(root, 'ARCHITECTURE.md'), 'Changed context');
  await assert.rejects(
    service.start({ approveOpenAIInference: true, planId: state.plan.id }),
    /changed/,
  );
  state = await service.prepare({});
  await writeFile(settings, '{"codex":{"daybreak":true}}');
  await assert.rejects(
    service.start({ approveOpenAIInference: true, planId: state.plan.id }),
    /changed/,
  );
  assert.equal(created, 0);
  const plan = await prepareScan(root);
  plan.expiresAt = '2000-01-01';
  await assert.rejects(validatePlan(plan), /expired/);
});
test('exact approved inputs reach mocked SDK once; repeated runs require fresh preview and consent', async (t) => {
  const root = await project(t);
  let captured,
    calls = 0;
  const service = new PlannedScanService(root, {
    createClient: () => ({
      run: async (repo, opts) => {
        calls++;
        captured = { repo, opts };
        return fakeResult;
      },
      close: async () => {},
    }),
    mock: true,
  });
  t.after(() => service.dispose());
  const state = await service.prepare({
    scopePaths: ['src'],
    scanPrompt: 'Check authz only.',
    contextFiles: ['ARCHITECTURE.md'],
  });
  await assert.rejects(service.start({ planId: state.plan.id }), /approve/);
  assert.equal(calls, 0);
  await service.start({ planId: state.plan.id, approveOpenAIInference: true });
  const result = await service.wait();
  assert.equal(result.status, 'completed');
  assert.equal(captured.repo, root);
  assert.deepEqual(captured.opts.target, ['src']);
  assert.equal(captured.opts.scanPrompt, 'Check authz only.');
  assert.deepEqual(captured.opts.knowledgeBasePaths, [join(root, 'ARCHITECTURE.md')]);
  assert.equal(captured.opts.auth, 'chatgpt');
  assert.equal(captured.opts.maxCostUsd, undefined);
  await assert.rejects(
    service.start({ planId: state.plan.id, approveOpenAIInference: true }),
    /already used/,
  );
  assert.equal(calls, 1);
});
test('model-callable tool prepares a preview but cannot start a scan or supply approval', async (t) => {
  const root = await project(t);
  let rpc,
    calls = 0;
  const tools = [];
  const plugin = createSecurityPlugin({
    createClient: () => ({
      run: async () => {
        calls++;
        return fakeResult;
      },
      close: async () => {},
    }),
  });
  const cleanup = await plugin.setup({
    options: { engine: 'codex' },
    location: { directory: root },
    rpc: {
      register: async (def, handlers) => {
        rpc = handlers;
        return { events: { emit: async () => {} }, dispose: async () => {} };
      },
    },
    tool: {
      transform: async (cb) => {
        cb({ add: (value) => tools.push(value) });
        return { dispose: async () => {} };
      },
    },
  });
  t.after(cleanup);
  const tool = tools.find((t) => t.name === 'security_prepare_scan');
  assert.equal(tool.name, 'security_prepare_scan');
  assert.equal(tool.input.additionalProperties, false);
  const response = await tool.execute({ scanPrompt: 'Only synthetic context.' }, {});
  assert.match(response.content, /Prepared, not executed/);
  assert.match(response.content, /MOCK SDK TEST/);
  assert.equal(calls, 0);
  await assert.rejects(tool.execute({ approveOpenAIInference: true }, {}), /Unsupported/);
  const state = await rpc.status({});
  assert.equal(state.status, 'idle');
  assert.equal(state.plan.repository, root);
  await assert.rejects(rpc.start({ approveOpenAIInference: true }), /exact/);
  assert.equal(calls, 0);
});

test('global SDK defaults reach constructor and run options; zero subagents is valid', async (t) => {
  const root = await project(t);
  await globalConfig(t, {
    codex: { model: 'gpt-6.1-sol', reasoningEffort: 'high', daybreak: true },
    scan: {
      mode: 'deep',
      cyberAccessProgram: 'daybreak_blue',
      maxCostUsd: 2,
      maxTimeMinutes: 5,
      workers: 2,
      subagents: 0,
    },
  });
  let config, options;
  const service = new PlannedScanService(root, {
    createClient: (value) => {
      config = value;
      return {
        run: async (repo, opts) => {
          options = opts;
          return fakeResult;
        },
        close: async () => {},
      };
    },
  });
  t.after(() => service.dispose());
  const state = await service.prepare({});
  await service.start({ planId: state.plan.id, approveOpenAIInference: true });
  await service.wait();
  assert.deepEqual(config.codexOverrides, {
    model_provider: 'openai',
    model: 'gpt-6.1-sol',
    model_reasoning_effort: 'high',
    daybreak: true,
  });
  for (const [key, val] of Object.entries({
    mode: 'deep',
    cyberAccessProgram: 'daybreak_blue',
    maxCostUsd: 2,
    maxTimeMinutes: 5,
    workers: 2,
    subagents: 0,
  }))
    assert.equal(options[key], val);
});
test('run tool honors host authorization, including a saved allow, and does not bypass denial', async (t) => {
  const root = await project(t),
    tools = [];
  let denied = true,
    checks = 0,
    calls = 0;
  const plugin = createSecurityPlugin({
    createClient: () => ({
      run: async () => {
        calls++;
        return fakeResult;
      },
      close: async () => {},
    }),
  });
  const cleanup = await plugin.setup({
    options: { engine: 'codex' },
    location: { directory: root },
    permission: {
      assert: async (info) => {
        checks++;
        assert.equal(info.action, 'codex_security_scan');
        assert.match(info.metadata.preview, /Repository:/);
        if (denied) throw new Error('Denied by host');
      },
    },
    rpc: { register: async () => ({ events: { emit: async () => {} }, dispose: async () => {} }) },
    tool: {
      transform: async (cb) => {
        cb({ add: (tool) => tools.push(tool) });
        return { dispose: async () => {} };
      },
    },
  });
  t.after(cleanup);
  const prepared = await tools[0].execute({}, {});
  const planId = prepared.content.match(/Preview ID: (.+)/)[1];
  const context = {
    signal: new AbortController().signal,
    sessionID: 'test',
    agent: 'test',
    messageID: 'test',
    id: 'test',
  };
  await assert.rejects(tools[1].execute({ planId }, context), /Denied/);
  assert.equal(calls, 0);
  denied = false;
  await tools[1].execute({ planId }, context);
  assert.equal(checks, 2);
  assert.equal(calls, 1);
});

test('per-scan mode overrides global in both directions and reaches SDK; omission restores global', async (t) => {
  const root = await project(t);
  const settings = await globalConfig(t, { scan: { mode: 'standard', maxCostUsd: 1 } });
  let options;
  const service = new PlannedScanService(root, {
    createClient: () => ({
      run: async (repo, opts) => {
        options = opts;
        return fakeResult;
      },
      close: async () => {},
    }),
  });
  t.after(() => service.dispose());
  let state = await service.prepare({ mode: 'deep' });
  assert.equal(state.plan.settings.scan.mode, 'deep');
  assert.equal(state.plan.inputs.mode, 'deep');
  await service.start({ planId: state.plan.id, approveOpenAIInference: true });
  await service.wait();
  assert.equal(options.mode, 'deep');
  state = await service.prepare({});
  assert.equal(state.plan.settings.scan.mode, 'standard');
  assert.equal('mode' in state.plan.inputs, false);
  await writeFile(settings, JSON.stringify({ scan: { mode: 'deep' } }));
  state = await service.prepare({ mode: 'standard' });
  assert.equal(state.plan.settings.scan.mode, 'standard');
  await service.start({ planId: state.plan.id, approveOpenAIInference: true });
  await service.wait();
  assert.equal(options.mode, 'standard');
  state = await service.prepare({});
  assert.equal(state.plan.settings.scan.mode, 'deep');
  for (const mode of ['auto', 'fast', '', null, 1])
    await assert.rejects(service.prepare({ mode }), /mode/);
});
test('UI mode changes preserve target/context, global reset removes override, preview names resolved source', async (t) => {
  const { withScanMode, describePlan } = await import('../src/plan-view.ts');
  const root = await project(t);
  await globalConfig(t, { scan: { mode: 'standard' } });
  const input = {
    repository: root,
    scopePaths: ['src'],
    scanPrompt: 'Check boundaries.',
    contextFiles: ['ARCHITECTURE.md'],
  };
  const deep = withScanMode(input, 'deep');
  assert.deepEqual(deep, { ...input, mode: 'deep' });
  const plan = await prepareScan(root, deep);
  assert.match(describePlan(plan), /mode deep \(per-scan choice\)/);
  const reset = withScanMode(deep, 'default');
  assert.deepEqual(reset, input);
  assert.match(describePlan(await prepareScan(root, reset)), /mode standard \(global default\)/);
});

test('home, ancestor and symlink targets fail closed; explicit project selection works without inference', async (t) => {
  const root = await project(t);
  let created = 0;
  const home = await realpath(homedir());
  const service = new PlannedScanService(home, {
    createClient: () => {
      created++;
      return { run: async () => fakeResult, close: async () => {} };
    },
  });
  t.after(() => service.dispose());
  for (const input of [{}, { repository: home }, { repository: '/' }, { repository: '.' }])
    await assert.rejects(service.prepare(input), /specific project repository/);
  await symlink(home, join(root, 'home-link'));
  await assert.rejects(
    prepareScan(root, { repository: 'home-link' }),
    /specific project repository/,
  );
  const state = await service.prepare({ repository: root });
  assert.equal(state.repository, root);
  assert.equal(state.status, 'idle');
  assert.equal(created, 0);
  await assert.rejects(service.start({ planId: state.plan.id }), /approve/);
  assert.equal(created, 0);
});
test('Desktop targets the local mounted session, never remote or missing location, and follows project changes', async () => {
  const { localProjectDirectory } = await import('../src/plan-view.ts');
  const session = {
    server: { id: 'sidecar' },
    directory: '/projects/one',
    location: { directory: '/projects/one' },
  };
  assert.equal(localProjectDirectory(session), '/projects/one');
  assert.equal(
    localProjectDirectory({
      ...session,
      directory: '/projects/two',
      location: { directory: '/projects/two' },
    }),
    '/projects/two',
  );
  assert.equal(localProjectDirectory({ ...session, location: undefined }), undefined);
  assert.equal(localProjectDirectory({ ...session, location: { directory: '/wrong' } }), undefined);
  assert.equal(
    localProjectDirectory({ ...session, server: { id: 'https://remote.example' } }),
    undefined,
  );
});

test('unknown or relative session locations cannot silently use process cwd', async (t) => {
  const root = await project(t);
  await globalConfig(t);
  for (const current of ['', 'relative-session']) {
    for (const input of [{}, { repository: 'src' }])
      await assert.rejects(prepareScan(current, input), /No local project/);
    assert.equal((await prepareScan(current, { repository: root })).repository, root);
    const service = new PlannedScanService(current, { mock: true });
    t.after(() => service.dispose());
    await assert.rejects(service.prepare({}), /No local project/);
    assert.equal((await service.prepare({ repository: root })).repository, root);
  }
});

test('automatic preview selection never revives an older repository draft', async () => {
  const { latestAvailableDraft, localProjectDirectory } = await import('../src/plan-view.ts');
  const older = {
    plan: { id: 'old', repository: '/projects/old', expiresAt: new Date(2000).toISOString() },
  };
  const latest = {
    plan: { id: 'latest', repository: '/projects/new', expiresAt: new Date(2000).toISOString() },
  };
  const drafts = [older, latest];
  assert.equal(latestAvailableDraft({ drafts, preview: latest }, 1000), latest);
  assert.equal(latestAvailableDraft({ drafts }, 1000), undefined);
  assert.equal(
    latestAvailableDraft({ drafts, preview: { ...latest, planConsumed: true } }, 1000),
    undefined,
  );
  assert.equal(latestAvailableDraft({ drafts, preview: latest }, 3000), undefined);
  assert.equal(latestAvailableDraft({ drafts, preview: latest }, 1000, 'old'), older);
  assert.equal(latestAvailableDraft({ drafts, preview: latest }, 1000, 'missing'), undefined);
  assert.equal(
    localProjectDirectory({
      server: { id: 'sidecar' },
      directory: 'relative',
      location: { directory: 'relative' },
    }),
    undefined,
  );
});
