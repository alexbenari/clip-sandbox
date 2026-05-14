# Deliver Zoom Video Edits and Activity Indicator

## Why this matters

Users can currently review clips, zoom in, manage collections, and delete files, but they cannot create a derived clip without leaving the app. This work adds a zoom-only `Loopify` edit that generates a new video in the active pipeline folder, refreshes the session immediately, and gives the app a reusable status surface for edit progress and failures.

The implementation must preserve the current architectural split:

1. disk-backed pipeline files remain the source of truth,
2. saved collections remain explicit `.txt` files,
3. the active runtime `ClipSequence` remains the mutable working copy.

## Progress

- [x] (2026-05-05 18:11Z) Execution plan drafted from `docs/specs/video-edits-spec.md`, `docs/agent-docs/agent-architecture-map.md`, `coding-quality.md`, and `C:/Users/alexb/.codex/PLANS.md`.
- [ ] Prototype the ffmpeg Loopify command and bundled tool resolution against an existing fixture clip.
- [ ] Replace the footer status bar with a reusable toolbar activity indicator and message panel.
- [ ] Add zoom-only context-menu entry points for video edits, including icon rendering and in-progress disabling.
- [ ] Execute `Loopify` through a dedicated adapter boundary, refresh the folder-backed session, and reopen zoom on the generated clip.
- [ ] Verify collision handling, collection dirty-state behavior, partial success, and failure reporting with unit, integration, and Electron end-to-end coverage.
- [ ] Update `docs/agent-docs/` if the final implementation changes the repo’s architecture map or future-agent orientation.

## Surprises & Discoveries

- Discovery: the current status surface is a transient footer `<div id="status">` controlled by `StatusBarControl.show(message, timeout)`, so the existing UI has no notion of sticky errors, history, or progress state.
  Evidence: `index.html`, `src/ui/status-bar-control.ts`, `src/app/app-controller.ts`

- Discovery: zoom mode currently owns only open, close, mute, and replace behavior. It has no local right-click handling or callback for app-level actions.
  Evidence: `src/ui/zoom-overlay-controller.ts`

- Discovery: the grid already uses a shared generic `ContextMenuController`, so zoom editing should reuse that menu surface instead of creating a second menu framework.
  Evidence: `src/ui/context-menu-controller.ts`, `src/ui/grid-context-menu-control.ts`, `src/app/app-controller.ts`

- Discovery: dirty tracking compares the runtime `ClipSequence` against either `Pipeline.videoNames()` or `activeCollection.orderedClipNames`. If a generated clip is inserted only into the active runtime collection view, the current dirty-state logic will already mark the collection unsaved.
  Evidence: `src/app/app-session-state.ts`

- Discovery: pipeline and collection materialization assign fresh clip ids on every reload, so post-edit selection cannot rely on the pre-edit zoom clip id. The success path must key off stable filenames.
  Evidence: `src/domain/pipeline.ts`, `src/domain/collection.ts`, `src/app/app-session-state.ts`

- Discovery: the Electron boundary can currently enumerate a folder only during the picker flow, and it can save or delete files, but it cannot yet re-read the active folder or spawn an external video tool.
  Evidence: `electron/preload.cjs`, `electron/main.cjs`, `src/adapters/electron/electron-file-system-service.ts`

## Decision Log

- Decision: keep V1 edit definitions concrete and local to app orchestration with a small catalog file, not a plugin system or generic engine registry.
  Rationale: the spec allows one predefined manipulation and explicitly rejects a plugin system. A deeper abstraction here would be shallow and harder to reason about.
  Date/Author: 2026-05-05 / Codex

- Decision: reuse the existing generic context-menu controller and extend its item shape with a narrow optional `iconName` field rather than adding HTML-rich or arbitrary-renderer menu items.
  Rationale: the UI needs one chisel-icon action in V1. A small typed extension is enough and keeps the menu API simple.
  Date/Author: 2026-05-05 / Codex

- Decision: refresh pipeline knowledge after a successful edit by re-reading the active folder from disk, not by manufacturing a synthetic `File` for the generated output.
  Rationale: the pipeline is folder-backed today, and disk is the durable truth for derived clips. Reusing folder enumeration avoids two different sources of truth for pipeline membership.
  Date/Author: 2026-05-05 / Codex

- Decision: keep collection persistence unchanged by leaving `activeCollection` as the saved baseline and mutating only the runtime `ClipSequence` when inserting the generated clip after the source item.
  Rationale: this matches the spec and fits the current dirty-state design without special-case persistence rules.
  Date/Author: 2026-05-05 / Codex

- Decision: isolate ffmpeg-specific path resolution and process execution in one main-process helper plus one renderer-facing service.
  Rationale: process spawning and tool lookup are runtime concerns, not domain or UI concerns. Keeping them isolated makes future engine replacement or packaging work local.
  Date/Author: 2026-05-05 / Codex

## Outcomes & Retrospective

Implementation has not started. Update this section during execution with:

1. the exact commands run,
2. the observed output files and UI behavior,
3. any follow-up work that remains after the feature ships.

## Context and orientation

This repo is a framework-free Electron desktop app. `index.html` defines the shell DOM, `src/app/app-controller.ts` is the composition root, and the runtime model is intentionally split between durable folder-backed state and mutable UI working state.

Relevant existing files:

1. `index.html`
   The toolbar, floating footer status, context-menu root, and zoom mount all live here. The activity indicator work will replace the footer status surface in this file.

2. `src/app/app-controller.ts`
   This file wires together the filesystem service, context menu, zoom overlay, toolbar control, and load/save/delete flows. It should stay the orchestration layer, not absorb DOM or ffmpeg implementation details.

3. `src/ui/zoom-overlay-controller.ts`
   This controller owns the zoom overlay DOM and the current zoomed item `{ clipId, src, name }`. Right-click support for zoom mode belongs here because it is local interaction behavior on the zoom surface.

4. `src/ui/context-menu-controller.ts` and `src/ui/grid-context-menu-control.ts`
   These files already provide the shared right-click menu behavior used by the grid. The zoom edit menu should follow the same control pattern instead of creating a second menu system.

5. `src/domain/pipeline.ts`, `src/domain/collection.ts`, `src/domain/clip-sequence.ts`, and `src/app/app-session-state.ts`
   `Pipeline` and `Collection` are the durable models. `ClipSequence` is the mutable runtime order used by the grid and zoom flows. `AppSessionState` computes dirty state by comparing the runtime order to the durable baseline.

6. `electron/main.cjs`, `electron/preload.cjs`, and `src/adapters/electron/electron-file-system-service.ts`
   These files are the current desktop boundary. They already enumerate folder files and handle text save/delete operations. Video-edit spawning and folder re-read support must be added here, not leaked into renderer UI code.

7. `tests/unit/*`, `tests/integration/*`, and `tests/e2e/scenarios.spec.ts`
   Unit tests cover the model and small controls, integration tests cover controller wiring, and Electron end-to-end tests cover real desktop behavior against fixture folders under `tests/e2e/fixtures/`.

This plan assumes V1 targets the current Electron desktop flow first. It also assumes the bundled Windows ffmpeg binary will live at `tools/ffmpeg/ffmpeg.exe`, with all path lookup centralized in one resolver so future packaging changes stay isolated.

## Milestone 1 - Prototype ffmpeg Loopify and tool resolution

### Scope

Prove that the app can invoke a bundled ffmpeg binary, transform one existing fixture clip into a deterministic `*-looped.mp4` output, and do so from one centralized resolver path. Do this before editing the app-controller success flow.

### Prototype

- Hypothesis: a bundled ffmpeg binary under `tools/ffmpeg/ffmpeg.exe` can generate a playable `Loopify` output from an existing fixture clip without any extra machine-specific dependency.
- How to run: create a small smoke runner that calls the same helper the app will use, then run it against `tests/e2e/fixtures/load-basic/clips/alpha.mp4`.
- Pass signal: the command exits `0`, the output file exists, the file size is non-zero, and Electron can later reload that file as part of normal pipeline enumeration.
- Fail signal: the binary cannot be found, ffmpeg exits non-zero, or the output file is unreadable.
- Decision informed: finalize the exact ffmpeg command shape, the single supported bundled path for V1, and whether preserving audio is simple enough to keep in scope.

### Changes

- File: `tools/ffmpeg/ffmpeg.exe`
  Edit: place the V1 bundled binary here. If the repo cannot carry it yet, document the exact missing-binary error path and keep all fallback behavior out of renderer code.

- File: `electron/video-editing.cjs`
  Edit: add the first production helper with `resolveFfmpegBinary()`, `buildLoopifyArgs()`, and a focused `runLoopify()` path that the smoke runner and later IPC handler can share.

- File: `tools/ffmpeg/smoke-loopify.cjs`
  Edit: add a temporary smoke script that imports `electron/video-editing.cjs`, runs `Loopify` against a provided input path, and exits non-zero on any failure. Remove it later only if the final automated coverage makes it redundant.

### Validation

- Command: `node tools/ffmpeg/smoke-loopify.cjs "tests/e2e/fixtures/load-basic/clips/alpha.mp4" "$env:TEMP\\clip-sandbox-loopify-smoke\\alpha-looped.mp4"`
  Expected: the script reports the resolved ffmpeg path and created output path, and exits `0`.

- Command: `npm run build`
  Expected: adding the helper and smoke script does not break the existing build.

### Rollback/Containment

Keep this prototype isolated to the main-process helper and smoke runner. If the prototype fails, do not start wiring zoom UI or activity-indicator behavior yet. Fix the command or bundled-path design first, then update `Decision Log` before moving on.

## Milestone 2 - Replace the footer status bar with a reusable toolbar activity indicator

### Scope

Replace the floating footer status with a compact top-right toolbar indicator that supports idle, progress, success, and error states plus a five-message in-memory history panel. Migrate existing load/save/delete/info messages to the new surface before adding edit-specific messaging.

### Changes

- File: `index.html`
  Edit: remove the footer-oriented status markup and add toolbar activity-indicator markup near the right-side clip count so the indicator is the rightmost toolbar item.

- File: `src/ui/activity-indicator-control.ts`
  Edit: add a focused controller that owns:
  the current indicator state,
  the five-message history buffer,
  toggle-open behavior for the panel,
  auto-open on error,
  timer-based return from success to idle.

- File: `src/ui/load-status-control.ts`
  Edit: retarget semantic load messages to the new activity control instead of the old footer-only control.

- File: `src/app/app-controller.ts`
  Edit: replace the current `showStatus()` footer usage with small helper wrappers that publish info/success/error/progress messages through the activity-indicator control. Keep the controller out of direct DOM mutations for this surface.

- File: `src/app/app-text.ts`
  Edit: add or adjust text helpers only where copy changes are needed. Do not encode activity-state behavior in the text helper layer.

- File: `tests/unit/status-bar-control.spec.ts`
  Edit: replace this coverage with `tests/unit/activity-indicator-control.spec.ts` so the new controller, not the removed footer control, owns timer and history tests.

- File: `tests/unit/load-status-control.spec.ts`, `tests/unit/main-toolbar-control.spec.ts`, `tests/integration/app/app-controller.spec.ts`, `tests/integration/ui/view-model.spec.ts`
  Edit: update DOM assumptions and assertions so the existing load/save/delete flows publish through the toolbar surface.

### Validation

- Command: `npx vitest run tests/unit/activity-indicator-control.spec.ts tests/unit/load-status-control.spec.ts tests/unit/main-toolbar-control.spec.ts tests/integration/app/app-controller.spec.ts tests/integration/ui/view-model.spec.ts`
  Expected: activity-indicator tests cover history length, error auto-open, and timer behavior, and app-controller tests no longer depend on a floating footer status element.

- Command: `npm run build`
  Expected: the app still builds after the DOM and control swap.

### Rollback/Containment

Do not delete the old footer wiring until the new control passes targeted tests. Migrate the controller and tests together so the status surface change stays isolated from the later edit-flow work.

## Milestone 3 - Add zoom-only edit context menu and initiation flow

### Scope

Allow the zoomed clip to open a right-click menu that shows one icon-capable `Loopify` action in V1. While an edit is already running, keep the action visible but disabled.

### Changes

- File: `src/ui/zoom-overlay-controller.ts`
  Edit: add a local `contextmenu` listener on the zoomed video or frame and emit a callback with the pointer coordinates plus the current zoom item metadata.

- File: `src/ui/context-menu-controller.ts`
  Edit: extend the item renderer with a narrow optional `iconName` field so menu items can display a leading chisel icon without allowing arbitrary HTML injection.

- File: `src/ui/zoom-context-menu-control.ts`
  Edit: add a dedicated builder for zoom-only edit items. V1 exposes exactly one `Loopify` item and handles the disabled-while-busy case locally.

- File: `src/app/app-session-state.ts`
  Edit: add one explicit session flag, `isVideoEditInProgress`, so zoom menu disabling and app-level orchestration share one source of truth.

- File: `src/app/app-controller.ts`
  Edit: wire zoom right-click to the shared context-menu root, dispatch `requestLoopifyForZoomedClip()`, and keep the orchestration method small by capturing `sourceClipName`, `sourcePath`, and current view mode before the async work begins.

- File: `tests/integration/ui/zoom-overlay-controller.spec.ts`, `tests/integration/ui/context-menu-controller.spec.ts`, `tests/unit/zoom-context-menu-control.spec.ts`, `tests/integration/app/app-controller.spec.ts`
  Edit: cover zoom right-click behavior, icon rendering, focus behavior, and disabled state while an edit is active.

### Validation

- Command: `npx vitest run tests/integration/ui/zoom-overlay-controller.spec.ts tests/integration/ui/context-menu-controller.spec.ts tests/unit/zoom-context-menu-control.spec.ts tests/integration/app/app-controller.spec.ts`
  Expected: right-clicking the zoomed clip opens one `Loopify` menu item with icon treatment, and the item becomes disabled while a mock edit is in progress.

### Rollback/Containment

Keep zoom menu logic in `zoom-context-menu-control.ts` and the overlay callback. If the menu behavior regresses, disable the zoom callback without affecting the grid’s existing context-menu behavior.

## Milestone 4 - Execute Loopify through a dedicated adapter and refresh session state

### Scope

Run the actual `Loopify` edit, write a deterministic output filename into the active pipeline folder, refresh the folder-backed pipeline, select the generated clip, reopen zoom on it, and insert it after the source clip in collection view without auto-saving the collection file.

### Changes

- File: `src/app/video-edit-definitions.ts`
  Edit: add the V1 manipulation catalog with `loopify`, its menu label `Loopify`, and its filename suffix `looped`.

- File: `src/app/video-edit-output-name.ts`
  Edit: add pure helpers that compute `basename-suffix.mp4` and serial collisions such as `basename-suffix-2.mp4` from the current pipeline video names.

- File: `src/domain/clip-sequence.ts`
  Edit: add one focused insertion method for the runtime sequence so the controller can insert the generated clip immediately after the source clip without performing raw array surgery in `app-controller.ts`.

- File: `src/adapters/electron/electron-video-editing-service.ts`
  Edit: add the renderer-facing service that calls preload IPC to run a named edit request and returns structured success or failure data.

- File: `src/adapters/electron/electron-file-system-service.ts`
  Edit: add a `readFolder(folderSession)` method that re-enumerates the active folder and returns the same shape as `pickFolder()`.

- File: `electron/preload.cjs`
  Edit: expose `readFolder(payload)` and `runVideoEdit(payload)` IPC methods.

- File: `electron/main.cjs`
  Edit: add IPC handlers for folder re-enumeration and video-edit execution. Delegate ffmpeg command building and spawning to `electron/video-editing.cjs`.

- File: `electron/video-editing.cjs`
  Edit: finalize the bundled ffmpeg resolver, build the Loopify command, execute it, and surface structured error details.

- File: `src/app/app-controller.ts`
  Edit: add a compact `runZoomVideoEdit()` flow that:
  captures stable source metadata before async work,
  publishes progress state,
  computes the collision-safe destination name,
  calls the editing service,
  re-reads the folder and rebuilds a fresh `Pipeline`,
  selects the generated clip by filename in pipeline mode,
  re-materializes the saved collection and inserts the generated clip after the source in collection mode,
  leaves `activeCollection` unchanged so the view becomes dirty,
  reopens zoom on the generated clip,
  publishes success state.

- File: `tests/unit/clip-models.spec.ts`, `tests/unit/electron-file-system-service.spec.ts`, `tests/unit/pipeline-selection.spec.ts`, `tests/unit/state.spec.ts`, `tests/integration/app/app-controller.spec.ts`
  Edit: add coverage for collision-safe naming, runtime insertion after source, filename-based selection after rematerialization, folder re-read plumbing, and collection dirty-state preservation.

### Validation

- Command: `npx vitest run tests/unit/clip-models.spec.ts tests/unit/electron-file-system-service.spec.ts tests/unit/pipeline-selection.spec.ts tests/unit/state.spec.ts tests/integration/app/app-controller.spec.ts`
  Expected: output names follow `alpha-looped.mp4`, `alpha-looped-2.mp4`, and later serial forms; collection mode becomes dirty without writing the `.txt` file; selection uses filenames rather than stale clip ids.

- Command: `npm run build`
  Expected: the renderer and Electron entry points still build after the new service and IPC additions.

### Rollback/Containment

Land the pure naming helper and folder-refresh API before switching the full app flow. If the selection rebuild fails, keep the new disk file and revert only the UI orchestration path. Do not add logic that deletes the generated file during rollback.

## Milestone 5 - Finish failure handling, end-to-end coverage, and agent docs

### Scope

Make full failure and partial-success behavior explicit, verify the real Electron workflow against fixture folders, and update agent documentation if the final architecture changes where future agents should look.

### Changes

- File: `src/app/app-text.ts`
  Edit: add explicit user-facing copy for:
  progress,
  success,
  missing-ffmpeg or spawn failure,
  collision-safe output creation,
  partial success in collection view with the reopen-collection instruction.

- File: `src/app/app-diagnostics.ts`
  Edit: add a focused helper for video-edit failures or reuse `logRuntimeError()` with a clear problem label so stderr details are logged without dumping raw stack noise into the UI.

- File: `src/app/app-controller.ts`
  Edit: distinguish these outcomes:
  full success,
  full failure with sticky red activity state and auto-open panel,
  partial success where the file exists on disk but the current collection view could not be updated.

- File: `tests/e2e/scenarios.spec.ts`
  Edit: add at least these Electron scenarios:
  pipeline-view `Loopify` creates a new `*-looped.mp4`, increases clip count, selects the new clip, and shows it in zoom,
  collection-view `Loopify` inserts the generated clip immediately after the source in the runtime view while leaving the saved collection file unchanged until Save,
  collision naming by pre-seeding `*-looped.mp4` in the temp fixture before running the edit.

- File: `docs/agent-docs/agent-architecture-map.md`
  Edit: if the final implementation adds stable new boundaries or search entry points, update the map to mention the activity-indicator control, video-editing service, and main-process video-edit helper.

### Validation

- Command: `npm run unit`
  Expected: all model, adapter, and UI control tests pass after the new feature lands.

- Command: `npm run e2e`
  Expected: Electron scenarios create real derived files in temp fixture folders and reflect the correct selection and collection behavior.

- Command: `npm run build`
  Expected: the final implementation still emits the runtime app without build errors.

### Rollback/Containment

If the real ffmpeg e2e is flaky, keep the targeted unit and integration coverage in place and record the exact flake in `Surprises & Discoveries` rather than weakening runtime error handling. The app must still report clear red failure state even if automated end-to-end coverage needs temporary containment.
