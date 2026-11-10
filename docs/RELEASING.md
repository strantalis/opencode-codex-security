# Tested builds and open-source release readiness

## Build and promote a tested preview

Repository visibility is an explicit maintainer choice. The manifest is public-release-ready, but GitHub previews do not stage or publish to npm. No npm account, package registry token or new persistent credential is required for the preview pipeline. The separate [npm staging guide](PUBLISHING.md) describes explicit bootstrap/trust setup and human approval.

Every push and pull request runs locked installation with lifecycle scripts disabled, runtime dependency audit, lint, formatting, types, unit tests, build freshness, package allowlist and offline OpenCode integration. CI packs once, installs and tests that exact tarball, audits its newly resolved consumer dependencies, then saves `package-<full-commit>` for 14 days. The artifact contains the `.tgz`, `build-manifest.json` and `SHA256SUMS`. A PR artifact identifies its tested synthetic merge commit; prefer a push artifact when pinning a branch.

After the branch is merged and **main's Checks run succeeds**, use **Actions → Preview release → Run workflow** on main and enter that successful push run's numeric ID and the intended repository visibility (`private` or `public`). A mismatch with the repository's actual visibility fails closed; public assets are accessible to anyone. The workflow never changes repository visibility. The workflow refuses failed, PR, foreign, expired, non-main or outdated-main builds. It creates `preview-<12-character-commit>` with three release assets. It never rebuilds, replaces a tag, publishes to npm or changes repository visibility. If a run expires, rerun Checks on the current main. A release failure can leave a tag/release created by GitHub; inspect it before retrying rather than overwriting assets blindly.

Equivalent CLI using an already authorized GitHub login:

```sh
gh run list --repo strantalis/opencode-codex-security --workflow ci.yml --branch main --event push
gh workflow run release.yml --repo strantalis/opencode-codex-security --ref main -f run_id=RUN_ID -f visibility=public
gh run list --repo strantalis/opencode-codex-security --workflow release.yml
```

Only the existing GitHub Actions `GITHUB_TOKEN` is used. The workflow needs Actions enabled and repository policy allowing its scoped `contents: write` release job. Do not grant extra PAT/OAuth permissions to work around restrictions without approval.

## Install a tested build at work

Use only a workplace/device where this code and its data transfers are permitted. For a public repository/release, use the release page to download the three assets without GitHub sign-in. A private repository requires your existing authorized GitHub access; a private URL by itself does not grant access. Installing real SDK mode also needs the separate supported account/sign-in described in the README. The pipeline does not configure workplace access or copy sign-ins.

Download the selected release's three assets from [Releases](https://github.com/strantalis/opencode-codex-security/releases). If you already use an authorized GitHub CLI login, the equivalent is:

```sh
mkdir security-preview && cd security-preview
gh release download preview-COMMIT_PREFIX --repo strantalis/opencode-codex-security
# macOS:
shasum -a 256 -c SHA256SUMS
# Linux: sha256sum -c SHA256SUMS
cat build-manifest.json
npm install --prefix ./consumer --ignore-scripts --no-audit --no-fund ./opencode-codex-security-0.1.0.tgz
```

The tarball version remains `0.1.0` during preview testing; the release tag, full source commit and hash uniquely identify each build. Use the filename actually listed in the manifest if the version changes. Set your OpenCode plugin's `package` to the absolute path of `consumer/node_modules/opencode-codex-security` while preserving unrelated configuration. Select `engine: fixture` for offline testing or your explicitly configured SDK mode. Keep each preview in a separate directory; switch/reload only after active scans, approval dialogs and policy forms finish. Keep the previous directory to roll back. Nothing auto-updates the watched installation.

The tarball does not bundle its dependency tree: npm still fetches dependencies. Artifact checksums authenticate only the downloaded bytes relative to the trusted repository; they are not independent signatures or a dependency safety guarantee.

## Keep fixes moving

Develop in a separate checkout/worktree, push fixes, inspect that commit's CI, merge reviewed changes and create a new preview. Report the full `sourceCommit`, OpenCode/OS versions and a minimal redacted reproduction with test feedback. Avoid attaching real scan payloads or credentials. GitHub's hosted checks continue when the development Mac is unavailable, but interactive assistant work still needs an available authorized checkout/computer.

## npm distribution

Public GitHub distribution under Apache 2.0 is approved. The separate manual `npm-stage.yml` workflow can stage tested artifacts only after the maintainer bootstraps the npm package and explicitly configures stage-only trust. No account, npm package or persistent trust is created by adding that workflow. Every live npm version still requires human 2FA approval. See [publishing and operating the staging flow](PUBLISHING.md).

Keep development fixes in separate worktrees and PRs; do not overwrite the watched local installation. For npm fixes, bump the patch version and lockfile together. For prerelease testing use a full prerelease version with `next`; use `latest` only deliberately for stable releases. Pin the full installed version, keep the prior consumer for rollback and reload only after active operations finish.

Before a public release, review source/history/assets for private data, preserve the license and disclosure, recheck dependency advisories, validate native Desktop/supported platforms, and complete any separately approved real SDK assessment. Mocked CI does not establish those claims. Branch rules and vulnerability-reporting settings are independent repository controls.

Source references: [GitHub workflow permissions](https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions#permissions), [GitHub Actions artifacts](https://docs.github.com/en/actions/using-workflows/storing-workflow-data-as-artifacts), [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).
