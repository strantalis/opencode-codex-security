import assert from 'node:assert/strict';
import test from 'node:test';
import { compareAdvisories, parseLockedNpmVersions } from '../src/core/dependency-advisory.ts';

const cve = 'CVE-2099-0001';
const advisory = (name, range, extras) => [
  {
    cve_id: cve,
    ghsa_id: 'GHSA-abcd-1234-efgh',
    vulnerabilities: [{ package: { ecosystem: 'npm', name }, vulnerable_version_range: range }],
    ...extras,
  },
];

test('npm lockfile uses actual alias package names and retains multiple installed versions', () => {
  const lock = parseLockedNpmVersions(
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': { name: 'root', version: '1.0.0' },
        'node_modules/alias': { name: '@example/library', version: '1.1.0' },
        'node_modules/other/node_modules/@example/library': { version: '2.0.0' },
      },
    }),
    'package-lock.json',
  );
  assert.deepEqual([...lock.versions.keys()], ['@example/library']);
  assert.deepEqual([...lock.versions.get('@example/library')], ['1.1.0', '2.0.0']);
  assert.deepEqual(
    compareAdvisories(cve, lock, advisory('@example/library', '>=1.0.0, <2.0.0')).matches,
    [{ package: '@example/library', version: '1.1.0' }],
  );
  assert.equal(
    compareAdvisories(cve, lock, advisory('@example/library', '<1.0.0')).result,
    'no_match_in_lockfile',
  );
});

test('Bun lockfile accepts comments and preserves uncertainty on incomplete inputs', () => {
  const lock = parseLockedNpmVersions(
    `{
    // Bun permits trailing commas
    "lockfileVersion": 1,
    "packages": {
      "demo": ["demo@1.0.0-beta.1", ""],
      "workspace": ["workspace@workspace:packages/workspace"],
    },
  }`,
    'bun.lock',
  );
  assert.equal(lock.skipped, 1);
  assert.equal(compareAdvisories(cve, lock, []).result, 'inconclusive');
  assert.equal(compareAdvisories(cve, lock, advisory('demo', '<1.0.0')).result, 'inconclusive');
  assert.equal(compareAdvisories(cve, lock, advisory('demo', 'not a range')).unsupportedRanges, 1);
  assert.equal(
    compareAdvisories(cve, lock, advisory('demo', '*', { withdrawn_at: 'date' })).comparedRanges,
    0,
  );
  assert.throws(
    () => parseLockedNpmVersions('{"lockfileVersion":1,"packages":{}}', 'package-lock.json'),
    /versions 2 and 3/,
  );
});
