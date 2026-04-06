# Feature Spec: Delete Clips from Disk

## 1. Summary

Add a destructive delete action that removes the currently selected clips not only from the active collection view, but also from disk.

The action must:

1. be explicit and separate from the existing `Delete` / `Backspace` collection-trim behavior,
2. be available only when the active folder session is writable,
3. delete the selected clip files from the currently loaded folder,
4. remove successfully deleted clip filenames from all affected saved collections in the same folder,
5. update the active in-memory collection immediately to match the deletion results,
6. provide clear confirmation and partial-success feedback.

## 2. Problem

The app already supports removing selected clips from the active collection without touching the underlying video files.

What it cannot do is remove clips from the selected folder itself. That forces a separate file-manager workflow for users who are actively curating the folder contents and want the app to remain the primary review surface.

Because collections are filename-based and folder-scoped, deleting a clip file from disk also has collection consequences:

1. saved collection files in the same folder may still reference the deleted filenames,
2. those stale references would later produce missing-entry conflicts,
3. the active collection view must stay consistent with the actual disk state.

## 3. Goals and Non-Goals

### 3.1 Goals

1. Let users explicitly delete the current selected clip files from disk.
2. Keep the existing keyboard delete behavior as collection-only trim.
3. Make disk deletion available from both right-click and the top `Collection` menu.
4. Restrict the feature to writable folder sessions only.
5. Remove successfully deleted clip filenames from all affected saved collections in the current folder.
6. Keep the active grid, in-memory inventory, and saved collection files consistent with successful deletion results.
7. Handle mixed outcomes with best-effort partial success.

### 3.2 Non-Goals

1. No recycle-bin or trash integration.
2. No undo or restore flow.
3. No recursive deletion.
4. No deletion of arbitrary non-selected files.
5. No disk deletion in read-only folder sessions.
6. No automatic creation of a default collection backing file solely because deletion occurred.
7. No change to the meaning of `Delete` / `Backspace`.

## 4. User Stories

1. As a user, I can permanently delete the currently selected clips from the loaded folder without leaving the app.
2. As a user, I get an explicit confirmation that this is destructive and also prunes saved collections in the folder.
3. As a user, I can still use `Delete` / `Backspace` to trim the current collection only.
4. As a user, I see accurate feedback if some files were deleted and others failed.
5. As a developer, I can implement disk deletion without collapsing the browser filesystem boundary back into the UI layer.

## 5. Functional Requirements

### 5.1 Availability

Disk deletion is available only for writable folder sessions.

Required behavior:

1. the feature is enabled only when the current folder session supports disk mutation,
2. the top `Collection` menu shows `Delete Selected from Disk...`,
3. the top-menu action is disabled when:
   - no clips are selected, or
   - the current folder session is read-only,
4. the right-click menu includes `Delete from Disk...` only when:
   - one or more clips are selected, and
   - the current folder session is writable,
5. in read-only sessions, the right-click menu omits the disk-delete action entirely,
6. the existing collection-only delete shortcut remains available regardless of folder-session access mode.

### 5.2 Source Selection Rules

The feature operates on the grid controller's current ordered selected clip id list.

Required behavior:

1. the selected set is resolved in visible grid order,
2. the action does not change the existing selection when opened,
3. right-clicking empty grid space still applies to the current selection,
4. the selected set remains the source of truth for the delete request even when launched from the top menu.

### 5.3 Dirty-State Preflight

Disk deletion may affect persisted collection files across the current folder, so pre-existing unsaved edits on the active collection must be handled explicitly before the delete operation runs.

Required behavior:

1. if the active collection is clean, the app proceeds directly to the delete confirmation dialog,
2. if the active collection is dirty, the app first opens a pre-delete dialog with:
   - `Save and Continue`
   - `Continue Without Saving`
   - `Cancel`
3. `Save and Continue` saves the current active collection using the existing save path, then continues to delete confirmation,
4. `Continue Without Saving` continues to delete confirmation without persisting unrelated active-collection edits first,
5. `Cancel` aborts the delete flow with no side effects,
6. if `Save and Continue` enters the existing `Save as New` naming flow for an unnamed default collection, the delete flow remains pending until that save path completes or is canceled.

### 5.4 Confirmation

Disk deletion is destructive and requires explicit confirmation.

Required behavior:

1. after any dirty-state preflight completes, the app shows a delete confirmation dialog,
2. the confirmation states:
   - how many selected clips will be deleted from disk,
   - that the action also removes them from saved collections in the same folder,
   - how many saved collections are affected,
3. acceptable confirmation copy shape:
   - `Delete 3 clips from disk? This also removes them from 2 saved collections in this folder.`
4. the dialog shows up to five filenames from the selected set,
5. if more than five clips are selected, the dialog also shows `...and N more`,
6. the dialog exposes `Delete` and `Cancel`,
7. `Cancel` closes the dialog with no side effects.

Clarification:

1. the affected saved-collection count is based on currently known saved collections in the in-memory folder inventory whose backing content contains at least one selected filename,
2. the implicit default collection with no backing file is not counted as a saved collection,
3. a default collection file that already exists is counted when it will be rewritten.

### 5.5 Delete Semantics

The delete action permanently removes the selected clip files from the loaded folder on a best-effort basis.

Required behavior:

1. deletion targets only the selected clip files in the currently loaded folder,
2. each selected clip is attempted independently,
3. the operation is best-effort:
   - one failed file delete must not prevent attempts for the remaining selected files,
4. successful file deletion is the trigger for all subsequent cleanup work,
5. clip files that fail to delete remain on disk and remain part of the active collection and other saved collections,
6. clip files that delete successfully are treated as removed from the folder immediately.

### 5.6 Collection Cleanup Semantics

Successfully deleted filenames must be pruned from saved collection files in the same folder.

Required behavior:

1. after the disk-delete attempts complete, the app computes the subset of clip filenames that were deleted successfully,
2. only those successfully deleted filenames are removed from saved collections,
3. every affected saved collection in the current folder is rewritten immediately with those filenames removed,
4. the in-memory collection inventory is updated to match the rewritten saved collection contents,
5. the active in-memory collection is updated to remove successfully deleted clips regardless of whether it is backed by a file,
6. if the active collection is also a saved collection, its backing file rewrite follows the same rule as other affected saved collections,
7. the implicit default collection must not cause creation of a new `[folder-name]-default.txt` file solely because deletion occurred,
8. if no selected files were deleted successfully, no collection files are rewritten.

### 5.7 Failure and Partial-Success Behavior

The feature must report mixed outcomes clearly.

Required behavior:

1. if at least one file delete succeeds, the active grid updates to remove only those successfully deleted clips,
2. if some file deletes fail, the failed clips remain visible and selected-state handling is refreshed consistently with the rerendered collection,
3. if collection-file cleanup fails after some disk deletions already succeeded, the app reports the cleanup failure clearly,
4. the app must never claim full success when any file deletions or any collection rewrites fail,
5. success and partial-success status text must include:
   - deleted clip count,
   - failed delete count when non-zero,
   - affected saved-collection count when non-zero,
6. acceptable feedback copy shape:
   - `Deleted 3 clips from disk and removed them from 2 saved collections.`
   - `Deleted 3 clips from disk. Failed to delete 1. Removed deleted clips from 2 saved collections.`
   - `Failed to delete the selected clips from disk.`

### 5.8 Error Logging

Operational failures should continue to be human-debuggable.

Required behavior:

1. runtime deletion and collection-cleanup failures should be appended to `err.log` when the active folder session can write there,
2. when `err.log` cannot be written, the app should still log meaningful diagnostics to the console,
3. error logging should continue to use the existing filesystem service boundary rather than direct browser API calls from the app layer.

## 6. UX Specification

### 6.1 Right-Click Menu

The grid context menu should expose the destructive action only when it is actionable.

Required behavior:

1. in writable sessions with a non-empty selection, the right-click menu includes `Delete from Disk...`,
2. the right-click menu continues to preserve the current selection on open,
3. selecting `Delete from Disk...` enters the dirty-state preflight or confirmation flow,
4. in read-only sessions or with no selection, the right-click menu does not show the disk-delete action.

### 6.2 Top `Collection` Menu Fallback

The top menu must remain the keyboard-accessible fallback.

Required behavior:

1. add `Delete Selected from Disk...` to the existing `Collection` menu,
2. the action is disabled when the current selection is empty,
3. the action is disabled when the current folder session is read-only,
4. keyboard users can reach the same delete flow from the top menu.

### 6.3 Confirmation Dialogs

The feature uses small explicit dialogs.

Required behavior:

1. the dirty-state preflight and destructive confirmation may be separate dialogs or a single staged dialog flow,
2. whichever implementation is chosen, the user must first resolve dirty-state intent, then explicitly confirm the destructive delete,
3. the destructive confirmation must keep the wording short and clear.

## 7. Boundaries and Architecture

### 7.1 UI Layer Responsibilities

Expected responsibilities:

1. enable or disable menu actions based on selection presence and writable-session availability,
2. render the dirty-state preflight dialog,
3. render the destructive confirmation dialog,
4. display confirmation details such as clip count, filename preview, and affected saved-collection count,
5. forward the delete request upward using selected clip ids in order.

### 7.2 Application Layer Responsibilities

Expected responsibilities:

1. coordinate the dirty-state preflight with the existing save flow,
2. resolve selected clip ids to clip filenames,
3. coordinate disk-delete attempts through an application-facing filesystem service,
4. coordinate saved-collection cleanup and inventory updates,
5. rerender the active collection and refresh status/selection state,
6. log operational failures.

### 7.3 Filesystem Boundary Responsibilities

The browser filesystem service remains the only app-facing boundary for disk mutation.

Expected responsibilities:

1. report whether the current folder session can mutate disk,
2. expose clip-file deletion for writable folder sessions,
3. expose `err.log` append behavior,
4. keep browser-specific handle details out of the UI and collection orchestration layers.

### 7.4 Domain and Business-Logic Responsibilities

Expected responsibilities:

1. provide reusable collection-pruning logic based on clip filename equality,
2. preserve filename-based collection semantics already used elsewhere in the app,
3. avoid pushing browser-specific disk APIs into domain classes.

## 8. Testing Requirements

### 8.1 Unit and Integration Coverage

Add or update tests for:

1. writable-session capability checks,
2. delete-request orchestration with full success,
3. delete-request orchestration with partial success,
4. collection cleanup for successfully deleted filenames only,
5. no implicit creation of the default collection backing file during cleanup,
6. top-menu disabled state in read-only sessions,
7. right-click action visibility only in writable sessions,
8. dirty-state preflight behavior.

### 8.2 End-to-End Coverage

Add or update Playwright coverage for:

1. full-success delete from disk in a writable directory-picker session,
2. partial-success delete from disk with clear status feedback,
3. removal from affected saved collections after successful deletion,
4. absence of the right-click disk-delete action in read-only fallback sessions,
5. disabled top-menu disk-delete action in read-only fallback sessions,
6. dirty active collection preflight before delete.

## 9. Open Questions

None. This spec locks the feature behavior for the current browser-first architecture.
