import { Command, MenuItem, Panel, Plugin, type SessionRef } from '@opencode/plugin/gui';
import { createMemo, createSignal, onCleanup, Show } from 'solid-js';
import { Security } from './rpc';
import { localProjectDirectory } from './plan-view';
import { SecurityPanel, type SecurityPort } from './security-panel';

type Capabilities = { policy: boolean; validation: boolean; fix?: boolean };
type SecurityEvent = 'changed' | 'operationChanged';

export default Plugin.define({
  setup(ctx) {
    const tab = { id: 'security', title: 'Security', tabbable: true };
    const key = `${ctx.id}:${tab.id}`;
    const rpc = () => ctx.client.rpc(Security);

    /**
     * Follows one RPC event for this workspace. The event stream is shared and carries every
     * location, so filter by directory. If the stream ends (for example a server restart, which
     * also replaces `ctx.client`), resubscribe after a pause and ask for a refresh.
     */
    const follow = (name: SecurityEvent, directory: string, listener: () => void) => {
      const controller = new AbortController();
      void (async () => {
        while (!controller.signal.aborted && !ctx.signal.aborted) {
          try {
            for await (const event of rpc().events.subscribe(name, {
              signal: controller.signal,
            }))
              if (event.location.directory === directory) listener();
          } catch {
            /* Reconnect below. */
          }
          if (controller.signal.aborted) return;
          await new Promise((resolve) => setTimeout(resolve, 5000));
          listener();
        }
      })();
      return () => controller.abort();
    };

    ctx.add(Panel, {
      id: tab.id,
      region: 'side',
      width: 580,
      // List the tab only where the user opened it, so it does not appear in every session.
      list: (input) => (input.open.includes(tab.id) ? [tab] : []),
      render(props) {
        const directory = createMemo(() => localProjectDirectory(props.session));
        return (
          <Show
            when={directory()}
            keyed
            fallback={
              <section style={{ padding: '24px' }}>
                <h2>Security</h2>
                <p>Open a local project session to scan it.</p>
              </section>
            }
          >
            {(directory) => {
              // Every call is scoped to this mounted local session.
              const location = { directory };
              const [capabilities, setCapabilities] = createSignal<Capabilities>();
              let disposed = false;
              onCleanup(() => (disposed = true));
              void rpc()
                .capabilities({}, { location })
                .then((value) => {
                  const flags = value as unknown as Capabilities;
                  if (!disposed && (flags.policy || flags.validation)) setCapabilities(flags);
                })
                .catch(() => {
                  /* Scans still work without policy and validation. */
                });
              const port: SecurityPort = {
                list: () => rpc().list({}, { location }),
                prepare: (input) => rpc().prepare(input, { location }),
                start: (input) => rpc().start(input, { location }),
                cancel: (input) => rpc().cancel(input, { location }),
                discuss: (input) =>
                  rpc().discuss({ ...input, sessionID: props.session.id }, { location }),
                subscribe: (listener) => {
                  const stops = (['changed', 'operationChanged'] as const).map((name) =>
                    follow(name, directory, () => listener(name)),
                  );
                  return () => stops.forEach((stop) => stop());
                },
              };
              return (
                <SecurityPanel
                  directory={directory}
                  port={port}
                  setup={{
                    load: () => rpc().setup({}, { location }),
                    setProfile: (input) => rpc().setProfile(input, { location }),
                    signIn: (input) => rpc().signIn(input, { location }),
                    signInCancel: () => rpc().signInCancel({}, { location }),
                  }}
                  operations={
                    capabilities()
                      ? {
                          capabilities: capabilities(),
                          list: () => rpc().operationList({}, { location }),
                          prepare: (input) => rpc().operationPrepare(input, { location }),
                          start: (input) => rpc().operationStart(input, { location }),
                          answer: (input) => rpc().operationAnswer(input, { location }),
                          cancel: (input) => rpc().operationCancel(input, { location }),
                          resolve: (input) => rpc().operationResolve(input, { location }),
                        }
                      : undefined
                  }
                />
              );
            }}
          </Show>
        );
      },
    });

    const open = (session: SessionRef | undefined) => {
      if (session) ctx.layout.open(key, session);
      else ctx.toast.show({ title: 'Open a local project session to use Security' });
    };
    // The side panel's + menu: the per-session way to open the tab.
    ctx.add(MenuItem, (): MenuItem => {
      const session = ctx.sessions.current();
      return {
        menu: 'session.panel',
        id: 'open',
        title: 'Security',
        icon: 'shield',
        ...(session && ctx.layout.stored(session).includes(tab.id) ? { opened: true } : {}),
        run: () => open(ctx.sessions.current()),
      };
    });
    ctx.add(Command, {
      id: 'open',
      title: 'Security: open scans',
      group: 'Security',
      slash: { name: 'security' },
      run: () => open(ctx.sessions.current()),
    });
  },
});
