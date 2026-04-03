# Clip Sandbox User Guide

## Introduction

Clip Sandbox is a local video review and collection tool. It loads one folder at a time, shows the active collection in a responsive grid, lets you reorder or trim that collection, and saves collection files as plain text with one filename per line.

Collection management is folder-scoped:
- the selected folder is scanned non-recursively,
- top-level supported video files become the available clip inventory,
- top-level legal `.txt` files become selectable collections,
- the current collection is chosen from the blue dropdown in the center of the toolbar.

## Feature List

- **Folder-scoped collection inventory**: selecting a folder enumerates its top-level collection files automatically.
- **Default collection**: each folder always has a default collection named `[folder-name]-default`.
- **Default-file source of truth**: if `[folder-name]-default.txt` already exists, the app loads it automatically.
- **Collection dropdown**: switch collections from the centered toolbar dropdown.
- **Unsaved-change prompt**: switching collections or folders after edits opens a `Save` / `Don't Save` / `Cancel` dialog.
- **Non-recursive loading**: subfolder videos and subfolder `.txt` files are ignored.
- **Missing-entry conflict choices**: if a selected collection references clips missing from the folder, the app lets you continue with existing clips only or cancel.
- **Save current collection**: save overwrites the currently selected collection file.
- **Save as New**: save the current collection to a new `.txt` file and make it the active collection for the session.
- **Add selected clips to another collection**: right-click the grid for direct destination choices, or use **Collection** -> **Add Selected to Collection...** as the dialog fallback.
- **Error log**: invalid collection-file diagnostics are written to `err.log` in the selected folder when direct folder write access is available.
- **Zoom mode**: double-click a clip or press `Z`.
- **Fullscreen mode**: click **Full Screen** or press `F`.

## User Guide

### 1. Load a Folder

1. Click **Browse Folder…**.
2. Choose a folder containing video clips.
3. The app scans only the top level of that folder.
4. The center dropdown updates with:
   - `[folder-name]-default` first,
   - other valid top-level `.txt` collection files below it in alphabetical order.
5. If `[folder-name]-default.txt` exists, the app loads it immediately.
6. Otherwise, the default collection contains all top-level supported videos in natural filename order.

Supported video formats:
- `mp4`
- `m4v`
- `mov`
- `webm`
- `ogv`
- `avi`
- `mkv`
- `mpg`
- `mpeg`

### 2. Switch Collections

1. Use the blue collection dropdown in the toolbar.
2. Choose another collection name.
3. If the current collection is clean, the app switches immediately.
4. If the current collection has unsaved changes, the app opens a dialog:
   - `Save`: save the current collection, then switch,
   - `Don't Save`: switch without saving,
   - `Cancel`: stay on the current collection.

### 3. Reorder, Trim, or Copy Selected Clips

1. Drag a clip tile to change its order.
2. Click a clip to select only that clip.
3. `Ctrl+click` on Windows/Linux or `Cmd+click` on macOS adds or removes a clip from the current selection.
4. Press `Delete` or `Backspace` to remove all selected clips from the current collection.
5. Right-click anywhere in the grid to choose an existing destination directly, or open **Collection** and choose **Add Selected to Collection...** for the dialog flow.
6. The right-click menu lists same-folder destination collections directly and also includes `New collection...`.
7. In the dialog flow, choose another same-folder collection or `New collection...`.
8. Existing destination entries are kept, selected clips already present are skipped, and new clips append at the end in the current selected order.
9. The app stays on the current source collection after the add completes.

Note: delete shortcuts are ignored while typing in inputs or selects.

### 4. Save the Current Collection

1. Open **Collection**.
2. Click **Save**.
3. The app overwrites the currently selected collection file:
   - default collection -> `[folder-name]-default.txt`
   - explicit collection -> its own `.txt` file
4. If folder write access is available, the file is written into the selected folder.
5. If direct folder write is unavailable, the browser downloads the file instead.

### 5. Save as New

1. Open **Collection**.
2. Click **Save as New**.
3. Enter a new collection name.
4. The app adds `.txt` automatically.
5. The new file becomes the active collection for the current session after save.

### 6. Handle Missing Collection Entries

If a selected collection lists filenames that are not present in the selected folder, the app shows an inline conflict panel.

Choices:
- `Display Existing Clips Only`
- `Cancel`

`Display Existing Clips Only` keeps only the listed clips that still exist and preserves their order.

### 7. Zoom a Clip

1. Double-click a clip, or select it and press `Z`.
2. The clip opens in zoom mode with audio controls available through the keyboard.
3. Press `Escape` or click outside the zoom frame to close it.

### 8. Hide or Show Titles

1. Click **Hide Titles** to remove filename overlays.
2. Click **Show Titles** to restore them.

### 9. Use Fullscreen Mode

1. Click **Full Screen** or press `F`.
2. Titles are hidden automatically while fullscreen is active.
3. Press `F` again to exit fullscreen.
4. If zoom mode is open, the app closes zoom first.

### 10. Change Fullscreen Slot Count

1. While in fullscreen, type digits such as `6` or `12`.
2. After a short delay, the slot count updates.
3. One slot remains intentionally empty by design.

## Notes

- Invalid top-level `.txt` files are excluded from the collection dropdown.
- When the app has direct write access to the selected folder, invalid collection diagnostics are appended to `err.log`.
- In browser fallback mode without folder write access, the app still excludes invalid files, but `err.log` cannot be written into the folder.
- Subfolders are ignored for both videos and collection files.

## Tips

- Keep filenames unique within a folder for predictable collection matching.
- Use **Save** after drag-and-drop or delete changes you want to keep.
- Use **Save as New** when you want to preserve the current collection under a different name.
- Use right-click to add the current selection straight into an existing collection without the extra dialog step.
- If a collection appears to be missing from the dropdown, check whether the file is top-level, has a `.txt` extension, and contains one non-blank filename per line without duplicates.
- Keyboard access: focus **Collection**, press `Enter` or `Space` to open the action menu, use arrow keys to move between actions, and press `Escape` to close it.
- Zoom shortcuts: `Z` opens zoom for the selected clip, `Escape` closes zoom, and `F` from zoom closes zoom first and then enters fullscreen.
