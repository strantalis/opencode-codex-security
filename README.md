# Codex Security for OpenCode

Security scans, policy drafts and finding validation inside **OpenCode V2**, with a native terminal view, an experimental Desktop panel and tools for your session's model.

This is an early project, not an official OpenCode or OpenAI product. Published npm versions are available under [Apache 2.0](LICENSE). Releases use stage-only npm publishing, with human 2FA approval required before each version goes live. Tested GitHub release tarballs are also available. See [npm staging](docs/PUBLISHING.md).

## What works

- Independent Standard or Deep scans, two concurrent runs per project, phase-local progress, safe worker activity, exact cancellation and private local history.
- Honest partial/complete cost measurements and final coverage/repository-matching details when the SDK returns them. Missing data is labeled unavailable.
- Model tools to prepare/start scans, list runs, inspect status/activity/results and read individual findings.
- Security-policy generation that pauses for your answers and returns an **unapplied draft**.
- Finding validation against source. This is static assessment, not runtime reproduction, and the SDK currently has **no validation cost ceiling**. It requires separate approval.
- Global SDK defaults plus per-scan repository, scope, instructions and documentation context. Conversation history is not silently copied.

Patch application and fix verification are not implemented. Findings arrive at scan completion, not continuously. No scan starts just because the plugin loads.

## Requirements

- Node.js 24.x or 26.x for installation. Node 22 does not satisfy the plugin's published `>=24` requirement. Repository development/TUI tests use Node 26.4+ (tested on 26.8.1).
- For real SDK operations: Python 3.10+; Python 3.10 also needs `tomli`.
- Default ChatGPT authentication is currently POSIX-only; its credential guard deliberately rejects Windows. Full Windows SDK operation is unverified.
- OpenCode V2; 2.2.6 is the original test baseline, not an exact-patch requirement. Verify loading on the installed host. Desktop integration is experimental.
- For real operations: supported account/model access and either an existing private dedicated ChatGPT sign-in or an explicitly configured custom Responses provider with an existing environment key. The plugin does not perform login or create/import credentials. See [no-sign-in provider setup](docs/GLOBAL-CONFIG.md#use-an-existing-codexlitellm-provider-without-sign-in). Custom-provider routing is an upcoming `0.1.2` change, not functionality in the published `0.1.0`/`0.1.1` packages.

SDK mode uses `@openai/codex-security` 0.9.1. Repository source and selected context are sent to the provider shown in the approval preview, OpenAI by default or the explicitly selected gateway. Gateway upstream routing is not verified. SDK cost limits are estimates, **not guaranteed billing caps**. Account quota/availability can also limit scans.

## Install a released version

For a self-contained prompt to hand to another coding agent, see [install with an agent](https://github.com/strantalis/opencode-codex-security/blob/main/docs/AGENT-SETUP.md).

OpenCode V2 supports npm packages directly. Add this object to your existing `plugins` array, preserving other settings:

```json
{
  "package": "opencode-codex-security@0.1.0",
  "options": { "engine": "fixture" }
}
```

Check that no scans, approval dialogs or policy forms are active before editing watched settings or reloading. Open `/security` to verify loading. Fixture mode uses bundled examples, not your repository.

Published `0.1.0`/`0.1.1` real mode supports [dedicated ChatGPT authentication](docs/SDK.md#default-dedicated-chatgpt-authentication). Upcoming `0.1.2` adds [opt-in Codex/LiteLLM provider configuration](docs/GLOBAL-CONFIG.md#use-an-existing-codexlitellm-provider-without-sign-in) without a sign-in flow. It does not automatically inherit OpenCode provider settings. Wait for a release or use an explicitly provided tested build containing this change; do not use an older version for gateway support. Change `engine` to `codex` only when the approved configuration is ready and the host is idle. This starts no scan; real operations still need authorized scope and source-data transfer.

Verified November 10, 2026: `latest` points to `0.1.0`; `0.1.1` is also public under `next`. Pin the full version you want rather than a moving tag. A staged version or `0.0.0-stage` placeholder is not installable functionality.

### Optional: manage the installation yourself

For explicit npm installation/audit control, use a new dedicated consumer outside source repositories:

```sh
mkdir security-plugin && cd security-plugin
npm init -y
npm install --save-exact --ignore-scripts opencode-codex-security@0.1.0
npm audit --omit=dev --audit-level=high
```

Then set the plugin entry's `package` to the absolute path of `security-plugin/node_modules/opencode-codex-security`. Keep the lockfile; use `npm ci --ignore-scripts` for repeat installs into a separate directory. Keep the previous consumer for rollback and switch paths only when the host is idle. [Tested GitHub tarballs](docs/RELEASING.md) use the same local-path route.

## Configuration and model tools

Global settings live at `$XDG_CONFIG_HOME/opencode/codex-security.json`, or `~/.config/opencode/codex-security.json`. No project configuration overrides are loaded. Per-scan mode wins over the global Standard/Deep fallback. Daybreak is a separate option, not a model or an access grant.

See [global configuration](docs/GLOBAL-CONFIG.md), [scan lifecycle and tools](docs/MULTI-SCAN.md), [SDK integration](docs/SDK.md) and [release checklist](docs/PUBLISHING.md).

## Development

Use a separate source checkout, not an installed or watched consumer. The published package already contains its Desktop bundle; consumers do not need to build it.

```sh
npm ci --ignore-scripts

npm run lint          # ESLint, including TypeScript
npm run format:check  # Prettier
npm run typecheck
npm test              # offline unit tests
npm run build         # Desktop bundle
npm run check         # all checks above
npm run pack:check    # inspect package allowlist; no publish
```

For offline integration tests in the real OpenCode host:

```sh
npm run setup:local
npm run test:host
npm run test:plan-host
npm run test:package  # installs the exact tarball into a separate consumer
./scripts/opencode-local.sh --standalone
```

These launchers isolate configuration under `.runtime/`. The plan-host tests inject a mock SDK: no real inference or login. `npm run preview` is a standalone fixture design harness, not native Desktop verification.

## Tested builds and releases

CI produces an exact tested tarball with its source commit and SHA-256 checksums. A manual workflow can promote a successful main build to a GitHub prerelease at the explicitly selected repository visibility without npm tokens. See [testing and release readiness](docs/RELEASING.md) and [security reporting](SECURITY.md). The maintainer approved public GitHub distribution under Apache 2.0. npm registry publication remains a separate, human-approved step for every version.

## Verification limits

The real SDK smoke test authenticated successfully and reached discovery, then stopped at a USD 1 estimated guard. It returned no completed assessment. Mocked integration covers concurrent scans, cancellation, model tools, policy questions and static validation. Direct native Desktop inspection remains a separate verification step.

Do not commit credentials, `.runtime/`, evidence captures, scan artifacts or dependency folders. The repository ignores these; package checks also reject them. See [contributing](CONTRIBUTING.md) for the safe development workflow.
