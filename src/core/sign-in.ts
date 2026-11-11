import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type { CodexSecurity, CodexSecurityConfig } from '@openai/codex-security';
import { userMessage } from './errors.ts';
import { codexHome, loadSettings } from './settings.ts';

/**
 * Whether Codex Security has a ChatGPT sign-in of its own. Only relevant when the route uses
 * stored credentials; API-key, gateway and Bedrock routes never see this.
 * - `signed-in`: its own session exists.
 * - `shared`: none yet, but the Codex CLI is signed in and the SDK will copy that session on the
 *   first scan. The two then share one refresh token.
 * - `needed`: nothing to use.
 */
export interface SignInStatus {
  state: 'signed-in' | 'shared' | 'needed';
  /** A sign-in in progress: open the URL, and enter the code when there is one. */
  pending?: { url: string; code?: string };
  error?: string;
}
type LoginClient = Pick<CodexSecurity, 'loginChatGPT' | 'loginChatGPTDeviceCode' | 'close'>;
export type LoginFactory = (config: CodexSecurityConfig) => LoginClient | Promise<LoginClient>;

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );
/** Looks at files only. The SDK's own status check would copy the Codex CLI session as a side effect. */
async function storedState(): Promise<SignInStatus['state']> {
  const stateDirectory =
    process.env.CODEX_SECURITY_STATE_DIR || join(codexHome(), 'state', 'plugins', 'codex-security');
  if (await exists(join(stateDirectory, 'codex-home', 'auth.json'))) return 'signed-in';
  return (await exists(join(codexHome(), 'auth.json'))) ? 'shared' : 'needed';
}

/** Runs the SDK's ChatGPT sign-in when the user asks for it. Never starts on its own. */
export class SignIn {
  #factory: LoginFactory;
  #pending?: { url: string; code?: string; cancel(): void };
  #error?: string;
  constructor(
    createClient: LoginFactory = async (config) =>
      new (await import('@openai/codex-security')).CodexSecurity(config),
  ) {
    this.#factory = createClient;
  }
  async status(): Promise<SignInStatus> {
    const { url, code } = this.#pending ?? {};
    return {
      state: await storedState(),
      ...(url ? { pending: { url, ...(code ? { code } : {}) } } : {}),
      ...(this.#error ? { error: this.#error } : {}),
    };
  }
  /** Browser sign-in by default; a device code for machines without a local browser. */
  async start(input: { device?: boolean } = {}): Promise<SignInStatus> {
    if (this.#pending) return this.status();
    this.#error = undefined;
    const client = await this.#factory({ codexOverrides: (await loadSettings()).codex });
    try {
      const handle = await (input.device ? client.loginChatGPTDeviceCode() : client.loginChatGPT());
      const pending = {
        url: handle.authUrl ?? handle.verificationUrl ?? '',
        ...(handle.userCode ? { code: handle.userCode } : {}),
        cancel: () => handle.cancel(),
      };
      this.#pending = pending;
      void handle
        .wait()
        .then(
          (result) => (result.success ? undefined : 'Sign-in did not complete.'),
          (error) => userMessage(error, 'Sign-in failed.'),
        )
        .then((error) => {
          // A cancelled sign-in is not an error worth showing.
          if (this.#pending === pending) this.#error = error;
          if (this.#pending === pending) this.#pending = undefined;
          return client.close().catch(() => {});
        });
    } catch (error) {
      await client.close().catch(() => {});
      this.#error = userMessage(error, 'Sign-in could not start.');
    }
    return this.status();
  }
  async cancel(): Promise<SignInStatus> {
    const pending = this.#pending;
    this.#pending = undefined;
    pending?.cancel();
    return this.status();
  }
  dispose() {
    void this.cancel();
  }
}
