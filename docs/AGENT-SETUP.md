# Install with an agent

Copy this into your coding agent on the machine where you use OpenCode:

```text
Install opencode-codex-security@0.1.2 in my existing OpenCode V2 setup after confirming that exact version is published (project: https://github.com/strantalis/opencode-codex-security). Use my existing approved Codex/LiteLLM provider settings, handling routine setup and preserving unrelated configuration. Verify the plugin loads without starting a scan; do not request a sign-in or secrets. Do not interrupt active work, send source or run paid operations without my approval. Ask only when blocked or permission is needed, and finish with a brief status.
```

**Release status:** provider routing is an upcoming `0.1.2` change, not part of the published `0.1.0` or `0.1.1` packages. The prompt checks availability before installing. Until `0.1.2` is published, use only an explicitly provided tested build containing this change or report that the release is unavailable. Do not fall back to an older package for LiteLLM. Installing a public npm package needs no npm login.

## Compatibility notes

- **Node:** the plugin requires Node 24 or newer, and SDK 0.9.1 supports **24.x or 26.x** within that range. Node 22 does not satisfy this plugin's published engines. Node 26.4+ is used for the repository's development/TUI tests, not an exclusive consumer requirement. Prefer an existing compatible runtime over changing the user's defaults.
- **OpenCode:** use V2. Version 2.2.6 is the original test baseline, not an exact-patch requirement. Isolated host tests with plugin 0.1.1 also pass on 2.2.4 and 2.2.7 with Node 24.22.1. Verify the actual host before recommending a change; a different patch number alone is not a blocker.
- **Real scans:** Python 3.10+ is required; Python 3.10 also needs `tomli`. The interpreter must be available to the OpenCode process. macOS/Linux are the tested host platforms. The ChatGPT credential guard rejects Windows; custom-provider key checks are platform-neutral, but a complete Windows SDK operation has not been verified.

npm installs the pinned Codex Security SDK and its bundled Codex runtime, OpenCode plugin API and Solid dependencies. OpenCode itself is a separate host. OpenTUI is an optional peer supplied by the terminal integration; Bun is only needed for this repository's developer TUI smoke test. No separate global Codex CLI, SDK or publishing toolchain is required.

## Installation reference

[OpenCode supports npm package entries](https://opencode.ai/docs/plugins) in its V2 `plugins` array. Its [2.2.7 installer disables lifecycle scripts](https://github.com/anomalyco/opencode/blob/v2.2.7/packages/util/src/npm.ts). After confirming `0.1.2` is published, add this object to the existing array:

```json
{
  "package": "opencode-codex-security@0.1.2",
  "options": { "engine": "fixture" }
}
```

For explicit installation/audit control after publication, use a dedicated consumer outside source repositories and active installations:

```sh
mkdir security-plugin && cd security-plugin
npm init -y
npm view opencode-codex-security@0.1.2 version &&
  npm install --save-exact --ignore-scripts opencode-codex-security@0.1.2
npm audit --omit=dev --audit-level=high
```

For that route, replace `package` with the absolute installed directory, such as `/absolute/path/to/security-plugin/node_modules/opencode-codex-security`. Keep its lockfile for repeat installs. Report audit findings; do not force dependency fixes or enable lifecycle scripts as a workaround.

Find the effective OpenCode configuration rather than creating a competing file. Standard locations are `$XDG_CONFIG_HOME/opencode/opencode.json` or `~/.config/opencode/opencode.json`, with JSONC and explicit host overrides also supported. Preserve comments, unrelated settings and existing plugins. Keep a private backup outside repositories with restrictive permissions; show only plugin-specific changes, not the full configuration.

Check for active scans, approvals or policy forms **before editing watched settings or reloading**. Ask if their status is unknown. Offline installation can continue separately. Open `/security` to verify loading; fixture results come from bundled examples and do not assess the user's repository. Keep the old consumer for rollback.

## Use your existing Codex/LiteLLM configuration

In `0.1.2`, opt in through the plugin's global `codex-security.json`, preserving unrelated settings:

```json
{
  "codex": {
    "configFile": "~/.codex/config.toml"
  }
}
```

Use the actual approved Codex TOML path. Add `"profile": "work"` inside `codex` to select `[profiles.work]`; otherwise the file's root profile selection is honored. For a standalone `work.config.toml`, use that path as `configFile`. Existing explicit plugin model/reasoning/Daybreak settings override imports, so remove only overrides you want to inherit.

The selected custom provider must have an approved HTTPS `base_url` and `env_key` and support the Responses API. Its named key must already be available to the OpenCode service process; GUI launches and restarted services may not inherit terminal exports. A missing variable is a local setup blocker, not a request to display or copy its value. This route uses API-key authentication without sign-in or a dedicated `auth.json`; a missing key fails rather than falling back to ChatGPT. Never paste key values into chat or settings. The plugin imports only validated selected fields, not arbitrary Codex options or OpenCode provider settings.

For an explicit `codex.provider` alternative and full restrictions, see [global provider settings](GLOBAL-CONFIG.md#use-an-existing-codexlitellm-provider-without-sign-in). Custom headers/auth commands and custom-provider Daybreak are unsupported. Unknown model aliases can fail the SDK cost guard; do not remove the guard or relabel a different model to get an estimate. Responses support alone does not establish tool compatibility, and no real LiteLLM endpoint has been tested.

Select `engine: codex` when the configuration is ready and the host is idle. Loading it starts no scan. The global settings file uses `XDG_CONFIG_HOME`, not the host's `OPENCODE_CONFIG_DIR` override.

## Optional dedicated ChatGPT route

The existing default ChatGPT route remains available separately; it is not a fallback for a workplace gateway. It requires private dedicated file-backed credentials. Check metadata only, never read or copy token files, and do not run SDK `login status`/account helpers when credentials are missing because they can import ambient authentication. Keyring-only credentials do not satisfy the file guard.

Only users explicitly choosing this route should follow [dedicated ChatGPT authentication](SDK.md#default-dedicated-chatgpt-authentication). Do not request a new sign-in when the user wants their existing provider configuration.

## Before a real operation

Get approval for the target, source/context destination and expected usage. Previews identify the selected gateway, which may route onward to upstream services; this configuration is not a guarantee of gateway-only network traffic. Scope is not filesystem isolation, and SDK subprocesses can inherit environment credentials. Use an approved environment without unrelated secrets.

Scan cost thresholds are estimates, not hard caps or verified gateway prices. Finding validation has no SDK cost ceiling and needs separate approval. Respect native permissions and do not use scans as authentication tests. See [SDK boundaries](SDK.md) and [local-scan permissions](https://learn.chatgpt.com/docs/security/cli/reference#local-scan-permissions).

The host smoke tests cover plugin registration, fixture RPC, repeat-start behavior, the SDK consent gate and the GUI bundle endpoint. The npm entry for published 0.1.0 also passed on OpenCode 2.2.7 from a neutral project with an empty cache. These checks do not establish native Desktop/TUI rendering or real scan quality.
