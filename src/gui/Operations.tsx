import { createMemo, createSignal, For, Show } from 'solid-js';
import type { SecurityOperationState } from '../core/security-operations';
import { projectName } from '../scan-display';
import { shortTime, statusLabel } from './format';
import { OperationDetail } from './OperationDetail';
import type { OperationPort, SecurityStore } from './store';

const title = (op: SecurityOperationState) =>
  op.kind !== 'policy'
    ? (op.plan.finding?.split('\n')[0] ?? 'Finding')
    : `Policy · ${projectName(op.repository)}${op.plan.path && op.plan.path !== '.' ? ` / ${op.plan.path}` : ''}`;

/** Policy drafts, and validations or fixes that belong to no scan shown above. */
export function Operations(props: {
  port: OperationPort;
  store: SecurityStore;
  /** The operations to list. Defaults to all of them. */
  list?: SecurityOperationState[];
}) {
  const operations = () => props.list ?? props.store.operations();
  const [selected, select] = createSignal<string>();
  const current = createMemo(
    () =>
      operations().find((op) => op.operationId === selected()) ??
      operations().find((op) => op.status === 'awaiting_answers') ??
      operations()[0],
  );
  return (
    <section class="gs-operations" aria-label="Policy drafts and other activity">
      <Show when={operations().length > 1}>
        <ul class="gs-list" aria-label="Recent operations">
          <For each={operations()}>
            {(op) => (
              <li>
                <button
                  class="gs-list-item"
                  aria-pressed={current()?.operationId === op.operationId}
                  onClick={() => select(op.operationId)}
                >
                  <span class="gs-list-top">
                    <span class="gs-list-title">{title(op)}</span>
                    <span class="gs-status" data-status={op.status}>
                      {statusLabel(op.status)}
                    </span>
                  </span>
                  <span class="gs-list-meta">
                    {{ policy: 'Policy draft', validation: 'Validation', fix: 'Fix' }[op.kind]} ·{' '}
                    {shortTime(op.createdAt)}
                  </span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={current()?.operationId} keyed>
        {(id) => (
          <Show when={current()?.operationId === id ? current() : undefined}>
            {(op) => (
              <article class="gs-detail" aria-label="Selected operation">
                <Show when={op().kind !== 'policy'}>
                  <h3 class="gs-wrap">{title(op())}</h3>
                </Show>
                <OperationDetail op={op()} port={props.port} store={props.store} />
              </article>
            )}
          </Show>
        )}
      </Show>
    </section>
  );
}
