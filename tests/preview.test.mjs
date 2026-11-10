import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'node:http';
import { startPreview } from '../scripts/preview-server.mjs';

test('loopback preview serves files, streams state, runs fixture, rejects cross-origin mutations', async () => {
  const app = await startPreview({ port: 0, delayMs: 0 });
  try {
    const initial = await fetch(app.url + '/api/state').then((r) => r.json());
    assert.equal(initial.status, 'idle');
    const page = await fetch(app.url);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal((await fetch(app.url + '/../../package.json')).status, 404);
    assert.equal((await fetch(app.url + '/api/scan', { method: 'POST' })).status, 403);
    assert.equal(
      (
        await fetch(app.url + '/api/scan', {
          method: 'POST',
          headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
        })
      ).status,
      403,
    );
    assert.equal(
      await new Promise((resolve, reject) => {
        get(app.url + '/api/state', { headers: { host: 'evil.example' } }, (response) => {
          response.resume();
          resolve(response.statusCode);
        }).on('error', reject);
      }),
      403,
    );
    const controller = new AbortController();
    const stream = await fetch(app.url + '/api/events', { signal: controller.signal });
    assert.match(
      new TextDecoder().decode((await stream.body.getReader().read()).value),
      /event: state/,
    );
    controller.abort();
    const start = await fetch(app.url + '/api/scan', {
      method: 'POST',
      headers: { origin: app.url, 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(start.status, 202);
    assert.equal((await app.service.wait()).findings.length, 4);
    assert.equal((await fetch(app.url + '/api/state').then((r) => r.json())).status, 'completed');
  } finally {
    await app.close();
  }
});

test('preview failures return a generic response without internal error details', async () => {
  const app = await startPreview({ port: 0, delayMs: 0 });
  const getState = app.service.getState;
  try {
    for (const failure of [
      new Error('Cannot read /private/synthetic/credentials.json: synthetic-private-detail'),
      'synthetic-private-string-failure',
    ]) {
      app.service.getState = () => {
        throw failure;
      };
      const response = await fetch(app.url + '/api/state');
      assert.equal(response.status, 500);
      assert.match(response.headers.get('content-type'), /application\/json/);
      assert.deepEqual(await response.json(), { error: 'Preview request failed' });
    }
  } finally {
    app.service.getState = getState;
    await app.close();
  }
});
