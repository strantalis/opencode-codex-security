import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const consumers = async () => {
  try {
    return (await readdir(new URL('../.runtime/', import.meta.url)))
      .filter((name) => name.startsWith('packed-host-'))
      .sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
};

test('packed-host test removes its disposable consumer when arguments fail', async () => {
  const before = await consumers();
  const result = spawnSync(process.execPath, ['scripts/packed-host-test.mjs', '--archive'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Provide the tarball path after --archive/);
  assert.deepEqual(await consumers(), before);
});
