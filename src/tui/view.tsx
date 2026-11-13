/** @jsxImportSource @opentui/solid */
import type { Plugin } from '@opencode/plugin/tui';
import { useTerminalDimensions } from '@opentui/solid';
import { For, Show, type JSX } from 'solid-js';
import type { SecurityOperationState } from '../core/security-operations';
import type { Finding, ScanState } from '../types';
import {
  activityActor,
  activityRows,
  activityText,
  latestUpdate,
  activityStatusLabel,
  coverageLabel,
  deepProgressLabel,
  dispatchLabel,
  elapsedLabel,
  findingsPendingLabel,
  hasPhaseProgress,
  phaseLabel,
  partialLabel,
  progressLabel,
  repositoryMatchingLabel,
  resultCountsLabel,
  runPhaseLabel,
  runTitle,
  scanScope,
  usageContext,
  dispositionLabel,
  diffLines,
  findingStatus,
  severitySummary,
  sortedFindings,
  fixStatusLabel,
  trustedAccessLabel,
  targetChangedLabel,
  usageLabel,
  workerActivityRows,
  workerSummary,
} from '../scan-display';
import type { Store } from './store';
import type { Colors } from './theme';
import {
  fit,
  operationRow,
  operationTitle,
  runRow,
  setupLine,
  windowed,
  type SetupInfo,
} from './text';

/** One key in the view. Keys with a label appear in the footer while `when` holds. */
export interface Key {
  bind: string;
  key?: string;
  label?: () => string;
  run: () => unknown;
  when: () => boolean;
  /** Listed under `h`, not in the footer. */
  secondary?: boolean;
}

interface Props {
  ctx: Plugin.Context;
  color: Colors;
  store: Store;
  keys: Key[];
  now: number;
  tab: 'scans' | 'operations';
  focus: 'runs' | 'findings';
  /** The latest validation and fix for the open finding. */
  findingWork: SecurityOperationState[];
  detail?: 'finding' | 'operation';
  run?: ScanState;
  findingIndex: number;
  operation?: SecurityOperationState;
  details: boolean;
  waiting: number;
  opsAvailable: boolean;
  setup?: SetupInfo;
  ref: (scroller: { scrollBy(delta: number): void; scrollChildIntoView(id: string): void }) => void;
}

const RUN_ROWS = 5;
const OPERATION_ROWS = 8;

export function SecurityView(props: Props) {
  const size = useTerminalDimensions();
  const width = () => Math.max(20, size().width - 4);
  const c = props.color;
  const severity = (f: Finding) =>
    f.severity === 'critical' || f.severity === 'high' ? c.error() : c.warning();
  const Label = (p: { children: JSX.Element }) => <text fg={c.muted()}>{p.children}</text>;

  const Header = () => {
    const runs = () => props.store.runs();
    const active = () => runs().filter((run) => run.status === 'running').length;
    return (
      <box flexDirection="column" flexShrink={0}>
        <text>
          <b>Security</b>
          <span style={{ fg: c.muted() }}> · {props.store.location.directory}</span>
        </text>
        <text>
          <span style={{ fg: props.tab === 'scans' ? c.accent() : c.muted() }}>
            {props.tab === 'scans' ? <b>Scans</b> : 'Scans'} {runs().length}
          </span>
          <span style={{ fg: props.tab === 'operations' ? c.accent() : c.muted() }}>
            {'   '}
            {props.tab === 'operations' ? <b>Activity</b> : 'Activity'}{' '}
            {props.store.operations().length}
          </span>
          <Show when={active()}>
            <span style={{ fg: c.muted() }}>
              {'   '}
              {active()} of {props.store.catalog()?.maxConcurrent ?? 2} running
            </span>
          </Show>
          <Show when={props.waiting}>
            <span style={{ fg: c.warning() }}>
              {'   '}
              {props.waiting} {props.waiting === 1 ? 'question' : 'questions'} waiting · a answer
            </span>
          </Show>
        </text>
        {/* Last in the box: OpenTUI blanks a sibling that follows a late-mounted node. */}
        <Show when={props.setup}>
          {(info) => (
            <box flexDirection="column" flexShrink={0}>
              <text fg={c.muted()}>{setupLine(info()).text}</text>
              {/* One text node: OpenTUI dropped a line when these were separate nodes. */}
              <Show when={setupLine(info()).warnings.length}>
                <text fg={c.warning()}>{setupLine(info()).warnings.join('\n')}</text>
              </Show>
            </box>
          )}
        </Show>
      </box>
    );
  };

  const RunSummary = (p: { run: ScanState }) => {
    const run = () => p.run;
    return (
      <box flexDirection="column">
        <text>
          <b>{runTitle(run())}</b>
        </text>
        <text fg={c.muted()}>
          {run().repository} · {scanScope(run())} · {run().mode ?? 'fixture'}
        </text>
        <text>
          {runPhaseLabel(run())}
          <Show when={elapsedLabel(run().startedAt, run().finishedAt, props.now)}>
            {(elapsed) => <> · {elapsed()}</>}
          </Show>
          <Show when={hasPhaseProgress(run())}> · {progressLabel(run())}</Show>
        </text>
        <Show when={run().status === 'running'}>
          <text fg={c.muted()}>{findingsPendingLabel(run())}</text>
        </Show>
        <text fg={c.muted()}>{usageLabel(run())}</text>
        <Show when={run().error}>
          <text fg={c.error()}>{run().error}</text>
        </Show>
        <Show when={run().status === 'cancelled' && !run().partial}>
          <text>Cancelled before finishing; this scan has no results.</text>
        </Show>
        <Show when={partialLabel(run())}>
          <text fg={c.warning()}>{partialLabel(run())}</text>
        </Show>
        <Show when={run().status === 'completed'}>
          <text>{resultCountsLabel(run())}</text>
        </Show>
        <Show when={props.details}>
          <RunDetails run={run()} />
        </Show>
      </box>
    );
  };

  const RunDetails = (p: { run: ScanState }) => {
    const run = () => p.run;
    return (
      <box flexDirection="column" paddingTop={1}>
        <Label>Run {run().runId}</Label>
        <Show when={run().telemetry?.authentication}>
          <Label>Signed in with {run().telemetry?.authentication}</Label>
        </Show>
        <Show when={trustedAccessLabel(run())}>
          <text fg={c.warning()}>{trustedAccessLabel(run())}</text>
        </Show>
        <Show when={targetChangedLabel(run())}>
          <text fg={c.warning()}>{targetChangedLabel(run())}</text>
        </Show>
        <Show when={run().telemetry?.measurement?.coverage !== 'complete'}>
          <Label>{usageContext(run())}</Label>
        </Show>
        <Show when={workerSummary(run())}>
          <Label>{workerSummary(run())}</Label>
        </Show>
        <Show when={dispatchLabel(run())}>
          <Label>{dispatchLabel(run())}</Label>
        </Show>
        <Show when={run().status === 'running' && run().deepProgress}>
          <Label>{deepProgressLabel(run())}</Label>
        </Show>
        <Show when={run().status === 'completed' || run().partial}>
          <Label>Coverage: {coverageLabel(run())}</Label>
          <Label>Repository matching: {repositoryMatchingLabel(run())}</Label>
        </Show>
        <Show when={activityRows(run()).length}>
          <text>Activity</text>
          <Show when={latestUpdate(run())}>
            <text>{latestUpdate(run())}</text>
          </Show>
          <For each={workerActivityRows(run()).slice(0, 5)}>
            {(activity) => (
              <Label>
                {activityActor(activity.worker)} · {activityText(activity)} ·{' '}
                {activityStatusLabel(activity.status, run())}
              </Label>
            )}
          </For>
        </Show>
        <Show when={run().events.length}>
          <text>Milestones</text>
          <For each={[...run().events].reverse().slice(0, 3)}>
            {(event) => (
              <Label>
                {new Date(event.time).toLocaleTimeString()} · {event.message}
              </Label>
            )}
          </For>
        </Show>
      </box>
    );
  };

  const Scans = () => {
    const runs = () => props.store.runs();
    const index = () => Math.max(0, runs().indexOf(props.run!));
    const visible = () => windowed(runs(), index(), RUN_ROWS);
    const findings = () => (props.run ? sortedFindings(props.run) : []);
    const onFindings = () => props.focus === 'findings';
    return (
      <Show when={props.run} fallback={<text>No scans yet. Press n to start one.</text>}>
        {(run) => (
          <box flexDirection="column" gap={1}>
            <box flexDirection="column">
              <For each={visible().items}>
                {(item) => {
                  const selected = () => item.runId === run().runId;
                  return (
                    <text fg={selected() ? (onFindings() ? undefined : c.accent()) : c.muted()}>
                      {fit(`${selected() ? '›' : ' '} ${runRow(item, props.now)}`, width())}
                    </text>
                  );
                }}
              </For>
              <Show when={runs().length > RUN_ROWS}>
                <Label>
                  {'  '}
                  {visible().start + 1}–{visible().start + visible().items.length} of{' '}
                  {runs().length}
                </Label>
              </Show>
            </box>
            <RunSummary run={run()} />
            <Show when={findings().length}>
              <box flexDirection="column">
                <text>
                  <b>Findings</b> <span style={{ fg: c.muted() }}>{severitySummary(run())}</span>
                </text>
                <For each={findings()}>
                  {(f, i) => {
                    const selected = () => onFindings() && i() === props.findingIndex;
                    const status = () => findingStatus(run(), f.id);
                    const location = () => (status() ? status()!.label : `${f.path}:${f.line}`);
                    return (
                      <box id={`finding-${i()}`} flexDirection="row">
                        <text fg={selected() ? c.accent() : undefined} flexShrink={0}>
                          {selected() ? '› ' : '  '}
                        </text>
                        <text fg={severity(f)} width={9} flexShrink={0}>
                          {f.severity.toUpperCase()}
                        </text>
                        <text fg={selected() ? c.accent() : undefined} flexGrow={1}>
                          {fit(f.title, Math.max(10, width() - location().length - 14))}
                        </text>
                        <text
                          fg={
                            status()?.tone === 'good'
                              ? c.success()
                              : status()?.tone === 'warn'
                                ? c.warning()
                                : c.muted()
                          }
                          flexShrink={0}
                        >
                          {' '}
                          {location()}
                        </text>
                      </box>
                    );
                  }}
                </For>
              </box>
            </Show>
            <Show when={run().status === 'completed' && !findings().length}>
              <Label>No findings reported. Press d for coverage.</Label>
            </Show>
          </box>
        )}
      </Show>
    );
  };

  const FindingDetail = (p: { finding: Finding }) => {
    const f = () => p.finding;
    const Section = (s: { title: string; body: string }) => (
      <box flexDirection="column">
        <Label>{s.title}</Label>
        <text>{s.body}</text>
      </box>
    );
    return (
      <box flexDirection="column" gap={1}>
        <box flexDirection="column">
          <text>
            <span style={{ fg: severity(f()) }}>{f().severity.toUpperCase()}</span> ·{' '}
            <b>{f().title}</b>
          </text>
          <text fg={c.muted()}>
            {f().path}:{f().line} · {f().cwe} · {f().confidence} confidence
          </text>
        </box>
        <Section title="Summary" body={f().summary} />
        <Section title="Evidence" body={f().evidence} />
        <Section title="Remediation" body={f().remediation} />
        <For each={props.findingWork}>
          {(op) => (
            <box flexDirection="column" gap={1}>
              <text>
                <b>{operationTitle(op)}</b>
                <span style={{ fg: c.muted() }}> · {phaseLabel(op.status)}</span>
              </text>
              <Show when={op.error}>
                <text fg={c.error()}>{op.error}</text>
              </Show>
              <Result op={op} />
            </box>
          )}
        </For>
      </box>
    );
  };

  const DiffText = (p: { diff: string }) => (
    <box flexDirection="column">
      <For each={diffLines(p.diff)}>
        {(line) => (
          <text
            fg={
              line.kind === 'add'
                ? c.success()
                : line.kind === 'del'
                  ? c.error()
                  : line.kind === 'context'
                    ? undefined
                    : c.muted()
            }
          >
            {line.text || ' '}
          </text>
        )}
      </For>
    </box>
  );

  /** The outcome of a policy draft, validation or fix. Shown in Operations and on its finding. */
  const Result = (p: { op: SecurityOperationState }) => (
    <Show when={p.op.result}>
      {(result) => {
        const r = result();
        return r.kind === 'policy' ? (
          <box flexDirection="column" gap={1}>
            <Label>Draft for {r.targetPath}. Not written to disk.</Label>
            <text>{r.content}</text>
            <Show when={r.reviewNotes.length}>
              <box flexDirection="column">
                <Label>Review notes</Label>
                <For each={r.reviewNotes}>{(note) => <text>- {note}</text>}</For>
              </box>
            </Show>
            <Show when={r.truncated}>
              <Label>Truncated here; the full draft is in the local SDK artifacts.</Label>
            </Show>
          </box>
        ) : r.kind === 'fix' ? (
          <box flexDirection="column" gap={1}>
            <text>
              <b>{fixStatusLabel(r.status)}</b>
              <Show when={r.resolution !== 'pending' && r.resolution !== 'none'}>
                {' '}
                · {r.resolution}
              </Show>
            </text>
            <Show when={r.report}>
              <text>{r.report}</text>
            </Show>
            <Show when={r.diff} fallback={<Label>No files were changed.</Label>}>
              <Label>
                {r.resolution === 'pending'
                  ? 'Proposed change, not applied yet. y applies it to your working tree; r discards it.'
                  : 'Change'}
              </Label>
              <DiffText diff={r.diff} />
            </Show>
            <Show when={r.truncated}>
              <Label>Diff truncated here; applying uses the whole change.</Label>
            </Show>
          </box>
        ) : (
          <box flexDirection="column" gap={1}>
            <text>
              <b>{dispositionLabel(r.disposition)}</b>
            </text>
            <text>{r.report}</text>
            <Show when={r.truncated}>
              <Label>Truncated here; the full report is in the local SDK artifacts.</Label>
            </Show>
          </box>
        );
      }}
    </Show>
  );

  const Operations = () => {
    const list = () => props.store.operations();
    const index = () => Math.max(0, list().indexOf(props.operation!));
    const visible = () => windowed(list(), index(), OPERATION_ROWS);
    return (
      <Show
        when={props.opsAvailable}
        fallback={<text>Policy drafts and validation need the Codex Security engine.</text>}
      >
        <Show
          when={props.operation}
          fallback={
            <text>
              Nothing here yet. Press v on a finding to validate it, or ask in the conversation for
              a policy draft.
            </text>
          }
        >
          {(op) => (
            <box flexDirection="column" gap={1}>
              <box flexDirection="column">
                <For each={visible().items}>
                  {(item) => {
                    const selected = () => item.operationId === op().operationId;
                    return (
                      <text fg={selected() ? c.accent() : c.muted()}>
                        {fit(`${selected() ? '›' : ' '} ${operationRow(item)}`, width())}
                      </text>
                    );
                  }}
                </For>
                <Show when={list().length > OPERATION_ROWS}>
                  <Label>
                    {'  '}
                    {visible().start + 1}–{visible().start + visible().items.length} of{' '}
                    {list().length}
                  </Label>
                </Show>
              </box>
              <OperationSummary op={op()} />
            </box>
          )}
        </Show>
      </Show>
    );
  };

  const OperationSummary = (p: { op: SecurityOperationState }) => (
    <box flexDirection="column">
      <text>
        <b>{operationTitle(p.op)}</b> · {phaseLabel(p.op.status)}
      </text>
      <Label>{p.op.repository}</Label>
      <text>{p.op.phase}</text>
      <Show when={p.op.question}>
        <text fg={c.warning()}>Waiting for your answer. Press a.</text>
      </Show>
      <Show when={p.op.error}>
        <text fg={c.error()}>{p.op.error}</text>
      </Show>
      <Show when={p.op.result}>
        <Label>Press enter to read the result.</Label>
      </Show>
    </box>
  );

  const OperationDetail = (p: { op: SecurityOperationState }) => {
    const op = () => p.op;
    return (
      <box flexDirection="column" gap={1}>
        <box flexDirection="column">
          <text>
            <b>{operationTitle(op())}</b> · {phaseLabel(op().status)}
          </text>
          <Label>
            {op().repository}
            {op().kind === 'policy' ? ` · ${op().plan.path ?? '.'}` : ''}
          </Label>
          <text>{op().phase}</text>
          <Show when={op().estimatedCostUsd !== undefined}>
            <Label>Estimated usage USD {(op().estimatedCostUsd ?? 0).toFixed(2)}</Label>
          </Show>
        </box>
        <Show when={op().kind === 'validation' && op().plan.finding}>
          <box flexDirection="column">
            <Label>Finding</Label>
            <text>{op().plan.finding}</text>
          </box>
        </Show>
        <Show when={op().question}>
          {(q) => (
            <box flexDirection="column">
              <text fg={c.warning()}>Waiting for your answer. Press a.</text>
              <For each={q().questions}>{(text, i) => <text>{`${i() + 1}. ${text}`}</text>}</For>
            </box>
          )}
        </Show>
        <Show when={op().error}>
          <text fg={c.error()}>{op().error}</text>
        </Show>
        <Result op={op()} />
      </box>
    );
  };

  const Footer = () => {
    const hints = () =>
      props.keys
        .filter((key) => key.key && key.label && key.when() && !key.secondary)
        .map((key) => `${key.key} ${key.label!()}`)
        .join(' · ');
    return <text fg={c.muted()}>{props.store.busy() ? 'Working…' : hints()}</text>;
  };

  const finding = () => {
    const list = props.run ? sortedFindings(props.run) : [];
    return list[Math.min(props.findingIndex, list.length - 1)];
  };

  return (
    <box flexDirection="column" flexGrow={1} paddingLeft={1} paddingRight={1}>
      <Header />
      <Show when={props.store.error()}>
        <text fg={c.error()}>{props.store.error()}</text>
      </Show>
      <Show when={props.store.catalog()?.historyError}>
        <text fg={c.error()}>{props.store.catalog()?.historyError}</text>
      </Show>
      <scrollbox ref={(value) => props.ref(value as never)} flexGrow={1} paddingTop={1}>
        <Show when={props.tab === 'scans'}>
          <Show when={props.detail === 'finding' && finding()} fallback={<Scans />}>
            {(f) => <FindingDetail finding={f()} />}
          </Show>
        </Show>
        <Show when={props.tab === 'operations'}>
          <Show when={props.detail === 'operation' && props.operation} fallback={<Operations />}>
            {(op) => <OperationDetail op={op()} />}
          </Show>
        </Show>
      </scrollbox>
      <Footer />
    </box>
  );
}
