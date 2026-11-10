import type { ScanTelemetry } from './core/run-telemetry';
import type { ScanOutcomeSummary } from './core/result-summary';
import type { ScanPlan } from './core/scan-plan';
export interface Finding {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  path: string;
  line: number;
  cwe: string;
  summary: string;
  evidence: string;
  remediation: string;
  confidence: string;
}
export interface ScanState {
  telemetry?: ScanTelemetry;
  assessment?: ScanOutcomeSummary;
  runId?: string;
  mode?: 'standard' | 'deep';
  model?: string;
  estimatedCostUsd?: number;
  updatedAt?: string;
  archived?: boolean;
  workers?: { phase: string; planned: number; started: number };
  deepProgress?: { completed: number; active: number; maximum: number; consolidating?: boolean };
  plan?: ScanPlan;
  planConsumed?: boolean;
  instanceId: string;
  status: 'idle' | 'running' | 'completed' | 'cancelled' | 'error';
  scanId: string | null;
  phase: string;
  progress: { done: number; total: number; unit?: 'files' | 'reviews' };
  findings: Finding[];
  events: { time: string; message: string }[];
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  repository: string;
  engine: string;
  skipped: number;
  revision: number;
}
export function asState(value: unknown): ScanState {
  if (
    !value ||
    typeof value !== 'object' ||
    !('status' in value) ||
    !('findings' in value) ||
    !Array.isArray(value.findings)
  )
    throw new Error('Invalid security state');
  return value as ScanState;
}
export function emptyState(): ScanState {
  return {
    instanceId: '',
    status: 'idle',
    scanId: null,
    phase: 'Ready',
    progress: { done: 0, total: 0 },
    findings: [],
    events: [],
    error: null,
    startedAt: null,
    finishedAt: null,
    repository: 'vulnerable (synthetic fixture)',
    engine: 'local-patterns (prototype)',
    skipped: 0,
    revision: 0,
  };
}

export interface ScanList {
  engine: string;
  instanceId: string;
  revision: number;
  runs: ScanState[];
  drafts: ScanState[];
  preview?: ScanState;
  maxConcurrent: number;
  historyLimit: number;
  historyError?: string;
}
