import { fileURLToPath } from 'node:url';
import { ScanService } from '../src/core/scan-service.mjs';
const root = fileURLToPath(new URL('../fixtures/vulnerable', import.meta.url));
const service = new ScanService(root, { delayMs: 300 });
console.log(
  '\nCODEX SECURITY / OPENCODE V2 — LOCAL PROTOTYPE\nPattern engine only. No Codex Security backend or model calls.\n',
);
let last = '';
service.subscribe((s) => {
  const msg = s.events.at(-1)?.message;
  if (msg && msg !== last) {
    console.log(`[${s.status}] ${msg}`);
    last = msg;
  }
});
process.on('SIGINT', () => service.cancel());
service.start();
const result = await service.wait();
for (const f of result.findings)
  console.log(
    `\n${f.severity.toUpperCase()}  ${f.title}\n${f.path}:${f.line} · ${f.cwe}\n  ${f.evidence}\n  Next: ${f.remediation}`,
  );
console.log(
  `\n${result.status}: ${result.progress.done}/${result.progress.total} files. Read-only.\n`,
);
await service.dispose();
process.exitCode = result.status === 'error' ? 1 : 0;
