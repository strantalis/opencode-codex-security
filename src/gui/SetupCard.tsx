import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import { runtimeProblems, signInLabel, userError, type SignInInfo } from '../scan-display';

/** What the server's `setup` RPC returns. */
export interface SetupInfo {
  route: {
    provider: string;
    baseUrl?: string;
    model: string;
    reasoningEffort: string;
    daybreak: boolean;
    auth: string;
  };
  configFile: string;
  codexConfigFile: string;
  profile?: string;
  profiles: string[];
  runtime: { node: string | null; python: string | null };
  signIn?: SignInInfo;
}
export interface SetupPort {
  load(): Promise<unknown>;
  setProfile(input: { profile: string }): Promise<unknown>;
  signIn?(input: { device?: boolean }): Promise<unknown>;
  signInCancel?(): Promise<unknown>;
}

function readSetup(value: unknown): SetupInfo {
  const setup = value as SetupInfo | null;
  if (!setup?.route || !Array.isArray(setup.profiles) || !setup.runtime)
    throw new Error('Could not read the setup. Update the server plugin and reopen Security.');
  return setup;
}
const credentialLabels: Record<string, string> = {
  chatgpt: 'ChatGPT sign-in',
  'api-key': 'API key from the environment',
  aws: 'AWS credentials',
};

/** Where scans go and with what credentials, plus a profile switch when there is a choice. */
export function SetupCard(props: { setup: SetupPort; onChange?: () => void }) {
  const [info, setInfo] = createSignal<SetupInfo>();
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  let stopped = false;
  onCleanup(() => (stopped = true));
  const load = async () => {
    try {
      const next = readSetup(await props.setup.load());
      if (stopped) return;
      setInfo(next);
      setError('');
    } catch (e) {
      if (!stopped) setError(userError(e));
    }
  };
  const act = async (action: (() => Promise<unknown>) | undefined) => {
    if (busy() || !action) return;
    setBusy(true);
    setError('');
    try {
      await action();
      await load();
    } catch (e) {
      if (!stopped) setError(userError(e));
    } finally {
      if (!stopped) setBusy(false);
    }
  };
  // While a sign-in is open in the browser, watch for it to finish.
  createEffect(() => {
    if (!info()?.signIn?.pending) return;
    const timer = setInterval(() => void load(), 2000);
    onCleanup(() => clearInterval(timer));
  });
  const choose = async (profile: string) => {
    if (busy()) return;
    setBusy(true);
    setError('');
    try {
      await props.setup.setProfile({ profile });
      await load();
      props.onChange?.();
    } catch (e) {
      if (!stopped) setError(userError(e));
    } finally {
      if (!stopped) setBusy(false);
    }
  };
  void load();

  const missing = () => {
    const runtime = info()?.runtime;
    return runtime ? runtimeProblems(runtime) : [];
  };
  // Collapsed to one line unless something needs attention.
  const attention = () => {
    const signIn = info()?.signIn;
    return (
      !!error() ||
      missing().length > 0 ||
      (!!props.setup.signIn && (signIn?.state === 'needed' || !!signIn?.pending || !!signIn?.error))
    );
  };
  let card: HTMLDetailsElement | undefined;
  // Open it when something needs attention; otherwise the user decides.
  createEffect(() => {
    if (attention() && card) card.open = true;
  });
  const line = () => {
    const route = info()?.route;
    return route
      ? [route.provider, route.model, credentialLabels[route.auth] ?? route.auth].join(' · ')
      : 'Setup';
  };
  return (
    <details ref={(element) => (card = element)} class="gs-setup" aria-label="Setup">
      <summary>
        <span class="gs-setup-line">{line()}</span>
        <Show when={attention()}>
          <span class="gs-finding-status" data-tone="warn">
            Needs attention
          </span>
        </Show>
      </summary>
      <Show when={error()}>
        <p class="gs-alert" role="alert">
          {error()}{' '}
          <button class="gs-link" onClick={() => void load()}>
            Retry
          </button>
        </p>
      </Show>
      <Show when={info()}>
        {(setup) => (
          <>
            <Show when={missing().length}>
              <p class="gs-alert" role="alert">
                Scans need {missing().join(' and ')} on OpenCode's PATH.
              </p>
            </Show>
            <dl class="gs-setup-grid">
              <dt>Provider</dt>
              <dd>
                {setup().route.provider}
                <Show when={setup().route.baseUrl}>
                  <span class="gs-mono gs-muted gs-block">{setup().route.baseUrl}</span>
                </Show>
              </dd>
              <dt>Model</dt>
              <dd>
                {setup().route.model} · {setup().route.reasoningEffort}
                {setup().route.daybreak ? ' · Daybreak' : ''}
              </dd>
              <dt>Credentials</dt>
              <dd>{credentialLabels[setup().route.auth] ?? setup().route.auth}</dd>
              <Show when={setup().profiles.length > 1}>
                <dt>Profile</dt>
                <dd>
                  <select
                    aria-label="Profile"
                    class="gs-select"
                    value={setup().profile ?? ''}
                    disabled={busy()}
                    onChange={(e) => void choose(e.currentTarget.value)}
                  >
                    <Show when={!setup().profile}>
                      <option value="" disabled>
                        Choose a profile
                      </option>
                    </Show>
                    <For each={setup().profiles}>
                      {(profile) => <option value={profile}>{profile}</option>}
                    </For>
                  </select>
                </dd>
              </Show>
            </dl>
            <Show when={setup().signIn && props.setup.signIn ? setup().signIn : undefined}>
              {(signIn) => (
                <Show when={signIn().state !== 'signed-in' || signIn().pending}>
                  <div class="gs-signin">
                    <Show
                      when={signIn().pending}
                      fallback={
                        <>
                          <p class={signIn().state === 'needed' ? 'gs-note' : 'gs-muted'}>
                            {signInLabel(signIn())}
                          </p>
                          <div class="gs-actions">
                            <button
                              class="gs-button"
                              disabled={busy()}
                              onClick={() => void act(() => props.setup.signIn!({}))}
                            >
                              Sign in with ChatGPT
                            </button>
                            <button
                              class="gs-link"
                              disabled={busy()}
                              onClick={() => void act(() => props.setup.signIn!({ device: true }))}
                            >
                              Use a device code
                            </button>
                          </div>
                        </>
                      }
                    >
                      {(pending) => (
                        <>
                          <p>
                            <Show
                              when={pending().code}
                              fallback="Finish signing in in your browser. If it did not open:"
                            >
                              Enter code <strong class="gs-code">{pending().code}</strong> at:
                            </Show>{' '}
                            <a href={pending().url} target="_blank" rel="noreferrer">
                              {pending().url}
                            </a>
                          </p>
                          <button
                            class="gs-link"
                            disabled={busy()}
                            onClick={() => void act(props.setup.signInCancel)}
                          >
                            Cancel sign-in
                          </button>
                        </>
                      )}
                    </Show>
                  </div>
                </Show>
              )}
            </Show>
            <details class="gs-disclosure">
              <summary>Configuration files</summary>
              <p class="gs-mono">{setup().configFile}</p>
              <p class="gs-mono">{setup().codexConfigFile}</p>
            </details>
          </>
        )}
      </Show>
    </details>
  );
}
