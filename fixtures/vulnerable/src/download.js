// Synthetic, intentionally vulnerable example. Never execute or deploy.
import { readFile } from 'node:fs/promises';
export function download(req) {
  return readFile('/srv/reports/' + req.query.file);
}
