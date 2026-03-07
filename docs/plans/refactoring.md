# Refactor Clip Sandbox into Modular Business Logic (ExecPlan)

## Why this matters

Users rely on Clip Sandbox for loading, ordering, and fullscreen review of local video files. Refactoring without a strict execution plan risks regressions in these workflows. This plan preserves existing behavior while restructuring code for maintainability, easier testing, and safer future changes.

## Progress

- [x] (2026-03-07 09:30Z) Initial strategy drafted in `docs/plans/refactoring.md`.
- [x] (2026-03-07 10:05Z) Plan updated to use intuitive terms: `business logic` and `interfaces`.
- [x] (2026-03-07 19:30Z) Milestone 0 complete: full E2E feature coverage gate expanded and green (`18` Playwright tests).
- [x] (2026-03-07 20:15Z) Milestone 1 complete: pure domain extraction into `src/domain/*`.
- [x] (2026-03-07 20:40Z) Milestone 2 complete: centralized runtime state in `src/state/app-state.js` with named operations.
- [x] (2026-03-07 21:15Z) Milestone 3 complete: browser adapters added under `src/adapters/browser/*`.
- [x] (2026-03-07 21:40Z) Milestone 4 complete: key business-logic modules added under `src/business-logic/*` and wired from runtime.
- [x] (2026-03-07 22:44Z) Milestone 5 complete: dedicated `src/ui/*` modules added (`events`, `view-model`, `dom-factory`) with integration tests.
- [x] (2026-03-07 22:45Z) Milestone 6 stabilization complete: `app.js` reduced to thin wrapper over `src/app/bootstrap.js`; full test suite green.

## Surprises & Discoveries

- Discovery: `app.js` is the main coupling hotspot at 576 lines.
  Evidence: `Get-Content app.js | Measure-Object -Line`

- Discovery: the previous pure helper module was a good extraction seed for `src/domain/*`.
  Evidence: initial helper tests migrated cleanly to direct domain imports.

- Discovery: E2E already covers many user-guide features, but not all required edge paths.
  Evidence: `tests/e2e/scenarios.spec.js` currently lacks explicit tests for direct-write save path, full rotation assertion, and empty-folder behavior.

- Discovery: user guide path is `docs/user-guide.md` (hyphen), not `docs/user_guide.md`.
  Evidence: repository file listing.

- Discovery: sandbox execution in the worktree required escalated permissions for npm/test commands and subprocess spawning.
  Evidence: `npm install` and `npm run test:all` failed in sandbox mode with `EACCES` / `spawn EPERM`, then succeeded with escalation.

- Discovery: existing E2E suite was already strong and required targeted additions rather than broad rewrites.
  Evidence: initial baseline was `12 passed`; post-M0 baseline is `18 passed`.

- Discovery: `src/app/bootstrap.js` remained large after first-pass extraction and needed a second controller split.
  Evidence: first pass `bootstrap.js` was ~`484` lines; second pass reduced it to ~`287` lines.

## Decision Log

- Decision: use `business logic` instead of `use cases` in all new architecture docs and folders.
  Rationale: clearer terminology for project collaborators.
  Date/Author: 2026-03-07 / Codex

- Decision: use `interfaces` instead of `ports` for core dependency contracts.
  Rationale: keeps architecture intent while using more familiar language.
  Date/Author: 2026-03-07 / Codex

- Decision: enforce a full E2E coverage gate before structural refactoring.
  Rationale: protects user-facing behavior during high-churn file moves.
  Date/Author: 2026-03-07 / Codex

- Decision: move runtime implementation from root `app.js` to `src/app/bootstrap.js` and keep `app.js` as compatibility wrapper.
  Rationale: reduce entrypoint size while preserving existing import/bootstrap behavior.
  Date/Author: 2026-03-07 / Codex

- Decision: defer dedicated `src/ui/*` module split to follow-up iteration after stabilization.
  Rationale: maintain momentum and avoid broad UI churn after successful adapter + business-logic extraction.
  Date/Author: 2026-03-07 / Codex

- Decision: perform a second-pass decomposition of `bootstrap.js` into dedicated UI/business controllers.
  Rationale: preserve behavior while making `bootstrap.js` a clearer composition root.
  Date/Author: 2026-03-07 / Codex

## Outcomes & Retrospective

Shipped outcomes in this execution:
- Full E2E feature baseline expanded from `12` to `18` scenarios, covering the user-facing gaps identified in Milestone 0.
- Pure logic extracted into `src/domain/*` and consumed directly by app/tests.
- Runtime state centralized in `src/state/app-state.js`.
- Key browser adapters and business-logic modules introduced and wired into runtime flow.
- Root `app.js` reduced to a thin compatibility entrypoint that re-exports `initApp` from `src/app/bootstrap.js`.
- UI layer split completed into `src/ui/events.js`, `src/ui/view-model.js`, and `src/ui/dom-factory.js`.
- Additional decomposition completed into `src/ui/layout-controller.js`, `src/ui/drag-drop-controller.js`, `src/ui/order-file-controller.js`, and `src/business-logic/fullscreen-session.js`.
- Integration test layer added under `tests/integration/ui/*`.

Validation evidence:
- `npm run unit` => `7` files passed, `28` tests passed.
- `npm run e2e` => `18` tests passed.
- `npm run test:all` => full suite passed end-to-end.

## Context and orientation

Current system (no framework):
- `index.html`: static shell, controls, bootstrap call.
- `app.js`: controller + DOM + file IO + fullscreen + state.
- `src/domain/*`: pure helpers for file filtering, formatting, layout math, order validation.
- `tests/unit/logic.spec.js`: unit tests for pure logic.
- `tests/e2e/scenarios.spec.js`: end-to-end behavior tests.

Key terms used in this plan:
- `domain rules`: pure functions that enforce app invariants.
- `business logic`: orchestration of user actions using domain rules and interfaces.
- `adapters`: browser-specific modules that isolate platform APIs.
- `composition root`: one bootstrap location that wires modules together.

Target shape (incremental, no big-bang rewrite):

- `/src/domain/*` for pure rules.
- `/src/business-logic/*` for orchestration modules.
- `/src/adapters/browser/*` for browser API implementations.
- `/src/ui/*` for event binding and rendering.
- `/src/state/app-state.js` for mutable app state.

Assumptions and constraints:
- No framework or bundler migration.
- No intentional feature changes during refactor phases 1-5.
- Browser-only runtime with local file input.
- Existing E2E remains the top regression gate.

## Milestone 0 - Full E2E feature coverage gate

### Scope

Create a behavior baseline where every user-guide feature has at least:
- one happy-path E2E test,
- one obvious edge/non-happy E2E test.

### Files

- `tests/e2e/scenarios.spec.js` (edit)
- `tests/e2e/fixtures/**` (add fixture folders/files as needed)
- `docs/plans/refactoring.md` (update Progress/Discoveries/Decision Log during execution)

### Changes

Add or strengthen E2E tests for gaps identified against `docs/user-guide.md`:

- direct-write save path success (not only download fallback),
- explicit natural sorting assertions with mixed-case/mixed-number names,
- responsive grid behavior after viewport resize and small viewport,
- fullscreen title visibility restoration on exit,
- fullscreen clip rotation assertion over time,
- empty/no-supported-video folder behavior.

Maintain existing tests for:
- loading/filtering,
- drag reorder,
- delete guard in editable fields,
- valid/invalid order file behavior,
- status bar behavior,
- fullscreen slot math.

### Validation

- Command: `npm run e2e`
  Expected: all E2E scenarios pass, including newly added coverage.

- Command: `npm run test:all`
  Expected: full suite passes with no new flakes.

- Command: `npm run e2e -- --grep "Save order|natural sort|fullscreen|status|order file"`
  Expected: targeted scenarios pass and demonstrate feature-to-test mapping.

### Rollback/Containment

- Revert only failing new E2E test blocks if they are flaky and block baseline.
- Keep existing stable tests untouched.
- If a scenario is unstable by design (timer-sensitive), quarantine with clear skip annotation and create follow-up issue before proceeding.

## Milestone 1 - Extract pure domain rules

### Scope

Move deterministic logic out of `app.js` into domain modules while preserving behavior.

### Files

- `app.js` (edit)
- `src/domain/clip-rules.js` (create)
- `src/domain/order-rules.js` (create)
- `src/domain/layout-rules.js` (create)
- `tests/unit/logic.spec.js` (edit or split)
- `tests/unit/domain/*.spec.js` (create)

### Changes

Extract pure logic such as:
- label formatting rules,
- order transformation/validation helpers,
- key parsing and slot normalization rules,
- stateless layout calculations.

`app.js` should import extracted functions instead of hosting them inline.

### Validation

- Command: `npm run unit`
  Expected: all unit tests pass; new domain modules have direct unit coverage.

- Command: `npm run e2e`
  Expected: no user-visible behavior regression.

### Rollback/Containment

- Keep compatibility exports where needed to avoid broad import churn.
- If regressions appear, move only the failing function back temporarily and reattempt with additional unit tests.

## Milestone 2 - Centralize mutable state

### Scope

Isolate runtime mutable state in one module with named operations.

### Files

- `app.js` (edit)
- `src/state/app-state.js` (create)
- `tests/unit/state/app-state.spec.js` (create)

### Changes

Create `createAppState()` and move scattered state variables into explicit shape and update methods, for example:
- `setSelectedThumb`,
- `setFsSlots`,
- `setTitlesHidden`,
- `setCurrentDirHandle`.

### Validation

- Command: `npm run unit`
  Expected: state module tests pass, existing tests remain green.

- Command: `npm run e2e -- --grep "Delete selected clip|Toggle titles|Fullscreen"`
  Expected: state-driven behavior unchanged.

### Rollback/Containment

- Keep old state reads behind temporary adapter functions until migration is complete.
- Revert only state-module wiring commit if widespread regressions appear.

## Milestone 3 - Define browser adapters and boundaries

### Scope

Create clear dependency boundaries so business logic does not import browser globals.

### Files

- `src/adapters/browser/file-system-adapter.js` (create)
- `src/adapters/browser/dom-renderer-adapter.js` (create)
- `src/adapters/browser/fullscreen-adapter.js` (create)
- `src/adapters/browser/clock-adapter.js` (create)
- `app.js` (edit)
- `tests/unit/interfaces/*.spec.js` (create)
- `tests/integration/adapters/*.spec.js` (create)

### Changes

Wrap direct browser API usage:
- directory picker and file input fallback,
- file save/load paths,
- fullscreen entry/exit/change listeners,
- timers and async waits,
- DOM render updates.

Document expected adapter behavior in module-level docs/comments.

### Validation

- Command: `npm run unit`
  Expected: interface contract tests pass with fakes.

- Command: `npm run e2e`
  Expected: all scenarios still pass.

- Command: `rg -n "window\.|document\.|setTimeout\(|showDirectoryPicker" src/domain src/business-logic`
  Expected: no direct browser globals in domain/business-logic modules.

### Rollback/Containment

- Keep adapters additive first, then flip one call site at a time.
- If a boundary causes breakage, route that call through existing `app.js` path temporarily.

## Milestone 4 - Split business-logic orchestration

### Scope

Move user-intent orchestration from controller handlers to business-logic modules.

### Files

- `src/business-logic/load-clips.js` (create)
- `src/business-logic/apply-order.js` (create)
- `src/business-logic/save-order.js` (create)
- `src/business-logic/remove-clip.js` (create)
- `src/business-logic/toggle-titles.js` (create)
- `src/business-logic/fullscreen-session.js` (create)
- `app.js` (edit)
- `tests/unit/business-logic/*.spec.js` (create)

### Changes

Each business-logic module should:
- accept dependencies via injected adapter functions/modules,
- accept plain input data,
- return deterministic outputs/state intents where possible.

`app.js` becomes thin command/event wiring.

### Validation

- Command: `npm run unit`
  Expected: business-logic tests pass with fake interfaces.

- Command: `npm run e2e`
  Expected: behavior parity maintained.

### Rollback/Containment

- Keep dual wiring (old + new behind feature flag variable) during migration.
- If regressions are broad, route events back through old handler until module is corrected.

## Milestone 5 - UI layer cleanup

### Scope

Isolate rendering and event plumbing to dedicated UI modules.

### Files

- `src/ui/events.js` (create)
- `src/ui/view-model.js` (create)
- `src/ui/dom-factory.js` (create)
- `app.js` or `src/app/bootstrap.js` (edit)
- `tests/integration/ui/*.spec.js` (create)

### Changes

- Consolidate DOM mutations and element creation.
- Enforce safe text rendering paths (`textContent`, not unsafe HTML injection).
- Keep view-model transformations separate from domain/business logic.

### Validation

- Command: `npm run unit`
  Expected: no domain/business logic regressions.

- Command: `npm run e2e -- --grep "Load via folder|Toggle titles|Status|Fullscreen"`
  Expected: UI behavior unchanged.

### Rollback/Containment

- Move only one UI responsibility at a time (status, labels, layout, then events).
- Revert module-specific UI commit if one surface breaks.

## Milestone 6 - Stabilize and enforce quality gates

### Scope

Finalize architecture boundaries and verify maintainability goals.

### Files

- `app.js` (edit, reduce to bootstrap/wiring shell)
- `src/app/bootstrap.js` (create if not already)
- `vitest.config.js` (optional edit for new test folders)
- `docs/developer-guide.md` (edit to reflect final module map)
- `docs/plans/refactoring.md` (update final sections)

### Changes

- Ensure `app.js` is thin and mostly composition.
- Ensure tests are split across unit/integration/e2e with clear responsibility.
- Document final architecture and migration outcomes.

### Validation

- Command: `npm run test:all`
  Expected: full suite passes.

- Command: run `npm run test:all` three consecutive times
  Expected: consistent pass, no new flakes.

- Command: manual smoke of key flows from `docs/user-guide.md`
  Expected: no observable behavior regressions.

### Rollback/Containment

- Keep migration commits phase-scoped for clean reverts.
- If final shell conversion causes instability, restore prior stable `app.js` and reapply in smaller slices.

## Definition of done

- All Milestones 0-6 completed with validation evidence.
- All user-guide features protected by E2E happy + edge coverage.
- Browser API usage isolated to adapters/UI.
- `app.js` reduced to composition/wiring shell.
- Architecture documented for newcomers in `docs/developer-guide.md`.

## Execution notes

During execution, update this document continuously:
- mark `Progress` checkboxes with timestamp,
- append new discoveries with evidence,
- log every material decision and rationale,
- complete `Outcomes & Retrospective` with command evidence and follow-ups.
