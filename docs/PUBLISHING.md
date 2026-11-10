# Distribution and release checklist

Nothing has been published. `private: true` and `UNLICENSED` deliberately prevent an accidental npm release or an implied redistribution grant.

## Choose distribution first

- A private GitHub repository is appropriate now. OpenCode supports Git-hosted plugins; pin a verified full commit and use the user's existing Git access. The repository retains the single built GUI entry for Git installation; CI checks it against source. Build it before a local-path installation when source changes.
- An unscoped npm name such as `opencode-codex-security` is always **public**, even if the source repository is private.
- Private npm packages need a scoped name and an eligible paid user/organization account.
- The unscoped name returned registry HTTP 404 on November 10, 2026. This neither reserves it nor proves ownership.

## Before approving any publish

1. Choose public versus private distribution, the owner/scope and a license. Obtain explicit publication approval.
2. Review current npm security/dual-use rules for a security-research tool. If classified as dual-use, npm's policy requires `contentPolicy.class: dual-use`, a root `DISCLOSURE` and the applicable interactive-2FA/staged approval flow. Do not assume ordinary direct OIDC publishing applies.
3. Recheck SDK/OpenCode compatibility, platform requirements and dependency advisories. Keep dependencies external; do not redistribute bundled native binaries without reviewing their licenses.
4. Run `npm ci --ignore-scripts`, `npm run check`, `npm run pack:check` and offline host integration tests from a clean checkout.
5. Inspect the exact tarball contents and install that tarball into a clean OpenCode V2 host. Verify server, TUI and experimental Desktop entry points, including shutdown/reload and permission behavior.
6. Review source/credential boundaries and verify native Desktop UX. Account/model entitlement and the cost of a complete real assessment are not established by mock tests or the budget-stopped smoke test.
7. Change `private: true` only as part of an explicitly approved release. Configure supported publishing credentials or trusted publishing through the proper approval flow. Never put tokens in this repository.

The package allowlist excludes runtime state, test mocks, screenshots and evidence. `pack:check` verifies exports, forbidden paths and size without publishing. It is a packaging guard, not a comprehensive secret scanner.

## Sources

- [OpenCode plugin installation](https://opencode.ai/docs/plugins/)
- [OpenCode GUI packaging](https://opencode.ai/docs/build/plugins/gui/)
- [npm public packages](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/)
- [npm private packages](https://docs.npmjs.com/about-private-packages/)
- [npm dual-use policy](https://docs.npmjs.com/policies/dual-use/)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)

Installed dependency metadata identifies Codex Security 0.9.1 as Apache-2.0, OpenCode plugin and Solid as MIT, and OpenTUI native binaries as MIT AND LGPL-2.1-or-later. This is a metadata review, not comprehensive legal clearance.
