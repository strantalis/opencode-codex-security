import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeStoredOutcomeSummary, summarizeScanResult } from '../src/core/result-summary.ts';

const repository = '/tmp/synthetic-repository';
const finding = (level = 'high') => ({
  findingId: 'same-id',
  occurrenceId: 'same-occurrence',
  severity: { level },
});
const result = () => ({
  manifest: {
    scan: {
      scope: {
        includePaths: ['src/'],
        excludePaths: ['vendor/'],
        limitations: ['Runtime execution was not performed.'],
      },
      reviewState: {
        surfaces: [
          { id: 'api', label: 'API', disposition: 'reported', riskArea: 'Authorization' },
          { id: 'jobs', label: 'Jobs', disposition: 'needs_follow_up' },
          { id: 'routes', label: 'Routes', disposition: 'no_issue_found' },
          { id: 'parser', label: 'Parser', disposition: 'rejected' },
          { id: 'native', label: 'Native', disposition: 'not_applicable' },
        ],
        explicitExclusions: [{ pattern: 'vendor/', reason: 'Third-party code' }],
        deferred: [
          {
            id: 'review-jobs',
            reason: 'Requires a configured runtime',
            paths: ['src/jobs/'],
            surfaceIds: ['jobs'],
          },
        ],
        resolvedDeferred: [{ id: 'review-api', reason: 'Static review completed' }],
        openQuestions: [{ question: 'Which deployment invokes the jobs?' }],
      },
      artifacts: [
        { path: 'report.md', mediaType: 'text/markdown', sha256: 'not-exposed' },
        { path: 'findings.json', mediaType: 'application/json' },
      ],
    },
  },
  review: { excludedPaths: ['vendor/'] },
  findings: { findings: [finding(), finding('informational')] },
  repositoryFindings: [
    {
      findingId: 'same-id',
      occurrenceId: 'same-occurrence',
      status: 'open',
      confirmedInLatestScan: true,
      knownSince: '2026-10-01T00:00:00Z',
      knownScanIds: ['prior-scan'],
      matchedFindingIds: ['prior-finding'],
    },
    { findingId: 'other', status: 'closed', confirmedInLatestScan: false },
  ],
});

test('final summaries project coverage dispositions, gaps, and returned record counts', () => {
  const summary = summarizeScanResult(result(), repository);
  assert.equal(summary.source, 'final-sdk-result');
  assert.equal(summary.repository, 'synthetic-repository');
  assert.deepEqual(summary.returnedFindings, {
    total: 2,
    reportable: 1,
    informational: 1,
    unclassified: 0,
  });
  const coverage = summary.coverage;
  assert.equal(coverage.source, 'manifest-review-state');
  assert.equal(coverage.surfaces.total, 5);
  assert.deepEqual(coverage.surfaces.dispositions, {
    reported: 1,
    no_issue_found: 1,
    rejected: 1,
    not_applicable: 1,
    needs_follow_up: 1,
    unknown: 0,
  });
  assert.equal(coverage.explicitExclusions.items[0].reason, 'Third-party code');
  assert.equal(coverage.deferred.items[0].reason, 'Requires a configured runtime');
  assert.deepEqual(coverage.deferred.items[0].paths.items, ['src/jobs/']);
  assert.deepEqual(coverage.deferred.items[0].surfaceIds.items, ['jobs']);
  assert.equal(coverage.resolvedDeferred.items[0].id, 'review-api');
  assert.equal(coverage.openQuestions.items[0].question, 'Which deployment invokes the jobs?');
  assert.deepEqual(coverage.scopeIncludePaths.items, ['src/']);
  assert.deepEqual(coverage.scopeExcludePaths.items, ['vendor/']);
  assert.deepEqual(coverage.reviewExcludedPaths.items, ['vendor/']);
  assert.deepEqual(coverage.limitations.items, ['Runtime execution was not performed.']);
  assert.deepEqual(summary.artifacts.items, [
    { path: 'report.md', mediaType: 'text/markdown' },
    { path: 'findings.json', mediaType: 'application/json' },
  ]);
  assert.ok(summary.notes.some((note) => note.includes('not exhaustive coverage')));
});

test('missing, empty, and malformed collections remain distinguishable', () => {
  const missing = summarizeScanResult({}, repository);
  assert.equal(missing.returnedFindings.total, null);
  assert.equal(missing.returnedFindings.reportable, null);
  assert.equal(missing.coverage.source, 'unavailable');
  assert.equal(missing.coverage.surfaces.total, null);
  assert.equal(missing.coverage.surfaces.dispositions, null);
  assert.equal(missing.coverage.explicitExclusions.total, null);
  assert.equal(missing.coverage.deferred.total, null);
  assert.equal(missing.repositoryFindings.available, false);
  assert.equal(missing.repositoryFindings.total, null);
  assert.equal(missing.repositoryFindings.open, null);
  assert.equal(missing.artifacts.total, null);
  const empty = summarizeScanResult(
    {
      findings: { findings: [] },
      repositoryFindings: [],
      manifest: { scan: { reviewState: { surfaces: [], deferred: [] } } },
    },
    repository,
  );
  assert.equal(empty.returnedFindings.total, 0);
  assert.equal(empty.repositoryFindings.available, true);
  assert.equal(empty.repositoryFindings.open, 0);
  assert.equal(empty.coverage.source, 'manifest-review-state');
  assert.equal(empty.coverage.surfaces.total, 0);
  assert.equal(empty.coverage.surfaces.dispositions.reported, 0);
  assert.equal(empty.coverage.deferred.total, 0);
  assert.equal(empty.coverage.resolvedDeferred.total, null);
  const malformed = summarizeScanResult(
    { findings: { findings: {} }, repositoryFindings: {}, manifest: { scan: { reviewState: [] } } },
    repository,
  );
  assert.equal(malformed.returnedFindings.total, null);
  assert.equal(malformed.repositoryFindings.available, false);
  assert.equal(malformed.coverage.source, 'unavailable');
});

test('sealed SDK results retain scope and exclusions without fabricating surface coverage', () => {
  const input = result();
  delete input.manifest.scan.reviewState;
  input.manifest.scan.review = { excludedPaths: ['generated/'] };
  delete input.review;
  // Coverage is not a public ScanResult field in SDK 0.9.1, even when constructor input had it.
  input.coverage = { surfaces: [{ disposition: 'reported' }], deferred: [] };
  const summary = summarizeScanResult(input, repository);
  assert.equal(summary.coverage.source, 'unavailable');
  assert.equal(summary.coverage.surfaces.total, null);
  assert.equal(summary.coverage.deferred.total, null);
  assert.deepEqual(summary.coverage.scopeIncludePaths.items, ['src/']);
  assert.deepEqual(summary.coverage.reviewExcludedPaths.items, ['generated/']);
  input.review = { excludedPaths: [] };
  assert.deepEqual(summarizeScanResult(input, repository).coverage.reviewExcludedPaths.items, []);
});

test('repository status, confirmation, and known matching metadata are independent', () => {
  const input = result();
  input.repositoryFindings.push(
    { findingId: 'historical-open', status: 'open', confirmedInLatestScan: false },
    { findingId: 'confirmed-closed', status: 'closed', confirmedInLatestScan: true },
  );
  const summary = summarizeScanResult(input, repository);
  const rows = summary.repositoryFindings;
  assert.equal(rows.total, 4);
  assert.equal(rows.open, 2);
  assert.equal(rows.closed, 2);
  assert.equal(rows.confirmedInLatestScan, 2);
  assert.equal(rows.notConfirmedInLatestScan, 2);
  assert.equal(rows.unknownStatus, 0);
  assert.equal(rows.withKnownSince, 1);
  assert.equal(rows.withMatchedFindingIds, 1);
  assert.equal(rows.items[0].knownSince, '2026-10-01T00:00:00Z');
  assert.deepEqual(rows.items[0].knownScanIds.items, ['prior-scan']);
  assert.deepEqual(rows.items[0].matchedFindingIds.items, ['prior-finding']);
  assert.equal(rows.items[1].knownSince, null);
  assert.equal(rows.items[1].matchedFindingIds.total, null);
  assert.ok(summary.notes.some((note) => note.includes('Unconfirmed does not mean fixed')));
  assert.ok(summary.notes.some((note) => note.includes('missing matches do not mean new')));
});

test('duplicate identities are counted as returned records, never deduplicated or labeled new', () => {
  const input = result();
  input.findings.findings = [finding(), finding(), finding('informational')];
  input.repositoryFindings = [input.repositoryFindings[0], input.repositoryFindings[0]];
  const summary = summarizeScanResult(input, repository);
  assert.equal(summary.returnedFindings.total, 3);
  assert.equal(summary.returnedFindings.reportable, 2);
  assert.equal(summary.returnedFindings.informational, 1);
  assert.equal(summary.repositoryFindings.total, 2);
  assert.equal(summary.repositoryFindings.withMatchedFindingIds, 2);
  const forbiddenKeys = /"(?:newFindings|uniqueFindings|deduplicated|dedupProgress)":/;
  assert.doesNotMatch(JSON.stringify(summary), forbiddenKeys);
});

test('unknown enums and malformed records never become reassuring zeros or statuses', () => {
  const input = result();
  input.findings.findings = [finding('future-severity'), null, finding('low')];
  input.manifest.scan.reviewState.surfaces = [
    { id: 'future', disposition: 'future-disposition' },
    null,
  ];
  input.repositoryFindings = [
    { status: 'future-status', confirmedInLatestScan: 'false', matchedFindingIds: [null, ''] },
    null,
  ];
  const summary = summarizeScanResult(input, repository);
  assert.deepEqual(summary.returnedFindings, {
    total: 3,
    reportable: 1,
    informational: 0,
    unclassified: 2,
  });
  assert.equal(summary.coverage.surfaces.dispositions.unknown, 2);
  assert.equal(summary.coverage.surfaces.items[0].disposition, 'unknown');
  assert.equal(summary.coverage.surfaces.omitted, 1);
  assert.equal(summary.repositoryFindings.unknownStatus, 2);
  assert.equal(summary.repositoryFindings.unknownConfirmation, 2);
  assert.equal(summary.repositoryFindings.items[0].status, 'unknown');
  assert.equal(summary.repositoryFindings.items[0].confirmedInLatestScan, null);
  assert.equal(summary.repositoryFindings.withMatchedFindingIds, 0);
});

test('every retained free-text surface is sanitized and raw extensions are excluded', () => {
  const secret = 'sk-syntheticSummarySecret01234567890';
  const rawOnly = 'FORBIDDEN_RAW_COMMAND_REPORT_REASONING_EVIDENCE';
  const input = result();
  input.manifest.scan.scope = {
    includePaths: [secret],
    excludePaths: [secret],
    limitations: [secret],
    summary: rawOnly,
    context: rawOnly,
    artifactsReviewed: [rawOnly],
  };
  input.manifest.scan.reviewState = {
    surfaces: [
      { id: secret, label: secret, disposition: 'reported', riskArea: secret, notes: rawOnly },
    ],
    explicitExclusions: [{ pattern: secret, reason: secret, evidence: rawOnly }],
    deferred: [{ id: secret, reason: secret, paths: [secret], surfaceIds: [secret] }],
    resolvedDeferred: [{ id: secret, reason: secret }],
    openQuestions: [{ question: secret, followUpPrompt: rawOnly }],
    reviews: [{ threadId: rawOnly, threatModel: rawOnly }],
    commands: [rawOnly],
  };
  input.review = { excludedPaths: [secret], report: rawOnly };
  input.manifest.scan.artifacts = [{ path: `reports/${secret}.md`, mediaType: secret }];
  input.manifest.scan.threatModel = { summary: rawOnly };
  input.findings.findings[0].summary = rawOnly;
  input.findings.findings[0].codeEvidence = [{ code: rawOnly }];
  input.repositoryFindings = [
    {
      findingId: secret,
      occurrenceId: secret,
      status: 'open',
      confirmedInLatestScan: true,
      knownSince: secret,
      knownScanIds: [secret],
      matchedFindingIds: [secret],
      title: rawOnly,
      summary: rawOnly,
      threadId: rawOnly,
      scanId: rawOnly,
    },
  ];
  input.turnResult = { finalResponse: rawOnly };
  input.threadId = rawOnly;
  const summary = summarizeScanResult(input, `/tmp/${secret}`);
  const serialized = JSON.stringify(summary);
  assert.ok(!serialized.includes(secret));
  assert.ok(!serialized.includes(rawOnly));
  const retained = [
    summary.repository,
    summary.coverage.scopeIncludePaths.items[0],
    summary.coverage.scopeExcludePaths.items[0],
    summary.coverage.limitations.items[0],
    summary.coverage.reviewExcludedPaths.items[0],
    ...Object.values(summary.coverage.surfaces.items[0]).filter((v) => v !== 'reported'),
    ...Object.values(summary.coverage.explicitExclusions.items[0]),
    summary.coverage.deferred.items[0].id,
    summary.coverage.deferred.items[0].reason,
    summary.coverage.deferred.items[0].paths.items[0],
    summary.coverage.deferred.items[0].surfaceIds.items[0],
    ...Object.values(summary.coverage.resolvedDeferred.items[0]),
    summary.coverage.openQuestions.items[0].question,
    summary.repositoryFindings.items[0].findingId,
    summary.repositoryFindings.items[0].occurrenceId,
    summary.repositoryFindings.items[0].knownSince,
    summary.repositoryFindings.items[0].knownScanIds.items[0],
    summary.repositoryFindings.items[0].matchedFindingIds.items[0],
    summary.artifacts.items[0].path,
    summary.artifacts.items[0].mediaType,
  ];
  assert.ok(retained.every((value) => value.includes('[REDACTED')));
});

test('summary text applies the shared password, bearer, private-key, and control filtering', () => {
  const input = result();
  input.manifest.scan.scope.limitations = [
    'password="synthetic-password"',
    'Bearer syntheticBearer01234567890',
    '-----BEGIN PRIVATE KEY-----\nsynthetic-private-material\n-----END PRIVATE KEY-----',
    '\u0000safe\u0007text',
  ];
  const values = summarizeScanResult(input, repository).coverage.limitations.items;
  assert.deepEqual(values, [
    'password=[REDACTED]',
    'Bearer [REDACTED]',
    '[REDACTED PRIVATE MATERIAL]',
    'safetext',
  ]);
});

test('lists and text are bounded while counts cover all returned records', () => {
  const input = result();
  const long = 'x'.repeat(2000);
  const repeat = (value) => Array.from({ length: 27 }, () => structuredClone(value));
  input.manifest.scan.scope.includePaths = repeat(long);
  input.manifest.scan.reviewState.surfaces = repeat({
    id: long,
    label: long,
    disposition: 'needs_follow_up',
  });
  input.manifest.scan.reviewState.deferred = repeat({
    id: long,
    reason: long,
    paths: repeat(long),
    surfaceIds: repeat(long),
  });
  input.repositoryFindings = repeat({
    ...input.repositoryFindings[0],
    knownScanIds: repeat(long),
    matchedFindingIds: repeat(long),
  });
  input.manifest.scan.artifacts = repeat({ path: 'report.md', mediaType: long });
  const summary = summarizeScanResult(input, repository);
  const lists = [
    summary.coverage.scopeIncludePaths,
    summary.coverage.surfaces,
    summary.coverage.deferred,
    summary.coverage.deferred.items[0].paths,
    summary.coverage.deferred.items[0].surfaceIds,
    summary.repositoryFindings,
    summary.repositoryFindings.items[0].knownScanIds,
    summary.repositoryFindings.items[0].matchedFindingIds,
    summary.artifacts,
  ];
  for (const value of lists) {
    assert.equal(value.total, 27);
    assert.equal(value.items.length, 20);
    assert.equal(value.omitted, 7);
  }
  assert.equal(summary.coverage.surfaces.dispositions.needs_follow_up, 27);
  assert.equal(summary.repositoryFindings.withMatchedFindingIds, 27);
  assert.equal(summary.coverage.surfaces.items[0].label.length, 320);
  assert.equal(summary.coverage.surfaces.items[0].id.length, 160);
  assert.equal(summary.artifacts.items[0].mediaType.length, 100);
});

test('artifact projection rejects absolute paths, traversal, URLs, and control characters', () => {
  const input = result();
  const rejected = [
    '/tmp/report.md',
    '../report.md',
    'nested/../../report.md',
    './report.md',
    'nested//report.md',
    'https://example.com/report.md',
    'file:///tmp/report.md',
    'C:\\reports\\report.md',
    'reports\\..\\report.md',
    'report.md?token=secret',
    'report.md#secret',
    '%2e%2e/report.md',
    'report\u0000.md',
    'x'.repeat(321),
    '',
    null,
  ];
  input.manifest.scan.artifacts = [
    ...rejected.map((path) => ({ path, mediaType: 'text/plain' })),
    { path: 'exports/results.sarif', mediaType: 'application/sarif+json' },
  ];
  const artifacts = summarizeScanResult(input, repository).artifacts;
  assert.equal(artifacts.total, rejected.length + 1);
  assert.equal(artifacts.omitted, rejected.length);
  assert.deepEqual(artifacts.items, [
    { path: 'exports/results.sarif', mediaType: 'application/sarif+json' },
  ]);
});

test('mapper is pure and never consults raw reports, result serializers, or artifact getters', () => {
  const input = result();
  const snapshot = structuredClone(input);
  for (const key of ['reportPath', 'sarifPath', 'artifactsDir', 'turnResult', 'toJSON'])
    Object.defineProperty(input, key, {
      get() {
        throw new Error(`Forbidden access: ${key}`);
      },
    });
  const first = summarizeScanResult(input, repository);
  assert.deepEqual(summarizeScanResult(input, repository), first);
  assert.deepEqual(input.manifest, snapshot.manifest);
  assert.deepEqual(input.findings, snapshot.findings);
  assert.deepEqual(input.repositoryFindings, snapshot.repositoryFindings);
  first.coverage.scopeIncludePaths.items.push('mutation');
  first.repositoryFindings.items[0].matchedFindingIds.items.push('mutation');
  assert.deepEqual(input.manifest, snapshot.manifest);
  assert.deepEqual(input.repositoryFindings, snapshot.repositoryFindings);
});

test('stored summaries preserve aggregates and missing metadata through safe round trips', () => {
  const input = result();
  input.repositoryFindings = Array.from({ length: 35 }, () => input.repositoryFindings[0]);
  input.manifest.scan.reviewState.surfaces = Array.from({ length: 31 }, () => ({
    id: 'fixture-surface',
    disposition: 'reported',
  }));
  for (const source of [input, {}, { findings: { findings: [] }, repositoryFindings: [] }]) {
    const expected = summarizeScanResult(source, repository);
    const restored = sanitizeStoredOutcomeSummary(JSON.parse(JSON.stringify(expected)));
    assert.deepEqual(restored, expected);
    assert.deepEqual(sanitizeStoredOutcomeSummary(restored), restored);
  }
  const restored = sanitizeStoredOutcomeSummary(summarizeScanResult(input, repository));
  assert.equal(restored.repositoryFindings.total, 35);
  assert.equal(restored.repositoryFindings.items.length, 20);
  assert.equal(restored.repositoryFindings.omitted, 15);
  assert.equal(restored.coverage.surfaces.dispositions.reported, 31);
});

test('modified stored summaries cannot expose raw text or bypass list and path bounds', () => {
  const secret = 'sk-syntheticSavedSummarySecret0123456789';
  const rawOnly = 'FORBIDDEN_STORED_RAW_REPORT';
  const saved = summarizeScanResult(result(), repository);
  saved.repository = `/private/home/${secret}`;
  saved.coverage.surfaces.items[0].label = secret;
  saved.coverage.surfaces.items[0].rawEvidence = rawOnly;
  saved.coverage.explicitExclusions.items[0].reason = secret;
  saved.coverage.deferred.items[0].reason = secret;
  saved.coverage.deferred.items[0].paths = {
    total: 30,
    items: Array.from({ length: 30 }, () => `${secret}${'x'.repeat(1000)}`),
    omitted: 0,
  };
  saved.coverage.resolvedDeferred.items[0].reason = secret;
  saved.coverage.openQuestions.items[0].question = secret;
  saved.coverage.limitations.items[0] = secret;
  saved.repositoryFindings.items[0].findingId = secret;
  saved.repositoryFindings.items[0].knownSince = secret;
  saved.repositoryFindings.items[0].matchedFindingIds.items[0] = secret;
  saved.repositoryFindings.items[0].rawReport = rawOnly;
  saved.artifacts = {
    total: 3,
    omitted: 0,
    items: [
      { path: '/private/outside.md', mediaType: secret },
      { path: 'https://example.com/report', mediaType: secret },
      { path: `reports/${secret}.md`, mediaType: secret },
    ],
  };
  saved.notes = [rawOnly, secret];
  saved.turnResult = { finalResponse: rawOnly };
  const restored = sanitizeStoredOutcomeSummary(saved);
  assert.ok(restored);
  const serialized = JSON.stringify(restored);
  assert.ok(!serialized.includes(secret));
  assert.ok(!serialized.includes(rawOnly));
  assert.ok(!serialized.includes('/private'));
  assert.ok(!serialized.includes('https://example.com'));
  assert.equal(restored.coverage.deferred.items[0].paths.items.length, 20);
  assert.equal(restored.coverage.deferred.items[0].paths.total, 30);
  assert.equal(restored.coverage.deferred.items[0].paths.omitted, 10);
  assert.equal(restored.artifacts.items.length, 1);
  assert.equal(restored.artifacts.omitted, 2);
  assert.deepEqual(restored.notes, summarizeScanResult({}, repository).notes);
});

test('invalid stored assessment schema and contradictory counts are discarded independently', () => {
  for (const value of [undefined, null, 3, 'summary', [], {}, { source: 'live-sdk' }])
    assert.equal(sanitizeStoredOutcomeSummary(value), undefined);
  const edits = [
    (s) => delete s.coverage,
    (s) => delete s.returnedFindings.informational,
    (s) => (s.returnedFindings.total = -1),
    (s) => (s.returnedFindings.total = Infinity),
    (s) => (s.returnedFindings.total = Number.MAX_SAFE_INTEGER + 1),
    (s) => (s.returnedFindings.total = 1.5),
    (s) => (s.returnedFindings.total = null),
    (s) => (s.returnedFindings.reportable = 2),
    (s) => (s.coverage.source = 'live-stream'),
    (s) => (s.coverage.source = 'unavailable'),
    (s) => delete s.coverage.deferred,
    (s) => (s.coverage.surfaces.items = {}),
    (s) => (s.coverage.surfaces.omitted = -1),
    (s) => (s.coverage.surfaces.total = null),
    (s) => (s.coverage.surfaces.dispositions = null),
    (s) => (s.coverage.surfaces.dispositions.reported = 3),
    (s) => (s.repositoryFindings.available = false),
    (s) => (s.repositoryFindings.open = 2),
    (s) => (s.repositoryFindings.confirmedInLatestScan = 2),
    (s) => (s.repositoryFindings.withMatchedFindingIds = 50),
    (s) => (s.artifacts.omitted = 100),
    (s) => delete s.artifacts,
  ];
  for (const edit of edits) {
    const saved = summarizeScanResult(result(), repository);
    edit(saved);
    const run = { status: 'completed', findings: [], assessment: saved };
    run.assessment = sanitizeStoredOutcomeSummary(run.assessment);
    assert.equal(run.assessment, undefined, edit.toString());
    assert.equal(run.status, 'completed');
    assert.deepEqual(run.findings, []);
  }
});
