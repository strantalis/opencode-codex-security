/** @jsxImportSource @opentui/solid */
import type { Plugin } from '@opencode/plugin/tui';
import { createSignal, For, Show } from 'solid-js';
import type { ScanInputs, ScanPlan } from '../core/scan-plan';
import { describeInferenceRoute, describePlan, isAbsoluteLocalDirectory } from '../plan-view';
import { scopeLabel, userError } from '../scan-display';
import type { Colors } from './theme';
import { costLine, splitList } from './text';

type Depth = 'default' | 'standard' | 'deep';
type Edit = 'target' | 'scope' | 'focus' | 'context';
type Action = 'start' | 'back' | Edit;

const nextDepth: Record<Depth, Depth> = { default: 'standard', standard: 'deep', deep: 'default' };

/** Inputs that reproduce `plan`, including the resolved repository. */
export const planInputs = (plan: ScanPlan): ScanInputs => ({
  ...plan.inputs,
  repository: plan.repository,
});

export function withDepth(inputs: ScanInputs, depth: Depth): ScanInputs {
  const { mode: _previous, ...rest } = inputs;
  return depth === 'default' ? rest : { ...rest, mode: depth };
}

/**
 * The scan review owns every scan option. Each change re-runs `prepare`, so
 * the preview shown is always the one that will start. Resolves with the plan
 * to start, or undefined when the user goes back.
 */
export async function reviewScan(
  ctx: Plugin.Context,
  color: Colors,
  prepare: (inputs: ScanInputs) => Promise<ScanPlan>,
  first: ScanPlan,
): Promise<ScanPlan | undefined> {
  const [plan, setPlan] = createSignal(first);
  const [error, setError] = createSignal('');
  const [preparing, setPreparing] = createSignal(false);
  const [settings, setSettings] = createSignal(false);
  const update = async (inputs: ScanInputs) => {
    setPreparing(true);
    setError('');
    try {
      setPlan(await prepare(inputs));
    } catch (e) {
      setError(userError(e));
    } finally {
      setPreparing(false);
    }
  };
  const cycleDepth = () => {
    const current = plan().inputs.mode ?? 'default';
    void update(withDepth(planInputs(plan()), nextDepth[current]));
  };

  const show = () =>
    new Promise<Action>((resolve) => {
      let settled = false;
      const finish = (action: Action) => {
        if (settled) return;
        settled = true;
        resolve(action);
      };
      ctx.ui.dialog.show(
        () => (
          <Review
            ctx={ctx}
            color={color}
            plan={plan()}
            error={error()}
            preparing={preparing()}
            settings={settings()}
            onDepth={cycleDepth}
            onSettings={() => setSettings((value) => !value)}
            onAction={finish}
          />
        ),
        () => finish('back'),
      );
      ctx.ui.dialog.set({ size: 'xlarge' });
    });

  for (;;) {
    const action = await show();
    if (action === 'back') return;
    if (action === 'start') {
      ctx.ui.dialog.clear();
      return plan();
    }
    try {
      const inputs = await edit(ctx, action, plan());
      if (inputs) await update(inputs);
    } catch (e) {
      setError(userError(e));
    }
  }
}

/** Ask for one field. Prompts replace the review dialog, which reopens afterwards. */
async function edit(ctx: Plugin.Context, field: Edit, plan: ScanPlan) {
  const inputs = planInputs(plan);
  if (field === 'target') {
    const value = await ctx.ui.dialog.prompt({
      title: 'Target repository',
      description: 'Absolute path to a local repository.',
      value: plan.repository,
      placeholder: '/path/to/project',
    });
    if (value === undefined || value.trim() === plan.repository) return;
    // Scope and context paths belong to the previous repository.
    return {
      repository: validTarget(value.trim()),
      ...(inputs.mode ? { mode: inputs.mode } : {}),
      ...(inputs.scanPrompt ? { scanPrompt: inputs.scanPrompt } : {}),
    } satisfies ScanInputs;
  }
  if (field === 'scope') {
    const value = await ctx.ui.dialog.prompt({
      title: 'Scope',
      description:
        'Paths separated by commas, or leave empty for everything. For a diff scan, type "uncommitted" or "since origin/main".',
      value: plan.changes
        ? plan.changes === 'uncommitted'
          ? 'uncommitted'
          : `since ${plan.changes}`
        : plan.scopePaths.join(', '),
      placeholder: 'src/api, src/auth',
    });
    if (value === undefined) return;
    const { scopePaths: _paths, changes: _changes, ...rest } = inputs;
    const text = value.trim();
    if (text === 'uncommitted') return { ...rest, changes: text };
    if (text.startsWith('since ')) return { ...rest, changes: text.slice(6).trim() };
    return { ...rest, scopePaths: splitList(value) };
  }
  if (field === 'focus') {
    const value = await ctx.ui.dialog.prompt({
      title: 'Focus',
      description: 'What the scan should concentrate on, and any threat assumptions.',
      value: plan.scanPrompt,
      placeholder: 'Tenant isolation in the billing API',
    });
    if (value === undefined) return;
    const { scanPrompt: _previous, ...rest } = inputs;
    return value.trim() ? { ...rest, scanPrompt: value.trim() } : rest;
  }
  const value = await ctx.ui.dialog.prompt({
    title: 'Context files',
    description: 'Repository-relative docs to include, separated by commas.',
    value: plan.contextFiles.map((file) => file.path).join(', '),
    placeholder: 'docs/threat-model.md',
  });
  return value === undefined ? undefined : { ...inputs, contextFiles: splitList(value) };
}

export function validTarget(path: string) {
  if (!isAbsoluteLocalDirectory(path)) throw new Error('Use an absolute repository path.');
  return path;
}

function Review(props: {
  ctx: Plugin.Context;
  color: Colors;
  plan: ScanPlan;
  error: string;
  preparing: boolean;
  settings: boolean;
  onDepth: () => void;
  onSettings: () => void;
  onAction: (action: Action) => void;
}) {
  const idle = () => !props.preparing;
  props.ctx.keymap.layer(() => ({
    mode: 'modal',
    priority: 100,
    commands: [
      { bind: 'y', title: 'Start scan', enabled: idle, run: () => props.onAction('start') },
      { bind: 't', title: 'Change target', enabled: idle, run: () => props.onAction('target') },
      { bind: 'd', title: 'Change depth', enabled: idle, run: props.onDepth },
      { bind: 's', title: 'Change scope', enabled: idle, run: () => props.onAction('scope') },
      { bind: 'f', title: 'Change focus', enabled: idle, run: () => props.onAction('focus') },
      { bind: 'c', title: 'Change context', enabled: idle, run: () => props.onAction('context') },
      { bind: 'i', title: 'Toggle settings', run: props.onSettings },
    ],
  }));
  const depth = () =>
    `${props.plan.settings.scan.mode}${props.plan.inputs.mode ? '' : ' (default)'}`;
  const rows = (): [string, string][] => [
    ['Repository', props.plan.repository],
    ['Depth', depth()],
    ['Scope', scopeLabel(props.plan)],
    ['Focus', props.plan.scanPrompt || '—'],
    ['Context', props.plan.contextFiles.map((file) => file.path).join(', ') || '—'],
    ['Route', describeInferenceRoute(props.plan.settings)],
  ];
  return (
    <box flexDirection="column" paddingLeft={2} paddingRight={2} paddingBottom={1} gap={1}>
      <text fg={props.color.accent()}>
        <b>{props.plan.mock ? 'Review mock scan' : 'Review this scan'}</b>
      </text>
      <box flexDirection="column">
        <For each={rows()}>
          {([label, value]) => (
            <box flexDirection="row">
              <text fg={props.color.muted()} width={12} flexShrink={0}>
                {label}
              </text>
              <text>{value}</text>
            </box>
          )}
        </For>
      </box>
      <Show
        when={!props.plan.mock}
        fallback={<text fg={props.color.muted()}>Mock SDK responses; no model calls.</text>}
      >
        <box flexDirection="column">
          <text>Starting sends the source in scope and the context files over this route.</text>
          <text fg={props.color.muted()}>{costLine(props.plan.settings.scan.maxCostUsd)}</text>
        </box>
      </Show>
      <Show when={props.preparing}>
        <text fg={props.color.muted()}>Updating preview…</text>
      </Show>
      <Show when={props.error}>
        <text fg={props.color.error()}>{props.error}</text>
      </Show>
      <Show when={props.settings}>
        <text fg={props.color.muted()}>{describePlan(props.plan)}</text>
      </Show>
      <text fg={props.color.muted()}>
        y start · t target · d depth · s scope · f focus · c context · i settings · esc back
      </text>
    </box>
  );
}
