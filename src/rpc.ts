import { Rpc } from '@opencode/plugin/rpc';
const empty = { type: 'object', additionalProperties: false } as const;
export const scanInputSchema = {
  type: 'object',
  properties: {
    mode: {
      type: 'string',
      enum: ['standard', 'deep'],
      description:
        'Optional mode for this scan. Explicit user request wins; otherwise omit to use global mode (standard by default). Do not ask when the request is clear.',
    },
    repository: {
      type: 'string',
      description: 'Optional local repository path. Defaults to current OpenCode project.',
    },
    scopePaths: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 32,
      description:
        'Existing paths relative to repository. Omit or use [] for whole repository. No globs or traversal.',
    },
    scanPrompt: {
      type: 'string',
      maxLength: 8000,
      description:
        'Focused security instructions and relevant architecture/threat assumptions. Ask the user for missing material context. Never copy whole conversation or include secrets.',
    },
    contextFiles: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 8,
      description:
        'Repository-relative text documentation to add as supporting context. No credentials or files outside repository.',
    },
  },
  additionalProperties: false,
} as const;
export const operationInputSchema = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['policy', 'validation'] },
    repository: { type: 'string' },
    path: { type: 'string' },
    contextFiles: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    finding: { anyOf: [{ type: 'string' }, { type: 'object' }] },
  },
  required: ['kind'],
  additionalProperties: false,
} as const;
const operationID = {
  type: 'object',
  properties: { operationId: { type: 'string' } },
  required: ['operationId'],
  additionalProperties: false,
} as const;
export const Security = Rpc.define({
  id: 'gill.security',
  methods: {
    capabilities: { input: empty, output: { type: 'object' } },
    operationPrepare: { input: operationInputSchema, output: { type: 'object' } },
    operationStart: {
      input: {
        type: 'object',
        properties: {
          operationId: { type: 'string' },
          approveOpenAIInference: { type: 'boolean' },
          approveUncappedValidation: { type: 'boolean' },
        },
        required: ['operationId'],
        additionalProperties: false,
      },
      output: { type: 'object' },
    },
    operationStatus: { input: operationID, output: { type: 'object' } },
    operationList: { input: empty, output: { type: 'object' } },
    operationAnswer: {
      input: {
        type: 'object',
        properties: {
          operationId: { type: 'string' },
          questionId: { type: 'string' },
          answer: { type: 'string', maxLength: 16384 },
        },
        required: ['operationId', 'questionId', 'answer'],
        additionalProperties: false,
      },
      output: { type: 'object' },
    },
    operationCancel: { input: operationID, output: { type: 'object' } },
    prepare: { input: scanInputSchema, output: { type: 'object' } },
    start: {
      input: {
        type: 'object',
        properties: { planId: { type: 'string' }, approveOpenAIInference: { type: 'boolean' } },
        additionalProperties: false,
      },
      output: { type: 'object' },
    },
    list: { input: empty, output: { type: 'object' } },
    status: {
      input: {
        type: 'object',
        properties: { runId: { type: 'string' }, planId: { type: 'string' } },
        additionalProperties: false,
      },
      output: { type: 'object' },
    },
    cancel: {
      input: {
        type: 'object',
        properties: { runId: { type: 'string' } },
        additionalProperties: false,
      },
      output: { type: 'object' },
    },
  },
  events: {
    changed: { schema: { type: 'object' } },
    operationChanged: { schema: { type: 'object' } },
  },
});
export default Security;
