/** @jsxImportSource @opentui/solid */
import { Plugin } from '@opencode/plugin/tui';
import { createSignal, For, Show } from 'solid-js';
import { Security } from './rpc';
import { asState, type ScanList } from './types';
import type { ScanInputs, ScanPlan } from './core/scan-plan';
import { describePlan, withScanMode } from './plan-view';
import { createTuiOperations } from './security-tui-operations';
import {
  elapsedLabel,
  phaseLabel,
  progressLabel,
  runTitle,
  scanScope,
  userError,
} from './scan-display';

export default Plugin.define({
  id: 'gill.security.tui',
  setup(ctx) {
    const [catalog, setCatalog] = createSignal<ScanList>();
    const [selected, select] = createSignal<string>();
    const [error, setError] = createSignal('');
    const [busy, setBusy] = createSignal(false);
    const [now, setNow] = createSignal(Date.now());
    const [nextInputs, setNextInputs] = createSignal<ScanInputs>({});
    let stopped = false,
      polling = false;
    const location = ctx.location ?? ctx.data.location.default();
    const client = ctx.client.rpc(Security);
    const runs = () => catalog()?.runs ?? [];
    const current = () => runs().find((run) => run.runId === selected()) ?? runs()[0];
    const open = () => ctx.ui.router.navigate({ type: 'plugin', name: 'security' });
    const operations = createTuiOperations(ctx, location, current, open);
    const active = () => runs().filter((run) => run.status === 'running').length;
    const refresh = async () => {
      if (stopped || polling) return;
      polling = true;
      try {
        const next = (await client.list({}, { location })) as unknown as ScanList;
        if (!stopped) setCatalog(next);
      } catch (e) {
        if (!stopped) setError(userError(e));
      } finally {
        polling = false;
      }
    };
    const review = (plan: ScanPlan) =>
      new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (approved: boolean) => {
          if (settled) return;
          settled = true;
          resolve(approved);
          ctx.ui.dialog.clear();
        };
        const Review = () => {
          const [advanced, setAdvanced] = createSignal(false);
          ctx.keymap.layer(() => ({
            mode: 'global',
            priority: 1000,
            commands: [
              { bind: 'ctrl+y', title: 'Approve and start', run: () => finish(true) },
              {
                bind: 'ctrl+d',
                title: 'Toggle advanced details',
                run: () => setAdvanced((v) => !v),
              },
              { bind: 'escape', title: 'Back without starting', run: () => finish(false) },
            ],
          }));
          return (
            <box flexDirection="column" padding={1} gap={1}>
              <text fg="#9be4c6">{plan.mock ? 'Review mock scan' : 'Review this scan'}</text>
              <scrollbox height={Math.max(6, Math.min(22, ctx.renderer.height - 12))} focused>
                <box flexDirection="column" gap={1}>
                  <text>Repository: {plan.repository}</text>
                  <text>
                    Scope: {plan.scopePaths.join(', ') || 'Whole repository'} · Depth:{' '}
                    {plan.settings.scan.mode}
                  </text>
                  <Show when={plan.scanPrompt}>
                    <text>Focus: {plan.scanPrompt}</text>
                  </Show>
                  <Show when={plan.contextFiles.length}>
                    <text>Context: {plan.contextFiles.map((file) => file.path).join(', ')}</text>
                  </Show>
                  <Show
                    when={!plan.mock}
                    fallback={
                      <text>Mock SDK responses only. No model calls or source uploads.</text>
                    }
                  >
                    <text>
                      Repository source and listed context will be sent to OpenAI. Results stay
                      local.
                    </text>
                    <text>
                      Estimated stop: USD {plan.settings.scan.maxCostUsd} for this scan. Not a hard
                      cap; in-flight usage may exceed it.
                    </text>
                    <text>
                      Conversation history is not copied. Scope guides the scan; it is not a
                      filesystem sandbox.
                    </text>
                  </Show>
                  <Show when={advanced()}>
                    <text>{describePlan(plan)}</text>
                  </Show>
                </box>
              </scrollbox>
              <text>
                Ctrl+Y: {plan.mock ? 'start mock scan' : 'approve and start'} · Ctrl+D:{' '}
                {advanced() ? 'hide' : 'show'} settings · Esc: back
              </text>
            </box>
          );
        };
        ctx.ui.dialog.show(
          () => <Review />,
          () => {
            if (!settled) {
              settled = true;
              resolve(false);
            }
          },
        );
        ctx.ui.dialog.set({ size: 'xlarge', centered: true });
      });
    const start = async () => {
      if (busy() || stopped) return;
      setBusy(true);
      setError('');
      try {
        await refresh();
        if (active() >= (catalog()?.maxConcurrent ?? 2))
          throw new Error('All scan slots are in use. Start another scan after one finishes.');
        let input = {};
        if (!catalog()?.engine?.startsWith('local-patterns')) {
          const draft = catalog()?.drafts.find(
            (d) => d.plan && !d.planConsumed && Date.parse(d.plan.expiresAt) > Date.now(),
          );
          const prepared = draft ?? asState(await client.prepare(nextInputs(), { location }));
          const plan = prepared.plan!;
          if (!plan) throw new Error('No scan preview returned. Nothing was started.');
          if (!(await review(plan)) || stopped) return;
          input = { planId: plan.id, approveOpenAIInference: true };
        }
        const result = asState(await client.start(input, { location }));
        if (!stopped) {
          select(result.runId);
          await refresh();
        }
      } catch (e) {
        if (!stopped) setError(userError(e));
      } finally {
        if (!stopped) setBusy(false);
      }
    };
    const chooseRun = async () => {
      await refresh();
      if (!runs().length) {
        await ctx.ui.dialog.alert({
          title: 'Scans',
          message: 'No scans yet. Use /security-scan to review and start one.',
        });
        return;
      }
      const id = await ctx.ui.dialog.select({
        title: 'Choose a scan',
        current: current()?.runId,
        options: runs().map((run) => ({
          title: `${run.status.toUpperCase()} · ${runTitle(run)}`,
          description: `${scanScope(run)} · ${run.mode ?? 'fixture'} · ${run.runId?.slice(0, 8)}`,
          value: run.runId!,
        })),
      });
      if (id && !stopped) select(id);
    };
    const cancel = async () => {
      const run = current();
      if (!run?.runId || run.status !== 'running') {
        await ctx.ui.dialog.alert({
          title: 'Cancel scan',
          message: 'Select a running scan with /security-scans first.',
        });
        return;
      }
      if (busy()) return;
      setBusy(true);
      setError('');
      try {
        await client.cancel({ runId: run.runId }, { location });
        await refresh();
      } catch (e) {
        if (!stopped) setError(userError(e));
      } finally {
        if (!stopped) setBusy(false);
      }
    };
    void refresh();
    const timer = setInterval(() => {
      setNow(Date.now());
      void refresh();
      void operations.refresh();
    }, 1500);
    const view = () => (
      <scrollbox height="100%" focused>
        <box flexDirection="column" padding={1} gap={1}>
          <text fg="#9be4c6">Security</text>
          <text>
            {active()
              ? `${active()} of ${catalog()?.maxConcurrent ?? 2} scans running`
              : 'Review code, then follow each scan here.'}
          </text>
          <text>/security-scan: new scan · /security-scans: switch scan · Esc: back</text>
          <Show when={operations.questionCount()}>
            <text fg="#9be4c6">
              {operations.questionCount()} operation(s) need your answer. /security-operations to
              select.
            </text>
          </Show>
          <Show when={operations.visible()} fallback={<></>}>
            {operations.view()}
          </Show>
          <Show when={!operations.visible()}>
            <Show when={error()}>
              <text fg="#ffb3b3">{error()}</text>
            </Show>
            <Show when={catalog()?.historyError}>
              <text fg="#ffb3b3">{catalog()?.historyError}</text>
            </Show>
            <Show when={runs().length}>
              <box flexDirection="column" gap={0}>
                <text>RECENT SCANS</text>
                <For each={runs().slice(0, 6)}>
                  {(run) => (
                    <text fg={run.runId === current()?.runId ? '#9be4c6' : undefined}>
                      {run.runId === current()?.runId ? '> ' : '  '}
                      {run.status.toUpperCase()} · {runTitle(run)} · {run.mode ?? 'fixture'} ·{' '}
                      {run.runId?.slice(0, 8)}
                    </text>
                  )}
                </For>
              </box>
            </Show>
            <Show
              when={current()}
              fallback={
                <text>
                  No scans yet. Preparation makes no model calls. Each scan starts only after
                  approval.
                </text>
              }
            >
              {(run) => (
                <box flexDirection="column" gap={1}>
                  <text fg="#9be4c6">{runTitle(run())}</text>
                  <text>{run().repository}</text>
                  <text>
                    {scanScope(run())} · {run().mode ?? 'Fixture pattern checks'}
                  </text>
                  <text>
                    {phaseLabel(run().phase)} ·{' '}
                    {elapsedLabel(run().startedAt, run().finishedAt, now())}
                  </text>
                  <Show when={run().status === 'running'}>
                    <text>{progressLabel(run())}. Counts are for the current phase.</text>
                    <text>
                      Findings appear when the scan finishes. /security-cancel stops only this scan.
                    </text>
                  </Show>
                  <Show when={run().estimatedCostUsd !== undefined}>
                    <text>Estimated usage: USD {(run().estimatedCostUsd ?? 0).toFixed(2)}</text>
                  </Show>
                  <Show when={run().workers}>
                    <text>
                      Workers started: {run().workers?.started} of {run().workers?.planned} planned
                    </text>
                  </Show>
                  <Show when={run().status === 'running' && run().deepProgress}>
                    <text>
                      Deep passes: {run().deepProgress?.completed} complete ·{' '}
                      {run().deepProgress?.active} active
                    </text>
                  </Show>
                  <Show when={run().error}>
                    <text fg="#ffb3b3">{run().error}</text>
                  </Show>
                  <Show when={run().status === 'cancelled'}>
                    <text>Cancelled. This scan is incomplete, not a clean result.</text>
                  </Show>
                  <Show when={run().status === 'completed'}>
                    <text>
                      {run().findings.length} findings reported. /security-findings to inspect
                      evidence. No findings does not guarantee the repository is secure.
                    </text>
                  </Show>
                  <For each={run().findings.slice(0, 5)}>
                    {(finding) => (
                      <text>
                        {finding.severity.toUpperCase()} · {finding.title} · {finding.path}:
                        {finding.line}
                      </text>
                    )}
                  </For>
                  <text>ACTIVITY · latest first</text>
                  <For each={[...run().events].reverse().slice(0, 8)}>
                    {(event) => (
                      <text>
                        {new Date(event.time).toLocaleTimeString()} · {event.message}
                      </text>
                    )}
                  </For>
                </box>
              )}
            </Show>
          </Show>
        </box>
      </scrollbox>
    );
    const unregister = ctx.ui.router.register({ name: 'security', render: view });
    ctx.keymap.layer(() => ({
      mode: 'global',
      commands: [
        ...operations.commands,
        {
          id: 'security.back',
          title: 'Security: return home',
          bind: 'escape',
          enabled: () => {
            const route = ctx.ui.router.current();
            return !busy() && route.type === 'plugin' && route.name === 'security';
          },
          run: () => ctx.ui.router.navigate({ type: 'home' }),
        },
        {
          id: 'security.open',
          title: 'Security: open scans',
          group: 'Security',
          palette: true,
          slash: { name: 'security' },
          run: () => {
            operations.close();
            open();
          },
        },
        {
          id: 'security.scan',
          title: 'Security: new scan',
          group: 'Security',
          palette: true,
          slash: { name: 'security-scan' },
          run: async () => {
            operations.close();
            open();
            await start();
          },
        },
        {
          id: 'security.runs',
          title: 'Security: choose a scan',
          group: 'Security',
          palette: true,
          slash: { name: 'security-scans' },
          run: async () => {
            operations.close();
            open();
            await chooseRun();
          },
        },
        {
          id: 'security.cancel',
          title: 'Security: cancel selected scan',
          group: 'Security',
          palette: true,
          slash: { name: 'security-cancel' },
          run: cancel,
        },
        {
          id: 'security.mode',
          title: 'Security: choose next scan depth',
          group: 'Security',
          palette: true,
          slash: { name: 'security-mode' },
          run: async () => {
            if (busy()) return;
            setBusy(true);
            setError('');
            try {
              const mode = await ctx.ui.dialog.select<'default' | 'standard' | 'deep'>({
                title: 'Depth for the next scan',
                current: nextInputs().mode ?? 'default',
                options: [
                  {
                    title: 'Global default',
                    description: 'Use the configured depth.',
                    value: 'default',
                  },
                  { title: 'Standard', description: 'Standard security scan.', value: 'standard' },
                  {
                    title: 'Deep',
                    description: 'Additional work; can take longer and cost more.',
                    value: 'deep',
                  },
                ],
              });
              if (!mode || stopped) return;
              const draft = catalog()?.drafts[0]?.plan;
              const input = withScanMode(draft?.inputs ?? nextInputs(), mode);
              setNextInputs(input);
              await client.prepare(input, { location });
              await refresh();
              open();
            } catch (e) {
              if (!stopped) setError(userError(e));
            } finally {
              if (!stopped) setBusy(false);
            }
          },
        },
        {
          id: 'security.findings',
          title: 'Security: inspect selected scan findings',
          group: 'Security',
          palette: true,
          slash: { name: 'security-findings' },
          run: async () => {
            const run = current(),
              found = run?.findings ?? [];
            if (!found.length) {
              await ctx.ui.dialog.alert({
                title: 'Findings',
                message:
                  run?.status === 'running'
                    ? 'This scan is still running. Findings are available at completion.'
                    : run?.status === 'completed'
                      ? 'No findings were reported by this completed scan. This is not a guarantee of security.'
                      : 'Select a completed scan with /security-scans to inspect its findings.',
              });
              return;
            }
            const id = await ctx.ui.dialog.select({
              title: 'Findings',
              options: found.map((f) => ({
                title: `${f.severity.toUpperCase()} ${f.title}`,
                description: `${f.path}:${f.line}`,
                value: f.id,
              })),
            });
            const f = found.find((f) => f.id === id);
            if (f)
              await ctx.ui.dialog.alert({
                title: f.title,
                message: `${f.path}:${f.line} · ${f.cwe}\n\n${f.summary}\n\n${f.evidence}\n\nSuggested next step: ${f.remediation}\n\nConfidence: ${f.confidence}`,
              });
          },
        },
      ],
    }));
    return () => {
      stopped = true;
      clearInterval(timer);
      operations.dispose();
      unregister();
    };
  },
});
