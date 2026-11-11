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

- For installation and a scan-free loading check: an existing packaged OpenCode V2 host and public npm registry access. OpenCode installs and runs the plugin itself; a separate Node/npm install is **not** required for this step.
- For real SDK operations: Node 22.20+ within 22.x, 24.x or 26.x available to the OpenCode process on its trusted `PATH`, plus Python 3.10+ (`tomli` for Python 3.10). SDK 0.9.1 needs external Node helpers when hosted by Bun. Reuse compatible installed runtimes rather than changing system defaults. See [runtime details](docs/AGENT-SETUP.md#what-you-need).
- Default ChatGPT authentication is currently POSIX-only; its credential guard deliberately rejects Windows. Full Windows SDK operation is unverified.
- OpenCode V2; 2.2.6 is the original test baseline, not an exact-patch requirement. Verify loading on the installed host. Desktop integration is experimental.
- For real operations: supported account/model access and an existing private dedicated ChatGPT sign-in, an explicitly selected OpenAI environment API key, a supported custom Responses provider with an existing environment key, or (in the next source build) native Amazon Bedrock with an existing AWS identity. The plugin does not perform login or create/import credentials. See [no-sign-in provider setup](docs/GLOBAL-CONFIG.md#use-an-existing-custom-provider-without-sign-in). Custom-provider routing is available in `0.1.2`, not in `0.1.0`/`0.1.1`.

SDK mode uses `@openai/codex-security` 0.9.1. Repository source and selected context are sent to the provider shown in the approval preview, OpenAI by default or the explicitly selected gateway. Gateway upstream routing is not verified. No dollar-based stop limit is set by default. You can explicitly configure `scan.maxCostUsd` when SDK pricing is available. SDK cost limits are estimates, **not guaranteed billing caps**. Account quota/availability can also limit scans.

## Install a released version

For a self-contained prompt to hand to another coding agent, see [install with an agent](https://github.com/strantalis/opencode-codex-security/blob/main/docs/AGENT-SETUP.md).

OpenCode V2 supports npm packages directly.

Real-by-default onboarding is prepared for `0.1.4`. Verify that exact version is published before installing; if it is unavailable, use an explicitly supplied [tested tarball](docs/RELEASING.md) or wait for release. Public `0.1.3` fixes the npm terminal view but still defaults to fixture mode; set `options.engine` to `codex` explicitly on that version. A source version alone is not an npm release.

Add this object to your existing `plugins` array, preserving other settings:

```json
{
  "package": "opencode-codex-security@0.1.4"
}
```

Check that no scans, approval dialogs or policy forms are active before editing watched settings or reloading. Open `/security` to verify loading. The normal install opens real SDK mode; opening the panel does not start a scan. Preparing a scan shows the actual repository and scope for review.

When preparing a scan, the plugin discovers your existing Codex configuration and uses supported provider/model settings. Explicit plugin settings take precedence. It does not automatically inherit OpenCode provider settings, read credential files, or sign in. Missing or unsupported prerequisites produce a specific setup error, never a fixture result or a silent provider switch. See [authentication compatibility](docs/GLOBAL-CONFIG.md#authentication-compatibility), [provider setup](docs/GLOBAL-CONFIG.md#use-an-existing-custom-provider-without-sign-in) and [dedicated ChatGPT authentication](docs/SDK.md#default-dedicated-chatgpt-authentication). Real operations still need authorized scope, source-data transfer and usage.

Fixture mode is only an explicit developer/test option: `"options": { "engine": "fixture" }`. It scans bundled examples, not your repository. Remove an old fixture option when upgrading, while the host is idle; upgrades preserve explicit choices.

Verified November 10, 2026: exact `0.1.3` is public. Source `0.1.4` is prepared for real-by-default onboarding; recheck registry availability. Pin the full version you want rather than a moving tag. A staged version or `0.0.0-stage` placeholder is not installable functionality.

### Optional: manage the installation yourself

Skip this if OpenCode manages the package entry above. This alternative needs Node 22.20+ within 22.x, 24.x or 26.x and npm. For explicit npm installation/audit control, use a new dedicated consumer outside source repositories:

```sh
mkdir security-plugin && cd security-plugin
npm init -y
npm view opencode-codex-security@0.1.4 version &&
  npm install --save-exact --ignore-scripts opencode-codex-security@0.1.4
npm audit --omit=dev --audit-level=high
```

Then set the plugin entry's `package` to the absolute path of `security-plugin/node_modules/opencode-codex-security`. Keep the lockfile; use `npm ci --ignore-scripts` for repeat installs into a separate directory. Keep the previous consumer for rollback and switch paths only when the host is idle. [Tested GitHub tarballs](docs/RELEASING.md) use the same local-path route.

## Configuration and model tools

Global settings live at `$XDG_CONFIG_HOME/opencode/codex-security.json`, or `~/.config/opencode/codex-security.json`. No project configuration overrides are loaded. Per-scan mode wins over the global Standard/Deep fallback. Daybreak is a separate option, not a model or an access grant.

See [global configuration](docs/GLOBAL-CONFIG.md), [scan lifecycle and tools](docs/MULTI-SCAN.md), [SDK integration](docs/SDK.md) and [release checklist](docs/PUBLISHING.md).

## Development

Use a separate source checkout, not an installed or watched consumer. Development/TUI tests use Node 26.4+ (tested on 26.8.1); the TUI smoke test also needs Bun. These are contributor prerequisites. The published package already contains its Desktop bundle; consumers do not need to build it.

```sh
npm ci --ignore-scripts

npm run lint          # ESLint, including TypeScript
npm run format:check  # Prettier
npm run typecheck
npm test              # offline unit tests
npm run build         # Desktop and TUI bundles
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

The real SDK smoke test authenticated successfully and reached discovery, then stopped at a USD 1 estimated guard. It returned no completed assessment. Mocked integration covers concurrent scans, cancellation, model tools, policy questions and static validation. The `0.1.3` tarball also passed native terminal rendering and a bundled fixture scan on OpenCode 2.2.6 and 2.2.7 with no Node/npm/Bun on its `PATH`. The `0.1.4` tests additionally cover a default real repository/scope preview, cancellation without execution, and a visible unsupported-authentication setup error with no fixture fallback, and explicit OpenAI API-key/gateway-header previews without execution. Direct native Desktop inspection remains a separate verification step.

Do not commit credentials, `.runtime/`, evidence captures, scan artifacts or dependency folders. The repository ignores these; package checks also reject them. See [contributing](CONTRIBUTING.md) for the safe development workflow.
