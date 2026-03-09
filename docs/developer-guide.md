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
- [`src/business-logic`](/C:/dev/clip-sandbox/src/business-logic): orchestration flows (`load-clips`, `save-order`, `apply-order`, `remove-clip`, `toggle-titles`, `fullscreen-session`).
- [`src/state`](/C:/dev/clip-sandbox/src/state): app state factory and mutators.
- [`src/ui`](/C:/dev/clip-sandbox/src/ui): DOM-facing controllers and view helpers (`events`, `layout-controller`, `drag-drop-controller`, `order-file-controller`, `order-menu-controller`, `dom-factory`, `view-model`).
- [`src/adapters/browser`](/C:/dev/clip-sandbox/src/adapters/browser): browser API wrappers (file system, fullscreen, clock, DOM rendering).
- [`src/app/bootstrap.js`](/C:/dev/clip-sandbox/src/app/bootstrap.js): composition root that wires dependencies and event handlers.

## Architecture Overview
The app follows a functional layered structure:
1. Domain: deterministic logic, no DOM and no browser API usage.
2. Business logic: use-case level flows that compose domain logic + injected adapters.
3. UI/controllers: DOM event handling and user interaction coordination.
4. Adapters: thin wrappers around browser APIs and side effects.
5. Bootstrap: constructs state and composes all modules.

This keeps behavior testable while staying framework-free.

## Ordering UI (Current)
- Toolbar now uses an `Order` menu trigger (`#orderMenuBtn`) with submenu actions:
  - `Load` (`#loadOrderBtn`)
  - `Save` (`#saveBtn`)
- Hover on desktop reveals the submenu via CSS transitions.
- Click/tap opens the menu via [`src/ui/order-menu-controller.js`](/C:/dev/clip-sandbox/src/ui/order-menu-controller.js) and supports keyboard navigation:
  - `Enter`/`Space` to open/close from trigger.
  - Arrow navigation between `Load` and `Save`.
  - `Escape` to close and return focus to the trigger.

## Composition Root
[`src/app/bootstrap.js`](/C:/dev/clip-sandbox/src/app/bootstrap.js) is the integration point:
- Caches DOM elements once.
- Creates app state via `createAppState`.
- Creates controllers (`layout`, `drag-drop`, `order file`, `order menu`, fullscreen session).
- Binds control/global event handlers.
- Adapts browser APIs through injected adapter functions.

## Testing Strategy
- Unit/integration (Vitest):
  - Domain and business logic behavior.
  - UI controllers in isolation (for example [`tests/integration/ui/order-menu-controller.spec.js`](/C:/dev/clip-sandbox/tests/integration/ui/order-menu-controller.spec.js)).
- E2E (Playwright):
  - Full user workflows in [`tests/e2e/scenarios.spec.js`](/C:/dev/clip-sandbox/tests/e2e/scenarios.spec.js), including order menu hover/click/keyboard behavior and load/save flows.

## Common Commands
- `npm run unit`
- `npm run e2e`
- `npm run test:all`
- `npm run e2e:headed`

## Extension Notes
- Add pure rules in `src/domain` first where possible.
- Keep browser APIs in `src/adapters/browser` instead of calling them directly from business logic.
- Add integration tests for new UI controllers before broad E2E expansion.
