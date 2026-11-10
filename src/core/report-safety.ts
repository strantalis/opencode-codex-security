import type { Finding } from '../types.ts';

/**
 * Bounded report text only. This is defense in depth for recognizable credentials,
 * not permission to expose raw sessions, reasoning, command output, or arbitrary files.
 */
export function safeReportText(value: unknown, max = 48_000): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(
      /-----BEGIN [^-]*(?:PRIVATE KEY|SECRET)[^-]*-----[\s\S]*?(?:-----END [^-]+-----|$)/g,
      '[REDACTED PRIVATE MATERIAL]',
    )
    .replace(
      /\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})\b/g,
      '[REDACTED CREDENTIAL]',
    )
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]{12,}=*/gi, '$1[REDACTED]')
    .replace(
      /((?:["']?)(?:password|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)(?:["']?)\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}]+)/gi,
      '$1[REDACTED]',
    )
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .slice(0, max);
}

/** Whitelist and sanitize every free-text finding field, including local code evidence. */
export function safeFinding(finding: Finding): Finding {
  return {
    id: safeReportText(finding.id, 512),
    title: safeReportText(finding.title, 1000),
    severity: finding.severity,
    path: safeReportText(finding.path, 4096),
    line: finding.line,
    cwe: safeReportText(finding.cwe, 512),
    summary: safeReportText(finding.summary, 16_000),
    evidence: safeReportText(finding.evidence, 24_000),
    remediation: safeReportText(finding.remediation, 16_000),
    confidence: safeReportText(finding.confidence, 128),
  };
}
