# Real SDK test procedure

Offline unit/host tests are the default. Never start inference just to validate a code change.

For a separately authorized real test, agree on the exact synthetic target, model/settings and estimated cost guard first. Confirm existing dedicated sign-in without copying credentials; do not silently switch accounts. Verify no existing scan is being duplicated, preserve its run ID, and monitor until terminal status. Do not edit/reload the live plugin while it runs. Inspect final status and saved SDK diagnostics before calling it completed; a budget stop is not a completed assessment. Never increase the budget or retry automatically.

The November 10, 2026 smoke test used Standard mode, gpt-5.6-sol/xhigh and a USD 1 estimated guard on one synthetic source file. It authenticated, reached discovery, then stopped at a USD 1.0344 baseline estimate (partial range USD 1.03–1.92, not a billing total). No completed findings were returned. The adapter now reports structured budget failures without exposing raw SDK diagnostics.
