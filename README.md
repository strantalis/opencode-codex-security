# Codex Security for OpenCode

Run [Codex Security](https://developers.openai.com/codex/security) scans from OpenCode V2: a `/security` view in the terminal, an experimental Desktop panel, and tools your session's model can call.

This is an early, unofficial project (not an OpenCode or OpenAI product), released under [Apache 2.0](LICENSE).

## What it does

- **Scans**: Standard or Deep, on the whole repository, selected paths, or only what changed (uncommitted work, or a branch against a base ref), with progress, estimated cost and findings. Two scans can run at once per project, and results are kept in local history.
- **Policy drafts**: generates a `SECURITY.md` draft for a repository or component. It can pause to ask you questions, and it never writes the file.
- **Finding validation**: re-checks one finding against the source.
- **Fixes**: writes and verifies a fix for one finding in a throwaway copy of the last commit, then shows you the diff. Your files change only if you apply it, and nothing is committed.

The plugin is a thin layer over the [`@openai/codex-security`](https://www.npmjs.com/package/@openai/codex-security) SDK, which runs the Codex runtime underneath. Scans send your source to the model provider you have configured, so every scan, policy draft and validation shows a preview and waits for your approval.

## Install

Add the package to the `plugins` array in your OpenCode config (`~/.config/opencode/opencode.json`), pinning a published version:

```json
{ "plugins": [{ "package": "opencode-codex-security@VERSION" }] }
```

To run from source instead, clone this repository, run `npm ci --ignore-scripts`, and set `package` to the checkout's absolute path. The built UI bundles are committed, so no build step is needed.

Open `/security` to confirm it loaded. To hand the install to a coding agent, see [docs/AGENT-SETUP.md](docs/AGENT-SETUP.md).

Running a scan also needs, on the `PATH` of the OpenCode process:

- Node 22.20+, 24.x or 26.x (the SDK runs helpers on Node even though OpenCode itself runs on Bun)
- Python 3.10+

## Configuration

With no configuration, the plugin uses the model and provider from your Codex config (`~/.codex/config.toml`), or the SDK defaults if you have none. Authentication follows the SDK: an API key from the environment, otherwise your Codex Security sign-in.

To change the model, provider, scan mode or cost limit, see [docs/CONFIG.md](docs/CONFIG.md).

## Using it

In the terminal, `/security` opens the view, `/security-scan` starts a new scan, `/security-policy` drafts a policy and `/security-validate` re-checks a finding. Everything else is a key inside the view, listed in its footer: move through scans and findings, open a finding, validate it or propose a fix, answer policy questions, apply or discard a fix, and cancel. The scan review lets you change the target, depth, scope (paths, or a diff), focus and context before you start.

Your session's model can do the same through these tools:

| Tool                                                | Purpose                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| `security_status`                                   | The resolved route, config files, Codex profiles, and Node/Python found.      |
| `security_scan`                                     | Start a scan. Asks for your approval with the preview.                        |
| `security_scans`, `security_scan_status`            | List scans and follow one.                                                    |
| `security_scan_results`                             | Findings of a completed scan, or one finding in detail.                       |
| `security_policy`, `security_validate`              | Start a policy draft or a validation. Each asks first.                        |
| `security_fix`, `security_apply_fix`                | Propose a fix for a finding, then apply or discard the diff. Each asks first. |
| `security_operations`                               | Status, pending questions and results of those operations.                    |
| `security_answer_questions`                         | Answer a policy's owner questions. Asks first.                                |
| `security_cancel_scan`, `security_cancel_operation` | Cancel one run.                                                               |

Approvals use OpenCode's permission rules, under the actions `codex_security_scan`, `codex_security_policy`, `codex_security_validation`, `codex_security_fix`, `codex_security_apply_fix` and `codex_security_answer`.

When a scan, policy draft or validation started by the session's model ends, or a policy draft has questions for you, the plugin posts a short notice into that session and the model picks it up from there.

### Scanning with context from other repositories

Tell the session what matters, for example: "scan repo X; it depends on Y and Z, and our GitOps and Terraform repos describe how it is deployed". The plugin ships a `codex-security` skill that has the model:

1. Clone what is not checked out locally into `~/.cache/opencode/codex-security/workspaces/<name>/` (`app/` for the code, `context/` for infrastructure).
2. Write a short deployment summary from the infrastructure repositories.
3. Scan the target with that summary and the relevant infrastructure files as context. Context paths may be absolute and point anywhere; any UTF-8 text file (Terraform, YAML, JSON, Markdown), PDF or DOCX works.
4. Or, if you want data flow followed across repositories, scan the `app/` folder as one system with scope paths into each checkout. This costs more.

The workspace stays until you ask the model to delete it, so validation can reuse the same files.

## Limits

- Cost figures are the SDK's estimates, and `scan.maxCostUsd` stops a scan on that estimate. Neither is a billing cap, and validation and fixes have no cost limit at all.
- Findings arrive when a scan completes, not while it runs.
- Policy and validation operations live in memory and are lost when OpenCode restarts. A scan interrupted by a restart is marked as interrupted, not resumed. Session notices are not sent for work that outlives a restart.
- A fix is written against the last commit, so it does not see uncommitted work, and applying it fails if your working tree has changed the same lines. A proposed fix that is neither applied nor discarded is removed when OpenCode restarts.
- Diff scans are Standard only.
- Tested on macOS and Linux. The Desktop panel is experimental.

## Development

```sh
npm ci --ignore-scripts
npm run check        # lint, format, types, unit tests, build
npm run setup:local  # one-time: isolated OpenCode under .runtime/
npm run test:host && npm run test:plan-host
```

The host tests run the plugin inside a real OpenCode server with a mock SDK, so they make no model calls. See [CONTRIBUTING.md](CONTRIBUTING.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/RELEASING.md](docs/RELEASING.md).
