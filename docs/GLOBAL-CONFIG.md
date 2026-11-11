# Global Codex Security settings

The plugin reads one optional global settings file:

- `$XDG_CONFIG_HOME/opencode/codex-security.json` when XDG_CONFIG_HOME is set.
- Otherwise `~/.config/opencode/codex-security.json`.

There are **no project overrides**. Session tools provide repository, scoped paths, scan instructions and named context files separately. The optional per-scan `mode` (standard/deep) overrides the global mode for that scan only. Other SDK settings stay global; tool inputs do not grant authorization.

The file is read whenever a scan is prepared. Changing it invalidates an outstanding preview, so changed settings cannot silently reach an already-approved scan. No application restart is needed for setting changes.

The normal plugin defaults to real SDK mode. At preparation time it discovers the standard Codex configuration unless you explicitly select a provider/authentication route or disable discovery. With no discovered configuration, defaults use dedicated ChatGPT authentication, the SDK model/reasoning settings, and no dollar-based stop limit:

```json
{
  "codex": {
    "model": "gpt-5.6-sol",
    "reasoningEffort": "xhigh",
    "daybreak": false
  },
  "scan": {
    "mode": "standard"
  }
}
```

## Supported options

- `codex.model`: model ID, forwarded to SDK constructor `codexOverrides.model`.
- `codex.reasoningEffort`: none, minimal, low, medium, high or xhigh; forwarded as `model_reasoning_effort`. Actual support depends on the selected model.
- `codex.daybreak`: boolean, forwarded as `codexOverrides.daybreak`. The OpenAI Daybreak program toggle is unsupported for custom providers or native Bedrock; Bedrock Daybreak is selected by its model ID.
- `codex.useCodexConfig`: omitted discovers an existing standard Codex file unless an explicit provider/auth route was chosen. `true` requires that file. `false` disables discovery. An explicit `configFile` selects a required file when the flag is omitted.
- `codex.configFile`: explicit absolute or `~/` TOML path that overrides the standard location. Existing configurations using this field alone remain supported.
- `codex.profile`: optional native `[profiles.name]` selection inside the imported file. Without it, the file's top-level `profile` is used if present.
- `codex.provider`: explicit custom-provider object as an alternative to `configFile`.
- `codex.bedrock`: native AWS region and optional profile name; mutually exclusive with a custom provider and explicit config import.
- `codex.auth`: optional `chatgpt`, `api-key`, or `aws`. Native Bedrock resolves to `aws`. Defaults to `chatgpt` without a custom provider and `api-key` with one. Explicit `api-key` without a custom provider uses OpenAI and its existing environment keys. Contradictory choices fail closed.
- `scan.mode`: standard or deep, used only when no per-scan mode is supplied. The built-in fallback is standard.
- `scan.maxCostUsd`: optional positive estimated stop threshold. Omitted by default; normal provider charges apply without a dollar-based stop. This is **not a hard billing cap**; in-flight usage may exceed it.
- `scan.maxTimeMinutes`: positive time limit.
- `scan.cyberAccessProgram`: optional standard, daybreak_blue or daybreak_red.
- `scan.workers`: positive integer, relevant to deep scans.
- `scan.subagents`: nonnegative integer, relevant to deep scans; zero is valid.

Unknown keys and invalid values fail closed. Credential **values**, arbitrary environment variables, runtime executable paths and approval policies are not configurable here. Only the selected provider's environment-variable **name** is accepted. Owner suggestions remain disabled. Do not place secrets in this file.

## Authentication compatibility

Choose one supported route; loading never logs in or starts work. Discovery may reuse supported non-secret configuration, but does not authorize inference or create credentials.

| Existing setup                                      | Plugin support                                  | Required choice                                                                              |
| --------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Private dedicated ChatGPT sign-in                   | Supported on POSIX                              | Default built-in OpenAI route; credentials are never copied from ordinary Codex              |
| OpenAI environment API key                          | Supported                                       | Explicit `codex.auth: "api-key"`; no custom provider required                                |
| Custom HTTPS Responses provider and environment key | Supported                                       | Discover its Codex configuration or set `codex.provider`                                     |
| Extra environment-backed gateway headers            | Supported with the custom environment-key route | Non-secret header/variable mapping; values are resolved by the SDK during authorized work    |
| Native command/credential helper                    | Not yet supported by this plugin                | SDK support exists; needs a separate helper-execution/approval integration                   |
| Account-authenticated custom gateway                | Not yet supported by this plugin                | SDK support exists; account credential forwarding needs explicit destination/approval design |
| Keyless network identity                            | Unsupported by the SDK's local scan API         | No dummy key or fallback; see limitation below                                               |
| Native Amazon Bedrock                               | Supported in the next source build              | Explicit AWS region/model and existing AWS identity; no OpenAI sign-in or fake key           |
| Other built-in providers                            | Not yet supported by this plugin                | Require their own reviewed integration; do not rename them as custom key providers           |
| Inline tokens or literal secret headers             | Not supported                                   | Keep values outside configuration                                                            |

### OpenAI with an existing API key

Set this in the global plugin settings if you want API-key usage rather than dedicated ChatGPT authentication:

```json
{
  "codex": { "auth": "api-key" }
}
```

The OpenCode service must already have `OPENAI_API_KEY` or `CODEX_API_KEY`. SDK precedence is `OPENAI_API_KEY` first, then `CODEX_API_KEY`; the preview discloses both. No key values are read into settings, printed, hashed or saved by the plugin. Missing keys fail locally before the SDK is created, without falling back to a sign-in. Ambient endpoint overrides are rejected for this route so a preview labeled OpenAI cannot silently send data to a gateway; use an explicit custom provider instead.

### Amazon Bedrock with an existing AWS identity

The next source build adds native `amazon-bedrock` routing. It does not replace a custom gateway automatically. Select it explicitly or import a Codex configuration that already selects that provider:

```json
{
  "codex": {
    "bedrock": { "region": "us-east-2", "profile": "security-scan" },
    "model": "openai.gpt-daybreak-blue-5.6-sol",
    "reasoningEffort": "high"
  },
  "scan": { "mode": "standard" }
}
```

Use your existing authorized profile and exact Bedrock model. The profile is optional; without it, the native AWS credential chain supplies the identity. The plugin records only the region and profile name. It never reads AWS credential files, copies keys, signs in, or verifies entitlement during preparation. During an approved operation, native AWS authentication can read its existing profile, invoke an existing credential helper, and contact AWS identity services. This is not a promise of environment-only authentication or zero credential-related network traffic. Review the existing AWS setup before approving inference.

`codex.auth` resolves to `aws`; the SDK receives `auth: "auto"` with `model_provider: "amazon-bedrock"`, which selects its AWS credential path instead of OpenAI credentials. No API-key variable or dedicated ChatGPT sign-in is required by the plugin. An explicit configured AWS profile takes priority over ambient credentials in the bundled native provider. The preview identifies the requested profile/credential chain, not a verified identity.

Only commercial and GovCloud region names are accepted; China and isolated AWS partitions are unsupported. Region syntax validation does not establish Mantle or model availability. An explicit region and Bedrock model are required; the OpenAI default model is never substituted. Imported Codex settings may use `[model_providers.amazon-bedrock.aws]` with `region` and optional `profile`. If that imported region is absent, preparation snapshots `AWS_REGION`, then `AWS_DEFAULT_REGION`, and fails if neither is present. A subsequent selection change invalidates the preview. No AWS profile files are inspected to guess a region. Configured endpoint overrides, `credential_export`, `auth_refresh`, inline credentials, and other AWS provider options are not imported. Native inference is pinned to the displayed regional Mantle Responses endpoint. Ambient `AWS_ENDPOINT_URL*` overrides are rejected; existing AWS credential-chain configuration is still owned by the native AWS runtime.

For Bedrock, Daybreak access is selected by the provisioned model ID. Blue uses `openai.gpt-daybreak-blue-5.6-sol` in `us-east-2`; it does not use the OpenAI `daybreak` switch or `cyberAccessProgram: "daybreak_blue"`. Keep `daybreak` false and omit `cyberAccessProgram` (or use `standard`). This leaves the selected model unchanged and does not downgrade a Bedrock Daybreak model. AWS model access must already be provisioned. See the [versioned SDK Bedrock guide](https://github.com/openai/codex-security/blob/npm-v0.9.1/docs/bedrock.md).

Standard and Deep scans, policy drafts, and validation use the same approved routing snapshot. Scan/policy estimated cost stops remain enabled, using the SDK's region-aware Bedrock pricing. Unknown model/region pricing fails without removing the limit. Validation remains separately authorized and has no SDK cost cap. Offline tests verify routing and public SDK classification/pricing, not account access, streaming, live worker behavior, or billable end-to-end scans.

## Use an existing custom provider without sign-in

Custom Responses providers have been supported since `0.1.2`. Prepare-time automatic discovery is new in `0.1.4`; pin a published exact version or use an explicitly supplied tested build. Earlier releases require import opt-in.

If your existing Codex configuration defines a custom provider with `base_url` and `env_key`, using `wire_api = "responses"` (also the native default when omitted), no additional import setting is needed in `0.1.4`. To require that the standard config exists, add this to your global `codex-security.json`:

```json
{
  "codex": {
    "useCodexConfig": true
  }
}
```

The default path is `$CODEX_HOME/config.toml` when `CODEX_HOME` is set and nonempty, otherwise `~/.codex/config.toml`. Exactly empty `CODEX_HOME` behaves as unset; whitespace-only, relative (including literal `~/...`) or control-character values fail clearly. `CODEX_HOME` must be an absolute directory; explicit `configFile` still supports `~/` expansion. Spaces in valid absolute directory names are preserved. An absent automatically discovered file uses the dedicated ChatGPT route. A missing explicitly selected file, or an invalid/unsupported existing file, fails without switching providers or falling back to ChatGPT.

For another location, add `"configFile": "/approved/path/config.toml"`; this takes precedence without inspecting `CODEX_HOME`. The existing `configFile`-only syntax also works. Add `"profile": "work"` to select `[profiles.work]` inside the imported file. To read a standalone `work.config.toml`, point `configFile` at that file instead. These are plugin import options, **not** SDK `profile` overrides. Discovery reads only the standard Codex file during preparation. It does not read credential files or import OpenCode provider settings. This feature is provider-agnostic for the supported custom HTTPS Responses + environment-key route; it is not support for every Codex transport, authentication method or feature.

Option combinations are explicit:

- `useCodexConfig: true` selects the standard location; an explicit `configFile` overrides it.
- `configFile` without `useCodexConfig` remains an import opt-in.
- Neither import option nor explicit provider/authentication choice discovers the standard config during preparation. An absent automatic file uses the dedicated ChatGPT route.
- `useCodexConfig: false` or explicit `auth: "chatgpt"` disables automatic discovery and selects the dedicated ChatGPT route unless a different explicit supported provider is supplied.
- `useCodexConfig: false` with `configFile` is contradictory and rejected.
- Explicit `provider` settings work with import omitted/false, skip automatic discovery and cannot be combined with explicitly enabled import.

The resolved source path appears in the approval preview. Changing `CODEX_HOME` to select another file invalidates existing scan, policy and validation previews, even when the selected model/provider fields match.

The named environment key must already be available to the OpenCode service process. GUI launches and restarted services may not inherit terminal exports; a missing variable is a local setup blocker, not a request to display or copy its value. Never paste its value into chat, JSON, TOML, logs or screenshots. No sign-in is needed for this route. The plugin checks only the selected variable's presence after operation approval; the SDK consumes the value during the authorized operation. A missing key fails without falling back to ChatGPT or another key.

Only these fields are imported:

- Selected `model`, `model_reasoning_effort`, and `daybreak`.
- Selected `model_provider` and its provider's `base_url`, `env_key`, `wire_api`, optional `requires_openai_auth = false`, and bounded `env_http_headers` mappings of header names to environment-variable names. The provider's display name is replaced by its ID. Root provider fields are inherited when the selected profile overrides only some fields.

Explicit global JSON model/reasoning/Daybreak options override the imported values, which override plugin defaults. To inherit the Codex model, remove an old explicit `codex.model` from the plugin JSON. Provider routing cannot be overridden by a session tool or project file. Do not combine `configFile` and `provider`.

A custom provider must use a custom ID. A discovered built-in `openai` selection (or omitted `model_provider`) imports model/reasoning settings while preserving dedicated ChatGPT authentication; overriding its provider table is rejected. Native `amazon-bedrock` has the separate AWS integration described above. Other built-in IDs such as `ollama`, `lmstudio`, and `gcp` have different authentication semantics and are rejected. An `OPENAI_BASE_URL` environment override or built-in OpenAI provider is not automatically converted into a custom route. Missing profiles, undefined custom providers, missing `env_key`, unsupported wire APIs, and custom `requires_openai_auth = true` fail closed. `env_key` is the name of an existing variable, not a request for a second key.

Only credential-free HTTPS base URLs are supported. URL userinfo, query strings, fragments, encoded paths, inline keys, literal headers, auth commands, model catalogs and other provider extensions are rejected. Harmless `env_key_instructions`, `request_max_retries`, `stream_max_retries`, and `stream_idle_timeout_ms` hints are ignored, not forwarded or included in the digest. MCP servers, plugins, shell commands, hooks and security settings elsewhere in the source file are never copied. The import accepts a regular nonsymlink TOML file up to 256 KiB; parser errors do not echo source lines. The retained source digest covers only the validated selection, not raw TOML or credential values.

### Keyless network identity

A gateway protected by Cloudflare WARP or another network identity system may legitimately need no API key. The plugin does not yet support this route. Pinned SDK 0.9.1 accepts `auto`, `chatgpt` or `api-key` authentication but does not expose a credential-free network mode: a custom provider without `env_key` is treated as stored-credential authentication and can try to import ambient credentials before failing. Setting `requires_openai_auth = false` does not remove that SDK gate.

The public SDK preflight reports this route as unverified stored credentials, not a supported network-identity mode. The actual local runner still requires a supported authentication path. Its separate hosted-executor API supports Standard scans but would require a separate execution, persistence, cancellation and cost-control integration; it is not an equivalent drop-in replacement for this plugin.

Do not create a dummy key, add a credential helper, copy a sign-in, switch providers, or fall back to fixtures to hide this limitation. Keep the real SDK install in place and report the unsupported authentication route. No network security settings are changed and no gateway request is made during loading or preparation.

### Explicit provider alternative

If you do not want to import a file, configure the same non-secret routing fields directly:

```json
{
  "codex": {
    "model": "gpt-5.6-sol",
    "provider": {
      "id": "custom-gateway",
      "baseUrl": "https://gateway.example.com/v1",
      "envKey": "GATEWAY_API_KEY",
      "wireApi": "responses"
    }
  },
  "scan": { "mode": "standard" }
}
```

The hostname and model above are examples, not a working service or assurance of model access. Use your organization's approved gateway and its supported model name. Never substitute a credential value for `envKey` or embed credentials in the URL.

### Environment-backed gateway headers

A custom provider may need additional headers as well as its API key. Use `envHttpHeaders` in explicit plugin provider settings, or `env_http_headers` in an imported native Codex provider. Only names are stored:

```json
{
  "codex": {
    "provider": {
      "id": "custom-gateway",
      "baseUrl": "https://gateway.example.com/v1",
      "envKey": "GATEWAY_API_KEY",
      "wireApi": "responses",
      "envHttpHeaders": { "X-Workspace": "GATEWAY_WORKSPACE" }
    }
  }
}
```

The preview names every extra header and its variable. Required variables must be nonempty, and header values must not contain control characters. Header names are validated case-insensitively; authentication, host/routing and hop-by-hop overrides are rejected. Literal header values are not accepted. Headers alone do not supply a supported SDK authentication mechanism, and cannot be used to hide the keyless-network limitation. The plugin stores only names in settings, previews and history. During authorized operations, the SDK forwards values to workers and subprocesses and can materialize them in mode-0600 private temporary Deep-worker configuration. Normal SDK cleanup removes those files, but interrupted or crashed processes may leave them behind. Do not treat environment-backed headers as a guarantee that credentials remain only in memory; use an approved runtime without unrelated secrets.

### Compatibility and cost limits

- Responses API support alone is insufficient. The gateway/model must support Codex Security's streaming, namespaced/function tools and any required web-search tools. Routing tests use mocks; they do not establish compatibility with any real custom gateway.
- Model aliases without SDK pricing can run when no cost limit is configured. They fail the scan/policy cost guard only when you explicitly configure `scan.maxCostUsd`. This is a local price-table limitation, not a response saying the model is unavailable or retired. For example, SDK 0.9.1 deliberately leaves `gpt-daybreak-blue-latest` unpriced. Keep your gateway alias intact until its actual backend and rates are verified; the native Bedrock ID is not necessarily a valid alias on your gateway. Existing explicitly configured budgets are preserved; the plugin never silently removes them. A recognized OpenAI model name's estimate is not proof of the gateway's billing rate or a hard cap. Do not rename a different model merely to obtain an estimate.
- Static finding validation still has **no SDK cost ceiling** and requires separate uncapped approval.
- The OpenAI Daybreak access-program toggle is not supported for custom providers. Set `daybreak` false and omit `cyberAccessProgram` or use `standard`. A gateway may independently route a model alias to a provisioned Bedrock Daybreak model; this plugin does not verify that upstream route. Some current Codex proxy configurations support the OpenAI program through catalog/capability settings, but those settings are not imported by this bounded implementation. Exact model IDs and aliases have different SDK pricing support; never silently rename the requested model or disable an explicitly configured cost guard to make a run start.
- Cloud publication, embedding configuration, patching, and fix verification are not enabled by this route. Native analytics are explicitly disabled for custom routes; unrelated telemetry settings are not imported. SDK private runtime state is still created during real operations. No-login does not mean no local state or no network activity.
- Previews and native permission prompts identify the selected provider/base URL, auth mode, key name, model and source selection. Source/context go to that gateway, which can route onward to its upstream providers. The plugin does not verify those upstream destinations.

## OpenAI Daybreak access program

For the built-in OpenAI provider, SDK 0.9.1 documents Daybreak as a separate toggle, available with Codex 0.163.0 or later. Set `codex.daybreak` to true to request it. Compatible OpenAI account access is still required; the toggle does not grant entitlement. A separate explicit `scan.cyberAccessProgram` selection takes precedence over the toggle. Omit that option when you want Codex to select the available program.

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
