# Split GifExtractionSession by Responsibility

Spec: `docs/specs/gif-extraction-session-split-spec.md`. Decisions D1-D11 below are the spec's decisions, cited by the same IDs. Plan-only decisions start at D12.

## Why this matters

The GIF Extraction screen, the Refine Gif screen, the Clips panel and Collection Refine all run on one application class, `GifExtractionSession` (`src/app/gif-extraction-session.ts`, about 990 lines). It opens the movie, keeps the capture queue, saves and restores it, keeps thumbnails, runs refinement and runs extraction. A second instance of it, switched by a mode, runs Collection Refine. Any change to one of these jobs means reading and testing all of them.

Two problems also come from this shape:

- refining a collection clip builds a fake saved-capture record;
- callers must remember to check saved frames before locking a restored draft or refining a restored range.

After this work, each job has its own small class, Collection Refine has its own session, and both problems are gone. Users see no change.

## Progress

- [ ] M1 Characterization tests and the cause of the failing saved-capture removal test
- [ ] M2 `GifSessionStatus` and `CurrentMovie`
- [ ] M3 `RangeExtraction`
- [ ] M4 `CaptureQueue` and capture storage
- [ ] M5 `RangeRefinement`, with locking and refinement checking saved frames themselves
- [ ] M6 `CollectionClipRefinementSession`, the one-range domain factory, and narrow UI interfaces
- [ ] M7 Documentation, end-to-end specs and checks in the running app

Evidence logs: `test-evidence/gif-extraction-session-split/` (one log per gate, named after the gate ID, for example `G8-e2e.log`). The pre-commit hook runs the unit and integration tests on every commit; its saved output counts as the `npx vitest run` part of gates G3-G7. The G9 probes reuse the end-to-end fixtures and helpers under `tests/e2e/`.

## Skill Gates

Planning-time gates:

- plan-review: run on the spec and on this plan before the sign-off request.
- before-you-refactor: shaped the plan. It requires characterization tests first (M1), one part per commit (D11), and naming the coupling hotspots up front: the snapshot assembly, the status message, the preview revision, and the movie replacement order.
- api-and-interface-design: two session classes rather than a mode flag (D8); asynchronous lock and refinement start, so a caller cannot skip the saved-frame check (D6); narrow UI interfaces (D4).
- domain-modeling: the one-range factory on the range capture model (D7).
- `coding-quality.md` and `ui-coding-quality.md`: roles, dependency direction, naming (D9).

Execution-time gates:

- before-you-refactor: rerun its checklist at the start of each milestone M2-M6.
- testing-discipline: every new test in M1-M6.
- typescript-coding and writing-clean-code: every new class.
- api-and-interface-design: the changed `lockRange` and `beginRefinement` signatures (M5) and the narrow UI interfaces (M6).
- domain-modeling: the factory in M6.
- doc-update: M7.
- pre-commit-self-review: before each milestone commit.
- cost-aware-delegation: no delegation is planned. The work is cross-cutting refactoring that the guidance keeps with the root agent.

Unavailable skills or fallbacks:

- none.

## Surprises & Discoveries

- Discovery: the end-to-end test "a saved capture can be removed when its source movie is unavailable" fails at its first check after restart: the saved range never appears. It fails on `master` and on every branch of this work.
  Evidence: `tests/e2e/gif-extraction-output.spec.ts:129`; `test-evidence/gif-session-boundaries/e2e-small-fixes.log`.

## Decision Log

| ID | Decision | Rationale | Date |
|---|---|---|---|
| D12 | Parts report changes through `GifSessionStatus` (D2) instead of their own change callbacks. `GifCaptureThumbnailSession`'s existing `onChanged` callback is pointed at `GifSessionStatus`. | One publisher, no new callback chains. | 2026-10-16 |
| D13 | Until M6, `GifExtractionSession` keeps its public methods and snapshot unchanged and delegates to the new parts. The screens, the panel and the workflows change only in M5 (D6) and M6 (D4, D8). | Keeps M2-M4 inside the application layer and each commit small. | 2026-10-16 |
| D14 | Each extracted part gets its own unit test file, `tests/unit/<part-file-name>.spec.ts`. Tests that drive `GifExtractionSession` as a whole stay where they are. They change only in how the session is built (M4, D18; M6, D8) and where they await the asynchronous lock and refinement start (M5, D6). | Proves each part on its own while the existing tests prove the whole. | 2026-10-16 |
| D15 | If M1 finds that the failing removal test is caused by a product bug, the cause is recorded, the user is told, and the fix is a separate commit before M2 only if the user agrees. A test bug is fixed in M1. | The refactor must not hide or silently fix an unrelated bug. | 2026-10-16 |
| D16 | The session drives a movie replacement through calls to `CurrentMovie`: open a candidate movie, run the replacement steps in today's order, then switch to it. It reports two things that need no answer as events: `exactCaptureReady` and `reviewEnded` (failed or closed). | Replacement steps must finish before the switch, so they are calls the session owns; readiness and failure need no reply, so they are events. No part calls back into the session. | 2026-10-16 |
| D17 | `RangeExtraction` reports a change in any range's extraction state as an `extractionStateChanged` event, which the session answers by saving the queue. `CaptureQueue` reads extraction state only through the narrow query in spec section 4. | Avoids a cycle between the queue and extraction. | 2026-10-16 |
| D18 | `GifExtractionSession` receives its capture storage from the composition root. `AppController` builds `SavedCaptureStorage` from the capture store; the default is `UnsavedCaptureStorage`. | The session then never checks whether a store was given (spec D5). | 2026-10-16 |

## Validation gates

| ID | Milestone | Proves | Needs milestones | How to check | Expected |
|---|---|---|---|---|---|
| G1 | 1 | Today's behavior of the uncovered paths is recorded | 1 | `npx vitest run tests/unit/gif-extraction-session.spec.ts` on the code before any part moves | All cases listed in M1 pass |
| G2 | 1 | The removal test's failure is understood | 1 | Cause recorded in `Surprises & Discoveries`, with the probe or log that shows it | A named cause, and D15 applied |
| G3 | 2 | Movie opening and replacement behave as before | 2 | `npm run typecheck`, then `npx vitest run` | All pass, including the new `current-movie.spec.ts` and the unchanged session tests |
| G4 | 3 | Extraction and its reporting behave as before | 3 | `npm run typecheck`, then `npx vitest run` | All pass, including the new `range-extraction.spec.ts` |
| G5 | 4 | Capturing, removing, saving and restoring behave as before | 4 | `npm run typecheck`, then `npx vitest run` | All pass, including `capture-queue.spec.ts` and the storage tests; `git grep -n captureStore -- src/app/gif-extraction-session.ts` finds nothing |
| G6 | 5 | A restored draft locks and a restored range refines without any caller-side check | 5 | `npx vitest run tests/unit tests/integration` | New tests pass: locking a draft with saved endpoints checks them and locks; refining a saved range checks it and starts; a mismatch reports today's message. `git grep -n -E "prepareSavedDraft|prepareSavedRange" -- src/ui src/app/gif-range-refinement-workflow.ts` finds nothing |
| G7 | 6 | Collection Refine runs on its own session without saved-capture code | 6 | `npm run typecheck`, then `npx vitest run` | All pass, including `collection-clip-refinement-session.spec.ts` and the domain factory test; `git grep -n "GifExtractionSession\.for" -- src tests` finds nothing; `git grep -n fromSavedData -- src/app/collection-clip-refinement-session.ts` finds nothing |
| G8 | 7 | The GIF workflows still work end to end | 6 | `npm run e2e -- tests/e2e/collection-refine.spec.ts tests/e2e/gif-exact-preview.spec.ts tests/e2e/gif-extraction-output.spec.ts tests/e2e/gif-extraction-shell.spec.ts tests/e2e/gif-jump-by-seconds.spec.ts tests/e2e/gif-movie-fullscreen.spec.ts tests/e2e/gif-resume-after-capture.spec.ts tests/e2e/gif-startup-empty.spec.ts` | All pass, apart from any failure G2 attributed to a cause outside this work |
| G9 | 7 | The spec's acceptance checks hold in the running app | 6 | Temporary Playwright probes against the built Electron app, one per item of spec section 5.3, archived under the evidence folder | Each probe's observations match a run of the same probe on the commit before M2 |
| G10 | 7 | The split met its size and purity limits | 6 | `(Get-Content <file>).Count` for each new class and both sessions; `git grep -n -w -E "mode|captureStore" -- src/app/gif-extraction-session.ts src/app/collection-clip-refinement-session.ts` | No class over about 350 lines; the search finds nothing |
| G11 | 7 | The architecture map describes the new parts | 7 | Read `docs/agent-docs/agent-architecture-map.md` entries for the GIF session and its parts; every linked file exists | Accurate, with links that resolve |

## Outcomes & Retrospective

To be written at completion.

## Context and orientation

Key files:

- `src/app/gif-extraction-session.ts`: the class being split. Its snapshot type `IGifExtractionSessionSnapshot` is what the GIF screens and the Clips panel read. It publishes a new snapshot to subscribers after every change.
- `src/app/refine-gif-session.ts`: `RefineGifSession`, the draft of one range being refined. It calls back into its owner through `IRefineGifSessionOwner` (commit, change notification, current source generation, next inexact range, exact endpoint from the displayed frame).
- `src/app/clip-extraction-workflow.ts`: `ClipExtractionWorkflow`, which runs extraction batches and tracks each range's extraction state.
- `src/app/saved-capture-queue-persistence.ts`: `SavedCaptureQueuePersistence`, which writes a movie's queue to the capture store and detects a changed movie (stale captures).
- `src/app/gif-capture-thumbnail-session.ts`: `GifCaptureThumbnailSession`, which keeps the start thumbnail of the draft and each range.
- `src/app/extraction-destination-session.ts`: where extracted clips are written and published.
- `src/domain/range-capture-model.ts`: `RangeCaptureModel`, the domain model of the draft and locked ranges.
- UI consumers: `src/ui/gif-extraction-screen.ts`, `src/ui/refine-gif-screen.ts`, `src/ui/gif-ranges-panel-control.ts`.
- Workflow consumers: `src/app/gif-range-refinement-workflow.ts`, `src/app/collection-refinement-workflow.ts`, `src/app/refine-screen-leave-policy.ts`.
- Composition: `src/app/app-controller.ts` builds both sessions (today through `GifExtractionSession.forMovieCapture` and `forCollectionRefinement`).

Terms:

- Source generation: a counter that increases each time a different movie is opened. Results computed for an older generation are ignored.
- Preview revision: a counter the screens compare to notice that the range being previewed changed, so they can stop a running loop preview.
- Saved endpoint: a capture endpoint restored from disk. It holds a frame number and a hash; it must be checked against the reopened movie before it can be used as an exact frame.

Commands: `npm run typecheck` (two TypeScript configurations), `npx vitest run` (unit and integration), `npm run e2e -- <spec files>` (rebuilds, then runs Electron end-to-end specs). The pre-commit hook runs the unit and integration tests.

## Milestone 1 - Characterization tests and the failing removal test

### Scope

Record today's behavior where tests do not reach it (D10), and find why the saved-capture removal end-to-end test fails.

### Changes

- File: `tests/unit/gif-extraction-session.spec.ts`
  Edit: add tests that drive a real `GifExtractionSession` with fakes of the frame-review service, thumbnail service, capture store and extraction service. Skip any case an existing test already proves, and record which test proves it in `Progress`. Cases:
  1. Restoring a changed movie (stale result) keeps the saved ranges listed, sets "The saved movie changed. Use Open movie to locate the original captures.", rejects capture with "Open movie to find the original source before capturing.", and still allows removing a saved range.
  2. Restoring two ranges and a draft reports "Restored 2 saved ranges and a draft." and stops showing capture loading.
  3. When saved start thumbnails cannot be recreated, one failure is reported with the count.
  4. Without a capture store, a range can be removed while the movie is open and not while a movie is opening.
  5. Checking a saved range against a movie whose frames differ marks it stale, reports "Saved frames no longer match this movie. Reopen the original movie.", and starting its refinement afterwards is rejected with the stale message.
  6. Checking a saved draft whose frames differ reports "Saved draft frames no longer match this movie. Mark new endpoints before locking."
  7. Extraction outcomes: a partly failed batch shows "Some clips need attention" and reports a failure; a cancelled batch reports "Extraction stopped. Completed clips were saved."; a provenance warning is reported once across two runs.
  8. Extract all checks saved ranges first, then extracts every ready range.
  9. With a destination set, a range whose refinement is in progress and not yet committed cannot be extracted.
  10. Preview target: two exact draft endpoints give a draft target; selecting a locked range gives a locked target and advances the preview revision; selecting the same range again does not.
  11. Capture is refused with "Wait for the movie to finish opening." while opening, and "Saved captures are still loading." while restoring.
  12. Changing the extraction destination during a batch is refused with "Wait for the current extraction to finish."
  13. Disposing saves the queue, cancels extraction, disposes the movie and the thumbnails, and publishes nothing afterwards.
- File: none, or the failing end-to-end test only.
  Edit: run `tests/e2e/gif-extraction-output.spec.ts` with a temporary probe that logs the restore steps (attach result, restored range count, panel contents). Archive the probe under the evidence folder. Record the cause. Apply D15.

### Validation

Gates: G1, G2. Run G1 on the code as it is before M2; these tests must pass without any source change.

### Rollback/Containment

Tests only. If a case cannot be expressed against today's public methods, record that in `Surprises & Discoveries` and cover it in the part's own tests in a later milestone instead.

## Milestone 2 - GifSessionStatus and CurrentMovie

### Scope

Move the status line, the preview revision and everything about the opened movie out of `GifExtractionSession` (D1, D2, D12, D13).

### Changes

- File: `src/app/gif-session-status.ts` (new)
  Edit: `GifSessionStatus` holds the message and the preview revision. It has `show(message)`, `advancePreview()` and a single `changed` notification that `GifExtractionSession` subscribes to and answers by publishing.
- File: `src/app/current-movie.ts` (new)
  Edit: `CurrentMovie` takes the frame-review service, preview bounds, `GifSessionStatus` and the reporter. It moves in:
  - `openMovie` and `openCollectionSource`;
  - the lifecycle and `opening` state;
  - source, review, review state and source generation;
  - `subscribeToReview`, `preparationProgressMessage` and `announceExactReadiness`;
  - `restoreOpenLifecycle`;
  - disposing the previous review after a replacement.
  
  Following D16, it offers `chooseSource`, `openCandidate(source)` and `switchTo(source, candidate)`, and it emits `exactCaptureReady` and `reviewEnded`. The session's `openMovie` and `openCollectionSource` run today's replacement steps between `openCandidate` and `switchTo`, then dispose the previous movie. Until M4 moves the restore steps, the session itself answers `exactCaptureReady` and `reviewEnded` by starting and stopping the restore.
- File: `src/app/gif-extraction-session.ts`
  Edit: build `GifSessionStatus` and `CurrentMovie`; delegate the moved members; keep public methods and the snapshot unchanged (D13).
- File: `tests/unit/current-movie.spec.ts` (new)
  Edit: opening by picker (cancel, success, failure), opening a given source, readiness and cache-reuse announcements, progress messages, and the previous movie disposed only after the replacement opens.

### Validation

Gates: G3.

### Rollback/Containment

Revert the milestone commit. No consumer outside `src/app/gif-extraction-session.ts` changes.

## Milestone 3 - RangeExtraction

### Scope

Move extraction and its reporting out of the session (D1).

### Changes

- File: `src/app/range-extraction.ts` (new)
  Edit: `RangeExtraction` takes the extraction service, the destination, the publication listener, the reporter, the activity log, diagnostics and `GifSessionStatus`. It moves in:
  - `ClipExtractionWorkflow` creation per movie, and the activity log entries;
  - `runExtraction`, with the reported outcome and provenance warnings;
  - `setExtractionDestination`, `cancelExtraction` and `retryExtractionPublication`;
  - the extraction-state lookups.
  
  `extractOne(range, movie)` and `extractAll(ranges, movie)` receive the ranges and the movie (source handle, review id, generation, name) from the caller. It emits `extractionStateChanged` (D17), which the session answers by saving the queue. It also offers the narrow query `CaptureQueue` will use: whether a range is completed and whether a running extraction holds it.
- File: `src/app/gif-extraction-session.ts`
  Edit: `canExtractRange`, `extractRange` and `extractAll` keep their checks and the saved-range check, and call `RangeExtraction`.
- File: `tests/unit/range-extraction.spec.ts` (new)
  Edit: outcome reporting (complete, cancelled, partly failed), the warning reported once, destination change refused during a batch, publication retry.

### Validation

Gates: G4.

### Rollback/Containment

Revert the milestone commit.

## Milestone 4 - CaptureQueue and capture storage

### Scope

Move the queue, thumbnails, saved-frame checks, saving and restoring out of the session, and replace the optional-store checks with storage polymorphism (D1, D5).

### Changes

- File: `src/app/capture-storage.ts` (new)
  Edit: interface `ICaptureStorage` with these members:
  - `attach(reviewId, expectedFingerprint)`, returning the restored model, a stale result or nothing;
  - `save(model, completedRangeIds)`, `forgetRange`, `markStale` and `isStale`;
  - `hasStaleRanges`, `restoring` and `loading`;
  - `canRemoveCaptures(movieOpen)`, which answers D5's rule.
  
  Two classes implement it. `SavedCaptureStorage` wraps `SavedCaptureQueuePersistence` and today's restore steps. `UnsavedCaptureStorage` writes nothing, restores nothing, and allows removal only while the movie is open.
- File: `src/app/capture-queue.ts` (new)
  Edit: `CaptureQueue` takes `CurrentMovie`, `GifSessionStatus`, the thumbnail service, the storage, and `RangeExtraction`'s narrow query. It moves in:
  - the range capture model and the selected range;
  - marking start and end, locking, selecting, removing a range and discarding the draft;
  - `prepareSavedDraft` and `prepareSavedRange`;
  - `retryThumbnail`;
  - restoring captures and their thumbnails;
  - saving the queue, and `captureUnavailable`;
  - `GifCaptureThumbnailSession`.
- File: `src/app/gif-extraction-session.ts`
  Edit: take a `captureStorage` option (D18) and build `CaptureQueue` with it; delegate; keep the snapshot unchanged. The `captureStore` option, the `capturesRemovable` method and every check on the store go away. `CaptureQueue` subscribes to `CurrentMovie`'s `exactCaptureReady` and `reviewEnded` events to start and stop restoring.
- Files: `src/app/app-controller.ts`, and the session tests that pass a capture store
  Edit: pass `new SavedCaptureStorage(captureStore, ...)` instead of the store.
- Files: `tests/unit/capture-queue.spec.ts`, `tests/unit/capture-storage.spec.ts` (new)
  Edit: queue operations; restore (attached, stale, failed); removal rules for both storages.

### Validation

Gates: G5.

### Rollback/Containment

Revert the milestone commit. If the restore steps cannot move without changing their order, keep them in the session for this milestone, record why, and move them in M6.

## Milestone 5 - RangeRefinement, with locking and refinement checking saved frames

### Scope

Move refinement out of the session, and make locking and starting a refinement check saved frames themselves (D1, D6).

### Changes

- File: `src/app/range-refinement.ts` (new)
  Edit: `RangeRefinement` implements `IRefineGifSessionOwner`. It takes `CaptureQueue`, `RangeExtraction`, `CurrentMovie` and `GifSessionStatus`. It moves in:
  - `beginRefinement`, `abandonRefinement`, `commitRefinement` and `nextInexactRangeId`;
  - `refinementChanged`, `currentSourceGeneration` and `exactEndpointFromDisplayedCapture`;
  - the active refinement and its last seen revision.
  
  `beginRefinement(rangeId)` becomes asynchronous. For a saved range it first runs `CaptureQueue.prepareSavedRange` and stops if the movie or the range changed meanwhile.
- File: `src/app/capture-queue.ts`
  Edit: `lockRange()` becomes asynchronous and first runs `prepareSavedDraft` when the draft has saved endpoints.
- File: `src/app/gif-extraction-session.ts`
  Edit: delegate to `RangeRefinement`; `lockRange` and `beginRefinement` return promises.
- File: `src/ui/gif-extraction-screen.ts`
  Edit: `lockRangeAsync` drops its own saved-endpoint check and awaits `session.lockRange()`, keeping the preview-revision and generation guards around the await.
- File: `src/app/gif-range-refinement-workflow.ts`
  Edit: `refine` awaits `beginRefinement` and drops `prepareSavedRange`; its revision guard stays.
- Files: `src/ui/refine-gif-screen.ts`, `src/app/collection-refinement-workflow.ts`
  Edit: await, or explicitly ignore with `void`, the now asynchronous `beginRefinement`.
- Files: `tests/unit/range-refinement.spec.ts` (new); `tests/unit/refine-gif-session.spec.ts`, `tests/unit/gif-range-refinement-workflow.spec.ts` if present, `tests/integration/ui/gif-extraction-screen.spec.ts`
  Edit: await the new promises; add the G6 cases.

### Validation

Gates: G6.

### Rollback/Containment

Revert the milestone commit. The asynchronous signature change is contained in this commit.

## Milestone 6 - CollectionClipRefinementSession, the domain factory and narrow UI interfaces

### Scope

Give Collection Refine its own session, create its range with a domain factory, and make the UI depend on narrow interfaces (D4, D7, D8).

### Changes

- File: `src/domain/range-capture-model.ts`
  Edit: add a static factory that creates a model holding one exact range from a start and end frame identity and a source generation, with range id 1. Add a domain test in `tests/unit/range-capture-model.spec.ts`.
- File: `src/app/collection-clip-refinement-session.ts` (new)
  Edit: `CollectionClipRefinementSession` builds `GifSessionStatus`, `CurrentMovie`, `CaptureQueue` with `UnsavedCaptureStorage`, `RangeExtraction` and `RangeRefinement`. It offers what Collection Refine uses today:
  - `openCollectionSource`, `importCollectionRange` and `setExtractionDestination`;
  - `beginRefinement`, `abandonRefinement` and `cancelExtraction`;
  - `canExtractRange` and `extractRange`;
  - `snapshot`, `subscribe`, `reviewSession`, `refinementSession` and `dispose`.
  
  `importCollectionRange` waits for exact readiness, checks the frame hashes, and seeds the queue through the new factory.
- File: `src/app/gif-extraction-session.ts`
  Edit: remove `forMovieCapture`, `forCollectionRefinement`, the mode, `openCollectionSource` and `importCollectionRange`. The constructor becomes public again and serves GIF Extraction only.
- Files: `src/ui/gif-extraction-screen.ts`, `src/ui/refine-gif-screen.ts`, `src/ui/gif-ranges-panel-control.ts`
  Edit: each declares a narrow interface of the session members it uses and drops the import of the concrete class.
- Files: `src/app/collection-refinement-workflow.ts`, `src/app/refine-screen-leave-policy.ts`, `src/app/app-controller.ts`
  Edit: type and build Collection Refine with `CollectionClipRefinementSession`.
- Files: `tests/unit/collection-clip-refinement-session.spec.ts` (new); `tests/unit/gif-extraction-session.spec.ts`; `tests/unit/refine-gif-session.spec.ts`; `tests/integration/app/app-controller-characterization.spec.ts`
  Edit:
  - move the two collection-refinement mode tests to the new session's file;
  - construct `GifExtractionSession` directly;
  - mock both session modules in the characterization test.

### Validation

Gates: G7.

### Rollback/Containment

Revert the milestone commit. M2-M5 stand on their own.

## Milestone 7 - Documentation, end-to-end specs and checks in the running app

### Scope

Prove the acceptance behavior and describe the new structure.

### Changes

- File: `docs/agent-docs/agent-architecture-map.md`
  Edit: with the `doc-update` skill, replace the `GifExtractionSession` entry with the session, its parts, and `CollectionClipRefinementSession`; update any routing text that names moved members.
- Files: temporary probes under `test-evidence/gif-extraction-session-split/` only.
  Edit: one Playwright probe per item of spec section 5.3. Each probe is run on the commit before M2 and on the final commit, and the observations are compared.

### Validation

Gates: G8, G9, G10, G11. Then a final review of the branch against `coding-quality.md` and `ui-coding-quality.md`, with deviations recorded in `Outcomes & Retrospective`.

### Rollback/Containment

Documentation and evidence only. A failing gate sends the work back to the milestone that owns the behavior.

## Rejected alternatives

- R1: Keep one class and make only the mode explicit - rejected because it leaves six jobs in one class; superseded by D1 and D8.
- R2: Give each part its own published snapshot and let the screens combine them - rejected because it changes every screen and the panel for no user benefit; superseded by D3.
- R3: Keep collection refinement inside `GifExtractionSession` with saved storage switched off - rejected because the class would still carry both purposes; superseded by D8.
- R4: Rename the existing "Session" classes in the same change - rejected to keep the refactor reviewable; superseded by D9.
- R5: Let each part publish through its own change callback - rejected because the session would then merge several notification streams; superseded by D2 and D12.
- R6: Move all parts in one commit - rejected because a failure could not be traced to one move; superseded by D11.
- R7: Let `CurrentMovie` call replacement hooks supplied by the session - rejected because it makes `CurrentMovie` and the session depend on each other; superseded by D16.
- R8: Choose saved or unsaved storage inside the session from whether a capture store was passed - rejected because it is the presence check the spec removes; superseded by D18.
