import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk } from '../src/core/sdk.ts';

test('the SDK helper loads even when the host reports an unresolvable main script', async () => {
  const invoked = process.argv[1];
  // What OpenCode's compiled binary reports: a path that cannot be resolved.
  process.argv[1] = '/$bunfs/root/opencode';
  try {
    const sdk = await loadSdk();
    assert.equal(typeof sdk.CodexSecurity, 'function');
    assert.equal(process.argv[1], '/$bunfs/root/opencode');
    assert.equal(await loadSdk(), sdk);
  } finally {
    process.argv[1] = invoked;
  }
});
