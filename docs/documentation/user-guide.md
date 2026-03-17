# Clip Sandbox User Guide

## Introduction
Clip Sandbox is a local video review and collection tool. It lets you load a folder of clips, preview them in a responsive grid, rearrange the current collection, and save or reload that collection from a text file.
The app is designed for fast curation workflows: load clips, refine the visible collection, save subset collections, inspect individual clips in zoom mode, and run a fullscreen playback view with slot-based display control.

## Feature List
- **Load clips from a folder**: Open a folder and load supported video files into the grid.
- **Implicit full-folder collection**: Loading a folder creates a working collection that initially includes every supported clip in natural filename order.
- **Collection files**: Load a plain-text collection file to switch the current working collection to a full-folder or subset collection.
- **Video filtering**: Non-video files are ignored automatically.
- **Natural sorting on load**: Clips are sorted by filename (numeric-aware, case-insensitive).
- **Responsive grid layout**: Tile layout adjusts to viewport size and clip count.
- **Live clip labels**: Each tile shows `filename (hh:mm:ss)`; duration updates when metadata is available.
- **Drag-and-drop reorder**: Drag clips to change the current collection order.
- **Select + remove clip**: Click a tile to select it, then press `Delete` or `Backspace` to remove it from the current collection view.
- **Zoom mode**: Double-click a clip or press `Z` on the selected clip to inspect it larger in the center of the screen with audio.
- **Missing-entry conflict choices**: If a collection file names clips that are not in the selected folder, the app lists the missing entries and lets you continue with existing clips only or cancel.
- **Title overlay toggle**: Hide/show filename overlays for cleaner playback.
- **Collection menu**: A single **Collection** control opens a small menu with **Load Collection** and **Save Collection** actions.
- **Save collection file**: Save the current collection as `default-collection.txt` (directly to the selected folder when possible, otherwise as a download).
- **Status notifications**: Temporary status messages confirm load/save/actions and important updates.
- **Fullscreen mode**: Enter fullscreen playback view via button or `F`.
- **Fullscreen slot control**: While in fullscreen, type digits to set slot count (minimum `2`); the app keeps one display slot empty by design.
- **Fullscreen clip rotation**: Hidden clips rotate into visible slots over time during fullscreen playback.

## User Guide

### 1. Load Clips
1. Click **Browse Folder…**.
2. Choose a folder containing video clips.
3. The grid populates with supported formats (`mp4`, `m4v`, `mov`, `webm`, `ogv`, `avi`, `mkv`, `mpg`, `mpeg`).
4. The app creates an implicit full-folder collection from those clips.
5. Check the clip counter on the toolbar to confirm how many clips are in the current collection.

### 2. Reorder or Trim the Current Collection
1. Click and drag a clip tile to reorder it.
2. To remove a clip from the current collection, click it and press `Delete` or `Backspace`.
3. Repeat until the visible collection matches your intended subset and order.

Note: delete shortcuts are ignored while typing in form fields.

### 3. Zoom a Clip
1. Double-click any clip tile to open zoom mode, or select a clip and press `Z`.
2. The zoomed clip opens in a centered frame above the grid and starts from the beginning with audio.
3. The grid remains visible and keeps playing in the background.
4. Press `Escape` or click outside the zoom frame to close it.

### 4. Save the Current Collection
1. Open **Collection**.
2. Click **Save Collection**.
3. If folder write permissions are available, the app writes `default-collection.txt` into the selected folder.
4. If direct write is unavailable, your browser downloads `default-collection.txt` instead.
5. The saved file contains exactly the current working collection shown in the UI.

### 5. Load an Existing Collection File
1. Load the folder first.
2. Open **Collection**.
3. Click **Load Collection**.
4. Pick a `.txt` collection file (one filename per line).
5. If every entry exists in the selected folder, the app switches to that collection immediately.
6. If the file lists only some folder clips, the app shows only that subset.
7. If the file lists clips that are missing from the folder, the app shows an inline panel that lists the missing entries and lets you:
   - continue with the clips that do exist,
   - or cancel and keep the current collection unchanged.

### 6. Collection-First Loading
In this build, load the folder first and then load the collection file. If you try to load a collection before a folder is active, the app will guide you back to the folder-first flow.

### 7. Hide or Show Titles
1. Click **Hide Titles** to remove filename overlays.
2. Click **Show Titles** to restore them.

### 8. Use Fullscreen Mode
1. Click **Full Screen** (or press `F`) to enter fullscreen.
2. Titles are hidden automatically in fullscreen.
3. Press `F` again (or click **Exit Full Screen**) to leave fullscreen.
4. If zoom mode is open, the app closes zoom first and then enters fullscreen.
5. Your previous title-visibility preference is restored on exit.

### 9. Change Fullscreen Slot Count
1. While in fullscreen, type digits (for example `6` or `12`).
2. After a short delay, the slot count updates.
3. The app shows how many clips are actively displayed (one slot remains empty intentionally).

## Tips
- Keep filenames unique for the most predictable collection-file workflows.
- Use **Collection -> Save Collection** after major drag-and-drop or delete changes.
- If a collection file lists missing clips, use the inline panel to review exactly which entries were skipped.
- Keyboard access: focus **Collection**, press `Enter`/`Space` to open, use arrow keys to move between **Load Collection** and **Save Collection**, and `Escape` to close.
- Zoom shortcuts: `Z` opens zoom for the selected clip, `Escape` closes zoom, and `F` from zoom closes zoom first and then enters fullscreen.
