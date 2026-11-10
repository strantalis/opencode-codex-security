# Distribution and release checklist

Nothing has been published to npm. `private: true` deliberately prevents an accidental npm release. The source is licensed under Apache 2.0; retain the LICENSE when redistributing it. Public GitHub source/release assets are a separate distribution decision; see [the release guide](RELEASING.md).

## Choose distribution first

- GitHub source and checked release tarballs can be distributed at the explicitly approved repository visibility. OpenCode supports Git-hosted plugins; pin a verified full commit and use the user's existing Git access. The repository retains the single built GUI entry for Git installation; CI checks it against source. Build it before a local-path installation when source changes.
- An unscoped npm name such as `opencode-codex-security` is always **public**, even if the source repository is private.
- Private npm packages need a scoped name and an eligible paid user/organization account.
- The unscoped name returned registry HTTP 404 on November 10, 2026. This neither reserves it nor proves ownership.

## Before approving any publish

1. Apache 2.0 and public GitHub distribution are approved. For npm, verify the owner/scope and obtain explicit registry-publication approval before removing the package publication guard.
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

## First npm package and trusted publishing

Current npm documentation distinguishes creating the package from publishing its first live version. OIDC trust configuration requires that the package already exists; there is no verified OIDC-only path for creating a nonexistent package.

From an authorized workstation, the maintainer needs an existing or newly created npm account with 2FA and an authenticated npm CLI. `npm whoami` returning 401 means only that this CLI is not currently authenticated, not that the maintainer has no account. Do not share passwords, tokens or one-time codes in issues or commit them.

Before any registry command, explicitly approve the npm destination/name and exact contents, resolve the dual-use classification below, and deliberately remove `private: true` and update the packaging guard that currently requires it. Re-run all checks and inspect the exact packed archive. These changes have **not** been made for GitHub preview distribution.

Two bootstrap options then exist:

- **Interactive first publication:** authenticate with `npm login`, verify the account with `npm whoami`, and publish the approved exact archive with `npm publish ./opencode-codex-security-0.1.0.tgz --access public`, completing npm's required 2FA step. This immediately publishes that version.
- **Staged bootstrap:** use npm 11.15.0+ and `npm stage publish` for the approved package. For a new package, npm creates a public `0.0.0-stage` placeholder; the actual staged contents are not public until a maintainer approves them with 2FA. Review the returned staging/approval flow before accepting it.

After the package exists, configure a trusted publisher for the exact GitHub owner, repository and publishing workflow, optionally bound to an environment. Creating this persistent trust requires explicit approval. Current npm docs require npm 11.5.1+ and Node 22.14.0+ for OIDC publishing, or npm 11.15.0+ for staging and CLI trust management. Use GitHub-hosted runners with a narrowly scoped `id-token: write` publisher job. Newly configured publishers default to staging permission and expire unless successfully used within two days. Direct permission is a separate choice and is not permitted for dual-use packages.

Automatic provenance requires a public repository and public package, with matching repository metadata. Prefer the package protection **Require two-factor authentication and disallow tokens** once the permitted trusted-publisher flow is verified. No npm account, trust grant, publishing workflow, token or registry package was created by this GitHub release setup.

### Security-tool policy must be resolved first

npm's July 28, 2026 [dual-use policy](https://docs.npmjs.com/policies/dual-use/) includes security research utilities. This plugin scans for vulnerabilities and statically validates findings; it does not implement exploitation or patch execution. The maintainer must assess whether npm's classification applies to these capabilities before publishing, rather than deciding from the package name alone.

If it applies, add `contentPolicy: { "class": "dual-use" }` and a root-tarball `DISCLOSURE` describing capabilities and legitimate use. Those declarations must persist across versions. npm permits trusted publishing for such packages **only through staging**, followed by a maintainer's 2FA approval for each version; do not configure direct automated OIDC publication. Interactive publication with required 2FA is another permitted path.

Verified official references: [npm trust prerequisites](https://docs.npmjs.com/cli/v11/commands/npm-trust/), [staged publishing and new packages](https://docs.npmjs.com/staged-publishing/), [unscoped package creation](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/), and [trusted publisher requirements](https://docs.npmjs.com/trusted-publishers/). Recheck them when performing the actual registry setup.
