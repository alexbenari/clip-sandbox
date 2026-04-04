# Implement Folder-Scoped Collection Enumeration

## Why this matters

Users need collection management to feel folder-native instead of file-picker driven. After selecting a folder, they should see the available collections immediately, switch between them from the toolbar, and avoid losing edits when changing collections or folders. This work also clarifies the data model by separating serialized collection descriptions from the active runtime collection.

## Progress

- [x] (2026-03-22 00:00Z) Approved feature spec captured in `docs/specs/collection-enumeration-spec.md`.
- [x] (2026-03-22 00:10Z) Initial ExecPlan drafted in `docs/plans/collection-enumeration-exec-plan.md`.
- [x] (2026-03-22 00:20Z) Prototyped and implemented top-level-only filtering plus best-effort folder-local `err.log` appends.
- [x] (2026-03-22 00:28Z) Added `ClipCollectionDescription`, `CollectionDescriptionValidator`, and `ClipCollectionInventory`; refactored app state around them.
- [x] (2026-03-22 00:41Z) Replaced the center title with the collection dropdown and added the unsaved-changes dialog flow.
- [x] (2026-03-22 00:54Z) Refactored folder load into collection-first materialization with default-file source-of-truth and non-recursive behavior.
- [x] (2026-03-22 01:12Z) Updated save behavior, error logging, tests, and docs; completed full validation with `npm run test:all`.

## Surprises & Discoveries

- Discovery: the current fallback folder input path is recursive by default because it relies on `<input webkitdirectory ...>`, which returns files from subfolders as well as the top level.
  Evidence: [index.html](C:/dev/clip-sandbox/index.html) defines `#folderInput` with `webkitdirectory directory multiple`, and [load-clips.js](C:/dev/clip-sandbox/src/business-logic/load-clips.js) currently filters/sorts whatever file list it receives without depth filtering.

- Discovery: the current app can write directly into the selected folder only when `showDirectoryPicker()` is available and returns a writable directory handle.
  Evidence: [file-system-adapter.js](C:/dev/clip-sandbox/src/adapters/browser/file-system-adapter.js) exposes `pickDirectory()` and `saveTextToDirectory()`, while [app-controller.js](C:/dev/clip-sandbox/src/app/app-controller.js) falls back to downloads when `currentDirHandle` is absent.

- Discovery: collection loading today assumes the full folder clip set has already been materialized into `state.folderClips`, then derives a new `ClipCollection` from that in-memory list.
  Evidence: [load-collection.js](C:/dev/clip-sandbox/src/business-logic/load-collection.js) builds `ClipCollection.fromClipNames(...)` from `folderClips`, and [app-controller.js](C:/dev/clip-sandbox/src/app/app-controller.js) passes `state.folderClips` into collection loading.

- Discovery: there is no current dirty-state model, backing-file model, or pending-action model for the active collection.
  Evidence: [clip-collection.js](C:/dev/clip-sandbox/src/domain/clip-collection.js) stores only name/order/clips, and [app-state.js](C:/dev/clip-sandbox/src/app/app-state.js) stores only `currentDirHandle`, `folderClips`, and `currentCollection`.

- Discovery: the current center collection name is a passive `<span>`, while collection actions live in a separate custom menu.
  Evidence: [index.html](C:/dev/clip-sandbox/index.html) renders `#activeCollectionName` as a span and `#orderMenu` as an independent control.

- Discovery: folder-local `err.log` writing is only possible in writable-directory mode; the fallback `webkitdirectory` path can still enumerate files but cannot persist the log into the selected folder.
  Evidence: the shipped implementation appends via [`appendTextToDirectoryFile(...)`](/C:/dev/clip-sandbox/src/adapters/browser/file-system-adapter.js) only when `currentDirHandle` exists, and Playwright coverage confirms fallback mode logs warnings to the console instead.

- Discovery: default-file source-of-truth changes the expected initial visible clip count for a folder, so Playwright helpers cannot assume "visible clips === top-level videos" anymore.
  Evidence: [`tests/e2e/scenarios.spec.js`](/C:/dev/clip-sandbox/tests/e2e/scenarios.spec.js) needed an `expectedVisibleCount` override for the `default-source` fixture where `clips-default.txt` intentionally loads a subset.

## Decision Log

- Decision: use native HTML controls for the new UI surfaces: `<select>` for collection selection and `<dialog>` for unsaved-change confirmation.
  Rationale: the app is framework-free, the required interaction is simple, and native controls minimize code and accessibility overhead.
  Date/Author: 2026-03-22 / Codex

- Decision: each legal top-level `.txt` file is modeled as one `ClipCollectionDescription` class instance, distinct from the runtime `ClipCollection`.
  Rationale: this separates serialized file concerns from the active in-memory collection and gives collection enumeration a clear domain object.
  Date/Author: 2026-03-22 / Codex

- Decision: `[folder-name]-default.txt` is the backing file for the default collection and becomes the source of truth when it already exists.
  Rationale: users want the default collection to be stable and overwritable like any other collection while remaining first in the dropdown.
  Date/Author: 2026-03-22 / Codex

- Decision: collection inventory, active selection, dirty state, pending actions, and top-level video lookup should be encapsulated in a `ClipCollectionInventory` class rather than spread across bootstrap logic.
  Rationale: the feature introduces stateful switching behavior that should not be managed by loosely related top-level fields.
  Date/Author: 2026-03-22 / Codex

- Decision: validation logic for serialized collection files should be centralized in a `CollectionDescriptionValidator` class.
  Rationale: collection legality rules now drive enumeration, exclusion, logging, and load behavior, so one validation authority reduces drift.
  Date/Author: 2026-03-22 / Codex

- Decision: the folder selection flow should first discover top-level video inventory, then materialize only the collection that is about to be displayed.
  Rationale: when `[folder-name]-default.txt` exists, the app should not render the whole folder first and then switch; it should render the selected source-of-truth collection directly.
  Date/Author: 2026-03-22 / Codex

- Decision: for this feature, invalid collection-file diagnostics and related runtime errors should be appended to `err.log` in the selected folder, but only on a best-effort basis when folder write access exists.
  Rationale: the current browser fallback path does not provide arbitrary write access to the selected folder, so the plan must preserve behavior in both capability modes instead of assuming identical filesystem access.
  Date/Author: 2026-03-22 / Codex

- Decision: preserve the existing `Save as New` feature and integrate it with collection inventory updates unless implementation evidence shows it blocks the milestone.
  Rationale: removing an existing save path would be a regression; the new inventory model should absorb newly created explicit collections.
  Date/Author: 2026-03-22 / Codex

- Decision: the old manual "Load Collection" file-picker action is removed from the main shell; collection switching is now driven by folder enumeration through the centered dropdown.
  Rationale: the approved feature makes folder-scoped enumeration the primary model, and keeping the old manual load action would reintroduce ambiguity about whether the dropdown represents folder collections or arbitrary imported files.
  Date/Author: 2026-03-22 / Codex

## Outcomes & Retrospective

Shipped behavior:
- the centered toolbar title is now a native collection dropdown populated from folder-scoped collection inventory,
- folder load is non-recursive for both videos and `.txt` collection files,
- `[folder-name]-default.txt` is treated as the default collection source of truth when present,
- dirty collection switches and dirty folder changes now route through a native `Save` / `Don't Save` / `Cancel` dialog,
- save overwrites the active collection file and `Save as New` creates a new active explicit collection for the session,
- invalid collection-description files are excluded from the dropdown and appended to `err.log` when writable directory access exists.

Final model shape:
- [`ClipCollectionDescription`](/C:/dev/clip-sandbox/src/domain/clip-collection-description.js): serialized collection description class
- [`CollectionDescriptionValidator`](/C:/dev/clip-sandbox/src/domain/collection-description-validator.js): validation and log-diagnostic class
- [`ClipCollectionInventory`](/C:/dev/clip-sandbox/src/domain/clip-collection-inventory.js): folder-scoped collection inventory, active selection, dirty state, pending actions, and top-level video lookup
- [`AppState`](/C:/dev/clip-sandbox/src/app/app-state.js): current directory handle, id counter, active `ClipCollection`, and active `ClipCollectionInventory`

Limitation carried forward:
- in fallback browser mode without a writable directory handle, the app cannot persist `err.log` into the selected folder; it still excludes invalid files and logs diagnostics to the browser console.

Validation evidence:
- `npm run unit` -> `11` files passed, `57` tests passed
- `npm run e2e` -> `38` scenarios passed
- `npm run test:all` -> full suite passed end to end

Docs updated:
- [`docs/documentation/user-guide.md`](/C:/dev/clip-sandbox/docs/documentation/user-guide.md)
- [`docs/documentation/developer-guide.md`](/C:/dev/clip-sandbox/docs/documentation/developer-guide.md)

Follow-up candidates:
- if the product later needs folder-local logging in fallback browser mode, the app will need runtime/deployment infrastructure beyond the current static browser architecture
- if users need to inspect errors inside the UI, `err.log` formatting is now simple enough to back a future in-app log panel

## Context and orientation

This repository is a browser-based local video-review app with no UI framework. The app shell is [index.html](C:/dev/clip-sandbox/index.html); runtime wiring happens in [app-controller.js](C:/dev/clip-sandbox/src/app/app-controller.js). The deployed Windows workflow serves the app as static files through `miniserve`, so all browser filesystem behavior depends on standard web APIs plus the optional File System Access API.

Key current modules:
- [load-clips.js](C:/dev/clip-sandbox/src/business-logic/load-clips.js): filters/sorts files and creates a `ClipCollection` from a file list.
- [load-collection.js](C:/dev/clip-sandbox/src/business-logic/load-collection.js): parses one chosen collection file and applies validation/missing-entry logic against `folderClips`.
- [save-order.js](C:/dev/clip-sandbox/src/business-logic/save-order.js): serializes the active collection as text and writes it to the selected directory or downloads it.
- [clip-collection.js](C:/dev/clip-sandbox/src/domain/clip-collection.js): runtime collection model containing collection name plus ordered clip membership.
- [file-system-adapter.js](C:/dev/clip-sandbox/src/adapters/browser/file-system-adapter.js): capability checks, directory enumeration, and direct-write helpers.
- [app-state.js](C:/dev/clip-sandbox/src/app/app-state.js): centralized mutable session state.
- [app-text.js](C:/dev/clip-sandbox/src/app/app-text.js): user-facing copy and status strings.
- [order-menu-controller.js](C:/dev/clip-sandbox/src/ui/order-menu-controller.js): custom menu interaction for current collection actions.
- [tests/e2e/scenarios.spec.js](C:/dev/clip-sandbox/tests/e2e/scenarios.spec.js): end-to-end coverage for folder load, collection load, save, zoom, and fullscreen behavior.
- [tests/unit/business-logic.spec.js](C:/dev/clip-sandbox/tests/unit/business-logic.spec.js): unit coverage for business-logic modules including save behavior.

Terms used in this plan:
- `ClipCollectionDescription`: a class representing one serialized collection file, including collection name, backing filename, and ordered clip names.
- `ClipCollection`: the runtime in-memory collection object rendered in the grid.
- `ClipCollectionInventory`: a new stateful class that owns the available descriptions for the active folder, the active selection, dirty state, pending switch/folder actions, and access to the top-level video-file lookup used to materialize collections.
- `top-level video inventory`: the set of supported video files directly under the selected folder, excluding all subfolders.
- `default collection`: the special collection entry named `[folder-name]-default`, backed by `[folder-name]-default.txt`.

Critical assumptions that implementation must preserve:
- folder scanning is non-recursive for both videos and `.txt` collection files,
- invalid `.txt` files are excluded from the dropdown without user-facing interruption,
- missing-entry handling for selected collections remains actionable and non-destructive,
- the app still works in both capability modes: File System Access directory-handle mode and fallback hidden-file-input mode.

## Milestone 0 - Probe filesystem capability boundaries

### Scope

Reduce implementation risk around two browser-specific constraints:
- enforcing top-level-only enumeration on both directory-handle and fallback-input paths,
- writing `err.log` into the selected folder when direct folder write access may not exist.

### Files

- [file-system-adapter.js](C:/dev/clip-sandbox/src/adapters/browser/file-system-adapter.js)
- [app-controller.js](C:/dev/clip-sandbox/src/app/app-controller.js)
- [tests/unit/business-logic.spec.js](C:/dev/clip-sandbox/tests/unit/business-logic.spec.js)
- [tests/e2e/scenarios.spec.js](C:/dev/clip-sandbox/tests/e2e/scenarios.spec.js)

### Changes

- Add a narrowly scoped prototype/helper layer for:
  - filtering a `FileList` or `File[]` down to top-level entries only using `webkitRelativePath` depth when the fallback input path is used,
  - separating top-level videos from top-level `.txt` candidates,
  - appending plain-text diagnostics to `err.log` when a writable directory handle exists.
- Explicitly decide the fallback behavior for `err.log` when there is no writable directory handle. Preferred containment: skip folder-local log write, keep the invalid file excluded, and record the limitation in status/console/tests so the behavior is predictable.

### Validation

- Command: `npm run unit`
  Expected: unit coverage proves top-level filtering works for directory-like and fallback-input-like file lists.

- Command: `npm run e2e -- --grep "Load via folder selection|Save collection direct write path"`
  Expected: existing direct-write and folder-load scenarios still pass before broader refactors begin.

### Rollback/Containment

If the helper experiment adds noise or couples too much to bootstrap, keep only the top-level filtering helpers and defer `err.log` persistence wiring until Milestone 4, but preserve the documented capability limitation.

## Milestone 1 - Introduce collection-description and inventory domain model

### Scope

Create the new domain/state building blocks needed by collection enumeration without changing the visible UI yet.

### Files

- [clip-collection.js](C:/dev/clip-sandbox/src/domain/clip-collection.js)
- `src/domain/clip-collection-description.js`
- `src/domain/collection-description-validator.js`
- `src/domain/clip-collection-inventory.js`
- [app-state.js](C:/dev/clip-sandbox/src/app/app-state.js)
- [load-clips.js](C:/dev/clip-sandbox/src/business-logic/load-clips.js)
- [load-collection.js](C:/dev/clip-sandbox/src/business-logic/load-collection.js)
- `tests/unit/domain.spec.js` or the existing unit test files that best fit the new coverage

### Changes

- Add a `ClipCollectionDescription` class that:
  - represents one serialized collection file,
  - derives collection names from filenames,
  - exposes the ordered clip-name payload used for save/load.
- Extend `ClipCollection` so it can:
  - materialize itself from a `ClipCollectionDescription` plus available top-level video files,
  - produce a `ClipCollectionDescription` for save.
- Add a `CollectionDescriptionValidator` class to centralize:
  - empty-file checks,
  - duplicate-entry checks,
  - legal `.txt` collection parsing,
  - invalid-description diagnostics suitable for `err.log`.
- Add a `ClipCollectionInventory` class to own:
  - available descriptions for the active folder,
  - the active description,
  - dirty state,
  - pending action metadata,
  - top-level video-file lookup for materialization.
- Refactor `app-state.js` so app state holds:
  - current directory handle / folder context,
  - active `ClipCollection`,
  - `ClipCollectionInventory`.
- Keep old helper names temporarily if needed, but make the new objects the source of truth for subsequent milestones.

### Validation

- Command: `npm run unit`
  Expected: new domain tests pass for description parsing, default-name derivation, dirty tracking, and collection materialization.

- Command: `Get-ChildItem -Recurse src\\domain | Select-Object Name`
  Expected: the repo now contains explicit domain modules for collection descriptions, validation, and inventory.

### Rollback/Containment

If the refactor destabilizes too many import paths at once, keep compatibility wrappers in [load-collection.js](C:/dev/clip-sandbox/src/business-logic/load-collection.js) and [load-clips.js](C:/dev/clip-sandbox/src/business-logic/load-clips.js) until Milestone 3 finishes, but do not let bootstrap bypass the new inventory model.

## Milestone 2 - Replace title text with collection dropdown and add unsaved-change dialog

### Scope

Ship the new top-bar interaction model: folder-scoped collection selection via centered dropdown plus a modal confirmation flow for dirty changes.

### Files

- [index.html](C:/dev/clip-sandbox/index.html)
- [app-controller.js](C:/dev/clip-sandbox/src/app/app-controller.js)
- [app-text.js](C:/dev/clip-sandbox/src/app/app-text.js)
- [event-binding.js](C:/dev/clip-sandbox/src/app/event-binding.js)
- [order-menu-controller.js](C:/dev/clip-sandbox/src/ui/order-menu-controller.js)
- new UI helper if needed, for example `src/ui/collection-selector-controller.js`
- integration/unit test files covering DOM behavior
- [tests/e2e/scenarios.spec.js](C:/dev/clip-sandbox/tests/e2e/scenarios.spec.js)

### Changes

- Replace `#activeCollectionName` span with a native `<select>` that:
  - stays visually centered and blue,
  - renders the default entry first,
  - renders explicit entries alphabetically,
  - excludes duplicate display of `[folder-name]-default.txt`.
- Add a native `<dialog>` for unsaved-change handling with:
  - `Save`,
  - `Don't Save`,
  - `Cancel`.
- Update bootstrap event flow so:
  - selection changes route through `ClipCollectionInventory`,
  - clean switches apply immediately,
  - dirty switches open the dialog,
  - `Cancel` restores the previous selection visually and logically.
- Keep the existing collection action menu for save/save-as-new unless implementation proves a better UI consolidation, but collection switching itself should move fully into the dropdown.

### Validation

- Command: `npm run e2e -- --grep "Collection menu interactions|Collection load"`
  Expected: old menu tests are updated or replaced, and new dropdown-selection behavior is covered.

- Command: `npm run unit`
  Expected: dialog and selection state helpers pass without regression to unrelated keyboard handling.

### Rollback/Containment

If the native `<dialog>` path proves flaky in Playwright or unsupported in a target browser, contain the change by keeping the dialog API behind a thin controller so the surface can be restyled or swapped without undoing the inventory logic.

## Milestone 3 - Refactor folder load into collection-first materialization

### Scope

Change folder load so the app discovers inventory first, resolves the collection that should be displayed, and renders only that collection's clips.

### Files

- [app-controller.js](C:/dev/clip-sandbox/src/app/app-controller.js)
- [file-system-adapter.js](C:/dev/clip-sandbox/src/adapters/browser/file-system-adapter.js)
- [load-clips.js](C:/dev/clip-sandbox/src/business-logic/load-clips.js)
- [load-collection.js](C:/dev/clip-sandbox/src/business-logic/load-collection.js)
- any new inventory-oriented business-logic modules such as:
  - `src/business-logic/load-collection-inventory.js`
  - `src/business-logic/materialize-collection.js`
- [clip-collection-grid-controller.js](C:/dev/clip-sandbox/src/ui/clip-collection-grid-controller.js)
- [tests/e2e/scenarios.spec.js](C:/dev/clip-sandbox/tests/e2e/scenarios.spec.js)

### Changes

- Introduce a folder-load pipeline that:
  - enumerates top-level entries only,
  - separates videos and `.txt` files,
  - validates `.txt` files into inventory descriptions,
  - chooses the initial active collection,
  - materializes only that collection's clips into the grid.
- Enforce source-of-truth behavior:
  - if `[folder-name]-default.txt` exists and is valid, load it automatically,
  - otherwise derive the implicit default collection from top-level videos.
- Preserve missing-entry conflict behavior when a chosen collection references clips not found in the top-level inventory.
- Update count/title/document-title behavior so they reflect the materialized active collection rather than the full top-level folder contents.

### Validation

- Command: `npm run e2e -- --grep "Load via folder selection|Collection load"`
  Expected: new scenarios prove default-file auto-load, implicit default fallback, non-recursive inventory filtering, and direct collection materialization.

- Command: `npm run unit`
  Expected: business-logic tests pass for inventory building and collection materialization without requiring DOM rendering.

### Rollback/Containment

If the full refactor is too large for one step, keep a compatibility path that still stores top-level video inventory in memory, but ensure rendering happens only from the selected collection before this milestone is marked complete.

## Milestone 4 - Update save semantics, `err.log`, and inventory refresh

### Scope

Make save operations target the active collection file, refresh inventory correctly, and append human-readable diagnostics to `err.log` when possible.

### Files

- [save-order.js](C:/dev/clip-sandbox/src/business-logic/save-order.js) or a renamed replacement such as `save-collection-description.js`
- [app-controller.js](C:/dev/clip-sandbox/src/app/app-controller.js)
- [file-system-adapter.js](C:/dev/clip-sandbox/src/adapters/browser/file-system-adapter.js)
- [app-text.js](C:/dev/clip-sandbox/src/app/app-text.js)
- [index.html](C:/dev/clip-sandbox/index.html)
- [tests/unit/business-logic.spec.js](C:/dev/clip-sandbox/tests/unit/business-logic.spec.js)
- [tests/e2e/scenarios.spec.js](C:/dev/clip-sandbox/tests/e2e/scenarios.spec.js)

### Changes

- Change standard save behavior to overwrite the currently selected collection file:
  - default entry -> `[folder-name]-default.txt`,
  - explicit entry -> its own backing filename.
- Update `Save as New` so it:
  - writes a new explicit collection file,
  - adds the new description to inventory,
  - selects it as the active explicit collection,
  - clears dirty state.
- Add best-effort `err.log` append behavior in the selected folder for:
  - invalid enumerated `.txt` files,
  - collection-read/parse failures,
  - other runtime errors intentionally logged by this feature.
- Keep the app functional in fallback mode when no directory handle exists. Minimum containment:
  - no crash,
  - no false claim that `err.log` was written,
  - documented limitation in status/tests/retrospective if folder-local log append is unavailable in that path.

### Validation

- Command: `npm run unit`
  Expected: save tests assert overwrite-by-active-file behavior, default-file creation, `Save as New` inventory updates, and `err.log` append behavior where directory writes are mocked.

- Command: `npm run e2e -- --grep "Save collection|Save collection direct write path"`
  Expected: end-to-end scenarios confirm correct filenames and no regression to download/direct-write behavior.

### Rollback/Containment

If folder-local `err.log` append introduces instability, keep save behavior and inventory refresh shipped, then narrow logging to validation failures in writable-directory mode only and document the limitation clearly.

## Milestone 5 - Documentation refresh and full regression pass

### Scope

Bring docs and automated coverage in line with the shipped collection-enumeration model and verify the final end-to-end behavior.

### Files

- [docs/specs/collection-enumeration-spec.md](C:/dev/clip-sandbox/docs/specs/collection-enumeration-spec.md)
- [docs/plans/collection-enumeration-exec-plan.md](C:/dev/clip-sandbox/docs/plans/collection-enumeration-exec-plan.md)
- [docs/documentation/user-guide.md](C:/dev/clip-sandbox/docs/documentation/user-guide.md)
- [docs/documentation/developer-guide.md](C:/dev/clip-sandbox/docs/documentation/developer-guide.md)
- relevant test fixtures under `tests/e2e/fixtures/`
- [tests/e2e/scenarios.spec.js](C:/dev/clip-sandbox/tests/e2e/scenarios.spec.js)

### Changes

- Update user docs to describe:
  - dropdown-based collection selection,
  - default collection source-of-truth behavior,
  - unsaved-change dialog behavior,
  - non-recursive folder rules,
  - `err.log` debugging behavior and current limitations.
- Update developer docs to describe:
  - `ClipCollectionDescription`,
  - `CollectionDescriptionValidator`,
  - `ClipCollectionInventory`,
  - the collection-first materialization flow.
- Expand E2E fixtures to cover:
  - top-level vs subfolder videos,
  - valid and invalid top-level `.txt` files,
  - default-file present vs absent,
  - dirty switch and dirty folder-change flows.
- Update this ExecPlan's `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` sections with actual implementation evidence.

### Validation

- Command: `npm run test:all`
  Expected: full unit and end-to-end suites pass.

- Command: `npm run e2e -- --grep "Load via folder selection|Collection load|Save collection"`
  Expected: all collection-management workflows pass with the new inventory model.

- Command: `Get-Content docs\\documentation\\user-guide.md`
  Expected: the guide reflects the dropdown-based collection workflow rather than file-picker-first collection switching.

### Rollback/Containment

If doc cleanup uncovers deferred behavior that did not ship, keep the docs strictly aligned with actual shipped behavior and record the gap in `Outcomes & Retrospective` instead of papering over it.

## Definition of done

- Folder selection enumerates top-level videos and top-level legal `.txt` collection files only.
- The center toolbar collection name is a dropdown backed by in-memory collection inventory.
- The default collection loads from `[folder-name]-default.txt` when present, otherwise from implicit top-level folder contents.
- Switching away from dirty changes prompts with `Save`, `Don't Save`, and `Cancel`.
- Save overwrites the active collection file, and `Save as New` creates a new explicit inventory entry.
- Invalid collection descriptions are excluded from the dropdown and logged to `err.log` in writable-folder mode.
- The app remains functional in fallback capability mode even when folder-local `err.log` append is unavailable.
- Unit and E2E coverage verify the new behavior.

