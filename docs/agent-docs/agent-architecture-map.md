# Agent Architecture Map

Last verified: 2026-05-14

Verified against:

- `index.html`
- `package.json`
- `tsconfig.base.json`
- `tsconfig.json`
- `tsconfig.build.json`
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

1. `Clip` in [`src/domain/clip.ts`](../../src/domain/clip.ts): canonical runtime clip object with generated id, a renderer-side file-like object for identity, an optional explicit media source, duration, intrinsic video dimensions, and metadata failure state.
2. `ClipSequence` in [`src/domain/clip-sequence.ts`](../../src/domain/clip-sequence.ts): mutable runtime ordered clip list used by the grid, selection, reorder, and transient view state.
3. `Collection` in [`src/domain/collection.ts`](../../src/domain/collection.ts): durable ordered subset of pipeline clip names, optionally backed by a `.txt` file, with collection-specific append/remove/materialization behavior.
4. `Pipeline` in [`src/domain/pipeline.ts`](../../src/domain/pipeline.ts): folder-backed container of all available video files plus zero or more saved `Collection` objects. It owns one canonical runtime `Clip` per active-session video file, explicit `materializePipeline(...)` / `materializeCollection(...)` flows, and in-memory collection/video mutation rules such as `addClipsToCollection(...)` and `removeVideos(...)`.
5. `PipelineSession` in [`src/app/pipeline-session.ts`](../../src/app/pipeline-session.ts): active loaded-pipeline working state. It owns generated clip ids, the selected pipeline/collection sequence, dirty-state comparison, active clip resolution, reorder/remove mutation, and created-clip insertion while keeping the durable `Pipeline` focused on folder contents and saved collections.
6. `AppSessionState` in [`src/app/app-session-state.ts`](../../src/app/app-session-state.ts): class-backed app-shell state for the active folder session and pending selection actions. It does not own loaded pipeline selection state.
7. `FullscreenSession` in [`src/app/fullscreen-session.ts`](../../src/app/fullscreen-session.ts): class-backed fullscreen coordinator for slot layout, title hiding, and randomized fullscreen rotation.
8. `folderSession` in [`src/adapters/electron/electron-file-system-service.ts`](../../src/adapters/electron/electron-file-system-service.ts): direct-access desktop folder session backed by an absolute folder path.
9. `clipSandboxDesktop` in [`electron/preload.cjs`](../../electron/preload.cjs): preload-exposed desktop API used by the renderer-facing filesystem service.
10. `ClipEditor` in [`src/business-logic/clip-editor.ts`](../../src/business-logic/clip-editor.ts): edit request executor that validates requests, derives preferred output filenames, and delegates execution to the runtime editing service.
11. `ZoomVideoEditWorkflow` in [`src/app/zoom-video-edit-workflow.ts`](../../src/app/zoom-video-edit-workflow.ts): app-layer workflow boundary that runs `ClipEditor` for a supplied zoom source clip and emits edit lifecycle callbacks without knowing pipeline, grid, toolbar, or zoom overlay details.
12. `ActivityIndicatorControl` in [`src/ui/activity-indicator-control.ts`](../../src/ui/activity-indicator-control.ts): toolbar status surface that owns progress/success/error state plus recent message history.
13. `video edit runtime` in [`electron/video-edit-runtime.cjs`](../../electron/video-edit-runtime.cjs): trusted-process runner that resolves `ffmpeg`, collision-checks the output path, creates the derived file, and returns folder-entry metadata.

The important split remains durable selection state vs runtime working copy:

1. runtime UI works with `Clip` and `ClipSequence`,
2. active loaded-folder selection state works through `PipelineSession`,
3. durable selection and persistence work with `Pipeline`, `Collection`, and explicit pipeline-mode vs active-collection branching,
4. `Collection` remains filename-based durably, while materialized collection sequences reference canonical `Clip` instances from the active `Pipeline`.

## Architecture Axioms

These are normative defaults for future work. Do not violate them without a concrete reason and user approval.

1. Keep the renderer framework-free unless a larger architecture decision is approved.
2. Keep [`src/app/app-controller.ts`](../../src/app/app-controller.ts) as the composition root and orchestration layer, not the place for new domain rules or reusable UI internals.
3. Keep durable pipeline and collection state in domain models plus explicit active-collection selection state, not in DOM order or DOM-selected state.
4. Prefer explicit pipeline-vs-collection flows when their semantics differ materially. Do not introduce shared protocol layers or generic source ids unless they are buying real simplification.
5. Keep Electron main/preload and local filesystem behavior behind adapters or services. Do not leak raw Electron or Node APIs broadly into renderer code.
6. Keep reusable UI behavior in focused controllers under [`src/ui/`](../../src/ui/), even when the app controller wires them together.
7. Default stateful renderer responsibilities to explicit classes. Keep module-based helpers only when they are genuinely stateless or composition-only, and document the exceptions.
8. Treat [`docs/documentation/object-oriented-exception-register.md`](../../docs/documentation/object-oriented-exception-register.md) as the reviewable record of intentionally non-OO holdouts.
9. Treat `docs/agent-docs/` as the canonical agent-facing architecture knowledge base. Historical specs and plans are not canonical onboarding material.

## System Shape

Start here for the current ownership map:

1. Electron shell: [`electron/main.cjs`](../../electron/main.cjs), [`electron/preload.cjs`](../../electron/preload.cjs)
2. Static shell and emitted runtime bootstrap: [`index.html`](../../index.html) loads [`build/src/app/app-controller.js`](../../build/src/app/app-controller.js) after `npm run build`.
3. TypeScript compiler and runtime setup: [`package.json`](../../package.json), [`tsconfig.base.json`](../../tsconfig.base.json), [`tsconfig.json`](../../tsconfig.json), [`tsconfig.build.json`](../../tsconfig.build.json)
4. App orchestration: [`src/app/app-controller.ts`](../../src/app/app-controller.ts), [`src/app/pipeline-session.ts`](../../src/app/pipeline-session.ts), [`src/app/app-session-state.ts`](../../src/app/app-session-state.ts), [`src/app/fullscreen-session.ts`](../../src/app/fullscreen-session.ts), [`src/app/app-diagnostics.ts`](../../src/app/app-diagnostics.ts), [`src/app/event-binding.ts`](../../src/app/event-binding.ts)
5. Desktop/runtime boundary: class-backed adapters under [`src/adapters/electron/`](../../src/adapters/electron/) and [`src/adapters/browser/`](../../src/adapters/browser/)
6. Load and persistence workflows: [`src/business-logic/PipelineFactory.ts`](../../src/business-logic/PipelineFactory.ts) and the explicit materialization plus mutation methods on [`src/domain/pipeline.ts`](../../src/domain/pipeline.ts). The controller currently performs the raw collection-file writes through the filesystem service.
7. Domain models and invariants: [`src/domain/clip.ts`](../../src/domain/clip.ts), [`src/domain/clip-sequence.ts`](../../src/domain/clip-sequence.ts), [`src/domain/collection.ts`](../../src/domain/collection.ts), [`src/domain/pipeline.ts`](../../src/domain/pipeline.ts), [`src/domain/collection-description-validator.ts`](../../src/domain/collection-description-validator.ts)
8. UI controllers and selector/helpers: [`src/ui/clip-collection-grid-controller.ts`](../../src/ui/clip-collection-grid-controller.ts), [`src/ui/grid-video-metadata-tracker.ts`](../../src/ui/grid-video-metadata-tracker.ts), [`src/ui/zoom-overlay-controller.ts`](../../src/ui/zoom-overlay-controller.ts), [`src/ui/context-menu-controller.ts`](../../src/ui/context-menu-controller.ts), [`src/ui/grid-context-menu-control.ts`](../../src/ui/grid-context-menu-control.ts), [`src/ui/zoom-edit-menu-control.ts`](../../src/ui/zoom-edit-menu-control.ts), [`src/ui/collection-selector-control.ts`](../../src/ui/collection-selector-control.ts), [`src/ui/main-toolbar-control.ts`](../../src/ui/main-toolbar-control.ts), [`src/ui/activity-indicator-control.ts`](../../src/ui/activity-indicator-control.ts), [`src/ui/load-status-control.ts`](../../src/ui/load-status-control.ts), and dialog controllers under [`src/ui/`](../../src/ui/), plus stateless helpers such as [`src/ui/display-layout-rules.ts`](../../src/ui/display-layout-rules.ts)
9. Sandbox demos that mirror the emitted runtime shape: [`sandbox/context-menu-demo.html`](../../sandbox/context-menu-demo.html), [`sandbox/zoom-demo.html`](../../sandbox/zoom-demo.html)

## Core Runtime Flows

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
5. normal grid layout scoring lives in [`src/ui/display-layout-rules.ts`](../../src/ui/display-layout-rules.ts) and maximizes expected contained video area using known clip dimensions with a deterministic fallback aspect ratio,
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

1. Change how the TypeScript build or runtime entry works:
   Start with [`package.json`](../../package.json), [`tsconfig.build.json`](../../tsconfig.build.json), and [`index.html`](../../index.html).
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
4. [`src/app/fullscreen-session.ts`](../../src/app/fullscreen-session.ts) is stateful and interacts with live DOM/video elements, making regressions more likely than in pure modules.
5. The current view contract is intentionally split: `Pipeline` and `Collection` are durable models, while `PipelineSession` owns the active mutable `ClipSequence` working copy. Changes here can silently break dirty-state tracking, save enablement, and delete semantics.
6. The TypeScript migration is currently syntax-first rather than strict-type-first. Many authored `.ts` files still carry `// @ts-nocheck`, so a future tightening pass must treat type errors as real work rather than assumed safety.

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
