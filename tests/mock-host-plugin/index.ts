import { createSecurityPlugin } from '../../src/plugin.ts';
import { resolve } from 'node:path';
import { Rpc } from '@opencode/plugin/rpc';
import { scanInputSchema } from '../../src/rpc.ts';
export const TestRpc = Rpc.define({
  id: 'gill.security.mock-test',
  events: {},
  methods: {
    prepareByTool: { input: scanInputSchema, output: { type: 'object' } },
    inspect: { input: { type: 'object' }, output: { type: 'object' } },
    toolCall: {
      input: {
        type: 'object',
        properties: { name: { type: 'string' }, args: { type: 'object' } },
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
        options?.onLifecycle?.({ scanId: 'mock-sdk-1' } as any);
        options?.onProgress?.({ phase: 'discovery', filesCompleted: 1, filesTotal: 4 } as any);
        options?.onCost?.({ estimatedUsd: 0.12 } as any);
        options?.onWorkerStatus?.({ phase: 'file_review', planned: 2, started: 1 } as any);
        options?.onDeepProgress?.({ completed: 1, active: 1, maximum: 4 } as any);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        options?.signal?.throwIfAborted();
        return {
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
      prepareByTool: async (input: unknown) => {
        const tools = await ctx.tool.list();
        const tool = tools.find((t: any) => t.name === 'security_prepare_scan');
        if (!tool) throw new Error('Registered model tool missing');
        return { result: await tool.execute(input, {}) };
      },
      inspect: async () => ({
        calls,
        operationCalls,
        constructorConfig,
        toolNames: (await ctx.tool.list()).map((t: any) => t.name),
      }),
      toolCall: async (input: any) => {
        const tool = (await ctx.tool.list()).find((t: any) => t.name === input.name);
        if (!tool) throw new Error('Missing tool');
        return { result: await tool.execute(input.args, {}) };
      },
    });
    return async () => {
      await registration.dispose();
      await cleanup?.();
    };
  },
};
