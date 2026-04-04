# Implement Add Selected Clips to Another Collection

## Why this matters

Users can already select clips, remove them from the active collection, and save collections as folder-scoped `.txt` files. What they cannot do is take a selected set from the active collection and add it to another collection without switching away, rebuilding the subset manually, or saving the source under a new name.

This work adds a copy-style collection operation: the current selected set can be added to another same-folder collection, or to a new collection, while the app stays on the source collection. The destination is saved immediately so the feature does not force the app into multi-collection dirty-state management.

This plan implements the approved spec in [selected-clips-to-collection-spec.md](C:/dev/clip-sandbox/docs/specs/selected-clips-to-collection-spec.md).

## Progress

- [x] (2026-04-02 14:59Z) Approved feature spec captured in `docs/specs/selected-clips-to-collection-spec.md`.
- [x] (2026-04-02 15:05Z) Execution plan drafted in `docs/plans/selected-clips-to-collection-exec-plan.md`.
- [x] (2026-04-02 15:24Z) Built a reusable `context-menu-controller`, added a shared destination-picker dialog, and added the isolated sandbox host at `sandbox/context-menu-demo.html`.
- [x] (2026-04-02 15:40Z) Added `ClipCollection.clipNamesForIdsInOrder(...)`, `ClipCollectionContent.appendMissingClipNames(...)`, shared collection-name validation, and the `CollectionManager` application service.
- [x] (2026-04-02 15:57Z) Integrated right-click and top-menu add-to-collection flows with immediate destination save, preserved source selection, and inventory updates including default-collection writes.
- [x] (2026-04-02 16:32Z) Updated user/developer docs, added sandbox smoke coverage plus end-to-end collection-add coverage, and passed `npm run test:all`.

## Surprises & Discoveries

- Discovery: the current `Collection` menu controller is narrowly tailored to one toolbar button and a fixed list of buttons; it is not reusable for pointer-anchored context menus.
  Evidence: [order-menu-controller.js](C:/dev/clip-sandbox/src/ui/order-menu-controller.js) hard-codes `loadOrderBtn`, `saveBtn`, and `saveAsNewBtn` and owns only button-triggered open/close state.

- Discovery: the app already has a stable selected-set API in the grid controller, including ordered selected ids in current grid order.
  Evidence: [clip-collection-grid-controller.js](C:/dev/clip-sandbox/src/ui/clip-collection-grid-controller.js) exposes selected-set behavior added for multi-selection and bulk remove, and [multi-selection-exec-plan.md](C:/dev/clip-sandbox/docs/plans/multi-selection-exec-plan.md) documents that boundary.

- Discovery: non-active collections currently exist as serialized folder inventory entries, not as fully materialized runtime `ClipCollection` objects.
  Evidence: [clip-collection-inventory.js](C:/dev/clip-sandbox/src/domain/clip-collection-inventory.js) stores `ClipCollectionContent` instances and active-selection state, while [app-controller.js](C:/dev/clip-sandbox/src/app/app-controller.js) materializes only the active collection for rendering.

- Discovery: immediate-save semantics can reuse the existing save path rather than introducing a second file-writing flow.
  Evidence: [save-order.js](C:/dev/clip-sandbox/src/business-logic/save-order.js) already handles both direct folder write and download fallback for collection text persistence.

- Discovery: `Save as New` already defines the filename validation rules that the new destination-picker flow should reuse.
  Evidence: [app-controller.js](C:/dev/clip-sandbox/src/app/app-controller.js) implements `validateSaveAsNewName(...)` and normalizes names through `ClipCollectionContent.filenameFromCollectionName(...)`.

- Discovery: the current collection action menu is already keyboard navigable, so the new feature can preserve keyboard reachability by adding a fallback entry there even though right-click is the primary surface.
  Evidence: [order-menu-controller.spec.js](C:/dev/clip-sandbox/tests/integration/ui/order-menu-controller.spec.js) proves open, focus movement, and escape-close behavior for the existing toolbar menu.

- Discovery: `ClipCollectionInventory` needed one more responsibility boundary than the initial code had: default-collection backing files must be absorbed into the default entry rather than treated as a separate explicit collection.
  Evidence: the shipped implementation updates [clip-collection-inventory.js](C:/dev/clip-sandbox/src/domain/clip-collection-inventory.js) so `clips-default.txt` becomes the default collection's content source and default-target saves update the same entry without duplicating options.

- Discovery: the grid controller's `destroy()` path was removing the context-menu listener, which meant startup/reset cycles silently disabled right-click support.
  Evidence: the first Playwright run for the new right-click flow failed until `destroy()` in [clip-collection-grid-controller.js](C:/dev/clip-sandbox/src/ui/clip-collection-grid-controller.js) stopped unregistering the persistent `contextmenu` handler.

## Decision Log

- Decision: implement the right-click menu as a reusable UI component rather than a grid-specific one-off.
  Rationale: the user explicitly requested a reusable component, and the app is likely to benefit from future action menus that share positioning, dismissal, disabled-item rendering, and keyboard behavior.
  Date/Author: 2026-04-02 / Codex + user

- Decision: introduce a dedicated `CollectionManager` application-service class for collection operations such as add-to-collection.
  Rationale: collection operations should not be spread across `app-controller.js`, and they should not be pushed down into inventory itself. `CollectionManager` is the right place to coordinate inventory lookups, domain merge behavior, persistence, and structured outcomes.
  Date/Author: 2026-04-02 / Codex + user

- Decision: put source-side ordered clip-name resolution on `ClipCollection` and destination-side append-without-duplicates behavior on `ClipCollectionContent`.
  Rationale: the source is a materialized runtime collection addressed by clip ids, while the destination is usually an inventory-backed serialized collection description addressed by ordered clip names.
  Date/Author: 2026-04-02 / Codex + user

- Decision: keep `ClipCollectionInventory` folder-scoped and lookup-oriented; do not turn it into a multi-collection editing engine.
  Rationale: the feature auto-saves the destination immediately and stays on the source collection, so there is no need to broaden inventory into general multi-document dirty-state tracking.
  Date/Author: 2026-04-02 / Codex + user

- Decision: right-click never changes selection for this feature, even when invoked over an unselected card or empty grid space.
  Rationale: the user explicitly chose a menu that always refers to the current selected set.
  Date/Author: 2026-04-02 / Codex + user

- Decision: keep the top `Collection` menu as a keyboard-accessible fallback entry point to the same destination-picker flow.
  Rationale: right-click is the preferred interaction, but the feature should remain reachable without a mouse.
  Date/Author: 2026-04-02 / Codex + user

- Decision: add a sandbox integration for the reusable menu component, similar in spirit to the existing zoom sandbox pattern.
  Rationale: a lightweight sandbox demo is a practical way to prove the menu is genuinely reusable outside the clip-grid context and to make manual verification of positioning, dismissal, disabled items, and callbacks faster.
  Date/Author: 2026-04-02 / Codex + user

- Decision: exercise the menu sandbox through an automated smoke test as part of the regular test suite.
  Rationale: manual sandbox usage alone will drift over time. A dedicated automated sandbox scenario makes the isolated integration part of the repo's recurring health checks and catches independence regressions early.
  Date/Author: 2026-04-02 / Codex + user

## Outcomes & Retrospective

Shipped behavior:

- users can right-click the grid and add the current selected set to another collection without leaving the source collection,
- the top `Collection` menu now exposes `Add Selected to Collection...` as a keyboard-accessible fallback,
- destination collections skip duplicates and append only missing clip names in source selection order,
- destination collections are saved immediately through the existing direct-write or download save path,
- the source grid selection stays intact after the add completes,
- the default collection now behaves as a real destination backed by `[folder-name]-default.txt`,
- the reusable context menu has an isolated sandbox host at [context-menu-demo.html](C:/dev/clip-sandbox/sandbox/context-menu-demo.html) and a Playwright smoke test.

Implementation shape:

- [context-menu-controller.js](C:/dev/clip-sandbox/src/ui/context-menu-controller.js) is the reusable menu primitive for pointer-driven action lists.
- [collection-manager.js](C:/dev/clip-sandbox/src/app/collection-manager.js) is the application service for add-to-collection operations.
- [clip-collection.js](C:/dev/clip-sandbox/src/domain/clip-collection.js) owns ordered source-name extraction from selected clip ids.
- [clip-collection-content.js](C:/dev/clip-sandbox/src/domain/clip-collection-content.js) owns destination merge-without-duplicates behavior.
- [clip-collection-inventory.js](C:/dev/clip-sandbox/src/domain/clip-collection-inventory.js) now absorbs default backing files into the default entry and exposes eligible destination helpers without becoming a general multi-collection editor.

Validation evidence:

- `npm run unit` -> 15 test files passed, 76 tests passed.
- `npm run e2e -- --grep "Context menu sandbox|Add selected clips to a collection"` -> 4 targeted scenarios passed.
- `npm run e2e` -> 48 Playwright scenarios passed.
- `npm run test:all` -> full suite passed end to end.

Follow-up candidates:

- if the app later needs more pointer-anchored action menus, consider reusing `context-menu-controller.js` before growing `order-menu-controller.js`,
- if users request drag-selection or more bulk collection actions, route those workflows through `CollectionManager` rather than widening bootstrap.

## Context and orientation

This repository is a browser-only clip review and collection management app with no frontend framework. The shell is [index.html](C:/dev/clip-sandbox/index.html), runtime wiring happens in [app-controller.js](C:/dev/clip-sandbox/src/app/app-controller.js), and collection files are plain-text `.txt` files containing one clip filename per line.

Current collection model:

- [clip-collection.js](C:/dev/clip-sandbox/src/domain/clip-collection.js)
  The runtime active collection rendered in the grid. It holds real `Clip` instances, ordered membership, and mutation methods such as reorder and removal.
- [clip-collection-content.js](C:/dev/clip-sandbox/src/domain/clip-collection-content.js)
  The serialized collection description used by inventory and save/load flows. It stores collection name, backing filename, and ordered clip names.
- [clip-collection-inventory.js](C:/dev/clip-sandbox/src/domain/clip-collection-inventory.js)
  The folder-scoped inventory of selectable collections plus active selection, video-file lookup, dirty state, and pending-action tracking.

Current UI and orchestration shape:

- [clip-collection-grid-controller.js](C:/dev/clip-sandbox/src/ui/clip-collection-grid-controller.js)
  Renders grid cards, owns selection state, exposes ordered selected ids, and drives drag/drop plus open/remove callbacks.
- [order-menu-controller.js](C:/dev/clip-sandbox/src/ui/order-menu-controller.js)
  Owns the existing top toolbar `Collection` menu interaction, but it is specialized for a button-triggered action list.
- [app-controller.js](C:/dev/clip-sandbox/src/app/app-controller.js)
  Wires the shell together, owns save and collection-switch flows, and currently contains the `Save as New` name validation used by the existing menu.

Persistence shape:

- [save-order.js](C:/dev/clip-sandbox/src/business-logic/save-order.js)
  Writes collection text either directly into the selected folder or through browser download fallback.
- [file-system-adapter.js](C:/dev/clip-sandbox/src/adapters/browser/file-system-adapter.js)
  Provides direct-write and directory-handle integration.

Relevant tests:

- [clip-collection-grid-controller.spec.js](C:/dev/clip-sandbox/tests/integration/ui/clip-collection-grid-controller.spec.js)
  Verifies selection and grid behavior.
- [order-menu-controller.spec.js](C:/dev/clip-sandbox/tests/integration/ui/order-menu-controller.spec.js)
  Verifies current toolbar menu keyboard interaction.
- [clip-models.spec.js](C:/dev/clip-sandbox/tests/unit/clip-models.spec.js)
  Covers `ClipCollection`, `ClipCollectionContent`, and inventory behavior.
- [scenarios.spec.js](C:/dev/clip-sandbox/tests/e2e/scenarios.spec.js)
  Exercises full browser workflows.

Required ongoing guardrails for menu independence:

- contract-level integration tests for the reusable menu primitive,
- an isolated sandbox integration that does not import collection-specific workflow logic,
- an automated sandbox smoke test that runs as part of the regular browser suite,
- documented dependency boundaries so the menu primitive does not drift into app or domain concerns.

Relevant manual verification surface:

- `sandbox/`
  This repo already uses sandbox-style isolated integrations for UI work such as zoom. The reusable menu component should get the same treatment so it can be exercised outside the clip-grid workflow.

Terms used in this plan:

- `source collection`: the currently active rendered collection from which the user has selected clips.
- `destination collection`: another collection in the same folder, or a new collection being created by the action.
- `selected set`: the ordered clip id list currently selected in the grid controller.
- `immediate destination save`: the rule that the destination collection is persisted as part of the add operation rather than becoming dirty in the background.
- `reusable menu primitive`: a generic UI component that can render an action list at a toolbar anchor or pointer position with dismissal and disabled-item behavior, without knowing anything about collections.

Implementation constraints that must remain true:

- the action copies clips; it does not move them,
- destination choices are limited to the currently loaded folder,
- the active source collection is not a valid destination,
- duplicate destination entries are skipped,
- new destination entries append at the end in source selection order,
- the source collection stays active after completion,
- the source selection stays unchanged after completion,
- the feature must not broaden inventory into a multi-collection dirty-state system,
- the top `Collection` menu remains available as a keyboard-accessible fallback.

## Milestone 0 - Decide reusable menu extraction strategy

### Scope

Reduce UI-architecture risk by choosing whether to generalize the current toolbar menu controller or create a new reusable menu primitive that both the toolbar fallback and the new context menu can use safely.

### Changes

- File: [order-menu-controller.js](C:/dev/clip-sandbox/src/ui/order-menu-controller.js)
  Inspect: identify which parts are action-list generic versus hard-coded to the toolbar button flow.

- File: `src/ui/`
  Prototype: choose one of these approaches and record the result in `Decision Log` during execution:
  - create a new reusable primitive such as `menu-controller.js` or `context-menu-controller.js` and keep `order-menu-controller.js` as a thin adapter, or
  - refactor `order-menu-controller.js` into a generic menu controller plus a toolbar-specific wrapper.

- File: `tests/integration/ui/`
  Prototype: add or adjust a focused test that proves the chosen primitive can support both:
  - button-anchored menus,
  - pointer-anchored menus.

### Validation

- Command: `npm run unit -- tests/integration/ui/order-menu-controller.spec.js`
  Expected: the existing toolbar menu behavior still passes while the extraction strategy becomes clearer.

- Command: `npm run unit`
  Expected: the prototype does not break current menu or grid behavior.

### Rollback/Containment

If generalizing the existing controller starts to contort the toolbar menu API, stop and create a new generic menu primitive instead of overfitting one abstraction. Preserve current toolbar behavior first; do not let this milestone destabilize existing `Save` and `Save as New` interaction.

## Milestone 1 - Build the reusable menu primitive and destination-picker UI

### Scope

Introduce the reusable menu component and the UI surfaces needed to launch the add-to-collection workflow from both right-click and the top `Collection` menu, without yet mutating collections.

### Changes

- File: `src/ui/<chosen-menu-primitive>.js`
  Create or refactor: implement a reusable menu primitive that owns:
  - open/close state,
  - anchor positioning for pointer coordinates and anchored controls,
  - rendering or managing a supplied action list,
  - disabled-item behavior,
  - outside-click dismissal,
  - `Escape` dismissal,
  - basic focus behavior suitable for menu actions.

- File: [order-menu-controller.js](C:/dev/clip-sandbox/src/ui/order-menu-controller.js)
  Edit: adapt the existing `Collection` menu to use the reusable primitive or remain a thin wrapper around it, while preserving current keyboard navigation.

- File: [clip-collection-grid-controller.js](C:/dev/clip-sandbox/src/ui/clip-collection-grid-controller.js)
  Edit: add right-click/contextmenu event wiring that:
  - suppresses the browser context menu on the grid surface,
  - does not change selection,
  - emits a request upward with pointer position and current selected-set context,
  - supports empty-grid invocation that still refers to the current selection.

- File: `sandbox/` and any supporting sandbox entry modules
  Edit: add a minimal isolated sandbox integration for the reusable menu primitive that:
  - opens the menu with fake actions unrelated to collections,
  - proves the component can be mounted and used independently of the clip grid,
  - exercises enabled items, disabled items, dismissal behavior, and callback logging or visible result output,
  - optionally demonstrates both pointer-anchored and control-anchored open modes if the component supports both.

- File: [index.html](C:/dev/clip-sandbox/index.html)
  Edit: add any required host element or lightweight picker surface for:
  - the new context menu,
  - the add-to-collection destination picker,
  - optional `New collection...` name input and inline validation display.

- File: [app-controller.js](C:/dev/clip-sandbox/src/app/app-controller.js)
  Edit: wire both entry points:
  - right-click `Add Selected to Collection`,
  - top `Collection` menu fallback `Add Selected to Collection...`,
  to the same destination-picker UI flow.

- File: `tests/integration/ui/<menu-primitive>.spec.js`
  Create: verify reusable menu behavior, including:
  - open at pointer coordinates,
  - disabled action rendering,
  - invocation callback,
  - dismissal on outside click and `Escape`.

- File: [tests/e2e/scenarios.spec.js](C:/dev/clip-sandbox/tests/e2e/scenarios.spec.js) or a dedicated sandbox-focused Playwright spec
  Edit: add a sandbox smoke scenario that:
  - loads the sandbox page or sandbox route,
  - opens the reusable menu using fake sandbox actions,
  - verifies enabled and disabled items,
  - verifies dismissal behavior,
  - verifies visible callback output after invoking a fake action.

- File: [tests/integration/ui/order-menu-controller.spec.js](C:/dev/clip-sandbox/tests/integration/ui/order-menu-controller.spec.js)
  Edit: keep current toolbar-menu coverage green after the reuse/extraction.

- File: [tests/integration/ui/clip-collection-grid-controller.spec.js](C:/dev/clip-sandbox/tests/integration/ui/clip-collection-grid-controller.spec.js)
  Edit: add contextmenu coverage proving right-click does not collapse or alter selection and can be invoked from empty grid space.

### Validation

- Command: `npm run unit -- tests/integration/ui/order-menu-controller.spec.js tests/integration/ui/clip-collection-grid-controller.spec.js`
  Expected: existing menu and grid behavior pass with the new contextmenu path.

- Command: run the sandbox entry point used by this repo for manual UI checks
  Expected: the menu opens and functions with fake sandbox actions without depending on clip-grid state or collection data.

- Command: `npm run e2e -- --grep "sandbox|context menu|menu sandbox"`
  Expected: the sandbox smoke scenario passes and proves the reusable menu still works in isolation.

- Command: `npm run unit`
  Expected: the reusable menu primitive does not break current menu, grid, or view-model behavior.

### Rollback/Containment

If the context menu UI becomes flaky, keep the reusable primitive and temporarily limit the destination-picker launch to the top toolbar menu until the pointer path is stabilized. Do not implement collection mutation logic until both entry points can at least open a consistent picker surface.

## Milestone 2 - Add domain behavior and CollectionManager

### Scope

Add the lower-level and orchestration behavior for add-to-collection operations without tying it to the DOM.

### Changes

- File: [clip-collection.js](C:/dev/clip-sandbox/src/domain/clip-collection.js)
  Edit: add a source-side query method such as:
  - `clipNamesForIdsInOrder(clipIds)`, or
  - `clipsForIdsInOrder(clipIds)`,
  that:
  - preserves caller-supplied id order,
  - ignores ids not present in the collection,
  - returns a stable ordered source payload for the collection operation.

- File: [clip-collection-content.js](C:/dev/clip-sandbox/src/domain/clip-collection-content.js)
  Edit: add destination-side merge behavior that:
  - accepts ordered incoming clip names,
  - preserves existing destination order,
  - appends only names not already present,
  - returns updated content plus structured outcome data such as added count, skipped count, and no-op state.

- File: `src/app/collection-manager.js`
  Create: implement `CollectionManager` as an application service that:
  - accepts source selection input, destination request, inventory, current runtime collection, and persistence dependencies,
  - resolves destination collection content from inventory,
  - validates destination eligibility,
  - creates new destination content when `New collection...` is chosen,
  - reuses shared name normalization/validation rules,
  - calls domain methods to compute the updated destination content,
  - persists the result through the existing save abstraction,
  - upserts the saved destination into inventory,
  - returns a structured result for UI/status reporting.

- File: [app-controller.js](C:/dev/clip-sandbox/src/app/app-controller.js)
  Edit: move shared collection-name validation out of inline `Save as New` flow if needed so both `Save as New` and `CollectionManager` can use one source of truth.

- File: [clip-collection-inventory.js](C:/dev/clip-sandbox/src/domain/clip-collection-inventory.js)
  Edit: add only the helper APIs needed by `CollectionManager`, such as:
  - eligible destination lookup excluding the active collection,
  - upsert behavior for saved destination content,
  - possibly convenience accessors for the default collection and active selection value.
  Do not put the full operation itself on inventory.

- File: [tests/unit/clip-models.spec.js](C:/dev/clip-sandbox/tests/unit/clip-models.spec.js)
  Edit: add coverage for:
  - ordered source-name extraction from `ClipCollection`,
  - append-without-duplicates behavior on `ClipCollectionContent`,
  - no-op when all selected clips are already present.

- File: `tests/unit/collection-manager.spec.js`
  Create: verify `CollectionManager` for:
  - add to existing explicit collection,
  - add to default collection,
  - add to new collection,
  - invalid destination rejection,
  - save-path reuse,
  - structured result counts and no-op behavior.

### Validation

- Command: `npm run unit -- tests/unit/clip-models.spec.js tests/unit/collection-manager.spec.js`
  Expected: domain and `CollectionManager` behavior pass without DOM dependencies.

- Command: `npm run unit`
  Expected: the new service and domain methods do not break existing inventory, save, or model tests.

### Rollback/Containment

If `CollectionManager` starts absorbing unrelated UI concerns, stop and move only orchestration-free logic back down to domain methods or shared validation helpers. If domain methods on `ClipCollection` or `ClipCollectionContent` become awkward, record the reason in `Decision Log` before introducing any lower-level helper module.

## Milestone 3 - Integrate the workflow with immediate save and preserved source state

### Scope

Connect the UI entry points to `CollectionManager`, persist destination updates immediately, and keep the source collection and source selection intact after completion.

### Changes

- File: [app-controller.js](C:/dev/clip-sandbox/src/app/app-controller.js)
  Edit: instantiate `CollectionManager` with:
  - inventory access,
  - current runtime collection access,
  - save dependencies,
  - status/error reporting dependencies.

- File: [app-controller.js](C:/dev/clip-sandbox/src/app/app-controller.js)
  Edit: on confirm from the destination-picker flow:
  - read ordered selected clip ids from the grid controller,
  - call `CollectionManager`,
  - leave the current active source collection rendered,
  - leave the source selection unchanged,
  - update status/error text from the returned result.

- File: [app-controller.js](C:/dev/clip-sandbox/src/app/app-controller.js)
  Edit: ensure destination saves update inventory without:
  - switching active collection,
  - clearing current source dirty state,
  - altering current selection.

- File: [app-text.js](C:/dev/clip-sandbox/src/app/app-text.js)
  Edit: add status-text helpers for:
  - added only,
  - added plus skipped,
  - no-op because all selected clips were already present,
  - save failure if needed.

- File: [index.html](C:/dev/clip-sandbox/index.html)
  Edit: add any needed visible affordance or hint updates for the new action path if the UI would otherwise be undiscoverable.

- File: [tests/e2e/scenarios.spec.js](C:/dev/clip-sandbox/tests/e2e/scenarios.spec.js)
  Edit: add browser-visible workflows for:
  - right-click add to an existing collection,
  - right-click on empty grid space still referring to current selection,
  - top-menu fallback add flow,
  - creating a new collection from selected clips,
  - adding to default collection when its backing file does not yet exist,
  - success messaging with added and skipped counts,
  - source collection and selection preserved after completion.

### Validation

- Command: `npm run e2e -- --grep "Add Selected to Collection|Collection menu"`
  Expected: the new add-to-collection workflows pass end to end in the browser.

- Command: `npm run unit`
  Expected: all lower-level tests stay green while the integration path is wired in.

### Rollback/Containment

If immediate-save integration proves unstable, preserve the `CollectionManager` result shape and disable only the UI entry point until the save path is repaired. Do not fall back to silently mutating in-memory destination content without persistence; that would violate the feature boundary and confuse inventory state.

## Milestone 4 - Regression, copy, and documentation

### Scope

Make the feature discoverable and confirm it does not regress adjacent collection workflows.

### Changes

- File: [index.html](C:/dev/clip-sandbox/index.html)
  Edit: update toolbar hint text if needed so the app mentions right-click or the `Collection` menu fallback without overcrowding the shell.

- File: [docs/documentation/user-guide.md](C:/dev/clip-sandbox/docs/documentation/user-guide.md)
  Edit: document:
  - right-click add-to-collection,
  - top-menu fallback path,
  - `New collection...`,
  - duplicate skipping and append order,
  - preserved source selection and source collection.

- File: [docs/documentation/developer-guide.md](C:/dev/clip-sandbox/docs/documentation/developer-guide.md)
  Edit: document the new architecture boundaries:
  - reusable menu primitive,
  - `CollectionManager`,
  - domain behavior split across `ClipCollection` and `ClipCollectionContent`.

- File: sandbox documentation or nearby developer-facing notes if this repo keeps sandbox usage documented
  Edit: mention the new menu sandbox entry point so future UI work can use it for isolated verification.

- File: developer-facing docs near test or sandbox guidance
  Edit: note that the sandbox is not only for manual inspection; it is also covered by an automated smoke test that should remain part of regular validation.

- File: [tests/e2e/scenarios.spec.js](C:/dev/clip-sandbox/tests/e2e/scenarios.spec.js)
  Edit: keep or extend regression checks for:
  - save and save-as-new,
  - collection switching,
  - multi-selection and bulk remove,
  - zoom and fullscreen,
  - drag reorder.

### Validation

- Command: `npm run test:all`
  Expected: the full unit/integration and Playwright suite passes with the final feature and updated docs/copy.

- Command: `npm run e2e`
  Expected: the full browser scenario set passes, including the new right-click and fallback workflows.

### Rollback/Containment

If documentation lags late in the milestone, runtime behavior and regression coverage take priority, but the user guide and in-app discoverability copy must ship with the feature because the right-click entry point is not self-evident on its own.

