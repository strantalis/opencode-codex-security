import { render } from 'solid-js/web';
import { SecurityPanel } from '../../src/security-panel';
import { findingText } from '../../src/scan-display';
import { emptyState } from '../../src/types';
const repository = '/Projects/atlas';
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme') === 'light' ? 'light' : 'dark';

// Events: the fake ports notify subscribers after each change, as the server's RPC events do.
const listeners = new Set();
const emit = (event) => queueMicrotask(() => listeners.forEach((listener) => listener(event)));
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const list = (items = []) => ({ total: items.length, items, omitted: 0 });
const unavailable = () => ({ total: null, items: [], omitted: 0 });
const settings = {
  codex: {
    provider: 'openai',
    model: 'gpt-5.6-sol',
    reasoningEffort: 'xhigh',
    daybreak: false,
    auth: 'Codex Security sign-in',
  },
  scan: { mode: 'standard', maxCostUsd: 1 },
};
let revision = 1,
  sequence = 10;
const plan = (id, inputs = {}) => ({
  id,
  repository: inputs.repository ?? repository,
  scopePaths: inputs.scopePaths ?? ['src/api'],
  scanPrompt: inputs.scanPrompt ?? 'Review authorization and tenant isolation',
  contextFiles: (inputs.contextFiles ?? []).map((path) => ({ path })),
  expiresAt: new Date(Date.now() + 600000).toISOString(),
  mock: true,
  inputs,
  settings: { ...settings, scan: { ...settings.scan, mode: inputs.mode ?? 'standard' } },
  globalConfigFile: '~/.config/opencode/codex-security.json',
  sdk: { codexOverrides: {}, auth: 'auto' },
});
const t = Date.now();
const run = (id, status, focus) => ({
  ...emptyState(),
  runId: id,
  scanId: 'sdk-' + id,
  instanceId: 'preview-ui',
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
  if (scenario === 'failed') {
    selected.status = 'error';
    selected.phase = 'Scan stopped';
    selected.finishedAt = new Date(t - 20000).toISOString();
    selected.error =
      'The model provider rejected the request: the account has no access to gpt-5.6-sol.';
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
      instanceId: 'preview-ui',
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
    emit('changed');
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
    emit('changed');
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
    emit('changed');
    return structuredClone(r);
  },
  subscribe,
};
/** Advances the first running scan by one review, as a server progress event would. */
const advance = () => {
  const r = runs.find((r) => r.status === 'running' && r.telemetry?.phaseProgress);
  if (!r) return;
  const reviews = r.telemetry.phaseProgress.reviews;
  reviews.done = Math.min(reviews.total, reviews.done + 1);
  revision++;
  emit('changed');
};
if (params.has('live')) setInterval(advance, 2000);
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
        ? 'Stops at an estimated USD 1. This is an estimate, not a billing cap.'
        : 'Validation has no cost limit in the SDK; scan.maxCostUsd does not apply.',
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
const askQuestions = (op) => {
  op.startedAt ??= new Date(Date.now() - 41000).toISOString();
  op.status = 'awaiting_answers';
  op.phase = 'Waiting for project context';
  op.estimatedCostUsd = 0.08;
  op.question = {
    id: 'question-' + op.operationId,
    questions: [
      'Which users may invite teammates into a workspace?',
      'Are uploaded files ever accessible without signing in?',
    ],
    createdAt: new Date().toISOString(),
  };
};
const completeValidation = (op) => {
  op.startedAt ??= new Date(Date.now() - 64000).toISOString();
  op.finishedAt = new Date().toISOString();
  op.status = 'completed';
  op.phase = 'Source assessment complete';
  op.result = {
    kind: 'validation',
    disposition: 'reportable',
    report:
      'The handler reads the project by ID and returns it without checking that the signed-in user belongs to the project tenant. A user in tenant A can read tenant B projects by changing the ID.',
    truncated: false,
  };
};
// Seeded operation scenarios.
if (scenario === 'policy-waiting') {
  const op = operation('policy', 'op-policy');
  op.plan.path = 'src/api';
  op.plan.finding = undefined;
  askQuestions(op);
  operationStates.unshift(op);
}
if (scenario === 'validation') {
  const finding = runs[2].findings[0];
  const op = operation('validation', 'op-validation');
  op.plan.finding = findingText(finding);
  completeValidation(op);
  operationStates.unshift(op);
}
const operationPort = {
  capabilities: { policy: true, validation: true, fix: true },
  list: async () => structuredClone({ operations: operationStates, maxConcurrent: 2 }),
  prepare: async (input) => {
    const op = operation(input.kind, 'op-' + ++operationSequence);
    op.repository = input.repository ?? repository;
    if (input.kind === 'validation' && new URLSearchParams(location.search).has('real'))
      op.plan.mock = false;
    op.plan.repository = op.repository;
    op.plan.finding =
      typeof input.finding === 'string' ? input.finding : JSON.stringify(input.finding);
    op.plan.path = input.path;
    operationStates.unshift(op);
    log('Prepared ' + op.kind + '; 0 model calls');
    emit('operationChanged');
    return structuredClone(op);
  },
  start: async (input) => {
    const op = operationStates.find((op) => op.operationId === input.operationId);
    op.startedAt = new Date().toISOString();
    if (op.kind === 'policy') askQuestions(op);
    else if (op.kind === 'fix') {
      op.status = 'completed';
      op.phase = 'Fix ready to review';
      op.finishedAt = new Date().toISOString();
      op.result = {
        kind: 'fix',
        status: 'verified',
        report: 'The tenant check now runs before the lookup; the existing tests pass.',
        diff: [
          'diff --git a/src/api/projects.ts b/src/api/projects.ts',
          '--- a/src/api/projects.ts',
          '+++ b/src/api/projects.ts',
          '@@ -44,6 +44,7 @@ export async function getProject(req) {',
          '   const { id } = req.params;',
          '+  await requireTenantMember(req.user, req.tenantId);',
          '   const project = await db.project.findUnique({ where: { id } });',
        ].join('\n'),
        resolution: 'pending',
        truncated: false,
      };
    } else completeValidation(op);
    log('Started ' + op.kind + '; mock only');
    emit('operationChanged');
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
    emit('operationChanged');
    return structuredClone(op);
  },
  resolve: async (input) => {
    const op = operationStates.find((op) => op.operationId === input.operationId);
    op.result.resolution = input.action === 'apply' ? 'applied' : 'discarded';
    op.phase = input.action === 'apply' ? 'Fix applied' : 'Fix discarded';
    log('Fix ' + op.result.resolution + '; mock only');
    emit('operationChanged');
    return structuredClone(op);
  },
  cancel: async (input) => {
    const op = operationStates.find((op) => op.operationId === input.operationId);
    op.status = 'cancelled';
    op.question = null;
    op.phase = 'Cancelled';
    emit('operationChanged');
    return structuredClone(op);
  },
};

// The `setup` RPC is not in this branch yet; this matches its planned shape.
const setupState = {
  route: {
    provider: params.get('setup') === 'gateway' ? 'acme-gateway' : 'openai',
    ...(params.get('setup') === 'gateway' ? { baseUrl: 'https://llm.acme.internal/v1' } : {}),
    model: settings.codex.model,
    reasoningEffort: settings.codex.reasoningEffort,
    daybreak: false,
    auth:
      params.get('setup') === 'gateway' ? 'API key from ACME_API_KEY' : 'Codex Security sign-in',
  },
  configFile: '~/.config/opencode/codex-security.json',
  codexConfigFile: '~/.codex/config.toml',
  profile: 'default',
  profiles: params.get('setup') === 'single' ? ['default'] : ['default', 'work', 'bedrock'],
  runtime: { node: 'v22.20.0', python: params.get('setup') === 'missing' ? null : '3.12.4' },
  // ?signin=needed|shared shows the ChatGPT sign-in; gateway routes never have it.
  ...(params.get('signin') && params.get('setup') !== 'gateway'
    ? { signIn: { state: params.get('signin') } }
    : {}),
};
const setup = params.has('no-setup')
  ? undefined
  : {
      load: async () => structuredClone(setupState),
      setProfile: async (input) => {
        setupState.profile = input.profile;
        log('Profile ' + input.profile);
        return structuredClone(setupState);
      },
      signIn: async (input) => {
        setupState.signIn = {
          state: setupState.signIn.state,
          pending: input.device
            ? { url: 'https://auth.openai.com/codex/device', code: 'ABCD-12345' }
            : { url: 'https://auth.openai.com/oauth/authorize?client_id=synthetic' },
        };
        log('Sign-in started; mock only');
        // The harness "finishes" the sign-in on its own after a moment.
        setTimeout(() => (setupState.signIn = { state: 'signed-in' }), 2500);
        return structuredClone(setupState.signIn);
      },
      signInCancel: async () => {
        setupState.signIn = { state: setupState.signIn.state };
        return structuredClone(setupState.signIn);
      },
    };

// Lets the Python tests drive server events directly.
Object.assign(window, { securityHarness: { emit, advance } });
render(
  () => (
    <SecurityPanel directory={repository} port={port} operations={operationPort} setup={setup} />
  ),
  document.querySelector('#root'),
);
