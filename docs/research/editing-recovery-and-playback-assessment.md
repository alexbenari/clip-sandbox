# Editing recovery and playback assessment

2026-09-10. Authorized scope: fix the edit callback cleanup hazard now, then narrowly assess playback error reporting. Work stayed on master; no commit, new dependency, player implementation or general UI guideline change.

## Editing outcome

Goal: a callback exception must not permanently block subsequent edits, and a successful disk edit must not be misreported as a failed edit merely because updating the application failed.

`ZoomVideoEditWorkflow.run` puts running-state release and finishing notification in finally. It collects notification exceptions so a second exception in finishing does not mask the first. `VideoEditNotificationError` retains both exceptions and the original editor result; null means the editor never started. Dependencies/callbacks are private readonly. Application orchestration catches this error, reports a created-file partial success accurately, includes the filename in recovery guidance, and records the underlying error details. No automatic retry occurs.

Validation:
- Existing 3 workflow tests passed before edits.
- Regressions reproduced three stuck-running cases (started/created/failed callbacks), plus loss of the successful result/second exception. All 8 workflow tests now pass, including failure in onFinished and the ability to run again.
- App integration injects output-conversion failure, checks the partial-success message and allows a second edit to complete.
- `npm run unit`: 240 tests in 49 files passed. `npm run typecheck` (including strict source) and `npm run build` passed.
- New real Electron scenario runs actual Loopify, injects a failure only at the public output-conversion seam, verifies the created MP4 still exists, inspects the user-facing error, then verifies editing is available again. Passed. The first test attempt incorrectly tried to click Activity through the Zoom overlay; the test now exits Zoom using Escape, matching the product flow. No force-click workaround or production change was made for that test issue.
- Screenshot `test-results/edit-callback-recovery.png` visually inspected: the error says output was created, names the output file in recovery guidance, and preserves technical details.

Guaranteeing state release does not guarantee that an arbitrarily broken UI callback can redraw a functioning toolbar. The cleanup guarantee and preserved diagnostics let the caller recover; they do not silently suppress callback defects. The existing editor-exception-to-process-failed mapping remains unchanged.

## Playback assessment (before the approved reporting implementation)

Static inspection: grid preview startup catches both thrown and rejected play calls. Zoom catches rejected play calls. Grid metadata failure already writes diagnostics through the tracker/application adapter path; this is not equivalent to user-visible playback error reporting. Zoom has no equivalent media-error notification to the application.

A bounded actual-Electron probe loaded a damaged MP4 through Browse and opened it through the normal grid double-click. Observed: black/stopped Zoom preview, video paused=true, media error code 4, Activity showing only successful pipeline loading, and metadata failure present in err.log. This establishes a reachable user-visible gap; it does not establish frequency, nor justify reporting every interrupted preview attempt as an error.

Reproduction script: [playback-error-assessment.mjs](playback-error-assessment.mjs). Evidence: [JSON](playback-error-assessment.json), [screenshot](playback-error-assessment.png). Script creates an isolated temporary folder/profile and removes only its own temporary directory after closing Electron. Existing project build required.

The assessment proposed the following bounded implementation (completed below):
- Zoom owns handling for its active video; report failure through a semantic callback containing clip identity and error, never expose its media element.
- Ignore completion/rejection belonging to a closed or replaced video. Identify expected interruptions using owned lifetime/source state, rather than treating every rejection as a defect.
- Report a persistent failure for the explicitly opened clip once per active video/source. Multiple play attempts and the media error event must not create duplicate Activity entries.
- Preserve decoder/browser details in diagnostics and provide practical recovery guidance. Keep ordinary grid metadata diagnostics; avoid a new burst of Activity warnings from every background preview.
- Verify damaged media, genuine play rejection, duplicate signals and rapid close/reopen. Only the damaged-media path was reproduced in this assessment; the other cases are acceptance criteria, not claimed observations.

## Storage-path tradeoff

Future migration cost depends primarily on how many consumers adopt filesystem representation details, not on total app size. The current path contract is concentrated in a few edit/session/adapter modules, so a future change can remain contained. That is conditional: more consumers resolving paths themselves would increase migration cost. Revisit the boundary when a new feature would spread path knowledge, even before an alternative storage backend is implemented. A full storage framework is not required; one normalized edit input or adapter-owned resolution capability may suffice. This is the rationale for retaining C1 now, not a guarantee of cheap migration regardless of future design.

Governed by repository coding-quality, TypeScript, failing-test, API/interface, clean-code, error/lifecycle, observability, doc-update and self-review guidance. No delegation: the bounded fix and cross-boundary error semantics were cheaper to implement and verify directly than to brief and reintegrate a separate agent.


## Zoom playback reporting implemented (2026-09-10)

User authorized proceeding after the assessment. Acceptance goal: a failed explicitly opened Zoom clip produces one actionable Activity error and diagnostic, while closed/replaced/recovered attempts do not generate stale warnings.

Zoom owns a private attempt generation and one-report-per-video flag. Starting a newer attempt, clearing the video, or receiving a playing event invalidates earlier rejections. Media error events remain reportable after successful start. Cleanup detaches the active reference before pause/load, so teardown events cannot be attributed to a new clip. Reopening creates a fresh reporting lifetime. Suppression uses owned lifecycle state rather than blanket suppression of a browser exception name.

The application receives only clip ID, filename and error. It adds an Activity error naming the clip, gives close/reopen and file-check recovery guidance, and logs native decoder/browser details. Existing utility focus rules remain in force: the indicator changes while Zoom is open; the user can exit Zoom to inspect Activity. No automatic retry or new background-grid warning stream was added.

Verification:
- Baseline 8 Zoom tests passed. Three new regression cases initially failed because no failure notification was emitted. Tests now cover rejected playback, duplicate signals, stale video events, superseded attempts, recovered playback, decoder failure and reopening.
- 12 Zoom tests passed. Test promise flushing uses an event-loop turn so assertions do not race rejection delivery through the test mock.
- Full unit/integration suite: 244 tests in 49 files passed. Type checking (including strict source), build and scoped diff check passed.
- Three focused Electron scenarios passed: damaged-media reporting/rapid close-reopen, created-edit callback recovery, and natural fullscreen identity through Zoom.
- Actual damaged MP4 opened through Browse and double-click produces exactly one Activity error; err.log includes the Zoom failure. Five healthy close/reopen cycles produce no error entry. The captured [error presentation](zoom-playback-error.png) was visually inspected.

Repository design/self-review pass: no media element crosses the boundary; presentation lifecycle stays in Zoom; application diagnostics remain in orchestration. The existing seek-assignment catch and best-effort background grid play handling remain outside this targeted change. No claim of exhaustive browser error coverage or frequency measurement is made.
