import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ScanService } from '../src/core/scan-service.mjs';
import { collectFiles, scanFile } from '../src/core/scanner.mjs';
const fixture = (name) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

test('synthetic fixture reports exact seeded candidates and streams progress', async () => {
  const service = new ScanService(fixture('vulnerable'));
  const states = [];
  service.subscribe((s) => states.push(s));
  service.start();
  const state = await service.wait();
  assert.equal(state.status, 'completed');
  assert.deepEqual(state.progress, { done: 4, total: 4 });
  assert.equal(state.findings.length, 4);
  assert.deepEqual(state.findings.map((f) => f.cwe).sort(), [
    'CWE-22',
    'CWE-78',
    'CWE-79',
    'CWE-89',
  ]);
  assert.ok(state.findings.every((f) => f.line >= 3 && f.path.startsWith('src/')));
  assert.ok(states.some((s) => s.status === 'running' && s.progress.done > 0));
  assert.ok(states.every((s, i) => !i || s.revision > states[i - 1].revision));
  const snapshot = service.getState();
  snapshot.findings.length = 0;
  assert.equal(service.getState().findings.length, 4);
  await service.dispose();
});

test('parameterized control produces no pattern candidates without security clearance claim', async () => {
  const service = new ScanService(fixture('clean'));
  service.start();
  const state = await service.wait();
  assert.equal(state.findings.length, 0);
  assert.match(state.events.at(-1).message, /Not a security clearance/);
  await service.dispose();
});

test('repeated start is idempotent; cancel retains partial results; restart clears them', async () => {
  const service = new ScanService(fixture('vulnerable'), { delayMs: 20 });
  const first = service.start();
  assert.equal(service.start().scanId, first.scanId);
  await new Promise((resolve) => {
    const stop = service.subscribe((s) => {
      if (s.progress.done === 1) {
        stop();
        service.cancel();
        resolve();
      }
    });
  });
  const cancelled = await service.wait();
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.findings.length, 1);
  const second = service.start();
  assert.notEqual(second.scanId, first.scanId);
  assert.equal(second.findings.length, 0);
  assert.equal((await service.wait()).findings.length, 4);
  await service.dispose();
});

test('bad directory becomes an explicit failed scan and listeners cannot crash scanning', async () => {
  const service = new ScanService('/definitely-missing-fixture-path');
  service.subscribe(() => {
    throw new Error('view failed');
  });
  service.start();
  assert.equal((await service.wait()).status, 'error');
  await service.dispose();
  assert.throws(() => service.start(), /closed/);
});

test('hidden files, dependency directories, unsupported files and symlinks are excluded', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'security-test-')));
  try {
    await mkdir(join(root, 'node_modules'));
    await mkdir(join(root, '.private'));
    const code = `exec('ping ' + req.query.host);`;
    for (const name of [
      'visible.js',
      '.secret.js',
      'token.env',
      'node_modules/bad.js',
      '.private/key.js',
    ])
      await writeFile(join(root, name), code);
    await symlink(join(root, 'visible.js'), join(root, 'link.js'));
    const { files } = await collectFiles(root);
    assert.deepEqual(files, [join(root, 'visible.js')]);
    await assert.rejects(collectFiles(root, undefined, { maxFiles: 0 }), /file limit/);
    await assert.rejects(collectFiles(root, undefined, { maxEntries: 1 }), /entry limit/);
    await writeFile(join(root, 'big.js'), 'x'.repeat(256 * 1024 + 1));
    assert.equal((await scanFile(root, join(root, 'big.js'))).skipped, true);
    await writeFile(join(root, 'binary.js'), '\0' + code);
    assert.equal((await scanFile(root, join(root, 'binary.js'))).skipped, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('out-of-root and replaced leaf symlink reads are rejected', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'security-root-')));
  const other = await realpath(await mkdtemp(join(tmpdir(), 'security-other-')));
  try {
    await writeFile(join(other, 'out.js'), '');
    await symlink(join(other, 'out.js'), join(root, 'link.js'));
    await assert.rejects(scanFile(root, join(root, 'link.js')), /escaped/);
    await writeFile(join(root, 'in.js'), '');
    await symlink(join(root, 'in.js'), join(root, 'leaf.js'));
    await assert.rejects(scanFile(root, join(root, 'leaf.js')), /ELOOP/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(other, { recursive: true, force: true });
  }
});
