import { open, opendir, realpath, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, relative, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';

const extensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);
const ignored = new Set(['node_modules', 'dist', 'build', 'coverage', 'vendor']);
export const rules = [
  {
    id: 'sql-concat',
    title: 'User input concatenated into SQL',
    severity: 'high',
    cwe: 'CWE-89',
    pattern:
      /\b(?:query|execute)\s*\(.*(?:SELECT|INSERT|UPDATE|DELETE).*\+\s*req\.(?:query|body|params)\./i,
    summary:
      'A request value is concatenated directly into a database query. This is a pattern match requiring review, not an exploit validation.',
    remediation:
      'Use a parameterized query and pass the request value as a separate parameter. Check authorization independently.',
  },
  {
    id: 'shell-concat',
    title: 'Request data reaches a shell command',
    severity: 'critical',
    cwe: 'CWE-78',
    pattern: /\bexec(?:Sync)?\s*\(.*\+\s*req\.(?:query|body|params)\./,
    summary:
      'A request value is appended to a shell command. Shell metacharacters may alter the command. Reachability and exploitability are not validated.',
    remediation:
      'Avoid the shell. Use execFile with a fixed executable and argument array, plus strict input validation.',
  },
  {
    id: 'html-concat',
    title: 'Unescaped input written into HTML',
    severity: 'medium',
    cwe: 'CWE-79',
    pattern: /\bres\.(?:send|write)\s*\(.*<[a-z].*\+\s*req\.(?:query|body|params)\./i,
    summary:
      'Request input is joined into an HTML response without visible escaping. This narrow pattern can miss sanitization elsewhere.',
    remediation:
      'Render through an auto-escaping template, or return structured JSON with the correct content type.',
  },
  {
    id: 'file-concat',
    title: 'Request data controls a file path',
    severity: 'high',
    cwe: 'CWE-22',
    pattern: /\b(?:readFile|readFileSync|createReadStream)\s*\(.*\+\s*req\.(?:query|body|params)\./,
    summary:
      'Request input is appended to a filesystem path. Parent-directory segments may escape the intended directory.',
    remediation:
      'Resolve paths under an allowlisted directory and verify containment after canonicalization, or use fixed file identifiers.',
  },
];

export async function collectFiles(root, signal, limits = {}) {
  const base = await realpath(root);
  if (!(await lstat(base)).isDirectory()) throw new Error('Scan target must be a directory');
  const result = [];
  let entries = 0;
  const maxFiles = limits.maxFiles ?? 2000;
  const maxEntries = limits.maxEntries ?? 20000;
  async function visit(dir, depth) {
    signal?.throwIfAborted();
    if (depth > 30) throw new Error('Directory depth exceeds prototype limit');
    const handle = await opendir(dir);
    for await (const entry of handle) {
      signal?.throwIfAborted();
      if (++entries > maxEntries) throw new Error('Repository exceeds prototype entry limit');
      if (entry.name.startsWith('.') || ignored.has(entry.name) || entry.isSymbolicLink()) continue;
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) await visit(path, depth + 1);
      else if (entry.isFile() && extensions.has(extname(entry.name))) {
        if (result.length >= maxFiles) throw new Error('Repository exceeds prototype file limit');
        result.push(path);
      }
    }
  }
  await visit(base, 0);
  return { base, files: result.sort() };
}

export async function scanFile(base, path, signal) {
  signal?.throwIfAborted();
  // Reject changed symlinks and containment escapes before opening. O_NOFOLLOW
  // protects the leaf; hostile concurrent directory mutation is not supported.
  const canonical = await realpath(path);
  const rel = relative(base, canonical);
  if (rel.startsWith('..' + sep) || rel === '..' || resolve(base, rel) !== canonical)
    throw new Error('File escaped scan root');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile()) return { findings: [], skipped: true };
    if (stat.size > 256 * 1024) return { findings: [], skipped: true };
    const bytes = Buffer.alloc(256 * 1024 + 1);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead > 256 * 1024) return { findings: [], skipped: true };
    const source = bytes.subarray(0, bytesRead).toString('utf8');
    if (source.includes('\0')) return { findings: [], skipped: true };
    const findings = [];
    for (const [index, line] of source.split(/\r?\n/).entries()) {
      signal?.throwIfAborted();
      if (/^\s*(?:\/\/|\*)/.test(line)) continue;
      for (const rule of rules)
        if (rule.pattern.test(line)) {
          findings.push({
            id: createHash('sha256')
              .update(`${rule.id}:${rel}:${index + 1}:${line.trim()}`)
              .digest('hex')
              .slice(0, 16),
            rule: rule.id,
            title: rule.title,
            severity: rule.severity,
            path: rel.split(sep).join('/'),
            line: index + 1,
            cwe: rule.cwe,
            summary: rule.summary,
            evidence: line.trim().slice(0, 500),
            remediation: rule.remediation,
            confidence: 'pattern match; unvalidated',
          });
        }
    }
    return { findings, skipped: false };
  } finally {
    await file.close();
  }
}
