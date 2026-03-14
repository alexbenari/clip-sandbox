# Encapsulate the Zoom Overlay for Reuse and Prove It with a Sandbox Host

## Why this matters

The app already ships a working zoom overlay, but today a second host page cannot reuse it by importing the controller alone because the default zoom styling still lives in `index.html`. That means the real integration contract is split across files and is easy to get wrong.

This plan turns the zoom overlay into a genuinely reusable UI component with built-in default styles, proves that boundary with `sandbox/zoom-demo.html`, and records developer-facing integration guidance so future apps can adopt the component without reverse-engineering the main app shell.

This plan implements the approved spec in [docs/specs/zoom-overlay-reuse-spec.md](/C:/dev/clip-sandbox/docs/specs/zoom-overlay-reuse-spec.md).

## Progress

- [x] (2026-03-14 10:04Z) Approved feature spec recorded in `docs/specs/zoom-overlay-reuse-spec.md`.
- [x] (2026-03-14 10:04Z) Execution-plan direction fixed: the zoom controller owns default styles, `index.html` keeps only the mount root, and `sandbox/zoom-demo.html` is the proof-of-reuse host.
- [x] (2026-03-14 10:08Z) Moved the zoom overlay’s default styles into the controller and verified one-time style injection in controller tests.
- [x] (2026-03-14 10:10Z) Added `sandbox/zoom-demo.html` as a minimal host that imports only the zoom component and opens `sandbox/hand-closes-curtain.mp4` from a button click.
- [x] (2026-03-14 10:10Z) Reconfirmed main-app zoom behavior after removing shell-owned zoom CSS.
- [x] (2026-03-14 10:11Z) Updated developer-facing docs and passed the full unit and Playwright regression suites.

## Surprises & Discoveries

- Discovery: the current controller boundary is already narrow on the JavaScript side.
  Evidence: `src/ui/zoom-overlay-controller.js` currently needs only `mountEl`, `document`, and a `src` passed to `open({ src, name })`.

- Discovery: the missing piece is style ownership, not overlay lifecycle ownership.
  Evidence: the zoom layout rules for `#zoomLayerRoot`, `.zoom-overlay`, `.zoom-frame`, and `.zoom-video` were declared in `index.html`, while DOM creation and video lifecycle were already in `src/ui/zoom-overlay-controller.js`.

- Discovery: the app composition root already treats zoom as a controller-level concern rather than an app-state concern.
  Evidence: `src/app/bootstrap.js` creates the zoom controller from `#zoomLayerRoot`, calls `open({ src, name })`, and uses only `close()` and `isOpen()` for coordination.

- Discovery: the existing test harness can serve the sandbox demo page without new infrastructure.
  Evidence: `playwright.config.mjs` already starts `npx http-server . -p 4173 -c-1`, so `/sandbox/zoom-demo.html` can be exercised under the same static server.

- Discovery: the current developer guide explicitly documented the old ownership split and had to be updated as part of the refactor.
  Evidence: before the change, `docs/developer-guide.md` said `index.html` provided both `#zoomLayerRoot` and the CSS hooks for `.zoom-overlay`, `.zoom-frame`, and `.zoom-video`.

- Discovery: the component boundary held without needing any new public controller methods.
  Evidence: `sandbox/zoom-demo.html` reuses `createZoomOverlayController(...)` through the existing `open`, `close`, and `isOpen` methods only.

## Decision Log
- Decision: the zoom component will install its own default stylesheet automatically instead of requiring an explicit host call.
  Rationale: the approved product direction is “works out of the box”; automatic style installation gives a host the smallest possible contract and makes the demo page a real proof of reuse.
  Date/Author: 2026-03-14 / Codex

- Decision: keep the existing controller API as small as possible unless the prototype reveals a real integration gap.
  Rationale: `open`, `close`, and `isOpen` already cover the app’s orchestration needs; adding speculative API surface would make the component harder to reason about.
  Date/Author: 2026-03-14 / Codex

- Decision: use `sandbox/zoom-demo.html` as a prototype milestone, not a post-hoc demo.
  Rationale: the point of this work is to measure actual reuse friction; the demo host must shape the refactor instead of merely showcasing it.
  Date/Author: 2026-03-14 / Codex

- Decision: leave style customization out of scope for this pass.
  Rationale: default style ownership is the immediate encapsulation problem. A theme or override API should only be added once there is a concrete consumer need.
  Date/Author: 2026-03-14 / Codex

## Outcomes & Retrospective

Shipped outcomes in this execution:

- `src/ui/zoom-overlay-controller.js` now injects the zoom overlay’s default stylesheet once per document and still owns overlay DOM creation, video lifecycle, and outside-click behavior.
- `index.html` now keeps only the `#zoomLayerRoot` mount element; the zoom-specific shell CSS was removed.
- `sandbox/zoom-demo.html` proves that a second host can reuse the component with only a mount node and a button-triggered `open({ src, name })` call.
- `docs/developer-guide.md` now documents the built-in-style contract and points engineers at the sandbox host as the minimal integration example.

Validation evidence collected:

- `npm run unit -- tests/integration/ui/zoom-overlay-controller.spec.js` => 1 file passed, 5 tests passed.
- `npm run e2e -- --grep 'Zoom demo|Zoom mode'` => 6 targeted browser scenarios passed, covering both the sandbox host and the main-app zoom workflows.
- `npm run test:all` => full suite passed, 10 Vitest files / 43 tests and 32 Playwright scenarios.

Residual notes:

- The refactor did not require any new zoom-controller API surface; the existing `open`, `close`, and `isOpen` contract was enough for both hosts.
- Style customization remains intentionally out of scope. The component now has one clear default presentation and can be extended later if a real consumer needs overrides.

## Context and orientation
This repository is a browser-native ES-module app with a thin layered structure and no framework.

Relevant files for this work:

- `index.html`: the main app shell. It now includes only the zoom mount root plus the rest of the app shell markup and non-zoom CSS.
- `src/ui/zoom-overlay-controller.js`: the zoom component controller. It creates the overlay DOM, manages the zoomed video element, and handles outside-click close.
- `src/app/bootstrap.js`: the app composition root. It creates the zoom controller, opens zoom for a selected card, closes zoom on `Escape`, and coordinates zoom with fullscreen.
- `tests/integration/ui/zoom-overlay-controller.spec.js`: isolated DOM-level tests for the controller.
- `tests/e2e/scenarios.spec.js`: browser tests for shipped behavior. It already covers the main app’s zoom workflows.
- `docs/developer-guide.md`: current architecture guide. It now documents the built-in-style contract and the sandbox host integration recipe.
- `sandbox/hand-closes-curtain.mp4`: the sample clip that the new demo host will open.
- `playwright.config.mjs`: Playwright uses `http-server` on `http://127.0.0.1:4173`, which means new static pages under `sandbox/` are automatically reachable in tests.

Current zoom flow for a newcomer:

1. `index.html` renders `<div id="zoomLayerRoot"></div>` near the end of `<body>` and leaves zoom styling to the component.
2. `src/app/bootstrap.js` locates `#zoomLayerRoot` and creates `createZoomOverlayController({ mountEl: zoomLayerRoot, document })`.
3. When the user double-clicks a tile or presses `Z`, `bootstrap.js` passes the selected clip’s object URL into `zoomOverlay.open({ src, name })`.
4. The controller installs its default stylesheet once per document, creates `#zoomOverlay`, `#zoomFrame`, and `#zoomVideo`, starts playback with audio, and removes the DOM on close.

Important constraints for the implementation:

- The refactor must not move zoom state into `src/state/app-state.js`; the controller should keep transient overlay internals local.
- The main app must preserve current zoom behavior, including fullscreen coordination and playback-from-zero behavior.
- The demo host must not import `app.js` or `src/app/bootstrap.js`; if it does, it is not a valid reuse proof.
- The demo host should stay minimal so the integration contract is obvious at a glance.

## Milestone 1 - Prototype component-owned style installation

### Scope

Move default zoom styles into the component layer and prove that the controller can render correctly without host-provided zoom CSS. This is the highest-risk architectural change because it defines the real reuse boundary.

### Changes

- File: `src/ui/zoom-overlay-controller.js`
  Edit: add a one-time style installation path that injects the component’s default stylesheet into `document.head` (or another document-owned location) before the overlay is rendered.

- File: `src/ui/zoom-overlay-controller.js`
  Edit: keep style installation internal to the controller so hosts are not required to call a separate setup function.

- File: `tests/integration/ui/zoom-overlay-controller.spec.js`
  Edit: add assertions for default style injection, one-time style installation across multiple controller instances, and preserved open/replace/close behavior after the style refactor.

- File: `index.html`
  Edit: remove the zoom-specific CSS rules once the controller-owned stylesheet is in place, but keep the mount root `#zoomLayerRoot`.

### Validation

- Command: `npm run unit -- tests/integration/ui/zoom-overlay-controller.spec.js`
  Expected: controller tests pass and verify that one document receives only one copy of the default zoom stylesheet.

- Command: `npm run e2e -- --grep "Zoom mode"`
  Expected: the existing main-app zoom workflows still pass after CSS ownership moves out of `index.html`.

### Rollback/Containment

If style injection causes regressions, revert only the style-ownership refactor by restoring the zoom CSS in `index.html` and removing the new injection path from `src/ui/zoom-overlay-controller.js`. Do not mix unrelated bootstrap or fullscreen changes into this milestone.

## Milestone 2 - Build the sandbox host as the reuse proof

### Scope

Create a minimal standalone page that uses the zoom component directly and nothing from the app bootstrap. This milestone converts the architectural claim into an observable prototype.

### Changes

- File: `sandbox/zoom-demo.html`
  Edit: create a minimal page with a short heading, a `Click to View` button, and a `<div id="zoomLayerRoot"></div>` mount element.

- File: `sandbox/zoom-demo.html`
  Edit: import only `src/ui/zoom-overlay-controller.js` and wire the button to `open({ src: '/sandbox/hand-closes-curtain.mp4', name: 'hand-closes-curtain.mp4' })`.

- File: `tests/e2e/scenarios.spec.js`
  Edit: add a focused scenario that visits `/sandbox/zoom-demo.html`, clicks the button, and asserts that `#zoomOverlay`, `#zoomFrame`, and `#zoomVideo` appear and are usable.

- File: `tests/integration/ui/zoom-overlay-controller.spec.js`
  Edit: add any additional controller assertions discovered while implementing the demo, but keep host-page behavior tests in Playwright rather than overloading jsdom.

### Validation

- Command: `npm run e2e -- --grep "zoom demo|Zoom demo|sandbox zoom"`
  Expected: the demo-host scenario passes and proves that the page can open the sample clip without importing the full app.

- Command: `npm run e2e -- --grep "Zoom mode"`
  Expected: the original main-app zoom scenarios still pass after the sandbox host is added.

### Rollback/Containment

If the sandbox host reveals a hidden dependency on app bootstrap code, stop and remove that dependency from the component rather than papering over it in the demo page. The demo page is allowed to be simple, but it is not allowed to cheat.

## Milestone 3 - Reconfirm main-app integration and remove duplication

### Scope

Cleanly reconnect the main app to the component-owned styles and ensure the shell owns only what it should own: the mount point and orchestration logic.

### Changes

- File: `src/app/bootstrap.js`
  Edit: keep the current orchestration helpers (`openZoomForCard`, `closeZoom`, fullscreen coordination) aligned with the existing controller API after the style refactor. Avoid moving any style or DOM-structure ownership back into bootstrap.

- File: `index.html`
  Edit: verify that the only remaining zoom-specific shell requirement is the `#zoomLayerRoot` mount element and that no duplicate zoom CSS remains.

- File: `tests/unit/app-dom.spec.js`
  Edit: keep or tighten the shell smoke test so it asserts the required mount root still exists.

### Validation

- Command: `npm run unit`
  Expected: all unit and integration tests pass, including the zoom controller tests and any shell-smoke updates.

- Command: `npm run e2e -- --grep "Zoom mode|Fullscreen"`
  Expected: zoom behavior and fullscreen coordination both continue to pass in the main app.

### Rollback/Containment

If regressions appear here, isolate whether they are due to shell markup removal or controller changes. Restore only the minimum shell markup necessary for the main app while keeping the component boundary intact.

## Milestone 4 - Document the integration contract and finish validation

### Scope

Make the reusable boundary explicit in the repo documentation and close the loop with full-suite validation.

### Changes

- File: `docs/developer-guide.md`
  Edit: update the Zoom UI Component section so it states that `src/ui/zoom-overlay-controller.js` owns default styles as well as DOM lifecycle, and that `index.html` now provides only the mount root.

- File: `docs/developer-guide.md`
  Edit: add a short integration recipe for external hosts: create a mount node, create the controller, call `open({ src, name })`, and rely on built-in default styles.

- File: `docs/developer-guide.md`
  Edit: reference `sandbox/zoom-demo.html` as the concrete minimal-host example.

- File: `docs/specs/zoom-overlay-reuse-spec.md`
  Edit: if implementation reveals any material change in host responsibilities, update the spec so it matches reality before considering the work complete.

### Validation

- Command: `npm run test:all`
  Expected: the full unit and Playwright suite passes with no regressions.

- Command: `npm run e2e -- --grep "zoom demo|Zoom mode|Fullscreen"`
  Expected: the demo page, main-app zoom workflows, and fullscreen coordination all pass under the same static-server harness.

### Rollback/Containment

If time pressure appears late in the work, documentation can be tightened in a follow-up only if the runtime behavior and the demo host are already correct and the developer guide still does not misstate the integration contract. The guide must not ship with stale ownership claims.




