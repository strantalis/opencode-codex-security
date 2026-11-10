# Scan runs and session tools

SDK-mode scans use immutable app `runId` values. `scanId` is the SDK identifier and is absent until the SDK supplies it. Every approved preview creates an independent client, cancellation signal, settings snapshot, result set, and SDK-managed output directory. Preparing another scan does not replace running inputs. At most two scans run concurrently per OpenCode project location; no hidden queue starts work later. Deep workers are separate from this two-run limit.

The panel and tools report only observed feedback: phase, file/review counts, bounded activity, optional Deep progress, model-reported worker dispatch, and optional estimated cost. Counts are phase-local, may be unknown, and do not establish a wall-clock ETA. Findings become available at completion. Raw reasoning, command arguments, credential details and raw tool output are not streamed.

Private per-run JSON records under the user's XDG state directory retain scan previews and terminal findings. The list shows the latest 50; files are not silently deleted. Start/terminal receipts, real SDK run IDs and phase changes persist; other live progress is checkpointed at most every 10 seconds. An unfinished record after another plugin instance ends is marked untracked, not completed or automatically resumed. Policy/validation operations currently remain memory-only. Reloading the plugin can cancel active work: finish or explicitly cancel runs before updating it.

## Workspace versus target

The plugin installation and SDK defaults are global. They do not select a repository, combine histories or start work across projects.

- **Workspace** is the local OpenCode session location. RPC calls and scan/operation lists belong to this location. Two sessions in the same location share that workspace history; a different location has its own history.
- **Target** is the exact repository saved in an immutable scan or operation preview. It defaults to the known current workspace, or can be explicitly set elsewhere. An override does not change global settings or the default for a later request. Same-named directories remain distinct by full path.
- Scan scope and supporting files are relative to that target. Policy's optional component is also relative to its target. Validation launched from a finding keeps the finding's original repository, rather than silently switching to the current workspace.
- If no valid local session anchor is known, use an explicit absolute repository path. The backend never substitutes the plugin process's working directory; home folders and parent directories remain prohibited targets. No Git-root guess expands the target.
- Switching the displayed workspace remounts the view and its polling; it does not move, cancel or restart existing scans. Return to the launching workspace to see them. A workspace history can include explicitly chosen targets elsewhere; this is not a global all-repositories dashboard.

In the TUI, `/security-target` selects an absolute target for the next scan and clears the previous target’s scope/context. `/security-mode` uses that exact prepared target. The TUI history workspace is pinned to its setup location; it does not claim to follow other session tabs automatically. Unknown setup context requires an explicit target. Desktop follows its mounted local session and remounts when that location changes.

Policy and validation operations remain server-session-only. Scan receipts persist under their launching workspace's local history. Model configuration is global; per-scan targets and scope are not configuration overrides.

## Model tools

- `security_prepare_scan`: independent target/context preview; no inference.
- `security_run_scan`: exact preview, host permission, immutable run ID.
- `security_list_scans`: recent runs and available previews.
- `security_scan_status`, `security_scan_activity`, `security_scan_results`: exact run ID; results only claim completion after the SDK completes.
- `security_cancel_scan`: exact run ID and host permission; cannot cancel another run implicitly.
- `security_finding_detail`: completed run plus finding ID; excludes raw source evidence.
- `security_prepare_policy`: repository/component and documentation context.
- `security_prepare_validation`: a finding from a completed run, without starting inference.
- `security_start_operation`: exact policy/validation preview with separate native permission.
- `security_list_operations`, `security_operation_status`: progress, questions and final result.
- `security_answer_questions`: exact operation/question batch, verified user-authorized facts, native permission. Missing knowledge must be asked about, not invented.
- `security_cancel_operation`: exact policy/validation operation.

## Supported operations and limits

Policy calls the installed SDK's `generatePolicy`, pauses for owner clarification through its `answerQuestions` callback, and returns an unapplied SECURITY.md draft. No file is automatically overwritten.

Validation calls the installed SDK's `validate` against source and returns a disposition/report. It does not run builds/tests. SDK 0.9.1 provides no validation cost ceiling; the normal scan budget does not apply. The UI and model tool disclose this and require separate authorization.

Patch generation/application and fix verification are not exposed. They need a separate isolated-workspace design.

No scan or operation silently signs in. Dedicated Codex Security authentication must already be established. Configuration, previews and status reads do not create SDK clients or perform inference.

## Run detail and uncertainty

Each run retains structured SDK lifecycle, phase-local file/review counts, keyed activity, observed worker-session numbers, reconnect metadata and usage measurements. A review count of zero falls back to available file counts. Dispatch markers are best-effort signals; Deep maximum is a cap, not a percentage denominator.

SDK core completion can precede the final `run()` result. During that interval the app stays running and says it is finalizing. No deduplication progress is inferred. The SDK does not provide a typed live findings callback; findings remain final-only.

Activity IDs are hashed because some SDK IDs contain prose. Raw reasoning, commands, arguments and descriptions are never retained. Fixed categories and bounded repository-relative path mentions provide context; credential/runtime/outside paths are excluded. Running/completed updates share one keyed row and late running updates cannot reverse a terminal row. At most 100 activity entries and 128 observed worker numbers are retained.

Measurements distinguish complete, partial and unavailable usage coverage, include observation time/missing-session counts, and preserve known estimate bounds. Partial values are measured subtotals; no price is a bill or account allowance. A missing upper bound stays unknown. Legacy saved costs have unknown coverage.

Final results distinguish reportable, informational and unclassified returned findings. Repository matching describes returned historical records, never a count of new unique vulnerabilities. Summary lists are bounded and show omissions. Manifest coverage is a guarded, version-sensitive projection: SDK 0.9.1 can remove detailed review state during finalization, so unavailable coverage remains unavailable. Typed scope/review exclusions can still be shown. No extra artifact files are opened by this projection.

New metadata is revalidated and sanitized when private history is loaded. Invalid optional metadata is discarded without losing the whole run.

Older saved runs cannot reconstruct activity or coverage that the previous plugin discarded; their missing details remain unavailable.
