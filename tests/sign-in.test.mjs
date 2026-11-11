import { codexHome } from './helpers/isolated-codex.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { configure, project } from './helpers/project.mjs';
import { SignIn } from '../src/core/sign-in.ts';
import { setupStatus } from '../src/core/status.ts';

const own = join(codexHome, 'state', 'plugins', 'codex-security', 'codex-home');
async function file(t, directory) {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'auth.json'), '{}');
  t.after(() => rm(join(directory, 'auth.json'), { force: true }));
}
function login() {
  let finish;
  const calls = [];
  const handle = (extra) => ({
    authUrl: 'https://auth.example.test/authorize',
    verificationUrl: 'https://auth.example.test/authorize',
    userCode: null,
    cancel: () => finish({ success: false }),
    wait: () => new Promise((resolve) => (finish = resolve)),
    ...extra,
  });
  return {
    calls,
    finish: (result) => finish(result),
    factory: (config) => ({
      loginChatGPT: async () => (calls.push(['browser', config]), handle()),
      loginChatGPTDeviceCode: async () => (
        calls.push(['device', config]),
        handle({
          verificationUrl: 'https://auth.example.test/device',
          authUrl: 'https://auth.example.test/device',
          userCode: 'ABCD-1234',
        })
      ),
      close: async () => calls.push(['close']),
    }),
  };
}
const turn = () => new Promise((resolve) => setImmediate(resolve));

test('sign-in state is read from files, without touching the SDK', async (t) => {
  const signIn = new SignIn(() => assert.fail('status must not create a client'));
  assert.deepEqual(await signIn.status(), { state: 'needed' });
  await file(t, codexHome);
  assert.deepEqual(await signIn.status(), { state: 'shared' });
  await file(t, own);
  assert.deepEqual(await signIn.status(), { state: 'signed-in' });
});

test('a browser sign-in is pending until the SDK reports the outcome', async (t) => {
  const fake = login();
  const signIn = new SignIn(fake.factory);
  const started = await signIn.start();
  assert.deepEqual(started.pending, { url: 'https://auth.example.test/authorize' });
  assert.equal(fake.calls[0][0], 'browser');
  assert.deepEqual(await signIn.start(), started, 'a second start reuses the open sign-in');
  await file(t, own);
  fake.finish({ success: true });
  await turn();
  assert.deepEqual(await signIn.status(), { state: 'signed-in' });
  assert.deepEqual(fake.calls.at(-1), ['close']);
});

test('a device code is shown, failures are reported, and cancel is quiet', async () => {
  const fake = login();
  const signIn = new SignIn(fake.factory);
  const device = await signIn.start({ device: true });
  assert.deepEqual(device.pending, { url: 'https://auth.example.test/device', code: 'ABCD-1234' });
  fake.finish({ success: false });
  await turn();
  assert.deepEqual(await signIn.status(), { state: 'needed', error: 'Sign-in did not complete.' });
  await signIn.start();
  assert.deepEqual(await signIn.cancel(), { state: 'needed' });
  await turn();
  assert.deepEqual(await signIn.status(), { state: 'needed' });
});

test('setup status mentions sign-in only on a route that signs in with ChatGPT', async (t) => {
  const root = await project(t);
  const signIn = new SignIn(() => assert.fail('status must not create a client'));
  assert.deepEqual((await setupStatus(root, signIn)).signIn, { state: 'needed' });
  process.env.GATEWAY_KEY = 'synthetic';
  t.after(() => delete process.env.GATEWAY_KEY);
  await configure(t, {
    codex:
      'model = "m"\nmodel_provider = "gateway"\n[model_providers.gateway]\nbase_url = "https://gateway.example.test/v1"\nenv_key = "GATEWAY_KEY"\n',
  });
  assert.equal('signIn' in (await setupStatus(root, signIn)), false);
});
