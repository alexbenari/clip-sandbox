# Implement Multi-Selection and Bulk Remove in the Clip Grid

## Why this matters

Users need to remove several clips from a collection in one action instead of repeating the same select-delete cycle clip by clip. Shipping multi-selection also creates a stable selected-set model that future collection actions can reuse without redefining grid behavior each time.

This plan implements the approved spec in [docs/specs/multi-selection-spec.md](C:/dev/clip-sandbox/docs/specs/multi-selection-spec.md) while preserving existing zoom, fullscreen, reorder, and save flows.

## Progress

- [x] (2026-04-02 00:00Z) Approved feature spec captured in `docs/specs/multi-selection-spec.md`.
- [x] (2026-04-02 00:10Z) Execution plan drafted in `docs/plans/multi-selection-exec-plan.md`.
- [x] (2026-04-02 00:35Z) Refactored the grid controller from one selected clip id to an ordered selected-set model with `Ctrl`/`Cmd` modifier-click semantics.
- [x] (2026-04-02 00:50Z) Moved delete-key interpretation into the grid controller, added `ClipCollection.removeMany(...)`, and kept bootstrap as thin orchestration for dirty-state refresh, rerender, and status text.
- [x] (2026-04-02 01:05Z) Updated in-app hint text, user/developer docs, and automated coverage; passed `npm run test:all`.

## Surprises & Discoveries

- Discovery: the current grid controller already owns selection visuals, but it stores exactly one selected clip id in `selectedClipId`.
  Evidence: `src/ui/clip-collection-grid-controller.js` defines `let selectedClipId = null;` and `applySelectionClasses()` toggles `.selected` only for that one clip id.

- Discovery: card click handling currently throws away the browser event object, so modifier-click behavior cannot be implemented without changing the click callback signature.
  Evidence: `createThumbCard(...)` wires `card.addEventListener('click', () => onSelect(card));` in `src/ui/clip-collection-grid-controller.js`.

- Discovery: double-click already has the right collapse-before-open shape for the new feature because it calls `selectOnlyCard(card)` before `onOpenClip`.
  Evidence: `onDoubleClick(card)` in `src/ui/clip-collection-grid-controller.js`.

- Discovery: delete behavior is still orchestrated in `src/app/bootstrap.js`, and it currently removes exactly one clip by calling `state.currentCollection.remove(selectedClipId)`.
  Evidence: `onKeyDown(e)` in `src/app/bootstrap.js`.

- Discovery: the visible usage hint and docs are still single-selection oriented.
  Evidence: `index.html` contains `drag to reorder • click to select • double-click or Z to zoom • press Delete to remove • press F for fullscreen`, and `docs/documentation/user-guide.md` describes delete in singular form.

- Discovery: preserving still-valid selected ids across rerender is the right low-level grid behavior; only missing ids should be dropped automatically.
  Evidence: the updated controller test in `tests/integration/ui/clip-collection-grid-controller.spec.js` now proves rerender keeps `clip_3` selected when that clip still exists and drops only invalid selections.

## Decision Log

- Decision: keep selected-set ownership inside `src/ui/clip-collection-grid-controller.js` instead of moving it into app state.
  Rationale: the grid already owns selection visuals and pointer behavior, so a selected-set API extends the existing boundary without widening global state.
  Date/Author: 2026-04-02 / Codex

- Decision: expose both `getSelectedClipIds()` and a convenience accessor that resolves to one clip id only when exactly one clip is selected.
  Rationale: bulk actions need the full set, while zoom and similar single-item features should keep a simple exact-one query instead of duplicating selection logic in `bootstrap.js`.
  Date/Author: 2026-04-02 / Codex

- Decision: bulk delete must operate on selected clips in current grid order, then clear selection.
  Rationale: the user-approved spec makes grid order the source of deterministic bulk-action order, and clearing selection avoids stale references after rerender.
  Date/Author: 2026-04-02 / Codex

- Decision: modifier-click support should treat `ctrlKey` and `metaKey` as equivalent additive-toggle signals.
  Rationale: the approved spec requires both Windows/Linux `Ctrl+click` and macOS `Cmd+click`.
  Date/Author: 2026-04-02 / Codex

- Decision: the grid controller should own delete-key interaction and resolve the selected ids to remove, while the app layer remains responsible for mutating `ClipCollection`, refreshing dirty state, rerendering, and showing status text.
  Rationale: delete is a grid interaction tied to selection semantics, but collection mutation and app status concerns should stay outside the UI controller boundary.
  Date/Author: 2026-04-02 / Codex

- Decision: batch removal should be implemented on `ClipCollection` itself, for example as `removeMany(orderedClipIds)`, while `ClipCollectionInventory` remains responsible for baseline comparison and dirty-state refresh.
  Rationale: the runtime mutable working collection is still `state.currentCollection`; inventory tracks saved collection content and dirty state but does not own runtime collection mutation.
  Date/Author: 2026-04-02 / Codex

## Outcomes & Retrospective

Shipped outcomes:

- users can build and shrink a multi-selection with `Ctrl+click` and `Cmd+click`,
- plain click collapses back to exactly one selected clip,
- `Delete` and `Backspace` remove the full selected set from the active collection,
- double-click still collapses to one item and opens zoom,
- `Z` opens zoom only when exactly one clip is selected,
- drag reorder, save flows, collection switching, and fullscreen behavior remain intact.

Implementation notes:

- `src/ui/clip-collection-grid-controller.js` now owns an ordered selected-set API and delete-key interpretation.
- `src/domain/clip-collection.js` now owns batch removal through `removeMany(...)`.
- `src/app/bootstrap.js` now responds to grid removal requests by mutating the active runtime collection, refreshing dirty state, rerendering, and showing singular/plural status text.

Validation evidence:

- `npm run unit` -> 13 test files passed, 65 tests passed.
- `npm run e2e -- --grep "Delete selected clip|Zoom mode"` -> 9 browser scenarios passed.
- `npm run test:all` -> full suite passed, 44 Playwright scenarios passed.

## Context and orientation

This repository is a browser-only clip-review app with no frontend framework. The app shell is `index.html`, and runtime wiring happens in `src/app/bootstrap.js`.

Key files for this feature:

- `src/ui/clip-collection-grid-controller.js`
  Owns card rendering, click/double-click/drag wiring, selection visuals, and object URL lifecycle for the main grid.
- `src/app/bootstrap.js`
  Owns keyboard behavior, collection mutation, zoom opening, fullscreen coordination, and user-facing status messages.
- `src/domain/clip-collection.js`
  Owns ordered clip membership and collection mutations such as `remove(...)` and `replaceOrder(...)`.
- `tests/integration/ui/clip-collection-grid-controller.spec.js`
  Verifies the grid controller in isolation.
- `tests/e2e/scenarios.spec.js`
  Covers user-visible behaviors through Playwright.
- `index.html`
  Contains the visible usage hint that must reflect the new feature.
- `docs/documentation/user-guide.md`
  Describes shipped interaction behavior for end users.

Current behavior flow:

1. `bootstrap.js` creates `gridController` through `createClipCollectionGridController(...)`.
2. The grid controller renders one card per clip and tracks one selected clip id.
3. Plain click toggles the one selected clip on or off.
4. Double-click selects one clip and opens zoom.
5. `Delete` and `Backspace` in `bootstrap.js` remove the one selected clip from `state.currentCollection`, rerender the grid, and show a status message.

Terms used in this plan:

- `selected set`: the collection of clip ids currently selected in the grid.
- `single selected clip`: the exact-one case where the selected set contains one clip id and can safely drive zoom.
- `grid order`: the visible DOM-backed card order exposed by the grid controller and kept in sync with the active `ClipCollection`.

Implementation constraints that must remain true:

- no shift-range selection,
- no grouped drag-and-drop reorder,
- no multi-item zoom or fullscreen behavior,
- selection remains transient UI state and is not saved with the collection,
- delete shortcuts remain ignored when focus is inside editable controls.

## Milestone 1 - Refactor the grid controller to own a selected set

### Scope

Replace single-selection state in the grid controller with a selected-set model, while preserving existing rendering and drag behavior.

### Changes

- File: `src/ui/clip-collection-grid-controller.js`
  Edit: replace `selectedClipId` state with a set-like structure of selected clip ids plus helper functions for:
  - applying `.selected` classes to all selected cards,
  - clearing the full selection,
  - collapsing to one selected card,
  - toggling one clip id inside the selected set,
  - returning selected clip ids in deterministic grid order,
  - returning the single selected clip id only when exactly one item is selected.

- File: `src/ui/clip-collection-grid-controller.js`
  Edit: change card click wiring so the click handler receives the `MouseEvent`, allowing the controller to branch on `event.ctrlKey` and `event.metaKey`.

- File: `src/ui/clip-collection-grid-controller.js`
  Edit: preserve double-click behavior by collapsing to the clicked item before calling `onOpenClip`, regardless of the previous selected set.

- File: `src/ui/clip-collection-grid-controller.js`
  Edit: on rerender, retain only selected clip ids that still exist in the current collection; selection for removed or no-longer-present clips must be dropped.

- File: `tests/integration/ui/clip-collection-grid-controller.spec.js`
  Edit: replace single-selection-only assertions with coverage for:
  - plain click selecting exactly one item,
  - `Ctrl+click` adding a second item,
  - `Ctrl+click` or `Cmd+click` removing an already selected item,
  - plain click after multi-selection collapsing to one item,
  - double-click collapsing and emitting one open request,
  - rerender dropping invalid selected ids.

### Validation

- Command: `npm run unit -- tests/integration/ui/clip-collection-grid-controller.spec.js`
  Expected: the grid-controller suite passes and proves modifier-click, collapse, and exact-one accessors behave as specified.

- Command: `npm run unit`
  Expected: the full unit/integration suite still passes after the controller API changes.

### Rollback/Containment

If this milestone destabilizes the grid too broadly, keep the new helper names but temporarily route them through single-selection behavior until tests are green again. Do not proceed to bulk-delete wiring until the controller can return a stable ordered selected set.

## Milestone 2 - Move delete interaction into the grid controller and wire app orchestration

### Scope

Move delete-key handling into the grid controller so the grid owns selection-driven removal requests, while app orchestration continues to own collection mutation, dirty-state refresh, rerender, and viewer behavior.

### Changes

- File: `src/app/bootstrap.js`
  Edit: replace calls to `gridController.getSelectedClipId()` in zoom paths with the new selected-set API and remove direct delete-key ownership from `onKeyDown(e)`.

- File: `src/domain/clip-collection.js`
  Edit: add a batch-removal method such as `removeMany(orderedClipIds)` that:
  - removes only clip ids present in the collection,
  - preserves deterministic behavior based on the incoming ordered ids,
  - returns the ordered list or count of actually removed clip ids for status and rerender decisions.

- File: `src/ui/clip-collection-grid-controller.js`
  Edit: add keyboard handling for `Delete` and `Backspace` at the card/grid surface so the controller can:
  - ignore editable targets,
  - ignore delete while no clips are selected,
  - resolve selected clip ids in current grid order,
  - emit a new app-level callback such as `onRemoveSelected(orderedSelectedClipIds)`.

- File: `src/app/bootstrap.js`
  Edit: handle the new grid callback by:
  - calling the new `ClipCollection.removeMany(...)` method on `state.currentCollection`,
  - refreshing dirty state once after the batch mutation,
  - rerendering the collection,
  - updating the collection selector,
  - showing singular or plural status text based on the removed count.

- File: `src/app/bootstrap.js`
  Edit: keep `Z` as an exact-one action only. When zero or multiple clips are selected, it must return without opening zoom.

- File: `src/app/bootstrap.js`
  Edit: keep double-click semantics unchanged at the app level by relying on the controller’s collapse-before-open behavior.

- File: `src/ui/clip-collection-grid-controller.js`
  Edit: ensure delete-key handling remains a no-op when no clips are selected.

- File: `src/app/bootstrap.js`
  Edit: ensure zoom-open state still suppresses removal behavior by keeping grid-driven delete requests from mutating the collection while zoom is open.

- File: `tests/e2e/scenarios.spec.js`
  Edit: add or update scenarios for:
  - `Ctrl+click` multi-selection followed by `Delete`,
  - `Cmd+click` multi-selection behavior via `metaKey`,
  - plain click collapsing back to one selected clip,
  - `Z` opening zoom only when exactly one clip is selected,
  - `Z` doing nothing when multiple clips are selected.

### Validation

- Command: `npm run e2e -- --grep "Delete selected clip|Zoom mode"`
  Expected: the updated delete and zoom scenarios pass, including the new multi-selection branches.

- Command: `npm run unit`
  Expected: unit/integration suites remain green after bootstrap consumes the new controller API.

### Rollback/Containment

If Playwright coverage becomes flaky, keep the product code and simplify the interaction steps, but do not drop the multi-selection delete and exact-one zoom regressions. If pluralized status text proves noisy to hard-code in assertions, assert the collection count/order outcome instead.

## Milestone 3 - Update copy, docs, and full-suite regression coverage

### Scope

Make the shipped feature discoverable and verify it does not regress adjacent workflows.

### Changes

- File: `index.html`
  Edit: update the inline usage hint to mention modifier-click multi-selection and deleting selected clips without overloading the toolbar copy.

- File: `docs/documentation/user-guide.md`
  Edit: revise the collection-editing section so it describes:
  - `Ctrl+click` and `Cmd+click` multi-selection,
  - plain click collapsing to one item,
  - `Delete` and `Backspace` removing all selected clips.

- File: `docs/documentation/developer-guide.md`
  Edit: add a short note that the main grid controller now owns a selected set rather than one selected clip id if the developer guide already documents controller responsibilities.

- File: `tests/e2e/scenarios.spec.js`
  Edit: keep adjacent regressions intact for drag reorder, collection switching, save/save-as-new, zoom by double-click, and fullscreen behavior.

### Validation

- Command: `npm run test:all`
  Expected: all unit/integration and Playwright scenarios pass with the final copy and behavior in place.

### Rollback/Containment

If schedule pressure appears here, runtime behavior and regression coverage take priority over developer-guide wording, but the in-app hint and user guide must ship with the feature because the interaction is not obvious from existing copy.
