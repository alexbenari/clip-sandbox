# Introduce First-Class Clip, Collection, and Grid Boundaries

## Why this matters

The app already supports loading clips, displaying an ordered collection, reordering clips, zooming one clip, saving collections, and switching into fullscreen. But today those behaviors are implemented across a mix of state arrays, DOM datasets, and grid-child order. That makes clip identity and collection identity harder to reason about, and it makes future refactors risky because the DOM is still acting as part of the model.

This plan refactors the architecture so the app has explicit clip and collection models plus a dedicated grid controller boundary, while preserving existing user-visible behavior. It implements the approved spec in [docs/specs/clip-collection-grid-architecture-spec.md](/C:/dev/clip-sandbox/docs/specs/clip-collection-grid-architecture-spec.md).

## Progress

- [x] (2026-03-14 23:16Z) Approved feature spec recorded in `docs/specs/clip-collection-grid-architecture-spec.md`.
- [x] (2026-03-14 23:16Z) Execution-plan direction fixed: start with E2E safety review, then introduce `Clip`, `ClipCollection`, and `ClipCollectionGrid` in slices rather than as a big-bang rewrite.
- [x] (2026-03-15 08:51+02:00) Reviewed refactor-sensitive E2E coverage and confirmed the existing browser suite already covered the critical load, reorder, delete, save/load, zoom, and fullscreen behaviors; no new baseline scenarios were required before implementation.
- [x] (2026-03-15 09:02+02:00) Ran the pre-refactor full regression suite successfully to establish a behavioral baseline before structural changes.
- [x] (2026-03-15 10:41+02:00) Introduced first-class `Clip` and mutable `ClipCollection` models and moved app state onto clip/collection identity.
- [x] (2026-03-15 10:58+02:00) Introduced `ClipCollectionGrid` as the owner of card rendering, selection UI, drag/drop, and object URL lifecycle.
- [x] (2026-03-15 11:14+02:00) Moved zoom, delete, save/load, and fullscreen integration onto clip/collection identity instead of thumb DOM identity.
- [x] (2026-03-15 11:35+02:00) Removed obsolete DOM-as-model plumbing, updated developer documentation, and passed the full regression suite on the refactored architecture.

## Surprises & Discoveries

- Discovery: the repo already has meaningful E2E coverage for many of the behaviors most likely to break during this refactor.
  Evidence: `tests/e2e/scenarios.spec.js` already covers load folder, drag reorder, delete selected clip, collection load, save collection, zoom behavior, fullscreen slot behavior, and fullscreen clip rotation.

- Discovery: the existing E2E coverage was strong enough that the safest first move was to preserve it as the primary regression layer rather than trying to rewrite a large slice of unit tests up front.
  Evidence: the baseline run passed before refactoring, and the same suite continued to pass after the model/grid boundary shift with only targeted unit/integration test updates.

- Discovery: clip identity is still effectively UI-owned today.
  Evidence: `src/ui/dom-factory.js` creates object URLs, stores clip identity in `card.dataset`, and returns DOM cards as the main clip representation used by interaction flows.

- Discovery: current collection order still leaks through the DOM.
  Evidence: `src/app/app-controller.js` has `currentGridNames()` and `syncActiveCollectionFromGrid()` that rebuild collection state from `grid.children` and `dataset.name`.

- Discovery: selection is currently DOM-backed rather than model-backed.
  Evidence: `src/state/app-state.js` stores `selectedThumb`, and `src/ui/drag-drop-controller.js` toggles the `.selected` class on DOM elements directly.

- Discovery: the existing zoom overlay can remain generic even after the app becomes clip-centric.
  Evidence: `src/ui/zoom-overlay-controller.js` already consumes a playable media source and does not depend on the app’s clip shape.

- Discovery: fullscreen teardown needed an explicit grid rerender after the model-centric refactor.
  Evidence: fullscreen mode still swaps DOM nodes into slot containers, so restoring the normal grid reliably after exit was simplest by rerendering `ClipCollectionGrid` from `state.currentCollection` instead of trying to preserve DOM node identity across fullscreen transitions.

## Decision Log

- Decision: use generated runtime ids as clip identity and stop treating DOM nodes as the durable identifier for a clip.
  Rationale: this gives the app a stable identity that survives rerenders and cleanly separates domain model from UI representation.
  Date/Author: 2026-03-14 / Codex

- Decision: keep `File` on the `Clip` model, but keep object URLs out of the pure clip model and in the grid/view layer.
  Rationale: a `File` is the stable browser-level source object for the clip during the session, while object URLs are disposable runtime resources tied to rendered media elements.
  Date/Author: 2026-03-14 / Codex

- Decision: make `ClipCollection` mutable in this refactor.
  Rationale: that matches the current architecture better and avoids turning the refactor into both a boundary shift and an immutability migration at the same time.
  Date/Author: 2026-03-14 / Codex

- Decision: use a full-order replacement API for collection reorder operations instead of drag-gesture-shaped reorder primitives.
  Rationale: the grid should own drag/drop mechanics and emit the authoritative resulting order; the collection model should simply accept the new order.
  Date/Author: 2026-03-14 / Codex

- Decision: the app should become clip-centric for selection and zoom requests, but the reusable zoom overlay itself should remain media-source-oriented rather than depending on the domain `Clip` object directly.
  Rationale: this preserves a clean app architecture without over-coupling the reusable overlay component to one domain model.
  Date/Author: 2026-03-14 / Codex

## Outcomes & Retrospective

The refactor shipped the intended architectural boundary shift:

- a first-class `Clip` model with stable runtime identity,
- a first-class mutable `ClipCollection` model that owns ordered collection contents,
- a `ClipCollectionGrid` controller that owns card rendering, selection UI, drag/drop, and object URL cleanup,
- app orchestration that wires models and controllers together without using the DOM as collection state,
- existing visible behaviors preserved under regression tests.

Implementation outcomes:

- `src/domain/clip-model.js` now creates stable runtime clip records from browser `File` objects.
- `src/domain/clip-collection.js` now owns ordered clip ids, clip lookup, replacement of full order, removal, and ordered-name serialization.
- `src/state/app-state.js` now tracks `selectedClipId`, `folderClips`, and `currentCollection` instead of DOM-backed selection and DOM-mirrored ordering fields.
- `src/ui/clip-collection-grid-controller.js` now owns card rendering, selected clip state, drag/drop reorder emission, and object URL cleanup for rendered cards.
- `src/app/app-controller.js` now orchestrates models and controllers instead of scraping grid DOM order or using selected DOM nodes as the primary source of truth.
- `src/business-logic/fullscreen-session.js` and the zoom-open path were adapted so app-level requests are clip-centric while the reusable zoom overlay remains media-source-oriented.
- `docs/developer-guide.md` now documents the new clip / collection / grid architecture as the supported design.

Validation evidence:

- Baseline before refactor: `npm run test:all` passed.
- Refactor-time verification: `npm run unit` passed with 12 test files and 49 tests.
- Targeted behavioral verification: `npm run e2e -- --grep 'Collection load|Save collection|Drag reorder|Delete selected clip|Zoom mode|Fullscreen'` passed with 21 scenarios.
- Final regression verification: `npm run test:all` passed with 49 unit/integration tests and 32 Playwright scenarios.

Residual follow-up considerations:

- `src/ui/dom-factory.js` is now reduced in scope, but some card-construction detail still exists there and could be folded fully into `ClipCollectionGrid` later if the team wants one fewer UI seam.
- Fullscreen still performs DOM relocation during the active session, which is acceptable for now but remains the most stateful UI path in the app.

## Context and orientation

This repo is a browser-native ES-module application with no framework. The relevant architectural pieces today are spread across several layers.

Key current files:

- `src/state/app-state.js`: session state including `folderFiles`, `activeCollectionNames`, and `selectedThumb`.
- `src/ui/dom-factory.js`: creates clip cards, creates object URLs, and stores clip metadata in DOM datasets.
- `src/ui/drag-drop-controller.js`: owns selection toggling and drag/drop reorder behavior, but currently acts on DOM elements rather than model identities.
- `src/ui/layout-controller.js`: computes and applies grid layout for normal and fullscreen modes.
- `src/business-logic/load-clips.js`: orchestrates adding clips to the grid one file at a time.
- `src/business-logic/save-order.js`: saves ordered clip names to disk or download.
- `src/domain/order-rules.js`: collection-file analysis rules.
- `src/app/app-controller.js`: composition root that currently glues clip loading, collection state, card rendering, zoom, fullscreen, save/load, and DOM synchronization together.
- `src/ui/zoom-overlay-controller.js`: already a dedicated component for zoom overlay behavior and should remain a separate component after the refactor.
- `tests/e2e/scenarios.spec.js`: the highest-confidence regression layer for the refactor because it validates observable behavior instead of internal module boundaries.

Important current data flow for a newcomer:

1. Folder load reads browser `File` objects and stores them in `state.folderFiles`.
2. The app stores collection order separately as `state.activeCollectionNames`.
3. `app-controller.js` rebuilds the grid by matching names back to `File` objects and calling `createThumbCard(...)` from `src/ui/dom-factory.js`.
4. Card selection and drag/drop reorder currently act on DOM elements; collection state is synchronized back from the DOM using `currentGridNames()` and related helpers in `app-controller.js`.
5. Zoom opens from a selected or double-clicked card by reading `dataset.objectUrl` from that DOM node.

Definitions used in this plan:

- `Clip`: one app-level clip object with generated runtime id, filename, browser `File`, and optional duration.
- `ClipCollection`: one mutable ordered collection of clips represented by ordered clip ids plus clip lookup.
- `ClipCollectionGrid`: one UI controller responsible for rendering and interacting with a `ClipCollection`.
- `Object URL`: a temporary browser-generated URL created from a `File` for media playback in `<video>` elements. It must be revoked when no longer needed.

Important constraints:

- The refactor must preserve existing user-visible behavior.
- The zoom overlay should remain reusable and generic.
- Fullscreen layout logic may stay in `src/ui/layout-controller.js` in the first pass.
- The E2E suite should be treated as the main safety net during structural changes.

## Milestone 1 - Lock behavioral safety before refactoring internals

### Scope

Review current E2E coverage, add any missing scenarios for the behaviors most likely to be destabilized, and establish a clean baseline by running the full suite before major structural edits begin.

### Changes

- File: `tests/e2e/scenarios.spec.js`
  Edit: review coverage for the most refactor-sensitive behaviors: load folder, collection load, drag reorder, selection-driven delete, zoom open/close, fullscreen entry/exit, and save behavior.

- File: `tests/e2e/scenarios.spec.js`
  Edit: if any of the above behaviors are only indirectly covered or missing important assertions tied to clip identity and collection order, add focused scenarios before starting structural refactors.

- File: `docs/plans/clip-collection-grid-architecture-exec-plan.md`
  Edit: record any gaps discovered and the additional tests added to close them.

### Validation

- Command: `npm run e2e`
  Expected: the current browser suite passes and provides a baseline for visible behavior before architectural edits start.

- Command: `npm run test:all`
  Expected: the full unit and E2E suite passes before structural work begins.

### Rollback/Containment

If a new E2E test is too brittle, rewrite it to assert a more stable observable outcome. Do not proceed to deeper refactoring with weak coverage for reorder, save/load, zoom, or fullscreen interactions.

## Milestone 2 - Introduce Clip and ClipCollection models

### Scope

Add explicit clip and collection models while keeping the current UI behavior intact. This milestone establishes model identity and collection ownership before touching the grid boundary.

### Changes

- File: `src/domain/clip-model.*`
  Edit: create clip-construction logic that produces a stable runtime id, filename, `File`, and optional duration field from loaded browser files.

- File: `src/domain/clip-collection.*`
  Edit: create a mutable collection model that owns collection name, ordered clip ids, clip lookup, full-order replacement, removal, and ordered-name serialization.

- File: `src/business-logic/load-clips.js`
  Edit: shift load logic toward creating clips and an initial collection model rather than directly adding cards from raw `File` objects.

- File: `src/business-logic/save-order.js`
  Edit: update save behavior so it serializes ordered names from the collection model instead of relying on arrays that are effectively mirrored from DOM state.

- File: `src/state/app-state.js`
  Edit: replace or shrink state fields so collection identity is represented by the new collection model rather than by separate `folderFiles` and `activeCollectionNames` as the primary concept. Keep only the session-level fields that still belong in app state.

- File: `tests/unit/*.spec.js`
  Edit: add focused tests for clip creation, collection order replacement, removal, and ordered-name serialization.

### Validation

- Command: `npm run unit`
  Expected: new domain/model tests pass and existing tests that still reflect valid behavior continue to pass.

- Command: `npm run e2e -- --grep "Load via folder selection|Collection load|Save collection"`
  Expected: folder load, collection-file load, and save flows still behave identically from the user’s perspective.

### Rollback/Containment

If this milestone destabilizes too many UI-facing tests, stop at the point where the explicit models exist but the old UI still reads from adapter functions that preserve the previous shape. Do not mix grid-controller introduction into the same rollback boundary.

## Milestone 3 - Introduce ClipCollectionGrid and absorb card-level UI ownership

### Scope

Create a dedicated grid controller that owns card rendering, selection UI, drag/drop interaction, clip-id-to-element mapping, and object URL lifecycle for rendered clips.

### Changes

- File: `src/ui/clip-collection-grid-controller.*`
  Edit: create the main grid controller for one `ClipCollection`. It should render cards, manage selected clip id, expose update hooks for collection changes, and emit events for selection change, reorder, open request, and remove request.

- File: `src/ui/dom-factory.js`
  Edit: absorb card creation into the new grid controller or reduce this file to a grid-internal helper if a small helper remains useful. Remove its role as a top-level architectural boundary.

- File: `src/ui/drag-drop-controller.js`
  Edit: fold drag/drop and selection behavior into the new grid controller or leave behind only tiny internal utilities if needed. The old standalone controller should cease to be the primary ownership boundary.

- File: `src/ui/layout-controller.js`
  Edit: keep layout math separate if that remains the simplest first-pass design, but adapt its API so the new grid controller can consume it cleanly.

- File: `src/app/app-controller.js`
  Edit: stop creating clip cards directly and stop wiring per-card interactions directly. Instead, create `ClipCollectionGrid`, pass the current collection in, and respond to emitted events.

- File: `tests/integration/ui/*.spec.js`
  Edit: replace or update card-level and drag-drop-oriented tests so they validate the new grid controller boundary rather than the old loose helper/controller split.

### Validation

- Command: `npm run unit`
  Expected: grid-controller tests pass and obsolete DOM-helper tests are either replaced or updated.

- Command: `npm run e2e -- --grep "Drag reorder|Delete selected clip|Zoom mode"`
  Expected: reorder, selection-driven delete, and zoom entry behavior remain unchanged in the browser.

### Rollback/Containment

If grid-controller introduction causes broad regressions, keep the new controller but temporarily delegate some responsibilities to existing helpers behind the controller boundary. Do not revert to bootstrap owning card-level DOM behavior directly.

## Milestone 4 - Move zoom, delete, save/load, and fullscreen integration to clip identity

### Scope

Rewire higher-level app behaviors so they consume clip and collection identity instead of thumb DOM identity or grid-child order.

### Changes

- File: `src/app/app-controller.js`
  Edit: change zoom-open flow to resolve the requested clip from collection/grid identity rather than reading `dataset.objectUrl` from a selected thumb element.

- File: `src/app/app-controller.js`
  Edit: change delete-selected flow to operate on selected clip id and collection removal rather than on a selected DOM element as the primary source of truth.

- File: `src/business-logic/save-order.js`
  Edit: ensure save behavior runs entirely from the collection model and no longer depends on DOM-derived order anywhere in the call path.

- File: `src/business-logic/fullscreen-session.js`
  Edit: adapt fullscreen integration as needed so it cooperates with the new grid/controller boundaries without reintroducing DOM-as-model coupling.

- File: `src/ui/zoom-overlay-controller.js`
  Edit: preserve its generic reusable interface; update only if a small adapter hook is needed, not to couple it to the `Clip` model.

- File: `tests/e2e/scenarios.spec.js`
  Edit: add or refine assertions where needed to prove that zoom, fullscreen, delete, save/load, and collection replacement still work after moving off thumb DOM identity.

### Validation

- Command: `npm run e2e -- --grep "Zoom mode|Fullscreen|Delete selected clip|Collection load|Save collection"`
  Expected: these higher-level flows continue to pass using the new model/controller boundaries.

- Command: `npm run test:all`
  Expected: the full suite passes with no regressions.

### Rollback/Containment

If a specific integration path regresses, isolate the issue with an adapter layer at bootstrap rather than bypassing the new clip/collection model entirely. The end state of this milestone must still remove `selectedThumb` and DOM-derived collection order as primary app concepts.

## Milestone 5 - Remove obsolete plumbing and document the new architecture

### Scope

Finalize the refactor by removing obsolete DOM-as-model paths and updating developer documentation so the new architecture is the documented source of truth.

### Changes

- File: `src/state/app-state.js`
  Edit: remove obsolete fields such as `selectedThumb` and any state that only existed to mirror DOM identity or DOM-derived collection order.

- File: `src/app/app-controller.js`
  Edit: remove helpers such as `currentGridNames()` and `syncActiveCollectionFromGrid()` once the collection model is authoritative.

- File: `docs/developer-guide.md`
  Edit: document the new `Clip`, `ClipCollection`, and `ClipCollectionGrid` boundaries, and describe how zoom and fullscreen integrate with them.

- File: `docs/specs/clip-collection-grid-architecture-spec.md`
  Edit: if any implementation detail had to differ materially from the approved spec, update the spec so it matches the shipped architecture before completion.

- File: `docs/plans/clip-collection-grid-architecture-exec-plan.md`
  Edit: record actual discoveries, decisions, validation evidence, and residual risks.

### Validation

- Command: `npm run test:all`
  Expected: the final full suite passes after obsolete plumbing is removed.

- Command: `npm run e2e`
  Expected: all user-visible behaviors continue to pass after the architectural cleanup.

### Rollback/Containment

If cleanup work reveals hidden dependencies on removed helpers or state fields, restore only the smallest compatibility shim behind the new boundaries. Do not leave the old DOM-as-model pathways as first-class architecture.

