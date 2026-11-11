import { Rpc } from '@opencode/plugin/rpc';
const empty = { type: 'object', additionalProperties: false } as const;
const setupErrors = { 'security.setup': empty } as const;
export const scanInputSchema = {
  type: 'object',
  properties: {
    mode: {
      type: 'string',
      enum: ['standard', 'deep'],
      description: 'Omit to use the configured default (standard). Deep is slower and costs more.',
    },
    repository: {
      type: 'string',
      description:
        'Repository path. Defaults to the current workspace. May be a folder holding several checkouts.',
    },
    scopePaths: {
      type: 'array',
      items: { type: 'string' },
      description: 'Paths relative to the repository. Omit to scan the whole repository.',
    },
    changes: {
      type: 'string',
      description:
        'Scan only a diff: "uncommitted" for staged and unstaged changes, or a base ref such as "origin/main" to compare with HEAD. Standard mode only; not combined with scopePaths.',
    },
    scanPrompt: {
      type: 'string',
      description:
        'What to focus on, plus architecture or threat assumptions the scan should know.',
    },
    contextFiles: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Context files or directories, relative to the repository or absolute (other checkouts are fine). A file may be any UTF-8 text (Markdown, Terraform, YAML, JSON), PDF or DOCX. A directory contributes all its text, PDF and DOCX files. No symlinks.',
    },
  },
  additionalProperties: false,
} as const;
export const operationInputSchema = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['policy', 'validation', 'fix'] },
    repository: { type: 'string' },
    path: { type: 'string' },
    contextFiles: { type: 'array', items: { type: 'string' } },
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
const text = { type: 'string' } as const;
const output = { type: 'object' } as const;
const errors = setupErrors;
export const Security = Rpc.define({
  id: 'gill.security',
  methods: {
    capabilities: { input: empty, output, errors },
    prepare: { input: scanInputSchema, output, errors },
    start: {
      input: { type: 'object', properties: { planId: text }, additionalProperties: false },
      output,
      errors,
    },
    list: { input: empty, output, errors },
    status: {
      input: {
        type: 'object',
        properties: { runId: text, planId: text },
        additionalProperties: false,
      },
      output,
      errors,
    },
    cancel: {
      input: { type: 'object', properties: { runId: text }, additionalProperties: false },
      output,
      errors,
    },
    operationPrepare: { input: operationInputSchema, output, errors },
    operationStart: { input: operationID, output, errors },
    operationStatus: { input: operationID, output, errors },
    operationList: { input: empty, output, errors },
    operationAnswer: {
      input: {
        type: 'object',
        properties: { operationId: text, questionId: text, answer: text },
        required: ['operationId', 'questionId', 'answer'],
        additionalProperties: false,
      },
      output,
      errors,
    },
    operationCancel: { input: operationID, output, errors },
    operationResolve: {
      input: {
        type: 'object',
        properties: { operationId: text, action: { type: 'string', enum: ['apply', 'discard'] } },
        required: ['operationId', 'action'],
        additionalProperties: false,
      },
      output,
      errors,
    },
    setup: { input: empty, output, errors },
    setProfile: {
      input: {
        type: 'object',
        properties: { profile: text },
        required: ['profile'],
        additionalProperties: false,
      },
      output,
      errors,
    },
  },
  events: {
    changed: { schema: { type: 'object' } },
    operationChanged: { schema: { type: 'object' } },
  },
});
export default Security;
