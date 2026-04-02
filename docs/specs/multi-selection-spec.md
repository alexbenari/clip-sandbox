# Feature Spec: Multi-Selection in the Clip Grid

## 1. Summary

Add multi-selection to the clip grid so users can select more than one clip with modifier-click and apply collection actions to the full selected set.

The first action enabled by this feature is removing selected clips from the active collection. The design should also establish clear rules so future collection actions can operate on the selected set without redefining selection behavior.

## 2. Problem

The current grid supports only one selected clip at a time. This blocks common collection-editing workflows because users must remove clips one by one and there is no reusable notion of "the current selected set" for future bulk actions.

Today:

1. the grid stores only one selected clip id,
2. click toggles one selected item,
3. `Delete` and `Backspace` remove only one clip,
4. zoom and double-click assume selection always resolves to exactly one clip.

This is sufficient for single-item actions, but it does not scale to bulk collection editing.

## 3. Goals and Non-Goals

### 3.1 Goals

1. Support additive and subtractive selection with `Ctrl+click` and `Cmd+click`.
2. Preserve a clear single-selection fallback with plain click.
3. Make `Delete` and `Backspace` remove all selected clips from the active collection.
4. Preserve existing zoom, fullscreen, reorder, and collection-save behavior unless explicitly changed in this spec.
5. Establish selection semantics that future collection actions can reuse.

### 3.2 Non-Goals

1. No shift-range selection in this feature.
2. No marquee or drag-box selection.
3. No multi-item drag-and-drop reorder.
4. No bulk zoom or bulk fullscreen behavior.
5. No new collection actions beyond bulk remove in this first pass.

## 4. User Stories

1. As a user, I can `Ctrl+click` or `Cmd+click` multiple clips to build a selection set.
2. As a user, I can `Ctrl+click` or `Cmd+click` an already selected clip to remove it from the selection set.
3. As a user, I can plain-click any clip to collapse the selection to that one clip.
4. As a user, I can press `Delete` or `Backspace` once to remove every selected clip from the active collection.
5. As a developer, I can implement future collection actions against a stable selected-set API rather than reintroducing one-off bulk-selection logic.

## 5. Functional Requirements

### 5.1 Selection State

The grid must track a selected set of clip ids instead of only one selected clip id.

Required behavior:

1. selection state is owned by the grid controller,
2. each selected card renders with the existing selected visual treatment,
3. the grid exposes the selected set to app-level orchestration,
4. a convenience accessor for "the single selected clip id, if exactly one clip is selected" may still exist for zoom and other single-item actions.

### 5.2 Pointer Interaction

Selection changes are driven by card click behavior.

Required behavior:

1. plain click on any clip collapses selection to only that clip,
2. `Ctrl+click` on Windows/Linux adds an unselected clip to the selection,
3. `Ctrl+click` on Windows/Linux removes a selected clip from the selection,
4. `Cmd+click` on macOS via `metaKey` behaves the same as `Ctrl+click`,
5. plain click on a clip while multiple clips are selected collapses the selection to only the clicked clip,
6. the feature does not add empty-grid click-to-clear behavior; existing no-op background behavior remains unchanged.

### 5.3 Keyboard Remove Behavior

Bulk remove is the first action powered by the selected set.

Required behavior:

1. pressing `Delete` or `Backspace` while one or more clips are selected removes all selected clips from the active collection,
2. removals happen in current grid order so behavior is deterministic and aligned with the visible collection order,
3. after removal completes, selection is cleared,
4. the collection dirty state updates exactly once for the bulk change,
5. the grid rerenders the remaining collection,
6. the status message is pluralized:
   - one removed clip: existing singular wording is acceptable,
   - multiple removed clips: the message must indicate multiple clips were removed.

Delete shortcuts remain ignored when focus is inside inputs, selects, or other editable fields.

### 5.4 Zoom and Fullscreen Interaction

Multi-selection exists for collection actions, not for viewer actions.

Required behavior:

1. double-click collapses selection to the clicked clip and opens zoom for that clip,
2. `Z` opens zoom only when exactly one clip is selected,
3. `Z` does nothing when zero clips are selected,
4. `Z` does nothing when more than one clip is selected,
5. fullscreen behavior remains unchanged.

### 5.5 Reorder Interaction

This feature does not introduce multi-item drag.

Required behavior:

1. drag-and-drop reorder continues to move only the dragged card,
2. selecting multiple clips does not cause a grouped drag operation,
3. reorder continues to emit the full post-drop ordered clip-id list,
4. selection remains valid after reorder for any clips still present in the collection.

### 5.6 Collection and Load Boundaries

Selection applies only to the currently rendered active collection.

Required behavior:

1. selection resets when the grid is rerendered for a different active collection or a new folder load,
2. selection is dropped for clips that are no longer present after rerender,
3. save and save-as-new continue to serialize the collection order, not the selection set.

## 6. UX and Copy Updates

The visible affordances should describe the new behavior clearly.

Required updates:

1. the inline usage hint should mention modifier-click multi-selection,
2. user-facing documentation should describe:
   - `Ctrl+click` or `Cmd+click` multi-selection,
   - plain click collapsing to one item,
   - `Delete` and `Backspace` removing all selected clips.

The selected-card visual treatment may remain the same for every selected card in this first version. The feature does not require a separate "primary selected item" visual.

## 7. Architecture Impact

Expected implementation direction:

1. `src/ui/clip-collection-grid-controller.js`
   - replace single selected clip state with selected-set state,
   - update card click handling and selection helpers,
   - expose selected-set accessors needed by the app layer.
2. `src/app/bootstrap.js`
   - update keyboard remove logic to consume the selected set,
   - keep single-item zoom behavior by checking whether the selection resolves to exactly one clip,
   - keep double-click behavior collapsed to one item before zoom.
3. tests under `tests/integration/ui/`
   - update grid-controller and event-driven coverage for multi-selection and bulk remove behavior.
4. user-facing copy in `index.html` and docs
   - reflect modifier-click and bulk delete semantics.

This feature does not require new domain models or persistence formats.

## 8. Testing Requirements

### 8.1 Grid Controller Tests

Add or update tests to cover:

1. plain click selects exactly one clip,
2. `Ctrl+click` adds an item to the selection,
3. `Ctrl+click` or `Cmd+click` on a selected clip removes it from the selection,
4. plain click after a multi-selection collapses back to one clip,
5. double-click collapses to one clip and emits the open request for that clip,
6. rerender drops invalid selections.

### 8.2 App-Level Tests

Add or update tests to cover:

1. `Delete` removes all selected clips,
2. bulk remove updates dirty state and rerenders correctly,
3. `Z` works only with exactly one selected clip,
4. `Z` is ignored when multiple clips are selected.

### 8.3 Regression Coverage

Existing behavior must remain covered for:

1. drag reorder,
2. save and save-as-new,
3. collection switching,
4. zoom open by double-click,
5. fullscreen entry and exit.

## 9. Acceptance Criteria

This feature is complete when:

1. users can build and shrink a multi-selection with `Ctrl+click` and `Cmd+click`,
2. plain click always collapses selection to exactly one clip,
3. `Delete` and `Backspace` remove all selected clips from the active collection,
4. double-click still opens zoom for one clip after collapsing selection,
5. `Z` opens zoom only when exactly one clip is selected,
6. drag-and-drop reorder still moves only the dragged card,
7. the UI hint and user documentation describe the new multi-selection behavior,
8. automated tests cover multi-selection and bulk remove behavior without regressing existing collection workflows.

## 10. Open Assumptions Captured in This Spec

These assumptions are intentionally locked unless changed during sign-off:

1. shift-range selection is out of scope,
2. clicking empty space does not clear selection,
3. there is no notion of a primary item inside a multi-selection,
4. selection is a transient view concern and is not saved with the collection,
5. future collection actions should operate on the full selected set in current grid order.
