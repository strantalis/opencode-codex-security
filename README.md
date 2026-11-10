# Codex Security for OpenCode

Security scans, policy drafts and finding validation inside **OpenCode V2**, with a native terminal view, an experimental Desktop panel and tools for your session's model.

This is an early project, not an official OpenCode or OpenAI product. It is **not published to npm**. The code is licensed under [Apache 2.0](LICENSE). The package is prepared for stage-only npm releases, with human 2FA approval required before each version goes live. Until then, use tested GitHub release tarballs. See [npm staging](docs/PUBLISHING.md).

## What works

- Independent Standard or Deep scans, two concurrent runs per project, phase-local progress, safe worker activity, exact cancellation and private local history.
- Honest partial/complete cost measurements and final coverage/repository-matching details when the SDK returns them. Missing data is labeled unavailable.
- Model tools to prepare/start scans, list runs, inspect status/activity/results and read individual findings.
- Security-policy generation that pauses for your answers and returns an **unapplied draft**.
- Finding validation against source. This is static assessment, not runtime reproduction, and the SDK currently has **no validation cost ceiling**. It requires separate approval.
- Global SDK defaults plus per-scan repository, scope, instructions and documentation context. Conversation history is not silently copied.

Patch application and fix verification are not implemented. Findings arrive at scan completion, not continuously. No scan starts just because the plugin loads.

## Requirements

- For development: Node.js 26.4 or newer in the 26.x line (tested on 26.8.1).
- For real SDK operations: Python 3.10+; Python 3.10 also needs `tomli`.
- SDK mode is currently POSIX-only; the credential guard deliberately rejects Windows.
- OpenCode V2 2.2.6; Desktop integration is experimental.
- For real operations: supported Codex Security account/model access and an existing dedicated sign-in. The plugin checks that dedicated credentials exist privately before constructing the SDK client. It does not perform login or create/import credentials.

SDK mode uses `@openai/codex-security` 0.9.1. Repository source and selected context are sent to OpenAI for inference. SDK cost limits are estimates, **not guaranteed billing caps**. Account quota/availability can also limit scans.

## Install a released version

Until the first npm version is actually approved, use [tested GitHub tarballs](docs/RELEASING.md). After a live version exists, install its exact version into a dedicated local consumer:

```sh
mkdir security-plugin && cd security-plugin
npm install --save-exact --ignore-scripts opencode-codex-security@0.1.0
npm audit --omit=dev --audit-level=high
```

`0.1.0` is the planned first version, not a claim that it is available. A staged version or `0.0.0-stage` placeholder is not installable functionality. Point the plugin configuration below at the absolute path of `security-plugin/node_modules/opencode-codex-security`. This uses the tested local-path plugin route; no special OpenCode install command is required. Keep the lockfile and use `npm ci --ignore-scripts` for repeat installs. Use only a workplace/device authorized for the plugin and its source-data transfers.

For updates, select an exact approved version, install into a new directory, audit, and switch the configured path only when scans, approval dialogs and policy forms have finished. Keep the previous directory for rollback. Nothing updates automatically. Test prereleases explicitly by their full version rather than following a moving tag.

## Local installation

```sh
npm ci --ignore-scripts
npm run check
```

Add the local package to your existing OpenCode configuration without replacing unrelated settings:

```json
{
  "plugins": [
    {
      "package": "/absolute/path/to/opencode-codex-security",
      "options": { "engine": "codex" }
    }
  ]
}
```

Restart/reload OpenCode only when no scans, pending approvals or forms are active. Open the Security panel or use `/security` in the terminal. Other useful commands include `/security-scan`, `/security-scans`, `/security-policy`, `/security-validate`, `/security-operations` and `/security-answer`.

Default package behavior without `engine: codex` is an explicitly labeled, offline fixture engine. That fixture is not a real security assessment.

## Configuration and model tools

Global settings live at `$XDG_CONFIG_HOME/opencode/codex-security.json`, or `~/.config/opencode/codex-security.json`. No project configuration overrides are loaded. Per-scan mode wins over the global Standard/Deep fallback. Daybreak is a separate option, not a model or an access grant.

See [global configuration](docs/GLOBAL-CONFIG.md), [scan lifecycle and tools](docs/MULTI-SCAN.md), [SDK integration](docs/SDK.md) and [release checklist](docs/PUBLISHING.md).

## Development

```sh
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

CI produces an exact tested tarball with its source commit and SHA-256 checksums. A manual workflow can promote a successful main build to a GitHub prerelease at the explicitly selected repository visibility without npm tokens. See [testing and release readiness](docs/RELEASING.md) and [security reporting](SECURITY.md). The maintainer approved public GitHub distribution under Apache 2.0. npm registry publication remains a separate step.

## Verification limits

The real SDK smoke test authenticated successfully and reached discovery, then stopped at a USD 1 estimated guard. It returned no completed assessment. Mocked integration covers concurrent scans, cancellation, model tools, policy questions and static validation. Direct native Desktop inspection remains a separate verification step.

Do not commit credentials, `.runtime/`, evidence captures, scan artifacts or dependency folders. The repository ignores these; package checks also reject them. See [contributing](CONTRIBUTING.md) for the safe development workflow.
