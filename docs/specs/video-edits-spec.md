# Feature Spec: Video Edits

## 1. Summary

Add a zoom-mode video edit feature that lets the user generate a new video from the currently zoomed clip by choosing from a predefined set of manipulations in a right-click menu.

V1 includes one manipulation:

1. menu label: `Loopify`
2. filename suffix: `looped`
3. behavior: create a boomerang loop by concatenating the source clip with its reversed playback

The generated video is written into the active pipeline folder, becomes part of the pipeline, and may also be reflected into the current collection view as an unsaved collection change.

The feature should be implemented behind a dedicated video-editing adapter so the app is not tightly coupled to `ffmpeg`, even though `ffmpeg` is the V1 editing engine.

## 2. Problem

The app currently supports browsing, zooming, collection management, and deletion, but it cannot generate derived clips from an existing source video.

Users reviewing clips in zoom mode need a direct way to produce common transformed variants without leaving the app or manually running external tools.

## 3. Goals and Non-Goals

### 3.1 Goals

1. Allow video edits to be triggered directly from zoom mode.
2. Support a predefined catalog of manipulations rather than arbitrary freeform editing.
3. Save generated files into the active pipeline folder with deterministic naming.
4. Reflect generated clips back into the current app session immediately.
5. Keep video-generation infrastructure behind a replaceable adapter boundary.
6. Introduce a compact reusable status surface for edit progress and future app status messages.

### 3.2 Non-Goals

1. V1 does not support multi-clip or grid-level editing.
2. V1 does not support arbitrary user-configured edit parameters.
3. V1 does not auto-save collection membership changes caused by an edit.
4. V1 does not implement a full packaging/distribution pipeline for `ffmpeg`.
5. V1 does not introduce a generic plugin system for editing engines.

## 4. User Experience

### 4.1 Entry Point

The feature is available only in zoom mode in V1.

When a clip is open in the zoom overlay, right-clicking the zoomed video opens a context menu that includes video manipulations in the form:

1. `[chisel icon] [action-name]`

For V1, the menu contains:

1. `[chisel icon] Loopify`

### 4.2 Editing Flow

When the user selects `Loopify`:

1. the app starts generating a derived clip from the currently zoomed source clip,
2. the app shows in-progress status through the new activity indicator,
3. on success, the app refreshes the pipeline session to include the new file,
4. the app selects the new clip,
5. the zoom overlay switches to the new clip,
6. if the user is viewing a saved collection, the new clip is inserted into the current runtime collection immediately after the source clip,
7. collection persistence remains unchanged until the user explicitly saves.

### 4.3 Pipeline View vs Collection View

If the user is in pipeline view:

1. the new file is created on disk,
2. the pipeline view refreshes and includes the new clip,
3. no collection file is changed.

If the user is viewing a saved collection:

1. the new file is created on disk,
2. the new clip is added to the active runtime collection immediately after the source clip,
3. the collection becomes or remains dirty,
4. the collection backing `.txt` file is not written automatically.

This means video-file creation and collection persistence are intentionally separate concerns.

## 5. Loopify Behavior

`Loopify` creates a boomerang loop:

1. start with the source clip in normal forward playback,
2. append the same clip in reverse playback,
3. produce a single seamless output video.

The implementation may choose exact `ffmpeg` filters and encoding details, but the output behavior must match this product definition.

## 6. Naming and File Placement

### 6.1 Output Format

All generated edit outputs in V1 are written as `.mp4`, regardless of the source file extension.

Example:

1. source: `alpha.mov`
2. output: `alpha-looped.mp4`

### 6.2 Naming Rule

The default generated filename is:

1. `[original-base-name]-[manipulation-filename-suffix].mp4`

For `Loopify`, the suffix is `looped`.

Examples:

1. `alpha.mp4` -> `alpha-looped.mp4`
2. `alpha.mov` -> `alpha-looped.mp4`

### 6.3 Collision Rule

If the target filename already exists, append a serial suffix:

1. first candidate: `alpha-looped.mp4`
2. next candidate: `alpha-looped-2.mp4`
3. then `alpha-looped-3.mp4`
4. continue until an unused filename is found

### 6.4 Save Location

The generated file is written to the current pipeline folder on disk.

## 7. Status Surface

The existing transient footer status is not sufficient for long-running edit operations. Replace it with a compact toolbar activity indicator.

### 7.1 Placement

The new status surface lives at the top-right of the toolbar.

Layout direction:

1. clip count remains on the right side,
2. the activity indicator sits to the right of the clip count,
3. the indicator is the rightmost toolbar element.

### 7.2 Indicator Behavior

The indicator is a clickable dot button with these states:

1. idle: muted gray
2. in progress: pulsing green
3. success: solid green briefly, then return to idle
4. error: solid red until replaced by a later status

### 7.3 Status Panel

Clicking the indicator toggles a small anchored status panel.

The panel should:

1. display a short in-memory history of recent messages,
2. show the latest message first,
3. default to the last 5 messages in V1,
4. auto-open on error,
5. not auto-open on success,
6. collapse when the user clicks the indicator again.

If the user collapses the panel after an error, the indicator remains red until a later status replaces it.

### 7.4 Reuse

This activity indicator becomes the app’s general status surface for:

1. edit progress and outcomes,
2. existing load/save/delete informational messages,
3. future app status messages.

Fullscreen may continue to hide this surface in V1, consistent with the toolbar hiding behavior.

## 8. Failure Handling

### 8.1 Edit Generation Failure

If the video generation step fails:

1. no new clip is added to the current session,
2. the activity indicator enters an error state,
3. the error panel shows a clear failure message.

### 8.2 Partial Success in Collection View

If the file is created successfully on disk but the app cannot update the active collection view:

1. do not roll back the generated file,
2. keep the file in the pipeline folder,
3. refresh pipeline knowledge if possible,
4. show an error explaining that the file was created but the current collection view could not be updated,
5. instruct the user to reopen the collection.

Example message intent:

1. `Looped clip was created on disk, but the current collection view could not be updated. Reopen the collection.`

## 9. Architecture and Design

### 9.1 Editing Boundary

Introduce a dedicated video-editing adapter rather than placing edit execution directly in general Electron or domain code.

The intended split is:

1. domain/app layer: manipulation definitions, naming rules, orchestration, and collection-view semantics
2. video-editing adapter: execution of a requested manipulation against a source file and destination file
3. Electron/runtime boundary: file-path access and process execution needed by the adapter implementation

This keeps the app open to future engine changes.

### 9.2 Editing Engine

V1 uses `ffmpeg` as the editing engine.

The app should not scatter `ffmpeg` assumptions across the renderer. Instead, `ffmpeg` should be the first implementation behind the video-editing adapter.

### 9.3 Tool Layout

To support future packaging and distribution, add the bundled executable under a new repo/app tools folder:

1. `tools/ffmpeg/`

The implementation should resolve the tool from this location through a dedicated resolver path rather than hardcoding one-off binary lookups throughout the app.

### 9.4 Pipeline and Collection Semantics

The current architecture distinguishes:

1. durable pipeline files on disk,
2. durable saved collections backed by `.txt` files,
3. mutable runtime clip sequences in the active view.

This feature must preserve that split:

1. generating a new video is a durable disk mutation,
2. adding the new clip to the active collection view is a runtime sequence mutation,
3. saving the updated collection remains an explicit user action.

## 10. Functional Requirements

### 10.1 Zoom Context Menu

1. The zoom overlay must support right-click context-menu invocation on the zoomed clip.
2. The context menu component must support an icon-capable menu item presentation.
3. V1 must expose exactly one manipulation item: `Loopify`.

### 10.2 Edit Request Execution

1. The app must resolve the source clip from the currently zoomed clip.
2. The app must compute a destination filename using the naming rules in this spec.
3. The app must invoke the video-editing adapter with source path, destination path, and manipulation type.
4. Repeated edit actions should be disabled while an edit is already running.

### 10.3 Session Refresh

1. On successful output creation, the pipeline session must refresh to include the new clip.
2. The new clip must become selected.
3. The zoom overlay must switch to the new clip.
4. In collection view, the new clip must be inserted immediately after the source clip in the active runtime collection.

### 10.4 Collection Persistence

1. The app must not auto-save the active collection after an edit.
2. If the active collection view changes because of the new clip insertion, the view must become or remain dirty.
3. The existing save flow remains responsible for persisting that collection change later.

### 10.5 Pipeline Ordering

The pipeline currently materializes from filename-sorted disk entries rather than a separately persisted manual order.

Therefore, in pipeline view:

1. the new clip only needs to appear according to normal pipeline refresh ordering,
2. V1 does not need a special immediate-after-source pipeline ordering rule.

## 11. Acceptance Criteria

This feature is complete when:

1. right-clicking the zoomed clip opens a manipulation menu,
2. the menu shows a chisel-icon `Loopify` item,
3. selecting `Loopify` generates a boomerang-loop output video via the editing adapter,
4. the output filename follows the `looped` suffix and collision rules,
5. the output is written into the pipeline folder as `.mp4`,
6. the pipeline session refreshes and includes the new clip,
7. the new clip becomes selected and opened in zoom mode,
8. in collection view, the new clip is inserted immediately after the source clip in the runtime collection,
9. collection membership changes caused by the edit are not auto-saved,
10. the new top-right activity indicator shows progress, success, and error states,
11. the status panel auto-opens on error and keeps a short recent-message history,
12. partial-success cases keep the generated file and instruct the user to reopen the collection,
13. the implementation uses a dedicated video-editing adapter and a `tools/ffmpeg/` tool location.

## 12. Open Questions Resolved in This Spec

1. Editing engine:
   Resolved to `ffmpeg` for V1, hidden behind a dedicated video-editing adapter.
2. Output format:
   Resolved to `.mp4` for all generated edit outputs.
3. V1 manipulation:
   Resolved to a boomerang-style `Loopify` action.
4. Availability surface:
   Resolved to zoom-mode only in V1.
5. Collection semantics:
   Resolved that edit-generated collection changes update the runtime view but are not auto-saved.
6. Collection placement:
   Resolved that the new clip is inserted immediately after the source clip in collection view.
7. Pipeline ordering:
   Resolved to accept normal filename-based pipeline ordering in V1.
8. Status UI:
   Resolved to a compact top-right activity indicator with a collapsible message panel.
9. Partial success:
   Resolved to report the real state without rollback and instruct the user to reopen the collection.
10. Tool layout:
    Resolved to `tools/ffmpeg/` for future-friendly packaging.
