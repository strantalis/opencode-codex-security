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
    await copyFile(
      new URL('../scripts/packed-host-test.mjs', import.meta.url),
      join(root, 'scripts/packed-host-test.mjs'),
    );
    const result = spawnSync(process.execPath, ['scripts/packed-host-test.mjs', '--archive'], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Provide the tarball path after --archive/);
    assert.deepEqual(await readdir(join(root, '.runtime')), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
