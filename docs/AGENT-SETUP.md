# Install with an agent

Copy this into your coding agent on the machine where you use OpenCode:

```text
Install opencode-codex-security@0.1.2 in my existing OpenCode V2 setup (project: https://github.com/strantalis/opencode-codex-security). Follow its agent setup guide, preserve unrelated settings and use my existing approved provider configuration when supported. Verify the plugin loads without starting a scan. Do not switch providers, request a sign-in or secrets, interrupt active work, or send source/run paid operations without my approval. Check the actual host before proposing runtime changes. Ask only when blocked or permission is needed, then give a brief status.
```

**Release status:** `0.1.2` is published under `next`, verified November 10, 2026; `latest` remains `0.1.0`. Pin `0.1.2` rather than a moving tag and recheck availability before installing. It adds optional custom-provider routing, which is not in `0.1.0` or `0.1.1`. Installing a public npm package needs no npm login.

The setup is provider-neutral. Import an existing supported Codex configuration, use an explicit supported custom provider, or keep an already configured dedicated ChatGPT route. No particular gateway is required, and arbitrary OpenCode provider settings are not automatically inherited. If the user's configuration is unsupported or ambiguous, explain the specific limitation rather than inventing settings or switching routes.

## Compatibility notes

- **Runtime:** OpenCode's packaged host uses its own runtime; a different `node --version` in a terminal does not by itself prove the plugin cannot load. Verify the actual host first. For a separate npm consumer, the published plugin declares Node `>=24`, with SDK 0.9.1 supporting **24.x or 26.x** in that range. Node 22 is outside the plugin's current declared support. Node 26.4+ is the repository's development/TUI baseline, not an exclusive consumer requirement. Do not change system Node or bypass engine checks just to match the development baseline.
- **OpenCode:** use V2. Version 2.2.6 is the original test baseline, not an exact-patch requirement. Isolated host tests with plugin 0.1.1 also pass on 2.2.4 and 2.2.7 with Node 24.22.1. Verify the actual host before recommending a change; a different patch number alone is not a blocker.
- **Real scans:** Python 3.10+ is required; Python 3.10 also needs `tomli`. The interpreter must be available to the OpenCode process. macOS/Linux are the tested host platforms. The ChatGPT credential guard rejects Windows; custom-provider key checks are platform-neutral, but a complete Windows SDK operation has not been verified.

npm installs the pinned Codex Security SDK and its bundled Codex runtime, OpenCode plugin API and Solid dependencies. OpenCode itself is a separate host. OpenTUI is an optional peer supplied by the terminal integration; Bun is only needed for this repository's developer TUI smoke test. No separate global Codex CLI, SDK or publishing toolchain is required.

**Node 22.14 check:** SDK 0.9.1 itself permits 22.13+, but the tested dependency tree includes packages requiring 22.19+. Importing its `undici@8.12.4` dependency fails on 22.14.0. SDK construction and fixture checks alone do not establish full runtime support. The published engine range is unchanged; a working bundled OpenCode host should be assessed separately from terminal Node.

## Installation reference

[OpenCode supports npm package entries](https://opencode.ai/docs/plugins) in its V2 `plugins` array. Its [2.2.7 installer disables lifecycle scripts](https://github.com/anomalyco/opencode/blob/v2.2.7/packages/util/src/npm.ts). Add this object to the existing array:

```json
{
  "package": "opencode-codex-security@0.1.2",
  "options": { "engine": "fixture" }
}
```

For explicit installation/audit control, use a dedicated consumer outside source repositories and active installations:

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

## Use your existing provider configuration

If the approved Codex configuration selects a supported custom Responses provider, opt in through the plugin's global `codex-security.json`, preserving unrelated settings:

```json
{
  "codex": {
    "useCodexConfig": true
  }
}
```

This reads `$CODEX_HOME/config.toml`, or `~/.codex/config.toml` when `CODEX_HOME` is unset or empty. For a different approved TOML file, add `"configFile": "/approved/path/config.toml"`; that path takes precedence. Add `"profile": "work"` inside `codex` only to select an existing `[profiles.work]`; otherwise the file's root profile selection is honored. A standalone `work.config.toml` belongs in `configFile`, not `profile`. Existing explicit plugin model/reasoning/Daybreak settings override imports, so remove only overrides the user wants to inherit.

The selected custom provider must have an approved HTTPS `base_url` and `env_key` and support the Responses API. Its named key must already be available to the OpenCode service process; GUI launches and restarted services may not inherit terminal exports. A missing variable is a local setup blocker, not a request to display or copy its value. This route uses API-key authentication without sign-in or a dedicated `auth.json`; a missing key fails rather than falling back to ChatGPT. Never paste key values into chat or settings. The plugin imports only validated selected fields, not arbitrary Codex options or OpenCode provider settings.

For an explicit `codex.provider` alternative and full restrictions, see [global provider settings](GLOBAL-CONFIG.md#use-an-existing-custom-provider-without-sign-in). Custom headers/auth commands and custom-provider Daybreak are unsupported. Unknown model aliases can fail the SDK cost guard; do not remove the guard or relabel a different model to get an estimate. Responses support alone does not establish tool compatibility. Routing tests use mocks and do not establish compatibility with a real gateway.

Select `engine: codex` when the configuration is ready and the host is idle. Loading it starts no scan. The global settings file uses `XDG_CONFIG_HOME`, not the host's `OPENCODE_CONFIG_DIR` override.

## Optional dedicated ChatGPT route

The existing default ChatGPT route remains available separately; it is not a fallback for a workplace gateway. It requires private dedicated file-backed credentials. Check metadata only, never read or copy token files, and do not run SDK `login status`/account helpers when credentials are missing because they can import ambient authentication. Keyring-only credentials do not satisfy the file guard.

Only users explicitly choosing this route should follow [dedicated ChatGPT authentication](SDK.md#default-dedicated-chatgpt-authentication). Do not request a new sign-in when the user wants their existing provider configuration.

## Before a real operation

Get approval for the target, source/context destination and expected usage. Previews identify the selected gateway, which may route onward to upstream services; this configuration is not a guarantee of gateway-only network traffic. Scope is not filesystem isolation, and SDK subprocesses can inherit environment credentials. Use an approved environment without unrelated secrets.

Scan cost thresholds are estimates, not hard caps or verified gateway prices. Finding validation has no SDK cost ceiling and needs separate approval. Respect native permissions and do not use scans as authentication tests. See [SDK boundaries](SDK.md) and [local-scan permissions](https://learn.chatgpt.com/docs/security/cli/reference#local-scan-permissions).

The host smoke tests cover plugin registration, fixture RPC, repeat-start behavior, the SDK consent gate and the GUI bundle endpoint. The npm entry for published 0.1.0 also passed on OpenCode 2.2.7 from a neutral project with an empty cache. These checks do not establish native Desktop/TUI rendering or real scan quality.
