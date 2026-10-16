# Remaining code review findings

Checked against `refactor/gif-session-boundaries` on 2026-10-16. Findings #1-#4, #6, #9 and #13 are fixed. The eight below are still open. Each entry gives the current evidence, why it is worth fixing, a suggested fix, and a rough size: S is a few hours, M a day, L several days with a spec and plan.

Suggested order, smallest and safest first: #14, #11, #12, #7, #8, #10, #15, #5. The reasons are at the end.

---

## #14 The `Collection` API has misleading field names and duplicate operations (S)

**Where:** `src/domain/collection.ts:34` (`CollectionMaterialization`), and the duplicate method pairs on `Collection`.

**What is wrong:**
- In `CollectionMaterialization`, a field called `collection` holds a `ClipSequence` (the clips in view) when the result is `loaded`, and a `Collection` (the saved list) when the result is `has-missing`. The same name means two different types depending on `kind`.
- `matchKind` (line 31) and `partialCollection` (line 43) are declared but nothing in `src/` reads them.
- `Collection` offers two names for each of three operations:
  - `addClips` and `appendMissingClipNames`;
  - `removeVideos` and `withoutClipNames`;
  - `toCollection` and `withFilename`.
  
  In each pair, one name has only a couple of callers.

**Why fix it:** a reader or caller who trusts the name is misled. For example, `result.collection.filename` is `undefined` for a loaded selection, because that value is a `ClipSequence`. The duplicate names double the API without adding behavior, so every change has to be made twice or the pair drifts apart.

**Suggested fix:**
- Rename the fields by what they hold: `sequence` for clips in view, `savedCollection` for the saved list. Remove `collection` from the `loaded` case.
- Delete `matchKind` and `partialCollection`.
- For each duplicate pair, keep one name, the one that says what the result is (`withClipsAdded`, `withoutClips`, `renamedTo`), and move the callers over.
- Delete the unused `availableVideoFiles` plus `nextClipId` branch of `materializeClipSequence`. It creates new `Clip` objects outside `Pipeline`, which breaks the one-clip-per-video rule.

Tests: the existing domain tests, plus a type-level check that the `loaded` case has no `savedCollection`.

---

## #11 Code everywhere branches on capture endpoint kind; static "Value" classes; an unregistered free function (S-M)

**Where:**
- `src/domain/capture-endpoint.ts:26`;
- 9 frame-index branches in `movie-range-session.ts`, `capture-queue.ts`, `range-capture-model.ts`, `frame-review-player-control.ts` and `refine-gif-screen.ts`;
- `src/app/app-settings.ts:17`.

**What is wrong:**
- A capture endpoint is one of three kinds: an exact frame, a saved exact frame (frame number and hash restored from disk), or a playback timestamp. Getting an endpoint's frame number or hash requires the same branch everywhere: `start.kind === 'exact-frame' ? start.identity.frameIndex : start.frameIndex`.
- `CaptureEndpointValue`, `CapturedRangeValue` and `FrameReviewWireValue` are classes that are never instantiated. They are bags of static functions named as if they were value objects.
- `isStartupScreenId` is a module-level function. The object-oriented exception register says no such function is registered.

**Why fix it:** adding an endpoint kind, or changing what "the frame of an endpoint" means, requires finding every ternary across the domain, app and UI layers. `coding-quality.md` asks for behavior on the owning type rather than branching on kind. The static-namespace naming hides that these are just helper functions, and the unregistered free function contradicts the register.

**Suggested fix:**
- In the domain, add helpers that answer the shared questions: `CaptureEndpoints.frameIndexOf(endpoint)`, `CaptureEndpoints.frameHashOf(endpoint)` and `isExactLike(endpoint)`. They return `null` for playback timestamps. Replace the 9 ternaries with them.
- Rename the static classes by what they do (`CaptureEndpoints`, `CapturedRanges`, `FrameReviewWire`). Endpoints stay as plain readonly data so saved and wire formats are unaffected.
- Make `isStartupScreenId` a static method of `AppSettingsParser`, which already owns startup-screen membership, or record it in the exception register.

Tests: unit tests for the new helpers; the existing GIF tests cover the replaced call sites.

---

## #12 User-facing text and key bindings live in the domain and business layers (M)

**Where:**
- `src/domain/range-capture-model.ts:197` returns "Press Q to begin a new range.";
- `src/business-logic/video-edit-catalog.ts` holds SVG icon paths, labels and descriptions for the Zoom edit menu;
- `src/domain/collection-description-validator.ts:65` (`formatLogEntry`) formats `err.log` text.

**What is wrong:** presentation details sit in inner layers. The domain names a keyboard key that the UI's shortcut table owns. A business-logic catalog holds icons. A domain validator writes log-file text.

**Why fix it:**
- Changing the start-range key in the keyboard handler would leave the domain still telling users to press Q.
- Changing a menu icon means editing business logic.
- Changing the error-log format means editing a domain validator.

The UI guideline places display text in controls or a text service, and `coding-quality.md` keeps presentation out of the domain.

**Suggested fix:**
- **Domain rejections:** `RangeCaptureModel` returns a reason code (`{ kind: 'rejected', reason: 'range-already-locked' }`). The GIF screen turns it into text, taking the key name from `GIF_EXTRACTION_SHORTCUTS` so the message always matches the binding. A small UI text class maps codes to messages, keeping the wording out of the screens' logic.
- **Video edit catalog:** split it. The business-logic catalog keeps edit kinds and their rules. A UI catalog (`ZoomEditMenuItems`) keeps icons, labels and descriptions, keyed by edit kind.
- **Error log:** move `formatLogEntry` into `AppDiagnostics`, the application component that writes `err.log`. The validator keeps returning structured results.

Tests: the existing domain tests change from messages to reason codes, plus a UI test that the message names the bound key.

---

## #7 The extraction contract lives inside the frame-review subsystem; two validators disagree on handle format (M)

**Where:**
- `src/frame-review/clip-extraction-api.ts`, imported by business logic, the app layer and the Electron adapter;
- `src/business-logic/clip-extractor.ts:45-48`;
- `src/frame-review/frame-review-api.ts:97`.

**What is wrong:**
- The clip-extraction and collection-publication contract lives in `src/frame-review/`, even though the architecture map keeps extraction, naming and pipeline rules outside that boundary. That contract covers extraction requests, `collectionName`, `saveCollection` and the destination entries.
- The renderer validates the same opaque handles twice, with different rules:
  - `ClipExtractor` requires `^source_…{8,120}` and `^destination_…{8,120}`;
  - `FrameReviewOpaqueId` accepts any `^[a-zA-Z0-9_-]{16,128}$`.
  
  Today both pass, because the main process happens to use those prefixes (`frame-review-host.ts:129`, `clip-extraction-runtime.cjs:180`).

**Why fix it:**
- Frame review is meant to be an exact-frame engine. With the collection contract inside it, frame review effectively owns collection semantics, and a change to how collections are saved touches the frame-review subsystem.
- The handles are meant to be opaque. If the main process changes its prefix or length, every extraction fails with "The source handle is invalid.", although nothing is wrong.

**Suggested fix:**
- Move `clip-extraction-api.ts` to `src/app/clip-extraction-service.ts`, beside the other service contracts the app uses, such as `clip-captures-store-service.ts`. Update its six importers. The Electron adapter then implements an app-layer contract, as it already does for capture storage.
- Validate opaque handles in one place: a shared `OpaqueHandle.parse(value, label)` with the generic rule, used by both `FrameReviewOpaqueId` and `ClipExtractor`. Drop the prefix checks from `ClipExtractor`.

Tests: an extractor test that accepts a handle without the `source_` prefix; the existing extraction tests.

---

## #8 Storage formats live inside domain classes (M)

**Where:** `src/domain/range-capture-model.ts:30-120` and `src/domain/collection.ts` (`.txt` naming, `toText`).

**What is still wrong:**
- `RangeCaptureModel` owns its saved JSON format: `schemaVersion`, decimal-string encoding of large numbers, the 500-range cap, and `ISavedRangeCaptureData`. The Electron adapter and the app's capture store import that format.
- The serializer writes saved endpoints as `kind: 'exact-frame'` and reads them back as the runtime kind `saved-exact-frame`, so the stored kind name and the in-memory kind name differ.
- `Collection` builds its identity and rules around the `.txt` file: filename normalization, Windows reserved names, `toText()`.
- The refinement half of this finding is fixed: Collection Refine now uses `RangeCaptureModel.withExactRange` instead of a fake saved record.

**Why fix it:**
- A change to the saved-capture file (a new field, a version bump, a migration) means editing the domain model and re-testing every capture rule with it.
- Mismatched kind names make the saved file harder to reason about and easy to mis-migrate.
- Keeping storage out of the domain is a stated axiom.

**Suggested fix:**
- **Capture codec:** add `SavedCaptureCodec` in `src/app/`, next to `SavedCaptureQueuePersistence`. It owns the JSON shape, the version, the encoding of large numbers and the size cap, and converts between the file and the model. It builds models through a domain factory that takes already-parsed endpoints: `RangeCaptureModel.restore(ranges, draft, nextSequence, generation)`. The domain keeps only rules.
- **Kind name:** in the same change, make the stored kind `saved-exact-frame`. Keep reading `exact-frame` for files written before.
- **Collection text format:** move the file text format (`toText`, parsing) to a `CollectionTextFormat` next to `CollectionFileWriter`. The rules about a collection's name that hold whatever the storage (illegal characters, reserved names) stay in the domain, because users see them as name rules.

Tests: round-trip codec tests, including a file written by today's code (a fixture), so existing saved captures still load.

---

## #10 `ElectronFileSystemService` does many jobs under one name; the folder session is untyped (M-L)

**Where:** `src/adapters/electron/electron-file-system-service.ts` (364 lines) and `AppSessionState.currentFolderSession: unknown`. There are 35 uses of an `unknown` folder session or of `canMutateDisk(...)` narrowing.

**What is wrong:**
- One adapter does all of these:
  - picking and refreshing folders;
  - the Pipelines catalog (list, describe, open);
  - saving and appending text files, and deleting files;
  - forwarding video edits;
  - building renderer `File` objects;
  - validating file names.
- `AppController` passes the same object under seven role names (`folders`, `files`, `folderFiles`, `catalog`, `runtimeEditingService`, …), so each consumer depends on all of it.
- The folder session, the object that grants disk access to the opened folder, is typed `unknown`. Each call site re-narrows it with `canMutateDisk`.

**Why fix it:**
- The name hides most of what the class does.
- A change to, say, catalog discovery reopens a class that also deletes files.
- With `unknown`, the type checker cannot catch a wrong value being stored or passed as the folder session.
- This is the widest remaining violation of "one cohesive reason to change".

**Suggested fix:**
- **Type the folder session:** define `IFolderSession` (`folderPath`, an access mode) in the app layer and type `AppSessionState.currentFolderSession` and the workflows with it. Keep one type guard at the boundary where an unchecked value enters, and remove the other narrowings.
- **Split the adapter by job,** each implementing the narrow interface its consumers already declare:
  - `ElectronFolderService`: pick, refresh, renderer files;
  - `ElectronPipelineCatalogService`: list, describe, open;
  - `ElectronFolderFileService`: save, append, delete, name validation;
  - the existing `ElectronVideoEditService` for edits.
  
  `AppController` builds the four and passes each where it belongs.

Size: about one day, with the existing workflow tests as the safety net. The folder-session typing can land first as its own step.

---

## #15 Class names do not follow one vocabulary (M, mostly mechanical)

**Where:** ten classes end in `Session` with different meanings.

| Class | What it is | Suggested name |
|---|---|---|
| `GifExtractionSession`, `CollectionClipRefinementSession`, `MovieRangeSession` | holds an opened movie | keep |
| `ReviewSession` (frame-review host) | the live frame-review connection | keep |
| `PipelineSession` | working copy of the open folder's clips and selection | `PipelineWorkingCopy` |
| `FullscreenSession` | coordinates Collection full screen | `CollectionFullScreenWorkflow` |
| `RefineGifSession` | draft of one range being refined | `RangeRefinementDraft` |
| `OpenFolderRefreshSession` | refreshes the open folder after a publish | `OpenFolderRefresher` |
| `GifCaptureThumbnailSession` | thumbnail slots for the draft and ranges | `CaptureThumbnails` |
| `ExtractionDestinationSession` | publishes clips into a folder or collection | `ExtractionPublisher` |

**What is wrong:** the same suffix means a working copy, a coordinator, a draft, a refresher, a thumbnail store and a publisher. The Controller/Control mix and the `I`-prefixed type alias from the original finding are already fixed.

**Why fix it:** a reader cannot tell from a name whether a class holds state, coordinates a flow, or is a short-lived draft. The UI guideline's naming rule (one meaning per suffix) is broken by existing code, which invites new code to copy it.

**Suggested fix:**
- Rename as in the table, one class per commit, with the architecture map and the guideline's examples updated in the same commits.
- Leave "Gif" in names, as decided.
- Leave `folderSession` (the access grant) until #10 types it; it then becomes `folderAccess`.

Size: mechanical, but it touches many files and tests. Doing it after #10 avoids renaming code that #10 rewrites.

---

## #5 The domain's `Clip` and `Pipeline` are built on the browser `File` type (L)

**Where:**
- `src/domain/clip.ts:8` (`ClipFileSnapshot extends File`, with `path`, `mediaSource` and `webkitRelativePath`);
- `src/business-logic/clip-editor.ts:68` reads `clip.file.path`;
- `src/business-logic/PipelineFactory.ts`.

**What is wrong:** the core domain object is a browser `File` subclass. It also carries Electron details: an absolute desktop path and a `file://` media address. The fake one-byte `File` objects the original finding mentioned are gone, but the dependency remains.

**Why fix it:**
- The domain cannot be used or tested without a DOM `File` implementation; the unit tests rely on jsdom's.
- A different media host (another desktop shell, a web build, a server) would mean changing the domain.
- Edit requests reach into a browser object for a filesystem path.

**Suggested fix:**
- Introduce a domain value `ClipSource`: name, size, last-modified time, an opaque media address, and an optional desktop path. `Clip` and `Pipeline` depend on it only.
- The Electron folder adapter builds `ClipSource` values. The grid and the Zoom overlay use the media address for playback.
- Anything that truly needs a `File` (none found in the domain flows) gets it at the adapter.
- Move `ClipEditor`'s path lookup behind the video-edit service, which already lives in the desktop layer.

This touches folder loading, collections, the grid, Zoom and edits, so it deserves its own spec and plan like the two refactors before it. Size: several days.

---

## Why this order

- **#14 and #11** are small, local and low-risk, and make the domain easier to read before larger moves.
- **#12** moves text and icons outward and is independent of the rest.
- **#7 and #8** sort out what the app layer owns versus frame review and the domain. #8 also fixes the saved-kind mismatch before any future format change.
- **#10** is the biggest boundary cleanup outside the domain. It is easier once #7 has moved the extraction contract.
- **#15** renames many classes, so it waits until #10 has rewritten the folder code it would otherwise rename twice.
- **#5** is the deepest change and benefits from all of the above being settled. It should go through a spec and plan.
