# Contributing

Use Node 26.4+ in the 26.x line (`nvm use`). Install with `npm ci --ignore-scripts`, then run `npm run check` and `npm run pack:check` before committing. After `npm run setup:local`, also run `npm run test:host`, `npm run test:plan-host` and `npm run test:package` for host/package changes. `npm run format` formats maintained files; intentionally vulnerable fixtures are excluded so their source locations stay stable.

ESLint checks JavaScript and TypeScript correctness, including unused variables. Explicit `any` remains permitted at existing host/RPC integration boundaries; this does not replace the separate TypeScript check. Prefer typed boundaries for new code.

For TUI changes, `npm run test:tui` uses the actual OpenTUI renderer with an in-memory synthetic RPC client. It requires Bun (use a version supported by `@opentui/core`). It checks the summary at a terminal-sized viewport, scan switching, technical-detail disclosure and exact-run cancellation, without starting an OpenCode service or using model credentials.

`npm run build` also precompiles the TUI into `dist/tui.js`, keeping the host's Solid/OpenTUI modules external. Installed `node_modules` TSX does not receive OpenCode's workspace JSX transform. Do not point the published TUI export back at raw TSX or add duplicate host-runtime dependencies to mask that problem. `npm run test:package` installs outside the checkout, rejecting any ancestor `node_modules` that could hide missing dependencies. It and release-artifact verification run the installed tarball through the native TUI using a Python 3 PTY harness with no Node/npm/Bun on the host `PATH`. It verifies `/security`, an explicitly selected bundled fixture, the default real repository/scope preview and cancellation, a visible unsupported-authentication setup error, explicit OpenAI API-key/gateway-header previews, and a clean exit; it does not start real SDK operations.

Use the isolated fixture and injected-mock host tests for development. Do not start paid SDK operations, copy sign-ins, or send repository data merely to test the plugin. Real runs require explicit authorization for the target and expected usage.

The normal installed plugin may be watched by OpenCode. Develop in a separate checkout and do not edit/reload an installation while scans or policy questions are active. Local history does not automatically resume an interrupted scan.

Never commit `.runtime/`, dependency folders, credentials, raw scan output or screenshots containing private data. Keep synthetic examples clearly labeled and never deploy them. Do not publish a package or broaden repository visibility without approval.

For CI artifacts, workplace installation, release promotion and the remaining open-source decisions, see [the release guide](docs/RELEASING.md). Run `npm run audit:runtime` as well as the normal checks. Never use `npm audit fix --force` without inspecting the compatibility and security consequences. Dependency PRs are not automatically merged.
