# Clip Sandbox Developer Guide

## Purpose

This guide explains the current browser-only architecture and the collection-management model added by folder-scoped collection enumeration.

## Technology Stack

- Runtime: browser-native JavaScript (ES modules), no framework
- UI shell: static [`index.html`](/C:/dev/clip-sandbox/index.html) with inline CSS
- Entry point: [`app.js`](/C:/dev/clip-sandbox/app.js) -> [`src/app/app-controller.js`](/C:/dev/clip-sandbox/src/app/app-controller.js)
- Unit/integration tests: Vitest + jsdom
- End-to-end tests: Playwright (Chromium)
- Windows deployment: static files served locally by bundled `miniserve`

## Project Structure

- [`src/domain`](/C:/dev/clip-sandbox/src/domain): runtime models and pure validation/state helpers
- [`src/business-logic`](/C:/dev/clip-sandbox/src/business-logic): folder/collection workflows, materialization, save behavior
- [`src/app`](/C:/dev/clip-sandbox/src/app): composition root, app state, text, layout rules, event binding
- [`src/ui`](/C:/dev/clip-sandbox/src/ui): DOM-facing controllers such as the grid, order menu, reusable context menu, and zoom overlay
- [`src/adapters/browser`](/C:/dev/clip-sandbox/src/adapters/browser): thin wrappers around browser APIs
- [`src/adapters/browser/browser-file-system-service.js`](/C:/dev/clip-sandbox/src/adapters/browser/browser-file-system-service.js): app-facing browser filesystem boundary that maps browser capabilities into folder sessions plus save/log/delete operations
- [`tests/unit`](/C:/dev/clip-sandbox/tests/unit): unit coverage
- [`tests/integration/ui`](/C:/dev/clip-sandbox/tests/integration/ui): UI-controller integration coverage
- [`tests/e2e/scenarios.spec.js`](/C:/dev/clip-sandbox/tests/e2e/scenarios.spec.js): observable browser workflows

## Core Collection Concepts

### `ClipCollection`

[`src/domain/clip-collection.js`](/C:/dev/clip-sandbox/src/domain/clip-collection.js)

The active runtime collection rendered in the grid.

Responsibilities:
- ordered clip membership
- lookup by clip id
- reorder
- removal
- conversion to `ClipCollectionDescription`

### `ClipCollectionContent`

[`src/domain/clip-collection-content.js`](/C:/dev/clip-sandbox/src/domain/clip-collection-content.js)

A serialized collection definition.

Fields:
- collection name
- backing filename
- ordered clip filenames
- source kind (`default` or `explicit-file`)
- implicit vs explicit default state

Important rule:
- this class describes what should be in a collection file
- it does not perform file I/O
- collection-pruning helpers such as remove-by-filename belong here because they are pure content transforms

### `CollectionDescriptionValidator`

[`src/domain/collection-description-validator.js`](/C:/dev/clip-sandbox/src/domain/collection-description-validator.js)

The single validation authority for `.txt` collection descriptions.

Responsibilities:
- parse collection text
- reject empty files
- reject duplicate entries
- build `ClipCollectionContent` instances
- produce human-readable diagnostics suitable for `err.log`

Important rule:
- validator legality is about the text format
- missing clip files in the selected folder are handled later during materialization, not during validation

### `ClipCollectionInventory`

[`src/domain/clip-collection-inventory.js`](/C:/dev/clip-sandbox/src/domain/clip-collection-inventory.js)

The folder-scoped in-memory collection inventory.

Responsibilities:
- store the active folder name
- store the discovered top-level video-file lookup
- store available collection descriptions
- ensure the default collection always exists
- track whether the default collection currently has a real backing file
- track the active description
- track dirty state
- track pending actions such as collection switch or folder browse

Important rule:
- `AppState` holds one active `ClipCollection` plus one `ClipCollectionInventory`
- backing filename, active description, and dirty state live inside the inventory, not as loose parallel fields

## Folder and Collection Flow

The main collection-management flow is orchestrated in [`src/app/app-controller.js`](/C:/dev/clip-sandbox/src/app/app-controller.js).

### Filesystem Service Boundary

[`src/adapters/browser/browser-file-system-service.js`](/C:/dev/clip-sandbox/src/adapters/browser/browser-file-system-service.js)

This service is the app-facing boundary for browser-backed file access.

Responsibilities:
- detect whether writable folder picking is available
- translate browser folder selection into a folder session
- distinguish writable `readwrite` sessions from fallback `read-only` sessions
- centralize save/download fallback behavior
- expose ordered best-effort top-level file deletion for writable sessions
- centralize append-to-log behavior

Important rule:
- `app-controller` should depend on folder sessions plus this service contract
- browser-specific API details such as `showDirectoryPicker()` or `webkitdirectory` should not spread further into the app layer

### Folder Selection

1. Browser input or directory picker provides raw files.
2. The browser filesystem service normalizes that into a folder session:
   - `readwrite` session when `showDirectoryPicker()` returns a writable directory handle
   - `read-only` session when the app falls back to the hidden `webkitdirectory` input
3. [`splitTopLevelFolderEntries(...)`](/C:/dev/clip-sandbox/src/business-logic/load-clips.js) filters to top-level entries only.
4. [`buildCollectionInventory(...)`](/C:/dev/clip-sandbox/src/business-logic/load-collection-inventory.js) builds a `ClipCollectionInventory` from:
   - top-level video files
   - valid top-level `.txt` files
5. The default collection is resolved:
   - existing `[folder-name]-default.txt` wins,
   - otherwise an implicit default description is synthesized from the top-level videos.
6. [`materializeCollectionContent(...)`](/C:/dev/clip-sandbox/src/business-logic/materialize-collection.js) creates the active `ClipCollection`.
7. The grid renders only the active collection's clips.

### Collection Switching

1. The centered `<select>` in [`index.html`](/C:/dev/clip-sandbox/index.html) shows:
   - default collection first
   - explicit collections below it alphabetically
2. If the active collection is clean, selection switches immediately.
3. If the active collection is dirty, a native `<dialog>` asks whether to save, discard, or cancel.
4. Missing clip filenames still use the inline conflict panel instead of the dialog.

### Save Behavior

Standard save overwrites the active collection file:
- default collection -> `[folder-name]-default.txt`
- explicit collection -> its own filename

`Save as New` writes a new `.txt` file and adds a new description to the in-memory inventory for the current session.

Implementation entry point:
- [`src/business-logic/save-order.js`](/C:/dev/clip-sandbox/src/business-logic/save-order.js)

### Add Selected to Collection

The add-to-collection workflow is split across three levels:

1. [`src/ui/context-menu-controller.js`](/C:/dev/clip-sandbox/src/ui/context-menu-controller.js)
   - reusable right-click menu primitive
   - no collection or inventory knowledge
   - the app can populate it with direct destination actions such as `Add to subset` plus `New collection...`
2. [`src/ui/add-to-collection-dialog-controller.js`](/C:/dev/clip-sandbox/src/ui/add-to-collection-dialog-controller.js)
   - owns the add-to-collection dialog DOM, focus behavior, field visibility, and inline validation display
   - stays UI-only and receives shared validation results plus submit callbacks from the app layer
3. [`src/business-logic/collection-manager.js`](/C:/dev/clip-sandbox/src/business-logic/collection-manager.js)
   - application service for collection operations such as adding selected clips to another collection
   - coordinates inventory lookups, domain merge behavior, and immediate destination save
4. existing domain objects
   - [`src/domain/clip-collection.js`](/C:/dev/clip-sandbox/src/domain/clip-collection.js) resolves ordered source clip names from selected clip ids
   - [`src/domain/clip-collection-content.js`](/C:/dev/clip-sandbox/src/domain/clip-collection-content.js) merges incoming clip names into destination content without duplicates

Important rule:
- keep collection operation orchestration in `CollectionManager`
- keep merge rules on the domain objects
- do not push DOM concerns into `CollectionManager`
- do not push whole collection operations into `ClipCollectionInventory`

### Delete Selected Clips from Disk

The delete-from-disk workflow is split across the same boundaries:

1. [`src/ui/context-menu-controller.js`](/C:/dev/clip-sandbox/src/ui/context-menu-controller.js) and [`src/ui/order-menu-controller.js`](/C:/dev/clip-sandbox/src/ui/order-menu-controller.js)
   - expose the action only when the current selection is non-empty and the folder session is writable
   - keep the right-click action hidden when unavailable
   - keep the top-menu action visible but disabled when unavailable
2. [`src/app/app-controller.js`](/C:/dev/clip-sandbox/src/app/app-controller.js)
   - runs the dirty-state preflight dialog
   - resumes the delete flow after `Save as New` when needed
   - renders the destructive confirmation with selected-filename preview
   - logs delete and rewrite failures through `err.log`
3. [`src/business-logic/collection-manager.js`](/C:/dev/clip-sandbox/src/business-logic/collection-manager.js)
   - resolves selected clip ids to filenames
   - deletes files through the filesystem service
   - identifies affected saved collections
   - rewrites only the saved collections touched by successful deletes
   - updates the in-memory inventory and returns a structured partial-success result
4. [`src/domain/clip-collection-content.js`](/C:/dev/clip-sandbox/src/domain/clip-collection-content.js)
   - removes successfully deleted filenames while preserving the remaining order
5. [`src/domain/clip-collection-inventory.js`](/C:/dev/clip-sandbox/src/domain/clip-collection-inventory.js)
   - distinguishes between an implicit default collection and a default collection that already has a backing `.txt` file
   - excludes the implicit default from saved-collection rewrite work so delete never creates a default file on its own

Important rules:
- disk deletion is best-effort per file; one failed delete must not block the rest
- only successfully deleted filenames are removed from saved collections
- saved-collection rewrites are immediate folder writes, not download fallbacks
- delete-from-disk remains unavailable in read-only fallback sessions

## Non-Recursive Rule

The app is intentionally non-recursive for collection management.

Enforced in:
- [`src/business-logic/load-clips.js`](/C:/dev/clip-sandbox/src/business-logic/load-clips.js)

Meaning:
- top-level supported videos are considered
- top-level `.txt` files are considered
- subfolder videos are ignored
- subfolder `.txt` collection files are ignored

This matters especially for the fallback `webkitdirectory` path because browsers return nested files unless code filters them explicitly.

## Error Logging

Invalid collection-description diagnostics, selected runtime errors, and delete-from-disk failures are appended to `err.log` in the selected folder when the active folder session is writable.

Relevant adapter:
- [`src/adapters/browser/file-system-adapter.js`](/C:/dev/clip-sandbox/src/adapters/browser/file-system-adapter.js)
- [`src/adapters/browser/browser-file-system-service.js`](/C:/dev/clip-sandbox/src/adapters/browser/browser-file-system-service.js)

Important limitation:
- in fallback browser mode with a read-only folder session, the app cannot write `err.log` into the selected folder
- in that case the app still excludes invalid files and logs to the browser console

## UI Components

### Grid

[`src/ui/clip-collection-grid-controller.js`](/C:/dev/clip-sandbox/src/ui/clip-collection-grid-controller.js)

Responsibilities:
- render cards from a `ClipCollection`
- manage selected-set UI by clip id
- resolve delete/remove requests from the current selected set
- manage drag/drop reorder
- maintain object URL lifecycle

Important rule:
- the DOM is a rendering of collection order
- the DOM is not the source of truth for save behavior

### Collection Action Menu

[`src/ui/order-menu-controller.js`](/C:/dev/clip-sandbox/src/ui/order-menu-controller.js)

Responsibilities:
- open/close the toolbar action menu
- keyboard navigation for save and add-to-collection fallback actions

Collection selection itself is no longer handled here. That moved to the centered dropdown in the main shell.

### Reusable Context Menu

[`src/ui/context-menu-controller.js`](/C:/dev/clip-sandbox/src/ui/context-menu-controller.js)

Responsibilities:
- render a supplied generic action list
- position itself from pointer coordinates
- dismiss on outside click or `Escape`
- support disabled actions

Important rule:
- this component must stay independent of collection, inventory, grid, and persistence modules
- the sandbox demo at [`sandbox/context-menu-demo.html`](/C:/dev/clip-sandbox/sandbox/context-menu-demo.html) exists to prove that independence over time

### Zoom Overlay

[`src/ui/zoom-overlay-controller.js`](/C:/dev/clip-sandbox/src/ui/zoom-overlay-controller.js)

Responsibilities:
- create and manage the zoom overlay
- manage outside-click close behavior
- manage zoomed video element lifecycle

## App State

[`src/app/app-session-state.js`](/C:/dev/clip-sandbox/src/app/app-session-state.js)

Tracks:
- current folder session when available
- id counter for runtime clip ids
- active `ClipCollection`
- active `ClipCollectionInventory`

Important rule:
- the folder session is the app's filesystem access abstraction
- avoid reintroducing raw browser handles into the app layer; the browser filesystem service owns those details
- avoid reintroducing loose `folderClips` state; the inventory owns the folder-scoped video lookup

## Composition Root

[`src/app/app-controller.js`](/C:/dev/clip-sandbox/src/app/app-controller.js)

Owns orchestration of:
- DOM element lookup
- folder loading
- folder session lifecycle
- collection inventory construction
- collection materialization
- collection save and save-as-new
- add-to-collection dialog flow and `CollectionManager` integration
- dirty prompts
- missing-entry conflict handling
- zoom/fullscreen integration

Important rule:
- keep bootstrap as the coordinator
- push reusable rules into domain or business-logic classes/functions first

## Testing Strategy

- Unit:
  - domain models
  - inventory and validator behavior
  - collection materialization helpers
  - save behavior
- Integration:
  - grid controller
  - order menu controller
  - reusable context menu controller
  - event binding
  - zoom overlay controller
- End-to-end:
  - context menu sandbox smoke coverage
  - default-file source-of-truth
  - dropdown-based collection switching
  - dirty switch and dirty folder-change prompts
  - non-recursive filtering
- `err.log` behavior in writable-folder mode
- save/download/direct-write flows
- add-selected-to-collection flows
- delete-from-disk full-success and partial-success flows

## Common Commands

- `npm run unit`
- `npm run e2e`
- `npm run test:all`
- `npm run e2e:headed`

## Sandbox Surfaces

- [`sandbox/zoom-demo.html`](/C:/dev/clip-sandbox/sandbox/zoom-demo.html): isolated host for the reusable zoom overlay.
- [`sandbox/context-menu-demo.html`](/C:/dev/clip-sandbox/sandbox/context-menu-demo.html): isolated host for the reusable context menu.

Important rule:
- sandbox pages are not just demos; they are also intended to stay Playwright-smoke-tested so reusable UI primitives keep working outside the main app shell.

## Extension Notes

- Add new pure collection rules in `src/domain` first when possible.
- Keep file I/O outside `ClipCollection`.
- Keep folder-scoped selection state inside `ClipCollectionInventory`.
- Treat fallback browser filesystem limitations as first-class constraints; do not assume direct write access exists.
- When adding new collection-editing actions, update dirty-state handling by refreshing inventory state after mutating the active `ClipCollection`.

