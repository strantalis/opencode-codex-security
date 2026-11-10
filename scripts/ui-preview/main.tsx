import { render } from 'solid-js/web';
import { SecurityPanel } from '../../src/security-panel';
import { emptyState } from '../../src/types';
const repository = '/Projects/atlas';
const params = new URLSearchParams(location.search);
const list = (items = []) => ({ total: items.length, items, omitted: 0 });
const unavailable = () => ({ total: null, items: [], omitted: 0 });
const settings = {
  codex: { model: 'gpt-5.6-sol', reasoningEffort: 'xhigh', daybreak: false },
  scan: { mode: 'standard', maxCostUsd: 1 },
};
let revision = 1,
  sequence = 10;
const plan = (id, inputs = {}) => ({
  id,
  repository: inputs.repository ?? repository,
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
  telemetry: {
    activity: [
      {
        id: id + '-reading',
        kind: 'command',
        status: status === 'running' ? 'running' : 'completed',
        label: 'Reading source',
        paths: ['src/api/projects.ts'],
        worker: 1,
        startedAt: new Date(t - 12000).toISOString(),
        updatedAt: new Date(t - 3000).toISOString(),
      },
      {
        id: id + '-search',
        kind: 'command',
        status: 'completed',
        label: 'Searching source',
        paths: ['src/api'],
        worker: 2,
        startedAt: new Date(t - 14000).toISOString(),
        updatedAt: new Date(t - 8000).toISOString(),
      },
    ],
    observedWorkers: [1, 2],
    phaseProgress: {
      phase: 'discovery',
      files: { done: 18, total: 42 },
      reviews: { done: 3, total: 10 },
    },
    measurement: {
      coverage: status === 'running' ? 'partial' : 'complete',
      observedAt: new Date(t).toISOString(),
      threadCount: 3,
      missingThreadCount: status === 'running' ? 1 : 0,
      cost: {
        baselineUsd: 0.24,
        range: { min: 0.24, max: status === 'running' ? null : 0.31 },
        model: settings.codex.model,
      },
    },
  },
  assessment:
    status === 'completed'
      ? {
          source: 'final-sdk-result',
          repository,
          returnedFindings: { total: 3, reportable: 1, informational: 2, unclassified: 0 },
          coverage: {
            source: 'manifest-review-state',
            surfaces: {
              ...list([
                {
                  id: 'surface-1',
                  label: 'Webhook request validation',
                  disposition: 'reported',
                  riskArea: 'Access control',
                },
                {
                  id: 'surface-2',
                  label: 'External identity provider',
                  disposition: 'needs_follow_up',
                  riskArea: 'Authentication',
                },
              ]),
              dispositions: {
                reported: 1,
                needs_follow_up: 1,
                no_issue_found: 0,
                rejected: 0,
                not_applicable: 0,
                unknown: 0,
              },
            },
            explicitExclusions: list([
              { pattern: 'vendor/**', reason: 'Third-party code excluded from this review' },
            ]),
            deferred: list([
              {
                id: 'deferred-1',
                reason: 'Production identity-provider configuration was not available',
                paths: list(['src/auth/provider.ts']),
                surfaceIds: list(['surface-2']),
              },
            ]),
            resolvedDeferred: list(),
            openQuestions: list([
              { question: 'Does production enforce token audience validation?' },
            ]),
            scopeIncludePaths: list(['src/api']),
            scopeExcludePaths: list(['vendor']),
            reviewExcludedPaths: list(),
            limitations: list(['Static review only; no runtime exploit was executed.']),
          },
          repositoryFindings: {
            ...list(),
            available: true,
            open: 1,
            closed: 0,
            unknownStatus: 0,
            confirmedInLatestScan: 1,
            notConfirmedInLatestScan: 0,
            unknownConfirmation: 0,
            withKnownSince: 1,
            withMatchedFindingIds: 1,
          },
          artifacts: list(),
          notes: [
            'Repository matching counts describe returned records, not new or unique vulnerabilities.',
          ],
        }
      : undefined,
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
        telemetry: {
          activity: [],
          observedWorkers: [],
          measurement: { coverage: 'unavailable', observedAt: new Date(t).toISOString() },
        },
        deepProgress: { completed: 1, active: 2, maximum: 4 },
      },
      run('run-3', 'completed', 'Review webhook request validation'),
    ];
// Each scenario is synthetic and never calls the SDK or reads a real repository.
const scenario = params.get('scenario');
if (scenario && runs[0]) {
  const selected = runs[0];
  if (scenario === 'finalizing') {
    selected.telemetry.lifecycle = {
      status: 'completed',
      hasReportableFindings: true,
      finishedAt: new Date(t).toISOString(),
    };
    selected.progress = { done: 42, total: 42, unit: 'files' };
  }
  if (scenario === 'consolidating') {
    selected.mode = 'deep';
    selected.deepProgress = { completed: 3, active: 0, maximum: 8, consolidating: true };
  }
  if (scenario === 'informational' || scenario === 'missing-coverage') {
    const completed = run(selected.runId, 'completed', 'Review webhook request validation');
    Object.assign(selected, completed);
    if (scenario === 'informational') {
      selected.findings = [];
      selected.skipped = 2;
      selected.assessment.returnedFindings = {
        total: 2,
        reportable: 0,
        informational: 2,
        unclassified: 0,
      };
    }
    if (scenario === 'missing-coverage') {
      selected.assessment.coverage.source = 'unavailable';
      selected.assessment.coverage.surfaces = { ...unavailable(), dispositions: null };
      for (const name of [
        'explicitExclusions',
        'deferred',
        'resolvedDeferred',
        'openQuestions',
        'limitations',
      ])
        selected.assessment.coverage[name] = unavailable();
      selected.assessment.repositoryFindings = {
        ...unavailable(),
        available: false,
        open: null,
        closed: null,
        confirmedInLatestScan: null,
      };
    }
  }
}
if (params.has('multi-target')) {
  runs[0].repository = '/Projects/other-team/atlas';
  runs[0].plan.repository = runs[0].repository;
  runs[2].repository = '/Projects/other-team/atlas';
  runs[2].plan.repository = runs[2].repository;
}
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
      preview: drafts[0]?.planConsumed ? undefined : drafts[0],
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
