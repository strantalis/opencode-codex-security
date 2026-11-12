import { createSecurityPlugin } from '../../src/plugin.ts';
import { resolve } from 'node:path';
import { Rpc } from '@opencode/plugin/rpc';
export const TestRpc = Rpc.define({
  id: 'opencode-codex-security.mock-test',
  events: {},
  methods: {
    inspect: { input: { type: 'object' }, output: { type: 'object' } },
    toolCall: {
      input: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          args: { type: 'object' },
          context: { type: 'object' },
        },
        required: ['name', 'args'],
      },
      output: { type: 'object' },
    },
  },
});
const calls: any[] = [];
let constructorConfig: any = null;
const operationCalls: any[] = [];
const implementation = createSecurityPlugin({
  createOperationsClient: () =>
    ({
      async generatePolicy(repository: any, options: any) {
        operationCalls.push({ kind: 'policy', repository });
        options.onStage?.('architecture');
        const answer = await options.answerQuestions(
          ['Who can approve privileged changes?'],
          options.signal,
        );
        options.onStage?.('policy');
        return {
          repository,
          targetPath: resolve(repository, options.path || '.', 'SECURITY.md'),
          content: `# Mock Security Policy\nOwner answer: ${answer}`,
          reviewNotes: ['Mock only; not applied.'],
        };
      },
      async validate(options: any) {
        operationCalls.push({ kind: 'validation', repository: options.repositoryPath });
        return { disposition: 'reportable', report: 'Mock source-grounded validation result.' };
      },
      async patch(options: any) {
        operationCalls.push({ kind: 'fix', repository: options.repositoryPath });
        return {
          status: 'no_change',
          verificationReport: 'Mock: nothing to change.',
          changedFiles: [],
          threadId: null,
          cost: null,
        };
      },
      async close() {},
    }) as any,
  createClient: (config) => {
    constructorConfig = config;
    return {
      async run(repository, options) {
        calls.push({
          repository,
          target: options?.target,
          scanPrompt: options?.scanPrompt,
          knowledgeBasePaths: options?.knowledgeBasePaths,
          mode: options?.mode,
          maxCostUsd: options?.maxCostUsd,
          cyberAccessProgram: options?.cyberAccessProgram,
        });
        options?.onLifecycle?.({
          scanId: 'mock-sdk-1',
          status: 'running',
          hasReportableFindings: null,
          finishedAt: null,
        } as any);
        options?.onProgress?.({ phase: 'discovery', filesCompleted: 1, filesTotal: 4 } as any);
        options?.onCost?.({ estimatedUsd: 0.12 } as any);
        options?.onMeasurement?.({
          coverage: 'partial',
          observedAt: new Date().toISOString(),
          threadCount: 2,
          missingThreadCount: 1,
          usage: null,
          cost: {
            estimatedUsd: 0.12,
            estimatedUsdRange: { min: 0.12, max: null, context: 'unknown' },
            model: 'mock',
          },
        } as any);
        options?.onWorkerEvent?.({ kind: 'observed', worker: 1 });
        options?.onReconnect?.(1, 3, { reason: 'network', retryAfterSeconds: 1 });
        const activity = {
          id: `SECRET mock-item-${calls.length}`,
          kind: 'command',
          status: 'running',
          description: 'cat src/accounts.js password=SECRET',
          paths: ['src/accounts.js', '../../SECRET', 'auth.json'],
          worker: 1,
        } as any;
        options?.onActivity?.(activity);
        options?.onWorkerStatus?.({ phase: 'file_review', planned: 2, started: 1 } as any);
        options?.onDeepProgress?.({ completed: 1, active: 1, maximum: 4 } as any);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        options?.signal?.throwIfAborted();
        options?.onActivity?.({ ...activity, status: 'completed' });
        options?.onMeasurement?.({
          coverage: 'complete',
          observedAt: new Date().toISOString(),
          threadCount: 2,
          missingThreadCount: 0,
          usage: {
            input_tokens: 10,
            cached_input_tokens: 5,
            cache_write_input_tokens: 0,
            output_tokens: 2,
            reasoning_output_tokens: 1,
            total_tokens: 12,
          },
          cost: {
            estimatedUsd: 0.18,
            estimatedUsdRange: { min: 0.18, max: 0.3, context: 'unknown' },
            model: 'mock',
          },
        } as any);
        options?.onDeepProgress?.({ completed: 2, active: 0, maximum: 4, consolidating: true });
        options?.onLifecycle?.({
          scanId: 'mock-sdk-1',
          status: 'completed',
          hasReportableFindings: true,
          finishedAt: new Date().toISOString(),
        } as any);
        return {
          manifest: {
            scan: {
              scope: {
                includePaths: ['src/accounts.js'],
                excludePaths: [],
                limitations: ['Mock coverage only.'],
              },
              reviewState: {
                surfaces: [{ id: 'account', label: 'Account lookup', disposition: 'reported' }],
                deferred: [],
              },
            },
          },
          review: { excludedPaths: [] },
          repositoryFindings: [
            {
              findingId: 'mock1',
              occurrenceId: 'mock1',
              status: 'open',
              confirmedInLatestScan: true,
              knownSince: '2026-01-01T00:00:00Z',
              matchedFindingIds: ['previous-mock'],
            },
          ],
          findings: {
            scanId: 'mock-sdk-1',
            findings: [
              {
                findingId: 'mock1',
                occurrenceId: 'mock1',
                title: 'MOCK: synthetic boundary finding',
                severity: { level: 'medium' },
                locations: [{ path: 'src/accounts.js', startLine: 3 }],
                taxonomy: { cwe: ['CWE-89'] },
                summary: 'Mock SDK response, not a security assessment.',
                codeEvidence: [{ code: '// synthetic test evidence' }],
                remediation: 'Review the mock integration only.',
                confidence: { level: 'low' },
              },
            ],
          },
        } as any;
      },
      async close() {},
    };
  },
});
export default {
  id: implementation.id,
  async setup(ctx: any) {
    const cleanup = await implementation.setup(ctx);
    const registration = await ctx.rpc.register(TestRpc, {
      inspect: async () => ({
        calls,
        operationCalls,
        constructorConfig,
        toolNames: (await ctx.tool.list()).map((t: any) => t.name),
      }),
      toolCall: async (input: any) => {
        const tool = (await ctx.tool.list()).find((t: any) => t.name === input.name);
        if (!tool) throw new Error('Missing tool');
        return { result: await tool.execute(input.args, input.context ?? {}) };
      },
    });
    return async () => {
      await registration.dispose();
      await cleanup?.();
    };
  },
};
