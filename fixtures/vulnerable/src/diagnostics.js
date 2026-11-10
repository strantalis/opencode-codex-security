// Synthetic, intentionally vulnerable example. Never execute or deploy.
import { exec } from 'node:child_process';
export function ping(req) {
  exec('ping -c 1 ' + req.query.host);
}
