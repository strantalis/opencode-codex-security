# Codex Security for OpenCode

Security scans, policy drafts and finding validation inside **OpenCode V2**, with a native terminal view, an experimental Desktop panel and tools for your session's model.

This is an early private project, not an official OpenCode or OpenAI product. It is **not published to npm**. The package remains private and unlicensed for redistribution until release terms are chosen.

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

## Private builds and releases

CI produces an exact tested tarball with its source commit and SHA-256 checksums. A manual workflow can promote a successful main build to a private GitHub prerelease without npm tokens. See [private testing and release readiness](docs/RELEASING.md) and [security reporting](SECURITY.md). Public visibility, an open-source license and npm publication remain explicit decisions.

## Verification limits

The real SDK smoke test authenticated successfully and reached discovery, then stopped at a USD 1 estimated guard. It returned no completed assessment. Mocked integration covers concurrent scans, cancellation, model tools, policy questions and static validation. Direct native Desktop inspection remains a separate verification step.

Do not commit credentials, `.runtime/`, evidence captures, scan artifacts or dependency folders. The repository ignores these; package checks also reject them. See [contributing](CONTRIBUTING.md) for the safe development workflow.
