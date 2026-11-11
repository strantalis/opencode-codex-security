import type { Plugin } from '@opencode/plugin/tui';
import type { SecurityOperationState } from './core/security-operations';
import type { Finding } from './types';
import { describeInferenceRoute } from './plan-view';
import { findingText } from './scan-display';
import type { Store } from './tui/store';
import { costLine } from './tui/text';

/** Policy drafts and finding validation: prepare, approve, answer, cancel. */
export function createTuiOperations(
  ctx: Plugin.Context,
  store: Store,
  chooseTarget: () => Promise<string | undefined>,
  onPrepared: (operationId: string) => void,
) {
  const { client, location } = store;

  /** Confirm and start a prepared operation. */
  const approve = async (op: SecurityOperationState) => {
    const plan = op.plan;
    const subject =
      op.kind === 'policy'
        ? `Component: ${plan.path ?? '.'}`
        : `Finding: ${(plan.finding ?? '').split('\n')[0]}`;
    const destination = plan.mock
      ? 'Mock SDK responses; no model calls.'
      : `Sends source${op.kind === 'validation' ? ', the finding' : ''} and context to ${describeInferenceRoute(plan.settings)}.`;
    const cost = op.kind === 'policy' ? costLine(plan.settings.scan.maxCostUsd) : plan.costNotice;
    const outcome =
      op.kind === 'policy'
        ? 'Produces a draft for you to review; no files are written.'
        : 'Reads source only; nothing is executed or patched.';
    const confirmed = await ctx.ui.dialog.confirm({
      title: op.kind === 'policy' ? 'Draft a policy' : 'Validate a finding',
      message: [`Repository: ${op.repository}`, subject, '', destination, cost, outcome].join('\n'),
      label: { confirm: 'Start', cancel: 'Back' },
    });
    if (!confirmed || store.isDisposed()) return;
    await client.operationStart({ operationId: op.operationId }, { location });
    await store.refreshOperations();
  };

  const prepare = async (input: Record<string, unknown>) => {
    const op = (await client.operationPrepare(input as never, {
      location,
    })) as unknown as SecurityOperationState;
    await store.refreshOperations();
    onPrepared(op.operationId);
    await approve(op);
  };

  const draftPolicy = () =>
    store.perform(async () => {
      const repository = await chooseTarget();
      if (!repository) return;
      const path = await ctx.ui.dialog.prompt({
        title: 'Draft a policy',
        description: `Directory in ${repository} to cover. Leave empty for the whole project.`,
        placeholder: 'src/api',
      });
      if (path === undefined) return;
      await prepare({ kind: 'policy', repository, ...(path.trim() ? { path: path.trim() } : {}) });
    });

  const validate = (repository: string, finding: Finding) =>
    store.perform(() => prepare({ kind: 'validation', repository, finding: findingText(finding) }));

  /** Validate free text when there is no scan finding to start from. */
  const validateText = () =>
    store.perform(async () => {
      const repository = await chooseTarget();
      if (!repository) return;
      const finding = await ctx.ui.dialog.prompt({
        title: 'Validate a finding',
        description: `Describe the suspected issue in ${repository}: location and evidence. Leave out secrets.`,
      });
      if (!finding?.trim()) return;
      await prepare({ kind: 'validation', repository, finding });
    });

  const start = (op: SecurityOperationState) => store.perform(() => approve(op));

  const answer = (op: SecurityOperationState) =>
    store.perform(async () => {
      const question = op.question;
      if (!question) return;
      const reply = await ctx.ui.dialog.prompt({
        title: 'Answer policy questions',
        description:
          question.questions.map((q, index) => `${index + 1}. ${q}`).join('\n') +
          '\n\nAnswer each one, or say what you do not know. Leave out secrets.',
      });
      if (!reply?.trim()) return;
      await client.operationAnswer(
        { operationId: op.operationId, questionId: question.id, answer: reply },
        { location },
      );
      await store.refreshOperations();
    });

  const cancel = (op: SecurityOperationState) =>
    store.perform(async () => {
      await client.operationCancel({ operationId: op.operationId }, { location });
      await store.refreshOperations();
    });

  return { draftPolicy, validate, validateText, start, answer, cancel };
}

export type TuiOperations = ReturnType<typeof createTuiOperations>;
