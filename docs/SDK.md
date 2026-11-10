# Codex Security SDK integration

Pinned SDK: `@openai/codex-security@0.9.1`; OpenCode/plugin: 2.2.6.

Current global configuration is documented in [GLOBAL-CONFIG.md](GLOBAL-CONFIG.md). No per-project SDK overrides are loaded. Session-supplied target/focus/context is distinct from global model, reasoning and Daybreak settings. Optional per-scan Standard/Deep mode overrides only the global mode fallback; no other SDK settings are overridden by session inputs.

## Pipeline

1. `security_prepare_scan` or the native review action resolves the current OpenCode location (or explicit repository), canonical scope paths, focused instructions and bounded documentation files. It reads and hashes the global settings file. No SDK client, login or inference is created.
2. Preview includes target, added context, model/reasoning, Daybreak/access program and estimated cost threshold. The whole conversation is not copied.
3. `security_run_scan` checks native OpenCode permissions. Applicable saved authorization can allow it without a redundant prompt. Native UI uses an explicit review action. Missing/mismatched/reused previews fail closed.
4. Before starting, the plugin revalidates target/context and global config fingerprints. A change or expired preview requires a new review.
5. The adapter creates an SDK client with the global model, reasoning and Daybreak constructor overrides and the fixed OpenAI provider. It invokes `run(repository, options)` with scope, prompt, documentation paths, configured scan settings, fixed ChatGPT auth and disabled owner suggestions.
6. Progress and sanitized lifecycle events update the panel. Findings arrive at completion. Informational findings are counted but not relabeled in the four-severity display. Local SDK artifacts remain authoritative.

## Safety and authorization boundaries

- The global file never authorizes scans, saves credentials or changes accounts.
- A model tool cannot inject arbitrary SDK constructor objects, credentials, executable paths, provider URLs or an approval boolean.
- Native host permission rules are the authorization authority for the run tool. Direct RPC is intended only for the trusted UI, not a workaround for model authorization.
- Repository scope is not a sandbox. Source beyond a scoped file can be relevant to SDK analysis. These settings do not guarantee process/filesystem isolation.
- Named context is restricted to in-repository text documentation, excluding obvious credential/runtime paths. Context changes between review and execution are rejected. Hostile concurrent directory mutation is outside this prototype's scope.
- Models and account entitlement are not checked while loading settings. Daybreak is a separate toggle, not a model; the toggle does not grant access.
- Cost limits use estimates, not a hard billing cap. In-flight work can exceed the threshold.

## Provider compatibility

Published real mode fixes the provider to OpenAI and authentication to ChatGPT. It does not inherit OpenCode provider settings or expose the SDK's broader provider/base-URL/API-key configuration. LiteLLM and other proxy setups are therefore not supported by this plugin yet. If a user needs that setup, report the integration gap rather than requesting a different sign-in, copying credentials or bypassing workplace policy.

## Dedicated authentication

Real operations require an existing private, owned, nonsymlink dedicated auth file and directory. A metadata-only guard runs before constructing the real SDK client. It does not read tokens, perform login or import credentials. The injected mock clients bypass this real-auth precondition.

The SDK uses `$CODEX_SECURITY_STATE_DIR/codex-home`, otherwise `$CODEX_HOME/state/plugins/codex-security/codex-home`, with `~/.codex` as the default Codex home. Keep this outside the target and enclosing repositories. The login command and OpenCode process must use the same environment.

If dedicated sign-in is absent, the user can choose to complete the installed official CLI flow from the consumer directory: `./node_modules/.bin/codex-security login`. This creates a separate session through interactive sign-in, not a plugin startup action. Never ask for secrets in chat, read/copy private token files or import an ambient Codex sign-in to satisfy this guard. Do not run SDK `login status` or account helpers before dedicated credentials exist: they can import ambient credentials. This plugin fixes authentication to ChatGPT and provider to OpenAI; upstream SDK API-key/provider examples are not supported plugin settings.

The guard requires a private dedicated `auth.json`; keyring-only authentication is insufficient. Do not automatically change credential storage, managed-device policy or permissions to make it pass. Report the incompatibility and use the official supported account setup. See [agent setup](https://github.com/strantalis/opencode-codex-security/blob/main/docs/AGENT-SETUP.md) for the complete installation prompt.

SDK 0.9.1 can import ambient credentials when its dedicated home is empty. The guard prevents ordinary missing-auth startup, but is not an atomic no-import policy: external deletion after the check can still race. Windows is deliberately rejected until a safe ACL verification path exists.

## Verified behavior

The actual OpenCode host was tested with injected mocks for scans, concurrent runs, cancellation, policy questions and static validation. One authorized real synthetic-file scan authenticated and reached discovery, then exceeded its USD 1 estimated budget guard. No completed assessment was returned. Direct native Desktop verification and full real-scan quality remain separate work.
