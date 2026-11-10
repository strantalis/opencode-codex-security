# Architecture

The local OpenCode server owns SDK coordination. Terminal and Desktop views call a typed plugin RPC and never read repository files directly.

- `src/plugin.ts`: selects fixture or SDK mode, registers model tools and RPCs, and owns cleanup.
- `src/core/planned-scan.ts`: immutable previews, separate run IDs, two-run concurrency, cancellation and private history coordination.
- `src/core/codex-adapter.ts`: lazy SDK client, callbacks, result mapping, safe budget errors and runtime cleanup.
- `src/core/security-operations.ts`: policy drafts, owner-question callbacks and separately approved static validation.
- `src/core/run-history.ts`: private per-run JSON receipts. Interrupted runs are marked untracked; never automatically resumed.
- `src/core/credential-guard.ts`: metadata-only dedicated-auth precondition before real SDK creation.
- `src/core/scan-plan.ts`: project/path boundaries, context hashes and preview revalidation.
- `src/operation-tools.ts`: model-facing finding and operation tools with native host permissions.
- `src/tui.tsx`, `src/security-tui-operations.tsx`: terminal commands and views.
- `src/gui.tsx`, `src/security-panel.tsx`, `src/security-operations-panel.tsx`: experimental Desktop integration and presentation.
- `preview/` and `scripts/ui-preview/`: isolated fixture design harnesses, not proof of native Desktop behavior.

## Trust boundaries

Model tools rely on OpenCode permissions. The authenticated RPC is for trusted UI callers, not an alternative way for a model to bypass those permissions. No automatic inference starts on load, edits or prompts.

Scope paths guide the SDK's analysis; they are not a filesystem sandbox. Selected context is bounded and verified before execution. Conversation history is not copied implicitly. The current design does not defend against hostile concurrent filesystem mutation.

Each scan owns its client, cancellation signal and state. Policy/validation operations have a separate two-operation concurrency limit and remain in memory. Findings are final-only; sanitized activity has a bounded log. Costs are estimates, not guaranteed caps.

## Current limits

No patch/verify workflow, queued execution, automatic resume, shared remote coordinator or public report publishing. Broader platform support and native Desktop verification remain release work. See [SDK integration](SDK.md) and [release checklist](PUBLISHING.md).
