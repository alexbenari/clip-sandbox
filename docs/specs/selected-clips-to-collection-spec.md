# Feature Spec: Add Selected Clips to a Collection

## 1. Summary

Add a collection-copy action that lets the user take the currently selected clips from the active collection and add them to another collection in the same folder.

The action must be reachable from:

1. a custom right-click context menu in the clip grid, and
2. the existing top-level `Collection` menu as a keyboard-accessible fallback.

The selected clips remain in the source collection. The destination collection is updated immediately and auto-saved to its backing `.txt` file. The app stays on the current source collection after the action completes.

## 2. Problem

The app already supports:

1. selecting one or more clips in the active grid,
2. removing selected clips from the active collection,
3. saving the active collection, and
4. creating or switching among folder-scoped collections.

What it cannot do is build new collections from an existing selected set without switching collections, reordering manually, or reconstructing subsets one file at a time. This makes common workflows such as curating highlight sets, alternates, or exports slower than necessary.

## 3. Goals and Non-Goals

### 3.1 Goals

1. Let users copy the current selected set into another collection in the same folder.
2. Support both existing destination collections and `New collection...`.
3. Preserve the selected set in the source grid after the operation.
4. Skip clips that already exist in the destination collection.
5. Append newly added clips to the destination collection in the current source-grid selection order.
6. Auto-save the destination collection immediately after mutation.
7. Keep the app on the source collection and avoid introducing multi-collection dirty-state management.
8. Provide the action through both right-click and the existing `Collection` menu.

### 3.2 Non-Goals

1. No cross-folder collection editing.
2. No move semantics; this feature copies only.
3. No duplicate clip entries in a collection.
4. No background persistence queue or deferred save model.
5. No new global unsaved-state model for non-active collections.
6. No native browser or OS context menu integration.
7. No bulk remove or reorder changes beyond existing behavior.

## 4. User Stories

1. As a user, I can select clips in the current collection and add them to an existing collection without leaving the source collection.
2. As a user, I can create a new collection directly from the selected set.
3. As a user, I can right-click in the grid and apply the action to the selection I already built.
4. As a user, I receive clear feedback about how many clips were added and how many were skipped because they were already present.
5. As a developer, I can implement this feature without turning collection inventory into a general multi-document dirty-state system.

## 5. Functional Requirements

### 5.1 Source Selection Rules

This feature operates on the current selected set owned by the visible grid.

Required behavior:

1. the source clip set is the grid controller's current ordered selected clip id list,
2. the selected set is resolved in current visible grid order,
3. the action is enabled only when at least one clip is selected,
4. the action does not modify the source selection before opening,
5. the action does not collapse selection when the user right-clicks an unselected clip,
6. the action does not clear or alter selection after a successful add.

### 5.2 Destination Eligibility

Destination collections are limited to the currently loaded folder inventory.

Required behavior:

1. the destination must be another collection in the active folder,
2. the currently active source collection is excluded from destination choices,
3. the synthetic default collection is a valid destination,
4. choosing the default collection as destination creates its backing file on first write if it does not already exist,
5. the action also supports `New collection...`,
6. a new collection name follows the same filename validation rules already used by `Save as New`.

### 5.3 Copy Semantics

The operation copies selected clips into the destination collection.

Required behavior:

1. selected clips remain in the source collection,
2. destination membership is based on clip filename equality, consistent with existing collection serialization and materialization rules,
3. clips already present in the destination are skipped,
4. newly added clips append to the end of the destination collection,
5. appended clips preserve the selected-set order from the current source grid,
6. if every selected clip is already present in the destination, the operation becomes a no-op aside from user feedback.

### 5.4 Persistence Behavior

Destination changes are persisted immediately.

Required behavior:

1. once the destination content is resolved, the app writes the updated destination collection file immediately,
2. the write uses the same persistence path and fallback behavior as existing collection saves:
   - direct folder write when available,
   - browser download fallback when direct folder write is unavailable,
3. successful writes update in-memory inventory to the saved destination content,
4. the source collection remains the active collection after completion,
5. the feature must not mark the source collection dirty unless it was already dirty for unrelated reasons,
6. the feature must not introduce tracked dirty state for the destination after save because the destination is persisted immediately as part of the action.

### 5.5 Failure Behavior

The operation must fail cleanly.

Required behavior:

1. if the destination save fails, the app reports the failure and does not claim success,
2. the active source collection remains rendered and selected,
3. if the destination is `New collection...` and the name is invalid, the add action is blocked until corrected,
4. if direct folder write is unavailable and the app falls back to download, the operation is still considered complete once the download flow succeeds under the existing save abstraction,
5. invalid or unavailable destination collections are never shown as valid action targets.

## 6. UX Specification

### 6.1 Right-Click Context Menu

The clip grid gets a custom context menu implemented as a reusable UI component.

Required behavior:

1. right-click inside the grid surface opens the custom menu,
2. the browser's default context menu is suppressed for this interaction,
3. the menu refers to the currently selected clips and does not change selection on open,
4. if no clips are selected, the add action is visible but disabled,
5. if one or more clips are selected, the menu exposes `Add Selected to Collection`,
6. selecting that action opens the destination picker flow,
7. clicking elsewhere or pressing `Escape` closes the menu.

Clarification:

1. "right-click anywhere" means the menu is anchored to the current grid interaction surface, not only to selected cards,
2. right-clicking empty grid space still refers to the current selection,
3. this feature is the first consumer of the context menu component, but the component should be generic enough to support future menu-driven actions elsewhere in the app.

### 6.2 Destination Picker Flow

Choosing `Add Selected to Collection` opens a destination picker.

Required behavior:

1. the picker lists all eligible destination collections in the active folder except the active source collection,
2. the picker includes `New collection...`,
3. choosing `New collection...` reveals a collection-name input,
4. the picker exposes `Add` and `Cancel`,
5. `Add` is disabled until the form is valid,
6. `Cancel` closes the flow without side effects.

The implementation may use:

1. a lightweight custom popover/panel attached to the context menu flow,
2. a small dialog,
3. the same destination picker component when launched from the top `Collection` menu.

This spec does not require a native `<dialog>` specifically, only a consistent accessible flow.

### 6.3 Top Menu Fallback

The existing `Collection` menu must also expose the feature.

Required behavior:

1. add a new action labeled `Add Selected to Collection...`,
2. the action is disabled when no clips are selected,
3. activating the action opens the same destination picker flow used by the right-click path,
4. keyboard users can complete the full workflow without using a mouse.

### 6.4 Success Feedback

The app provides status feedback after completion.

Required behavior:

1. success feedback includes the destination collection name,
2. success feedback states how many clips were added,
3. when any selected clips were skipped because they already existed in the destination, feedback includes the skipped count,
4. when zero clips were added because all were already present, the status must say so clearly.

Acceptable copy examples:

1. `Added 3 clips to highlights.`
2. `Added 2 clips to highlights. Skipped 1 already present.`
3. `No clips were added to highlights. All 4 selected clips are already present.`

## 7. Boundaries and Architecture

This feature must be split cleanly across levels. The goal is to avoid smearing UI concerns, inventory concerns, and persistence concerns into one controller.

### 7.1 UI Layer Responsibilities

UI components own only interaction surfaces and presentation state.

Expected responsibilities:

1. grid context-menu open/close behavior,
2. menu positioning and dismissal behavior,
3. destination picker presentation,
4. validation-result display for `New collection...` using the shared collection-name validation rules already established elsewhere in the app,
5. enabling or disabling actions based on selection presence and available destinations,
6. forwarding an action request upward with:
   - selected source clip ids in order,
   - chosen destination mode (`existing` or `new`),
   - destination identifier or proposed new collection name.

The context menu should be implemented as a reusable UI primitive with responsibilities such as:

1. anchoring to pointer coordinates,
2. rendering a supplied action list,
3. disabled-item rendering,
4. keyboard dismissal and focus handling,
5. outside-click dismissal.

UI components must not:

1. mutate `ClipCollectionInventory` directly,
2. serialize `.txt` content directly,
3. decide persistence strategy.

### 7.2 App-Orchestration Responsibilities

The app bootstrap or equivalent orchestration layer should delegate collection-operation workflows to a dedicated `CollectionManager` application-service class.

Expected responsibilities:

1. read the current selected clip ids from the grid controller in visible grid order and use them as the source input for the add-to-collection workflow,
2. hand that ordered source input and the chosen destination request to `CollectionManager`,
3. let `CollectionManager` resolve destination collection content from the inventory,
4. let `CollectionManager` reject invalid destinations such as the current active collection,
5. let `CollectionManager` invoke domain or business-logic helpers to compute the updated destination content,
6. let `CollectionManager` persist the updated destination via the existing save abstraction,
7. let `CollectionManager` update inventory after save,
8. preserve the current active source collection and current source selection,
9. emit status or error messages based on the structured result returned by `CollectionManager`.

The orchestration layer is the correct place for:

1. wiring UI events to `CollectionManager`,
2. preserving active-screen state before and after the operation,
3. translating `CollectionManager` results into status and error presentation.

`CollectionManager` is the correct place for:

1. collection operation entry points such as `addSelectedClipsToCollection`,
2. immediate-save semantics,
3. fallback-to-download behavior reuse,
4. deciding whether the action is a no-op, partial add, or full add,
5. coordinating inventory reads and writes for collection operations.

### 7.3 Domain Responsibilities

Lower-level collection rules should be added to existing domain objects where the behavior is naturally owned, rather than introduced first as free-floating helper modules.

Expected responsibilities:

1. `ClipCollection` owns source-side runtime queries based on selected clip ids,
2. `ClipCollectionContent` owns destination-side serialized merge rules,
3. `CollectionManager` composes those domain behaviors but does not re-implement them inline.

Recommended domain split:

1. `ClipCollection`
   - derive ordered source clips or clip names from selected clip ids,
   - preserve the caller-provided id order after filtering to clips that exist in the collection.
2. `ClipCollectionContent`
   - merge incoming ordered clip names into the destination content,
   - preserve existing destination order,
   - append only clip names not already present,
   - report added count, skipped count, and no-op outcome,
   - return updated content in the same domain shape.

This logic should be reusable and testable without DOM or browser APIs.

Only introduce an extra helper or service below `CollectionManager` if the behavior proves awkward to express on these existing domain objects.

### 7.4 Inventory Boundary

`ClipCollectionInventory` should remain folder-scoped collection inventory, not become a general editor for many simultaneously dirty collections.

Required boundary:

1. inventory may expose helper lookups and upsert behavior for destination content,
2. inventory may expose eligible destination lists that exclude the active source collection,
3. inventory should not itself become the home for higher-level collection operations such as add-to-collection,
4. those operations belong in `CollectionManager`, which works with inventory rather than replacing it,
5. inventory must not grow a requirement to track independent unsaved state for multiple collections as part of this feature,
6. active-collection dirty tracking remains tied to the currently rendered source collection only.

### 7.5 Persistence Boundary

Persistence rules should continue to flow through existing save infrastructure.

Required boundary:

1. the feature should reuse the same write/download abstraction already used for collection saves,
2. the feature should not create a separate ad hoc file-writing path in the UI controller,
3. the saved result must be represented as a `ClipCollectionContent`-compatible description so inventory stays aligned with current collection-file handling.

## 8. Testing Requirements

### 8.1 Domain or Logic Tests

Add or update tests to cover:

1. merging selected clip names into an existing destination without duplicates,
2. preserving existing destination order,
3. appending new names in selected source order,
4. correct added and skipped counts,
5. no-op result when all selected clips already exist,
6. new destination creation from selected source clips.

### 8.2 UI and Integration Tests

Add or update tests to cover:

1. right-click opens the custom context menu without changing selection,
2. right-click on empty grid space still operates on the existing selection,
3. add action is disabled when no clips are selected,
4. top `Collection` menu fallback opens the same add flow,
5. destination picker excludes the active source collection,
6. `New collection...` enforces existing save-as-new filename validation rules,
7. successful add preserves the active source collection and current source selection,
8. successful add updates inventory for the destination collection,
9. success status copy reflects added and skipped counts.

### 8.3 Persistence and Workflow Tests

Add or update tests to cover:

1. adding to an existing explicit collection persists the updated file,
2. adding to the default collection creates its backing file when needed,
3. adding to a new collection creates and persists a new `.txt` file,
4. write-path fallback to download continues to work through the shared save abstraction,
5. destination save failure reports an error and does not falsely report success.

### 8.4 Regression Coverage

Existing behavior must remain covered for:

1. multi-selection and bulk remove,
2. collection switching,
3. save and save-as-new,
4. zoom and fullscreen shortcuts,
5. drag-and-drop reorder,
6. unsaved-changes prompts for the active collection.

## 9. Acceptance Criteria

This feature is complete when:

1. a user can select one or more clips in the active collection and invoke `Add Selected to Collection` from either right-click or the top `Collection` menu,
2. the action targets another same-folder collection or `New collection...`,
3. the source collection remains active after the operation,
4. the source selection remains unchanged after the operation,
5. only clips missing from the destination are appended,
6. appended clips follow the selected-set order from the source grid,
7. the destination collection is persisted immediately through the existing save infrastructure,
8. adding to the default collection creates its file on first write when necessary,
9. the active source collection is not incorrectly marked dirty by this operation,
10. the right-click menu implementation is reusable beyond this specific feature,
11. automated tests cover the merge rules, UI flow, and persistence behavior without regressing existing collection workflows.

## 10. Locked Decisions

These decisions are intentionally fixed for this feature unless changed during sign-off:

1. the feature copies clips; it does not move them,
2. the destination is always in the currently loaded folder,
3. duplicate destination entries are skipped, not duplicated,
4. newly added clips append at the end of the destination collection,
5. source-grid selected order determines append order,
6. the app stays on the source collection after completion,
7. the destination collection is auto-saved immediately,
8. the active source collection is not a valid destination,
9. right-click does not collapse or otherwise alter the current selection,
10. the custom context menu refers to the current selected set even when opened from empty grid space,
11. the top `Collection` menu remains available as an accessibility and keyboard fallback,
12. the right-click menu is implemented as a reusable component,
13. this feature must not broaden inventory into a multi-collection dirty-state system.
