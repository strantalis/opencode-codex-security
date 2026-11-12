/** A minimal prepared plan for driving the scan adapter directly. */
export const plan = (repository, scan = {}) => ({
  id: 'plan',
  repository,
  scopePaths: [],
  scanPrompt: '',
  contextFiles: [],
  settings: {
    codex: {
      provider: 'openai',
      model: 'gpt-test',
      reasoningEffort: 'high',
      daybreak: false,
      auth: 'Codex Security sign-in',
    },
    scan: { mode: 'standard', maxCostUsd: 1, ...scan },
  },
  globalConfigFile: '/nowhere/codex-security.json',
  sdk: { codexOverrides: {}, auth: 'auto' },
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  mock: true,
  inputs: {},
});
