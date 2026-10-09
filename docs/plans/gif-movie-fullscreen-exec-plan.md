# Add movie full screen review to the GIF workflows

## Why this matters

The signed-off behavior in `docs/specs/gif-movie-fullscreen-spec.md` lets a user inspect the current movie across the display, keep working with the existing GIF keys and seek bar, and return without losing playback or range state. This plan adds that view while keeping Collection's separate full screen grid behavior and the app's Activity error handling intact.

The user-visible goal is: in GIF Extraction, Queue Refine, and Collection-clip Refine, a prepared movie can enter true full screen and return with its current position and review state intact, while the temporary seek row and permitted shortcuts work as specified.

## Progress

- [x] Milestone 1: player-element true display full screen proved in Electron; Collection predicates isolated. Baseline focused suite 34/34 before edits; after M1, Collection E2E 11/11 passed. G1 evidence: `test-evidence/gif-movie-fullscreen/G1/host-geometry.json`, `before.png`, `during.png`, `after.png`.
- [x] Milestone 2: shared player full screen presentation, seek row, focus, rejection handling, and replacement barrier implemented. Focused player tests 32/32 and real Electron GIF flow passed. G3 crash probe evidence: `test-evidence/gif-movie-fullscreen/G3/native-crash-signal.json` and `crash-probe-steps.log`.
- [x] Milestone 3: GIF F/E/Escape keyboard route, full screen button, shortcut maps, utility closure, and both Refine contexts connected. Focused Electron cases for GIF Extraction, Queue Refine, and Collection-clip Refine passed 6/6.
- [x] Milestone 4: GIF Extraction and both Refine contexts verified with real media; the architecture map now distinguishes movie and Collection full screen. The targeted G5 Electron suite passed 7/7; a subsequent focused rerun also passed after adding loop-playback continuity assertions. Repo-wide G6 passed typecheck and 467/467 unit tests; its Electron suite passed 33/34, with the one saved-capture restart failure reproduced at the same assertion on unchanged HEAD `80d0eeb`.

Evidence: `test-evidence/gif-movie-fullscreen/gate-results.md` lists G1–G6 commands and outcomes, with images in `G1/`, native crash observations in `G3/`, and the full-suite baseline comparison in `G6/`. Playwright clears its `test-results/` output before each run; retained evidence is in the ignored folder. The real Electron checks cover spec A1–A9 as described under G5, with Activity error suppression additionally proved by the app integration test.

## Skill Gates

Planning-time gates:

- `plan-review`: review the feature spec during planning and this plan before sign-off; rerun after substantial revisions.
- `coding-quality.md`, `docs/agent-docs/agent-architecture-map.md`, `writing-clean-code`, and `api-and-interface-design`: govern the player, shell, adapter, and session boundaries recorded below.
- `error-and-correctness-traps`: govern rejected full screen requests and overlapping entry/exit operations.
- `testing-discipline`: governs behavior-level unit, integration, Electron, and manual checks. Test visible outcomes and state relationships rather than incidental pixels or call counts.
- `doc-update`: determines the smallest durable architecture-map change required for a distinct movie full screen mode.
- `impeccable`: governs the shared player's full-screen seek row, pointer hiding, and normal-view button in M2. Its project context was loaded during planning; apply its UI-edit quality floor and detector at execution.
- `cost-aware-delegation`: considered for execution; no delegation is planned because the mode ownership, UI, and verification are tightly coupled and need root integration judgment.

Execution-time gates:

- Before the Collection predicate refactor, apply `before-you-refactor`: read the affected code and tests, run the existing focused tests, state the narrow refactor goal, and keep changes incremental.
- Before TypeScript changes, apply `typescript-coding`, `writing-clean-code`, and `api-and-interface-design` to new or changed cross-module contracts; `coding-quality.md` wins on local naming and ownership.
- Before failure or asynchronous state changes, apply `error-and-correctness-traps`; every failed request and stale completion needs a visible, consistent outcome.
- Before new tests, apply `testing-discipline`; before completion, apply `pre-commit-self-review` and the goal-based verification rule in `AGENTS.md`.
- Before M2 UI edits, apply `impeccable`'s UI-edit quality floor; after those edits, run its detector once on the changed UI targets and record the result.
- For the architecture-map edit, apply `doc-update` and verify its links and freshness note.

Unavailable skills or fallbacks: none identified. Recheck availability if execution moves to another environment.

## Surprises & Discoveries

- Discovery: `src/app/app-controller.ts` sends every `fullscreenchange` to Collection's handler, and that handler applies grid slots, rotation, toolbar state, `body.fs-active`, and an exit rerender. The grid also receives a document-wide full screen predicate. This must be isolated before movie entry is wired.
  Evidence: `src/app/app-controller.ts` (`onFsChange`, grid construction) and `src/app/fullscreen-session.ts` (`onFsChange`).
- Discovery: Activity's error auto-open check is intentionally app-wide. Opening its panel during player-element full screen would hide the panel outside the full screen element and steal focus.
  Evidence: `src/app/app-controller.ts` (`requestPanelOpen`) and `src/ui/global-utility-coordinator.ts` (`open`).
- Discovery: GIF Extraction and Collection-clip Refine use separate `GifExtractionSession` instances, but both attach their review sessions to the same `FrameReviewPlayerControl`. That player's `attachSession()` also receives `null` during Refine preparation, so it is the common source-change boundary.
  Evidence: `src/app/app-controller.ts`, `src/ui/frame-review-player-control.ts`, and `src/ui/refine-gif-screen.ts`.
- Discovery: the player root is moved between screen hosts by `mount()`, while `attachSession()` resets time and frame state. Refine deactivation abandons its range. Entering movie full screen cannot use a shell screen transition or either player call.
  Evidence: `src/ui/frame-review-player-control.ts`, `src/ui/refine-gif-screen.ts`, `src/ui/application-shell-controller.ts`.
- Discovery: the real-media fixture and native player binary currently exist in this checkout; recheck before execution because they are generated or local artifacts.
  Evidence: `tests/fixtures/gif-extraction/generated/cfr-audio.mkv` and `native-build/frame-review/bin/libvlc_media_service.exe`.
- Discovery: the playback review proxy is limited to 960 px wide, and paused exact-frame previews default to at most 1280×720. Full screen enlarges those existing pictures, so softness on a large display is expected.
  Evidence: `src/frame-review/host/ffmpeg-proxy-creator.ts:15` and `src/app/gif-extraction-session.ts:121`.
- Discovery: after exact review becomes ready, a native playback failure may arrive as a separate error event while the session remains `exact-ready`. The player currently writes such events into error text, which movie full screen hides. A session state check alone cannot establish whether playback is still usable.
  Evidence: `src/frame-review/host/review-session.ts` (`publishState`, `emitError`) and `src/ui/frame-review-player-control.ts` (`onSessionEvent`).
- Execution finding to record in M2: whether a controlled native playback-helper crash produces an existing state change or error event that reliably identifies a dead session. If none does, record the missing signal here and leave it for separate work; `Escape` remains available to reveal the normal-workspace error.
- Execution finding: the injected player-element request made Electron fill the 1920×1080 display, while its normal host collapsed from 708.75 px to zero. The player now reserves host height for the transition. A synthetic Playwright Escape sometimes did not trigger Chromium's native exit; the renderer receives the key, so its GIF key handler supplies an explicit exit fallback. `fullscreenchange` remains authoritative for presentation and focus.
- Execution finding: killing the isolated `libvlc_media_service.exe` after exact readiness did not produce an immediate session state change or player error; the state stayed `exact-ready` with a blank error. Escape exited movie full screen. Sending a subsequent jump command stalled the probe, so an automatic crash exit cannot be implemented reliably within the existing contract. A terminal playback signal and post-crash command handling are separate work.

## Decision Log

| ID | Decision | Rationale | Date |
|---|---|---|---|
| D1 | Expose separate browser predicates for any full screen and a specific full screen element. Collection checks its document-root element; GIF checks the shared player root. On every full-screen entry, close any open global utility before routing `fullscreenchange` to its current or previous owner. Collection receives its exit but not GIF events. | Preserves the existing app-wide utility closure and suppression while preventing Collection side effects; implements spec D9 and D13. | 2026-10-09 |
| D2 | Keep movie full screen state, temporary seek-row visibility, focus restoration, and the normal-view button in `FrameReviewPlayerControl`; inject only narrow browser full screen capabilities. | That control already owns the single viewport, progress row, and transport in all three GIF contexts; implements spec D2–D5 and D7. | 2026-10-09 |
| D3 | Treat `fullscreenchange` and the identity of its active element as authoritative. Request and exit promises may reject or finish out of order; stale results cannot mark the mode active, clear a newer request, or change playback. | Avoids half-entered chrome and incorrect focus on browser exits or rejected requests; implements spec D6 and D10. | 2026-10-09 |
| D4 | Put `F` and the full screen `E` guard in the shared GIF keyboard controller. Allow plain, nonrepeating `F` from the Jump-by select, buttons, and other noneditable player targets before the usual select filter; retain the editable-target guard for text inputs, textareas, and contenteditable fields. Keep all other existing eligibility checks. | Both Refine contexts and Extraction share one key dispatcher while text fields must still accept typed `f`; implements spec D6–D7. | 2026-10-09 |
| D5 | On every different `attachSession()` value, including `null`, the shared player cancels pending movie full screen entry or starts exit, and defers painting the replacement while its root is `document.fullscreenElement`. The wait ends as soon as the root is no longer that element, even if no `fullscreenchange` event arrives; the replacement's first requested frame is then drawn, not discarded. A late successful entry exits immediately. If browser exit rejects, reconcile the actual full screen element; when still active, force the player element out of full screen and then continue with the new session. Never discard the chosen movie because exit failed. | One player boundary covers both application sessions, both source-opening paths, and Refine preparation; implements spec D12. | 2026-10-09 |
| D6 | Keep Activity auto-open suppressed for any full screen element; classify Collection zoom and menu guards separately from that app-wide check. | Preserves error history and player focus while maintaining Collection's interaction boundaries; implements spec D9 and D13. | 2026-10-09 |
| D7 | Call the browser's full screen request directly in the trusted `F` key or button click task, before any awaited work. Reconcile its eventual result through `fullscreenchange`. | Browser user activation can expire across an asynchronous boundary; implements spec D10 without turning a valid input into a rejected request. | 2026-10-09 |
| D8 | Exit movie full screen for session closure or loss of exact readiness, and for a session-ending playback failure only when an existing state change or error event reliably identifies it. During M2, trace a native-service crash to classify the signal. If none is reliable, record that in Surprises & Discoveries and leave a new terminal signal for separate work; `Escape` remains the exit. Do not treat every error, or `recoverable: false` by itself, as proof of a dead session. | Keeps the presentation change within the existing movie-playback contract and avoids ejecting the user for a passing seek error; implements spec D12/A7. | 2026-10-09 |
| D9 | Reserve the existing player host height while its root is lifted into HTML full screen; restore the prior inline minimum height on exit or rejection. Handle a delivered Escape key as a renderer fallback because synthetic Electron input did not consistently activate Chromium's native exit. | The G1 probe measured host collapse, and focused Electron testing showed the delivered key can leave the browser full screen. This preserves D6 and D12 without changing Collection mode. | 2026-10-09 |

## Validation gates

| ID | Milestone | Proves | Needs milestones | How to check | Expected |
|---|---:|---|---:|---|---|
| G1 | 1 | Browser feasibility and host-layout evidence needed for spec A1, A2, A7 | 1 | After `npm run build`, run `npx playwright test tests/e2e/gif-movie-fullscreen.spec.ts --grep "element full screen probe"` with the real exact-ready fixture. Record player-host geometry before/during/after, `document.fullscreenElement`, Electron `BrowserWindow.isFullScreen()`, and display/window bounds; inspect a desktop-level capture or the actual Electron window for native caption visibility, since a page screenshot omits window chrome. | The player root becomes `document.fullscreenElement`; the Electron window reports full screen, fills its display, and native caption buttons disappear. The probe records whether the host collapses or the return jumps. If true display entry fails, update the design and Decision Log before continuing. |
| G2 | 1 | Collection and app-wide predicate separation for spec A6, A9 | 1 | Run `npx vitest --run tests/unit/fullscreen-adapter.spec.ts tests/unit/fullscreen-session.spec.ts tests/integration/ui/clip-collection-grid-controller.spec.ts tests/integration/app/app-controller.spec.ts`, then `npm run build`, then `npx playwright test tests/e2e/scenarios.spec.ts tests/e2e/desktop-shell.spec.ts tests/e2e/fullscreen-identity.spec.ts`. | Collection entry/exit still removes/restores title-bar chrome and `fs-active` as before, using the M1 build. A player-root event does not start rotation, set `fs-active`, change the toolbar, or rerender the grid. An open global utility closes on either mode's entry, while Activity auto-open remains suppressed for any full screen. No skipped Collection full-screen scenario counts as a pass. |
| G3 | 2 | Player readiness, failure, focus, source handoff, overlay, and host layout for spec A1–A3, A5, A7 | 2 | Run `npx vitest --run tests/unit/frame-review-player-control.spec.ts tests/unit/frame-review/review-session.spec.ts`, then `npm run build`, then `npx playwright test tests/e2e/gif-movie-fullscreen.spec.ts --grep "element full screen probe"`. | Rejected/pending entry leaves normal chrome intact; attaching a different session or `null` during active or pending entry exits full screen and withholds replacement frames while the root is `document.fullscreenElement`. When that identity changes, painting resumes even without `fullscreenchange`, and the replacement's first requested frame appears rather than being discarded. Closure or loss of exact readiness exits to visible feedback; a reliably identified terminal error does too if the existing contract provides one. A recoverable seek error stays in full screen; without a reliable terminal signal, `Escape` still exits. A rejected exit still presents the replacement normally. The seek row reveals and hides correctly, focus returns to the root, and the Electron host returns without a visible jump. |
| G4 | 3 | Keyboard, source, and shell wiring for spec A4, A7–A9 | 3 | Run `npx vitest --run tests/unit/gif-workflow-keyboard-controller.spec.ts tests/integration/ui/gif-extraction-screen.spec.ts tests/integration/ui/refine-gif-screen.spec.ts tests/integration/app/app-controller.spec.ts`. | `F` works from a focused button or Jump-by select while text inputs, textareas, and contenteditable fields accept typed `f`. `E` is blocked only in movie full screen, held arrows release, both application sessions use the same player handoff, a previously open utility closes on movie entry, and Activity errors do not steal focus. |
| G5 | 4 | Actual Electron behavior for spec A1–A9 | 4 | Run `npm run build`, then `npx playwright test tests/e2e/gif-movie-fullscreen.spec.ts tests/e2e/collection-refine.spec.ts tests/e2e/fullscreen-identity.spec.ts tests/e2e/gif-exact-preview.spec.ts`; also inspect the running app with the real movie fixture. Check aspect ratio, black bars, coverage of the whole display, and absence of app chrome; do not grade sharpness. | Both GIF Refine contexts and Extraction retain position and mode; the full screen seek row, keyboard, Activity, panel, and Collection boundaries behave as specified. A recoverable seek error does not force exit. A controlled session-ending playback failure exits automatically if existing events reliably identify it; otherwise `Escape` reveals the error. The picture fits correctly even if its existing review resolution looks soft. A skipped real-media case is not a pass. |
| G6 | 4 | Repo-wide compatibility and documented ownership | 4 | Run `npm run typecheck`, `npm run unit`, and `npm run e2e`; verify architecture-map links and run `git diff --check`. | All required checks pass, the map names the new mode boundary, and no unrelated change is included. Investigate any pre-existing failure separately rather than treating it as proof of this feature. |

## Outcomes & Retrospective

The implemented mode meets the user-visible A1–A9 flow in the targeted real Electron checks: exact-ready gating, true display coverage, seek-row/pointer timing, keyboard operation and focus, independent Collection state, source replacement, and Activity suppression. `npm run typecheck` and `npm run unit` passed; G5 passed 7/7; `npm run e2e` passed 33/34. The sole failing saved-capture restart test also failed on the unchanged baseline commit, so it is tracked as a separate existing defect rather than attributed to movie full screen. The controlled native-helper crash produced no terminal session signal or immediate player error; Escape exited, but error feedback is only available if a later operation reports one. Add a reliable terminal playback signal and review post-crash command handling as separate work. Possible follow-up (b): if paused exact frames look too soft in real use, consider raising their preview-resolution limit in separate work; changing resolution limits is outside this feature.

## Context and orientation

Clip Sandbox is a Windows Electron app with a framework-free TypeScript renderer. `docs/agent-docs/agent-architecture-map.md` is the orientation entry point; `coding-quality.md` is the design authority. The signed-off feature spec is `docs/specs/gif-movie-fullscreen-spec.md`. Read those three files and this plan before editing.

The global shell (`src/ui/application-shell-controller.ts`) owns the active screen and folded side-panel states. `GifExtractionScreen` and the two `RefineGifScreen` instances mount the same `FrameReviewPlayerControl`; `GifWorkflowKeyboardController` handles GIF keys only while one of those screens is active. `GifExtractionSession` owns the source-bound review lease and range work. `FrameReviewPlayerControl` owns displayed time, exact-scrub state, playback controls, the canvas, and the one seek row. The Collection grid has a separate `FullscreenSession`. The browser adapter currently requests full screen on `document.documentElement` and reports only whether any element is full screen.

A **review lease** is the active session for one source movie's playback and exact frames. **Provenance** is the original-source and range information embedded in an extracted clip so Collection-clip Refine can find its movie again.

The existing CSS is in `index.html`. `.frame-review-player` is width-limited, `.frame-review-viewport` has a fixed 16:9 shape, and `.frame-review-progress-row` contains current time, a range input, and duration. Collection's `.fs-active` rules hide shell and dialog elements. `ApplicationEventController` forwards browser `fullscreenchange` and keyboard events to `AppController`. The GIF keyboard controller currently filters editable targets before reading keys, so `F` from the Jump-by dropdown requires an explicit early route.

The `isFullscreen()` calls in `src/app/app-controller.ts` have different meanings. The zoom and context-menu guards near `openZoomForClip`, `openZoomEditMenu`, and the grid context menu belong to Collection. Activity's `requestPanelOpen` guard belongs to the whole app. Audit every call during Milestone 1 rather than renaming a predicate mechanically. Grid layout guards in `src/ui/clip-collection-grid-controller.ts` receive a predicate from composition and must mean Collection review only.

## Milestone 1 - Prove element full screen and isolate mode identity

### Scope

Establish D1 before the movie mode can enter, including a small Electron platform probe for the player-root full screen layout. Preserve existing Collection behavior while routing its entry/exit only for Collection's element. This milestone delivers no GIF shortcut yet.

### Changes

- File: `.gitignore`
  Edit: verify the existing `test-evidence/` ignore entry remains in place; add it only if absent so each gate retains logs and captures outside Playwright's cleared `test-results/` folder.
- File: `src/adapters/browser/fullscreen-adapter.ts`
  Edit: add a narrow element-target request and element-identity query while preserving the existing any-full-screen query and Collection document-root request. Keep one browser/legacy fallback and explicit errors for rejected requests.
- Files: `src/app/app-controller.ts`, `src/app/fullscreen-session.ts`
  Edit: make Collection predicates and event dispatch specific to Collection's full screen element. Track which mode owned the prior full screen event so a Collection exit still restores it once. Keep the existing app-wide `utilities?.close(false)` step on movie as well as Collection entry, before owner-specific handling; an open Activity panel or shortcut map must close so focus can move to the player. Leave Activity's any-full-screen auto-open suppression in place. Classify the zoom and context-menu guards listed in Context; do not let a movie-root event trigger Collection's CSS, timer, toolbar, layout, zoom, or rerender.
- Files: `tests/unit/fullscreen-adapter.spec.ts`, `tests/unit/fullscreen-session.spec.ts`, `tests/integration/ui/clip-collection-grid-controller.spec.ts`, `tests/integration/app/app-controller.spec.ts`
  Edit: characterize existing Collection entry/exit before refactoring, then assert element identity, player-root event isolation, app-wide utility closure, and Activity suppression. Assert observable state, not private callback counts.
- File: `tests/e2e/gif-movie-fullscreen.spec.ts`
  Edit: add a bounded Electron platform probe in an isolated profile, reusing the launch/profile setup in `tests/e2e/desktop-shell.spec.ts`. Open `tests/fixtures/gif-extraction/generated/cfr-audio.mkv` through the existing `__testSetNextMoviePath` bridge and Open movie button; wait until the readiness text says `Exact review ready`. Inject a test-only button into the page with a click handler that calls `playerRoot.requestFullscreen()` synchronously, then click that button through Playwright. Assert `document.fullscreenElement` is the player root and Electron's `BrowserWindow.isFullScreen()` is true; compare window bounds with the containing display's bounds. Record player-host geometry before/during/after and inspect the actual window or a desktop-level capture for absence and restoration of native caption controls; then exit. Keep this as a narrow regression case or replace it with the final user flow once that flow covers the same fact.

### Validation

Gates: G1, G2. If the probe shows host collapse or a visible return jump, record the finding and the smallest proposed correction in the Decision Log for Milestone 2. The probe must not become an unreviewed change to the spec's visual behavior.

### Rollback/Containment

Keep adapter and predicate changes separate from movie presentation. If mode isolation regresses Collection, revert this milestone's changes and repair the narrow predicate contract before adding GIF entry.

## Milestone 2 - Build the shared movie full screen view

### Scope

Implement D2 and D3 in the shared player, including true display fit, one temporary seek row, focus, and reliable browser entry/exit. Keep the normal player's single review session and single seek bar.

### Changes

- File: `src/ui/frame-review-player-control.ts`
  Edit:
  - Accept narrow full screen capabilities. Expose readiness, toggle/exit, and `fullscreenchange` reconciliation; add a normal-view Full Screen button. Gate entry on an attached `exact-ready` session. Invoke the browser request synchronously from the key or click event before any `await` (D7).
  - Set active state and root focus only after the browser confirms the player element is full screen; focus the root again on exit. A rejected entry leaves normal presentation and original focus intact and reports failure through visible player feedback. Guard overlapping requests with a revision or equivalent ownership check. Full screen toggles themselves do not call `mount`, `attachSession`, `play`, `pause`, or seek.
  - On an independent `attachSession()` with a different value, apply D5: invalidate pending entry and old frames, request exit if active, and hold new-frame painting while the player root is `document.fullscreenElement`. The wait ends as soon as the root is no longer `document.fullscreenElement`; recheck that identity independently of `fullscreenchange` so a missing event cannot strand the replacement. Preserve the new session's first frame requested by `attachSession()` and draw it when the wait ends rather than dropping it. Exit a late successful entry immediately. If exit rejects because full screen already ended, continue. If the player root remains full screen, remove and reinsert that same element in its current host as a last-resort exit, reconcile the browser event, then show the new session. Never discard that session or create a second player.
  - Apply D8 when the current session closes or loses exact readiness. Also exit for a session-ending playback failure only if an existing state change or error event reliably identifies it, even if the state remains `exact-ready`. Keep full screen active for recoverable operation errors such as a failed seek; if there is no reliable terminal signal, preserve `Escape` as the exit to normal-view error feedback.
  - Make the existing current-time/range/duration row the temporary overlay. Ignore same-coordinate move events, retain the row on hover/drag, hide it and the pointer after 3 seconds away from the row, and release its focus when hidden or after drag. Clean timers on exit, session change, and destroy.
- File: `index.html`
  Edit: style the player root in `:fullscreen` to fill the display with a black contained canvas, hide all persistent player chrome, and position the existing progress row as one overlay. Reserve normal host geometry during browser lifting only if G1 proves it necessary. Do not reuse `.fs-active` or animate the seek row; reduced-motion users get the same immediate hide.
- File: `tests/unit/frame-review-player-control.spec.ts`
  Edit: add deterministic readiness, rejected/pending request, same-session readiness loss, recoverable seek error and any terminal error identifiable through existing events, focus, pointer movement, hover/drag, exact/playing mode preservation, and cleanup checks using a fake full screen environment and controlled timers. Test different-session and null attachment during active and pending entry, delayed/rejected exit, preservation of the new session, and absence of new-frame painting while the player is still full screen. Suppress `fullscreenchange` after changing the fake full-screen element and prove that the wait ends and the replacement's first requested frame is drawn. Test the single existing range input and its two labels.

### Validation

Before the player edit, use a focused fault-injection check that terminates the native playback helper after exact readiness and trace the result through `src/frame-review/host/review-session.ts`, the existing event transport, and `FrameReviewPlayerControl.onSessionEvent`. Record whether the player receives a state change, an identifiable terminal error event, or neither in `test-evidence/gif-movie-fullscreen/G3/` and Surprises & Discoveries. Use an existing reliable signal if present; otherwise leave signal creation for separate work and verify that `Escape` restores visible error feedback. Gates: G3. The second platform-probe run validates any layout correction in the real Electron window.

### Rollback/Containment

The mode is inside the player and remains disabled unless the exact session is ready. If browser entry is unreliable, preserve the normal player and do not wire `F` until the request state is corrected.

## Milestone 3 - Connect GIF commands and lifecycle

### Scope

Connect D4's keyboard rules and the D5/D6 player and app wiring across Extraction and both Refine contexts without changing their screen activation or range ownership.

### Changes

- Files: `src/ui/gif-workflow-keyboard-controller.ts`, `src/ui/gif-extraction-screen.ts`, `src/ui/refine-gif-screen.ts`
  Edit: route plain, nonrepeating `F` before the Jump-by select filter, including from that select and focused buttons, while preserving the editable-target guard for text inputs, textareas, and contenteditable fields; use the player command for both directions. In full screen, ignore `E` while keeping all other GIF eligibility rules. Add `F` and `Escape` to the screen shortcut maps. Release held-arrow state on each confirmed transition and return focus to the player root. Do not activate another shell screen for full screen.
- File: `src/app/app-controller.ts`
  Edit: route browser full screen changes to the movie player and Collection owner separately, while closing any open global utility on entry before owner handling and preserving Activity's app-wide auto-open suppression. Both `GifExtractionSession` instances continue to attach through the shared player. Keep source/queue/refinement state untouched by mere full screen entry or exit. Ensure screen changes, player disposal, and browser-initiated exits reconcile without stale timers or focus changes.
- Files: `tests/unit/gif-workflow-keyboard-controller.spec.ts`, `tests/integration/ui/gif-extraction-screen.spec.ts`, `tests/integration/ui/refine-gif-screen.spec.ts`, `tests/integration/app/app-controller.spec.ts`
  Edit: prove the relevant spec A4, A5, A7–A9 cases, including no-session Collection-clip Refine, `E` blocked only while movie full screen, dropdown/button focus before `F`, normal typing of `f` in editable fields, browser exit, held arrow release, closure of an already open global utility on entry, both application sessions using the same player, and an Activity error that stays recorded without opening its panel.

### Validation

Gates: G4. Confirm both source-opening paths reach the shared player and a cancelled picker selection does not trigger a player attachment or full screen exit.

### Rollback/Containment

If session replacement or keyboard routing regresses, revert the incomplete integration to the prior normal player behavior and repair the narrow boundary before final QA.

## Milestone 4 - Verify the user flow and update orientation

### Scope

Complete the spec's observable acceptance behavior in the running app, prove Collection compatibility, and document the durable mode boundary.

### Changes

- File: `tests/e2e/gif-movie-fullscreen.spec.ts`
  Edit: expand the probe into focused Electron scenarios with an isolated profile and the existing real movie fixture. Reuse the proven provenance and isolated-pipeline setup in `tests/e2e/collection-refine.spec.ts` to reach Collection-clip Refine; do not invent a shortcut into that screen. Cover ready versus unready entry, `F` and browser `Escape` exit, playback/exact/loop continuity, one seek row with labels, pointer timeout and stationary pointer, focus and shortcuts, `E` suppression, source replacement, recoverable seek error, Activity error visibility after exit, panel folds, and Collection side effects. For a controlled terminal failure, assert automatic exit only if M2 found an existing reliable signal; otherwise assert that `Escape` reveals the error. Split slow preparation and interaction scenarios so each has one bounded outcome.
- Files: `tests/e2e/fullscreen-identity.spec.ts`, `tests/e2e/gif-exact-preview.spec.ts`
  Edit only if a directly related existing assertion needs an update; otherwise run them unchanged as regression coverage.
- File: `docs/agent-docs/agent-architecture-map.md`
  Edit: name the movie full screen ownership and route separately from Collection, while keeping the map compact. Update its verification date and links under `doc-update`.

### Validation

Gates: G5, G6. In manual QA, use a real movie in GIF Extraction, Queue Refine, and Collection-clip Refine. Check normal, full screen, and return views; confirm aspect ratio, black bars, coverage of the whole display, and absence of app chrome without treating expected softness as a failure. Compare the current frame/time and playing or loop state; inspect the bar while dragging and after three idle seconds. Confirm that a recoverable seek error does not force exit; for a controlled terminal playback failure, confirm automatic exit only if M2 found an existing reliable signal, otherwise confirm `Escape` reveals the error. Check the Activity indicator after exit. Use screenshots or a short recording for the layout and focus-dependent cases. A unit pass or skipped native-media test cannot substitute for this check.

### Rollback/Containment

If real-app behavior disagrees with the spec, repair that behavior and rerun its focused and regression gates. Do not mark the milestone or feature complete based on implementation evidence alone.

## Rejected alternatives

- R1: Route all browser full screen events through Collection's session — rejected because player full screen would trigger grid and toolbar side effects; superseded by D1.
- R2: Recreate the movie player in a separate shell screen — rejected because activation and refinement teardown would lose position or staged state; superseded by D2.
- R3: Add a second full screen seek slider — rejected because it could diverge from the normal player's playback and exact-scrub semantics; superseded by D2.
- R4: Add an application-layer before-replacement callback to both GIF session instances — rejected because it would put player presentation knowledge into both source workflows when the shared player already sees every attachment; superseded by D5.
- R5: Treat every `isFullscreen()` check as Collection-only — rejected because Activity auto-open must stay suppressed in any full screen mode; superseded by D1 and D6.
- R6: Extend the native playback and IPC contracts solely to detect a rare crash for this view — rejected for this feature because it expands the movie-playback service contract; if needed, pursue it as separate work under D8.
