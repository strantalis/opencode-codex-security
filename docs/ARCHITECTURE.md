# Architecture

The plugin runs in the local OpenCode server and wraps three SDK calls: `run`, `generatePolicy` and `validate`. The terminal and Desktop views talk to it over a typed plugin RPC; the session's model talks to it through tools.

| File                                                                 | Role                                                                                                                 |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `src/plugin.ts`                                                      | Registers the RPC and tools, wires events, cleans up.                                                                |
| `src/tools.ts`                                                       | The model-facing tools. Anything that starts inference asks OpenCode for permission first.                           |
| `src/core/settings.ts`                                               | Merges the user's Codex routing with `codex-security.json`.                                                          |
| `src/core/scan-plan.ts`                                              | Builds a preview by calling the SDK's `preflight`, which validates scope, context, mode, cost limit and credentials. |
| `src/core/planned-scan.ts`                                           | Previews, runs, the two-run limit, and history.                                                                      |
| `src/core/codex-adapter.ts`                                          | Runs one scan and projects SDK callbacks into UI state.                                                              |
| `src/core/security-operations.ts`                                    | Policy drafts (with owner questions) and validation.                                                                 |
| `src/core/run-history.ts`                                            | One private JSON file per run under `$XDG_STATE_HOME/opencode/codex-security/runs/`.                                 |
| `src/core/run-telemetry.ts`, `result-summary.ts`, `report-safety.ts` | Projections of SDK activity, usage and results for display.                                                          |
| `src/tui.tsx`, `src/gui.tsx`, `src/security-*.tsx`                   | Terminal and Desktop views.                                                                                          |

## How a scan runs

1. **Prepare.** `prepareScan` resolves the repository (the session workspace, or an explicit path), loads settings and calls `preflight`. Nothing is sent anywhere. The result is an immutable plan holding the exact `codexOverrides`, auth mode and scan options.
2. **Approve.** The UI shows the plan and the user confirms. For the model, `security_scan` prepares the plan and passes it to OpenCode's permission check.
3. **Run.** The plan is handed to the SDK as prepared. Settings edited after the preview do not affect it. Progress, activity and cost arrive through SDK callbacks; findings arrive with the final result.

Policy and validation follow the same prepare, approve, run shape.

## Design choices

- **The SDK validates.** The plugin checks the shape of its own inputs and leaves paths, modes, providers and credentials to the SDK, whose typed errors are shown to the user as written. Unexpected errors are reported generically.
- **Activity is summarised.** SDK activity descriptions can contain commands and model reasoning, so the views show a category ("Reading source") and repository-relative paths instead.
- **Report text is filtered.** Findings and reports pass through a pattern filter for obvious credentials before display and storage. It is a courtesy, not a guarantee.
- **Scope is not a sandbox.** Scope paths tell the SDK what to review. The SDK's own permission profile governs what the scan can read.

## Not implemented

Patch generation, fix verification, diff scans, resuming interrupted scans, and persistence for policy and validation operations.
