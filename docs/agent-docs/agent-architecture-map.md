# Agent Architecture Map

Last verified: 2026-09-11

Shell ownership, utilities, coordinated panels, grid layout, durable settings, and production TypeScript object ownership updated: 2026-09-11.

Verified against:

- `index.html`
- `package.json`
- `tsconfig.base.json`
- `tsconfig.json`
- `tsconfig.build.json`
- `tsconfig.strict-src.json`
- `electron/main.cjs`
- `electron/folder-entry.cjs`
- `electron/ffmpeg-resolver.cjs`
- `electron/preload.cjs`
- `electron/video-edit-runtime.cjs`
- `src/app/*`
- `src/adapters/browser/*`
- `src/adapters/electron/*`
- `src/business-logic/*`
- `src/domain/*`
- `src/ui/*`
- `tools/ffmpeg/*`
- `sandbox/context-menu-demo.html`
- `sandbox/zoom-demo.html`
- `tests/unit/*`
- `tests/integration/*`
- `tests/e2e/scenarios.spec.ts`
- `docs/documentation/object-oriented-exception-register.md`

This is the canonical entrypoint for agent orientation. Read this before planning substantial work. Use it to narrow where to look. Do not treat it as an exhaustive walkthrough.

## Purpose

Clip Sandbox is a local Electron desktop app for reviewing video clips from one selected folder at a time. The durable model is a `Pipeline`: a folder-backed container of all clips plus zero or more saved collections. The user can browse the full pipeline, switch to a saved collection, reorder clips, save or save-as-new, add to another collection, delete from disk, zoom a clip, run the built-in `Loopify` edit from zoom mode, and enter fullscreen review mode.

The renderer is still framework-free. The main architectural change from the OO/TypeScript refactor is that authored renderer code now lives in `src/**/*.ts`, the Electron shell remains pragmatic CommonJS, the adapter layer under `src/adapters/` is now class-backed, and `index.html` loads emitted runtime JavaScript from `build/src/...`.

## Stable Concepts

1. `Clip` in [`src/domain/clip.ts`](../../src/domain/clip.ts): canonical runtime clip object with generated id, an immutable File snapshot with normalized source metadata, duration, intrinsic video dimensions, and metadata failure state.
2. `ClipSequence` in [`src/domain/clip-sequence.ts`](../../src/domain/clip-sequence.ts): mutable runtime ordered clip list used by the grid, selection, reorder, and transient view state.
3. `Collection` in [`src/domain/collection.ts`](../../src/domain/collection.ts): durable ordered subset of pipeline clip names, optionally backed by a `.txt` file, with collection-specific append/remove/materialization behavior.
4. `Pipeline` in [`src/domain/pipeline.ts`](../../src/domain/pipeline.ts): folder-backed container of all available video files plus zero or more saved `Collection` objects. It owns one canonical runtime `Clip` per active-session video file, explicit `materializePipeline(...)` / `materializeCollection(...)` flows, and in-memory collection/video mutation rules such as `addClipsToCollection(...)` and `removeVideos(...)`.
5. `PipelineSession` in [`src/app/pipeline-session.ts`](../../src/app/pipeline-session.ts): active loaded-pipeline working state. It owns generated clip ids, the selected pipeline/collection sequence, derived dirty-state comparison (never a cached flag), active clip resolution, reorder/remove mutation, and created-clip insertion while keeping the durable `Pipeline` focused on folder contents and saved collections.
6. `AppSessionState` in [`src/app/app-session-state.ts`](../../src/app/app-session-state.ts): class-backed app-shell state for the active folder session and pending selection actions. It does not own loaded pipeline selection state.
7. `FullscreenSession` in [`src/app/fullscreen-session.ts`](../../src/app/fullscreen-session.ts): fullscreen coordinator for slot input, title hiding and rotation scheduling. It passes slot values and rotation requests to the grid; it receives no card/video handles.
8. `folderSession` in [`src/adapters/electron/electron-file-system-service.ts`](../../src/adapters/electron/electron-file-system-service.ts): direct-access desktop folder session backed by an absolute folder path.
9. `clipSandboxDesktop` in [`electron/preload.cjs`](../../electron/preload.cjs): preload-exposed desktop API used by the renderer-facing filesystem service.
10. `ClipEditor` in [`src/business-logic/clip-editor.ts`](../../src/business-logic/clip-editor.ts): edit request executor that validates requests, derives preferred output filenames, and delegates execution to the runtime editing service.
11. `ZoomVideoEditWorkflow` in [`src/app/zoom-video-edit-workflow.ts`](../../src/app/zoom-video-edit-workflow.ts): app-layer workflow boundary that runs `ClipEditor` for a supplied zoom source clip and emits edit lifecycle callbacks without knowing pipeline, grid, toolbar, or zoom overlay details.
12. `ActivityIndicatorControl` in [`src/ui/activity-indicator-control.ts`](../../src/ui/activity-indicator-control.ts): global status surface that owns progress/success/error state and session history with detailed, resolvable errors.
13. `video edit runtime` in [`electron/video-edit-runtime.cjs`](../../electron/video-edit-runtime.cjs): trusted-process runner that resolves `ffmpeg`, collision-checks the output path, creates the derived file, and returns folder-entry metadata.

The important split remains durable selection state vs runtime working copy:

1. runtime UI works with `Clip` and `ClipSequence`,
2. active loaded-folder selection state works through `PipelineSession`,
3. durable selection and persistence work with `Pipeline`, `Collection`, and explicit pipeline-mode vs active-collection branching,
4. `Collection` remains filename-based durably, while materialized collection sequences reference canonical `Clip` instances from the active `Pipeline`.

## Architecture Axioms

These are normative defaults for future work. Do not violate them without a concrete reason and user approval.

1. Keep the renderer framework-free unless a larger architecture decision is approved.
2. Keep [`AppController`](../../src/app/app-controller.ts) as the composition root and orchestration layer, with workflows owned by its class-backed application object; do not put new domain rules or reusable UI internals there.
3. Keep durable pipeline and collection state in domain models plus explicit active-collection selection state, not in DOM order or DOM-selected state.
4. Prefer explicit pipeline-vs-collection flows when their semantics differ materially. Do not introduce shared protocol layers or generic source ids unless they are buying real simplification.
5. Keep Electron main/preload and local filesystem behavior behind adapters or services. Do not leak raw Electron or Node APIs broadly into renderer code.
6. Keep reusable UI behavior in focused controllers under [`src/ui/`](../../src/ui/), even when the app controller wires them together.
7. Default production TypeScript behavior to explicit class ownership, including deterministic calculations and text formatting. Treat every module-level function as a design smell that requires an ownership decision; document any intentional exception.
8. Treat [`docs/documentation/object-oriented-exception-register.md`](../../docs/documentation/object-oriented-exception-register.md) as the reviewable record of intentionally non-OO holdouts.
9. Treat `docs/agent-docs/` as the canonical agent-facing architecture knowledge base. Historical specs and plans are not canonical onboarding material.
10. A UI control owns binding and unbinding events originating from its own elements. [`ApplicationEventController`](../../src/app/application-event-controller.ts) is limited to application-wide document/window events.
11. Inject shared service-like objects such as [`AppText`](../../src/app/app-text.ts) rather than importing static namespaces or free formatting functions.

## System Shape

Start here for the current ownership map:

1. Electron shell: [`electron/main.cjs`](../../electron/main.cjs), [`electron/preload.cjs`](../../electron/preload.cjs)
2. Static shell and emitted runtime bootstrap: [`index.html`](../../index.html) loads [`build/src/app/app-controller.js`](../../build/src/app/app-controller.js) after `npm run build`.
3. TypeScript compiler and runtime setup: [`package.json`](../../package.json), [`tsconfig.base.json`](../../tsconfig.base.json), [`tsconfig.json`](../../tsconfig.json), [`tsconfig.build.json`](../../tsconfig.build.json), [`tsconfig.strict-src.json`](../../tsconfig.strict-src.json)
4. App orchestration: [`src/app/app-controller.ts`](../../src/app/app-controller.ts), [`src/app/pipeline-session.ts`](../../src/app/pipeline-session.ts), [`src/app/app-session-state.ts`](../../src/app/app-session-state.ts), [`src/app/fullscreen-session.ts`](../../src/app/fullscreen-session.ts), [`src/app/app-diagnostics.ts`](../../src/app/app-diagnostics.ts), and [`src/app/application-event-controller.ts`](../../src/app/application-event-controller.ts)
5. Desktop/runtime boundary: class-backed adapters under [`src/adapters/electron/`](../../src/adapters/electron/) and [`src/adapters/browser/`](../../src/adapters/browser/)
6. Load and persistence workflows: [`src/business-logic/PipelineFactory.ts`](../../src/business-logic/PipelineFactory.ts) and the explicit materialization plus mutation methods on [`src/domain/pipeline.ts`](../../src/domain/pipeline.ts). The controller currently performs the raw collection-file writes through the filesystem service.
7. Domain models and invariants: [`src/domain/clip.ts`](../../src/domain/clip.ts), [`src/domain/clip-sequence.ts`](../../src/domain/clip-sequence.ts), [`src/domain/collection.ts`](../../src/domain/collection.ts), [`src/domain/pipeline.ts`](../../src/domain/pipeline.ts), [`src/domain/collection-description-validator.ts`](../../src/domain/collection-description-validator.ts)
8. UI controllers and supporting objects: [`src/ui/clip-collection-grid-controller.ts`](../../src/ui/clip-collection-grid-controller.ts), [`src/ui/grid-video-metadata-tracker.ts`](../../src/ui/grid-video-metadata-tracker.ts), [`src/ui/grid-preview-playback-controller.ts`](../../src/ui/grid-preview-playback-controller.ts), [`src/ui/display-layout-rules.ts`](../../src/ui/display-layout-rules.ts), [`src/ui/zoom-overlay-controller.ts`](../../src/ui/zoom-overlay-controller.ts), [`src/ui/context-menu-controller.ts`](../../src/ui/context-menu-controller.ts), [`src/ui/grid-context-menu-control.ts`](../../src/ui/grid-context-menu-control.ts), [`src/ui/zoom-edit-menu-control.ts`](../../src/ui/zoom-edit-menu-control.ts), [`src/ui/collection-selector-control.ts`](../../src/ui/collection-selector-control.ts), [`src/ui/main-toolbar-control.ts`](../../src/ui/main-toolbar-control.ts), [`src/ui/activity-indicator-control.ts`](../../src/ui/activity-indicator-control.ts), [`src/ui/load-status-control.ts`](../../src/ui/load-status-control.ts), and dialog controllers under [`src/ui/`](../../src/ui/)
9. Sandbox demos that mirror the emitted runtime shape: [`sandbox/context-menu-demo.html`](../../sandbox/context-menu-demo.html), [`sandbox/zoom-demo.html`](../../sandbox/zoom-demo.html)

## Core Runtime Flows

### Native Desktop Frame

[`electron/main.cjs`](../../electron/main.cjs) enables the approved native title-bar overlay on Windows. Native minimize/maximize/close controls remain Electron/Windows-owned; no window-management IPC was added. `index.html` reserves the native caption area with `titlebar-area-*` environment values and marks app-bar controls as no-drag. Other platforms keep their default frame. After building, `npx electron . --native-frame` is the independent default-frame fallback.

[`desktop-shell.spec.ts`](../../tests/e2e/desktop-shell.spec.ts) covers overlay/fallback layouts at 1440 and 800px, caption-space clearance, rapid Collection/Settings requests, reduced motion, and fullscreen chrome removal/restoration. Native-button and double-click maximize checks were also exercised through Windows UI automation. The user accepted the final review app after the physical mouse-drag check request (2026-09-08). The automation drag probe itself was inconclusive: it moved neither the overlay window nor the unchanged default frame.

### Application Shell and Screen Ownership

`index.html` defines the global app bar, central command host and main screen host. [`ApplicationShellController`](../../src/ui/application-shell-controller.ts) owns a nonempty set of [`AppScreen`](../../src/ui/app-screen.ts) registrations, the screen selector, active content/commands and delegated initial focus. Screen roots stay mounted but inactive roots are hidden/inert; inactive commands are detached. Activation is synchronous, so there are no queued stale completion callbacks. The selector is hidden for a single registration. The shell has no screen-id branches or Electron/filesystem dependencies.

Production registers [`CollectionScreen`](../../src/ui/collection-screen.ts) and [`SettingsScreen`](../../src/ui/settings-screen.ts). Collection adapts the existing Collection DOM, owns initial focus and supplies the grid's allocated content height. `MainToolbarControl` remains the Collection command-state renderer; its name and stable element ids are retained. Existing Activity lives in the global bar, while zoom/context overlays remain outside the screen root. Settings has no command bar. Screen navigation closes Collection Zoom and Collection keyboard handlers run only while Collection is active. Both side-panel hosts are available on Collection and Settings; their contents remain empty states.

[`AppSettingsService`](../../src/app/app-settings-service.ts) owns the committed immutable [`AppSettings`](../../src/app/app-settings.ts) value: an optional Pipelines root and the default audio preference for new single-clip playback (off initially). Settings owns edit/busy/feedback UI; the [`Electron adapter`](../../src/adapters/electron/electron-app-settings-service.ts) validates unknown IPC responses. [`AppSettingsStore`](../../electron/app-settings-store.cjs) reads version-1 `app-settings.json` beneath Electron userData and serializes atomic temp-file/rename saves. Invalid/unreadable settings fall back to defaults with an Activity diagnostic; failed writes preserve the committed value. Native folder cancellation saves nothing. The configured root does not reload or mutate `PipelineSession` and does not yet drive discovery. Startup settings load completes before a pipeline becomes available. Zoom samples the audio preference for each new video; its local toggle stays local and the grid remains muted. See [`settings.spec.ts`](../../tests/e2e/settings.spec.ts) for isolated-profile restart, working-session, audio and failure/recovery coverage.


[`FoldablePanelController`](../../src/ui/foldable-panel-controller.ts) owns each panel's folded state, ARIA/inert state, focus transfer and transition completion. Its generation token rejects stale completions after reversal. CSS owns 240px/36px panel widths and 240/280ms closing/opening timing; reduced motion completes immediately. The shell measures destination central width and wrapped command height once, prepares the active screen's layout, and emits one settled callback after all moving panels finish. Panel state is session-local; there is no pipeline discovery or clip-lock implementation here.

`AppController` composes these controls and suppresses intermediate grid ResizeObserver work while the workspace moves. [`ClipCollectionGridController`](../../src/ui/clip-collection-grid-controller.ts) opts into `coordinateWorkspaceLayout` in production: `beginWorkspaceResize` calculates the destination once and interpolates existing cards' positions/sizes; `endWorkspaceResize` reconciles actual bounds. Grid metric/current-column bookkeeping remains inside the grid controller. Normal allocated width excludes root padding; the original CSS-grid renderer remains available for other callers and fullscreen. Fullscreen clears positioned card geometry and hides both panels, then restores their prior states on exit. No player-control changes belong to this flow. Tests: `foldable-panel-controller.spec.ts`, `application-shell-controller.spec.ts`, grid integration tests and [`panels.spec.ts`](../../tests/e2e/panels.spec.ts). Electron scenarios run with one Playwright worker because native windows share desktop focus and pointer state.

### Global Utilities and Shortcut Help

[`GlobalUtilityCoordinator`](../../src/ui/global-utility-coordinator.ts) owns the single anchored `globalUtilityHost`, exclusive utility visibility, trigger ARIA, focus transfer/restoration, outside-pointer/focus dismissal and capture-phase Escape handling. Visibility changes synchronously; only the entrance opacity animates, and replacement/close cancels that animation. It uses the existing DOM with no production component dependency. Keyboard shortcuts and Activity and Errors are its two callers; `ActivityIndicatorControl.requestPanelOpen` transfers trigger/open ownership to the coordinator while preserving standalone usage. Error auto-open is suppressed during dialogs, Save as Collection, collection-conflict resolution, Zoom and fullscreen so existing protected interactions retain focus. The status indicator and history still record the error.

[`KeyboardMapControl`](../../src/ui/keyboard-map-control.ts) renders read-only semantic keycaps, active-screen context, an empty-screen state and `Global` shortcuts. The shell's `onScreenChange` refreshes context without coupling it to bounds/animation callbacks. Collection descriptors live beside handlers in `app-keydown-handler.ts` and `fullscreen-session.ts`; global utility Escape is described beside its handler. No remapping or new open-help shortcut exists. The former inline Collection interaction hint has been removed at the user's request. Tests: `global-utility-coordinator.spec.ts`, `keyboard-map-control.spec.ts`, and [`utilities.spec.ts`](../../tests/e2e/utilities.spec.ts).

### Activity and Errors

[`ActivityIndicatorControl`](../../src/ui/activity-indicator-control.ts) remains the single session-history owner and preserves `show`, `showProgress`, `showSuccess` and string-only `showError` callers. Errors additionally carry affected-operation/recovery text, optional technical details and an optional retry capability supplied by the caller. Stable error ids support explicit resolution. Retention keeps the newest 50 non-error/resolved entries plus every unresolved error; bulk clear preserves unresolved errors, while each error offers explicit dismissal. No notification database or production dependency is added.

The control owns history keyboard navigation, native wheel scrolling without scrollbar chrome, detail expansion and local copy/retry feedback. The application injects clipboard writing directly; failures stay inside the entry. Settings supplies a retry that reapplies only the failed preference against the current committed settings, returning a typed failure to the existing entry. Folder/collection/video-edit errors provide available context without automatically replaying destructive operations. Tests: `activity-indicator-control.spec.ts`, `settings-screen.spec.ts`, app-controller integration protection checks and [`activity.spec.ts`](../../tests/e2e/activity.spec.ts).

### Folder Load

Read these first:

1. [`electron/preload.cjs`](../../electron/preload.cjs)
2. [`src/adapters/electron/electron-file-system-service.ts`](../../src/adapters/electron/electron-file-system-service.ts)
3. [`src/app/app-controller.ts`](../../src/app/app-controller.ts)
4. [`src/business-logic/PipelineFactory.ts`](../../src/business-logic/PipelineFactory.ts)
5. [`src/domain/pipeline.ts`](../../src/domain/pipeline.ts)

Flow:

1. the renderer asks the preload bridge to pick a folder,
2. Electron main enumerates top-level files from the chosen folder and returns lightweight metadata plus collection-file text and video media URLs,
3. the renderer-facing filesystem service converts those entries into renderer-safe file-like objects,
4. `PipelineFactory.buildPipeline(...)` classifies top-level videos and `.txt` collection files, then builds the durable `Pipeline`,
5. the initial active selection is pipeline mode, and `PipelineSession.loadPipeline(...)` materializes a runtime `ClipSequence` over canonical clips, creating generated ids only for video files not yet represented by a runtime `Clip`,
6. collection selection uses `Pipeline.getCollectionByFilename(...)` plus `PipelineSession.materializeSelection(...)` / `activateSelection(...)` to re-materialize a runtime `ClipSequence` from the chosen `Collection` against the current pipeline's canonical clips,
7. the grid controller renders that runtime sequence and owns card DOM, selection UI, drag/drop, media-element lifecycle, and card-video metadata capture.

### Selection Switching and Persistence

Read these first:

1. [`src/domain/pipeline.ts`](../../src/domain/pipeline.ts)
2. [`src/domain/collection.ts`](../../src/domain/collection.ts)
3. [`src/adapters/electron/electron-file-system-service.ts`](../../src/adapters/electron/electron-file-system-service.ts)
4. [`src/app/app-controller.ts`](../../src/app/app-controller.ts)

Flow:

1. `Pipeline` owns the current folder's available video files, canonical runtime clips, and saved collections,
2. `PipelineSession` owns the active selection; `activeCollection === null` means pipeline mode,
3. switching selections re-materializes a runtime `ClipSequence` through `PipelineSession`, which delegates to `Pipeline.materializePipeline(...)` or `Pipeline.materializeCollection(...)` and reuses canonical `Clip` objects so loaded metadata survives view switches,
4. saving an existing collection writes the active `ClipSequence` back to that collection's backing file,
5. saving from pipeline view creates a new `Collection`; the pipeline view itself is never persisted,
6. add-to-collection, save, and physical delete flows are orchestrated in [`src/app/app-controller.ts`](../../src/app/app-controller.ts): `Pipeline` owns the durable in-memory mutation rules, `PipelineSession` owns active-sequence state and dirty tracking, and the controller performs the raw collection-file writes through the filesystem service,
7. remove-from-view is only a collection-view behavior; in pipeline view, delete routes to physical deletion from disk.

### Grid Interaction, Zoom, and Fullscreen

Read these first:

1. [`src/ui/clip-collection-grid-controller.ts`](../../src/ui/clip-collection-grid-controller.ts)
2. [`src/ui/zoom-overlay-controller.ts`](../../src/ui/zoom-overlay-controller.ts)
3. [`src/ui/context-menu-controller.ts`](../../src/ui/context-menu-controller.ts)
4. [`src/app/fullscreen-session.ts`](../../src/app/fullscreen-session.ts)
5. [`src/ui/display-layout-rules.ts`](../../src/ui/display-layout-rules.ts)
6. [`src/app/app-controller.ts`](../../src/app/app-controller.ts)

Flow:

1. the grid controller owns selection state, card rendering, reorder drag/drop, and metadata updates,
2. Electron-backed videos render from `file://` media sources when present, falling back to blob URLs only when needed in renderer tests,
3. rendered card videos populate `Clip` duration and intrinsic dimensions through `loadedmetadata`; `GridVideoMetadataTracker` tracks active-sequence metadata completion/failure so the normal grid can perform at most one metadata-based correction relayout,
4. `ClipCollectionGridController` owns a per-loaded-pipeline grid-view cache keyed by pipeline view or collection filename; switching views reuses cached, still-mounted grid/card/video DOM when the ordered clip ids still match, with inactive grids kept invisible and out of flow, while app-controller only supplies view keys and invalidates views after sequence membership/order changes,
5. `DisplayLayoutRules` owns normal and fullscreen grid calculations; normal scoring maximizes expected contained video area using known clip dimensions with a deterministic fallback aspect ratio,
6. reorder emits ordered clip ids back to the app controller, which delegates active `ClipSequence` mutation and dirty-state tracking to `PipelineSession`,
7. zoom is clip-centric at the app level but the overlay stays media-source-oriented and now exposes a right-click seam for zoom-only edit actions,
8. the toolbar activity indicator replaces the old footer toast and is now the shared surface for load/save/delete/edit messages,
9. fullscreen is coordinated by `FullscreenSession`, using grid layout rules plus fullscreen adapters.

### Video Edit Flow

Read these first:

1. [`src/business-logic/video-edit-catalog.ts`](../../src/business-logic/video-edit-catalog.ts)
2. [`src/business-logic/clip-editor.ts`](../../src/business-logic/clip-editor.ts)
3. [`src/app/zoom-video-edit-workflow.ts`](../../src/app/zoom-video-edit-workflow.ts)
4. [`src/adapters/electron/electron-video-edit-service.ts`](../../src/adapters/electron/electron-video-edit-service.ts)
5. [`electron/video-edit-runtime.cjs`](../../electron/video-edit-runtime.cjs)
6. [`src/app/app-controller.ts`](../../src/app/app-controller.ts)

Flow:

1. zoom mode opens a context menu via [`src/ui/zoom-edit-menu-control.ts`](../../src/ui/zoom-edit-menu-control.ts),
2. the app controller resolves the current zoomed `Clip` and passes `{ edit, sourceClip, folderSession }` to `ZoomVideoEditWorkflow`,
3. `ZoomVideoEditWorkflow` guards concurrent edits, delegates execution to `ClipEditor`, and emits started/created/failed/finished callbacks,
4. `ClipEditor` derives the preferred `[base]-looped.mp4` filename and hands the request to the Electron-backed video-edit service,
5. the trusted runtime resolves `ffmpeg` through [`tools/ffmpeg/current-binary.json`](../../tools/ffmpeg/current-binary.json), chooses a collision-free destination, runs the loopify command, and returns folder-entry metadata,
6. app-controller callbacks convert that metadata back into a renderer file, ask `PipelineSession` to insert the created clip into pipeline or collection mode, reselect the new clip, update status/toolbar, and reopen zoom.

## Where To Look By Task

1. Change how the TypeScript build, strict-check coverage, or runtime entry works:
   Start with [`package.json`](../../package.json), [`tsconfig.build.json`](../../tsconfig.build.json), [`tsconfig.strict-src.json`](../../tsconfig.strict-src.json), and [`index.html`](../../index.html).
2. Change how folders, files, save, append, or delete interact with the desktop runtime:
   Start with [`src/adapters/electron/electron-file-system-service.ts`](../../src/adapters/electron/electron-file-system-service.ts), [`electron/preload.cjs`](../../electron/preload.cjs), and [`electron/main.cjs`](../../electron/main.cjs).
3. Change how videos and collection files are discovered, classified, or turned into a pipeline:
   Start with [`src/business-logic/PipelineFactory.ts`](../../src/business-logic/PipelineFactory.ts).
4. Change how a selected pipeline or collection is materialized into the runtime working sequence:
   Start with [`src/domain/pipeline.ts`](../../src/domain/pipeline.ts) and [`src/domain/collection.ts`](../../src/domain/collection.ts).
5. Change runtime sequence mutation rules, add-to-collection logic, or delete semantics:
   Start with [`src/domain/clip-sequence.ts`](../../src/domain/clip-sequence.ts), [`src/domain/pipeline.ts`](../../src/domain/pipeline.ts), and the orchestration in [`src/app/app-controller.ts`](../../src/app/app-controller.ts).
6. Change loaded pipeline selection, generated runtime clip ids, or dirty-state behavior:
   Start with [`src/app/pipeline-session.ts`](../../src/app/pipeline-session.ts) and its use in [`src/app/app-controller.ts`](../../src/app/app-controller.ts).
7. Change grid rendering, selection, reorder, or per-card behavior:
   Start with [`src/ui/clip-collection-grid-controller.ts`](../../src/ui/clip-collection-grid-controller.ts). For metadata-complete relayout behavior, also read [`src/ui/grid-video-metadata-tracker.ts`](../../src/ui/grid-video-metadata-tracker.ts) and [`src/ui/display-layout-rules.ts`](../../src/ui/display-layout-rules.ts).
8. Change zoom or context menu behavior:
   Start with [`src/ui/zoom-overlay-controller.ts`](../../src/ui/zoom-overlay-controller.ts), [`src/ui/context-menu-controller.ts`](../../src/ui/context-menu-controller.ts), and the handlers in [`src/app/app-controller.ts`](../../src/app/app-controller.ts).
9. Change built-in video editing or ffmpeg execution:
   Start with [`src/business-logic/video-edit-catalog.ts`](../../src/business-logic/video-edit-catalog.ts), [`src/business-logic/clip-editor.ts`](../../src/business-logic/clip-editor.ts), [`src/app/zoom-video-edit-workflow.ts`](../../src/app/zoom-video-edit-workflow.ts), [`src/adapters/electron/electron-video-edit-service.ts`](../../src/adapters/electron/electron-video-edit-service.ts), and [`electron/video-edit-runtime.cjs`](../../electron/video-edit-runtime.cjs).
10. Change fullscreen behavior:
   Start with [`src/app/fullscreen-session.ts`](../../src/app/fullscreen-session.ts) and [`src/ui/display-layout-rules.ts`](../../src/ui/display-layout-rules.ts).
11. Change orchestration across multiple subsystems:
    Start with [`src/app/app-controller.ts`](../../src/app/app-controller.ts). Expect the change to touch several lower-level classes and helpers as well.
12. Review why a module is still non-OO:
    Start with [`docs/documentation/object-oriented-exception-register.md`](../../docs/documentation/object-oriented-exception-register.md).
13. Change Electron e2e coverage:
    Start with [`tests/e2e/scenarios.spec.ts`](../../tests/e2e/scenarios.spec.ts) and [`playwright.config.mjs`](../../playwright.config.mjs).

## Risky Seams

1. [`src/app/app-controller.ts`](../../src/app/app-controller.ts) is still the largest composition hotspot. Changes here can easily spread across loading, selection switching, persistence, dialogs, zoom, context menus, and fullscreen.
2. [`src/ui/clip-collection-grid-controller.ts`](../../src/ui/clip-collection-grid-controller.ts) owns DOM rendering, selection, drag/drop, and media-element sources. Changes can affect both UI behavior and lifecycle cleanup.
3. [`electron/preload.cjs`](../../electron/preload.cjs) and [`electron/main.cjs`](../../electron/main.cjs) define the desktop trust boundary. Over-broad IPC or preload exposure is the main architecture risk in this runtime.
4. [`src/app/fullscreen-session.ts`](../../src/app/fullscreen-session.ts) owns fullscreen timers and input while the grid owns cancelable media rotation. Exit, view replacement and disposal must cancel pending ended listeners.
5. The current view contract is intentionally split: `Pipeline` and `Collection` are durable models, while `PipelineSession` owns the active mutable `ClipSequence` working copy. Changes here can silently break dirty-state tracking, save enablement, and delete semantics.
6. The TypeScript migration now has strict authored-source coverage enforced by `npm run typecheck` through [`tsconfig.strict-src.json`](../../tsconfig.strict-src.json). Authored TypeScript under `src/` should not use `// @ts-nocheck`; the remaining unchecked runtime bridge is the CommonJS Electron shell under [`electron/`](../../electron/), which is intentionally outside this strict source config for now.

## Validation Map

1. Domain and focused business logic:
   [`tests/unit/clip-models.spec.ts`](../../tests/unit/clip-models.spec.ts), [`tests/unit/business-logic.spec.ts`](../../tests/unit/business-logic.spec.ts), [`tests/unit/pipeline-selection.spec.ts`](../../tests/unit/pipeline-selection.spec.ts), [`tests/unit/state.spec.ts`](../../tests/unit/state.spec.ts)
2. UI controller and orchestration wiring:
   [`tests/integration/app/app-controller.spec.ts`](../../tests/integration/app/app-controller.spec.ts), UI integration specs under [`tests/integration/ui/`](../../tests/integration/ui/)
3. Electron-visible behavior and high-confidence regressions:
   [`tests/e2e/scenarios.spec.ts`](../../tests/e2e/scenarios.spec.ts), including the real `Loopify` fixture under [`tests/e2e/fixtures/video-edit/`](../../tests/e2e/fixtures/video-edit/)

If a change crosses multiple subsystems, the end-to-end suite is usually the safest final check.

## Knowledge Base Rules

`docs/agent-docs/` is intentionally small. Do not create deeper docs lightly.

Create a deeper doc only if at least one is true:

1. reading the doc is materially cheaper in context than reading the relevant code,
2. the doc records assumptions, rationale, or constraints that are hard to infer from code and tests alone.

Do not create a deeper doc just because a subsystem is complex.

At the time of this update, the main deeper architectural companion for this refactor is [`docs/documentation/object-oriented-exception-register.md`](../../docs/documentation/object-oriented-exception-register.md). Add other deeper docs only when they clear the bar above.

When deciding whether to update this map, use the rules in [`.agents/skills/doc-update/SKILL.md`](../../.agents/skills/doc-update/SKILL.md).


### Shell remediation verification (2026-09-09)

[`ShortcutDescriptor`](../../src/ui/app-screen.ts) represents optional explicit groups and alternative complete key sequences; each sequence is a chord. [`KeyboardMapControl`](../../src/ui/keyboard-map-control.ts) renders these as static keycaps, while KeyboardMapControl owns its Close button and requests dismissal through [`GlobalUtilityCoordinator`](../../src/ui/global-utility-coordinator.ts). Activity owns visible status text, accessible name and unresolved counts; errors override ongoing status, and an operation failure ends its progress state. The shell uses local inline icons and existing CSS/controller ownership without a new dependency. See the [remediation verification](../research/application-shell-ux-remediation-verification.md) for current visual evidence and manual-QA boundaries.

### Shell component boundaries (ownership correction)

`CollectionScreen` coordinates initial focus through `focusSelectedClip()` on the grid and `focusBrowse()` on the toolbar. It does not query child markup or calculate grid padding. `ClipCollectionGridController` owns selected-card focus and reads its allocated container height minus current vertical padding. Its existing optional height provider remains available to standalone callers.

`FoldablePanelController.targetWidth` owns the interpretation of panel state and sizing CSS; the shell sums those public measurements. Screen roots, command surfaces, utility panels and triggers are explicit mounting/visibility contracts, not permission to inspect descendants. Keyboard and Activity controls handle their own Close buttons and call injected close requests. The coordinator handles exclusivity, outer-surface visibility, placement and focus return. Fullscreen button rendering belongs to `MainToolbarControl`; the fullscreen session reports state through an injected callback. Activity auto-open asks Zoom, Save and Conflict controllers about their state; the remaining generic open-dialog query detects the browser dialog surface rather than a component's private selectors.


### Encapsulation corrections (2026-09-10)

Grid ownership includes normal/fullscreen DOM layout, visibility buffers and rotation completion. `rotateVisibleClip()` switches intact cards using visibility and CSS order; sources, metadata callbacks and canonical IDs stay together, and the outgoing visual slot is retained. `cancelRotation()` removes the pending listener and restores looping; restore/render/invalidation/disposal invoke it. `fsApplySlots(slots)` receives a value instead of a shared state bag. The composition root no longer obtains grid descendants for layout; `DomRendererAdapter` and the raw grid getter were removed. Pure grid calculations remain injectable, as does standalone height allocation.

The grid's implementation fields/helpers, dialog/menu fields, metadata tracker state, Zoom DOM and adapter dependencies are private. Public callbacks carry semantic selection/point data, not cards. Explicit outer mounting/visibility surfaces remain legitimate contracts. These are TypeScript encapsulation boundaries, not a security sandbox against arbitrary JavaScript reflection.

`PipelineSession.hasDirtyClipSequenceChanges` compares the current sequence to the saved collection or pipeline every read; mutation through a shared sequence cannot leave a stale flag. Canonical mutable Clip identities remain shared deliberately. `Clip` and `Pipeline` snapshot File extension metadata; the frozen File retains Blob behavior, and Clip derives its source from that one snapshot. External input/returned metadata mutation cannot split source identity. Desktop-path edit contracts remain an explicit Windows-first tradeoff, rather than an implicit private-state dependency.

Acceptance and remaining scope: [encapsulation correction verification](../research/encapsulation-fixes-verification.md). The historical review is a before-state inventory, not a current list of open defects.


### Edit callback recovery (2026-09-10)

`ZoomVideoEditWorkflow` guarantees running-state reset and a finishing notification even when lifecycle callbacks throw. Callback failures propagate as `VideoEditNotificationError`, retaining the actual edit result (null if editing never began) and all notification errors. The app reports created output separately from edit failure and preserves technical details; it does not automatically repeat disk operations. See [verification and playback assessment](../research/editing-recovery-and-playback-assessment.md). Zoom now reports active-video playback failures through `onPlaybackFailure({ clipId, name, error })`. Zoom owns attempt generations and deduplication; closed/replaced/superseded attempts and rejections after a playing event are ignored. The app presents Activity recovery guidance and records native error details. Background grid diagnostics retain their existing behavior.
