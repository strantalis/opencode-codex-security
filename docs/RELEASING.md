# Private builds and open-source release readiness

## Private testing now

The repository and package stay private. No npm account, package registry token or new persistent credential is required for this pipeline.

Every push and pull request runs locked installation with lifecycle scripts disabled, runtime dependency audit, lint, formatting, types, unit tests, build freshness, package allowlist and offline OpenCode integration. CI packs once, installs and tests that exact tarball, then saves `package-<full-commit>` for 14 days. The artifact contains the `.tgz`, `build-manifest.json` and `SHA256SUMS`. A PR artifact identifies its tested synthetic merge commit; prefer a push artifact when pinning a branch.

After the branch is merged and **main's Checks run succeeds**, use **Actions → Private preview release → Run workflow** on main and enter that successful push run's numeric ID. The workflow refuses failed, PR, foreign, expired, non-main or outdated-main builds. It creates `preview-<12-character-commit>` with three private release assets. It never rebuilds, replaces a tag, publishes to npm or changes repository visibility. If a run expires, rerun Checks on the current main. A release failure can leave a tag/release created by GitHub; inspect it before retrying rather than overwriting assets blindly.

Equivalent CLI using an already authorized GitHub login:

```sh
gh run list --repo strantalis/opencode-codex-security --workflow ci.yml --branch main --event push
gh workflow run release.yml --repo strantalis/opencode-codex-security --ref main -f run_id=RUN_ID
gh run list --repo strantalis/opencode-codex-security --workflow release.yml
```

Only the existing GitHub Actions `GITHUB_TOKEN` is used. The workflow needs Actions enabled and repository policy allowing its scoped `contents: write` release job. Do not grant extra PAT/OAuth permissions to work around restrictions without approval.

## Install a tested build at work

Use only a workplace/device where this code and its data transfers are permitted. The private repository requires your existing authorized GitHub access; a private URL by itself does not grant access. Installing real SDK mode also needs the separate supported account/sign-in described in the README. The pipeline does not configure workplace access or copy sign-ins.

Download the selected release's three assets with GitHub's UI, or:

```sh
mkdir security-preview && cd security-preview
gh release download preview-COMMIT_PREFIX --repo strantalis/opencode-codex-security
# macOS:
shasum -a 256 -c SHA256SUMS
# Linux: sha256sum -c SHA256SUMS
cat build-manifest.json
npm install --prefix ./consumer --ignore-scripts --no-audit --no-fund ./opencode-codex-security-0.1.0.tgz
```

The tarball version remains `0.1.0` during private testing; the release tag, full source commit and hash uniquely identify each build. Use the filename actually listed in the manifest if the version changes. Set your OpenCode plugin's `package` to the absolute path of `consumer/node_modules/opencode-codex-security` while preserving unrelated configuration. Select `engine: fixture` for offline testing or your explicitly configured SDK mode. Keep each preview in a separate directory; switch/reload only after active scans, approval dialogs and policy forms finish. Keep the previous directory to roll back. Nothing auto-updates the watched installation.

The tarball does not bundle its dependency tree: npm still fetches dependencies. Artifact checksums authenticate only the downloaded bytes relative to the trusted repository; they are not independent signatures or a dependency safety guarantee.

## Keep fixes moving

Develop in a separate checkout/worktree, push fixes, inspect that commit's CI, merge reviewed changes and create a new private preview. Report the full `sourceCommit`, OpenCode/OS versions and a minimal redacted reproduction with test feedback. Avoid attaching real scan payloads or credentials. GitHub's hosted checks continue when the development Mac is unavailable, but interactive assistant work still needs an available authorized checkout/computer.

## Before making it open source or publishing npm

These are explicit maintainer decisions, not automatic pipeline steps:

1. Choose an open-source license and copyright holder; review dependency redistribution obligations. `UNLICENSED` and `private: true` are deliberate guards, not an open-source license.
2. Review the full Git history, examples, issues and release assets for private data before changing repository visibility. Private artifacts and releases could become accessible when visibility changes.
3. Configure and verify private vulnerability reporting/contact; add branch protection requiring Checks and human review, and enable supported secret/dependency alerts. These account/repository settings are not changed by this code.
4. Choose npm name/scope and public/private distribution; verify ownership and applicable npm security/dual-use requirements. The unscoped name is always public. Review the separate [publishing checklist](PUBLISHING.md).
5. Prefer npm trusted publishing with GitHub OIDC and provenance if supported for the chosen package/account/policy. That trust is persistent access and needs explicit setup approval. No OIDC permission, npm token or npm publish job has been added now. Never fall back to a long-lived token silently.
6. Recheck dependencies/advisories, validate native Desktop and the supported platforms, and complete a separately approved real SDK assessment. Mocked CI does not prove those claims.

Source references: [GitHub workflow permissions](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions#permissions), [GitHub Actions artifacts](https://docs.github.com/en/actions/using-workflows/storing-workflow-data-as-artifacts), [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).
