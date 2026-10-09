# Split AppController into Workflow Classes

Signed-off spec: `docs/specs/app-controller-workflows-spec.md` (signed off 2026-10-09). This plan cites the spec's decisions as "spec D1" to "spec D10" and its acceptance items as "spec A1" to "spec A7" (section 5, items 1 to 7). This plan's own decisions are D1 onward in the Decision Log.

## Why this matters

`src/app/app-controller.ts` builds the whole application inside one method, and most Collection-screen behavior lives in a class declared inside that method. Its members reach their collaborators through local variables declared later in the method. Nothing in it can be tested on its own, and a change to construction order can break it at runtime. After this work, each workflow is a class with explicit dependencies. UI controls report what the user did as typed events, and `AppController` only assembles the pieces. Users see no difference except one: a host missing an optional desktop API still starts (spec D7).

## Progress

- [x] (2026-10-10) Plan signed off by the user.
- [x] (2026-10-09) Baseline on `master` at `61d4d99`: `npm run typecheck` exit 0; `npx vitest run tests/unit tests/integration` exit 0, 88 files and 467 tests passed.
- [x] (2026-10-10) Milestone 1: desktop API fakes and characterization tests. 9 new characterization tests pass on unmodified application code (G1). A deliberate-bug check confirmed they fail when the refinement stop rule or the refresh deferral is removed. G0: typecheck exit 0; 89 files, 476 tests passed. Evidence: `test-evidence/app-controller-workflows/G0-m1-*.log`, `G1-characterization.log`, `G1-mutation-check.log`.
- [x] (2026-10-10) Milestone 2: event source, wiring check and optional adapter factories. The five `tryCreate` factories are covered by one shared spec, `tests/unit/electron-optional-adapters.spec.ts`, instead of a case in each adapter's spec. The new startup test fails on the previous wiring with "Saved-captures API is unavailable." and passes now. G2: 40 tests passed. G0: typecheck exit 0; 497 tests passed. Evidence: `test-evidence/app-controller-workflows/G0-m2-*.log`, `G2.log`.
- [x] (2026-10-10) Milestone 3: standalone query components. `NewCollectionNameCheck.check` returns `kind: 'accepted' | 'rejected'`, because the non-strict typecheck configuration does not narrow a union on a boolean `ok`. `RefineScreenLeavePolicy` also reports why it refused, which keeps today's message beside the rule it explains. The two combined-name cases in `tests/unit/collection-dialog-view.spec.ts` moved to `tests/unit/new-collection-name-check.spec.ts`. G3: 28 tests passed. G0: typecheck exit 0; 513 tests passed. Evidence: `test-evidence/app-controller-workflows/G3.log`, `G0-m3-*.log`.
- [x] (2026-10-10) Milestone 4: controls report application events. Nine commits (`aa7b49c` to `dbddad5`). The Refine screen and the capture list share one commit because their subscriptions sit in one `AppController` block. The shell gained `start()` (D13). The conversions stayed with the root: every one edits `app-controller.ts`, so they could not run in parallel, and briefing plus checking would have cost about as much as doing them. G4: every match left by the search for removed option names in `src/` is a per-request reply handler (D3), an `AppWorkflows` member name, or the shell's private DOM listener. G0 after each commit: 513 tests passed. Evidence: `test-evidence/app-controller-workflows/G0-m4-*.log`, `G4-removed-option-search.log`.
- [x] (2026-10-10) Milestone 5: leaf workflows extracted (`73b3b87`, `ea49418`, `0a334e7`). `ActivityReporter` also owns the "error to technical details" text that was repeated nine times. `CollectionViewWorkflow.clearLoadedView()` covers only the view; the startup reset in `AppWorkflows.clearLoadedState` still closes the dialogs until their owners move in Milestone 6. Removing selected clips is split by view, as the Event list says: `CollectionViewWorkflow` handles a collection view, and the delete flow handles the pipeline view. The unused `AppWorkflows.isFullscreen` member was removed. G5: 16 new unit tests. G0: typecheck exit 0; 529 tests passed. Evidence: `test-evidence/app-controller-workflows/G0-m5-*.log`.
- [x] (2026-10-10) Milestone 6: save, add, folder-selection and delete workflows extracted (`696c358`, `85e4fcd`, `5e369da`, and the delete commit that follows this entry). The pending action moved from `AppSessionState` into `FolderSelectionWorkflow`, and `tests/unit/state.spec.ts` now covers only the open folder session. The pending delete request moved into `DeleteFromDiskWorkflow`. The Pipelines catalog control is now built before the workflows, so `FolderSelectionWorkflow` subscribes to it directly. Add to Collection no longer runs a dialog-validation branch that could never apply to a failed write. Its replies are unchanged. G6: 29 new unit tests, covering every D9 mapping and every exit path of the save wait. G0: typecheck exit 0; 558 tests passed after the last commit. Evidence: `test-evidence/app-controller-workflows/G0-m6-*.log`.
- [x] (2026-10-10) Milestone 7: remaining workflows extracted; `AppController` is composition only (`0b63aa3`). This landed as one commit instead of one per workflow: the five extractions and the D10 reordering all rewrite the same construction sequence, so splitting them would have produced intermediate states written only to be discarded. The commit reverts as a unit. `init()` now builds page elements, services, controls and screens, the shell and the utility coordinator, then the workflows, then calls `assertComplete()`, then starts up. It declares no `let` at all. The Activity control and the utility coordinator still refer to each other, but through callbacks to a constant declared later in `init()`, so no mutable variable is needed. One callback still closes a dependency loop: saving notifies `OpenFolderRefreshSession`, which refreshes through `FolderSelectionWorkflow`, which itself saves first. G7: one class besides `AppController` (`AppControllerSupport`, top level); none of the removed state; no `src/ui/` imports in the new app files. Removing the Zoom subscription to `openClipRequested` made all 20 app-level tests fail with "Application events without a subscriber: clipGrid.openClipRequested.", and they passed again once it was restored. G0: typecheck exit 0; 581 tests passed. Evidence: `test-evidence/app-controller-workflows/G0-m7-*.log`, `G7-*.log`.
- [x] (2026-10-10) Milestone 8: end-to-end, manual check and documentation. G8: `npm run e2e -- tests/e2e/scenarios.spec.ts tests/e2e/collection-refine.spec.ts tests/e2e/gif-movie-fullscreen.spec.ts`, 12 passed, exit 0. G9: run as a scripted check of the real Electron app rather than by hand, compared against `master` (see Outcomes); 6 flows passed on both builds, and the recorded observations match except for the one difference already noted under Surprises. G10: `docs/agent-docs/agent-architecture-map.md` updated with the doc-update skill, and every relative link in it resolves. Evidence: `test-evidence/app-controller-workflows/G8-e2e.log`, `G9-probe.spec.ts`, `G9-probe-master.json`, `G9-probe-branch.json` and their `.log` files.

Evidence logs: write full command output to the ignored folder `test-evidence/app-controller-workflows/` (one file per gate, named after the gate ID), and record pass counts and exit codes here. Never keep evidence under `test-results/`, which Playwright deletes at the start of every run.

## Skill Gates

Planning-time gates:

- plan-review: before each sign-off request and after substantial revisions.
- before-you-refactor: the existing tests, the coupling hotspots and the small-step order were checked before the milestones were drafted.
- api-and-interface-design: the event maps, the event source, the query components and the awaitable save (D1 to D6).
- domain-modeling: the collection already-exists check on `Pipeline` (D4).
- testing-discipline: the characterization tests and the gates.

Execution-time gates:

- before-you-refactor: at the start of every milestone from 2 onward.
- testing-discipline: Milestone 1, and every new unit test.
- typescript-coding and writing-clean-code: every code change.
- api-and-interface-design: Milestones 2 to 4 (new exported types), and each workflow's public methods in Milestones 5 to 7.
- domain-modeling: the `Pipeline` change in Milestone 3.
- cost-aware-delegation: before delegating any packet. Milestone 4's per-control conversions are the likely candidates. A ledger, if used, goes in `docs/plans/app-controller-workflows-exec-plan-delegation-log.md`.
- pre-commit-self-review: before each commit.
- doc-update: Milestone 8.
- A final pass against `coding-quality.md`: Milestone 8. This includes its rule that an interaction whose outcome a workflow needs returns that outcome to its caller and settles on every exit path (D9).

Unavailable skills or fallbacks:

- plan-review and the other skills above are repository-local skill files under `.agents/skills/`. When the agent environment does not load them as skills, read the skill file and follow it directly.

## Surprises & Discoveries

- Discovery: application-level control notifications number 28 on 10 controls. The spec estimated about 25 on about 9. The extra control is the GIF capture list (`GifRangesPanelControl`), whose Refine request the composition root handles today. The Refine screen's Back covers both Refine screen instances, because they share one class.
  Evidence: `src/ui/*` option types, and the callbacks passed in `src/app/app-controller.ts` from line 1197 to the end of `init()`. The GIF movie full screen feature (commit `fd01858`) added no new application-level callbacks.
- Discovery: one more control query lives in the composition root: whether the Activity panel may open automatically, which `ActivityIndicatorControl` asks through `requestPanelOpen` (`app-controller.ts` lines 1238-1242). Under spec D3 it becomes a standalone component (D5).
  Evidence: `app-controller.ts` lines 1238-1242.
- Discovery: the GIF capture list's Refine request is a small workflow with its own revision counter (`refineSelectionRevision`, lines 1725-1732). Spec A4 forbids workflow state in `init()`, so it needs an owner (D8).
  Evidence: `app-controller.ts` lines 1671 and 1725-1732.
- Discovery: the saved-captures adapter throws "Saved-captures API is unavailable.", which `AppController` does not catch. Today a host without that API fails to start. Spec D7 changes this deliberately.
  Evidence: `src/adapters/electron/electron-clip-captures-store-service.ts` line 19; `app-controller.ts` lines 1735-1743.
- Discovery: GIF movie full screen (commit `fd01858`) gave `AppWorkflows` two pieces of state, `collectionFullscreenWasActive` and `movieFullscreenWasActive`. Its full-screen change handler (`onFsChange`, lines 1107-1122) now coordinates the movie player, the GIF keyboard controller, Zoom, the Collection full screen session and the grid. Spec A4 forbids that state in `init()`, so it needs an owner (D12). The same commit split the full-screen question in two: whether Collection full screen is active (the document element is full screen), and whether any element is full screen.
  Evidence: `src/app/app-controller.ts` lines 140-142, 187-189 and 1107-1122; `src/adapters/browser/fullscreen-adapter.ts`.
- Discovery: `coding-quality.md` now requires that an interaction whose outcome a workflow needs returns it to the caller, and settles on every exit path, including cancel, Escape and closing by other means. D9 implements this for Save as Collection. One extra exit path exists: the dialog is closed directly at startup (`clearLoadedState`, line 554).
  Evidence: `coding-quality.md`, application controller layer section; `app-controller.ts` lines 220, 554 and 893.
- Discovery (Milestone 1): the GIF screens cannot drive a real extraction in jsdom, because capture needs rendered frames. The extraction-refresh and refinement-startup tests therefore replace `GifExtractionSession` with a module-level fake (`vi.mock`) and call its `onPublished` option, or observe the calls `AppController` makes on it. The desktop API fakes are still needed so the optional adapters construct. A module-level fake applies to its whole test file, so the characterization tests live in their own file, `tests/integration/app/app-controller-characterization.spec.ts`, instead of `app-controller.spec.ts`. Both files share one fixture and setup, now in `tests/integration/app/app-controller-harness.ts`; the existing tests are otherwise unchanged. The fake keeps a static instance list that survives module resets, so tests take the newest instance.
  Evidence: `tests/integration/app/app-controller-characterization.spec.ts`; `test-evidence/app-controller-workflows/G1-characterization.log`.
- Discovery (Milestone 4): `AddToCollectionDialogController` emits `cancelled`, but the application has never handled it; closing the dialog is the whole behavior. The wiring check therefore requires only its `confirmed` event, rather than adding an empty subscription to satisfy D6.
  Evidence: `src/app/app-controller.ts` before commit `c85f222` passed only `onConfirm` to this dialog.
- Discovery (Milestone 6): one small difference follows from D9. Previously, when "Save" on the unsaved-changes prompt went through Save as Collection, the old flag-based code resumed the pending switch as if the user had chosen Discard: it reloaded the just-saved view once before switching, which logged one extra transient load-status entry in Activity. With the awaitable save, that path now behaves like a direct save of a collection view and skips the redundant reload. The final view is the same. This is reported to the user rather than reproduced.
  Evidence: `src/app/app-controller.ts` before commit `696c358`, `confirmSaveAsNew` calling `continuePendingAction({ saveFirst: false })`.
- Discovery (Milestone 6): a failed save of a collection view writes nothing to Activity, before and after this change; only the reopened prompt shows it. This is existing behavior and outside this refactor's scope.
  Evidence: `CollectionSaveWorkflow.saveActive`; previously `AppWorkflows.saveActiveCollection`.
- Discovery: Electron end-to-end tests run against the built output, so they must be started through `npm run e2e -- <spec files>`, which rebuilds first.
  Evidence: `docs/agent-docs/agent-architecture-map.md`, Validation Map.
- Discovery: the existing adapter unit tests already contain fake desktop APIs in the real wire format, which Milestone 1 can reuse.
  Evidence: `tests/unit/frame-review/electron-frame-review-service.spec.ts`, `tests/unit/electron-clip-extraction-service.spec.ts`.

## Decision Log

| ID | Decision | Rationale | Date |
|---|---|---|---|
| D1 | Events use one small class, `EventSource<TEvents>`, with an interface, `IEventSource<TEvents>`, in a new file `src/app/event-source.ts`. `TEvents` maps each event name to its payload type. `on(name, handler)` returns an unsubscribe function, and `subscriberCount(name)` (interface `IEventSubscriberCount<TEvents>`) supports the wiring check (D6). An event whose payload type is `void` is emitted without an argument. Handlers run in subscription order. A handler that throws does not stop later handlers. After all have run, a single error is rethrown as is; several are rethrown together as an `AggregateError`. Each control keeps a private `EventSource` and exposes only `on`, through its `I…Events` map. | One tested mechanism instead of ten ad-hoc ones. Placing it in `src/app/` keeps the dependency direction UI to app. |
| D2 | Each workflow declares the narrow event map it subscribes to beside itself (spec D4), for example `IToolbarSaveRequests` with only `saveRequested`. A control's full event source must be assignable to it. A type-level test proves this for each pair. | Workflows never import from `src/ui/`, yet the compiler checks that controls still provide what workflows need. |
| D3 | The event list is in the table below this one (Event list). Constructor options for these notifications are removed from the controls. Internal control wiring (grid cards, metadata tracker, panel folding, menu items) is unchanged. | Spec D2 asks for the exact list. |
| D4 | `Pipeline` gets `hasCollectionWithFilename(filename)`, using the existing case-insensitive identity key. A new `NewCollectionNameCheck` (`src/app/new-collection-name-check.ts`) answers "what is wrong with this name, if anything" for both collection dialogs. It calls `Collection.validateCollectionName` for validity, then `Pipeline.hasCollectionWithFilename` on the loaded pipeline, and maps the code to text through `CollectionNameValidator`. `CollectionNameValidator` loses its combined `validate` method. | Spec D3 and D6. |
| D5 | Two more standalone query components. `RefineScreenLeavePolicy` (`src/app/refine-screen-leave-policy.ts`) is given the collection Refine screen's id and the refinement session. It answers the shell's leave question with today's rule: leaving is blocked while that session has an extraction batch running. `ActivityPanelAutoOpenPolicy` (`src/ui/activity-panel-auto-open-policy.ts`) answers whether the Activity panel may open by itself, with today's rule: not while any element is full screen (Collection or GIF movie), and not while Zoom, Save as Collection, the collection conflict or any open dialog is showing. The Collection full screen question that the grid, Zoom, `FullscreenSession` and `AppKeyDownHandler` ask is answered by `FullscreenAdapter` through a new `isDocumentFullScreen()` method, which wraps today's `isElementFullScreen(document.documentElement)`. It reads those controls through narrow interfaces. It lives in `src/ui/` because its rule concerns only UI surfaces. | Spec D3. |
| D6 | A new `EventWiringCheck` (`src/app/event-wiring-check.ts`) records each required (event source, event name) pair. Its `assertComplete()` throws, listing every pair with no subscriber. `AppController.init()` ends with `assertComplete()`. Every application event in the Event list is required. | Spec D5. |
| D7 | Each of the five optional adapters (frame review, thumbnail cache, clip extraction, saved captures, collection refinement) gets `static tryCreate(win): Adapter | null`. It returns null when its desktop API object is missing, and otherwise constructs. The constructors are unchanged. `AppController` creates the GIF sessions only when frame review, thumbnail cache, clip extraction and saved captures all exist, and the collection-refinement session only when collection refinement also exists. | Spec D7, without string matching. |
| D8 | One workflow beyond the spec's section 2 table, `GifRangeRefinementWorkflow` (`src/app/gif-range-refinement-workflow.ts`), owns the GIF capture list's Refine request and the Refine GIF screen's Back. It prepares a saved range, starts refinement, opens the Refine GIF screen, reports a rejection, and owns the revision counter. | Required by spec A4. It follows the spec's rules for every other workflow. |
| D9 | `CollectionSaveWorkflow.saveActive()` returns a promise of `'saved' | 'cancelled' | 'failed'` (spec D8). In collection view it saves the file directly. In pipeline view it opens Save as Collection and resolves on a successful save or on cancel. A failed save keeps the dialog open, as today. A second call while the dialog is open returns the same promise. `saveAsNew()` (the toolbar's Save as Collection) uses the same wait; the toolbar ignores the result. The delete preflight maps `saved` to the delete confirmation, `failed` to reopening the preflight, and `cancelled` to dropping the pending delete. The unsaved-changes prompt maps `saved` to continuing the pending action, `failed` to reopening the prompt, and `cancelled` to clearing the pending action and refreshing the selector. Every exit path settles the wait: Save, the Cancel button, Escape, a direct close of the dialog, and disposal of the workflow at shutdown. Only `CollectionSaveWorkflow` closes its dialog; any other caller that today closes it directly (`clearLoadedState`) asks the workflow to cancel instead, which settles as `cancelled`. | These mappings are what the code does today (`app-controller.ts` lines 219-226, 781-819, 878-925), now with no cross-workflow flags, as the `coding-quality.md` rule on interaction outcomes requires. |
| D10 | Construction order in `init()`: page elements, adapters, application services and query components, controls and screens, the shell, workflows, then the wiring check, then startup. Workflows subscribe to controls in their constructors and are disposed by `ApplicationShutdownCoordinator` before controls are destroyed. | Spec D4; there is no late binding. |
| D11 | Execution happens on a new branch, `refactor/app-controller-workflows`, with one commit per step (spec D10). Every commit runs gate G0. | before-you-refactor step 7, and spec D10. |
| D12 | A second workflow beyond the spec's section 2 table, `FullScreenChangeWorkflow` (`src/app/full-screen-change-workflow.ts`), handles the document's full-screen change. It owns the two "was active" flags. It closes the utilities, tells the movie player, releases held GIF steps when movie full screen starts or ends, closes Zoom and updates the Collection full screen session when Collection full screen changes, and re-renders the collection when Collection full screen ends. Its order of steps is today's. `ApplicationEventController` delivers the change to it. | Required by spec A4, following the same rules as D8. |
| D13 | `ApplicationShellController` no longer activates its initial screen in its constructor; a new `start()` does. `AppController` subscribes to the shell's events, then calls `start()`. | The constructor used to emit `screenChanged` and `boundsSettled` for the initial screen. A subscriber added after construction would miss them, losing today's initial keyboard map render and grid layout settle. | 2026-10-10 |

Event list (D3). "Consumer after refactor" is where the subscription ends up once Milestone 7 is done.

| Control | Event (payload) | Today's option | Consumer after refactor |
|---|---|---|---|
| `MainToolbarControl` | `browseRequested`, `saveRequested`, `saveAsNewRequested`, `addToCollectionRequested`, `deleteFromDiskRequested`, `toggleTitlesRequested`, `toggleFullscreenRequested` (none) | `onBrowse`, `onSave`, `onSaveAsNew`, `onAddToCollection`, `onDeleteFromDisk`, `onToggleTitles`, `onToggleFullscreen` | FolderSelection, CollectionSave, CollectionSave, AddToCollection, DeleteFromDisk, CollectionView, `AppController` (fullscreen wiring) |
| `ClipCollectionGridController` | `cardCountChanged` (none), `selectionChanged` (ids), `orderChanged` (ids), `openClipRequested` (id), `removeSelectedRequested` (ids), `contextMenuRequested` (point, id), `metadataFailed` (clip, error) | `updateCount`, `onSelectionChange`, `onOrderChange`, `onOpenClip`, `onRemoveSelected`, `onContextMenu`, `onMetadataFailure` | CollectionView, CollectionView, CollectionView, Zoom, CollectionView and DeleteFromDisk (each acts only in its own view: removal from a collection view, deletion from the pipeline view; both ignore the event while Zoom is open, as today), GridContextMenu, `AppController` (diagnostics wiring) |
| `CollectionSelectorControl` | `selectionRequested` (filename or null) | `onSelectionRequested` | FolderSelection |
| `SaveAsNewDialogController` | `confirmed` (name), `cancelled` (none) | `onConfirm`, `onCancel` | CollectionSave |
| `AddToCollectionDialogController` | `confirmed` (destination), `cancelled` (none) | `onConfirm`, `onCancel` | AddToCollection |
| `ZoomOverlayController` | `playbackFailed` (failure), `contextMenuRequested` (point) | `onPlaybackFailure`, `onContextMenu` | Zoom |
| `ApplicationShellController` | `screenChanged` (screen), `boundsChanging` (screen, width, duration), `boundsSettled` (screen) | `onScreenChange`, `onBoundsChange`, `onBoundsSettled` | `AppController` (keyboard map and grid resize wiring) |
| `PipelineCatalogControl` | `loadRequested` (entry), `failed` (message, error) | `onLoadPipeline`, `onError` | FolderSelection, `AppController` (reporting wiring) |
| `RefineGifScreen` | `backRequested` (range id or null) | `onBack` | GifRangeRefinement (GIF instance), CollectionRefinement (collection instance) |
| `GifRangesPanelControl` | `refineRequested` (range id) | `onRefine` | GifRangeRefinement (GIF list), CollectionRefinement (refined-clip list) |

## Validation gates

| ID | Milestone | Proves | Needs milestones | How to check | Expected |
|---|---|---|---|---|---|
| G0 | every commit | Nothing regressed at the commit level | 0 | `npm run typecheck` then `npx vitest run tests/unit tests/integration` (while iterating, run only the touched specs; run the full command before each commit) | Both exit 0; the test count never decreases |
| G1 | 1 | Today's behavior of the uncovered flows is recorded | 1 | `npx vitest run tests/integration/app` | The new characterization tests pass on the unmodified application code |
| G2 | 2 | Events reach every subscriber in order; a missing subscriber is reported; a missing optional desktop API no longer stops startup | 2 | `npx vitest run tests/unit/event-source.spec.ts tests/unit/event-wiring-check.spec.ts tests/integration/app` | All pass, including the new test that starts the app without the saved-captures API and finds the Collection screen usable |
| G3 | 3 | The name checks and the two policies answer as before | 3 | `npx vitest run tests/unit/new-collection-name-check.spec.ts tests/unit/refine-screen-leave-policy.spec.ts tests/unit/activity-panel-auto-open-policy.spec.ts tests/unit/pipeline-selection.spec.ts` then G0 | All pass; the dialog validation integration tests are unchanged and green |
| G4 | 4 | Controls report application events, and each control's event map satisfies its consumers' narrow maps | 4 | G0, plus a search for the removed option names (Event list, "Today's option") in `src/` | G0 green; none of the removed option names is still passed to or read by these controls |
| G5 | 5 | Leaf workflows behave as before and are testable alone | 5 | New unit tests for `ActivityReporter`, `CollectionFileWriter` and `CollectionViewWorkflow`, then G0 | All pass |
| G6 | 6 | Save, add, folder selection and delete behave as before, including the D9 save waits | 6 | New unit tests for the four workflows, covering every D9 mapping and every exit path that settles the wait (Save, Cancel, Escape, direct close, disposal), then G0 | All pass; the pending-action tests from `tests/unit/state.spec.ts` now live in the folder-selection workflow tests |
| G7 | 7 | `AppController` is composition only, and the wiring check runs | 7 | G0; then read `init()` in `src/app/app-controller.ts`; search the new workflow files for imports from `src/ui/`; temporarily remove one workflow's subscription and run G0 | `init()` declares no class, and none of the state named in Context remains. Any remaining `let` in `init()` is a construction cycle between UI controls (for example the Activity control and the utility coordinator), recorded in Surprises. No `src/ui/` imports in workflow files. The temporary removal makes the integration tests fail with a message naming the event, and they pass again once restored |
| G8 | 8 | The real app still works end to end | 1-7 | `npm run e2e -- tests/e2e/scenarios.spec.ts tests/e2e/collection-refine.spec.ts tests/e2e/gif-movie-fullscreen.spec.ts` (rebuilds first; a bare `npx playwright test` would run stale built code) | All scenarios pass |
| G9 | 8 | User-visible behavior is unchanged | 1-7 | Manual check in `npm start` of every flow in spec A3 | Each flow behaves as before; record observations in Outcomes |
| G10 | 8 | The architecture docs match the code | 8 | Run the doc-update skill | `docs/agent-docs/agent-architecture-map.md` describes the workflows, event sources and query components |

## Outcomes & Retrospective

Goal: users see the Collection screen behave as before, while `AppController` only assembles workflow classes that can be tested on their own. That goal is met.

Acceptance (spec section 5):

- A1: `npm run typecheck` exit 0; `npx vitest run tests/unit tests/integration` 581 tests passed at the last code commit (baseline 467). Existing tests changed only in the ways A1 allows.
- A2: G8, 12 end-to-end scenarios passed.
- A3: no one checked the app by hand. Instead a temporary Playwright probe (`test-evidence/app-controller-workflows/G9-probe.spec.ts`) drove the real Electron build through the A3 flows that the committed scenarios do not cover. The flows were: switching with unsaved changes (Cancel, Don't Save, Save, and Save from the pipeline view through Save as Collection); Save as Collection with an empty, invalid, reserved, existing and differently-cased existing name, then a valid name; Add to Collection, both existing and new, with its name checks; and delete from disk through the save-first preflight. It records the prompt text, validation messages, button state, grid order, file contents and the newest Activity entries. It ran on `master` (`61d4d99`) and on this branch. All 62 observations match, except one Activity entry: with the awaitable save (D9), saving from the pipeline view's unsaved-changes prompt no longer reloads the saved view once before switching. Opening a folder, a valid Save as Collection, Add to an existing collection, Zoom with Loopify and collection refinement are also covered by G8.
- A4 and A5: G7.
- A6: the Milestone 2 startup test.
- A7: G10.

Found while checking, and present on `master` as well (not caused by this work, not fixed here): after dragging a card in a saved collection view, the grid shows one clip twice and the count goes up by one; the saved file is not duplicated. If the user then selects the duplicated clip and deletes it from disk, the confirmation lists the file twice, the second deletion reports "ENOENT" in Activity, and the grid still shows the deleted cards afterwards. Both builds behave identically; see `G9-probe-*.json`, flows `switch` and `delete`.

Other behavior notes for the user, already in Surprises: a failed save of a collection view still writes nothing to Activity, and the collection refinement session now also requires the saved-captures API (D7).

Final pass against `coding-quality.md`:

- Layers: `AppController` only constructs and connects. Flow logic lives in workflow classes in `src/app/`, rules about collection names stay with `Collection`, `Pipeline` and `CollectionNameValidator`, and UI-only questions are answered in `src/ui/`. The new workflow files do not import from `src/ui/`.
- Interaction outcomes: Save as Collection returns its outcome as a promise and settles on Save, Cancel, Escape, a direct close and disposal (G6). No other workflow inspects another's intent in shared state.
- Naming and comments: every new interface has the `I` prefix; the changed source has no doc blocks and no module-level functions, so the exception register is unchanged.
- Tension: `ZoomWorkflow` and `CollectionRefinementWorkflow` take more than ten narrow dependencies each. Each dependency is a `Pick` of what the workflow uses, so the size reflects how many parts these flows touch rather than mixed responsibilities. Splitting them further would separate steps that change together.
- Tension: one callback in `init()` still closes a loop (refresh after save goes back through `FolderSelectionWorkflow`). It is named and typed, and is the only one.
- Tests: the new unit and characterization tests wait for observable conditions rather than fixed sleeps. The G9 probe uses short fixed waits after drags and is evidence only, not a committed test.

Skills that governed Milestone 8: doc-update (G10), goal-based verification (G9 compared against `master` rather than asserted on the branch alone), and this final `coding-quality.md` pass. No work was delegated to subagents in any milestone, so no delegation ledger exists.

## Context and orientation

The renderer is framework-free TypeScript under `src/`, emitted to `build/src/` and loaded by `index.html`. The layers are `src/domain/` (models such as `Pipeline` and `Collection`), `src/business-logic/`, `src/app/` (application objects), `src/ui/` (controls that own DOM) and `src/adapters/` (Electron and browser services).

`src/app/app-controller.ts` (`AppController.init()`) does five things today. It looks up page elements, creates adapters and controls, defines a nested class `AppWorkflows` with about 60 workflow members (lines 139-1123), creates the GIF sessions and screens, and registers events. The pending-action state lives in `src/app/app-session-state.ts`. More state lives in `init()`. As local variables: `pendingDeleteRequest`, `gridMenuRevision`, `selectionRevision`, `refineSelectionRevision` and `collectionRefineRevision`. As fields of `AppWorkflows`: `collectionFullscreenWasActive` and `movieFullscreenWasActive`.

There are two kinds of full screen. Collection full screen puts the whole document in full screen for grid review, coordinated by `src/app/fullscreen-session.ts`. GIF movie full screen puts only the movie player element in full screen, owned by `src/ui/frame-review-player-control.ts`. `FullscreenAdapter` (`src/adapters/browser/fullscreen-adapter.ts`) answers both "is the document full screen" and "is any element full screen".

Tests:

- `tests/integration/app/app-controller.spec.ts` and `tests/unit/app-dom.spec.ts` boot the real `AppController` against a DOM fixture and a fake `window.clipSandboxDesktop`.
- Control tests live under `tests/unit/` and `tests/integration/ui/`.
- The Electron end-to-end scenarios need the native frame-review build, which is present under `native-build/frame-review/`. Run them through `npm run e2e -- <spec files>`, which rebuilds `build/` first.

## Milestone 1 - Desktop API fakes and characterization tests

### Scope

Record today's behavior for the flows in spec D9 before any production code changes.

### Changes

- File: `tests/integration/app/desktop-api-fakes.ts` (new)
  Edit: builders for `window.clipSandboxDesktop.frameReview`, `.thumbnailCache`, `.clipExtraction`, `.clipCaptures` and `.collectionRefine`. Reuse the wire shapes from the adapter unit tests named in Surprises. Provide an exact-ready review session, a clip extraction that returns created media, and a source lookup that can resolve or cancel.
- File: `tests/integration/app/app-controller.spec.ts`
  Edit: add tests for:
  - switching to a collection that lists a missing clip: Apply shows the partial view and status text; Cancel keeps the current view;
  - opening a Pipelines catalog entry with unsaved changes: Discard loads the pipeline and activates Collection; Cancel keeps the current folder;
  - extraction publishing into the open folder: a clean view refreshes and keeps the selected collection; with unsaved changes the refresh waits until a successful save;
  - starting collection refinement: unsaved changes block it with today's message; a cancelled source lookup returns to Collection; a folder or collection change during lookup stops it.

### Validation

Gates: G1, G0. The new tests must pass on unmodified application code. If a test only passes after a production change, that test records a bug: stop and report it instead of changing behavior.

The extraction-refresh and refinement-startup tests drive the GIF screens through the fakes. If the integration DOM fixture cannot reach extraction that way, cover the refresh behavior instead with an assertion in `tests/e2e/gif-extraction-output.spec.ts` that the Collection view shows the new clip. Record the substitution in Surprises; that check then joins G8.

### Rollback/Containment

Test-only milestone. Revert the commit.

## Milestone 2 - Event source, wiring check and optional adapter factories

### Scope

Provide the event mechanism (D1), the wiring check (D6) and the adapter factories (D7, spec D7).

### Changes

- File: `src/app/event-source.ts` (new)
  Edit: `IEventSource<TEvents>` and `EventSource<TEvents>`, as in D1.
- File: `src/app/event-wiring-check.ts` (new)
  Edit: `EventWiringCheck`, as in D6.
- Files: the five adapters in `src/adapters/electron/` (frame review, thumbnail cache, clip extraction, clip captures store, collection clip refinement)
  Edit: add `static tryCreate(win)`, as in D7.
- File: `src/app/app-controller.ts`
  Edit: create the optional adapters through `tryCreate`, and delete the error-message matching (lines 1216-1220 and 1735-1743).
- Tests: `tests/unit/event-source.spec.ts` and `tests/unit/event-wiring-check.spec.ts` (new). One new `tryCreate` case per adapter spec. One integration test that boots without `clipCaptures` and checks that the Collection screen works and that opening a movie reports it is unavailable.

### Validation

Gates: G2, G0.

### Rollback/Containment

Each part is additive except the adapter wiring in `AppController`. Reverting the commit restores the string matching.

## Milestone 3 - Standalone query components

### Scope

Move every control query to its owner (D4, D5).

### Changes

- File: `src/domain/pipeline.ts`
  Edit: add `hasCollectionWithFilename`.
- Files: `src/app/new-collection-name-check.ts`, `src/app/refine-screen-leave-policy.ts`, `src/ui/activity-panel-auto-open-policy.ts` (new)
  Edit: as described in D4 and D5.
- File: `src/app/collection-name-validator.ts`
  Edit: keep only the code-to-text mapping.
- File: `src/app/app-controller.ts`
  Edit: pass the new components to the two collection dialogs, the shell and the Activity control. Make `resolveAddDestinationFilename` use `NewCollectionNameCheck`, and delete its copy of the rules. Replace `AppWorkflows.isCollectionFullscreen` with `FullscreenAdapter.isDocumentFullScreen()` for every Collection full screen question.
- File: `src/adapters/browser/fullscreen-adapter.ts`
  Edit: add `isDocumentFullScreen()`, as described in D5; cover it in `tests/unit/fullscreen-adapter.spec.ts`.
- Tests: one unit spec per new component. Add a `hasCollectionWithFilename` case to `tests/unit/pipeline-selection.spec.ts`.

### Validation

Gates: G3, G0.

### Rollback/Containment

Revert the commit. Callers return to their in-line rules.

## Milestone 4 - Controls report application events

### Scope

Each control in the Event list switches from constructor callbacks to events (spec D2, D3). One commit per control. `AppController` subscribes for the not-yet-extracted workflows and forwards to the existing `AppWorkflows` members (spec D10).

### Changes

- Files: the ten controls in the Event list
  Edit: remove the listed constructor options, add a private `EventSource`, expose `on`, emit where the callback was called, and export the control's `I…Events` map.
- Files: those controls' unit and integration specs
  Edit: subscribe with `on` instead of passing options. Assertions are unchanged.
- File: `src/app/app-controller.ts`
  Edit: subscribe to each event right after the control is created. Register each pair with the wiring check, but do not call `assertComplete()` yet; that happens in Milestone 7.

### Validation

Gates: G4, G0 after each control's commit.

### Rollback/Containment

Each control is its own commit. Revert the failing one.

## Milestone 5 - Leaf workflows extracted

### Scope

Extract `ActivityReporter`, `CollectionFileWriter` and `CollectionViewWorkflow` (spec section 2), each with constructor dependencies and the narrow interfaces of spec D4 and D2.

### Changes

- Files: `src/app/activity-reporter.ts`, `src/app/collection-file-writer.ts`, `src/app/collection-view-workflow.ts` (new)
  Edit:
  - `ActivityReporter` takes over `showStatus`, `showErrorStatus`, `showProgressStatus` and the repeated technical-details formatting.
  - `CollectionFileWriter` takes over `persistCollection`.
  - `CollectionViewWorkflow` takes over `applySelection`, the two refresh methods, the grid cache keys, `setTitlesHidden`, `clearLoadedState`, reordering and remove-from-view. It subscribes to the grid's `cardCountChanged`, `selectionChanged`, `orderChanged` and `removeSelectedRequested` (collection view), and to the toolbar's `toggleTitlesRequested`.
- File: `src/app/app-controller.ts`
  Edit: remove the moved members, and route remaining callers to the new objects.
- Tests: one unit spec per class, using fakes for the narrow interfaces.

### Validation

Gates: G5, G0. User-visible text must be identical; the existing integration tests assert it.

### Rollback/Containment

One commit per class. Revert the failing one.

## Milestone 6 - Save, add, folder-selection and delete workflows extracted

### Scope

Extract `CollectionSaveWorkflow` (with D9), `AddToCollectionWorkflow`, `FolderSelectionWorkflow` and `DeleteFromDiskWorkflow`, in that order (spec section 2).

### Changes

- Files: `src/app/collection-save-workflow.ts`, `src/app/add-to-collection-workflow.ts`, `src/app/folder-selection-workflow.ts`, `src/app/delete-from-disk-workflow.ts` (new)
  Edit:
  - `CollectionSaveWorkflow` takes over saving and Save as Collection, with D9's wait.
  - `AddToCollectionWorkflow` takes over add-to-collection and its rollback, using `NewCollectionNameCheck`.
  - `FolderSelectionWorkflow` takes over loading, reloading, switching, refreshing, the missing-clips conflict and the unsaved-changes prompt (D9). It owns the pending action and `selectionRevision`.
  - `DeleteFromDiskWorkflow` takes over the delete flow (D9) and owns the pending delete request.
- File: `src/app/app-session-state.ts`
  Edit: remove the pending-action members.
- File: `src/app/app-controller.ts`
  Edit: remove the moved members and the `pendingDeleteRequest` and `selectionRevision` locals. `OpenFolderRefreshSession` receives `FolderSelectionWorkflow`'s refresh method.
- File: `src/app/collection-view-workflow.ts`
  Edit: its startup reset asks `CollectionSaveWorkflow` to cancel Save as Collection instead of closing the dialog directly (D9).
- Tests: one unit spec per workflow covering every D9 mapping. Move the pending-action cases from `tests/unit/state.spec.ts` into the folder-selection spec (spec A1).

### Validation

Gates: G6, G0. The existing tests "save failure does not continue a pending collection switch" and "save failure does not continue from delete preflight into delete confirmation" must pass unchanged.

### Rollback/Containment

One commit per workflow, in the order above. Revert the failing one; earlier ones stay valid.

## Milestone 7 - Remaining workflows extracted; AppController is composition only

### Scope

Extract `ZoomWorkflow`, `GridContextMenuWorkflow`, `CollectionRefinementWorkflow`, `GifRangeRefinementWorkflow` (D8) and `FullScreenChangeWorkflow` (D12). Delete `AppWorkflows`, and turn on the wiring check (D6).

### Changes

- Files: `src/app/zoom-workflow.ts`, `src/app/grid-context-menu-workflow.ts`, `src/app/collection-refinement-workflow.ts`, `src/app/gif-range-refinement-workflow.ts`, `src/app/full-screen-change-workflow.ts` (new)
  Edit:
  - `ZoomWorkflow` creates and owns `ZoomVideoEditWorkflow`, and takes over opening and browsing Zoom, the Zoom edit menu and applying created edits.
  - `GridContextMenuWorkflow` owns `gridMenuRevision`.
  - `CollectionRefinementWorkflow` owns today's `startCollectionRefinement` and `collectionRefineRevision`.
  - `GifRangeRefinementWorkflow` owns `refineSelectionRevision`.
  - `FullScreenChangeWorkflow` owns the two full screen flags and today's `onFsChange` steps (D12). The existing integration test "an error during any full screen element remains in Activity…" and `tests/e2e/gif-movie-fullscreen.spec.ts` protect this behavior.
- File: `src/app/app-controller.ts`
  Edit: remove `AppControllerSupport`'s workflow guards, `AppWorkflows`, the stray `'use strict'` and the blank-line runs. Order construction as in D10, and end `init()` with `assertComplete()`. Keyboard dispatch to the active screen and the Collection full screen toggle stay as thin, stateless wiring; full-screen change handling has moved to `FullScreenChangeWorkflow`.
- Tests: one unit spec per workflow.

### Validation

Gates: G7, G0.

### Rollback/Containment

One commit per workflow. The final commit, which deletes `AppWorkflows` and turns on the check, is separate, so it can be reverted alone.

## Milestone 8 - End-to-end, manual check and documentation

### Scope

Prove spec A2 and A3, and update the architecture documentation (spec A7).

### Changes

- File: `docs/agent-docs/agent-architecture-map.md`
  Edit: run the doc-update skill. Update axiom 2 and the ownership sections for the workflows, event sources and query components.
- File: this plan
  Edit: fill in Outcomes, and add a final pass against `coding-quality.md`.

### Validation

Gates: G8, G9, G10.

### Rollback/Containment

Documentation only. If G8 or G9 fails, bisect the branch's commits with G8's failing scenario and fix or revert the responsible commit.

## Rejected alternatives

- R1: Convert all ten controls to events in one commit - rejected because a failure could not be traced to one control; superseded by D11 and Milestone 4's one-commit-per-control rule.
- R2: Let workflows import each control's `I…Events` map from `src/ui/` - rejected because spec D4 forbids workflow imports from `src/ui/`; superseded by D2.
