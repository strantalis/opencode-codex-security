import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('packed-host test removes its disposable consumer when arguments fail', async () => {
  // An isolated script root avoids races with other packed-host integration runs.
  const root = await mkdtemp(join(tmpdir(), 'packed-host-cleanup-test-'));
  try {
    await mkdir(join(root, 'scripts'));
    const temporaryRoot = join(root, 'temporary');
    await mkdir(temporaryRoot);
    await copyFile(
      new URL('../scripts/packed-host-test.mjs', import.meta.url),
      join(root, 'scripts/packed-host-test.mjs'),
    );
    const result = spawnSync(process.execPath, ['scripts/packed-host-test.mjs', '--archive'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: temporaryRoot },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Provide the tarball path after --archive/);
    assert.deepEqual(await readdir(join(root, '.runtime')), []);
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('packed-host test refuses a consumer that can inherit developer dependencies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'packed-host-ancestry-test-'));
  try {
    await mkdir(join(root, 'scripts'));
    await mkdir(join(root, 'node_modules'));
    const temporaryRoot = join(root, 'temporary');
    await mkdir(temporaryRoot);
    await copyFile(
      new URL('../scripts/packed-host-test.mjs', import.meta.url),
      join(root, 'scripts/packed-host-test.mjs'),
    );
    const result = spawnSync(process.execPath, ['scripts/packed-host-test.mjs', '--archive'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: temporaryRoot },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Choose a neutral TMPDIR without ancestor node_modules/);
    assert.deepEqual(await readdir(temporaryRoot), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
