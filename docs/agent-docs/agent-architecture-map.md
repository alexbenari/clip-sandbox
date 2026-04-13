# Agent Architecture Map

Last verified: 2026-04-13

Verified against:

- `index.html`
- `app.js`
- `electron/main.cjs`
- `electron/preload.cjs`
- `src/app/*`
- `src/adapters/electron/*`
- `src/adapters/browser/fullscreen-adapter.js`
- `src/business-logic/*`
- `src/domain/*`
- `src/ui/*`
- `tests/unit/*`
- `tests/integration/*`
- `tests/e2e/scenarios.spec.js`
- `package.json`

This is the canonical entrypoint for agent orientation. Read this before planning substantial work. Use it to narrow where to look. Do not treat it as an exhaustive walkthrough.

## Table of Contents

1. [Purpose](#purpose)
2. [Stable Concepts](#stable-concepts)
3. [Architecture Axioms](#architecture-axioms)
4. [When This Doc Changes](#when-this-doc-changes)
5. [System Shape](#system-shape)
6. [Core Runtime Flows](#core-runtime-flows)
7. [Where To Look By Task](#where-to-look-by-task)
8. [Risky Seams](#risky-seams)
9. [Validation Map](#validation-map)
10. [Knowledge Base Rules](#knowledge-base-rules)

## Purpose

Clip Sandbox is a local Electron desktop app for reviewing video clips from one selected folder at a time. It treats top-level `.txt` files as saved collections and lets the user:

1. browse clips in a responsive grid,
2. switch between collections,
3. reorder or subset clips,
4. save or create collections,
5. add selected clips to another collection,
6. delete selected clips from disk,
7. zoom one clip,
8. enter fullscreen review mode.

The renderer remains plain ES modules plus DOM APIs. There is still no frontend framework and no backend service. Electron replaces the old browser-plus-static-server runtime.

## Stable Concepts

These concepts are worth knowing before reading code:

1. `Clip` in [`src/domain/clip.js`](../../src/domain/clip.js): runtime clip object with generated id, a renderer-side file-like object for identity, an optional explicit media source, and optional duration.
2. `ClipCollection` in [`src/domain/clip-collection.js`](../../src/domain/clip-collection.js): runtime ordered collection of `Clip` objects used by the grid and mutation flows.
3. `ClipCollectionContent` in [`src/domain/clip-collection-content.js`](../../src/domain/clip-collection-content.js): persisted collection description backed by ordered clip names and optional filename.
4. `ClipCollectionInventory` in [`src/domain/clip-collection-inventory.js`](../../src/domain/clip-collection-inventory.js): folder-level registry of videos plus saved/default collection descriptions.
5. `folderSession` in [`src/adapters/electron/electron-file-system-service.js`](../../src/adapters/electron/electron-file-system-service.js): direct-access desktop folder session backed by an absolute folder path.
6. `clipSandboxDesktop` in [`electron/preload.cjs`](../../electron/preload.cjs): preload-exposed desktop API used by the renderer-facing filesystem service.

The important split is still runtime collection vs persisted collection description:

1. runtime UI works with `Clip` and `ClipCollection`,
2. persistence and collection inventory work with `ClipCollectionContent` and `ClipCollectionInventory`.

## Architecture Axioms

These are normative defaults for future work. Do not violate them without a concrete reason and user approval.

1. Keep the renderer framework-free unless a larger architecture decision is approved.
2. Keep [`src/app/app-controller.js`](../../src/app/app-controller.js) as the composition root and orchestration layer, not the place for new domain rules or reusable UI internals.
3. Keep durable collection state in domain models and inventory objects, not in DOM order or DOM-selected state.
4. Keep Electron main/preload and local filesystem behavior behind adapters or services. Do not leak raw Electron or Node APIs broadly into renderer code.
5. Keep reusable UI behavior in focused controllers under [`src/ui/`](../../src/ui/), even when the app controller wires them together.
6. The shipped app now assumes direct-access desktop folder sessions. The old read-only browser fallback is not part of the current product model.
7. Treat `docs/agent-docs/` as the canonical agent-facing architecture knowledge base. Historical specs and plans are not canonical onboarding material.

## When This Doc Changes

Update this map when durable structure changes, not when implementation details churn.

Update it when:

1. new concepts, classes, modules, or subsystems become important for orientation,
2. existing module boundaries or ownership lines change,
3. underlying assumptions change,
4. new substantial features add new architectural areas,
5. infrastructure changes alter how the app is built, deployed, or validated,
6. agents need different routing guidance to find the right code.

Do not update it for:

1. algorithm swaps inside an existing boundary,
2. bug fixes or edge-case fixes that do not change architecture,
3. performance tuning inside an existing design,
4. UX styling or look-and-feel changes,
5. local refactors that preserve the same concepts and ownership boundaries.

## System Shape

Start here for the current ownership map:

1. Electron shell: [`electron/main.cjs`](../../electron/main.cjs), [`electron/preload.cjs`](../../electron/preload.cjs)
2. App orchestration: [`src/app/app-controller.js`](../../src/app/app-controller.js), [`src/app/app-session-state.js`](../../src/app/app-session-state.js), [`src/app/fullscreen-session.js`](../../src/app/fullscreen-session.js), [`src/app/event-binding.js`](../../src/app/event-binding.js)
3. Desktop/runtime boundary: [`src/adapters/electron/electron-file-system-service.js`](../../src/adapters/electron/electron-file-system-service.js), browser-only fullscreen and DOM adapters under [`src/adapters/browser/`](../../src/adapters/browser/)
4. Load and persistence workflows: [`src/business-logic/clip-pipeline-loader.js`](../../src/business-logic/clip-pipeline-loader.js), [`src/business-logic/load-clips.js`](../../src/business-logic/load-clips.js), [`src/business-logic/load-collection-inventory.js`](../../src/business-logic/load-collection-inventory.js), [`src/business-logic/load-collection.js`](../../src/business-logic/load-collection.js), [`src/business-logic/persist-collection-content.js`](../../src/business-logic/persist-collection-content.js), [`src/business-logic/collection-manager.js`](../../src/business-logic/collection-manager.js), [`src/business-logic/clip-pipeline.js`](../../src/business-logic/clip-pipeline.js)
5. Domain models and invariants: [`src/domain/clip.js`](../../src/domain/clip.js), [`src/domain/clip-collection.js`](../../src/domain/clip-collection.js), [`src/domain/clip-collection-content.js`](../../src/domain/clip-collection-content.js), [`src/domain/clip-collection-inventory.js`](../../src/domain/clip-collection-inventory.js), [`src/domain/collection-ref.js`](../../src/domain/collection-ref.js), [`src/domain/collection-description-validator.js`](../../src/domain/collection-description-validator.js)
6. UI controllers: [`src/ui/clip-collection-grid-controller.js`](../../src/ui/clip-collection-grid-controller.js), [`src/ui/zoom-overlay-controller.js`](../../src/ui/zoom-overlay-controller.js), [`src/ui/display-layout-rules.js`](../../src/ui/display-layout-rules.js), [`src/ui/order-menu-controller.js`](../../src/ui/order-menu-controller.js), dialog controllers in [`src/ui/`](../../src/ui/)
7. Static shell and bootstrap: [`index.html`](../../index.html), [`app.js`](../../app.js)
8. Desktop runtime docs and scripts: [`package.json`](../../package.json), [`docs/documentation/windows-deployment.md`](../../docs/documentation/windows-deployment.md)

## Core Runtime Flows

### Folder Load

Read these first:

1. [`electron/preload.cjs`](../../electron/preload.cjs)
2. [`src/adapters/electron/electron-file-system-service.js`](../../src/adapters/electron/electron-file-system-service.js)
3. [`src/app/app-controller.js`](../../src/app/app-controller.js)
4. [`src/business-logic/clip-pipeline-loader.js`](../../src/business-logic/clip-pipeline-loader.js)
5. [`src/business-logic/load-collection-inventory.js`](../../src/business-logic/load-collection-inventory.js)
6. [`src/business-logic/load-collection.js`](../../src/business-logic/load-collection.js)

Flow:

1. the renderer asks the preload bridge to pick a folder,
2. Electron main enumerates top-level files from the chosen folder and returns lightweight metadata plus collection-file text and video media URLs,
3. the renderer-facing filesystem service converts those entries into renderer-safe file-like objects,
4. `ClipPipelineLoader.loadPipeline(...)` builds a `ClipCollectionInventory` from top-level videos and top-level `.txt` collection files,
5. the default collection description is materialized into a runtime `ClipCollection` of `Clip` objects with generated ids,
6. the grid controller renders that runtime collection and owns card DOM, selection UI, drag/drop, and media-element lifecycle.

### Collection Switching and Persistence

Read these first:

1. [`src/domain/clip-collection-inventory.js`](../../src/domain/clip-collection-inventory.js)
2. [`src/business-logic/clip-pipeline-loader.js`](../../src/business-logic/clip-pipeline-loader.js)
3. [`src/business-logic/persist-collection-content.js`](../../src/business-logic/persist-collection-content.js)
4. [`src/business-logic/collection-manager.js`](../../src/business-logic/collection-manager.js)
5. [`src/adapters/electron/electron-file-system-service.js`](../../src/adapters/electron/electron-file-system-service.js)
6. [`src/app/app-controller.js`](../../src/app/app-controller.js)

Flow:

1. `ClipCollectionInventory` owns the persisted collection descriptions available for the current folder,
2. switching collections re-materializes a runtime `ClipCollection` from inventory content plus the available video files,
3. saving converts the runtime collection back into `ClipCollectionContent`,
4. persistence writes directly through the Electron-backed filesystem service,
5. add-to-collection and delete-from-disk flows also update persisted collection content through business-logic modules rather than through UI-only state.

### Grid Interaction, Zoom, and Fullscreen

Read these first:

1. [`src/ui/clip-collection-grid-controller.js`](../../src/ui/clip-collection-grid-controller.js)
2. [`src/ui/zoom-overlay-controller.js`](../../src/ui/zoom-overlay-controller.js)
3. [`src/app/fullscreen-session.js`](../../src/app/fullscreen-session.js)
4. [`src/ui/display-layout-rules.js`](../../src/ui/display-layout-rules.js)
5. [`src/app/app-controller.js`](../../src/app/app-controller.js)

Flow:

1. the grid controller owns selection state, card rendering, reorder drag/drop, and metadata updates,
2. Electron-backed videos render from `file://` media sources when present, falling back to blob URLs only when needed in renderer tests,
3. reorder emits ordered clip ids back to the app controller, which updates the runtime collection and dirty-state tracking,
4. zoom is clip-centric at the app level but the overlay stays media-source-oriented,
5. fullscreen is coordinated by `createFullscreenSession(...)`, using grid layout rules plus fullscreen adapters.

## Where To Look By Task

Use this section to avoid broad codebase reads.

1. Change how folders, files, save, append, or delete interact with the desktop runtime:
   Start with [`src/adapters/electron/electron-file-system-service.js`](../../src/adapters/electron/electron-file-system-service.js), [`electron/preload.cjs`](../../electron/preload.cjs), and [`electron/main.cjs`](../../electron/main.cjs).
2. Change how Electron window creation or preload exposure works:
   Start with [`electron/main.cjs`](../../electron/main.cjs) and [`electron/preload.cjs`](../../electron/preload.cjs).
3. Change how videos and collection files are discovered or classified:
   Start with [`src/business-logic/load-clips.js`](../../src/business-logic/load-clips.js).
4. Change how collection files are parsed into runtime collections:
   Start with [`src/business-logic/load-collection-inventory.js`](../../src/business-logic/load-collection-inventory.js), [`src/business-logic/load-collection.js`](../../src/business-logic/load-collection.js), and [`src/domain/clip-collection-inventory.js`](../../src/domain/clip-collection-inventory.js).
5. Change runtime collection mutation rules:
   Start with [`src/domain/clip-collection.js`](../../src/domain/clip-collection.js), [`src/business-logic/collection-manager.js`](../../src/business-logic/collection-manager.js), and [`src/business-logic/clip-pipeline.js`](../../src/business-logic/clip-pipeline.js).
6. Change grid rendering, selection, reorder, or per-card behavior:
   Start with [`src/ui/clip-collection-grid-controller.js`](../../src/ui/clip-collection-grid-controller.js).
7. Change zoom behavior:
   Start with [`src/ui/zoom-overlay-controller.js`](../../src/ui/zoom-overlay-controller.js) and the zoom handling in [`src/app/app-controller.js`](../../src/app/app-controller.js).
8. Change fullscreen behavior:
   Start with [`src/app/fullscreen-session.js`](../../src/app/fullscreen-session.js) and [`src/ui/display-layout-rules.js`](../../src/ui/display-layout-rules.js).
9. Change orchestration across multiple subsystems:
   Start with [`src/app/app-controller.js`](../../src/app/app-controller.js). Expect the change to touch several lower-level modules as well.
10. Change Electron e2e coverage:
   Start with [`tests/e2e/scenarios.spec.js`](../../tests/e2e/scenarios.spec.js) and [`playwright.config.mjs`](../../playwright.config.mjs).

## Risky Seams

These areas deserve extra care because they cross boundaries or carry more state.

1. [`src/app/app-controller.js`](../../src/app/app-controller.js) is still the largest composition hotspot. Changes here can easily spread across loading, persistence, dialogs, zoom, and fullscreen.
2. [`src/ui/clip-collection-grid-controller.js`](../../src/ui/clip-collection-grid-controller.js) owns DOM rendering, selection, drag/drop, and media-element sources. Changes can affect both UI behavior and lifecycle cleanup.
3. [`electron/preload.cjs`](../../electron/preload.cjs) and [`electron/main.cjs`](../../electron/main.cjs) define the desktop trust boundary. Over-broad IPC or preload exposure is the main architecture risk in this runtime.
4. [`src/app/fullscreen-session.js`](../../src/app/fullscreen-session.js) is stateful and interacts with live DOM/video elements, making regressions more likely than in pure modules.
5. The current clip contract is intentionally hybrid: renderer code still prefers `File`-like objects for names and collection text, but video playback depends on Electron-provided media URLs. Changes here can break both tests and runtime if they assume one representation everywhere.

## Validation Map

Use the smallest layer that can prove the behavior.

1. Domain and focused business logic:
   [`tests/unit/clip-models.spec.js`](../../tests/unit/clip-models.spec.js), [`tests/unit/business-logic.spec.js`](../../tests/unit/business-logic.spec.js), [`tests/unit/collection-manager.spec.js`](../../tests/unit/collection-manager.spec.js), [`tests/unit/clip-pipeline.spec.js`](../../tests/unit/clip-pipeline.spec.js)
2. UI controller and orchestration wiring:
   [`tests/integration/app/app-controller.spec.js`](../../tests/integration/app/app-controller.spec.js), UI integration specs under [`tests/integration/ui/`](../../tests/integration/ui/)
3. Electron-visible behavior and high-confidence regressions:
   [`tests/e2e/scenarios.spec.js`](../../tests/e2e/scenarios.spec.js)
If a change crosses multiple subsystems, the end-to-end suite is usually the safest final check.

## Knowledge Base Rules

`docs/agent-docs/` is intentionally small. Do not create deeper docs lightly.

Create a deeper doc only if at least one is true:

1. reading the doc is materially cheaper in context than reading the relevant code,
2. the doc records assumptions, rationale, or constraints that are hard to infer from code and tests alone.

Do not create a deeper doc just because a subsystem is complex.

At the time of this update there are no deeper design docs under `docs/agent-docs/`. Add them only when they clear the bar above.

When deciding whether to update this map, use the rules in [`.agents/skills/doc-update/SKILL.md`](../../.agents/skills/doc-update/SKILL.md).
