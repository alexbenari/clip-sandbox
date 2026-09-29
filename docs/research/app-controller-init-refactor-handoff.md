# AppController `init()` refactor handoff

Status: handoff for a separate refactor, 2026-09-29. This is not an approved execution plan or a record of completed changes to `init()`.

## Goal

Make `AppController.init()` readable as application composition and wiring while preserving startup, collection, GIF Extraction, Refine, settings, navigation, and shutdown behavior. Keep `AppController` as the composition root, as required by `docs/agent-docs/agent-architecture-map.md`.

## Current shape

- `src/app/app-controller.ts` has one `init()` method of roughly 1,590 lines. Its first section defines the local `AppWorkflows` class; the rest finds DOM elements, constructs services and controls, wires callbacks, initializes the shell, and registers global events.
- `AppWorkflows` uses arrow-property methods that close over variables declared later in `init()`. Examples include `gridController`, `settingsReady`, `shell`, `refineGifScreen`, and dialog controls. Moving that class to another file without designing its dependencies would create a large mutable dependency bag or a service locator.
- `init()` sets `initialized = true` after constructing `AppWorkflows` and before constructing most controls. Treat initialization order and failure behavior as existing contracts until explicitly reviewed.
- The GIF setup has late references: the ranges panel's Refine callback uses `shell` and `refineGifScreen`, which are assigned after the callback is created. It also uses `refineSelectionRevision` to reject stale asynchronous selections. Preserve this ordering and race behavior.
- `AppController` already delegates durable pipeline state to `Pipeline`, working selection state to `PipelineSession`, capture/refinement to `GifExtractionSession`, screen and panel state to `ApplicationShellController`, global events to `ApplicationEventController`, and shutdown to `ApplicationShutdownCoordinator`. Do not duplicate their ownership while reducing `init()`.
- The preceding refactor extracted steps from `runAddToCollection` and `confirmDeleteFromDisk` inside `AppWorkflows`; it did not address `init()` or change these ownership boundaries.

## Recommended approach

1. Re-read `docs/agent-docs/agent-architecture-map.md` and `coding-quality.md`, then map the actual initialization dependencies and callback cycles. Group the wiring by the feature it composes, not by contiguous line ranges.
2. Select one coherent feature cluster with a small explicit input/output contract. Extract its construction and event wiring, keeping control-owned DOM listeners in their controls. Prefer a named setup method or focused composition object only when its dependencies are substantially smaller and clearer than the current closure. Keep the first extraction behavior-preserving and independently reviewable.
3. Make late-bound references explicit. A callback that may run only after shell creation should receive an intentional activation capability or be wired after construction; do not replace local closures with optional properties and non-null assertions scattered across classes.
4. Repeat one cluster at a time. Reassess whether `AppWorkflows` should become one or several top-level application objects only after the concrete dependency cuts are visible. Do not solve line count by moving the entire class unchanged into another file.
5. Update `docs/agent-docs/` with the `doc-update` skill if durable ownership or navigation changes. A purely local extraction that preserves the current ownership map needs no architecture-map update.

## Invariants to preserve

- `AppController` remains the composition root and application-level coordinator; it does not absorb domain rules or reusable UI internals.
- The active pipeline/collection, dirty-state checks, and unsaved-change gates continue to use `PipelineSession` and `AppSessionState`.
- Controls own listeners originating from their elements; `ApplicationEventController` owns document/window listeners.
- Screen startup preference, side-panel initial preferences, Pipelines catalog loading, and contextual Refine navigation remain unchanged.
- Failed or unavailable Electron native services leave the non-Electron shell usable as today. GIF preparation, stale Refine selection suppression, and orderly shutdown keep their current sequencing.
- Do not rewrite tests to match a new implementation shape. Assert observable behavior and avoid timeout-dependent or exact-screen-size assertions.

## Verification and known coverage

- Start with `npm run typecheck` and `npx vitest --run tests/integration/app/app-controller.spec.ts tests/unit/app-dom.spec.ts` as a baseline. As of this handoff, these pass after the workflow-method refactor.
- Existing Electron scenarios in `tests/e2e/scenarios.spec.ts` cover adding selected clips to a saved collection and deleting a clip while rewriting saved collections; both passed after the workflow-method refactor. Run relevant scenarios again after moving their wiring.
- For each extracted cluster, run the focused integration tests and a user-visible Electron scenario that exercises its actual controls. If startup, screen switching, panel behavior, or Refine wiring changes, do targeted manual QA in the app; green unit tests alone do not prove those interactions.
- Review the diff against the preexisting uncommitted capture persistence and provenance work. This handoff was written on `codex/persistent-captures-provenance`; the working tree contains other in-progress changes and must not be reset.

## Skills and guidance for execution

Apply the repository's `using-97`, `before-you-refactor`, `typescript-coding`, `writing-clean-code`, and `pre-commit-self-review` skills as triggered. Use `testing-discipline` for new tests, `api-and-interface-design` for any new exported contract, and `doc-update` if ownership changes. `coding-quality.md` controls local class boundaries and naming. The current document is a handoff, not a waiver of the repository's planning flow if the future session explicitly plans a new feature.
