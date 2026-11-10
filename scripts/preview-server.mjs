import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ScanService } from '../src/core/scan-service.mjs';

export async function startPreview({ port = 4173, delayMs = 350 } = {}) {
  const service = new ScanService(
    fileURLToPath(new URL('../fixtures/vulnerable', import.meta.url)),
    { delayMs },
  );
  const streams = new Set();
  const unsubscribe = service.subscribe((state) => {
    const message = `event: state\ndata: ${JSON.stringify(state)}\n\n`;
    for (const stream of streams) if (!stream.write(message)) stream.destroy();
  });
  const assets = new Map([
    ['/', ['index.html', 'text/html']],
    ['/app.js', ['app.js', 'text/javascript']],
    ['/styles.css', ['styles.css', 'text/css']],
  ]);
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    const authority = `127.0.0.1:${server.address().port}`;
    const json = (code, data) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    // Bound to loopback, reject DNS rebinding and cross-origin writes. No CORS.
    if (req.headers.host !== authority) {
      json(403, { error: 'Invalid host' });
      return;
    }
    const url = new URL(req.url, `http://${authority}`);
    if (
      req.method === 'POST' &&
      (req.headers.origin !== `http://${authority}` ||
        req.headers['content-type'] !== 'application/json')
    ) {
      json(403, { error: 'Same-origin JSON request required' });
      return;
    }
    try {
      if (url.pathname === '/api/state' && req.method === 'GET') {
        json(200, service.getState());
        return;
      }
      if (url.pathname === '/api/scan' && req.method === 'POST') {
        req.resume();
        json(202, service.start());
        return;
      }
      if (url.pathname === '/api/cancel' && req.method === 'POST') {
        req.resume();
        json(202, service.cancel());
        return;
      }
      if (url.pathname === '/api/events' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
        res.write(`event: state\ndata: ${JSON.stringify(service.getState())}\n\n`);
        streams.add(res);
        res.on('close', () => streams.delete(res));
        return;
      }
      if (req.method === 'GET' && assets.has(url.pathname)) {
        const [name, type] = assets.get(url.pathname);
        const body = await readFile(new URL(`../preview/${name}`, import.meta.url));
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
        res.end(body);
        return;
      }
      json(404, { error: 'Not found' });
    } catch (error) {
      json(500, { error: String(error.message ?? error) });
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    server,
    service,
    url: `http://127.0.0.1:${server.address().port}`,
    close: async () => {
      unsubscribe();
      for (const stream of streams) stream.end();
      await service.dispose();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = await startPreview();
  console.log(
    `Local synthetic security preview: ${app.url}\nNo provider calls. Ctrl+C stops the preview.`,
  );
  process.on('SIGINT', async () => {
    await app.close();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await app.close();
    process.exit(0);
  });
}
