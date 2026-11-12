# Security

This is an early project, not an official OpenCode or OpenAI product. Only the latest reviewed commit is supported. Do not assume its results constitute a complete assessment or that SDK cost estimates are hard billing caps.

## Report a vulnerability privately

Do not put credentials, private source, scan results or exploitable details in public issues. If GitHub shows **Security → Report a vulnerability**, use that private channel. Otherwise contact the repository owner through an existing private channel and ask for a safe reporting destination.

Include the affected commit, OS/OpenCode/Node versions, a minimal synthetic reproduction, expected behavior and impact. Redact credentials and personal data. Do not run paid scans, access others' data or publish a proof of concept without authorization. No response-time promise or bug-bounty program is implied.

## Boundaries and supply chain

- Loading the plugin does not start a scan. Every scan, policy draft and validation waits for approval of its preview.
- SDK operations send the selected repository and context to the configured model provider. Use the mock-SDK host tests for ordinary development.
- Runtime/history data, credentials and evidence are excluded from both Git and package artifacts. Package checks enforce a small file allowlist; they are not a complete secret scanner.
- CI uses a lockfile, disables dependency lifecycle scripts, pins Actions by commit, uses read-only repository access and blocks known high/critical runtime advisories. Dependency updates require review; no auto-merge is configured.
- The manual release job runs no repository or dependency code with its write token. It promotes only an exact tested artifact from successful main CI, checks explicitly selected repository visibility and checksums, and does not publish to npm.
- Checksums detect corruption and pin bytes. They are not a signature, independent provenance or a guarantee against a compromised maintainer/dependency/runner. A package's transitive dependencies still resolve during installation.

CI runs `npm run audit:runtime` (`npm audit --omit=dev --audit-level=high`), so a high or critical advisory in the runtime dependency graph fails the build. Moderate advisories are tracked, not overridden: the ones that remain come through OpenCode's own tooling chain (for example `glob` and `minimatch` under `@opencode/plugin`'s `@opencode/util` and `@opencode/ai` dependencies) and have no fix this package can apply without forcing incompatible versions. Run `npm audit --omit=dev` for the current list. Do not add unreviewed overrides just to silence the audit.

Native Desktop UX, Windows support and complete real SDK assessments have not been verified; see the README's limits.
