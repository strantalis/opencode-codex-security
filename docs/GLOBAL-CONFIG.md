# Global Codex Security settings

The plugin reads exactly one optional settings file:

- `$XDG_CONFIG_HOME/opencode/codex-security.json` when XDG_CONFIG_HOME is set.
- Otherwise `~/.config/opencode/codex-security.json`.

There are **no project overrides**. Session tools provide repository, scoped paths, scan instructions and named context files separately. The optional per-scan `mode` (standard/deep) overrides the global mode for that scan only. Other SDK settings stay global; tool inputs do not grant authorization.

The file is read whenever a scan is prepared. Changing it invalidates an outstanding preview, so changed settings cannot silently reach an already-approved scan. No application restart is needed for setting changes.

The initial Mac file preserves the installed SDK's model/reasoning/Daybreak defaults and the prototype's USD 1 estimated stop threshold:

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
- `codex.daybreak`: boolean, forwarded as `codexOverrides.daybreak`.
- `scan.mode`: standard or deep, used only when no per-scan mode is supplied. The built-in fallback is standard.
- `scan.maxCostUsd`: positive estimated stop threshold. This is **not a hard billing cap**; in-flight usage may exceed it.
- `scan.maxTimeMinutes`: positive time limit.
- `scan.cyberAccessProgram`: optional standard, daybreak_blue or daybreak_red.
- `scan.workers`: positive integer, relevant to deep scans.
- `scan.subagents`: nonnegative integer, relevant to deep scans; zero is valid.

Unknown keys and invalid values fail closed. Credentials, provider URLs, environment variables, runtime executable paths and approval policies are intentionally not configurable here. Provider remains OpenAI, authentication remains ChatGPT, and owner suggestions remain disabled. Do not place secrets in this file.

## Daybreak is not a model

SDK 0.9.1 documents Daybreak as a separate toggle, available with Codex 0.163.0 or later. Set `codex.daybreak` to true to request it. Compatible OpenAI account access is still required; the toggle does not grant entitlement. A separate explicit `scan.cyberAccessProgram` selection takes precedence over the toggle. Omit that option when you want Codex to select the available program.

The plugin does not check entitlement, sign in, copy credentials or switch accounts while loading configuration. The existing Desktop Daybreak toggle does not configure the SDK's isolated runner. A real scan still needs appropriately authorized dedicated sign-in and inference. Neither model availability nor Daybreak entitlement has been verified on this account.

## Authorization and session inputs

`security_prepare_scan` resolves the current OpenCode project by default, or an explicit local repository path. It accepts `scopePaths`, `scanPrompt`, `contextFiles` and optional `mode`. An explicit Standard/Deep request wins; otherwise mode falls back to global settings. The preview names the resolved mode and its source. It returns the target, context file names/sizes/hashes, global settings and inference/cost disclosure without starting a model.

`security_run_scan` takes the preview ID, checks OpenCode's `codex_security_scan` permission and starts only that unchanged preview. Host permission rules can honor existing applicable authorization; the plugin does not force a second confirmation after an allow decision. A denial is propagated. Use `/security-mode` in the TUI or the Desktop Scan mode selector to choose Global default, Standard or Deep without editing the global file. Choosing a mode only prepares a preview, never starts inference. The TUI `/security-scan` and Desktop review button show the preview and let the user confirm or cancel.

No whole-conversation history is copied. Context files must be existing text documentation inside the selected repository (up to eight files, 64 KiB each and 128 KiB total). Traversal, out-of-repository symlinks, credential/runtime directories and obvious credential filenames are rejected. Scoped paths guide the SDK; they are not a filesystem sandbox. The repository itself and wider SDK analysis context still require appropriate authorization.

## Verification

Offline tests verify configuration propagation into constructor and scan options, ignored project config, changed-config rejection, input boundaries, model-tool preparation, host authorization allow/deny, and no SDK creation before approval. The actual OpenCode 2.2.6 host test uses an injected mock SDK. Mock findings and test settings do not prove model/Daybreak entitlement or real scan quality.

Official SDK sources checked:

- https://github.com/openai/codex-security/blob/main/sdk/typescript/README.md
- https://github.com/openai/codex-security/blob/main/sdk/typescript/docs/cli.md#daybreak-opt-in
- Installed @openai/codex-security@0.9.1 README, docs/cli.md, config and ScanOptions declarations.
