# Extend Refine to exact captures

## Why this matters

A user can revisit any captured range against the same source movie, adjust exact frame boundaries, and explicitly extract the revised result. The Clips panel keeps one entry for that range. Saved clips from earlier extractions remain intact. Editing a saved clip without its source movie is a separate future Edit feature.

## Progress

- [x] (2026-09-26) User signed off the feature spec with double-click and replacement requirements, and waived this plan's sign-off.
- [x] (2026-09-26) Added focused tests for exact capture entry, range replacement, unchanged and changed extraction outcomes, active batch blocking, and failed publication. The first exact-entry and panel assertions failed as expected before implementation.
- [x] (2026-09-26) Implemented session, workflow, and UI changes. Focused tests and TypeScript checks pass.
- [x] (2026-09-26) Verified build, typecheck, 374 unit/integration tests, focused exact-capture Electron workflow, architecture updates, and `git diff --check`.

## Skill Gates

Planning-time gates: `working-with-users-and-team`, `impeccable`, `api-and-interface-design`, `domain-modeling`, `typescript-coding`, `before-you-refactor`, and `testing-discipline` shaped the signed-off behavior, ownership, and evidence. `coding-quality.md` and `docs/agent-docs/agent-architecture-map.md` govern boundaries.

Execution-time gates: `using-97`, `typescript-coding`, `writing-clean-code`, `api-and-interface-design`, `error-and-correctness-traps`, `testing-discipline`, `bugfix-by-failing-test`, `doc-update`, and `pre-commit-self-review` apply to code, tests, documentation, and completion review. `using-git-worktrees` was considered; the user explicitly asked to continue this work in the current checkout, which contains the signed-off untracked spec and existing work. No new worktree is needed. No expected skill is unavailable.

## Surprises & Discoveries

- The range model already replaces a captured range at the same id and queue index. Refine currently rejects exact ranges before that replacement can be used.
- Extraction status is keyed by range id; a changed completed range must become pending, while a publication failure must retain its encoded media for retry.
- The Refine screen asks to focus an endpoint before staging it; tests changing End from initial Start focus must invoke the End action twice or focus End first.
- A direct `dblclick` handler missed a real double-click because the first click selected a range and rebuilt its card. Using the second `click` event's detail and avoiding redundant selection publication lets both selected and unselected cards open Refine. Real Electron checks proved both paths.
- The existing inexact Electron case passed alone but failed intermittently when run with the exact case because playback did not produce an inexact capture. This is the previously observed playback-resumption timing issue; the exact case passed in both runs.

## Decision Log

- Decision: Keep Refine in the existing source-bound GIF workflow. Edit for saved clips is postponed. Date/Author: 2026-09-26 / user.
- Decision: A changed lock resets only that range's extraction outcome to pending. An unchanged exact lock preserves its outcome. Active extraction and unresolved publication block changed locks. Date/Author: 2026-09-26 / plan.
- Decision: Implement in this checkout and proceed without another sign-off. Date/Author: 2026-09-26 / user.

## Outcomes & Retrospective

The signed-off Refine flow now accepts exact and inexact captures. Double-click and the Refine button open the selected captured range. Lock replaces its existing Clips card. Changed completed captures become pending for a new explicit extraction; an unchanged lock retains its completed outcome; failed collection publication and active extraction block changed revisions. A real Electron test created the first output, refined the same card, created the second output, and verified both video files and collection entries remained. `npm run build`, `npm run typecheck`, `npm run unit` (81 files, 374 tests), and `git diff --check` passed. The exact Electron case passed; the older inexact case passed on an individual rerun after intermittent playback setup failure in combined runs. The design detector reported existing `index.html` warnings; this feature changed no CSS or design tokens.

## Context and orientation

`src/domain/range-capture-model.ts` owns the ordered captured-range queue and replacement by id. `src/app/refine-gif-session.ts` stages exact endpoints. `src/app/gif-extraction-session.ts` owns the source review lease, captures, thumbnails, active refinement, and extraction coordinator. `src/app/clip-extraction-workflow.ts` tracks extraction state per range id and publishes new media. `src/ui/gif-ranges-panel-control.ts` renders the Clips panel and dispatches Refine actions. `src/ui/refine-gif-screen.ts` is the existing contextual screen and shares the frame player. `docs/specs/refine-exact-captures-spec.md` is the signed-off behavior. A source generation identifies the currently opened movie review; frame ordinals are exact source-frame identities.

## Milestone 1 - Characterize exact capture revisions

### Scope

Prove that exact capture entry, double-click, one-card replacement, and extraction outcome rules are testable.

### Changes

- Add focused session tests in `tests/unit/refine-gif-session.spec.ts` and workflow tests in `tests/unit/clip-extraction-workflow.spec.ts` or the existing relevant file.
- Add panel behavior checks in `tests/integration/ui/gif-ranges-panel-control.spec.ts`.

### Validation

- Run `npx vitest run tests/unit/refine-gif-session.spec.ts tests/integration/ui/gif-ranges-panel-control.spec.ts` and observe new assertions fail before implementation for the expected missing behavior.

### Rollback/Containment

Tests only; revise an incorrect assertion against the signed-off spec before changing production code.

## Milestone 2 - Implement Refine and extraction ownership

### Scope

Allow exact ranges into the existing Refine screen, replace the same panel entry, and handle revision-specific extraction state safely.

### Changes

- `src/app/refine-gif-session.ts`: accept either captured-range kind and focus Start for an exact range.
- `src/app/gif-extraction-session.ts`: permit both kinds, compare locked endpoints with current range, coordinate changed revisions with extraction state, and preserve unchanged outcomes.
- `src/app/clip-extraction-workflow.ts`: expose a narrow revision guard/reset operation owned by extraction workflow.
- `src/ui/gif-ranges-panel-control.ts`: expose Refine and double-click on every captured range.
- `src/ui/refine-gif-screen.ts`: describe exact as well as approximate ranges accurately.

### Validation

- Run `npm run typecheck` and `npm run unit`; all tests pass. Confirm changed completed ranges are extractable and unchanged completed ranges remain complete.

### Rollback/Containment

Keep changes localized to the existing owners. If a race is found, block revision while extraction is running rather than reinterpreting an in-flight job.

## Milestone 3 - Verify visible behavior and update orientation

### Scope

Prove the signed-off flow in the actual Electron app and update current architecture guidance.

### Changes

- Extend `tests/e2e/gif-refinement.spec.ts` for exact capture double-click, revised panel entry, and saved output preservation where feasible.
- Update `docs/agent-docs/agent-architecture-map.md` and `.impeccable/surfaces/src-ui-refine-gif-screen-ts.md` to describe both range kinds.

### Validation

- Run `npm run build`, focused Electron Playwright checks, and `git diff --check`. Inspect actual UI state or captured screenshot for the exact-range path.

### Rollback/Containment

If native frame-review products are unavailable, report that limit explicitly and retain the focused automated evidence; do not claim the visible goal verified.
