# Agent Architecture Map

Last verified: 2026-04-13

Verified against:

- `index.html`
- `app.js`
- `src/app/*`
- `src/adapters/browser/*`
- `src/business-logic/*`
- `src/domain/*`
- `src/ui/*`
- `tests/unit/*`
- `tests/integration/*`
- `tests/e2e/scenarios.spec.js`
- `deployment/*`

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

Clip Sandbox is a browser-native local video review app. It loads top-level video files from a chosen folder, treats top-level `.txt` files as saved collections, and lets the user:

1. browse clips in a responsive grid,
2. switch between collections,
3. reorder or subset clips,
4. save or create collections,
5. add selected clips to another collection,
6. delete selected clips from disk when the app has read-write folder access,
7. zoom one clip,
8. enter fullscreen review mode.

The runtime is plain ES modules plus browser APIs. There is no framework and no backend.

## Stable Concepts

These concepts are worth knowing before reading code:

1. `Clip` in [`src/domain/clip.js`](../../src/domain/clip.js): runtime clip object with generated id, underlying `File`, and optional duration.
2. `ClipCollection` in [`src/domain/clip-collection.js`](../../src/domain/clip-collection.js): runtime ordered collection of `Clip` objects used by the grid and mutation flows.
3. `ClipCollectionContent` in [`src/domain/clip-collection-content.js`](../../src/domain/clip-collection-content.js): persisted collection description backed by ordered clip names and optional filename.
4. `ClipCollectionInventory` in [`src/domain/clip-collection-inventory.js`](../../src/domain/clip-collection-inventory.js): folder-level registry of videos plus saved/default collection descriptions.
5. `folderSession` in [`src/adapters/browser/browser-file-system-service.js`](../../src/adapters/browser/browser-file-system-service.js): access-mode wrapper that distinguishes read-only file-list usage from read-write directory-handle usage.

The important split is runtime collection vs persisted collection description:

1. runtime UI works with `Clip` and `ClipCollection`,
2. persistence and collection inventory work with `ClipCollectionContent` and `ClipCollectionInventory`.

## Architecture Axioms

These are normative defaults for future work. Do not violate them without a concrete reason and user approval.

1. Keep the app browser-native and framework-free unless a larger architecture decision is approved.
2. Keep [`src/app/app-controller.js`](../../src/app/app-controller.js) as the composition root and orchestration layer, not the place for new domain rules or reusable UI internals.
3. Keep durable collection state in domain models and inventory objects, not in DOM order or DOM-selected state.
4. Keep browser file-system and fullscreen behavior behind adapters or services under [`src/adapters/browser/`](../../src/adapters/browser/).
5. Keep reusable UI behavior in focused controllers under [`src/ui/`](../../src/ui/), even when the app controller wires them together.
6. Preserve the read-write vs read-only session distinction. Direct disk mutation is allowed only when the folder session is read-write.
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

1. App orchestration: [`src/app/app-controller.js`](../../src/app/app-controller.js), [`src/app/app-session-state.js`](../../src/app/app-session-state.js), [`src/app/fullscreen-session.js`](../../src/app/fullscreen-session.js), [`src/app/event-binding.js`](../../src/app/event-binding.js)
2. Browser boundary: [`src/adapters/browser/browser-file-system-service.js`](../../src/adapters/browser/browser-file-system-service.js), [`src/adapters/browser/file-system-adapter.js`](../../src/adapters/browser/file-system-adapter.js), [`src/adapters/browser/fullscreen-adapter.js`](../../src/adapters/browser/fullscreen-adapter.js), [`src/adapters/browser/dom-renderer-adapter.js`](../../src/adapters/browser/dom-renderer-adapter.js)
3. Load and persistence workflows: [`src/business-logic/clip-pipeline-loader.js`](../../src/business-logic/clip-pipeline-loader.js), [`src/business-logic/load-clips.js`](../../src/business-logic/load-clips.js), [`src/business-logic/load-collection-inventory.js`](../../src/business-logic/load-collection-inventory.js), [`src/business-logic/load-collection.js`](../../src/business-logic/load-collection.js), [`src/business-logic/persist-collection-content.js`](../../src/business-logic/persist-collection-content.js), [`src/business-logic/collection-manager.js`](../../src/business-logic/collection-manager.js), [`src/business-logic/clip-pipeline.js`](../../src/business-logic/clip-pipeline.js)
4. Domain models and invariants: [`src/domain/clip.js`](../../src/domain/clip.js), [`src/domain/clip-collection.js`](../../src/domain/clip-collection.js), [`src/domain/clip-collection-content.js`](../../src/domain/clip-collection-content.js), [`src/domain/clip-collection-inventory.js`](../../src/domain/clip-collection-inventory.js), [`src/domain/collection-ref.js`](../../src/domain/collection-ref.js), [`src/domain/collection-description-validator.js`](../../src/domain/collection-description-validator.js)
5. UI controllers: [`src/ui/clip-collection-grid-controller.js`](../../src/ui/clip-collection-grid-controller.js), [`src/ui/zoom-overlay-controller.js`](../../src/ui/zoom-overlay-controller.js), [`src/ui/display-layout-rules.js`](../../src/ui/display-layout-rules.js), [`src/ui/order-menu-controller.js`](../../src/ui/order-menu-controller.js), dialog controllers in [`src/ui/`](../../src/ui/)
6. Static shell and bootstrap: [`index.html`](../../index.html), [`app.js`](../../app.js)
7. Windows deployment: [`deployment/`](../../deployment/), [`tests/integration/deployment/deploy-script.spec.js`](../../tests/integration/deployment/deploy-script.spec.js)

## Core Runtime Flows

### Folder Load

Read these first:

1. [`src/app/app-controller.js`](../../src/app/app-controller.js)
2. [`src/adapters/browser/browser-file-system-service.js`](../../src/adapters/browser/browser-file-system-service.js)
3. [`src/business-logic/clip-pipeline-loader.js`](../../src/business-logic/clip-pipeline-loader.js)
4. [`src/business-logic/load-collection-inventory.js`](../../src/business-logic/load-collection-inventory.js)
5. [`src/business-logic/load-collection.js`](../../src/business-logic/load-collection.js)
6. [`src/ui/clip-collection-grid-controller.js`](../../src/ui/clip-collection-grid-controller.js)

Flow:

1. the app obtains either a read-write directory handle or a read-only file list via the browser file-system service,
2. `ClipPipelineLoader.loadPipeline(...)` builds a `ClipCollectionInventory` from top-level videos and top-level `.txt` collection files,
3. the default collection description is materialized into a runtime `ClipCollection` of `Clip` objects with generated ids,
4. the grid controller renders that runtime collection and owns card DOM, selection UI, drag/drop, and object-URL lifecycle.

### Collection Switching and Persistence

Read these first:

1. [`src/domain/clip-collection-inventory.js`](../../src/domain/clip-collection-inventory.js)
2. [`src/business-logic/clip-pipeline-loader.js`](../../src/business-logic/clip-pipeline-loader.js)
3. [`src/business-logic/persist-collection-content.js`](../../src/business-logic/persist-collection-content.js)
4. [`src/business-logic/collection-manager.js`](../../src/business-logic/collection-manager.js)
5. [`src/app/app-controller.js`](../../src/app/app-controller.js)

Flow:

1. `ClipCollectionInventory` owns the persisted collection descriptions available for the current folder,
2. switching collections re-materializes a runtime `ClipCollection` from inventory content plus the available video files,
3. saving converts the runtime collection back into `ClipCollectionContent`,
4. persistence writes directly when the session is read-write, otherwise it falls back to download,
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
2. reorder emits ordered clip ids back to the app controller, which updates the runtime collection and dirty-state tracking,
3. zoom is clip-centric at the app level but the overlay stays media-source-oriented,
4. fullscreen is coordinated by `createFullscreenSession(...)`, using grid layout rules plus fullscreen adapters.

## Where To Look By Task

Use this section to avoid broad codebase reads.

1. Change how folders, files, save, append, or delete interact with the browser:
   Start with [`src/adapters/browser/browser-file-system-service.js`](../../src/adapters/browser/browser-file-system-service.js) and [`src/adapters/browser/file-system-adapter.js`](../../src/adapters/browser/file-system-adapter.js).
2. Change how videos and collection files are discovered or classified:
   Start with [`src/business-logic/load-clips.js`](../../src/business-logic/load-clips.js).
3. Change how collection files are parsed into runtime collections:
   Start with [`src/business-logic/load-collection-inventory.js`](../../src/business-logic/load-collection-inventory.js), [`src/business-logic/load-collection.js`](../../src/business-logic/load-collection.js), and [`src/domain/clip-collection-inventory.js`](../../src/domain/clip-collection-inventory.js).
4. Change runtime collection mutation rules:
   Start with [`src/domain/clip-collection.js`](../../src/domain/clip-collection.js), [`src/business-logic/collection-manager.js`](../../src/business-logic/collection-manager.js), and [`src/business-logic/clip-pipeline.js`](../../src/business-logic/clip-pipeline.js).
5. Change grid rendering, selection, reorder, or per-card behavior:
   Start with [`src/ui/clip-collection-grid-controller.js`](../../src/ui/clip-collection-grid-controller.js).
6. Change zoom behavior:
   Start with [`src/ui/zoom-overlay-controller.js`](../../src/ui/zoom-overlay-controller.js) and the zoom handling in [`src/app/app-controller.js`](../../src/app/app-controller.js).
7. Change fullscreen behavior:
   Start with [`src/app/fullscreen-session.js`](../../src/app/fullscreen-session.js) and [`src/ui/display-layout-rules.js`](../../src/ui/display-layout-rules.js).
8. Change orchestration across multiple subsystems:
   Start with [`src/app/app-controller.js`](../../src/app/app-controller.js). Expect the change to touch several lower-level modules as well.
9. Change Windows packaging or launch behavior:
   Start with [`deployment/deploy.ps1`](../../deployment/deploy.ps1), [`deployment/launch.ps1`](../../deployment/launch.ps1), and their integration tests.

## Risky Seams

These areas deserve extra care because they cross boundaries or carry more state.

1. [`src/app/app-controller.js`](../../src/app/app-controller.js) is still the largest composition hotspot. Changes here can easily spread across loading, persistence, dialogs, zoom, and fullscreen.
2. [`src/ui/clip-collection-grid-controller.js`](../../src/ui/clip-collection-grid-controller.js) owns DOM rendering, selection, drag/drop, and object URLs. Changes can affect both UI behavior and lifecycle cleanup.
3. [`src/app/fullscreen-session.js`](../../src/app/fullscreen-session.js) is stateful and interacts with live DOM/video elements, making regressions more likely than in pure modules.
4. Persistence behavior depends on `folderSession.accessMode`. A change that forgets the read-only vs read-write distinction can silently break save/delete semantics.

## Validation Map

Use the smallest layer that can prove the behavior.

1. Domain and focused business logic:
   [`tests/unit/clip-models.spec.js`](../../tests/unit/clip-models.spec.js), [`tests/unit/business-logic.spec.js`](../../tests/unit/business-logic.spec.js), [`tests/unit/collection-manager.spec.js`](../../tests/unit/collection-manager.spec.js), [`tests/unit/clip-pipeline.spec.js`](../../tests/unit/clip-pipeline.spec.js)
2. UI controller and orchestration wiring:
   [`tests/integration/app/app-controller.spec.js`](../../tests/integration/app/app-controller.spec.js), UI integration specs under [`tests/integration/ui/`](../../tests/integration/ui/)
3. Browser-visible behavior and high-confidence regressions:
   [`tests/e2e/scenarios.spec.js`](../../tests/e2e/scenarios.spec.js)
4. Windows deployment:
   [`tests/integration/deployment/deploy-script.spec.js`](../../tests/integration/deployment/deploy-script.spec.js)

If a change crosses multiple subsystems, the end-to-end suite is usually the safest final check.

## Knowledge Base Rules

`docs/agent-docs/` is intentionally small. Do not create deeper docs lightly.

Create a deeper doc only if at least one is true:

1. reading the doc is materially cheaper in context than reading the relevant code,
2. the doc records assumptions, rationale, or constraints that are hard to infer from code and tests alone.

Do not create a deeper doc just because a subsystem is complex.

At the time of this update there are no deeper design docs under `docs/agent-docs/`. Add them only when they clear the bar above.

When deciding whether to update this map, use the rules in [`.agents/skills/doc-update/SKILL.md`](../../.agents/skills/doc-update/SKILL.md).
