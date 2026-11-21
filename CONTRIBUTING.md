# Contributing

Use the Bun version pinned in `package.json` and Node 26.4+ in the 26.x line (`nvm use`). Install with `bun install --frozen-lockfile --ignore-scripts`, then run `bun run check` and `bun run pack:check` before committing. After `bun run setup:local`, also run `bun run test:host` and `bun run test:package` for host/package changes. `bun run format` formats maintained files; intentionally vulnerable fixtures are excluded so their source locations stay stable.

The check command runs Oxlint, Oxfmt, the TypeScript compiler, and the build-and-test step in parallel. Tests use Node’s runner for per-file isolation and SDK runtime coverage.

For TUI changes, `bun run test:tui` uses the actual OpenTUI renderer with an in-memory synthetic RPC client. It checks the summary at a terminal-sized viewport, scan switching, technical-detail disclosure and exact-run cancellation, without starting an OpenCode service or using model credentials.

The built bundles under `dist/` are not committed; `bun run test`, `bun run test:host` and the packaging scripts build them first. `bun run build` also precompiles the TUI into `dist/tui.js`, keeping the host's Solid/OpenTUI modules external. Installed `node_modules` TSX does not receive OpenCode's workspace JSX transform. Do not point the published TUI export back at raw TSX or add duplicate host-runtime dependencies to mask that problem. `bun run test:package` installs outside the checkout, rejecting any ancestor `node_modules` that could hide missing dependencies. It and release-artifact verification run the installed tarball through the native TUI using a Python 3 PTY harness with no Node/npm/Bun on the host `PATH`. It verifies `/security`, the default repository/scope preview and cancellation, a visible setup error, and a clean exit; it does not start real SDK operations.

Use the injected-mock host tests for development. They put their sample projects outside this checkout, because the SDK refuses to keep its state inside the repository it scans. Do not start paid SDK operations or send repository data merely to test the plugin. For a real test, agree the target, model and cost limit first, and treat a budget stop as an incomplete scan.

The normal installed plugin may be watched by OpenCode. Develop in a separate checkout and do not edit/reload an installation while scans or policy questions are active. Local history does not automatically resume an interrupted scan.

Never commit `.runtime/`, dependency folders, credentials, raw scan output or screenshots containing private data. Keep synthetic examples clearly labeled and never deploy them. Do not publish a package or broaden repository visibility without approval.

For CI artifacts, workplace installation, release promotion and the remaining open-source decisions, see [the release guide](docs/RELEASING.md). Run `bun run audit:runtime` as well as the normal checks. The release artifact still uses npm to pack and exercise the registry consumer install. Dependency PRs are not automatically merged.
