# Global Codex Security settings

The plugin reads one optional global settings file:

- `$XDG_CONFIG_HOME/opencode/codex-security.json` when XDG_CONFIG_HOME is set.
- Otherwise `~/.config/opencode/codex-security.json`.

There are **no project overrides**. Session tools provide repository, scoped paths, scan instructions and named context files separately. The optional per-scan `mode` (standard/deep) overrides the global mode for that scan only. Other SDK settings stay global; tool inputs do not grant authorization.

The file is read whenever a scan is prepared. Changing it invalidates an outstanding preview, so changed settings cannot silently reach an already-approved scan. No application restart is needed for setting changes.

Without provider opt-in, the defaults preserve dedicated ChatGPT authentication, the SDK model/reasoning settings, and a USD 1 estimated stop threshold:

```json
{
  "codex": {
    "model": "gpt-5.6-sol",
    "reasoningEffort": "xhigh",
    "daybreak": false
  },
  "scan": {
    "mode": "standard",
    "maxCostUsd": 1
  }
}
```

## Supported options

- `codex.model`: model ID, forwarded to SDK constructor `codexOverrides.model`.
- `codex.reasoningEffort`: none, minimal, low, medium, high or xhigh; forwarded as `model_reasoning_effort`. Actual support depends on the selected model.
- `codex.daybreak`: boolean, forwarded as `codexOverrides.daybreak`. Custom-provider Daybreak is currently unsupported by this plugin.
- `codex.useCodexConfig`: set `true` to import the existing Codex provider from the standard config location without specifying a path. Omitted or `false` alone leaves import off. An explicit `configFile` independently opts in when the flag is omitted.
- `codex.configFile`: explicit absolute or `~/` TOML path that overrides the standard location. Existing configurations using this field alone remain supported.
- `codex.profile`: optional native `[profiles.name]` selection inside the imported file. Without it, the file's top-level `profile` is used if present.
- `codex.provider`: explicit custom-provider object as an alternative to `configFile`.
- `codex.auth`: optional `chatgpt` or `api-key`. Defaults to `chatgpt` without a custom provider and `api-key` with one. Contradictory choices fail closed.
- `scan.mode`: standard or deep, used only when no per-scan mode is supplied. The built-in fallback is standard.
- `scan.maxCostUsd`: positive estimated stop threshold. This is **not a hard billing cap**; in-flight usage may exceed it.
- `scan.maxTimeMinutes`: positive time limit.
- `scan.cyberAccessProgram`: optional standard, daybreak_blue or daybreak_red.
- `scan.workers`: positive integer, relevant to deep scans.
- `scan.subagents`: nonnegative integer, relevant to deep scans; zero is valid.

Unknown keys and invalid values fail closed. Credential **values**, arbitrary environment variables, runtime executable paths and approval policies are not configurable here. Only the selected provider's environment-variable **name** is accepted. Owner suggestions remain disabled. Do not place secrets in this file.

## Use an existing Codex/LiteLLM provider without sign-in

Source version `0.1.2` supports an opt-in custom Responses provider. Do not assume the published `0.1.0` or `0.1.1` package contains this change; install only a release whose notes include provider routing.

If your existing Codex configuration already defines a custom provider with `base_url` and `env_key`, using `wire_api = "responses"` (also the native default when omitted), add this to your global `codex-security.json`:

```json
{
  "codex": {
    "useCodexConfig": true
  }
}
```

The default path is `$CODEX_HOME/config.toml` when `CODEX_HOME` is set and nonempty, otherwise `~/.codex/config.toml`. Exactly empty `CODEX_HOME` behaves as unset; whitespace-only, relative (including literal `~/...`) or control-character values fail clearly. `CODEX_HOME` must be an absolute directory; explicit `configFile` still supports `~/` expansion. Spaces in valid absolute directory names are preserved. A missing or invalid selected file fails without switching providers or falling back to ChatGPT.

For another location, add `"configFile": "/approved/path/config.toml"`; this takes precedence without inspecting `CODEX_HOME`. The existing `configFile`-only syntax also works. Add `"profile": "work"` to select `[profiles.work]` inside the imported file. To read a standalone `work.config.toml`, point `configFile` at that file instead. These are plugin import options, **not** SDK `profile` overrides. The plugin reads no Codex configuration without import opt-in, and does not import OpenCode provider settings. This feature is provider-agnostic for the supported custom HTTPS Responses + environment-key route; it is not support for every Codex transport, authentication method or feature.

Option combinations are explicit:

- `useCodexConfig: true` selects the standard location; an explicit `configFile` overrides it.
- `configFile` without `useCodexConfig` remains an import opt-in.
- Neither option, or `useCodexConfig: false` alone, preserves the default ChatGPT route.
- `useCodexConfig: false` with `configFile` is contradictory and rejected.
- Explicit `provider` settings work with import omitted/false, but cannot be combined with import enabled.

The resolved source path appears in the approval preview. Changing `CODEX_HOME` to select another file invalidates existing scan, policy and validation previews, even when the selected model/provider fields match.

The named environment key must already be available to the OpenCode service process. GUI launches and restarted services may not inherit terminal exports; a missing variable is a local setup blocker, not a request to display or copy its value. Never paste its value into chat, JSON, TOML, logs or screenshots. No sign-in is needed for this route. The plugin checks only the selected variable's presence after operation approval; the SDK consumes the value during the authorized operation. A missing key fails without falling back to ChatGPT or another key.

Only these fields are imported:

- Selected `model`, `model_reasoning_effort`, and `daybreak`.
- Selected `model_provider` and its provider's `base_url`, `env_key`, `wire_api`, and optional `requires_openai_auth = false`. The provider's display name is replaced by its ID. Root provider fields are inherited when the selected profile overrides only some fields.

Explicit global JSON model/reasoning/Daybreak options override the imported values, which override plugin defaults. To inherit the Codex model, remove an old explicit `codex.model` from the plugin JSON. Provider routing cannot be overridden by a session tool or project file. Do not combine `configFile` and `provider`.

The selected provider must use a custom ID. Built-in IDs such as `openai`, `ollama`, `lmstudio`, `amazon-bedrock`, and `gcp` have different authentication semantics and are rejected. An `OPENAI_BASE_URL` environment override or built-in OpenAI provider is not automatically converted into a custom route. Missing profiles, undefined providers, missing `env_key`, unsupported wire APIs, and `requires_openai_auth = true` fail closed.

Only credential-free HTTPS base URLs are supported. URL userinfo, query strings, fragments, encoded paths, inline keys, custom headers (including environment headers), auth commands, model catalogs and other provider extensions are rejected. Harmless `env_key_instructions`, `request_max_retries`, `stream_max_retries`, and `stream_idle_timeout_ms` hints are ignored, not forwarded or included in the digest. MCP servers, plugins, shell commands, hooks and security settings elsewhere in the source file are never copied. The import accepts a regular nonsymlink TOML file up to 256 KiB; parser errors do not echo source lines. The retained source digest covers only the validated selection, not raw TOML or credential values.

### Explicit provider alternative

If you do not want to import a file, configure the same non-secret routing fields directly:

```json
{
  "codex": {
    "model": "gpt-5.6-sol",
    "provider": {
      "id": "litellm",
      "baseUrl": "https://gateway.example.com/v1",
      "envKey": "LITELLM_API_KEY",
      "wireApi": "responses"
    }
  },
  "scan": { "maxCostUsd": 1 }
}
```

The hostname and model above are examples, not a working service or assurance of model access. Use your organization's approved gateway and its supported model name. Never substitute a credential value for `envKey` or embed credentials in the URL.

### Compatibility and cost limits

- Responses API support alone is insufficient. The gateway/model must support Codex Security's streaming, namespaced/function tools and any required web-search tools. No real LiteLLM endpoint has been tested for this change.
- Model aliases without SDK pricing fail the scan/policy cost guard. The plugin **does not remove the budget** to make them run. A recognized OpenAI model name's estimate is not proof of the gateway's billing rate or a hard cap. Do not rename a different model merely to obtain an estimate.
- Static finding validation still has **no SDK cost ceiling** and requires separate uncapped approval.
- Custom-provider Daybreak is not supported in this plugin version. Set `daybreak` false and omit `cyberAccessProgram` or use `standard`. Some current Codex proxy configurations support Daybreak, but their catalog/capability settings are not imported by this bounded implementation.
- Cloud publication, embedding configuration, patching, and fix verification are not enabled by this route. Native analytics are explicitly disabled for custom routes; unrelated telemetry settings are not imported. SDK private runtime state is still created during real operations. No-login does not mean no local state or no network activity.
- Previews and native permission prompts identify the selected provider/base URL, auth mode, key name, model and source selection. Source/context go to that gateway, which can route onward to its upstream providers. The plugin does not verify those upstream destinations.

## Daybreak is not a model

SDK 0.9.1 documents Daybreak as a separate toggle, available with Codex 0.163.0 or later. Set `codex.daybreak` to true to request it. Compatible OpenAI account access is still required; the toggle does not grant entitlement. A separate explicit `scan.cyberAccessProgram` selection takes precedence over the toggle. Omit that option when you want Codex to select the available program.

The plugin does not check entitlement, sign in, copy credentials or switch accounts while loading configuration. The existing Desktop Daybreak toggle does not configure the SDK's isolated runner. The default OpenAI route still needs appropriately authorized dedicated sign-in and inference; an explicitly selected custom route uses its environment key instead. Neither model availability nor Daybreak entitlement has been verified on this account.

## Authorization and session inputs

`security_prepare_scan` uses a known local OpenCode workspace by default, or an explicit local repository path. Missing session context requires an absolute target; the plugin never guesses from its own working directory. Global settings do not select a repository or merge workspace histories. It accepts `scopePaths`, `scanPrompt`, `contextFiles` and optional `mode`. An explicit Standard/Deep request wins; otherwise mode falls back to global settings. The preview names the resolved mode and its source. It returns the target, context file names/sizes/hashes, global settings and inference/cost disclosure without starting a model.

`security_run_scan` takes the preview ID, checks OpenCode's `codex_security_scan` permission and starts only that unchanged preview. Host permission rules can honor existing applicable authorization; the plugin does not force a second confirmation after an allow decision. A denial is propagated. Use `/security-mode` in the TUI or the Desktop Scan mode selector to choose Global default, Standard or Deep without editing the global file. Choosing a mode only prepares a preview, never starts inference. The TUI `/security-scan` and Desktop review button show the preview and let the user confirm or cancel.

No whole-conversation history is copied. Context files must be existing text documentation inside the selected repository (up to eight files, 64 KiB each and 128 KiB total). Traversal, out-of-repository symlinks, credential/runtime directories and obvious credential filenames are rejected. Scoped paths guide the SDK; they are not a filesystem sandbox. The repository itself and wider SDK analysis context still require appropriate authorization.

## Verification

Offline tests also cover custom-provider propagation through scan/policy/validation, missing-key and no-ChatGPT fallback behavior, safe TOML selection, rejected credential-bearing routes, stale source/model/route/auth changes, and native permission refusal. They verify configuration propagation into constructor and scan options, ignored project config, changed-config rejection, input boundaries, model-tool preparation, host authorization allow/deny, and no SDK creation before approval. The actual OpenCode 2.2.6 host test uses an injected mock SDK. Mock findings and test settings do not prove model/Daybreak entitlement or real scan quality.

Official SDK sources checked:

- https://github.com/openai/codex-security/blob/main/sdk/typescript/README.md
- https://github.com/openai/codex-security/blob/main/sdk/typescript/docs/cli.md#daybreak-opt-in
- Installed @openai/codex-security@0.9.1 README, docs/cli.md, config and ScanOptions declarations.
