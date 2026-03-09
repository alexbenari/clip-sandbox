# Clip Sandbox User Guide

## Introduction
Clip Sandbox is a local video review and ordering tool. It lets you load a folder of clips, preview them in a responsive grid, 
rearrange the playback order, and save or reload that order from a text file.
The app is designed for fast curation workflows: load clips, reorder visually, validate order files, and run a fullscreen playback view 
with slot-based display control.

## Feature List
- **Load clips from a folder**: Open a folder and load supported video files into the grid.
- **Video filtering**: Non-video files are ignored automatically.
- **Natural sorting on load**: Clips are sorted by filename (numeric-aware, case-insensitive).
- **Responsive grid layout**: Tile layout adjusts to viewport size and clip count.
- **Live clip labels**: Each tile shows `filename (hh:mm:ss)`; duration updates when metadata is available.
- **Drag-and-drop reorder**: Drag clips to change the current order.
- **Select + remove clip**: Click a tile to select it, then press `Delete` or `Backspace` to remove it from the current view.
- **Title overlay toggle**: Hide/show filename overlays for cleaner playback.
- **Order menu**: A single **Order** control opens a small menu with **Load** and **Save** actions.
- **Save order file**: Save current order as `clip-order.txt` (directly to selected folder when possible, otherwise as a download).
- **Load order file**: Apply an order from a `.txt` file with strict validation (duplicates/missing/unknown/count mismatch checks).
- **Status notifications**: Temporary status messages confirm load/save/actions and important updates.
- **Fullscreen mode**: Enter fullscreen playback view via button or `F`.
- **Fullscreen slot control**: While in fullscreen, type digits to set slot count (minimum `2`); the app keeps one display slot empty by design.
- **Fullscreen clip rotation**: Hidden clips rotate into visible slots over time during fullscreen playback.

## User Guide

### 1. Load Clips
1. Click **Browse Folder…**.
2. Choose a folder containing video clips.
3. The grid populates with supported formats (`mp4`, `m4v`, `mov`, `webm`, `ogv`, `avi`, `mkv`, `mpg`, `mpeg`).
4. Check the clip counter on the toolbar to confirm total loaded clips.

### 2. Reorder Clips
1. Click and drag a clip tile.
2. Drop it above or below another tile to reposition it.
3. Repeat until the visual order matches your desired sequence.

### 3. Save Current Order
1. Open **Order**.
2. Click **Order** (or tap on touch devices).
3. Click **Save**.
4. If folder write permissions are available, the app writes `clip-order.txt` into the selected folder.
5. If direct write is unavailable, your browser downloads `clip-order.txt` instead.

### 4. Load an Existing Order File
1. Open **Order** (click on desktop, tap on touch devices).
2. Click **Load**.
3. Pick a `.txt` order file (one filename per line).
4. If validation passes, the new order is applied.
5. If validation fails, you will see an alert explaining the issues (for example: duplicate entries, missing clips, unknown clips, or count mismatch).

### 5. Remove a Clip from the Current View
1. Click a clip to select it (selected tile is highlighted).
2. Press `Delete` or `Backspace`.
3. The clip is removed from the current grid view.

Note: delete shortcuts are ignored while typing in form fields.

### 6. Hide or Show Titles
1. Click **Hide Titles** to remove filename overlays.
2. Click **Show Titles** to restore them.

### 7. Use Fullscreen Mode
1. Click **Full Screen** (or press `F`) to enter fullscreen.
2. Titles are hidden automatically in fullscreen.
3. Press `F` again (or click **Exit Full Screen**) to leave fullscreen.
4. Your previous title-visibility preference is restored on exit.

### 8. Change Fullscreen Slot Count
1. While in fullscreen, type digits (for example `6` or `12`).
2. After a short delay, the slot count updates.
3. The app shows how many clips are actively displayed (one slot remains empty intentionally).

## Tips
- Keep filenames unique for the most predictable order-file workflows.
- Use **Order -> Save** after major drag-and-drop changes.
- If an order file does not apply, review the validation message and align filenames with currently loaded clips.
- Keyboard access: focus **Order**, press `Enter`/`Space` to open, use arrow keys to move between **Load**/**Save**, and `Escape` to close.
