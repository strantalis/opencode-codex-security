import { render } from 'solid-js/web';
import { SecurityPanel } from '../../src/security-panel';
import { emptyState } from '../../src/types';
const repository = '/Projects/atlas';
const settings = {
  codex: { model: 'gpt-5.6-sol', reasoningEffort: 'xhigh', daybreak: false },
  scan: { mode: 'standard', maxCostUsd: 1 },
};
let revision = 1,
  sequence = 10;
const plan = (id, inputs = {}) => ({
  id,
  repository,
  scopePaths: inputs.scopePaths ?? ['src/api'],
  scanPrompt: inputs.scanPrompt ?? 'Review authorization and tenant isolation',
  contextFiles: (inputs.contextFiles ?? []).map((path) => ({
    path,
    bytes: 100,
    sha256: 'fixture',
  })),
  expiresAt: new Date(Date.now() + 600000).toISOString(),
  mock: true,
  inputs,
  settings: { ...settings, scan: { ...settings.scan, mode: inputs.mode ?? 'standard' } },
  globalConfigFile: '~/.config/opencode/codex-security.json',
  globalConfigDigest: 'fixture',
});
const t = Date.now();
const run = (id, status, focus) => ({
  ...emptyState(),
  runId: id,
  scanId: 'sdk-' + id,
  instanceId: 'fixture-ui',
  revision,
  repository,
  engine: 'codex-security-sdk',
  status,
  mode: 'standard',
  model: settings.codex.model,
  phase: status === 'running' ? 'Reviewing source' : 'Scan complete',
  progress: { done: 18, total: 42, unit: 'files' },
  startedAt: new Date(t - 93000).toISOString(),
  finishedAt: status === 'running' ? null : new Date(t - 18000).toISOString(),
  plan: plan('p-' + id, { scanPrompt: focus }),
  events: [
    { time: new Date(t - 90000).toISOString(), message: 'Preparing repository for review.' },
    { time: new Date(t - 60000).toISOString(), message: 'Architecture review completed.' },
    { time: new Date(t - 5000).toISOString(), message: 'Reviewing selected source files.' },
  ],
  estimatedCostUsd: 0.24,
  workers: { phase: 'scanning', planned: 3, started: 2 },
  findings:
    status === 'completed'
      ? [
          {
            id: 'finding-1',
            title: 'Tenant ID is trusted before access is checked',
            severity: 'high',
            path: 'src/api/projects.ts',
            line: 47,
            cwe: 'CWE-862',
            summary:
              'The project handler uses a request tenant ID without checking that the signed-in user belongs to that tenant.',
            evidence: 'const project = await db.project.findUnique({ where: { id } });',
            remediation:
              'Check tenant membership before returning the project and cover cross-tenant requests with a regression test.',
            confidence: 'high',
          },
        ]
      : [],
});
const runs = new URLSearchParams(location.search).get('empty')
  ? []
  : [
      run('run-1', 'running', 'Review authorization and tenant isolation'),
      {
        ...run('run-2', 'running', 'Review upload handling'),
        mode: 'deep',
        phase: 'Building threat model',
        progress: { done: 0, total: 0 },
        estimatedCostUsd: undefined,
        workers: undefined,
        deepProgress: { completed: 1, active: 2, maximum: 4 },
      },
      run('run-3', 'completed', 'Review webhook request validation'),
    ];
const drafts = [];
if (new URLSearchParams(location.search).has('narrow')) document.body.classList.add('narrow');
const log = (message) => (document.querySelector('#journal').textContent = message);
const port = {
  list: async () =>
    structuredClone({
      engine: 'codex-security-sdk',
      instanceId: 'fixture-ui',
      revision,
      runs,
      drafts,
      maxConcurrent: 2,
      historyLimit: 50,
    }),
  prepare: async (inputs) => {
    const p = plan('plan-' + ++sequence, inputs);
    const s = { ...emptyState(), engine: 'codex-security-sdk', plan: p };
    drafts.unshift(s);
    log('Prepared ' + p.id + '; 0 model calls');
    return structuredClone(s);
  },
  start: async (input) => {
    if (runs.filter((r) => r.status === 'running').length >= 2)
      throw new Error('Two scans are already running.');
    const d = drafts.find((d) => d.plan.id === input.planId);
    if (!d) throw new Error('Preview not found');
    d.planConsumed = true;
    const r = run('run-' + ++sequence, 'running', d.plan.scanPrompt);
    r.plan = d.plan;
    r.mode = d.plan.settings.scan.mode;
    r.startedAt = new Date().toISOString();
    r.repository = d.plan.repository;
    r.progress = { done: 0, total: 0 };
    r.phase = 'Preparing repository';
    runs.unshift(r);
    revision++;
    log('Started ' + r.runId + '; mock only');
    return structuredClone(r);
  },
  cancel: async (input) => {
    const r = runs.find((r) => r.runId === input.runId);
    r.status = 'cancelled';
    r.phase = 'Cancelled';
    r.finishedAt = new Date().toISOString();
    r.events.push({ time: r.finishedAt, message: 'Cancellation completed for this run.' });
    revision++;
    log('Cancelled ' + input.runId + ' only');
    return structuredClone(r);
  },
};
let operationSequence = 1;
const operation = (kind, id) => ({
  operationId: id,
  kind,
  repository,
  status: 'prepared',
  phase: 'Ready for approval',
  plan: {
    ...plan('preview-' + id),
    kind,
    costLimitEnforced: kind === 'policy',
    costNotice:
      kind === 'policy'
        ? 'Estimated stop USD 1, not a hard cap.'
        : 'Validation has no cost ceiling.',
    finding: kind === 'validation' ? 'Missing tenant membership check.' : undefined,
  },
  question: null,
  answeredQuestionCount: 0,
  result: null,
  error: null,
  createdAt: new Date().toISOString(),
  startedAt: null,
  finishedAt: null,
  revision: 1,
});
const operationStates = [];
const operationPort = {
  capabilities: { policy: true, validation: true, questionAnswers: true },
  list: async () => structuredClone({ operations: operationStates, maxConcurrent: 2 }),
  prepare: async (input) => {
    const op = operation(input.kind, 'op-' + ++operationSequence);
    op.repository = input.repository ?? repository;
    if (input.kind === 'validation' && new URLSearchParams(location.search).has('uncapped'))
      op.plan.mock = false;
    op.plan.repository = op.repository;
    op.plan.finding =
      typeof input.finding === 'string' ? input.finding : JSON.stringify(input.finding);
    op.plan.path = input.path;
    operationStates.unshift(op);
    log('Prepared ' + op.kind + '; 0 model calls');
    return structuredClone(op);
  },
  start: async (input) => {
    const op = operationStates.find((op) => op.operationId === input.operationId);
    op.startedAt = new Date().toISOString();
    op.status = op.kind === 'policy' ? 'awaiting_answers' : 'completed';
    op.phase = op.kind === 'policy' ? 'Waiting for project context' : 'Source assessment complete';
    if (op.kind === 'policy')
      op.question = {
        id: 'question-' + op.operationId,
        questions: [
          'Which users may invite teammates into a workspace?',
          'Are uploaded files ever accessible without signing in?',
        ],
        createdAt: new Date().toISOString(),
      };
    else
      op.result = {
        kind: 'validation',
        disposition: 'reportable',
        report:
          'The membership check is absent before returning the requested project. This static assessment supports the reported access-control issue; no runtime exploit was executed.',
        truncated: false,
      };
    log('Started ' + op.kind + '; mock only');
    return structuredClone(op);
  },
  answer: async (input) => {
    const op = operationStates.find((op) => op.operationId === input.operationId);
    op.question = null;
    op.status = 'completed';
    op.phase = 'Policy draft ready';
    op.answeredQuestionCount = 2;
    op.finishedAt = new Date().toISOString();
    op.result = {
      kind: 'policy',
      content:
        '# Security policy\n\n## Access boundaries\n\nRequire workspace membership before reading tenant-owned projects. Only workspace administrators may invite teammates.\n\n## Uploads\n\nUploaded files require authenticated access and a tenant ownership check.',
      reviewNotes: ['Confirm the retention policy with the project owner before applying.'],
      targetPath: 'SECURITY.md',
      applied: false,
      truncated: false,
    };
    log('Answered ' + input.questionId + '; mock only');
    return structuredClone(op);
  },
  cancel: async (input) => {
    const op = operationStates.find((op) => op.operationId === input.operationId);
    op.status = 'cancelled';
    op.question = null;
    op.phase = 'Cancelled';
    return structuredClone(op);
  },
};
render(
  () => (
    <SecurityPanel directory={repository} port={port} operations={operationPort} pollMs={1000} />
  ),
  document.querySelector('#root'),
);
