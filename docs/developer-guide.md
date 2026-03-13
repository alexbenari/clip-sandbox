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
- [`src/domain`](/C:/dev/clip-sandbox/src/domain): pure rules and calculations (`clip-rules`, `layout-rules`, `order-rules`).
- [`src/business-logic`](/C:/dev/clip-sandbox/src/business-logic): orchestration flows (`load-clips`, `save-order`, `remove-clip`, `toggle-titles`, `fullscreen-session`).
- [`src/state`](/C:/dev/clip-sandbox/src/state): app state factory and mutators.
- [`src/ui`](/C:/dev/clip-sandbox/src/ui): DOM-facing controllers and view helpers (`events`, `layout-controller`, `drag-drop-controller`, `order-file-controller`, `order-menu-controller`, `dom-factory`, `view-model`).
- [`src/adapters/browser`](/C:/dev/clip-sandbox/src/adapters/browser): browser API wrappers (file system, fullscreen, clock, DOM rendering).
- [`src/app/bootstrap.js`](/C:/dev/clip-sandbox/src/app/bootstrap.js): composition root that wires dependencies and event handlers.

## Architecture Overview
The app follows a functional layered structure:
1. Domain: deterministic logic, no DOM and no browser API usage.
2. Business logic: orchestration of user actions using domain rules and injected adapters.
3. UI/controllers: DOM event handling and user interaction coordination.
4. Adapters: thin wrappers around browser APIs and side effects.
5. Bootstrap: constructs state and composes all modules.

This keeps behavior testable while staying framework-free.

## Ordered Collection Model
The app now distinguishes between three concepts:
1. `folder contents`: all supported video files in the selected folder.
2. `current working collection`: the ordered subset currently shown in the grid and saved to disk.
3. `collection file`: a plain-text file that defines an explicit ordered collection.

Loading a folder creates an implicit full-folder collection. Loading a collection file can replace that with a subset collection. Reorder and delete actions then mutate the current working collection from the UI.

## Collection UI (Current)
- Toolbar uses a `Collection` menu trigger (`#orderMenuBtn`) with submenu actions:
  - `Load Collection` (`#loadOrderBtn`)
  - `Save Collection` (`#saveBtn`)
- Click/tap opens the menu via [`src/ui/order-menu-controller.js`](/C:/dev/clip-sandbox/src/ui/order-menu-controller.js) and supports keyboard navigation:
  - `Enter`/`Space` to open/close from trigger.
  - Arrow navigation between `Load Collection` and `Save Collection`.
  - `Escape` to close and return focus to the trigger.
- Missing collection entries are handled by an inline conflict panel in [`index.html`](/C:/dev/clip-sandbox/index.html), not by alert/confirm dialogs.

## State and Rendering Rules
[`src/state/app-state.js`](/C:/dev/clip-sandbox/src/state/app-state.js) now tracks:
- `folderFiles` and `folderFileNames` for the selected folder.
- `activeCollectionNames` for the current working collection.
- `pendingCollectionConflict` for a missing-entry decision that is waiting for user input.

Important rule: the DOM is a rendering of the current collection state, not the saved model itself. UI interactions such as drag reorder and delete update the active collection state, and save operations serialize that state.

## Composition Root
[`src/app/bootstrap.js`](/C:/dev/clip-sandbox/src/app/bootstrap.js) is the integration point:
- caches DOM elements once,
- creates app state via `createAppState`,
- loads folder files and seeds the implicit collection,
- analyzes collection files against `state.folderFileNames`,
- rebuilds the grid from `state.activeCollectionNames`,
- binds conflict-panel actions and control/global events,
- adapts browser APIs through injected adapter functions.

## Testing Strategy
- Unit/integration (Vitest):
  - collection analysis and save behavior,
  - UI controllers in isolation (for example [`tests/integration/ui/order-file-controller.spec.js`](/C:/dev/clip-sandbox/tests/integration/ui/order-file-controller.spec.js)).
- E2E (Playwright):
  - full user workflows in [`tests/e2e/scenarios.spec.js`](/C:/dev/clip-sandbox/tests/e2e/scenarios.spec.js), including subset collection load, missing-entry decisions, collection save, and menu behavior.

## Common Commands
- `npm run unit`
- `npm run e2e`
- `npm run test:all`
- `npm run e2e:headed`

## Extension Notes
- Add pure collection comparison rules in `src/domain` first where possible.
- Keep browser APIs in `src/adapters/browser` instead of calling them directly from business logic.
- If you add new collection UI states, prefer app-owned surfaces in `index.html` plus controller/view-model logic rather than browser dialogs.
- Keep save behavior tied to `activeCollectionNames`, not to scraping the current DOM at save time.
