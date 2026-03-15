# Clip Sandbox Developer Guide

## Purpose
This guide explains the current browser-only architecture and where to add or change behavior safely.

## Technology Stack
- Runtime: browser-native JavaScript (ES modules), no framework.
- UI shell: static `index.html` + inline CSS.
- Entry point: [`app.js`](/C:/dev/clip-sandbox/app.js) (re-export for backward compatibility) -> [`src/app/bootstrap.js`](/C:/dev/clip-sandbox/src/app/bootstrap.js).
- Tooling: Node.js + npm.
- Unit/integration tests: Vitest + jsdom.
- E2E tests: Playwright (Chromium) with a local static server.

## Project Structure
- [`src/domain`](/C:/dev/clip-sandbox/src/domain): pure rules and model helpers (`clip-model`, `clip-collection`, `clip-rules`, `layout-rules`, `order-rules`).
- [`src/business-logic`](/C:/dev/clip-sandbox/src/business-logic): workflow helpers and feature-specific orchestration (`save-order`, `toggle-titles`, `fullscreen-session`).
- [`src/state`](/C:/dev/clip-sandbox/src/state): app session state (`currentCollection`, `folderClips`, fullscreen state, pending conflict state).
- [`src/ui`](/C:/dev/clip-sandbox/src/ui): DOM-facing controllers and helpers (`clip-collection-grid-controller`, `layout-controller`, `zoom-overlay-controller`, `order-file-controller`, `order-menu-controller`, `dom-factory`, `events`, `view-model`).
- [`src/adapters/browser`](/C:/dev/clip-sandbox/src/adapters/browser): browser API wrappers (file system, fullscreen, clock, DOM rendering).
- [`src/app/bootstrap.js`](/C:/dev/clip-sandbox/src/app/bootstrap.js): composition root that wires models, controllers, and browser adapters.

## Architecture Overview
The app now follows a clearer model/controller split:
1. Domain: clip and collection models plus pure rules.
2. Business logic: save/fullscreen/title-toggle flows using model data.
3. UI/controllers: the collection grid, zoom overlay, order-file controller, and menu controller.
4. Adapters: thin wrappers around browser APIs and side effects.
5. Bootstrap: constructs the app state and composes the whole system.

This keeps clip identity and collection identity out of the DOM while staying framework-free.

## Clip and Collection Model
The app now distinguishes between three related concepts:
1. `folder contents`: all supported clips currently loaded from the chosen folder.
2. `current collection`: the mutable ordered collection currently shown in the grid.
3. `collection file`: a plain-text file describing an explicit ordered collection by filename.

Key model files:
- [`src/domain/clip-model.js`](/C:/dev/clip-sandbox/src/domain/clip-model.js): creates one app-level clip object with runtime id, filename, `File`, and optional duration.
- [`src/domain/clip-collection.js`](/C:/dev/clip-sandbox/src/domain/clip-collection.js): owns ordered clip ids, lookup by id, full-order replacement, removal, and serialization of ordered clip names.

Important rule: the collection model is now the source of truth for current order. The DOM is a rendering of that order, not the model itself.

## Clip Collection Grid
The main grid is implemented as a dedicated UI controller rather than as loose DOM helpers wired directly in bootstrap.

Current shape:
- [`src/ui/clip-collection-grid-controller.js`](/C:/dev/clip-sandbox/src/ui/clip-collection-grid-controller.js) owns:
  - rendering cards from a `ClipCollection`,
  - selection UI by clip id,
  - drag/drop reorder UI,
  - mapping between clip ids and rendered card state,
  - object URL lifecycle for rendered video cards.
- [`src/ui/dom-factory.js`](/C:/dev/clip-sandbox/src/ui/dom-factory.js) remains a small card-creation and label-update helper used by the grid controller.
- [`src/ui/layout-controller.js`](/C:/dev/clip-sandbox/src/ui/layout-controller.js) still owns layout math for normal and fullscreen grid presentation.

Important rule: selection belongs to the grid UI, but app-level coordination uses `selectedClipId`, not a selected DOM node.

## Zoom UI Component
Zoom mode remains a dedicated reusable UI component rather than inline overlay logic in the composition root.

Current shape:
- [`index.html`](/C:/dev/clip-sandbox/index.html) provides only the shell mount point `#zoomLayerRoot`.
- [`src/ui/zoom-overlay-controller.js`](/C:/dev/clip-sandbox/src/ui/zoom-overlay-controller.js) owns default style installation, overlay DOM creation, outside-click close behavior, and the zoomed video element lifecycle.
- [`src/app/bootstrap.js`](/C:/dev/clip-sandbox/src/app/bootstrap.js) handles app-level zoom requests by resolving the selected/requested clip and passing a playable media source into the overlay.
- [`sandbox/zoom-demo.html`](/C:/dev/clip-sandbox/sandbox/zoom-demo.html) remains the minimal-host example for reusing the overlay outside the main app shell.

Integration rule: the app is clip-centric, but the reusable overlay stays media-source-oriented.

## State and Rendering Rules
[`src/state/app-state.js`](/C:/dev/clip-sandbox/src/state/app-state.js) now tracks:
- `folderClips` and `folderClipNames` for the selected folder,
- `currentCollection` for the currently displayed ordered collection,
- `selectedClipId` for app-level coordination with the currently selected clip,
- `pendingCollectionConflict` for missing-entry decisions during collection load,
- fullscreen-only state such as slot count and randomization timers.

Important rules:
- `selectedClipId` is app state; the selected DOM card is not.
- Save behavior should serialize [`clipNamesInOrder(...)`](/C:/dev/clip-sandbox/src/domain/clip-collection.js) from the collection model, not scrape the grid DOM.
- Object URLs are runtime view resources created for rendered cards and revoked when cards are cleared or rerendered.

## Composition Root
[`src/app/bootstrap.js`](/C:/dev/clip-sandbox/src/app/bootstrap.js) is the integration point:
- caches DOM elements once,
- creates app state via `createAppState`,
- loads browser `File` objects and creates `Clip` models,
- creates the mutable current collection,
- creates the `ClipCollectionGrid` from `#grid`,
- creates the zoom overlay controller from `#zoomLayerRoot`,
- analyzes collection files against `state.folderClipNames`,
- updates the collection model when the grid emits reorder or selection events,
- coordinates zoom/fullscreen interactions,
- adapts browser APIs through injected adapter functions.

Important rule: bootstrap should orchestrate models and controllers. It should not own per-card DOM logic or derive collection order from `grid.children`.

## Testing Strategy
- Unit/integration (Vitest):
  - clip and collection model behavior,
  - grid controller behavior,
  - zoom overlay controller behavior,
  - order-file and menu controller behavior.
- E2E (Playwright):
  - full user workflows in [`tests/e2e/scenarios.spec.js`](/C:/dev/clip-sandbox/tests/e2e/scenarios.spec.js), including load, collection replacement, reorder, delete, save, zoom, and fullscreen.

During architecture-heavy work, prefer E2E coverage as the higher-confidence safety net because it validates observable behavior rather than old internal seams.

## Common Commands
- `npm run unit`
- `npm run e2e`
- `npm run test:all`
- `npm run e2e:headed`

## Extension Notes
- Add new model logic in `src/domain` first when possible.
- Keep persistence side effects outside the collection model.
- Keep clip identity stable and model-owned; avoid reintroducing DOM nodes as primary identity.
- Keep object URL lifecycle in the grid/view layer, not in the pure clip model.
- Keep zoom/fullscreen coordination at the app orchestration layer unless fullscreen behavior itself is being redesigned.
