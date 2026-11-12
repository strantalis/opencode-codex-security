import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeScanResult } from '../src/core/result-summary.ts';

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
});
