# Feature Spec: Collection Enumeration

## 1. Summary

Add folder-level collection enumeration as part of collection management.

When the user selects a folder via **Browse Folder**, the app must:
- discover top-level supported video files from that folder non-recursively,
- enumerate top-level `.txt` collection files from that same folder non-recursively,
- build an in-memory inventory of available `ClipCollectionDescription` entries for the active folder,
- present the current collection name in the center of the toolbar as a dropdown,
- let the user switch between the default collection and any enumerated collection file,
- prompt to save, discard, or cancel when switching away from unsaved changes.

## 2. Goals

1. Make collection selection a first-class folder-scoped workflow instead of a one-file-at-a-time load action.
2. Treat each legal top-level `.txt` file as one `ClipCollectionDescription`.
3. Make the default collection a stable named collection at the top of the dropdown.
4. Persist saves back to the currently selected collection file.
5. Enforce non-recursive behavior for both clip loading and collection-file enumeration.
6. Clean up current overlap between clip loading and collection loading responsibilities.
7. Write human-readable validation and runtime errors to `err.log` in the selected folder.

## 3. Non-Goals

1. No recursive folder scan for clips or collection files.
2. No support for collection files outside the selected folder.
3. No new serialized format beyond plain-text one-filename-per-line `.txt` files.
4. No persistence of collection inventory across browser reloads.
5. No third-party dropdown or modal library.

## 4. Core Concepts

### 4.1 ClipCollectionDescription

A `ClipCollectionDescription` class represents the serialized description of one collection file.

Properties:
- collection name derived from filename without `.txt`,
- backing filename,
- ordered clip filenames,
- source classification (`default` or `explicit-file`).

### 4.2 Default Collection

Each selected folder always exposes one default collection entry named:

`[folder-name]-default`

Behavior:
- the dropdown always shows it as the first option,
- its backing file is `[folder-name]-default.txt`,
- if that file already exists, it is the source of truth and is loaded automatically on folder selection,
- if that file does not exist, the default collection is initially an implicit full-folder collection in natural clip order,
- the first save while that default entry is active creates `[folder-name]-default.txt`.

### 4.3 Collection Inventory

The app keeps an in-memory inventory of the active folder's collection descriptions for the lifetime of the loaded-folder session.

Behavior:
- inventory is rebuilt when a new folder is selected,
- inventory is replaced, not merged, on folder change,
- inventory is not persisted across app reloads.

### 4.4 Legal Collection File

A legal collection file is:
- a top-level `.txt` file in the selected folder,
- plain text,
- with one filename per non-blank line,
- containing at least one non-blank line,
- containing no duplicate filenames.

Invalid `.txt` files are silently excluded from the dropdown inventory.

### 4.5 Error Log

For this feature, collection-validation and related runtime errors should be appended to a human-readable `err.log` file in the currently selected folder.

Behavior:
- log entries should be plain text intended for debugging by a human,
- invalid `.txt` collection files should still be silently excluded from the dropdown,
- the reason they were excluded should be written to `err.log`,
- this log file may later move to a dedicated app-managed location or in-app viewer, but that is out of scope for this feature.

## 5. UX Specification

### 5.1 Collection Dropdown

The current center toolbar title becomes a native styled `<select>` control.

Behavior:
- visually preserves the current blue active-collection emphasis,
- first option is always `[folder-name]-default`,
- remaining options are valid explicit collection files sorted alphabetically by collection name,
- if `[folder-name]-default.txt` exists, it is represented only by the top default option and is not duplicated in the alphabetical section,
- selecting a new option switches the displayed collection.

### 5.2 Unsaved-Changes Dialog

Use a native HTML `<dialog>` for unsaved-change confirmation.

Trigger when:
- switching collections from the dropdown,
- browsing to a different folder,
- otherwise leaving the active collection context in a way that would discard unsaved edits.

Dialog actions:
- `Save`
- `Don't Save`
- `Cancel`

Behavior:
- `Save`: save the active collection to its backing file, then continue the pending action,
- `Don't Save`: continue the pending action without saving,
- `Cancel`: abort the pending action and keep the current collection active.

### 5.3 Folder Selection

When the user selects a folder:
1. enumerate top-level files only,
2. discover supported video files from the top level only,
3. enumerate legal top-level `.txt` collection files,
4. build collection inventory in memory,
5. resolve the initial active collection:
   - if `[folder-name]-default.txt` exists and is legal, load it,
   - otherwise create the implicit default full-folder collection,
6. materialize the active collection from the selected collection description and the discovered top-level video inventory,
7. load only the video clips contained in the collection being displayed,
8. render the active collection,
9. update the dropdown options and selected value.

### 5.4 Switching Collections

When the user selects a collection from the dropdown:
1. if the active collection is clean, switch immediately,
2. if the active collection is dirty, show the unsaved-changes dialog,
3. after `Save` or `Don't Save`, replace the current collection with the selected one,
4. after `Cancel`, keep the current collection and restore the dropdown selection to the still-active collection.

## 6. Save Behavior

### 6.1 Save Target

Save always writes to the currently selected collection entry's backing file.

Examples:
- selected default entry -> `[folder-name]-default.txt`
- selected explicit entry `subset-a` -> `subset-a.txt`

### 6.2 Save Result

Saving serializes the current `ClipCollection` into a `ClipCollectionDescription` and writes one filename per line.

After save:
- dirty state is cleared,
- in-memory inventory is updated to reflect the saved description,
- if the saved file was newly created, it becomes part of the active folder inventory,
- the currently selected dropdown item remains selected.

## 7. Dirty State Rules

The active collection becomes dirty when its ordered contents differ from the last loaded or saved description.

Dirty-triggering actions include:
- drag reorder,
- clip removal from the current collection,
- any future collection-editing operations that change membership or order.

Dirty state clears when:
- the collection is saved successfully,
- a collection is freshly loaded from inventory,
- a new folder is loaded after the user confirms the pending folder-change action.

## 8. Non-Recursive Rules

### 8.1 Clips

Only top-level supported video files in the selected folder are considered for collection materialization and validation.

Subfolder video files are ignored.

### 8.2 Collection Files

Only top-level `.txt` files in the selected folder are considered for collection enumeration.

Subfolder `.txt` files are ignored.

## 9. Domain and Architecture Direction

### 9.1 Domain Responsibilities

`ClipCollection` remains the runtime model for the active collection.

Add conversion responsibilities:
- create a `ClipCollection` from a `ClipCollectionDescription`,
- generate a `ClipCollectionDescription` from a `ClipCollection`.

File I/O does not belong inside `ClipCollection`.

### 9.2 Business-Logic Responsibilities

Refactor current loading responsibilities into clearer flows:
- top-level folder inventory loading,
- collection-description parsing and validation,
- collection materialization from description plus folder clips,
- collection-description persistence.

Expected cleanup direction:
- reduce overlap between [load-clips.js](C:/dev/clip-sandbox/src/business-logic/load-clips.js) and [load-collection.js](C:/dev/clip-sandbox/src/business-logic/load-collection.js),
- centralize collection-description validation rules in a `CollectionDescriptionValidator` class,
- introduce a `ClipCollectionInventory` class responsible for available collection descriptions, active collection selection, dirty state, pending actions, and the discovered top-level video-file lookup used to materialize collections.

### 9.3 App State

App state should explicitly track:
- loaded folder name,
- the active `ClipCollection`,
- one `ClipCollectionInventory` instance.

## 10. Validation Rules

### 10.1 Enumeration Inclusion

A `.txt` file is included in the dropdown only if it is a legal collection file.

### 10.2 Matching

Collection entry matching remains exact by filename string against loaded top-level folder clips only.

### 10.3 Missing Clip Entries

Existing missing-entry behavior remains:
- if a collection description references clips not present in the discovered top-level folder video inventory, the existing collection conflict flow applies.

This feature does not remove that behavior; it changes how collection descriptions are discovered and selected.

## 11. Testing Requirements

### 11.1 Unit

1. Enumerates only top-level video files.
2. Enumerates only top-level legal `.txt` collection files.
3. Excludes invalid `.txt` files silently.
4. Excludes duplicate default entry from alphabetical explicit entries.
5. Loads `[folder-name]-default.txt` automatically when present.
6. Falls back to implicit full-folder default collection when default file is absent.
7. Detects dirty state after reorder/remove.
8. Clears dirty state after save.
9. Converts between `ClipCollection` and `ClipCollectionDescription`.
10. Writes invalid collection-file diagnostics to `err.log` in the selected folder.

### 11.2 Integration

1. Dropdown renders default-first and explicit collections alphabetically.
2. Switching a clean collection updates the grid and selected dropdown value.
3. Switching a dirty collection opens the `<dialog>`.
4. `Save` in the dialog saves then switches.
5. `Don't Save` switches without saving.
6. `Cancel` preserves the current collection and restores the dropdown selection.
7. Browsing a new folder while dirty uses the same dialog flow.

### 11.3 End-to-End

1. Load a folder with no default file and verify implicit `[folder-name]-default` is active.
2. Load a folder with `[folder-name]-default.txt` and verify it auto-loads as source of truth.
3. Verify explicit collection files appear alphabetically below the default item.
4. Verify invalid top-level `.txt` files do not appear.
5. Verify subfolder videos and subfolder `.txt` files are ignored.
6. Verify switching collection updates rendered clips.
7. Verify dirty switch prompt save/discard/cancel behavior.
8. Verify dirty folder-change prompt save/discard/cancel behavior.
9. Verify first save of default collection creates `[folder-name]-default.txt`.
10. Verify saving an explicit collection overwrites its own backing file.

## 12. Acceptance Criteria

1. Folder load enumerates top-level clips and top-level legal `.txt` collection files only.
2. The center toolbar collection name is a dropdown.
3. The dropdown always shows `[folder-name]-default` first.
4. Valid explicit collection names appear below the default in alphabetical order.
5. `[folder-name]-default.txt`, when present, is auto-loaded as the default collection source of truth.
6. Invalid `.txt` files are silently excluded from the dropdown.
7. Switching away from unsaved changes prompts with `Save`, `Don't Save`, and `Cancel`.
8. Save overwrites the currently selected collection file.
9. Saving the default collection creates `[folder-name]-default.txt` if needed.
10. Clip loading and collection enumeration are both non-recursive.
