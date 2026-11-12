import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CodexSecurity, CodexSecurityConfig } from '@openai/codex-security';
import { userMessage } from './errors.ts';
import { codexHome, loadSettings, stateDirectory } from './settings.ts';

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

const read = (path: string) => readFile(path).catch(() => undefined);
/**
 * Looks at files only. The SDK's own status check would copy the Codex CLI session as a side
 * effect. A copy the SDK already made is byte-identical to the CLI's file, and still shared.
 */
export async function storedState(): Promise<SignInStatus['state']> {
  const [own, cli] = await Promise.all([
    read(join(stateDirectory(), 'codex-home', 'auth.json')),
    read(join(codexHome(), 'auth.json')),
  ]);
  if (own) return cli && own.equals(cli) ? 'shared' : 'signed-in';
  return cli ? 'shared' : 'needed';
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
