# Add second-based jumps to movie review

## Why this matters

The user can skip through a movie during GIF capture without dragging the timeline or stepping through many frames. Playback jumps forward. Exact frame scrub jumps in the direction of the last manual scrub, by elapsed seconds rather than a number of frames. Top-row keys and visible controls work in both GIF Extraction and Refine Gif.

The signed-off behavior is in `docs/specs/jump-ahead-by-seconds-spec.md`. This plan follows `PLANS.md`. Work in the current Windows PowerShell checkout, preserve existing unrelated changes, and re-read the signed-off spec and current code before editing because the review and GIF files already have uncommitted work.

## Progress

- [x] (2026-10-07) Oriented in the current shared player, keyboard controller, review host, Electron bridge, and relevant tests; drafted this plan from the signed-off spec.
- [ ] Milestone 1: Add trusted time-based jump operations and prove the boundary behavior.
- [ ] Milestone 2: Add direction-aware player behavior, visible controls, and shortcuts.
- [ ] Milestone 3: Verify both complete workflows in Electron and update agent documentation.

Evidence logs: during execution, create `native-build/jump-by-seconds-evidence/` and save full command output plus exit codes there. Record each log path and result in this section. Keep generated media and traces outside Playwright's cleared `test-results` directory. These ignored artifacts are local evidence, not product files.

## Skill Gates

Planning-time gates:

- `plan-review`: check this plan against the signed-off spec, contradictions, holes, gate order, readability, and token use before sign-off and after substantive revisions.
- `working-with-users-and-team`, `impeccable`, `coding-quality.md`: preserve the agreed behavior and fit the compact shared transport to the existing UI.
- `api-and-interface-design`, `domain-modeling`, `typescript-coding`: keep the new commands narrow, put transient direction and selection state with the shared player, and use microsecond `bigint` values across the review boundary.
- `error-and-correctness-traps`, `testing-discipline`: plan serialization, cancellation, recoverable failures, boundary math, and tests that prove behavior rather than call counts.

Execution-time gates:

- `using-97`, `typescript-coding`, `writing-clean-code`, `api-and-interface-design`: before changing TypeScript, exported review contracts, and player methods.
- `before-you-refactor`: before restructuring existing transport command sequencing, if that becomes necessary.
- `error-and-correctness-traps`, `security-and-trust-boundaries`: before implementing asynchronous ordering and validating the new Electron command arguments.
- `testing-discipline`: before adding focused unit, bridge, integration, and Electron tests.
- `impeccable`: use its existing project context, read its UI edit floor before UI changes, inspect the finished player visually in a bounded pass, and run its detector once after the UI work.
- `doc-update`: update `docs/agent-docs/agent-architecture-map.md` if the new review commands or player ownership change durable orientation; do not broaden other architecture docs.
- `pre-commit-self-review` and `coding-quality.md`: review the final diff and adjacent code before claiming completion.

Unavailable skills or fallbacks: none identified. Recheck availability when execution starts. No subagent is needed for this bounded, cross-layer change.

## Surprises & Discoveries

- The current `BestSourceFrameReader.atTime(timestampUs)` already resolves an exact frame by elapsed time, but `IFrameReviewSession` exposes only `scrubToFrame(frameIndex)`. Evidence: `src/frame-review/host/bestsource-frame-reader.ts`, `src/frame-review/frame-review-api.ts`.
- `ReviewSession.seekPlayback(timestampUs)` takes an absolute time; the host can read its live playback status. Its loop-stop path pauses and clears the loop, so a jump from a running loop must explicitly restore ordinary playback after seeking. Evidence: `src/frame-review/host/review-session.ts`.
- GIF Extraction and Refine Gif mount one physical `FrameReviewPlayerControl` and activate one `GifWorkflowKeyboardController`. The player currently tracks playback, exact scrub, preview phase, and displayed frame, but not a scrub direction. Evidence: `src/ui/frame-review-player-control.ts`, both GIF screen files, and `docs/agent-docs/agent-architecture-map.md`.
- The existing generated CFR and VFR GIF fixtures each have 72 frames, so they cannot prove a full 5-, 7-, or 10-second jump before the end clamp. A separate longer movie is needed for those Electron observations. Evidence: `tests/fixtures/gif-extraction/manifest.json`.
- Many touched production and test files have pre-existing uncommitted edits, including the review host, bridge, player, screens, and loop-preview tests. Preserve them and inspect the live diff before each edit; do not reset or overwrite them. Evidence: `git status --short` on 2026-10-07.

## Decision Log

| ID | Decision | Rationale | Date |
|---|---|---|---|
| D1 | Keep the five durations and scrub direction as transient player state; initialize the selector to 2 seconds and direction to forward for each new movie. | One shared control spans both GIF screens, and the spec does not require disk persistence. | 2026-10-07 |
| D2 | Add one trusted relative playback jump and one trusted exact scrub-to-time operation to the review session boundary. | Playback needs an atomic live-clock sample; scrub needs a real indexed frame near a requested time. Existing absolute playback seek and ordinal scrub cannot provide both contracts safely. | 2026-10-07 |
| D3 | Serialize conflicting transport actions through the player, accumulate accepted jump intents, and let later direct transport actions supersede queued jumps. | Prevent old asynchronous completions from painting or seeking after newer user actions or a source change. | 2026-10-07 |
| D4 | Use the existing `BestSourceFrameReader.atTime` for interior exact targets, and explicitly choose frame zero or the final indexed frame at the movie boundaries. | Variable frame timing rules out frame-rate arithmetic; explicit endpoint selection handles a target equal to duration. | 2026-10-07 |
| D5 | Reuse the existing generated CFR and VFR movies for exact-frame and boundary checks, and generate one isolated 18-second CFR movie in the Electron test for unclamped 5-, 7-, and 10-second jumps. Verify media duration and native products before assertions. | The existing movies are too short to demonstrate all requested durations away from the end. | 2026-10-07 |

## Validation gates

| ID | Milestone | Proves | Needs milestones | How to check | Expected |
|---|---|---|---|---|---|
| G1 | 1 | The trusted boundary samples live playback time, clamps both ends, preserves playing or paused state, safely exits a loop, and resolves exact targets by time. | 1 | `npx vitest --run tests/unit/frame-review/review-session.spec.ts tests/unit/frame-review/frame-review-ipc.spec.ts tests/unit/frame-review/electron-frame-review-service.spec.ts`; `npm run typecheck` | Focused tests and typecheck exit 0. Tests include prepared and provisional playback, CFR/VFR exact times, start/end limits, running/paused loop, invalid wire values, and failure recovery. |
| G2 | 2 | Pointer and top-row keyboard paths share durations; scrub direction, 2-second default, accumulation, and supersession behave as specified. | 2 | `npx vitest --run tests/unit/frame-review-player-control.spec.ts tests/unit/gif-workflow-keyboard-controller.spec.ts tests/integration/ui/gif-extraction-screen.spec.ts tests/integration/ui/refine-gif-screen.spec.ts`; `npm run typecheck` | Focused tests and typecheck exit 0. Deferred responses prove no stale paint or mode change; visible labels, focus guards, and disabled states match the spec. |
| G3 | 3 | The user can perform jumps through the finished Electron workflows with real media and see the correct time, mode, and frame. | 3 | Verify native products and fixture identities, run `npm run build`, then `npx playwright test tests/e2e/gif-jump-by-seconds.spec.ts`; perform targeted manual QA in the running app. | The Electron test actually runs, does not skip, and exits 0. An 18-second source proves unclamped mappings; existing CFR/VFR sources prove exact-time and boundary cases. Playback stays playing; backward and forward scrub show exact frames near their target times; the control and both screens agree. Manual QA records observed controls, focus, loop exit, and any media timing limits. |
| G4 | 3 | The new behavior does not break the broader app or leave the agent map stale. | 3 | `npm run unit`; `npm run frame-review:test`; `npm run e2e`; `git diff --check`; review changed docs and code against `coding-quality.md`. | Complete outputs and exit codes are saved. Relevant suites pass, or any pre-existing failure is isolated with evidence rather than reported as a feature pass. The map accurately routes future agents to the new commands and control behavior. |

## Outcomes & Retrospective

Pending implementation. Record the user-visible result, G1–G4 evidence and log paths, exact-frame approximation observed on CFR/VFR media, any unresolved limitations, and whether existing dirty-worktree changes affected the verification baseline.

## Context and orientation

Start with `docs/agent-docs/agent-architecture-map.md`, then the signed-off spec and `coding-quality.md`. The renderer is framework-free TypeScript. `src/ui/gif-extraction-screen.ts` and `src/ui/refine-gif-screen.ts` reparent one `FrameReviewPlayerControl`; they activate `GifWorkflowKeyboardController` only while a GIF screen is active. The player owns transport, progress bar, displayed-frame identity, and exact-scrub state. `GifExtractionSession` owns the movie lease and capture queue; jumps must not mutate range data.

`IFrameReviewSession` in `src/frame-review/frame-review-api.ts` is the renderer-visible review contract. `ElectronFrameReviewService` in `src/adapters/electron/electron-frame-review-service.ts` translates it to command IPC. `electron/frame-review-ipc.cjs` validates allowed commands and values before invoking `ReviewSession` through `FrameReviewHost`. `ReviewSession` in `src/frame-review/host/review-session.ts` owns LibVLC playback, loop disarming, and exact BestSource lookup. `BestSourceFrameReader.atTime` already chooses an indexed exact frame for an elapsed microsecond time. `playbackDurationUs` and prepared-review duration/frame count are in the review state. A frame ordinal is its zero-based position in the exact index; exact frame times can be irregular, so do not calculate an ordinal from seconds or a slider ratio.

The existing progress bar is a playback-time slider during playback and an ordinal slider in exact scrub. `pressStep` handles the arrow keys and frame buttons; `previewProgress` and `commitProgress` handle slider input. `enterExactScrubAt` and `enterExactScrubAtFrame` handle endpoint navigation. Loop preview is a separate running/paused transport phase. Review these current methods and their tests at execution time; existing local changes may have altered them.

All work and checks use PowerShell syntax on Windows. The native media path is explicit: run `npm run frame-review:verify`; if products are missing, use the repository's `npm run frame-review:bootstrap` and `npm run frame-review:build` instructions before running Electron tests. Generated GIF fixtures are described by `tests/fixtures/gif-extraction/manifest.json` and produced by `tools/gif-extraction/create-fixtures.ps1`; verify the expected files rather than accepting a skipped Playwright test. The focused Electron test makes its own isolated 18-second CFR source with the resolved FFmpeg tool, checks its duration, and removes it with its temporary profile. Keep full test output and process exit codes in `native-build/jump-by-seconds-evidence/`, using BOM-free UTF-8 for any generated JSON.

## Milestone 1 - Trusted time operations

### Scope

Expose mode-specific jump operations through the existing review boundary, with real time lookup and safe loop exit. No UI is added yet.

### Changes

- File: `src/frame-review/frame-review-api.ts`
  Edit: add narrow `jumpPlaybackBy(deltaUs: bigint): Promise<bigint>` and `scrubToTime(timestampUs: bigint): Promise<IExactDisplayFrame>` methods to `IFrameReviewSession`. The first accepts a positive elapsed microsecond amount and returns the confirmed playback position after seeking; the second accepts a non-negative absolute target and returns an exact frame. Never display an optimistic requested time as a completed jump.
- Files: `src/frame-review/host/frame-review-host.ts`, `src/frame-review/host/review-session.ts`
  Edit: extend the host contract and implement both methods. Serialize the playback jump with existing playback/proxy operations, sample the live clock at execution time, clamp to known movie length, disarm any A–B loop safely, and preserve ordinary playing/paused state. For exact scrub, stop a paused preview, keep playback paused, clamp the target, use `atTime` for interior times, and explicitly use the first/last indexed frame at boundaries. Reject unsafe loop-stop or disabled-playback states with a recoverable error; do not alter captures. Avoid nesting `withPlayback` calls or using a stale displayed playback frame as the clock.
- Files: `electron/frame-review-ipc.cjs`, `src/adapters/electron/electron-frame-review-service.ts`
  Edit: allow only the two named commands, validate a positive playback delta of at most 10,000,000 microseconds and a non-negative signed-64-bit target time, parse the confirmed position and exact frame, and preserve opaque session IDs. The existing preload `command` channel can carry them; change `electron/preload.cjs` only if the current bridge requires it.
- Files: `tests/unit/frame-review/review-session.spec.ts`, `tests/unit/frame-review/frame-review-ipc.spec.ts`, `tests/unit/frame-review/electron-frame-review-service.spec.ts`
  Edit: cover the real command contract, live-clock sampling, play/pause retention, loop disarm and recovery, exact lookup, boundaries, malformed values, and source closure. Use controlled status and deferred calls to prove ordering. Keep a VFR time example where elapsed seconds and frame count differ.

### Validation

Gates: G1. Run the focused tests first and repair their specific failures; then run typecheck. Save full output and exit codes. Inspect the `atTime` result for both time directions before treating it as a satisfactory near-target frame.

### Rollback/Containment

Keep new commands isolated behind the existing session contract and allowlist. If time lookup or loop disarming fails, leave existing absolute seek and ordinal scrub behavior intact and record the concrete failure before adjusting this milestone.

## Milestone 2 - Shared player and shortcuts

### Scope

Add the control, digit shortcuts, remembered direction, and safe accumulation to both GIF screens through their shared player.

### Changes

- File: `src/ui/frame-review-player-control.ts`
  Edit: add the labeled selector and dynamic signed Jump button to the transport; default selection to 2 seconds. Keep selection across screen reparenting, and reset remembered direction on a new movie. Implement one public duration command used by pointer and keyboard. Track direction from frame-step intent and changed exact-position slider values only; preserve it across playback and GIF screen changes. In playback use the relative host command and continue or remain paused as appropriate; in exact scrub compute signed targets from the displayed exact frame's review time and use `scrubToTime`. Preserve exact capture identity and render the confirmed time. Make accepted rapid presses cumulative, serialize conflicting transport actions, and invalidate queued jump work on source/screen changes and later direct controls. Do not let stale results repaint or change mode. Keep error feedback in the existing player error surface.
- File: `src/ui/gif-workflow-keyboard-controller.ts`
  Edit: use physical `KeyboardEvent.code` values `Digit1`–`Digit5` for the five durations, excluding `Numpad` and modified/repeated or editable-target presses. Keep Space, arrows, and capture shortcuts unchanged; expose one narrow jump command in the player target interface.
- Files: `src/ui/gif-extraction-screen.ts`, `src/ui/refine-gif-screen.ts`
  Edit: list the five mappings and direction rule in each shortcut descriptor. Route both screens' active keyboard target to the shared player and provide source-replacement availability so both pointer and keyboard jump are disabled while a movie is opening. Maintain selected duration when a digit shortcut fires.
- File: `index.html`
  Edit: style the compact transport grouping and wrapping at narrow widths within the existing dark design. Keep native select focus, visible button text, and keyboard access; do not displace the movie viewport or capture actions.
- Files: `tests/unit/frame-review-player-control.spec.ts`, `tests/unit/gif-workflow-keyboard-controller.spec.ts`, `tests/integration/ui/gif-extraction-screen.spec.ts`, `tests/integration/ui/refine-gif-screen.spec.ts`
  Edit: cover initial selection, signed labels, both manual direction sources, default/reset/preservation, five key mappings, number-pad/modifier/editable guards, unavailable state, rapid jumps, direct-command supersession, screen/source replacement, and recoverable failures. Assert displayed time/mode/frame and accessible controls rather than private DOM layout or incidental request counts.

### Validation

Gates: G2. Run only the named focused tests during iteration, followed by typecheck. In the same pass, manually inspect a compact and wide layout and confirm the selector, action label, and existing transport are usable by pointer and keyboard.

### Rollback/Containment

The new control and key mappings sit behind one player command. If the transport ordering change reveals an unrelated issue, isolate its reproducible path and keep existing seek, step, and endpoint controls working while resolving it; do not remove capture behavior to make the new tests pass.

## Milestone 3 - Electron acceptance and documentation

### Scope

Prove the requested experience with real media in the running app, then leave durable architecture guidance accurate.

### Changes

- File: `tests/e2e/gif-jump-by-seconds.spec.ts`
  Edit: add focused Electron scenarios using the existing deterministic CFR and VFR media plus one temporary, isolated 18-second CFR movie created with the resolved FFmpeg binary. Check its duration before using it to prove all five unclamped mappings. Exercise a top-row jump during playback, a backward and forward exact-scrub jump, the pointer selector/button path, cumulative presses, movie boundary, loop-preview exit, and navigation between GIF Extraction and Refine Gif. Use semantic states and bounded waits. Ensure the suite executes rather than skips because a fixture or native product is missing.
- File: `docs/agent-docs/agent-architecture-map.md`
  Edit: add only the durable routing facts: shared player owns jump selection/direction/order; the review session owns live relative playback seek and time-to-exact-frame lookup. Update its verification date and links. If implementation preserves existing ownership without a durable new assumption, apply the `doc-update` threshold and record why no map edit was needed.
- File: `docs/plans/jump-by-seconds-exec-plan.md`
  Edit: keep Progress, discoveries, decisions, gates, and retrospective current with log paths and observed results.

### Validation

Gates: G3, G4. Verify native products and generated fixture identity first. Run build and the focused Electron test; inspect the actual GUI with one representative movie, including the paused/playing difference, visual direction cue, keyboard focus, and loop exit. Then run unit, native, and full Electron suites because the change crosses renderer, IPC, and host. Save complete outputs and exit codes. If an existing unrelated failure recurs, compare against the pre-change baseline and report it separately; never call a skipped Electron test a pass.

### Rollback/Containment

If final media behavior disagrees with the spec, return to the narrowest failing boundary and fix it before claiming completion. Preserve existing uncommitted work and the independent capture queue. Document any observed approximation of exact time without changing the signed-off behavior.

## Rejected alternatives

- R1: Convert scrub seconds to frame counts using nominal frame rate — rejected because exact frame times may be irregular; superseded by D2 and D4.
- R2: Calculate playback jumps from the last painted frame in the renderer — rejected because the painted frame can lag the live player clock; superseded by D2.
- R3: Add a second player or screen-specific jump state — rejected because both GIF screens already share one physical player; superseded by D1.
