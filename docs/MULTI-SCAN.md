# Scan runs and session tools

SDK-mode scans use immutable app `runId` values. `scanId` is the SDK identifier and is absent until the SDK supplies it. Every approved preview creates an independent client, cancellation signal, settings snapshot, result set, and SDK-managed output directory. Preparing another scan does not replace running inputs. At most two scans run concurrently per OpenCode project location; no hidden queue starts work later. Deep workers are separate from this two-run limit.

The panel and tools report only observed feedback: phase, file/review counts, bounded activity, optional Deep progress, model-reported worker dispatch, and optional estimated cost. Counts are phase-local, may be unknown, and do not establish a wall-clock ETA. Findings become available at completion. Raw reasoning, command arguments, credential details and raw tool output are not streamed.

Private per-run JSON records under the user's XDG state directory retain scan previews and terminal findings. The list shows the latest 50; files are not silently deleted. Start/terminal receipts, real SDK run IDs and phase changes persist; other live progress is checkpointed at most every 10 seconds. An unfinished record after another plugin instance ends is marked untracked, not completed or automatically resumed. Policy/validation operations currently remain memory-only. Reloading the plugin can cancel active work: finish or explicitly cancel runs before updating it.

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
