# Codex Security SDK integration

Pinned SDK: `@openai/codex-security@0.9.1`; plugin API package: `@opencode/plugin@2.2.6`. OpenCode 2.2.6 is the original host-test baseline, not an exact-patch requirement.

Current global configuration is documented in [GLOBAL-CONFIG.md](GLOBAL-CONFIG.md). No per-project SDK overrides are loaded. Session-supplied target/focus/context is distinct from global model, reasoning and Daybreak settings. Optional per-scan Standard/Deep mode overrides only the global mode fallback; no other SDK settings are overridden by session inputs.

## Host runtime versus SDK helpers

Packaged OpenCode installs npm plugins in-process and runs them with its bundled runtime. A separate system Node/npm installation is not required to load this plugin or run its fixture mode. Installing OpenCode through npm or developing the plugin is a different workflow.

Real SDK operations have additional requirements: SDK 0.9.1's workbench helpers and deep-scan engine explicitly resolve external Node from a trusted `PATH` when hosted by Bun. Missing Node fails those paths; bundled Bun is not a substitute. The plugin currently supports Node 24.x or 26.x, and real scans require Python 3.10+ (`tomli` for Python 3.10). Ensure the OpenCode service can see existing compatible runtimes before proposing installation or changes. npm is not required to run the helpers. Fixture/consent-gate tests do not establish successful real inference.

## Pipeline

1. `security_prepare_scan` or the native review action resolves the current OpenCode location (or explicit repository), canonical scope paths, focused instructions and bounded documentation files. It reads and hashes the global settings file and, when explicitly configured, imports an allowlisted custom-provider selection from a Codex TOML file. `codex.useCodexConfig: true` defaults to `$CODEX_HOME/config.toml`, or `~/.codex/config.toml` when that variable is unset/empty. An explicit `codex.configFile` wins without consulting `CODEX_HOME`; no import occurs by default. Only validated selection fields, not raw TOML or secret values, enter the source digest. No SDK client, login or inference is created.
2. Preview includes target, added context, provider/base URL, auth mode, environment-key name, model/reasoning, source selection, Daybreak/access program and estimated cost threshold. The whole conversation is not copied.
3. `security_run_scan` checks native OpenCode permissions. Applicable saved authorization can allow it without a redundant prompt. Native UI uses an explicit review action. Missing/mismatched/reused previews fail closed.
4. Before starting, the plugin revalidates target/context and global config, resolved source-file location and selected-provider fingerprints. A change or expired preview requires a new review.
5. The adapter creates an SDK client from the resolved model, reasoning, Daybreak and provider snapshot. Default routing uses OpenAI plus dedicated ChatGPT auth. An explicit custom Responses provider uses `auth: "api-key"` and its selected environment key. It invokes `run(repository, options)` with scope, prompt, documentation paths, configured scan settings and disabled owner suggestions. Policy generation and validation use the same resolved route; validation separately requires uncapped approval.
6. Progress and sanitized lifecycle events update the panel. Findings arrive at completion. Informational findings are counted but not relabeled in the four-severity display. Local SDK artifacts remain authoritative.

## Safety and authorization boundaries

- The global file never authorizes scans, saves credentials or changes accounts.
- A model tool cannot inject arbitrary SDK constructor objects, credentials, executable paths, provider URLs or an approval boolean.
- Native host permission rules are the authorization authority for the run tool. Direct RPC is intended only for the trusted UI, not a workaround for model authorization.
- Repository scope is not a sandbox. Source beyond a scoped file can be relevant to SDK analysis. These settings do not guarantee process/filesystem isolation.
- Named context is restricted to in-repository text documentation, excluding obvious credential/runtime paths. Context changes between review and execution are rejected. Hostile concurrent directory mutation is outside this prototype's scope.
- Models and account entitlement are not checked while loading settings. Daybreak is a separate toggle, not a model; the toggle does not grant access.
- Cost limits use estimates, not a hard billing cap. In-flight work can exceed the threshold.

## Custom-provider authentication

Provider routing is available in published version `0.1.2` (under `next` as of November 10, 2026). Published `0.1.0`/`0.1.1` packages do not expose it.

See [the no-sign-in setup](GLOBAL-CONFIG.md#use-an-existing-custom-provider-without-sign-in). Custom-provider readiness validates the non-secret routing and checks only the selected environment key's presence before SDK construction. It does not consult `account()`, log in, read `auth.json`, or import ambient credentials. The SDK's custom `env_key` path skips ambient-auth import; explicit API-key mode avoids stored-auth fallback. The plugin passes a snapshot, never the original SDK profile or unrelated settings.

Custom-provider Daybreak, auth commands, inline tokens, custom headers and catalogs are deliberately unsupported. Unknown model aliases can fail SDK cost estimation; the scan/policy limit is retained rather than bypassed. Known model estimates are not verified gateway billing rates. Gateways may route onward to upstream services, and Responses compatibility does not prove the required tool support. Mock tests do not establish real gateway compatibility.

## Default dedicated ChatGPT authentication

The default ChatGPT route requires an existing private, owned, nonsymlink dedicated auth file and directory. A metadata-only guard runs before constructing the real SDK client. It does not read tokens, perform login or import credentials. The injected mock clients bypass this real-auth precondition.

The SDK uses `$CODEX_SECURITY_STATE_DIR/codex-home`, otherwise `$CODEX_HOME/state/plugins/codex-security/codex-home`, with `~/.codex` as the default Codex home. Keep this outside the target and enclosing repositories. The login command and OpenCode process must use the same environment.

Only users choosing this default ChatGPT route should use its sign-in flow. If dedicated sign-in is absent, they can choose to complete the installed official CLI flow from the consumer directory: `./node_modules/.bin/codex-security login`. This creates a separate session through interactive sign-in, not a plugin startup action. Never ask for secrets in chat, read/copy private token files or import an ambient Codex sign-in to satisfy this guard. Do not run SDK `login status` or account helpers before dedicated credentials exist: they can import ambient credentials. These sign-in instructions are not needed for an explicitly selected custom-provider environment-key route.

The guard requires a private dedicated `auth.json`; keyring-only authentication is insufficient. Do not automatically change credential storage, managed-device policy or permissions to make it pass. Report the incompatibility and use the official supported account setup. See [agent setup](https://github.com/strantalis/opencode-codex-security/blob/main/docs/AGENT-SETUP.md) for the complete installation prompt.

SDK 0.9.1 can import ambient credentials when its dedicated home is empty. The guard prevents ordinary missing-auth startup, but is not an atomic no-import policy: external deletion after the check can still race. The ChatGPT guard deliberately rejects Windows until a safe ACL verification path exists. Custom-provider key checks are platform-neutral, but this project has not verified a complete Windows SDK operation.

## Verified behavior

The actual OpenCode host was tested with injected mocks for scans, concurrent runs, cancellation, policy questions and static validation. One authorized real synthetic-file scan authenticated and reached discovery, then exceeded its USD 1 estimated budget guard. No completed assessment was returned. Direct native Desktop verification and full real-scan quality remain separate work.
