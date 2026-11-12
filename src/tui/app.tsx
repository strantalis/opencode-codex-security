/** @jsxImportSource @opentui/solid */
import type { Plugin } from '@opencode/plugin/tui';
import { createEffect, createSignal, on, onCleanup, onMount } from 'solid-js';
import { asState } from '../types';
import type { ScanInputs } from '../core/scan-plan';
import { describeInferenceRoute, isAbsoluteLocalDirectory } from '../plan-view';
import { createTuiOperations } from '../security-tui-operations';
import { planInputs, reviewScan, validTarget } from './review';
import { createStore } from './store';
import { colors } from './theme';
import { resumeProblem, sortedFindings, userError } from '../scan-display';
import type { SecurityOperationState } from '../core/security-operations';
import { cancellable, type SetupInfo } from './text';
import { SecurityView, type Key } from './view';

export const ROUTE = 'security';
type Route = ReturnType<Plugin.Context['ui']['router']['current']>;

/** Terminal Security view: state, actions and the key table behind the footer. */
export function createApp(ctx: Plugin.Context) {
  const store = createStore(ctx);
  const color = colors(ctx);
  const [tab, setTab] = createSignal<'scans' | 'operations'>('scans');
  const [focus, setFocus] = createSignal<'runs' | 'findings'>('runs');
  const [detail, setDetail] = createSignal<'finding' | 'operation'>();
  const [runId, setRunId] = createSignal<string>();
  const [findingIndex, setFindingIndex] = createSignal(0);
  const [operationId, setOperationId] = createSignal<string>();
  const [details, setDetails] = createSignal(false);
  const [setup, setSetup] = createSignal<SetupInfo>();
  // A setup problem (for example a missing API key) is reported by the SDK; show it as written.
  const loadSetup = () =>
    store.client
      .setup({}, { location: store.location })
      .then((value) => setSetup(value as unknown as SetupInfo))
      .catch((error) => store.setError(userError(error)));
  // While a sign-in is open in the browser, watch for it to finish.
  createEffect(() => {
    if (!setup()?.signIn?.pending) return;
    const timer = setInterval(() => void loadSetup(), 2000);
    onCleanup(() => clearInterval(timer));
  });
  const signIn = () =>
    store.perform(async () => {
      const call = { location: store.location };
      if (setup()?.signIn?.pending) await store.client.signInCancel({}, call);
      else {
        const device = await ctx.ui.dialog.select<boolean>({
          title: 'Sign in to Codex Security with ChatGPT',
          options: [
            { title: 'In my browser', description: 'Opens the sign-in page.', value: false },
            {
              title: 'With a device code',
              description: 'For a remote machine: shows a code to enter on another device.',
              value: true,
            },
          ],
        });
        if (device === undefined) return;
        await store.client.signIn({ device }, call);
      }
      await loadSetup();
    });
  const chooseProfile = () =>
    store.perform(async () => {
      const current = setup();
      if (!current) return;
      const profile = await ctx.ui.dialog.select<string>({
        title: 'Codex profile',
        current: current.profile ?? '',
        options: [
          { title: 'None', description: 'Use the Codex config as it is.', value: '' },
          ...current.profiles.map((name) => ({ title: name, value: name })),
        ],
      });
      if (profile === undefined) return;
      await store.client.setProfile({ profile }, { location: store.location });
      await loadSetup();
    });
  let origin: Route | undefined;

  const workspace = isAbsoluteLocalDirectory(ctx.location?.directory)
    ? ctx.location!.directory
    : undefined;
  const onRoute = () => {
    const route = ctx.ui.router.current();
    return route.type === 'plugin' && route.name === ROUTE;
  };
  const runs = store.runs;
  const run = () => runs().find((item) => item.runId === runId()) ?? runs()[0];
  const findings = () => (run() ? sortedFindings(run()!) : []);
  const finding = () => findings()[Math.min(findingIndex(), findings().length - 1)];
  const operation = () =>
    store.operations().find((op) => op.operationId === operationId()) ?? store.operations()[0];
  const waiting = () => store.operations().filter((op) => op.question);
  createEffect(on(runId, () => setFindingIndex(0), { defer: true }));

  const open = () => {
    if (!onRoute()) origin = ctx.ui.router.current();
    ctx.ui.router.navigate({ type: 'plugin', name: ROUTE });
  };
  const leave = () => ctx.ui.router.navigate(origin ?? { type: 'home' });
  const chooseTarget = async () => {
    if (workspace) return workspace;
    const value = await ctx.ui.dialog.prompt({
      title: 'Target repository',
      description: 'Absolute path to a local repository.',
      placeholder: '/path/to/project',
    });
    return value?.trim() ? validTarget(value.trim()) : undefined;
  };
  const operations = createTuiOperations(ctx, store, chooseTarget, (id) => {
    setOperationId(id);
    setTab('operations');
    setDetail(undefined);
  });

  /** `again` reopens a finished scan's target and settings for review. */
  const newScan = (again?: ScanInputs) =>
    store.perform(async () => {
      await store.refreshScans();
      const list = store.catalog();
      const max = list?.maxConcurrent ?? 2;
      if (runs().filter((item) => item.status === 'running').length >= max)
        throw new Error(`All ${max} scan slots are in use. Start another when one finishes.`);
      const repository = again?.repository ?? (await chooseTarget());
      if (!repository) return;
      const prepare = async (inputs: ScanInputs) => {
        const plan = asState(await store.client.prepare(inputs, { location: store.location })).plan;
        if (!plan) throw new Error('The server returned no preview.');
        return plan;
      };
      const plan = await reviewScan(ctx, color, prepare, await prepare(again ?? { repository }));
      if (!plan) return;
      const started = asState(
        await store.client.start({ planId: plan.id }, { location: store.location }),
      );
      setTab('scans');
      setDetail(undefined);
      setFocus('runs');
      setRunId(started.runId);
      await store.refreshScans();
    });

  /** Continue an interrupted Deep scan. The confirmation is the approval. */
  const resumeScan = () =>
    store.perform(async () => {
      const target = run();
      if (!target?.runId) return;
      const plan = asState(
        await store.client.prepare({ resumeRunId: target.runId }, { location: store.location }),
      ).plan;
      if (!plan) throw new Error('The server returned no preview.');
      const confirmed = await ctx.ui.dialog.confirm({
        title: 'Resume scan',
        message: `Continue the Deep scan of ${plan.repository} where it stopped? Source is sent over ${describeInferenceRoute(plan.settings)}.`,
        label: { confirm: 'Resume', cancel: 'Not now' },
      });
      if (!confirmed) return;
      const started = asState(
        await store.client.start({ planId: plan.id }, { location: store.location }),
      );
      setRunId(started.runId);
      await store.refreshScans();
    });

  const cancelScan = () =>
    store.perform(async () => {
      const target = run();
      if (target?.status !== 'running') return;
      const confirmed = await ctx.ui.dialog.confirm({
        title: 'Cancel scan',
        message: `Stop the scan of ${target.repository}? Findings it has already saved are kept as partial results.`,
        label: { confirm: 'Cancel scan', cancel: 'Keep running' },
      });
      if (!confirmed) return;
      await store.client.cancel({ runId: target.runId }, { location: store.location });
      await store.refreshScans();
    });

  /** Validate the selected finding, else pick one from the selected scan, else describe one. */
  const validate = async () => {
    const source = run();
    if (!source?.findings.length) return operations.validateText();
    let selected = detail() === 'finding' || focus() === 'findings' ? finding() : undefined;
    if (!selected) {
      const id = await ctx.ui.dialog.select({
        title: `Validate a finding · ${source.repository}`,
        options: source.findings.map((f) => ({
          title: `${f.severity.toUpperCase()} ${f.title}`,
          description: `${f.path}:${f.line}`,
          value: f.id,
        })),
      });
      selected = source.findings.find((f) => f.id === id);
    }
    if (selected) await operations.validate(source, selected);
  };

  let scroller:
    { scrollBy(delta: number): void; scrollChildIntoView(id: string): void } | undefined;
  const move = (delta: number) => {
    if (detail()) return scroller?.scrollBy(delta);
    if (tab() === 'operations') {
      const list = store.operations();
      const index = list.indexOf(operation()!);
      const next = list[Math.max(0, Math.min(list.length - 1, index + delta))];
      if (next) setOperationId(next.operationId);
      return;
    }
    if (focus() === 'findings') {
      const next = Math.max(0, Math.min(findings().length - 1, findingIndex() + delta));
      setFindingIndex(next);
      return scroller?.scrollChildIntoView(`finding-${next}`);
    }
    const list = runs();
    const index = list.indexOf(run()!);
    const next = list[Math.max(0, Math.min(list.length - 1, index + delta))];
    if (next) setRunId(next.runId);
  };
  const enter = () => {
    if (tab() === 'operations') return void (operation() && setDetail('operation'));
    if (focus() === 'runs') {
      if (!findings().length) return;
      setFocus('findings');
      return scroller?.scrollChildIntoView(`finding-${findingIndex()}`);
    }
    setDetail('finding');
  };
  const back = () => {
    if (detail()) return void setDetail(undefined);
    if (tab() === 'scans' && focus() === 'findings') return void setFocus('runs');
    leave();
  };
  const switchTab = () => {
    setDetail(undefined);
    setFocus('runs');
    setTab((value) => (value === 'scans' ? 'operations' : 'scans'));
    void store.refreshOperations();
  };
  const answerTarget = () => (operation()?.question ? operation() : waiting()[0]);

  const scans = () => tab() === 'scans';
  const listing = () => !detail();
  /** The latest validation and fix started from the selected finding. */
  const findingWork = () => {
    const source = { runId: run()?.runId, findingId: finding()?.id };
    const about = store
      .operations()
      .filter(
        (op) =>
          op.plan.source?.runId === source.runId && op.plan.source?.findingId === source.findingId,
      );
    return (['validation', 'fix'] as const).flatMap(
      (kind) => about.find((op) => op.kind === kind) ?? [],
    );
  };
  /** A fix waiting for a decision: on the open finding, or the selected operation. */
  const pendingFix = () => {
    const pending = (op?: SecurityOperationState) =>
      op?.result?.kind === 'fix' && op.result.resolution === 'pending' ? op : undefined;
    return scans()
      ? detail() === 'finding'
        ? findingWork().map(pending).find(Boolean)
        : undefined
      : pending(operation());
  };
  const inSession = () => origin?.type === 'session';
  const discuss = () =>
    store.perform(async () => {
      if (origin?.type !== 'session') return;
      await store.client.discuss(
        { runId: run()!.runId!, findingId: finding()!.id, sessionID: origin.sessionID },
        { location: store.location },
      );
      leave();
    });
  const help = () =>
    ctx.ui.dialog.alert({
      title: 'Security keys',
      message: keys
        .filter((key) => key.key && key.label && key.when())
        .map((key) => `${key.key!.padEnd(6)} ${key.label!()}`)
        .join('\n'),
    });
  const findingSelected = () =>
    scans() && !!finding() && (detail() === 'finding' || focus() === 'findings');
  const opsAvailable = () => store.capabilities().policy || store.capabilities().validation;
  const movable = () =>
    !!detail() ||
    (scans() ? runs().length > 1 || focus() === 'findings' : store.operations().length > 1);
  const keys: Key[] = [
    { bind: 'up,k', run: () => move(-1), when: () => movable() },
    {
      bind: 'down,j',
      key: '↑↓',
      label: () => (detail() ? 'scroll' : 'move'),
      run: () => move(1),
      when: () => movable(),
    },
    {
      bind: 'return',
      key: 'enter',
      label: () => (scans() && focus() === 'runs' ? 'findings' : 'open'),
      run: enter,
      when: () => listing() && (scans() ? !!findings().length : !!operation()),
    },
    {
      bind: 'v',
      key: 'v',
      label: () => 'validate',
      run: validate,
      when: () => store.capabilities().validation && findingSelected(),
    },
    {
      bind: 'x',
      key: 'x',
      label: () => 'propose fix',
      run: () => operations.fix(run()!, finding()!),
      when: () => store.capabilities().fix && findingSelected(),
    },
    {
      bind: 'y',
      key: 'y',
      label: () => 'apply fix',
      run: () => operations.resolve(pendingFix()!, 'apply'),
      when: () => !!pendingFix(),
    },
    {
      bind: 'r',
      key: 'r',
      label: () => 'discard fix',
      run: () => operations.resolve(pendingFix()!, 'discard'),
      when: () => !!pendingFix(),
    },
    {
      bind: 'g',
      key: 'g',
      label: () => 'discuss in chat',
      run: discuss,
      when: () => inSession() && findingSelected(),
    },
    {
      bind: 's',
      key: 's',
      label: () => 'start',
      run: () => operations.start(operation()!),
      when: () => !scans() && operation()?.status === 'prepared',
    },
    {
      bind: 'a',
      key: 'a',
      label: () => 'answer',
      run: () => operations.answer(answerTarget()!),
      when: () => !!answerTarget(),
    },
    {
      bind: 'c',
      key: 'c',
      label: () => 'cancel',
      run: () => (scans() ? cancelScan() : operations.cancel(operation()!)),
      when: () => (scans() ? listing() && run()?.status === 'running' : cancellable(operation())),
    },
    {
      bind: 'd',
      key: 'd',
      label: () => (details() ? 'hide details' : 'details'),
      run: () => setDetails((value) => !value),
      when: () => scans() && listing() && !!run(),
      secondary: true,
    },
    {
      bind: 'n',
      key: 'n',
      label: () => 'new scan',
      run: () => newScan(),
      when: () => true,
      // The way in when there is nothing to look at; otherwise one of many.
      get secondary() {
        return runs().length > 0;
      },
    },
    {
      bind: 'u',
      key: 'u',
      label: () => 'resume',
      run: resumeScan,
      when: () => scans() && listing() && !!run() && !resumeProblem(run()!),
    },
    {
      bind: 'e',
      key: 'e',
      label: () => 'run again',
      run: () => newScan(planInputs(run()!.plan!)),
      when: () => scans() && listing() && !!run()?.plan && run()?.status !== 'running',
      // Prominent when the scan did not finish.
      get secondary() {
        return run()?.status === 'completed';
      },
    },
    {
      // Not `i`: a terminal sends Tab as Ctrl+I, so the two collide.
      bind: 'l',
      key: 'l',
      label: () => (setup()?.signIn?.pending ? 'cancel sign-in' : 'sign in'),
      run: signIn,
      when: () => listing() && !!setup()?.signIn && setup()?.signIn?.state !== 'signed-in',
      // Prominent only when there is nothing to sign in with.
      get secondary() {
        return setup()?.signIn?.state === 'shared' && !setup()?.signIn?.pending;
      },
    },
    {
      bind: 'o',
      key: 'o',
      label: () => 'profile',
      run: chooseProfile,
      when: () => listing() && (setup()?.profiles.length ?? 0) > 1,
      secondary: true,
    },
    {
      bind: 'p',
      key: 'p',
      label: () => 'draft policy',
      run: operations.draftPolicy,
      when: () => listing() && store.capabilities().policy,
      secondary: true,
    },
    {
      bind: 'tab',
      key: 'tab',
      label: () => (scans() ? 'activity' : 'scans'),
      run: switchTab,
      when: () => true,
    },
    { bind: 'h', key: 'h', label: () => 'all keys', run: help, when: () => true },
    { bind: 'escape', key: 'esc', label: () => 'back', run: back, when: () => true },
  ];

  const View = () => {
    const [now, setNow] = createSignal(Date.now());
    onMount(() => {
      void loadSetup();
      void store.loadCapabilities();
      onCleanup(store.watch());
    });
    createEffect(() => {
      if (!runs().some((item) => item.status === 'running')) return;
      const timer = setInterval(() => setNow(Date.now()), 1000);
      onCleanup(() => clearInterval(timer));
    });
    ctx.keymap.layer(() => ({
      priority: 10,
      enabled: onRoute,
      commands: keys.map((key) => ({
        bind: key.bind,
        title: key.label ? `Security: ${key.label()}` : undefined,
        group: 'Security',
        enabled: key.when,
        run: () => void key.run(),
      })),
    }));
    return (
      <SecurityView
        ctx={ctx}
        color={color}
        store={store}
        keys={keys}
        now={now()}
        tab={tab()}
        focus={focus()}
        findingWork={detail() === 'finding' ? findingWork() : []}
        detail={detail()}
        run={run()}
        findingIndex={findingIndex()}
        operation={operation()}
        details={details()}
        waiting={waiting().length}
        opsAvailable={opsAvailable()}
        setup={setup()}
        ref={(value) => (scroller = value)}
      />
    );
  };

  return {
    store,
    open,
    onRoute,
    View,
    newScan,
    draftPolicy: operations.draftPolicy,
    validate,
    showOperations: () => {
      setTab('operations');
      setDetail(undefined);
    },
  };
}
