/** @jsxImportSource @opentui/solid */
import { describeInferenceRoute } from './plan-view';
import type { Plugin } from '@opencode/plugin/tui';
type Context = Plugin.Context;
type Commands = NonNullable<ReturnType<Parameters<Context['keymap']['layer']>[0]>['commands']>;
import { createSignal, For, Show } from 'solid-js';
import { Security } from './rpc';
import type { SecurityOperationState } from './core/security-operations';
import type { ScanState } from './types';
import { findingText, phaseLabel, userError } from './scan-display';

export function createTuiOperations(
  ctx: Context,
  location: { directory: string },
  scan: () => ScanState | undefined,
  open: () => void,
  chooseTarget: () => Promise<string | undefined>,
) {
  const client = ctx.client.rpc(Security);
  const [operations, setOperations] = createSignal<SecurityOperationState[]>([]);
  const [selected, select] = createSignal<string>();
  const [visible, setVisible] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal('');
  const [capabilities, setCapabilities] = createSignal({
    policy: false,
    validation: false,
    questionAnswers: false,
  });
  let stopped = false;
  const current = () => operations().find((op) => op.operationId === selected()) ?? operations()[0];
  const refresh = async () => {
    if (stopped || (!capabilities().policy && !capabilities().validation)) return;
    try {
      const result = (await client.operationList({}, { location })) as unknown as {
        operations: SecurityOperationState[];
      };
      if (!stopped) setOperations(result.operations);
    } catch (e) {
      if (!stopped && visible()) setError(userError(e));
    }
  };
  void client
    .capabilities({}, { location })
    .then((value) => {
      if (!stopped)
        setCapabilities(value as unknown as typeof capabilities extends () => infer T ? T : never);
    })
    .catch(() => {});
  const perform = async (action: () => Promise<unknown>) => {
    if (stopped || busy()) return;
    setBusy(true);
    setError('');
    try {
      await action();
      if (!stopped) await refresh();
    } catch (e) {
      if (!stopped) setError(userError(e));
    } finally {
      if (!stopped) setBusy(false);
    }
  };
  const show = () => {
    setVisible(true);
    open();
  };
  const approve = async (op: SecurityOperationState) => {
    const confirmed = await ctx.ui.dialog.confirm({
      title: op.kind === 'policy' ? 'Review policy generation' : 'Review source validation',
      message: `Repository: ${op.repository}\n${op.plan.path ? 'Component: ' + op.plan.path + '\n' : ''}Context: ${op.plan.contextFiles.map((file) => file.path).join(', ') || 'No additional documents'}\n\n${op.plan.mock ? 'Mock operation: no model calls or uploads.' : `Repository source, the selected finding if any, and listed context go to ${describeInferenceRoute(op.plan.settings)}.\n${op.plan.costNotice}`}\n\n${op.kind === 'policy' ? 'Returns a draft only. Existing files stay unchanged.' : 'Static source assessment only. No exploit execution or patch application.'}\n\nModel: ${op.plan.settings.codex.model} · ${op.plan.settings.codex.reasoningEffort} reasoning`,
      label: {
        confirm: op.plan.mock
          ? 'Start mock operation'
          : op.kind === 'validation'
            ? 'Approve without cost ceiling'
            : 'Approve and start',
        cancel: 'Back',
      },
    });
    if (!confirmed || stopped) return;
    await client.operationStart(
      {
        operationId: op.operationId,
        approveOpenAIInference: true,
        ...(op.kind === 'validation' ? { approveUncappedValidation: true } : {}),
      },
      { location },
    );
  };
  const commands: Commands = [
    {
      id: 'security.policy',
      title: 'Security: draft a policy',
      group: 'Security',
      palette: true,
      enabled: () => capabilities().policy,
      slash: { name: 'security-policy' },
      run: async () => {
        show();
        await perform(async () => {
          const repository = await chooseTarget();
          if (!repository || stopped) return;
          const path = await ctx.ui.dialog.prompt({
            title: 'Policy component',
            description: `Target: ${repository}. Repository-relative directory, or leave blank for the whole project. Preparation makes no model calls.`,
            placeholder: 'src/api',
          });
          if (path === undefined || stopped) return;
          const op = (await client.operationPrepare(
            { kind: 'policy', repository, ...(path.trim() ? { path: path.trim() } : {}) },
            { location },
          )) as unknown as SecurityOperationState;
          select(op.operationId);
          await refresh();
          await approve(op);
        });
      },
    },
    {
      id: 'security.validate',
      title: 'Security: validate a finding',
      group: 'Security',
      palette: true,
      enabled: () => capabilities().validation,
      slash: { name: 'security-validate' },
      run: async () => {
        show();
        await perform(async () => {
          const source = scan();
          let finding: string | undefined;
          let repository: string | undefined;
          if (source?.findings.length) {
            const id = await ctx.ui.dialog.select({
              title: `Finding to validate · ${source.repository}`,
              options: source.findings.map((f) => ({
                title: `${f.severity.toUpperCase()} ${f.title}`,
                description: `${f.path}:${f.line}`,
                value: f.id,
              })),
            });
            if (!id) return;
            finding = findingText(source.findings.find((f) => f.id === id)!);
            repository = source.repository;
          } else {
            repository = await chooseTarget();
            if (!repository || stopped) return;
            finding = await ctx.ui.dialog.prompt({
              title: 'Finding to validate',
              description: `Target: ${repository}. Describe the suspected issue, source location and evidence. Do not include secrets. Validation has no SDK cost ceiling.`,
            });
          }
          if (!finding?.trim() || stopped) return;
          const op = (await client.operationPrepare(
            { kind: 'validation', repository, finding },
            { location },
          )) as unknown as SecurityOperationState;
          select(op.operationId);
          await refresh();
          await approve(op);
        });
      },
    },
    {
      id: 'security.operations',
      title: 'Security: choose policy or validation work',
      group: 'Security',
      palette: true,
      enabled: () => capabilities().policy || capabilities().validation,
      slash: { name: 'security-operations' },
      run: async () => {
        show();
        await refresh();
        if (!operations().length) {
          await ctx.ui.dialog.alert({
            title: 'Security operations',
            message:
              'No policy or validation work yet. Use /security-policy or /security-validate to prepare one.',
          });
          return;
        }
        const id = await ctx.ui.dialog.select({
          title: 'Choose an operation',
          current: current()?.operationId,
          options: operations().map((op) => ({
            title: `${op.kind === 'policy' ? 'Policy' : 'Validation'} · ${phaseLabel(op.status)}`,
            description: `${op.repository} · ${op.operationId.slice(0, 8)}`,
            value: op.operationId,
          })),
        });
        if (id && !stopped) select(id);
      },
    },
    {
      id: 'security.operationStart',
      title: 'Security: review selected prepared operation',
      group: 'Security',
      palette: true,
      enabled: () => current()?.status === 'prepared',
      slash: { name: 'security-operation-start' },
      run: async () => {
        const op = current();
        if (op) await perform(() => approve(op));
      },
    },
    {
      id: 'security.answer',
      title: 'Security: answer policy questions',
      group: 'Security',
      palette: true,
      enabled: () => !!current()?.question,
      slash: { name: 'security-answer' },
      run: async () => {
        const op = current(),
          question = op?.question;
        if (!op || !question) return;
        show();
        await perform(async () => {
          const answer = await ctx.ui.dialog.prompt({
            title: 'Answer security questions',
            description:
              question.questions.map((q, index) => `${index + 1}. ${q}`).join('\n') +
              `\n\nAnswer each question or state what is unknown. Your answer will be sent to the already-approved route: ${describeInferenceRoute(op.plan.settings)}. Do not include secrets.`,
          });
          if (!answer?.trim() || stopped) return;
          await client.operationAnswer(
            { operationId: op.operationId, questionId: question.id, answer },
            { location },
          );
        });
      },
    },
    {
      id: 'security.operationCancel',
      title: 'Security: cancel selected operation',
      group: 'Security',
      palette: true,
      enabled: () => ['prepared', 'running', 'awaiting_answers'].includes(current()?.status ?? ''),
      slash: { name: 'security-operation-cancel' },
      run: async () => {
        const op = current();
        if (op)
          await perform(() =>
            client.operationCancel({ operationId: op.operationId }, { location }),
          );
      },
    },
    {
      id: 'security.operationResult',
      title: 'Security: read operation result',
      group: 'Security',
      palette: true,
      enabled: () => !!current()?.result,
      slash: { name: 'security-operation-result' },
      run: async () => {
        const op = current(),
          result = op?.result;
        if (!result) return;
        await ctx.ui.dialog.alert({
          title:
            result.kind === 'policy'
              ? 'Policy draft · not applied'
              : `Source assessment · ${phaseLabel(result.disposition)}`,
          message:
            (result.kind === 'policy'
              ? result.content + '\n\nReview notes:\n' + result.reviewNotes.join('\n')
              : result.report) +
            '\n\n' +
            (result.truncated
              ? 'Preview truncated. Read full local SDK artifacts.'
              : result.kind === 'policy'
                ? 'No repository files changed.'
                : 'Static assessment, not runtime reproduction.'),
        });
      },
    },
  ];
  const view = () => (
    <box flexDirection="column" gap={1}>
      <text>/security-operations: choose work · /security: return to scans</text>
      <Show when={error()}>
        <text fg="#ffb3b3">{error()}</text>
      </Show>
      <Show
        when={current()}
        fallback={
          <text>
            Prepare a policy draft with /security-policy or assess a finding with
            /security-validate.
          </text>
        }
      >
        {(op) => (
          <box flexDirection="column" gap={1}>
            <text fg="#9be4c6">
              {op().kind === 'policy' ? 'Policy draft' : 'Finding validation'} ·{' '}
              {phaseLabel(op().status)}
            </text>
            <text>Target: {op().repository}</text>
            <text>{op().phase}</text>
            <Show when={op().status === 'prepared'}>
              <text>/security-operation-start to review this operation before starting.</text>
            </Show>
            <Show when={op().question}>
              {(q) => (
                <box flexDirection="column">
                  <text>Your input is needed. /security-answer to respond.</text>
                  <For each={q().questions}>{(text) => <text>{text}</text>}</For>
                </box>
              )}
            </Show>
            <Show when={op().estimatedCostUsd !== undefined}>
              <text>Estimated usage: USD {(op().estimatedCostUsd ?? 0).toFixed(2)}</text>
            </Show>
            <Show when={op().error}>
              <text fg="#ffb3b3">{op().error}</text>
            </Show>
            <Show when={op().result}>
              <text>
                /security-operation-result to read{' '}
                {op().kind === 'policy'
                  ? 'the draft. No files have been applied.'
                  : 'the static assessment. This is not runtime reproduction.'}
              </text>
            </Show>
            <Show when={op().status === 'running' || op().status === 'awaiting_answers'}>
              <text>/security-operation-cancel stops only this operation.</text>
            </Show>
          </box>
        )}
      </Show>
    </box>
  );
  return {
    commands,
    view,
    visible,
    close: () => setVisible(false),
    refresh,
    questionCount: () => operations().filter((op) => op.status === 'awaiting_answers').length,
    dispose: () => {
      stopped = true;
    },
  };
}
