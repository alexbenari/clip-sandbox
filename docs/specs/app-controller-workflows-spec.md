# Feature Spec: Split AppController into Workflow Classes

Status: draft for sign-off (2026-10-09)

## 1. Goal and scope

`AppController` in `src/app/app-controller.ts` is the application's composition root: the one place that creates adapters, UI controls and application objects and connects them. Today it is also where most Collection-screen workflows live. `init()` declares a class (`AppWorkflows`) inside the method body. Its roughly 60 members reach their collaborators through local variables that `init()` declares hundreds of lines later, so they have no explicit dependencies, cannot be unit-tested, and break if construction order changes.

Goal: move each Collection-screen workflow into its own class in `src/app/`. Each class receives its dependencies through its constructor and owns the state it needs. `AppController` keeps only composition: it creates objects, connects them, and registers application-wide events.

This is a behavior-preserving refactor. Every user-visible behavior, message and file write stays the same, apart from the one deliberate change in D7.

Out of scope (tracked as separate tasks):

- splitting `GifExtractionSession`, or changing how either GIF screen works;
- giving the folder session (the object that grants disk access to the opened folder) a proper type;
- separating the domain model from the browser `File` type;
- changing how controls report events internally (for example the grid's own card and metadata wiring); only the events controls report to the application change (see D2);
- moving hard-coded user-facing text into `AppText`.

## 2. Target structure

Each workflow below is a class in `src/app/`. Each row lists the behavior it takes over from `AppWorkflows` (and the related closures in `init()`) and the state it will own.

| Workflow | Responsibility | State it owns |
|---|---|---|
| `ActivityReporter` | Reports progress, success and failure to the Activity log, including the repeated formatting of an error into "technical details" text. | none |
| `CollectionFileWriter` | Writes a collection's `.txt` file into the opened folder. Used by save, add-to-collection and delete. | none |
| `CollectionViewWorkflow` | Keeps the clip grid, collection selector and toolbar in step with the working clip sequence. Applies a loaded selection, owns the grid cache keys, and handles reordering, remove-from-view and title hiding. | none |
| `FolderSelectionWorkflow` | Opens a folder (picker or Pipelines catalog), reloads or switches the selected collection, refreshes the open folder, resolves the missing-clips conflict, and runs the "unsaved changes" prompt before any of these. | the pending action awaiting the unsaved-changes answer; the switch revision counter |
| `CollectionSaveWorkflow` | Saves the active collection, and runs Save as Collection when the pipeline view is active. | none |
| `AddToCollectionWorkflow` | Adds the selected clips to an existing or new collection, rolling the in-memory change back if the file write fails. | none |
| `DeleteFromDiskWorkflow` | Runs the delete flow: the optional save-first preflight, confirmation, file deletion, and rewriting of collections that listed the deleted clips. | the pending delete request |
| `ZoomWorkflow` | Opens and browses Zoom, opens the Zoom edit menu, runs a video edit, and inserts the created clip into the pipeline or collection view. | none |
| `GridContextMenuWorkflow` | Opens the grid's right-click menu after checking whether the clicked clip can be refined. | the menu revision counter |
| `CollectionRefinementWorkflow` | Starts refining a saved collection clip from its original movie, and handles Back. | the refinement revision counter |

Two small standalone components answer control queries (D3). The collection-name acceptance component combines the name-validity and already-exists checks (D6) for both collection dialogs. The Refine leave policy answers whether the collection Refine screen may be left, from the refinement session's extraction state.

Thin event handlers, such as keyboard dispatch to the active screen and the fullscreen toggle, may stay in `AppController` as wiring.

## 3. Decisions

| ID | Decision | Rationale |
|---|---|---|
| D1 | Each workflow is a class with constructor dependencies and owns the state listed in section 2. Nothing in `init()` keeps workflow state in local `let` variables, and no class is declared inside a method. | Makes ownership and dependencies explicit and the workflows testable on their own. |
| D2 | Controls report user intent to the application as typed events that workflows subscribe to, replacing constructor callbacks. Each such control declares its events as an `I`-prefixed event map (for example `IMainToolbarEvents` with `saveRequested`). Event names say what happened, not what to do. Several subscribers are allowed and are called in subscription order. Subscribing returns a function that unsubscribes. This covers about 25 notifications on about 9 controls: the main toolbar, clip grid, application shell, collection selector, Save as Collection dialog, Add to Collection dialog, Zoom overlay, Pipelines catalog, and the collection Refine screen's Back. The execution plan lists them exactly. | A control can then be swapped for any control that emits the same events, and several workflows can react to one control without the control knowing about them. |
| D3 | Two other kinds of callback are not events. First, queries a control asks need exactly one answer, so they stay constructor dependencies. A query is answered by the standalone component that owns the rule or state behind it, never by a workflow. If an answer would depend on state only a workflow holds, that state moves into its own component first. Today's queries map as follows: whether a new collection name is acceptable (both collection dialogs) is answered by a component combining the D6 checks; whether fullscreen is active by `FullscreenAdapter`; how a clip is labelled by `ClipLabelFormatter`; whether new Zoom playback starts with audio by `AppSettingsService`; and whether the collection Refine screen may be left by a small leave-policy component that reads the refinement session's extraction state. Second, replies to one request, such as the handlers passed when a workflow opens a dialog or menu, stay arguments of that call, because only the workflow that made the request should receive the answer. | Events fit notifications with any number of listeners. A query needs a single answerer that owns its rule, and these components exist before the controls, so no registration step is needed. A reply belongs to whoever asked. |
| D4 | Workflows drive the UI and subscribe to it only through narrow `I`-prefixed interfaces declared beside the workflow that uses them (for example an `IDeleteFromDiskDialog` with the open and close calls the delete flow uses). Workflow files do not import from `src/ui/`. `AppController` is the only file that knows both workflows and concrete controls. Controls are created first; each workflow subscribes in its constructor and unsubscribes when disposed. Shutdown disposes workflows before it destroys controls. No late binding or `!`-asserted field is needed. | Keeps dependencies pointing from UI to app, lets tests pass small fakes, and removes the construction-order dependency. |
| D5 | A test fails if an application-level control event has no subscriber. `init()` ends by asserting that each event listed for the application has at least one subscriber, and reports the ones that do not. A unit test covers the assertion, and the existing integration tests run it because they all call `init()`. | Catches a forgotten connection at test time instead of at the first click. |
| D6 | Collection names are checked in two separate steps. The validator decides whether a name is valid in itself (empty, illegal characters, or a Windows-reserved shape); this check exists today as `Collection.validateCollectionName`, and `CollectionNameValidator` turns its result codes into user text. `Pipeline` answers whether a collection with that name already exists, using today's case-insensitive match on the collection's file name. Save as Collection and Add to Collection both call the two checks; neither flow re-implements them. Add to Collection keeps its separate rule that a new collection cannot have the same file name as the active collection. | Name validity and uniqueness are different questions with different owners. Uniqueness is an invariant of the pipeline's set of collections. |
| D7 | The optional Electron adapters behind the GIF and collection-refinement workflows get a factory that returns no adapter when the desktop API is missing. This covers frame review, thumbnail cache, clip extraction, saved captures and collection refinement. `AppController` no longer matches error-message text. The GIF workflow needs frame review, thumbnail cache, clip extraction and saved captures. If any of these is missing, the GIF workflow is unavailable and the rest of the app still starts. This includes the saved-captures adapter, whose absence currently stops the app from starting. Collection refinement additionally needs the collection-refinement adapter; without it, Refine is not offered, as today. | Removes coupling to exact error strings, and makes all optional adapters behave consistently. This is the only intended behavior change. |
| D8 | Save as Collection becomes something a caller can wait for. When the pipeline view is active, saving opens the Save as Collection dialog and resolves once the user saves or cancels; Escape counts as cancel. A failed save keeps the dialog open and the wait continues, as the dialog behaves today. The delete preflight and the unsaved-changes prompt wait for that result, then continue or stop. They no longer leave a flag behind for the save-as code to pick up. | Removes the cycle in which save-as had to know about pending deletes and pending selection changes. |
| D9 | Before any workflow moves, characterization tests (tests that record what the code does today, so a later change in that behavior fails them) cover the flows the current tests do not reach. These are: the missing-clips conflict (Apply and Cancel), opening a catalog pipeline with unsaved changes, refreshing the open folder after an extraction publishes into it (clean, and deferred until save), and the guard cases when collection refinement starts (unsaved changes block it, a cancelled source lookup returns to Collection, and a folder or collection change during lookup stops it). The last two groups need fakes of the GIF-related desktop APIs in the integration test setup. | The refactor relies on tests to prove nothing changed. These flows have no app-level test today. |
| D10 | The workflows move one per commit, starting with those that have no dependencies on other workflows. A control switches from callbacks to events (D2) in its own commit; until each consuming workflow has moved out, `AppController` subscribes on its behalf and forwards to the existing code, and the workflow takes the subscription over when it moves. Every commit keeps the unit, integration and type checks green. The end-to-end scenarios and the manual check (section 5) run once at the end. | Each step is small, reviewable and revertible, without repeating the slow checks for every commit. |

## 4. Ownership and constraints

- Workflows depend on `PipelineSession`, domain types, adapters through their existing service types, other workflows' public methods, and the interfaces from D4. They do not reach into control internals or query the DOM.
- Workflows depend on each other in one direction only. For example, delete uses save and folder selection; save uses neither. D8 is what makes this possible.
- `AppSessionState` keeps only the current folder session. The pending selection action moves to `FolderSelectionWorkflow` (section 2).
- User-facing text stays exactly as it is today, including strings that are hard-coded rather than in `AppText`.
- The GIF Extraction and Refine GIF screens, `GifExtractionSession` and the shell are not restructured. Only their wiring in `AppController` changes, and only where D7 requires it.

## 5. Acceptance behavior

The refactor is complete when all of the following hold:

1. The existing unit and integration tests and the new characterization tests (D9) pass. Existing tests change only for import paths, the D7 availability case, controls whose tests passed constructor callbacks and now subscribe to events (D2), and state that moved owner: the pending-action checks in `tests/unit/state.spec.ts` move to the `FolderSelectionWorkflow` tests.
2. The Electron end-to-end scenarios pass: `tests/e2e/scenarios.spec.ts` (load, switch views, save as collection, add to collection, delete with collection rewrite, zoom and fullscreen, Loopify) and `tests/e2e/collection-refine.spec.ts`.
3. A manual check in the running app shows unchanged behavior for:
   - opening a folder;
   - switching collections with unsaved changes, answering Save, Discard and Cancel;
   - Save as Collection with a valid name, an invalid name and an existing name;
   - Add to Collection, both to an existing collection and to a new one;
   - deleting from disk with the save-first preflight;
   - Zoom with Loopify;
   - refining a saved collection clip.
4. `AppController.init()` contains only construction and application-wide event registration. It declares no class and keeps no workflow state.
5. None of the new workflow files imports from `src/ui/`. Existing imports from `src/ui/` in other app files are a separate task.
6. A host missing any of the optional adapters in D7 still starts the Collection and Settings screens. Opening a movie then reports that movie opening is unavailable.
7. `docs/agent-docs/agent-architecture-map.md` is updated with the `doc-update` skill to describe the new workflow ownership.

## Rejected alternatives

- R1: Keep controls' constructor callbacks and connect them to workflows through a typed late-binding registry in `AppController` - rejected because it ties each control to one consumer and makes swapping a control mean reproducing callback calls; superseded by D2 and D4.
- R2: Keep the collection-name rule as one combined check in `CollectionNameValidator` - rejected because name validity and name uniqueness are different questions with different owners; superseded by D6.
- R3: Refactor relying on the existing tests only - rejected because several flows have no app-level test; superseded by D9.
- R4: Turn every control callback into an event, including queries and replies to a single request - rejected because a query needs exactly one answerer and a reply belongs to the requester; superseded by D3.
- R5: Let workflows answer control queries, through registration methods on the controls - rejected because a workflow coordinates actions and the rule or state behind a query has its own owner; superseded by D3.
