import { Command, Panel, Plugin } from '@opencode/plugin/gui';
import { createMemo, createSignal, onCleanup, Show } from 'solid-js';
import { Security } from './rpc';
import { localProjectDirectory } from './plan-view';
import { SecurityPanel } from './security-panel';

export default Plugin.define({
  setup(ctx) {
    const tab = { id: 'security', title: 'Security', tabbable: true };
    ctx.add(Panel, {
      id: 'security',
      region: 'side',
      width: 580,
      list: () => [tab],
      render(props) {
        const directory = createMemo(() => localProjectDirectory(props.session));
        return (
          <Show
            when={directory()}
            keyed
            fallback={
              <section style={{ padding: '24px' }}>
                <h2>Security</h2>
                <p>Open a local project session to choose a scan target.</p>
                <p>
                  No repository is selected. Remote and unknown workspaces cannot start local scans.
                </p>
              </section>
            }
          >
            {(directory) => {
              // Keep every RPC scoped to this mounted local session. Remounting cancels view polling,
              // never a scan; stale callbacks cannot approve a plan for a different workspace.
              const location = { directory };
              const [capabilities, setCapabilities] = createSignal<{
                policy: boolean;
                validation: boolean;
                questionAnswers: boolean;
              }>();
              let disposed = false;
              onCleanup(() => {
                disposed = true;
              });
              void ctx.client
                .rpc(Security)
                .capabilities({}, { location })
                .then((value) => {
                  const flags = value as unknown as {
                    policy: boolean;
                    validation: boolean;
                    questionAnswers: boolean;
                  };
                  if (!disposed && (flags.policy || flags.validation)) setCapabilities(flags);
                })
                .catch(() => {
                  /* Scan controls remain usable if extra capabilities are unavailable. */
                });
              return (
                <SecurityPanel
                  directory={directory}
                  operations={
                    capabilities()
                      ? {
                          capabilities: capabilities(),
                          list: () => ctx.client.rpc(Security).operationList({}, { location }),
                          prepare: (input) =>
                            ctx.client.rpc(Security).operationPrepare(input, { location }),
                          start: (input) =>
                            ctx.client.rpc(Security).operationStart(input, { location }),
                          answer: (input) =>
                            ctx.client.rpc(Security).operationAnswer(input, { location }),
                          cancel: (input) =>
                            ctx.client.rpc(Security).operationCancel(input, { location }),
                        }
                      : undefined
                  }
                  port={{
                    list: () => ctx.client.rpc(Security).list({}, { location }),
                    prepare: (input) => ctx.client.rpc(Security).prepare(input, { location }),
                    start: (input) => ctx.client.rpc(Security).start(input, { location }),
                    cancel: (input) => ctx.client.rpc(Security).cancel(input, { location }),
                  }}
                />
              );
            }}
          </Show>
        );
      },
    });
    ctx.add(Command, {
      id: 'open',
      title: 'Security: open scans',
      group: 'Security',
      slash: { name: 'security' },
      run: () => {
        const session = ctx.sessions.current();
        if (session) ctx.layout.open(`${ctx.id}:security`, session);
        else ctx.toast.show({ title: 'Open a local project session to view Security' });
      },
    });
  },
});
