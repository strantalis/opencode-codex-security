# Install with an agent

Copy the prompt below into your coding agent on the machine where you run OpenCode. It installs a pinned public package, preserves existing settings and separates installation from sign-in and paid inference. It does not authorize a real scan.

Verified November 10, 2026: npm `latest` is `0.1.0`; `0.1.1` is also public under `next`. The prompt deliberately pins `0.1.0`. For testing `0.1.1`, replace that exact version throughout the prompt before using it. Do not substitute a moving tag, an unpublished source version or the `0.0.0-stage` placeholder.

## Copy-paste prompt

```text
Install opencode-codex-security@0.1.0 for my existing OpenCode V2 installation.
Official project: https://github.com/strantalis/opencode-codex-security
Setup guide: https://github.com/strantalis/opencode-codex-security/blob/main/docs/AGENT-SETUP.md

This request authorizes installation and the plugin configuration change, not
real scans, policy generation, finding validation, source uploads or account
changes. Follow the project's current setup guidance and my device/workplace
rules. Stop and explain any incompatible prerequisite or permission restriction.

1. Inspect the existing OpenCode version and effective configuration location.
   This plugin is tested with OpenCode V2 2.2.6, not the V1 plugin schema.
   Use Node.js 26.4+ in the 26.x line and npm. Real SDK mode also needs macOS or
   Linux and Python 3.10+ (3.10 additionally needs tomli). Prefer Python 3.11+
   when available. Check versions without reading credential files or dumping
   environment variables. Do not silently upgrade OpenCode, change my runtime
   defaults or install system prerequisites. Explain any needed change first.

2. Confirm version 0.1.0 is publicly available with npm view. Choose a new,
   dedicated user-writable consumer directory outside my source repositories
   and any watched plugin installation. From that new directory, run:
     npm init -y
     npm install --save-exact --ignore-scripts opencode-codex-security@0.1.0
     npm audit --omit=dev --audit-level=high
   Keep package.json and package-lock.json; use npm ci --ignore-scripts for
   repeat installs into a separate directory. Do not run npm audit fix --force,
   enable lifecycle scripts, follow latest/next, or overwrite an active install.
   Report audit findings before activating the package. The SDK and its bundled
   Codex runtime are npm dependencies; do not install another global Codex CLI
   or SDK just for this plugin. An existing OpenCode host is still required.

3. Before editing live configuration, verify no scans, approval dialogs or
   policy forms are active. If their status is unknown, ask whether it is safe
   to make the edit. Hosts may watch configuration and reload automatically.
   Installation in the separate consumer can finish while waiting.
   Back up my effective OpenCode configuration locally outside Git/source
   repositories, preserving restrictive permissions and keeping its contents
   private. Never print the whole config; show only redacted plugin-specific
   changes. Preserve JSONC comments, unrelated settings and other plugins.
   Add or update only this plugin entry in the V2 "plugins" array, using the
   absolute installed package-directory path and avoiding duplicate entries:
     {
       "package": "/absolute/consumer/node_modules/opencode-codex-security",
       "options": { "engine": "fixture" }
     }
   The fixture engine is an offline demo using bundled vulnerable examples,
   not an assessment of my repository. Do not treat its findings as real.

4. Explain what is needed for real mode. Reuse an existing dedicated Codex
   Security ChatGPT sign-in if present and private; check file metadata only.
   Never read, print, copy, hard-link or upload auth.json or other private token
   files, and never ask me to paste passwords, API keys, tokens or codes into
   chat. An ambient Codex sign-in or API-key environment variable is not enough
   for this plugin. Do not run SDK login status/account helpers when dedicated
   credentials are missing: the upstream SDK can import ambient credentials.
   If sign-in is needed, offer the installed official CLI's interactive login
   for me to complete securely in my own terminal/browser:
     ./node_modules/.bin/codex-security login
   Run it from the consumer directory only after I choose to sign in. Keep the
   same CODEX_HOME/CODEX_SECURITY_STATE_DIR environment as the OpenCode process;
   state must stay outside repositories. Do not change credential storage,
   permissions, accounts or managed-device policy to bypass the guard. If the
   supported login does not produce the required private dedicated auth file,
   report the blocker rather than copying credentials or disabling safeguards.

5. Once I choose real mode and its prerequisites are satisfied, repeat the
   idle-state check before changing only this plugin's engine to "codex". Do not add model or credential overrides
   to the plugin entry. Preserve existing global codex-security.json settings;
   use the project's GLOBAL-CONFIG guide if I request changes. Never assume
   model access or Daybreak entitlement. Activating codex mode starts no scan.

6. Reload/restart OpenCode only when no scans, approval dialogs or policy forms
   are active. If their status is unknown, ask me whether it is safe to reload.
   Verify the plugin loads and /security is available without starting real
   inference. Do not claim a fixture test proves real authentication or scans.
   Before any real operation, show its exact target, scope, context, mode and
   estimated cost threshold and get my approval to send source/context to
   OpenAI. Repository scope is not filesystem/process isolation; use an approved
   environment without unrelated secrets, since SDK subprocesses can inherit
   environment credentials and access files beyond the selected scope. Never
   print those credentials. Scan cost thresholds are not hard billing caps.
   Finding validation has no SDK cost ceiling and needs separate explicit
   approval. Respect native
   OpenCode permissions; never bypass a denial with RPC, shell or another tool.

Finish with the installed version, absolute package path, configuration file
changed, selected engine, prerequisite/audit results, authentication blockers
without secrets, reload status and the next user action. Keep the previous
installation and configuration backup available for rollback.
```

## Runtime dependencies, not publishing tools

Use **Node 26.4+ within 26.x** for the tested installation path. The plugin manifest declares `node >=24`; SDK 0.9.1 supports Node 24.x and 26.x within that range, not every later Node version. The development/TUI test tree uses OpenTUI 0.8.3, which requires Node 26.4+. This is the tested recommendation, not proof that every consumer needs that optional peer dependency.

The package installs `@openai/codex-security@0.9.1`, `@opencode/plugin@2.2.6` and Solid through npm, along with their dependencies. The SDK includes its Codex runtime and security plugin; a separate global Codex installation is not required. OpenTUI is an optional peer of `@opencode/plugin`; the existing OpenCode host supplies its terminal integration. Keep npm's platform-specific optional dependencies enabled. OpenCode V2 itself is a separate host, tested at 2.2.6; the consumer package does not install it. Bun is needed for this repository's developer TUI smoke test, not as a separate onboarding step for an already working OpenCode host.

Python 3.10+ is needed for real SDK operations; Python 3.10 also requires `tomli`. The selected interpreter must be available to the OpenCode process, not only your interactive shell. The SDK supports `PYTHON` for interpreter selection, but this plugin's JSON settings do not expose executable-path overrides. Do not change a user's launch environment without agreement. Real mode is POSIX-only because the credential guard cannot yet verify Windows ACL privacy. Desktop integration remains experimental.

No npm publishing account, npm 2FA setup, stage-only trust, GitHub CLI or maintainer workflow is needed to install a public release. Node 26.13.0/npm 11.20.0 in [the release workflow](PUBLISHING.md) are **publishing-tool pins**, not consumer requirements.

## Configuration and sign-in details

For the standard OpenCode configuration location, inspect `$XDG_CONFIG_HOME/opencode/opencode.json` or `~/.config/opencode/opencode.json`; installations may use JSONC or an explicit configuration override such as `OPENCODE_CONFIG_DIR`. Confirm the effective file rather than writing a second configuration blindly. This is separate from the optional [global SDK settings](GLOBAL-CONFIG.md) in `codex-security.json`, which honor `XDG_CONFIG_HOME` but not `OPENCODE_CONFIG_DIR`. The supported V2 entry is an object in the plural `plugins` array with an absolute package-directory path; do not substitute V1 `plugin` syntax or assume an untested registry shorthand.

The real engine uses the OpenAI provider and **ChatGPT authentication**. A supported account and model access are required. The SDK's broader API-key/provider examples are not plugin configuration options. Changing to `engine: codex` does not log in, transfer repository data or start inference. For authorized real operations, repository scope is not filesystem/process isolation: SDK subprocesses can inherit environment credentials and access files beyond selected paths. Use an approved environment without unrelated secrets; see [the official local-scan permissions](https://learn.chatgpt.com/docs/security/cli/reference#local-scan-permissions).

The dedicated authentication file is under `$CODEX_SECURITY_STATE_DIR/codex-home`, otherwise `$CODEX_HOME/state/plugins/codex-security/codex-home` (`CODEX_HOME` defaults to `~/.codex`). The directory and `auth.json` must be owned by the current user, nonsymlinks and inaccessible to group/other users. The plugin checks metadata, not token contents or validity. A keyring-only sign-in does not satisfy this file guard. Do not downgrade credential storage or alter permissions automatically to make it pass; respect official account/device policy and report the incompatibility.

The [official SDK authentication instructions](https://github.com/openai/codex-security/blob/main/sdk/typescript/README.md#authentication) describe interactive login, including supported remote flows. Use the CLI installed with the pinned dependency rather than an unpinned `npx` download. For SDK 0.9.1, status/scan helpers may import ambient credentials when the dedicated home is empty; the explicit login flow establishes its own session. Never use a scan as an authentication test. See [SDK safety and verification limits](SDK.md) before authorizing any real operation.
