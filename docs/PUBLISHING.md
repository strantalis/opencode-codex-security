# npm staging and human approval

`opencode-codex-security` is public on npm under Apache 2.0. Bootstrap is complete, and the GitHub OIDC staging workflow has been exercised successfully. Every release still needs a maintainer's separate review and npm 2FA approval before it is installable. Workflow success means **staged**, not approved or published.

Check the registry again before choosing an installation or release version:

```sh
npm view opencode-codex-security dist-tags versions --json
```

For installation, use [the README](../README.md#quick-start). It installs `opencode-codex-security@latest`, so a release only reaches new users once it is published under the `latest` tag; `next` is for testing. Consumers do not need npm login, trusted-publisher settings or these release tools. GitHub previews remain available independently through [the preview release guide](RELEASING.md).

## Stage the next release

1. Choose a version not already live or awaiting approval. Bump `version` in both package and lockfile in a reviewed PR. Use a new patch for fixes or a full prerelease such as `0.1.2-rc.1` for testing. Preserve `contentPolicy.class: dual-use`, the license and `DISCLOSURE`.
2. Merge only after required checks and review pass. Wait for **Checks on the new main push** to succeed. Its tested artifact is retained for 14 days. A PR run is not a substitute.
3. Run **Actions → Stage npm release** (`npm-stage.yml`) on main with that push run's numeric ID. Choose `next` for testing/prereleases or deliberately choose `latest` for a stable release. The default is `next`; prereleases with `latest` fail closed. Both tags refer to public packages once approved.
4. Save the returned stage ID and review it as described below. **Do not approve in CI.** The workflow has no approval job and cannot complete human 2FA.

The workflow requires the tested commit to be both current main and the workflow commit. If main moves before staging, use the successful Checks push run for the new main. If a version is already live, choose a new version instead of rerunning it. No version can be overwritten after publication.

## Review and approve a staged version

This is a separate maintainer action using an authorized npm account with 2FA. Use tooling supporting staged publishing (npm 11.15.0+); the workflow pins Node 26.13.0 and its bundled npm 11.20.0. Use the official interactive `npm login` only if sign-in is needed. Never paste or commit passwords, tokens or OTPs.

Inspect the specific stage, then download its payload into a fresh review directory:

```sh
npm stage list opencode-codex-security
npm stage view STAGE_ID
npm stage download STAGE_ID
```

Check the package name, version, intended public tag, repository, source commit and provenance. Obtain the corresponding tested CI artifact's `build-manifest.json` and `SHA256SUMS` from the run used for staging. Verify its assets (`shasum -a 256 -c SHA256SUMS` on macOS, `sha256sum -c SHA256SUMS` on Linux), then compare the **downloaded stage tarball's** SHA-256 against `archiveSha256` in that manifest. Checksums alone do not establish trust in an untrusted manifest. Review the actual archive contents and release changes before approval.

When the intended version, tag and bytes are confirmed, the maintainer performs the 2FA approval:

```sh
npm stage approve STAGE_ID
```

Approval publishes that exact version and applies its selected tag. To discard a stage, use `npm stage reject STAGE_ID`, also requiring 2FA. Tags are immutable within a stage: reject and restage if the selected tag was wrong. Do not try to change trust or use a token to avoid approval.

After approval, verify the specific version and intended tag in the public registry, replacing `VERSION` with the approved full version:

```sh
npm view opencode-codex-security@VERSION version dist.integrity dist.attestations --json
npm view opencode-codex-security dist-tags --json
```

Check provenance as well as the source/bytes in the build manifest. A stage ID, successful workflow or `0.0.0-stage` placeholder is not a release. An interrupted submission or approval can have an uncertain outcome: inspect stage list/view **and public registry state** before retrying. Do not blindly create another stage or assume a failed client response means nothing happened.

## Existing trust and security boundaries

The workflow uses the following publisher identity. The npm trust grant should permit staging only:

- Provider: GitHub Actions.
- Owner: `strantalis`.
- Repository: `opencode-codex-security`.
- Workflow filename: `npm-stage.yml`.
- Permission: **stage only**, never direct publishing.
- Environment: none (this workflow does not claim an environment).

The successful OIDC staging run confirms staging access for this workflow; it does not prove the full trust grant or account-wide token/2FA protection settings. Routine releases reuse the existing binding; do not repeat package bootstrap or recreate trust. If npm rejects the workflow because trust is absent, expired or mismatched, stop and have the maintainer review the exact settings using [npm's trusted-publisher documentation](https://docs.npmjs.com/trusted-publishers/). Persistent trust, package protection or account changes require separate authorization. Do not broaden the binding, disable 2FA or create a long-lived token as a workaround.

This utility uses Codex Security for source scans, policy drafting and static finding validation, not exploit execution or patch application. Its dual-use metadata and disclosure must persist. npm forbids direct OIDC publication for dual-use packages. This workflow uses OIDC for **staging only**; OIDC authentication does not grant human approval. Never add a direct publish command or a token fallback.

`Checks` builds and tests without publishing permissions. It installs locked dependencies with lifecycle scripts disabled, audits runtime dependencies, checks source/build freshness and package allowlists, and tests the exact tarball in an isolated OpenCode host. Consumer dependencies are resolved afresh and audited too. The package has no install, prepare, pack or publish lifecycle hooks. Build explicitly before packing. These checks are not a comprehensive secret scan or a guarantee that transitive dependencies are safe.

`npm-stage.yml` is manual, main-only and bound in code to this repository. It verifies a successful current-main push run from `ci.yml`, public visibility, fixed filenames, dual-use manifest, SHA-256 checksums and artifact count. It promotes those exact bytes without rebuilding. The tested source commit must match `GITHUB_SHA`, recorded by npm provenance. The GitHub-hosted staging job has read permissions plus `id-token: write`, uses a commit-pinned setup action and verifies its pinned Node/npm tooling. It never checks out or executes project code or installs project dependencies. There are no npm secrets.

## Limits and references

Provenance identifies the staging workflow; `build-manifest.json` links the bytes to the independently tested build commit/run. Native Desktop/platform testing and a complete real SDK assessment remain separate from mocked CI. Use only repositories and workplace devices authorized for scanning and data transfer.

- [npm stage CLI](https://docs.npmjs.com/cli/v11/commands/npm-stage/)
- [npm staged publishing](https://docs.npmjs.com/staged-publishing/)
- [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/)
- [npm trust prerequisites](https://docs.npmjs.com/cli/v11/commands/npm-trust/)
- [npm dual-use policy](https://docs.npmjs.com/policies/dual-use/)

Verified November 10, 2026; recheck before release. Installed metadata identifies Codex Security 0.9.1 as Apache-2.0, OpenCode plugin/Solid as MIT, and OpenTUI native binaries as MIT AND LGPL-2.1-or-later. Dependencies stay external; this is not comprehensive legal clearance.
