# Ship Zoom-Mode Video Edits with Loopify and Activity Indicator

## Why this matters

Users can already review clips in zoom mode, but they cannot create derived clips from inside the app. This work adds a first useful edit action, `Loopify`, so a reviewer can generate a boomerang-loop version of the zoomed clip without leaving the workflow.

The feature also introduces the first durable video-write path in the desktop runtime plus a reusable status surface for long-running work. It implements the approved spec in [docs/specs/video-edits-spec.md](/C:/dev/clip-sandbox/docs/specs/video-edits-spec.md).

## Progress

- [x] (2026-05-05) Approved feature spec recorded in `docs/specs/video-edits-spec.md`.
- [x] (2026-05-05) Architecture reconnaissance completed across zoom overlay, context menu, pipeline, collection, and Electron filesystem boundaries.
- [x] (2026-05-05) Execution-plan direction fixed: prototype the `ffmpeg` path first, then add the adapter boundary, then wire zoom UI and runtime collection semantics.
- [ ] Prototype bundled-`ffmpeg` loop generation and output metadata contract.
- [ ] Introduce the video-editing adapter, `ClipEditor` orchestration, and tool resolver.
- [ ] Add zoom-mode manipulation menu support and the toolbar activity indicator.
- [ ] Integrate edit execution into pipeline and collection flows without auto-saving collections.
- [ ] Update automated coverage and agent-facing docs, then pass the final regression suite.

## Surprises & Discoveries

- Discovery: the current desktop bridge has no video-write capability at all.
  Evidence: [electron/preload.cjs](/C:/dev/clip-sandbox/electron/preload.cjs) exposes only `pickFolder`, `saveTextFile`, `appendTextFile`, and `deleteFiles`; [electron/main.cjs](/C:/dev/clip-sandbox/electron/main.cjs) implements only those IPC handlers.

- Discovery: the current pipeline model is enough to accept a newly created top-level file without a full folder re-pick, as long as the main process returns the new file entry metadata.
  Evidence: [src/domain/pipeline.ts](/C:/dev/clip-sandbox/src/domain/pipeline.ts) already centralizes the available top-level video files and sorts them via `setVideoFiles(...)`; [src/adapters/electron/electron-file-system-service.ts](/C:/dev/clip-sandbox/src/adapters/electron/electron-file-system-service.ts) can already convert desktop entry metadata into renderer-safe `File` objects through `toRendererFile(...)`.

- Discovery: collection view cannot simply “reload from pipeline” after an edit because unsaved runtime changes live in `ClipSequence`, not in the saved `Collection`.
  Evidence: [src/app/app-controller.ts](/C:/dev/clip-sandbox/src/app/app-controller.ts) keeps the active saved collection in `state.activeCollection` while the editable working copy is `state.currentClipSequence`; [src/domain/clip-sequence.ts](/C:/dev/clip-sandbox/src/domain/clip-sequence.ts) currently owns runtime order and removals, while [src/domain/collection.ts](/C:/dev/clip-sandbox/src/domain/collection.ts) remains the durable backing model.

- Discovery: zoom mode currently has no context-menu seam of its own.
  Evidence: [src/ui/zoom-overlay-controller.ts](/C:/dev/clip-sandbox/src/ui/zoom-overlay-controller.ts) supports open/close/media playback only; right-click handling today exists at grid level through [src/ui/clip-collection-grid-controller.ts](/C:/dev/clip-sandbox/src/ui/clip-collection-grid-controller.ts) and [src/ui/grid-context-menu-control.ts](/C:/dev/clip-sandbox/src/ui/grid-context-menu-control.ts).

- Discovery: the existing status surface is a transient bottom-right toast, not a stateful activity model.
  Evidence: [index.html](/C:/dev/clip-sandbox/index.html) renders `#status` as `.footerbar`; [src/ui/status-bar-control.ts](/C:/dev/clip-sandbox/src/ui/status-bar-control.ts) only supports `show(message, timeout)` with auto-hide.

- Discovery: pipeline order in pipeline view is recomputed from filename sort, not persisted separately.
  Evidence: [src/business-logic/PipelineFactory.ts](/C:/dev/clip-sandbox/src/business-logic/PipelineFactory.ts) sorts video files by filename during build; [src/domain/pipeline.ts](/C:/dev/clip-sandbox/src/domain/pipeline.ts) materializes pipeline view directly from that sorted inventory.

## Decision Log

- Decision: keep the user-facing `ClipEditor` concept, but make it an app-facing coordinator over a dedicated video-editing adapter rather than a pure domain object that shells out directly.
  Rationale: the user wants a `ClipEditor` abstraction, but the repo’s architecture keeps process execution behind adapters. This split preserves tool swap flexibility.
  Date/Author: 2026-05-05 / Codex

- Decision: use `ffmpeg` in V1, resolved through `tools/ffmpeg/`, and keep all CLI details behind one resolver + adapter path.
  Rationale: this satisfies the approved packaging direction without spreading binary-path assumptions through the renderer.
  Date/Author: 2026-05-05 / Codex

- Decision: do not auto-save collection files after an edit, even in collection view.
  Rationale: generating a disk file and persisting collection membership are separate concerns. The runtime collection should change immediately; the backing `.txt` file should change only when the user explicitly saves.
  Date/Author: 2026-05-05 / Codex

- Decision: in collection view, mutate the active `ClipSequence` in memory after a successful file creation instead of reloading from the saved `Collection`.
  Rationale: reloading from the durable collection would discard unsaved collection edits already present in the runtime working copy.
  Date/Author: 2026-05-05 / Codex

- Decision: replace the current footer toast with a compact toolbar activity indicator and collapsible message panel.
  Rationale: edit progress needs a persistent, inspectable status surface, but a full-width bar would waste space in this UI.
  Date/Author: 2026-05-05 / Codex

## Outcomes & Retrospective

Pending execution. Use this section during implementation to record:

1. shipped user-visible behavior,
2. evidence from unit/integration/E2E runs,
3. any compromises around bundled `ffmpeg`,
4. follow-up work for packaging or additional manipulations.

## Context and orientation

This repo is a framework-free Electron desktop app for reviewing one pipeline folder at a time. The durable model is a top-level folder-backed `Pipeline` containing video files plus zero or more saved `Collection` objects. The runtime editable view is a `ClipSequence`.

Key files and current responsibilities:

- [src/app/app-controller.ts](/C:/dev/clip-sandbox/src/app/app-controller.ts): composition root and orchestration for folder load, zoom, save, delete, collection switching, and dialogs.
- [src/domain/pipeline.ts](/C:/dev/clip-sandbox/src/domain/pipeline.ts): durable top-level video inventory plus saved collections.
- [src/domain/collection.ts](/C:/dev/clip-sandbox/src/domain/collection.ts): durable collection file model.
- [src/domain/clip-sequence.ts](/C:/dev/clip-sandbox/src/domain/clip-sequence.ts): mutable runtime ordered clip list used by the active view.
- [src/domain/clip.ts](/C:/dev/clip-sandbox/src/domain/clip.ts): runtime clip record wrapping a renderer-side `File` and media source.
- [src/business-logic/PipelineFactory.ts](/C:/dev/clip-sandbox/src/business-logic/PipelineFactory.ts): top-level file classification and initial pipeline creation.
- [src/ui/zoom-overlay-controller.ts](/C:/dev/clip-sandbox/src/ui/zoom-overlay-controller.ts): zoom overlay component for the currently opened clip.
- [src/ui/context-menu-controller.ts](/C:/dev/clip-sandbox/src/ui/context-menu-controller.ts): generic right-click menu shell.
- [src/ui/grid-context-menu-control.ts](/C:/dev/clip-sandbox/src/ui/grid-context-menu-control.ts): grid-specific context menu item construction.
- [src/ui/status-bar-control.ts](/C:/dev/clip-sandbox/src/ui/status-bar-control.ts): current transient status-toast controller that this work will replace.
- [src/adapters/electron/electron-file-system-service.ts](/C:/dev/clip-sandbox/src/adapters/electron/electron-file-system-service.ts): renderer-facing desktop filesystem bridge.
- [electron/preload.cjs](/C:/dev/clip-sandbox/electron/preload.cjs): preload-exposed desktop API.
- [electron/main.cjs](/C:/dev/clip-sandbox/electron/main.cjs): trusted-process implementation for folder reads and disk writes.
- [index.html](/C:/dev/clip-sandbox/index.html): app shell and toolbar markup.

Definitions used in this plan:

- `video-editing adapter`: the class that executes a requested manipulation using the current editing engine. In V1, that engine is `ffmpeg`.
- `ClipEditor`: the app-facing coordinator that accepts a source clip plus manipulation id, computes the destination name, and delegates execution to the video-editing adapter.
- `activity indicator`: the new top-right toolbar status surface. It is a colored dot button with a collapsible message panel and a short history.
- `partial success`: a case where the derived file is created on disk, but the app cannot fully reflect that success into the current collection view.

Critical constraints to preserve:

1. top-level pipeline discovery remains non-recursive,
2. pipeline view order stays filename-based in V1,
3. saved collection files are not auto-written as a side effect of editing,
4. the new file must still become part of the pipeline immediately,
5. any future engine swap must be localized to the video-editing adapter/tool resolver path.

## Milestone 0 - Prototype the bundled `ffmpeg` path and loop command

### Scope

Reduce the highest-risk unknown first: confirm that a binary resolved from `tools/ffmpeg/` can generate the approved boomerang-loop output and that the main process can return usable output metadata to the renderer.

### Changes

- File: `tools/ffmpeg/README.md`
  Edit: document the expected V1 binary location, platform assumption for this repo version, and the resolver contract used by the app.

- File: `tools/ffmpeg/`
  Edit: stage the actual binary path expected by the resolver, or if repo constraints block committing the binary immediately, stage the exact placeholder structure and record the containment decision in `Decision Log` before moving on.

- File: `electron/main.cjs`
  Edit: add a narrow prototype helper that can invoke `ffmpeg` against a fixture clip, generate a boomerang-loop output into a temp or fixture output path, and capture output metadata in the same shape used by folder enumeration.

- File: `docs/plans/video-edits-exec-plan.md`
  Edit: record the exact command shape chosen for reverse+concat and any codec/container constraints discovered during the spike.

### Validation

- Command: `Get-ChildItem -Path C:\dev\clip-sandbox\tools\ffmpeg`
  Expected: the resolver target path exists and clearly identifies where `ffmpeg` will be loaded from.

- Command: `node -e "const fs=require('fs'); console.log(fs.existsSync('C:/dev/clip-sandbox/tools/ffmpeg/ffmpeg.exe'))"`
  Expected: prints `true` once the binary path is staged for Windows execution.

- Command: prototype shell invocation or a small Node helper under `electron/main.cjs`
  Expected: given a known sample clip, the prototype produces one `.mp4` output whose duration is approximately twice the source duration and whose file metadata can be converted into the existing desktop-entry shape.

### Rollback/Containment

If the first `ffmpeg` command shape fails or produces an incompatible file, keep the experiment isolated in helper/prototype code and do not wire it into the renderer yet. Resolve the codec/filter recipe before touching UI or app-state flows.

## Milestone 1 - Add the video-editing adapter, tool resolver, and `ClipEditor`

### Scope

Introduce the permanent architecture boundary for video edits: one app-facing coordinator (`ClipEditor`), one engine implementation (`ffmpeg`), and one trusted-process API that creates a derived file and returns its metadata.

### Changes

- File: `src/domain/clip-edit-manipulation.ts`
  Edit: define the V1 manipulation catalog and metadata, including:
  - stable manipulation id,
  - menu label,
  - filename suffix,
  - whether the action is available in V1.

- File: `src/business-logic/clip-editor.ts`
  Edit: add `ClipEditor` as the app-facing coordinator that:
  - accepts a source `Clip`,
  - computes the destination filename using base-name + suffix + serial collision rules,
  - delegates execution to a video-editing service interface,
  - returns the new output entry metadata plus manipulation metadata.

- File: `src/adapters/electron/electron-video-editing-service.ts`
  Edit: add the renderer-facing implementation of the video-editing service interface. It should call the preload bridge and return a desktop-entry payload that can be passed through `ElectronFileSystemService.toRendererFile(...)`.

- File: `src/adapters/electron/electron-file-system-service.ts`
  Edit: either host or compose the new editing service entry point so the app has one renderer-safe way to request desktop mutations for generated video files.

- File: `electron/preload.cjs`
  Edit: expose a narrow `createVideoEdit(...)` IPC surface with explicit payload fields for source path, manipulation id, and destination naming inputs.

- File: `electron/main.cjs`
  Edit: implement the trusted-process handler that:
  - resolves the bundled `ffmpeg` binary from `tools/ffmpeg/`,
  - computes a non-colliding destination filename in the selected folder,
  - runs the manipulation,
  - stats the created file,
  - returns a new entry payload compatible with the existing folder-read shape.

### Validation

- Command: `npm run unit`
  Expected: new tests pass for filename collision rules, manipulation metadata, and any pure `ClipEditor` naming helpers.

- Command: targeted integration or Node-level test for the main-process handler
  Expected: successful requests produce a new `.mp4` payload; naming collisions yield `-2`, `-3`, and so on; failures surface explicit error messages without creating false-success payloads.

### Rollback/Containment

If the renderer-facing service shape proves awkward, keep the preload/main-process contract stable and move only the renderer wrapper. Do not let `app-controller.ts` or UI code start constructing `ffmpeg` commands directly.

## Milestone 2 - Extend zoom context menus and replace the footer toast with the activity indicator

### Scope

Add the V1 zoom-mode manipulation menu and the new top-right status surface.

### Changes

- File: `src/ui/context-menu-controller.ts`
  Edit: extend menu-item rendering so items can optionally show an icon element next to the label while preserving keyboard and disabled behavior.

- File: `src/ui/zoom-overlay-controller.ts`
  Edit: add a zoom-specific context-menu seam, such as an `onContextMenu` callback or equivalent event binding, so right-clicking the zoomed video can open a menu at the pointer position.

- File: `src/ui/zoom-edit-menu-control.ts`
  Edit: add a focused control that builds the zoom manipulation menu from the manipulation catalog. V1 exposes only the chisel-icon `Loopify` action.

- File: `index.html`
  Edit: remove the persistent footer-toast markup, add top-right toolbar markup for:
  - clip count,
  - activity indicator button,
  - collapsible message panel anchored to the indicator.

- File: `src/ui/activity-indicator-control.ts`
  Edit: create the new control that:
  - supports `idle`, `progress`, `success`, and `error` indicator states,
  - stores a short in-memory message history with newest first,
  - auto-opens the panel on error,
  - toggles the panel on indicator click,
  - leaves the indicator red after panel collapse until a later message replaces it.

- File: `src/ui/load-status-control.ts`
  Edit: repoint existing load/selection status publishing to the new activity-indicator API so the app uses one status surface going forward.

- File: `src/ui/status-bar-control.ts`
  Edit: remove or reduce this module once all callers are migrated. If compatibility shims are temporarily needed, document them and remove them before final completion.

### Validation

- Command: `npm run unit`
  Expected: UI-controller tests pass for context-menu item rendering, indicator-state transitions, panel toggling, and short-history ordering.

- Command: targeted integration tests under `tests/integration/ui`
  Expected: right-clicking the zoomed video opens the manipulation menu; the activity indicator shows progress and error states correctly; the panel auto-opens on error and stays closed on success.

### Rollback/Containment

If the full indicator replacement causes too much churn, keep a compatibility publisher that maps the old “show status text” calls into the new control until all call sites are moved. Do not ship two separate user-visible status surfaces.

## Milestone 3 - Integrate edit execution into pipeline mode and collection mode

### Scope

Wire the feature through `app-controller.ts` so the user can run `Loopify` from zoom mode, see progress, and get correct post-success behavior in both pipeline view and collection view.

### Changes

- File: `src/domain/clip-sequence.ts`
  Edit: add the minimal runtime mutation API needed to insert a new `Clip` immediately after a source clip without rebuilding the entire sequence from scratch. The API should preserve existing order and dirty-state semantics.

- File: `src/domain/pipeline.ts`
  Edit: add the minimal top-level video inventory mutation helper needed to incorporate one newly created video file into the pipeline and keep filename-sorted ordering intact.

- File: `src/app/app-controller.ts`
  Edit: wire the zoom manipulation flow so it:
  - resolves the currently zoomed clip,
  - disables repeated edit actions while one is running,
  - publishes activity-indicator progress,
  - calls `ClipEditor`,
  - converts the returned entry payload into a renderer `File`,
  - updates the in-memory `Pipeline`,
  - handles pipeline-view success by re-materializing the pipeline sequence,
  - handles collection-view success by inserting the new clip into `state.currentClipSequence` immediately after the source clip and refreshing dirty state without auto-saving,
  - selects the new clip,
  - reopens zoom on the new clip,
  - reports full success or partial success through the activity indicator.

- File: `src/app/app-text.ts`
  Edit: add exact user-facing strings for:
  - generation in progress,
  - generation success,
  - generation failure,
  - partial success that instructs the user to reopen the collection.

- File: `src/ui/clip-collection-grid-controller.ts`
  Edit: add any small selection or clip-lookup helpers needed so the app can reliably select and zoom the newly created clip after insertion or pipeline refresh.

### Validation

- Command: `npm run unit`
  Expected: new tests pass for `ClipSequence` insertion and pipeline video-file mutation helpers.

- Command: `npm run e2e -- --grep "Zoom mode|Collection load"`
  Expected: existing zoom and collection flows still pass after the new insertion and selection logic is introduced.

- Command: targeted integration tests under `tests/integration/app/app-controller.spec.ts`
  Expected: when the desktop API is mocked to return a created file payload, pipeline view reloads with the new clip selected, and collection view inserts the new clip after the source while leaving the collection unsaved.

### Rollback/Containment

If collection-view insertion proves unstable, keep pipeline-view success shipped behind the permanent adapter boundary and contain collection-view insertion behind a feature flag inside `app-controller.ts` until the runtime-sequence mutation path is correct. Do not regress to auto-saving collection files as a workaround.

## Milestone 4 - Handle failures, partial successes, and repeated-action containment

### Scope

Make the feature resilient to edit failures and mixed-success cases, and ensure users cannot spam conflicting edit requests.

### Changes

- File: `src/app/app-controller.ts`
  Edit: add explicit busy-state tracking for the active edit operation so:
  - the zoom edit menu item is disabled while work is in progress,
  - repeated right-click edit requests cannot overlap,
  - completion always clears busy state even on failure.

- File: `src/business-logic/clip-editor.ts`
  Edit: distinguish clean failure from created-file success. Return enough result metadata so the app can tell whether a file exists on disk even if later UI integration fails.

- File: `electron/main.cjs`
  Edit: make the handler surface actionable failures:
  - tool missing,
  - source file missing,
  - `ffmpeg` process failure,
  - output file not found after process exit.

- File: `src/app/app-text.ts`
  Edit: add partial-success and actionable error copy that matches the approved product language.

### Validation

- Command: `npm run unit`
  Expected: failure-mode tests pass for collision naming, missing binary/tool path, and result-shape branching between full success, clean failure, and partial success.

- Command: targeted integration tests under `tests/integration/app/app-controller.spec.ts`
  Expected: the activity indicator enters red/error state and auto-opens on failure; partial success keeps the file and tells the user to reopen the collection; busy state prevents duplicate requests.

### Rollback/Containment

If a specific failure branch is hard to simulate in E2E, keep it covered by main-process or app-controller integration tests with explicit mocked results. Do not leave mixed-success behavior undocumented or ambiguous.

## Milestone 5 - Refresh docs and pass the full regression suite

### Scope

Update agent-facing architecture docs for the new durable subsystem, add automated coverage, and prove the shipped behavior end to end.

### Changes

- File: `docs/agent-docs/agent-architecture-map.md`
  Edit: update the architecture map so it routes future agents to the new video-editing adapter, activity indicator, and zoom manipulation flow.

- File: `docs/specs/video-edits-spec.md`
  Edit: update only if implementation discoveries require a clarified but still approved record. If behavior changes materially, stop and get fresh approval instead of silently rewriting the spec.

- File: `docs/plans/video-edits-exec-plan.md`
  Edit: keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current with real implementation evidence.

- File: `tests/unit/*.spec.ts`
  Edit: add or update pure tests for naming, sequence insertion, pipeline mutation, and activity-indicator behavior.

- File: `tests/integration/ui/*.spec.ts`
  Edit: cover zoom-context-menu rendering and activity-indicator interactions.

- File: `tests/integration/app/app-controller.spec.ts`
  Edit: cover app orchestration for full success, failure, and partial success.

- File: `tests/e2e/scenarios.spec.ts`
  Edit: add one or more Electron-visible scenarios for:
  - running `Loopify` from zoom mode,
  - seeing the new clip selected afterward,
  - seeing collection view remain dirty rather than auto-saved,
  - seeing the activity indicator reflect status.

### Validation

- Command: `npm run unit`
  Expected: all unit and integration-style Vitest coverage passes.

- Command: `npm run e2e`
  Expected: Playwright/Electron scenarios pass, including the new zoom-edit workflow.

- Command: `npm run test:all`
  Expected: the full regression suite passes with no failures.

### Rollback/Containment

If the real `ffmpeg` dependency makes E2E too brittle for CI or local repeatability, keep one end-to-end happy-path scenario and move lower-level failure branching to integration tests with a mocked desktop API. The shipped feature must still have at least one observable Electron-visible success path under automated coverage.

## Definition of done

The feature is done when all of the following are true:

1. right-clicking the zoomed clip opens a manipulation menu with a chisel-icon `Loopify` item,
2. selecting `Loopify` creates a boomerang-loop `.mp4` in the pipeline folder using the bundled `ffmpeg` path under `tools/ffmpeg/`,
3. collision naming uses `-2`, `-3`, and so on,
4. pipeline view refreshes to include the new file and selects it,
5. collection view inserts the new clip immediately after the source in the runtime `ClipSequence` without auto-saving the backing collection file,
6. zoom switches to the newly created clip on success,
7. repeated edit requests are blocked while an edit is already running,
8. the toolbar activity indicator replaces the old footer toast and supports progress, success, error, and short-history panel behavior,
9. partial success keeps the generated file on disk and tells the user to reopen the collection,
10. agent-facing architecture docs are updated for the new adapter/UI flow,
11. `npm run test:all` passes.
