# Install with an agent

Copy this into your coding agent on the machine where you use OpenCode:

```text
Install the npm package opencode-codex-security@0.1.0 in my existing OpenCode V2 setup (project: https://github.com/strantalis/opencode-codex-security). Inspect my environment, handle routine setup, and preserve my existing settings. Verify it loads in offline fixture mode; for real mode, use my existing approved provider setup only if supported and report incompatibilities instead of requesting a new sign-in or secrets. Do not interrupt active work, send source or run paid operations without my approval. Ask me only when you're blocked or need permission, and finish with a short summary of what's ready and anything I need to do.
```

The prompt pins `0.1.0`, the npm `latest` release verified November 10, 2026. Version `0.1.1` is also public under `next`; substitute that exact version if you want it. Installing the public package needs no npm login.

## Compatibility notes

- **Node:** the plugin requires Node 24 or newer, and SDK 0.9.1 supports **24.x or 26.x** within that range. Node 22 does not satisfy this plugin's published engines. Node 26.4+ is used for the repository's development/TUI tests, not an exclusive consumer requirement. Prefer an existing compatible runtime over changing the user's defaults.
- **OpenCode:** use V2. Version 2.2.6 is the original test baseline, not an exact-patch requirement. Isolated host tests with plugin 0.1.1 also pass on 2.2.4 and 2.2.7 with Node 24.22.1. Verify the actual host before recommending a change; a different patch number alone is not a blocker.
- **Real scans:** macOS or Linux and Python 3.10+ are required; Python 3.10 also needs `tomli`. The selected interpreter must be available to the OpenCode process. Windows real mode is deliberately rejected by the credential guard.

npm installs the pinned Codex Security SDK and its bundled Codex runtime, OpenCode plugin API and Solid dependencies. OpenCode itself is a separate host. OpenTUI is an optional peer supplied by the terminal integration; Bun is only needed for this repository's developer TUI smoke test. No separate global Codex CLI, SDK or publishing toolchain is required.

## Installation reference

[OpenCode supports npm package entries](https://opencode.ai/docs/plugins) in its V2 `plugins` array. Its [2.2.7 installer disables lifecycle scripts](https://github.com/anomalyco/opencode/blob/v2.2.7/packages/util/src/npm.ts). Add this object to the existing array:

```json
{
  "package": "opencode-codex-security@0.1.0",
  "options": { "engine": "fixture" }
}
```

For explicit installation/audit control instead, use a dedicated consumer outside source repositories and active installations:

```sh
mkdir security-plugin && cd security-plugin
npm init -y
npm install --save-exact --ignore-scripts opencode-codex-security@0.1.0
npm audit --omit=dev --audit-level=high
```

For that route, replace `package` with the absolute installed directory, such as `/absolute/path/to/security-plugin/node_modules/opencode-codex-security`. Keep its lockfile for repeat installs. Report audit findings; do not force dependency fixes or enable lifecycle scripts as a workaround.

Find the effective OpenCode configuration rather than creating a competing file. Standard locations are `$XDG_CONFIG_HOME/opencode/opencode.json` or `~/.config/opencode/opencode.json`, with JSONC and explicit host overrides also supported. Preserve comments, unrelated settings and existing plugins. Keep a private backup outside repositories with restrictive permissions; show only plugin-specific changes, not the full configuration.

Check for active scans, approvals or policy forms **before editing watched settings or reloading**. Ask if their status is unknown. Offline installation can continue separately. Open `/security` to verify loading; fixture results come from bundled examples and do not assess the user's repository. Keep the old consumer for rollback.

## Real-mode provider compatibility

**LiteLLM and other proxy/provider configurations are not currently supported by this plugin.** It does not inherit OpenCode's model/provider configuration. Published real mode fixes the provider to OpenAI, authentication to ChatGPT and requires dedicated file-backed credentials. The upstream SDK's broader API-key/provider options are not exposed by the plugin. If the user's approved setup is incompatible, keep fixture mode and report the blocker; do not request another sign-in or bypass workplace policy.

For users explicitly choosing the supported ChatGPT setup, select `engine: codex` when its prerequisites are ready. This starts no scan. Preserve existing [global SDK settings](GLOBAL-CONFIG.md), which use `XDG_CONFIG_HOME` rather than the host's `OPENCODE_CONFIG_DIR` override.

Use an existing private dedicated sign-in when available. If login is needed, locate the installed SDK CLI and offer its official interactive login for the user to complete securely after choosing to sign in. For the manually installed consumer, run from that directory:

```sh
./node_modules/.bin/codex-security login
```

For host-managed npm loading, locate its installed CLI rather than assuming it is in the current directory. Login and OpenCode must share the same `CODEX_HOME`/`CODEX_SECURITY_STATE_DIR` environment. Dedicated `auth.json` lives under `$CODEX_SECURITY_STATE_DIR/codex-home`, otherwise `$CODEX_HOME/state/plugins/codex-security/codex-home` (`CODEX_HOME` defaults to `~/.codex`). Keep it outside target/enclosing repositories. The file and directory must be owned, nonsymlinks and inaccessible to group/other users. Check metadata only; never read, copy or print token files or request secrets in chat.

Do not use SDK `login status` or account helpers before dedicated credentials exist: SDK 0.9.1 can import ambient credentials. A keyring-only login does not satisfy the file guard. If login succeeds but the guard fails, report the storage/privacy incompatibility instead of changing credential storage, permissions, managed policy or the guard. See [official authentication guidance](https://github.com/openai/codex-security/blob/main/sdk/typescript/README.md#authentication).

Real operations need approved targets, source/context transfer to OpenAI and expected usage. Scope is not filesystem isolation; SDK subprocesses can inherit environment credentials. Use an approved environment without unrelated secrets. Scan cost thresholds are estimates, not hard caps; finding validation has no SDK cost ceiling and needs separate approval. Respect native permissions and do not use scans as authentication tests. See [SDK boundaries](SDK.md) and [local-scan permissions](https://learn.chatgpt.com/docs/security/cli/reference#local-scan-permissions).

The host smoke tests cover plugin registration, fixture RPC, repeat-start behavior, the SDK consent gate and the GUI bundle endpoint. The npm entry for published 0.1.0 also passed on OpenCode 2.2.7 from a neutral project with an empty cache. These checks do not establish native Desktop/TUI rendering or real scan quality.
