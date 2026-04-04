# Implement Zoom Mode as a Dedicated Grid UI Component

## Why this matters

Users need to inspect a single clip at a larger size without leaving the main grid or entering fullscreen. The shipped behavior must feel like a focused UI component of the order/grid screen: double-click or `Z` opens one clip in a centered overlay, the clip restarts from the beginning with audio, the background grid remains visible and playing, and `Escape` or outside click closes the overlay.

This plan implements zoom mode in a way that matches the approved spec in [zoom-mode-spec.md](/C:/dev/clip-sandbox/specs/zoom-mode-spec.md) while keeping the architecture clear: the zoom overlay is a dedicated UI component owned by its own controller, not ad hoc DOM logic embedded in `app-controller.js`.

## Progress

- [x] (2026-03-14 08:00Z) Approved feature spec recorded in `specs/zoom-mode-spec.md`.
- [x] (2026-03-14 08:20Z) Execution-plan architecture direction fixed: `index.html` provides only a minimal zoom mount root, `src/ui/zoom-overlay-controller.js` owns overlay internals, and `src/app/app-controller.js` only orchestrates the feature.
- [x] (2026-03-14 09:10Z) Added zoom overlay mount root, component CSS, and `src/ui/zoom-overlay-controller.js`.
- [x] (2026-03-14 09:35Z) Wired double-click, `Z`, `Escape`, and fullscreen coordination into the app bootstrap and clip-card interactions.
- [x] (2026-03-14 09:55Z) Added unit/integration and Playwright regression coverage, including the start-from-beginning playback case.
- [x] (2026-03-14 10:05Z) Updated user/developer docs and passed `npm run test:all`.

## Surprises & Discoveries

- Discovery: the current app already has centralized keyboard handling in `src/app/app-controller.js` through `onKeyDown` and `onGlobalKeyDown`.
  Evidence: `src/app/app-controller.js` binds both through `bindGlobalEvents(...)` from `src/ui/events.js`.

- Discovery: clip tiles are created in `src/ui/dom-factory.js` and already own click, drag, and metadata wiring, but they do not currently expose double-click behavior.
  Evidence: `createThumbCard(...)` attaches `click`, `dragstart`, `dragend`, `dragover`, `dragleave`, and `drop` listeners only.

- Discovery: selection state is currently DOM-backed through the selected card element rather than a stable clip identifier.
  Evidence: `state.selectedThumb` in `src/state/app-state.js` stores the selected element, and `createThumbInteractionHandlers(...)` toggles the `.selected` class directly.

- Discovery: double-click semantics were subtly wrong for the new feature because the existing click handler toggled the same card off on the second click.
  Evidence: browser `dblclick` fires after two `click` events, so the selected class would be removed before the zoom-open handler ran unless selection gained an explicit `select only` path.

- Discovery: fullscreen behavior is encapsulated in `src/business-logic/fullscreen-session.js`, so zoom/fullscreen coordination should happen at the app orchestration layer rather than by mixing the two features together.
  Evidence: fullscreen entry, exit, key handling, and slot randomization are all managed inside `createFullscreenSession(...)`.

- Discovery: editable-input gating already exists and should be reused for the `Z` shortcut.
  Evidence: `isEditableTarget(...)` in `src/ui/events.js` is already used in `src/app/app-controller.js` to suppress delete behavior while typing.

## Decision Log

- Decision: represent zoom mode as a dedicated UI component with its own controller module, `src/ui/zoom-overlay-controller.js`.
  Rationale: the zoom overlay is a distinct UI concept with its own lifecycle, DOM, and event handling; keeping it in one controller avoids scattering overlay state and markup across `index.html`, `dom-factory.js`, and `app-controller.js`.
  Date/Author: 2026-03-14 / Codex

- Decision: `index.html` should provide only a minimal mount root such as `#zoomLayerRoot`, while the controller creates and destroys all internal overlay DOM lazily.
  Rationale: this expresses zoom as part of the app shell without hard-coding its internals into the page structure.
  Date/Author: 2026-03-14 / Codex

- Decision: keep zoom state local to the zoom overlay controller unless cross-feature coordination requires a minimal query method such as `isOpen()`.
  Rationale: app state currently tracks durable session concepts like selection, folder contents, and fullscreen slots; zoom overlay internals are transient UI state and should not be promoted into global state without need.
  Date/Author: 2026-03-14 / Codex

- Decision: if fullscreen is requested while zoom is open, close zoom first and then continue into fullscreen.
  Rationale: fullscreen already owns the whole-screen presentation model, and the approved product behavior is explicit about preventing zoom from coexisting with fullscreen.
  Date/Author: 2026-03-14 / Codex

- Decision: preserve the background grid and its existing muted looping playback while zoom is open.
  Rationale: this is part of the approved product model and prevents zoom mode from becoming a modal navigation state.
  Date/Author: 2026-03-14 / Codex

## Outcomes & Retrospective

Shipped outcomes in this execution:
- Added a dedicated zoom overlay UI component rooted at `#zoomLayerRoot` and owned by `src/ui/zoom-overlay-controller.js`.
- Double-click now opens zoom for a clip and leaves that clip selected.
- Pressing `Z` opens zoom for the selected clip, while `Z` with no selection is a no-op.
- Zoomed playback opens from the beginning with audio enabled and leaves the background grid visible and playing.
- `Escape` and outside click both close zoom.
- Entering fullscreen closes zoom first.
- User and developer docs now describe zoom mode and the new UI-component architecture.

Validation evidence collected:
- `npm run unit` => 10 files passed, 41 tests passed.
- `npm run e2e -- --grep "Zoom mode|Fullscreen"` => 8 targeted browser scenarios passed.
- `npm run test:all` => full suite passed, 31 E2E scenarios passed.

Residual notes:
- Zoom state stayed local to the overlay controller; no additional global app state was introduced for the feature.
- The implementation keeps zoom outside fullscreen in this pass, matching the approved spec.

## Context and orientation

This repository is a browser-only local clip-review app with a small layered structure:

- `index.html`: app shell markup and CSS.
- `app.js`: compatibility entry point that re-exports app bootstrap.
- `src/app/app-controller.js`: composition root that locates DOM elements, creates controllers, and wires user actions.
- `src/ui/dom-factory.js`: creates clip tile DOM and updates per-card labels/duration.
- `src/ui/drag-drop-controller.js`: selection and drag-reorder behavior for grid tiles.
- `src/ui/events.js`: central event-binding helpers and editable-target detection.
- `src/business-logic/fullscreen-session.js`: fullscreen-specific behavior and key handling.
- `src/state/app-state.js`: session state for selection, folder contents, active collection, and fullscreen slot state.
- `tests/integration/ui/*.spec.js`: controller- and DOM-oriented tests.
- `tests/e2e/scenarios.spec.js`: end-to-end behavior coverage using Playwright.

Current zoom-relevant flow:
1. `app-controller.js` loads files and renders cards through `createThumbCard(...)` in `src/ui/dom-factory.js`.
2. Card click delegates to `createThumbInteractionHandlers(...)`, which toggles `state.selectedThumb` and the `.selected` class.
3. Global key events are bound in `src/ui/events.js` and handled in `app-controller.js` plus `fullscreen-session.js`.
4. Fullscreen behavior is active only when `body` has the `fs-active` class and `isFullScreenActive(document)` returns true.

Important constraints for the implementation:
- The app has no frontend framework; all UI work is DOM-based.
- Grid clips use object URLs created in `createThumbCard(...)`; the zoomed clip can reuse those same URLs.
- Grid clips are muted today; zoom mode must explicitly unmute its own video without changing grid behavior.
- `state.selectedThumb` stores a DOM element, so keyboard zoom should resolve clip data from the selected element rather than from a separate clip ID model.

## Milestone 1 - Introduce the zoom overlay component shell

### Scope

Create the structural pieces that express zoom as a dedicated UI component: a mount root in the page shell, component-specific CSS hooks, and a controller module that owns overlay lifecycle and DOM creation.

### Changes

- File: `index.html`
  Edit: add a minimal mount root for the zoom component, such as `<div id="zoomLayerRoot"></div>`, near the end of `<body>`.

- File: `index.html`
  Edit: add CSS for the zoom layer root, transparent full-viewport hit area, centered zoom frame, and responsive sizing. The CSS must not dim the background grid.

- File: `src/ui/zoom-overlay-controller.js`
  Edit: create a new controller module that lazily creates the internal overlay DOM under the mount root and exposes methods such as `open`, `close`, `replace`, `isOpen`, and `destroy` as needed.

- File: `src/ui/zoom-overlay-controller.js`
  Edit: keep component-local state inside the controller, including references to the overlay node, frame node, current video element, and currently open object URL/name.

- File: `tests/integration/ui/zoom-overlay-controller.spec.js`
  Edit: add controller-focused tests for creating the overlay, opening it, replacing the zoomed clip, and closing it cleanly.

### Validation

- Command: `npm run unit -- tests/integration/ui/zoom-overlay-controller.spec.js`
  Expected: the new controller tests pass and verify DOM ownership is isolated to the controller.

### Rollback/Containment

If this milestone fails, remove `src/ui/zoom-overlay-controller.js`, remove the new mount root/CSS from `index.html`, and keep all existing grid/fullscreen behavior unchanged. No existing business logic should depend on the new controller until Milestone 2.

## Milestone 2 - Wire grid interactions and keyboard behavior into zoom

### Scope

Connect the new zoom component to clip selection, double-click, keyboard open/close, and fullscreen coordination without moving overlay internals into `app-controller.js`.

### Changes

- File: `src/ui/dom-factory.js`
  Edit: extend `createThumbCard(...)` to support a dedicated double-click callback without disrupting existing click-to-select and drag behaviors.

- File: `src/ui/drag-drop-controller.js`
  Edit: expose or preserve selection behavior so double-click can ensure the target card becomes selected before zoom opens.

- File: `src/app/app-controller.js`
  Edit: create the zoom overlay controller instance from `#zoomLayerRoot` and add high-level helpers such as `openZoomForCard(card)` and `closeZoom()`.

- File: `src/app/app-controller.js`
  Edit: handle `Z` / `z` in normal grid view only, using `isEditableTarget(...)` to suppress the shortcut while typing and using `state.selectedThumb` as the source clip.

- File: `src/app/app-controller.js`
  Edit: handle `Escape` so it closes zoom before any unrelated behavior that should remain unaffected.

- File: `src/app/app-controller.js`
  Edit: coordinate fullscreen entry so calling fullscreen while zoom is open closes zoom first, then continues into the existing fullscreen flow.

- File: `src/ui/events.js`
  Edit: update event-binding helpers only if the current shape needs to support additional callback wiring cleanly.

- File: `tests/integration/ui/events.spec.js`
  Edit: extend low-level event binding tests if new bindings are added.

- File: `tests/unit/app-dom.spec.js`
  Edit: expand the app DOM smoke test if the new mount root is part of the required shell.

### Validation

- Command: `npm run unit`
  Expected: all unit and integration tests pass, including new zoom-related controller and wiring coverage.

### Rollback/Containment

If this milestone fails, disconnect the controller instantiation and handlers in `app-controller.js` while leaving the controller module and shell mount root in place. Existing click, drag, delete, and fullscreen behavior must continue to work.

## Milestone 3 - Add end-to-end zoom regressions

### Scope

Protect the user-visible zoom workflows with Playwright scenarios, including the mandatory start-from-beginning rule.

### Changes

- File: `tests/e2e/scenarios.spec.js`
  Edit: add scenarios for double-click open, `Z` open from selected clip, `Z` no-op with no selection, `Escape` close, outside-click close, unmuted zoom playback, and preserved background grid rendering.

- File: `tests/e2e/scenarios.spec.js`
  Edit: add a specific playback-reset scenario that advances the zoomed clip, closes it, reopens it, and asserts the reopened zoom session starts from the beginning rather than resuming.

- File: `tests/e2e/scenarios.spec.js`
  Edit: add a scenario that verifies entering fullscreen while zoom is open closes zoom first and does not leave orphaned overlay DOM behind.

### Validation

- Command: `npm run e2e -- --grep "Zoom mode|Fullscreen"`
  Expected: the new zoom scenarios pass consistently in addition to the existing fullscreen behavior.

- Command: `npm run test:all`
  Expected: the entire suite passes with no regressions in existing collection, delete, title-toggle, or fullscreen scenarios.

### Rollback/Containment

If a specific E2E assertion proves too brittle, keep the product behavior and replace the assertion with a more robust observable signal rather than dropping the coverage goal. Do not remove the start-from-beginning regression test; rewrite it until it is stable.

## Milestone 4 - Final UX polish and documentation touch-ups

### Scope

Make the shipped surface coherent by updating any app hints or docs that must mention the new zoom capability.

### Changes

- File: `index.html`
  Edit: update the toolbar hint text if needed so it reflects `double-click` and `Z` zoom behavior without becoming noisy.

- File: `docs/user-guide.md`
  Edit: add a brief description of zoom mode and its entry/exit controls if the app’s user guide is expected to stay current with shipped features.

- File: `docs/developer-guide.md`
  Edit: mention the new zoom overlay controller in the UI-layer overview if the feature introduces a permanent architectural element.

### Validation

- Command: `npm run test:all`
  Expected: documentation or hint updates do not alter runtime behavior and the full suite still passes.

### Rollback/Containment

If schedule pressure is high, runtime code and tests take priority over non-essential guide updates. However, any user-facing in-app hint changed in `index.html` should ship together with the feature.


