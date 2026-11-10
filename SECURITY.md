# Security

This is an early project, not an official OpenCode or OpenAI product. Only the latest reviewed commit is supported. Do not assume its results constitute a complete assessment or that SDK cost estimates are hard billing caps.

## Report a vulnerability privately

Do not put credentials, private source, scan results or exploitable details in public issues. If GitHub shows **Security → Report a vulnerability**, use that private channel. Otherwise contact the repository owner through an existing private channel and ask for a safe reporting destination. A dedicated public reporting contact and GitHub private vulnerability reporting must be configured and verified before the repository becomes public.

Include the affected commit, OS/OpenCode/Node versions, a minimal synthetic reproduction, expected behavior and impact. Redact credentials and personal data. Do not run paid scans, access others' data or publish a proof of concept without authorization. No response-time promise or bug-bounty program is implied.

## Boundaries and supply chain

- Loading the plugin does not approve a scan. Real SDK actions require explicit authorization and existing dedicated sign-in. Never import credentials as part of a build or test.
- SDK operations can transmit the selected repository and context to OpenAI. Use synthetic fixtures and mock-host tests for ordinary development.
- Runtime/history data, credentials and evidence are excluded from both Git and package artifacts. Package checks enforce a small file allowlist; they are not a complete secret scanner.
- CI uses a lockfile, disables dependency lifecycle scripts, pins Actions by commit, uses read-only repository access and blocks known high/critical runtime advisories. Dependency updates require review; no auto-merge is configured.
- The manual release job runs no repository or dependency code with its write token. It promotes only an exact tested artifact from successful main CI, checks explicitly selected repository visibility and checksums, and does not publish to npm.
- Checksums detect corruption and pin bytes. They are not a signature, independent provenance or a guarantee against a compromised maintainer/dependency/runner. A package's transitive dependencies still resolve during installation.

As of November 10, 2026, `npm audit --omit=dev` reports 26 moderate advisory entries in the runtime dependency graph, rooted in `glob` filesystem traversal after cancellation and `minimatch` resource-exhaustion advisories. The affected chains include OpenCode tooling dependencies; npm reports no available fix for those root advisories. No high/critical runtime advisories were reported in that check. This is a known limitation to reassess before public release, not a claim that those dependencies are safe or unreachable. Do not apply unreviewed breaking overrides just to silence the audit.

Intentionally vulnerable code under `fixtures/vulnerable` is offline test material. Never deploy it. Native Desktop UX, real account entitlement, Windows support and complete real SDK assessments have separate verification limits documented in the README.
