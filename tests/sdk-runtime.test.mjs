import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);

test('SDK and native local helpers work on the selected Node runtime without inference', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'security-runtime-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repository = join(root, 'source');
  const stateDirectory = join(root, 'state');
  await mkdir(repository);
  await writeFile(join(repository, 'example.txt'), 'Synthetic runtime test only.\n');
  const { createSecurity, estimateScanCost } = await import('@openai/codex-security');
  assert.equal(typeof createSecurity, 'function');
  assert.equal(
    estimateScanCost('gpt-daybreak-blue-latest', { input_tokens: 1, output_tokens: 0 }),
    null,
  );
  // Resolve the official helper from the SDK package instead of a system install.
  const entry = fileURLToPath(import.meta.resolve('@openai/codex-security'));
  const helper = join(dirname(dirname(entry)), '_bundled_plugin', 'mcp', 'helpers.mjs');
  const environment = { PATH: process.env.PATH, HOME: root, TMPDIR: root };
  const options = { env: environment, timeout: 30_000 };
  const inventory = join(root, 'files.json');
  await execute(
    process.execPath,
    [helper, 'generate-in-scope-files', '--repo', repository, '--out', inventory, '--scope', '.'],
    options,
  );
  assert.match(await readFile(inventory, 'utf8'), /example\.txt/);
  // These helpers read JSON from stdin; execute them directly, without a shell.
  const runJson = (command, input) =>
    new Promise((resolve, reject) => {
      const child = execFile(process.execPath, [helper, command], options, (error, stdout) => {
        if (error) reject(error);
        else {
          try {
            resolve(JSON.parse(stdout));
          } catch (parseError) {
            reject(parseError);
          }
        }
      });
      child.stdin.end(JSON.stringify(input));
    });
  const database = await runJson('database-info', stateDirectory);
  assert.equal(database.databasePath, join(stateDirectory, 'workbench.sqlite3'));
  const findings = await runJson('list-stored-findings', {
    stateDirectory,
    payload: { limit: 10, offset: 0 },
  });
  assert.deepEqual(findings.findings, []);
  assert.equal(findings.total, 0);
});
