# Implement Delete Clips from Disk

## Why this matters

Users can already select clips and remove them from the active collection view, but that only changes the in-memory collection. It does not remove the underlying video files from the loaded folder. For real review and curation work, that forces the user to switch out to a file manager, delete files separately, then return to the app and reconcile stale collection entries.

This work adds an explicit destructive action that deletes the currently selected clip files from the loaded folder when the current folder session is writable. It also removes successfully deleted filenames from all affected saved collections in the same folder so the app, the saved `.txt` collection files, and the actual folder contents stay consistent.

This plan implements the approved spec in `docs/specs/delete-clips-from-disk-spec.md`.

## Progress

- [x] (2026-04-05 13:30Z) Approved feature spec captured in `docs/specs/delete-clips-from-disk-spec.md`.
- [x] (2026-04-05 13:48Z) Execution plan drafted in `docs/plans/delete-clips-from-disk-exec-plan.md`.
- [x] (2026-04-05 14:18Z) Prototype the browser filesystem delete primitive and its result shape.
- [x] (2026-04-05 14:42Z) Add collection-pruning helpers and inventory-update support for successfully deleted filenames.
- [x] (2026-04-05 15:27Z) Wire the UI flow: menu availability, dirty-state preflight, destructive confirmation, and delete orchestration.
- [x] (2026-04-05 15:55Z) Add unit/integration/e2e coverage and update user/developer docs.

## Surprises & Discoveries

- Discovery: the app already has a browser-facing filesystem boundary, but it only covers folder picking, save/download fallback, and `err.log` appends. It does not yet expose clip-file deletion.
  Evidence: `src/adapters/browser/browser-file-system-service.js` exports `canUseDirectoryPicker`, `canMutateDisk`, `pickFolder`, `selectionFromFileList`, `saveTextFile`, and `appendTextFile`, but no delete method.

- Discovery: the existing `Delete` / `Backspace` path is intentionally collection-only and lives entirely on the active in-memory `ClipCollection`.
  Evidence: `src/app/app-controller.js` wires `onRemoveSelected`, and `src/domain/clip-collection.js` provides `removeMany(...)` by clip id.

- Discovery: the grid controller already exposes the exact source selection shape the delete feature needs: ordered selected clip ids in visible grid order.
  Evidence: `src/ui/clip-collection-grid-controller.js` exposes `getSelectedClipIds()` and already uses ordered selection for collection-only removal and add-to-collection.

- Discovery: saved collection cleanup cannot be implemented cleanly with current domain helpers alone because serialized collection content supports append semantics but not prune semantics.
  Evidence: `src/domain/clip-collection-content.js` has `appendMissingClipNames(...)` but no inverse helper to remove a set of filenames.

- Discovery: `ClipCollectionInventory` can upsert collection content, but it does not yet expose a focused helper to iterate or rewrite all affected saved collections after a cross-folder destructive operation.
  Evidence: `src/domain/clip-collection-inventory.js` provides `upsertCollectionContent(...)`, `selectableCollections()`, and `getCollectionByRef(...)`, but no bulk rewrite helper.

- Discovery: the app already has one unsaved-changes dialog, but it is specialized around pending navigation actions such as switch-collection or browse-folder.
  Evidence: `src/app/app-controller.js` uses `pendingAction()` values of `browse-folder` and `switch-collection` to drive `unsavedChangesDialog`.

- Discovery: right-click menu composition already happens in `app-controller`, so adding or omitting `Delete from Disk...` based on writable-session availability can stay in the orchestration layer without making the reusable context menu collection-aware.
  Evidence: `src/app/app-controller.js` builds the action list passed into `src/ui/context-menu-controller.js`.

- Discovery: end-to-end coverage already has a writable directory-picker mock path that can be extended to simulate direct file deletion and collection-file rewrites without needing a real browser-supported filesystem API in test.
  Evidence: `tests/e2e/scenarios.spec.js` defines `loadClipsViaDirectoryPickerMock(...)` with a mocked directory handle that already supports `getFileHandle(...)` writes.

## Decision Log

- Decision: implement clip-file deletion through the existing browser filesystem service instead of calling browser file APIs from `app-controller`.
  Rationale: the repo just introduced the folder-session boundary specifically to keep browser capability details out of the app layer and to preserve a later Electron migration path.
  Date/Author: 2026-04-05 / Codex + user

- Decision: keep `Delete` / `Backspace` as collection-only trim and add a separate explicit destructive action for disk deletion.
  Rationale: the user approved an explicit action and rejected overloading the existing shortcut with permanent disk deletion.
  Date/Author: 2026-04-05 / Codex + user

- Decision: show `Delete Selected from Disk...` disabled in the top `Collection` menu for read-only sessions, but omit `Delete from Disk...` from the right-click menu when it is unavailable.
  Rationale: this preserves discoverability for keyboard users without cluttering the pointer-driven context menu with a dead action.
  Date/Author: 2026-04-05 / Codex + user

- Decision: if the active collection is dirty, require a pre-delete choice of `Save and Continue`, `Continue Without Saving`, or `Cancel` before showing destructive confirmation.
  Rationale: disk deletion can rewrite saved collection files across the folder, so unrelated unsaved edits on the active collection must be handled explicitly first.
  Date/Author: 2026-04-05 / Codex + user

- Decision: deletion is best-effort and per-file; successful deletions are kept even if some files fail or later collection cleanup is only partially successful.
  Rationale: the user approved partial success, and this matches the nature of top-level file operations better than an all-or-nothing model.
  Date/Author: 2026-04-05 / Codex + user

- Decision: do not create a default collection backing file solely because deletion occurred.
  Rationale: the implicit default should continue to reflect folder state naturally unless a default backing file already exists or the user explicitly saves one.
  Date/Author: 2026-04-05 / Codex + user

- Decision: extend `CollectionManager` to own delete-from-disk orchestration rather than introducing a second top-level application service.
  Rationale: the repo already uses `CollectionManager` for multi-collection operations that combine selection resolution, inventory updates, and persistence; disk deletion belongs to the same boundary.
  Date/Author: 2026-04-05 / Codex

## Outcomes & Retrospective

Shipped behavior:

- Writable folder sessions now expose `Delete from Disk...` in the grid right-click menu and `Delete Selected from Disk...` in the top `Collection` menu.
- Read-only fallback sessions omit the right-click action and keep the top-menu action visible but disabled.
- If the active collection is dirty, the app now requires `Save and Continue`, `Continue Without Saving`, or `Cancel` before destructive confirmation.
- The destructive confirmation includes clip count, affected saved-collection count, and a preview of up to five filenames.
- Disk deletion is best-effort per file. Successful deletes are kept even when some files fail.
- Successfully deleted filenames are removed from all affected saved collections in the current folder.
- The implicit default collection is updated in memory but does not create a backing default file solely because deletion occurred.
- Delete failures and collection-rewrite failures are appended to `err.log` in writable sessions and fall back to console warnings otherwise.

Validation evidence:

- `npm run unit`
  Result: 18 files passed, 98 tests passed.
- `npx playwright test tests/e2e/scenarios.spec.js --grep "Delete from disk"`
  Result: 6 delete-specific browser scenarios passed.
- `npm run test:all`
  Result: 55 Playwright scenarios plus the full unit/integration suite passed.

Follow-up ideas:

- add recycle-bin or trash integration if permanent delete proves too risky in practice,
- surface writable vs read-only session state more explicitly in the main toolbar,
- consider a richer post-delete summary if collection rewrite failures become common in real use.

## Context and orientation

This repository is a browser-first local clip review tool with no frontend framework. The shell is `index.html`, runtime orchestration lives in `src/app/app-controller.js`, and folder-scoped collections are stored as plain-text `.txt` files with one clip filename per line.

Terms used in this plan:

- `folder session`: the app-level description of how the current folder was loaded. A writable session comes from the directory-picker path and can mutate disk; a read-only session comes from the fallback file-input path and cannot.
- `active collection`: the currently materialized `ClipCollection` rendered in the grid.
- `saved collection`: a collection that has a backing `.txt` filename in the current folder inventory.
- `implicit default collection`: the synthetic `[folder-name]-default` collection when no backing default `.txt` file exists yet.
- `successful delete set`: the subset of selected filenames that were actually removed from disk.

Key files and current data flow:

- `src/app/app-controller.js`
  The composition root. It owns DOM lookup, menu wiring, folder loading, save flows, status messages, and collection switching.

- `src/app/app-session-state.js`
  Stores session-wide runtime state including the current folder session, active collection, and collection inventory.

- `src/adapters/browser/browser-file-system-service.js`
  The app-facing filesystem boundary. It currently decides whether the session can mutate disk and handles save/download fallback and `err.log` append behavior.

- `src/adapters/browser/file-system-adapter.js`
  Thin browser API wrappers. This is where low-level directory-handle operations belong when they are browser-specific.

- `src/business-logic/collection-manager.js`
  The application service for collection operations. It currently owns add-to-collection orchestration and should become the home for delete-from-disk orchestration too.

- `src/domain/clip-collection.js`
  The active runtime collection of `Clip` instances. It already supports `removeMany(...)` by clip id.

- `src/domain/clip-collection-content.js`
  The serialized collection description used for saved `.txt` files and in-memory inventory. It already supports append-without-duplicates and needs a prune helper for this feature.

- `src/domain/clip-collection-inventory.js`
  The folder-scoped inventory of current video files plus saved collection contents. This is the source of truth for which saved collections need to be rewritten after successful deletion.

- `src/ui/clip-collection-grid-controller.js`
  Owns current selection and already exposes ordered selected clip ids.

- `src/ui/context-menu-controller.js`
  Generic reusable context-menu primitive. It should remain generic and receive action availability from the app layer.

- `src/ui/order-menu-controller.js`
  Owns the top `Collection` menu interaction and is the keyboard-accessible fallback surface for this feature.

- `src/app/app-text.js`
  Centralizes user-facing status text and should absorb new delete-flow strings instead of hard-coding copy in the controller.

- `tests/e2e/scenarios.spec.js`
  Contains both fallback file-input flows and writable directory-picker mock flows. Extend this file for the end-to-end delete behavior.

Implementation constraints that must remain true:

- only top-level files are in scope because the app is intentionally non-recursive,
- deletion is available only when `fileSystem.canMutateDisk(currentFolderSession)` is true,
- right-click delete is omitted when unavailable,
- top-menu delete remains visible but disabled when unavailable,
- the delete flow must remain separate from collection-only `Delete` / `Backspace`,
- successfully deleted filenames are removed from all affected saved collections,
- failed deletions do not remove filenames from collections,
- the implicit default collection must not create a backing file just because delete occurred,
- all logging of deletion/cleanup failures must go through the filesystem boundary and console fallback.

## Milestone 0 - Prototype the filesystem delete primitive

### Scope

Confirm the exact application-facing delete API shape on the browser filesystem service before UI work begins. This milestone reduces risk around partial success, read-only-session behavior, and testability.

### Changes

- File: `src/adapters/browser/file-system-adapter.js`
  Edit: add a low-level helper for deleting a top-level file from a writable directory handle. The likely implementation is a wrapper around `directoryHandle.removeEntry(filename)`, but this milestone must confirm the exact call shape and error behavior in code comments or tests.

- File: `src/adapters/browser/browser-file-system-service.js`
  Edit: add a delete API that accepts ordered filenames and returns a per-file result list such as:
  - filename,
  - `ok: true` for successful delete,
  - `ok: false` plus an error for failed delete.

  The service must:
  - refuse mutation in read-only sessions,
  - preserve ordered results,
  - avoid hiding per-file failures behind one aggregate exception.

- File: `tests/unit/browser-file-system-service.spec.js`
  Edit: add unit coverage for:
  - writable-session successful delete,
  - read-only-session refusal,
  - mixed per-file results,
  - ordered result shape,
  - no accidental deletion attempt when the session cannot mutate disk.

### Validation

- Command: `npm run unit -- tests/unit/browser-file-system-service.spec.js`
  Expected: new filesystem delete tests pass and clearly prove the result shape.

- Command: `npm run unit`
  Expected: all existing unit/integration tests still pass.

### Rollback/Containment

If the first delete API shape causes awkward aggregate error handling in the app layer, keep this milestone local to the service and tests, then revise the result object before any UI or collection-orchestration code depends on it.

## Milestone 1 - Add collection-pruning and inventory rewrite helpers

### Scope

Teach the domain and collection-orchestration layer how to remove a set of successfully deleted filenames from saved collections without coupling that logic to browser APIs.

### Changes

- File: `src/domain/clip-collection-content.js`
  Edit: add a prune helper such as `removeClipNames(...)` that:
  - accepts a set or ordered list of filenames,
  - returns a new `ClipCollectionContent`,
  - reports removed count or no-op status,
  - preserves original order for remaining clip names.

- File: `src/domain/clip-collection-inventory.js`
  Edit: add focused helpers for iterating and updating affected saved collections. The implementation may expose:
  - a way to enumerate saved collection contents excluding implicit default when it has no backing file,
  - a way to determine which saved collections contain any of the successful delete filenames,
  - a way to rewrite those entries in memory after persistence succeeds.

  Keep this inventory lookup-oriented. Do not turn it into a generic transaction engine.

- File: `src/business-logic/collection-manager.js`
  Edit: add a `deleteSelectedClipsFromDisk(...)` operation that:
  - resolves ordered selected clip ids to clip filenames from the active `ClipCollection`,
  - calls the filesystem service delete API,
  - computes the successful delete set,
  - computes affected saved collections,
  - persists rewritten saved collections through the existing save path,
  - returns a structured result describing:
    - deleted filenames,
    - failed deletions,
    - affected saved collections,
    - collection rewrite failures if any.

- File: `src/business-logic/save-order.js`
  Edit only if needed so saved-collection rewrites can reuse the existing persistence path cleanly without special cases.

- File: `tests/unit/collection-manager.spec.js`
  Edit: add unit coverage for:
  - full-success delete orchestration,
  - partial-success delete orchestration,
  - no collection rewrites when no file delete succeeds,
  - rewrite of only affected saved collections,
  - no implicit default-file creation when default is still synthetic.

- File: `tests/unit/clip-models.spec.js` or a new focused unit file
  Edit: add unit tests for the new prune helper and any inventory helper behavior that is small and deterministic.

### Validation

- Command: `npm run unit -- tests/unit/collection-manager.spec.js`
  Expected: delete orchestration results are deterministic and cover both full and partial success.

- Command: `npm run unit -- tests/unit/clip-models.spec.js`
  Expected: prune semantics preserve order and no-op behavior.

- Command: `npm run unit`
  Expected: the full unit/integration suite still passes.

### Rollback/Containment

If bulk inventory rewrite logic starts overloading `ClipCollectionInventory`, keep only the minimum lookup helpers there and move the rewrite loop back into `CollectionManager`. The inventory should remain a folder-scoped content registry, not a workflow controller.

## Milestone 2 - Wire menus, dialogs, and app orchestration

### Scope

Expose the delete action to users, handle the dirty-state preflight and destructive confirmation, and connect the UI to `CollectionManager.deleteSelectedClipsFromDisk(...)`.

### Changes

- File: `index.html`
  Edit: add dialog host markup for:
  - the dirty preflight choice (`Save and Continue`, `Continue Without Saving`, `Cancel`),
  - the destructive confirmation (`Delete`, `Cancel`) plus a filename preview region.

  Keep the markup consistent with existing native dialog usage.

- File: `src/app/app-text.js`
  Edit: add centralized text builders for:
  - top-menu label if needed,
  - dirty preflight copy,
  - confirmation summary including saved-collection count,
  - success / partial-success / failure status messages.

- File: `src/ui/order-menu-controller.js`
  Edit: add `Delete Selected from Disk...` to the `Collection` menu list and preserve keyboard behavior.

- File: `src/app/app-controller.js`
  Edit: wire the feature end to end:
  - compute action availability from selection presence plus `fileSystem.canMutateDisk(state.currentFolderSession)`,
  - include `Delete from Disk...` in the right-click menu only when actionable,
  - keep the top-menu action visible but disabled when unavailable,
  - open the dirty-state preflight when the active collection is dirty,
  - reuse the existing save flow for `Save and Continue`,
  - open destructive confirmation after preflight passes,
  - display up to five filenames plus `...and N more`,
  - call `collectionManager.deleteSelectedClipsFromDisk(...)`,
  - update the active rendered collection and inventory based on the returned result,
  - show status text that reflects deleted count, failed count, and affected saved-collection count,
  - append runtime failures to `err.log` through the existing log path when possible.

- File: `src/ui/clip-collection-grid-controller.js`
  Edit only if needed so selection refresh after rerender remains predictable for partial-success outcomes. Avoid pushing delete business logic into the grid controller.

- File: `tests/integration/app/app-controller.spec.js`
  Edit: add focused integration coverage for menu availability or dialog state transitions that are easier to test at the app-controller level than in e2e.

- File: `tests/integration/ui/order-menu-controller.spec.js`
  Edit: confirm the new top-menu item participates in existing keyboard navigation and disabled-state behavior.

### Validation

- Command: `npm run unit -- tests/integration/app/app-controller.spec.js`
  Expected: dirty preflight / confirmation orchestration passes in jsdom.

- Command: `npm run unit -- tests/integration/ui/order-menu-controller.spec.js`
  Expected: the new menu item is reachable and disabled state behaves correctly.

- Command: `npm run unit`
  Expected: the full unit/integration suite still passes.

### Rollback/Containment

If the delete flow starts tangling with the existing unsaved-changes dialog for navigation, keep the new preflight as a separate dialog and separate local state instead of broadening `pendingAction()` beyond its current navigation-only role.

## Milestone 3 - End-to-end validation and documentation

### Scope

Prove the user-visible behavior across writable and read-only sessions and document the new destructive workflow.

### Changes

- File: `tests/e2e/scenarios.spec.js`
  Edit: add Playwright coverage for:
  - writable directory-picker full-success delete launched from the right-click menu,
  - writable directory-picker partial-success delete,
  - rewrite of affected saved collections after successful deletion,
  - status/confirmation behavior when zero saved collections are affected,
  - status/confirmation behavior when exactly one saved collection is affected,
  - status/confirmation behavior when more than one saved collection is affected,
  - right-click delete present only in writable sessions,
  - top-menu delete disabled in read-only fallback sessions,
  - dirty active collection preflight before delete,
  - no implicit creation of a default backing file when cleanup happens against a synthetic default.

  Extend the existing directory-picker mock so it supports:
  - `removeEntry(...)` or the chosen delete primitive,
  - collection-file rewrite capture,
  - configurable per-file delete failure.

  The right-click coverage must prove:
  - the menu item appears in writable sessions,
  - the menu item is absent in read-only sessions,
  - the right-click path reaches the same confirmation and delete orchestration as the top-menu fallback.

- File: `docs/documentation/user-guide.md`
  Edit: document:
  - the difference between collection-only delete and disk delete,
  - where `Delete from Disk...` appears,
  - writable-session limitation,
  - confirmation and partial-success behavior.

- File: `docs/documentation/developer-guide.md`
  Edit: document:
  - the new filesystem delete boundary,
  - delete orchestration ownership in `CollectionManager`,
  - collection-pruning semantics,
  - read-only fallback behavior.

### Validation

- Command: `npx playwright test tests/e2e/scenarios.spec.js --grep "Delete from disk|Delete selected clip|Save collection direct write path"`
  Expected: targeted destructive-delete scenarios pass in both writable and read-only mocked paths.

- Command: `npm run e2e`
  Expected: the full browser suite passes.

- Command: `npm run test:all`
  Expected: full unit plus e2e coverage passes and remains suitable for the Husky pre-commit hook.

### Rollback/Containment

If the e2e delete mocks become too brittle, keep one broad end-to-end full-success scenario plus narrower unit/integration coverage for partial-success edge cases. Do not ship the feature without at least one writable full-success browser path and one read-only unavailability path proven end to end.
