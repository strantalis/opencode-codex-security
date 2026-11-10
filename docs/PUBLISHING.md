# npm staging and human approval

The source is public under Apache 2.0. The manifest is now **npm-ready**, with `private: false`, public registry/access settings, a conservative `contentPolicy.class: dual-use` declaration and a root `DISCLOSURE`. This preparation does not reserve the name, create an npm package, configure trust, stage or publish anything. GitHub previews remain available independently. The unscoped npm name is public; registry HTTP 404 on November 10, 2026 did not prove ownership or reserve it.

## Security boundaries

This utility uses Codex Security for source scans, policy drafting and static finding validation, not exploit execution or patch application. Its dual-use metadata and disclosure must persist across versions. npm forbids direct OIDC publication for dual-use packages. This repository automates **staging only**; each live version requires a maintainer's review and npm 2FA approval. Never add a direct publish command or a token fallback.

`Checks` builds and tests without publishing permissions. It installs locked dependencies with lifecycle scripts disabled, audits runtime dependencies, checks source/build freshness and package allowlists, and tests the exact tarball in an isolated OpenCode host. Consumer dependencies are resolved afresh and audited too. The package has no install, prepare, pack or publish lifecycle hooks. Build explicitly before packing. These checks are not a comprehensive secret scan or a guarantee that transitive dependencies are safe.

`npm-stage.yml` is manual, main-only and bound in code to `strantalis/opencode-codex-security`. It requires a successful current-main push run from `ci.yml` in the same repository. It checks the source commit, public visibility, fixed filenames, dual-use manifest, SHA-256 checksums and artifact count. It promotes those exact bytes without rebuilding. The GitHub-hosted staging job has only read access and `id-token: write`, runs pinned Node/npm tooling, and never checks out or executes project code or installs project dependencies. The action is pinned to a commit. There are no npm secrets. The workflow verifies bundled npm 11.20.0 in Node 26.13.0 and fails if tooling differs.

## One-time bootstrap: separate maintainer action

Do not run these steps until the maintainer approves the exact npm destination, public contents and account. Confirm name availability/ownership again. Review current npm policy, archive contents, license/dependency obligations and account eligibility. npm trust requires an **existing package**; do not try to grant trust to a nonexistent package.

Use a workstation with Node 26.13.0/npm 11.20.0 (staging needs npm 11.15.0+). Enable npm 2FA. Download all three assets from a successful current-main CI run or matching GitHub preview, inspect `build-manifest.json` and verify `SHA256SUMS` before continuing. Use the actual archive filename:

```sh
# macOS; Linux: sha256sum -c SHA256SUMS
shasum -a 256 -c SHA256SUMS
npm login
npm whoami
npm stage publish ./opencode-codex-security-0.1.0.tgz --access public --tag latest --ignore-scripts
npm stage list opencode-codex-security
npm stage view STAGE_ID
```

Login and staging are intentionally not performed by this PR. A 401 from `npm whoami` means the CLI is not authenticated, not that no account exists. Do not share or commit passwords, tokens or OTPs. **Staging a new name creates a public `0.0.0-stage` placeholder**, even before the first real version is approved. The staged payload itself is not a live published version. Review the stage, download and compare its tarball with the tested SHA-256, and approve only the intended version/tag. Human approval is a separate action:

```sh
npm stage download STAGE_ID
# Compare the downloaded tarball's SHA-256 with build-manifest.json.
npm stage approve STAGE_ID
```

Approval requires 2FA and publishes that staged version. `npm stage reject STAGE_ID` also requires 2FA and discards it. Inspect any interrupted/uncertain operation with list/view before retrying; never blindly create another stage. Tags are immutable within a stage. Reject and restage if the tag was wrong. Check `npm view opencode-codex-security@0.1.0 version dist.integrity` and the intended dist-tag after approval. Do not treat a workflow success, stage ID or placeholder as a live release.

## Configure stage-only trusted publishing: separate approval

After the package exists, the maintainer must explicitly authorize and configure persistent npm trust for exactly:

- Provider: GitHub Actions.
- Owner: `strantalis`.
- Repository: `opencode-codex-security`.
- Workflow filename: `npm-stage.yml`.
- Permission: **stage only**, never direct publishing.
- Environment: none (this workflow does not claim an environment).

Use npm package settings or the current `npm trust` documentation, not invented CLI flags. Do not configure a broader repository/workflow or create a long-lived token as a workaround. Newly configured trust must be used within two days or it expires. Once the staged flow is verified, select npm package protection **Require two-factor authentication and disallow tokens**. These settings require separate approval and are not made by this repository change.

## Stage a later version

1. Bump `version` in both package and lockfile in a reviewed PR. Use a patch bump for fixes (`0.1.1`); use a prerelease such as `0.1.1-rc.1` with `next` for testing. Never reuse a live version. Keep the dual-use metadata and disclosure.
2. Merge only after checks pass. Wait for **Checks on the new main push** to finish successfully. Its verified artifact is retained for 14 days.
3. Run **Actions → Stage npm release** on main with that run's numeric ID. Choose `next` for prereleases/testing or deliberately choose `latest` for a stable release. The default is `next`; prereleases with `latest` fail closed.
4. Review the returned stage ID, version, tag, source and tarball hash using the human steps above. Approve with 2FA only when ready for public installation. There is no automated approval job.

If main moves, the artifact expires, trust is absent/expired, or registry permissions fail, fix the specific prerequisite and use a fresh current-main successful run. Do not weaken checks or fall back to tokens. A failure after submitting to npm can have an uncertain outcome: inspect stage list/view before retrying. A version cannot be overwritten after publication; use a new version for corrections.

## Limits and references

Provenance is requested for public source/package with matching repository metadata. Review provenance after promotion: it identifies the staging workflow, while `build-manifest.json` links the bytes to the independently verified build commit/run. Native Desktop/platform testing and a complete real SDK assessment remain separate from mocked CI. Use only repositories and workplace devices authorized for scanning and data transfer.

- [npm stage CLI](https://docs.npmjs.com/cli/v11/commands/npm-stage/)
- [npm staged publishing and bootstrap](https://docs.npmjs.com/staged-publishing/)
- [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/)
- [npm trust prerequisites](https://docs.npmjs.com/cli/v11/commands/npm-trust/)
- [npm dual-use policy](https://docs.npmjs.com/policies/dual-use/)

Verified November 10, 2026; recheck before setup. Installed metadata identifies Codex Security 0.9.1 as Apache-2.0, OpenCode plugin/Solid as MIT, and OpenTUI native binaries as MIT AND LGPL-2.1-or-later. Dependencies stay external; this is not comprehensive legal clearance.
