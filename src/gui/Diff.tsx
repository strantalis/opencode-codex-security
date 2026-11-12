import { For } from 'solid-js';
import { diffLines } from '../scan-display';

/** A unified diff with added and removed lines coloured. */
export function Diff(props: { diff: string; label: string }) {
  return (
    <pre class="gs-diff" aria-label={props.label}>
      <For each={diffLines(props.diff)}>
        {(line) => (
          <span class="gs-diff-line" data-kind={line.kind}>
            {line.text || ' '}
          </span>
        )}
      </For>
    </pre>
  );
}
