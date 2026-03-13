# Redefine Save/Load as Ordered Collections (ExecPlan)

## Why this matters

Users need Save/Load to do more than restore a full-folder ordering. The app should support reusable ordered subsets of a folder, let users keep working on those subsets, and handle missing entries with clear choices instead of hard failure. This work changes a core workflow, so it needs a stepwise execution plan with strong regression coverage.

## Progress

- [x] (2026-03-10 12:00Z) Initial ExecPlan drafted in `docs/plans/save-load.md`.
- [x] (2026-03-10 12:05Z) Finalized approved product spec in `docs/specs/feature-save-load.md`.
- [x] (2026-03-10 19:30Z) Established regression coverage for ordered-collection behavior across unit, integration, and E2E tests.
- [x] (2026-03-10 19:55Z) Implemented collection-aware domain analysis and explicit collection state tracking.
- [x] (2026-03-10 20:20Z) Implemented collection UI text, subset rendering, missing-entry panel, and collection save behavior.
- [x] (2026-03-10 20:40Z) Updated user/developer docs and completed `npm run test:all` validation.

## Surprises & Discoveries

- Discovery: current collection loading is implemented as strict order validation against the visible grid, not against all files in the selected folder.
  Evidence: `src/ui/order-file-controller.js` calls `validateOrderStrict(lines, getOrderArray())`.

- Discovery: current validation rejects subset files because any loaded clip omitted from the file is treated as an error.
  Evidence: `src/domain/order-rules.js` adds `Missing filenames (present in grid but not in file)` and `Count mismatch` issues.

- Discovery: current apply logic only reorders existing DOM cards; it does not switch the working set to a subset.
  Evidence: `src/business-logic/apply-order.js` appends only cards found in `grid.children`.

- Discovery: collection-first loading cannot rely on the current hidden file input alone because that flow does not expose sibling file access.
  Evidence: `index.html` currently uses `<input type="file" id="orderFileInput" ...>` for load; the approved product direction requires capability-gated File System Access support for collection-first behavior.

- Discovery: keeping `activeCollectionNames` as explicit state while syncing it from drag/drop and delete actions preserved the user's UI-driven collection without scraping the DOM at save time.
  Evidence: drag reorder updates state in `src/ui/drag-drop-controller.js`, delete sync happens in `src/app/bootstrap.js`, and save reads `state.activeCollectionNames`.

## Decision Log

- Decision: treat folder selection as creating an implicit full-folder collection.
  Rationale: this keeps the product model consistent between default load and explicit collection-file load.
  Date/Author: 2026-03-10 / Codex

- Decision: loading a collection replaces the current working collection/view rather than merely reordering the visible full folder.
  Rationale: subset collections are a first-class feature, not a validation exception.
  Date/Author: 2026-03-10 / Codex

- Decision: keep the file format as plain text with one filename per line.
  Rationale: preserves compatibility and minimizes migration risk while changing semantics.
  Date/Author: 2026-03-10 / Codex

- Decision: use `default-collection.txt` as the default saved filename.
  Rationale: aligns the artifact name with the new terminology.
  Date/Author: 2026-03-10 / Codex

- Decision: collection-first loading is supported only when browser file-system access is available; otherwise the UI must direct the user to folder-first loading.
  Rationale: avoids promising a flow that the browser cannot support reliably through the current fallback path.
  Date/Author: 2026-03-10 / Codex

- Decision: ship the folder-first collection workflow and explicit fallback guidance in this iteration rather than attempting speculative File System Access parent-folder recovery.
  Rationale: the current browser/file-handle path available to this app does not provide a robust way to infer sibling clip access from a plain collection file selection, while the approved fallback behavior is clear and testable.
  Date/Author: 2026-03-10 / Codex

## Outcomes & Retrospective

Shipped outcomes in this execution:
- Save/Load now operates on ordered collections, not strict full-folder order files.
- Loading a subset collection rebuilds the grid to show only the active subset.
- Missing collection entries now surface an inline continue/cancel panel instead of a blocking alert.
- Save now serializes the active collection to `default-collection.txt` for both download and direct-write paths.
- Drag reorder and delete actions update explicit collection state so save reflects the current UI-driven collection.
- User and developer docs now describe the collection model and folder-first collection-loading workflow.

Validation evidence collected:
- `npm run unit` => `9` files passed, `36` tests passed.
- `npm run e2e` => `23` scenarios passed.
- `npm run test:all` => full suite passed end to end.

Residual limitation:
- Collection-first auto-loading from a selected collection file into sibling clips was not implemented in this pass. The shipped behavior is the approved fallback: the UI instructs the user to load the folder first and then the collection file.

## Context and orientation

Current implementation shape:
- `src/domain/order-rules.js`: collection-file analysis logic for exact match, subset match, missing entries, and invalid files.
- `src/state/app-state.js`: explicit state for `folderFiles`, `folderFileNames`, `activeCollectionNames`, and `pendingCollectionConflict`.
- `src/ui/order-file-controller.js`: reads a collection file, blocks collection-first loading with fallback guidance, and passes parsed lines into collection analysis.
- `src/app/bootstrap.js`: wires folder load, collection load, inline conflict-panel actions, save behavior, and state-synced reorder/delete interactions.
- `src/business-logic/save-order.js`: serializes the active collection to `default-collection.txt`.
- `tests/unit/logic.spec.js`: unit coverage for collection analysis rules.
- `tests/e2e/scenarios.spec.js`: end-to-end coverage for exact/subset collection load, missing-entry decisions, and collection save behavior.

Key terms for this plan:
- `folder contents`: supported video files in the selected folder.
- `implicit collection`: the full-folder collection created when a folder is selected.
- `explicit collection`: the collection described by a collection file.
- `current working collection`: the clips currently represented by the app state and grid, and therefore the clips that Save writes.

Constraints and assumptions:
- Runtime remains browser-only and framework-free.
- The app considers files in the selected folder only, not subfolders.
- Filename matching remains exact and assumes unique filenames within the selected folder.
- Existing plain-text files remain loadable because the on-disk format does not change.

## Target code design

The implementation should keep the current layered structure and make the collection model explicit instead of inferring it from DOM order.

### State model

`src/state/app-state.js` should remain the single mutable session state module and gain collection-specific state fields:
- `folderFiles`: full sorted list of supported video `File` objects for the selected folder.
- `folderFileNames`: exact filenames derived from `folderFiles` for fast comparison.
- `activeCollectionNames`: ordered filenames for the current working collection.
- `activeCollectionSource`: `implicit-folder`, `collection-file`, or `partial-collection-after-missing-filter`.
- `pendingCollectionConflict`: null or an object containing `missingNames`, `existingNamesInOrder`, and source metadata needed by the inline conflict panel.
- existing fields such as `currentDirHandle`, `selectedThumb`, and fullscreen state remain in place.

The user-driven UI is what changes the current collection after load: drag reorder and delete actions must update the active collection model. The DOM should not be treated as the persisted source of truth to scrape at save time; instead, UI interactions should mutate `activeCollectionNames`, and the DOM should render from `folderFiles` plus that current UI-driven collection state.

### Domain layer

Keep the collection-file parsing and comparison logic in `src/domain/order-rules.js` unless rename churn becomes worthwhile enough to move it to `src/domain/collection-rules.js`. The core exported function should become a structured analyzer rather than a flat strict validator.

Target shape:
- input: `lines`, `folderFileNames`
- output: an object that always includes `requestedNames`, plus one of these result kinds:
  - `invalid-empty`
  - `invalid-duplicates`
  - `exact-match`
  - `subset-match`
  - `has-missing`

For `has-missing`, the domain result must include:
- `missingNames`
- `existingNamesInOrder`
- `missingCount`

This keeps all comparison policy in pure code and leaves only presentation decisions to the UI layer.

### Business-logic layer

Use business-logic modules to turn domain results into state transitions and rendering intents:
- `load-clips.js`: after folder load, set `folderFiles`, `folderFileNames`, and default `activeCollectionNames` to the full folder list.
- `apply-order.js` should be renamed or reshaped into collection application logic that can rebuild the visible working set from `activeCollectionNames` instead of only reordering existing DOM nodes.
- `save-order.js` should be renamed or reshaped into collection save logic that serializes `activeCollectionNames` and writes `default-collection.txt`.
- add a dedicated collection-load flow if needed, either as a new `load-collection.js` business module or as a clearer responsibility split inside the UI/controller layer.

The main rule is that the active collection lives in explicit app state. Business logic initializes and applies collection results, and UI interactions such as reorder/delete mutate that same state. The DOM reflects the current state rather than acting as the saved model itself.

### UI/controller layer

`src/ui/order-file-controller.js` should either be renamed to a collection-focused controller or kept in place with collection-specific responsibilities. It should:
- read the text file,
- call the domain analyzer against `state.folderFileNames`,
- route invalid results to status/error messaging,
- route `has-missing` results to the inline conflict panel,
- apply `exact-match` and `subset-match` results immediately.

`src/ui/view-model.js` should produce the new text for:
- collection apply success,
- partial apply success,
- empty/duplicate collection errors,
- collection-first unsupported-browser guidance,
- inline conflict panel copy.

The inline conflict panel should live in `index.html` as an app-owned UI surface rather than a browser alert/confirm flow.

### Rendering approach

Do not treat simple DOM reordering as sufficient for collection application anymore. The render path should support both:
- full-folder rendering after a folder load,
- subset rendering after a collection load.

The safest approach is:
1. keep `folderFiles` as the canonical file set,
2. derive the ordered `File` list for the active collection from `activeCollectionNames`,
3. clear and rebuild the grid from that ordered active list,
4. keep save operations based on `activeCollectionNames` as updated by load, reorder, and delete interactions, not by scraping the current DOM at save time.

This design avoids hidden stale cards, makes subset behavior explicit, and keeps save/load semantics aligned.

### Collection-first flow

Collection-first loading should be implemented as a separate entry path, not overloaded onto the current fallback file input behavior.

Target behavior split:
- supported path: File System Access-based collection picker obtains the collection file and resolves sibling folder files, then initializes `folderFiles` and `activeCollectionNames` from that folder plus the chosen collection.
- unsupported path: the UI shows a non-blocking explanatory message and leaves the standard folder-first path unchanged.

This prevents browser-capability branching from leaking into the normal folder-first path.

## Milestone 0 - Freeze spec and rename targets

### Scope

Convert the approved product decisions into a committed feature spec and list the rename targets that implementation must follow.

### Files

- `docs/specs/feature-save-load.md`
- `docs/user-guide.md`
- `docs/developer-guide.md`
- `index.html`

### Changes

- Save the approved feature spec in `docs/specs/feature-save-load.md`.
- Identify user-facing terminology that must shift from `order` to `collection`, including menu labels, titles, status text, and validation copy.
- Record any intentionally deferred wording if a full rename cannot land in one pass.

### Validation

- Command: `Get-Content docs/specs/feature-save-load.md`
  Expected: the spec captures implicit collection, subset behavior, missing-entry choice UI, save semantics, and collection-first fallback behavior.

- Command: `rg -n "order file|Save order|Load order|clip-order" docs index.html src tests`
  Expected: output provides a concrete checklist of rename/update targets for later milestones.

### Rollback/Containment

- If terminology scope proves too broad for one pass, explicitly record deferred strings in `Decision Log` before implementation starts.

## Milestone 1 - Strengthen the regression gate

### Scope

Add tests that define ordered-collection behavior before implementation changes land.

### Files

- `tests/unit/logic.spec.js`
- `tests/e2e/scenarios.spec.js`
- `tests/e2e/fixtures/**`
- `tests/integration/ui/*.spec.js` as needed

### Changes

- Replace strict-order-only expectations with ordered-collection expectations where appropriate.
- Add unit tests for:
  - exact-match collections,
  - subset collections,
  - duplicate entries,
  - blank collection file,
  - missing-entry analysis.
- Add E2E scenarios for:
  - subset collection load,
  - missing-entry conflict panel continue/cancel paths,
  - save after subset collection is active,
  - collection-first unsupported-browser message.
- Add integration coverage for the inline conflict panel behavior if the UI controller is split enough to test in isolation.

### Validation

- Command: `npm run unit`
  Expected: unit tests fail only on not-yet-implemented collection behavior and clearly pin the required changes.

- Command: `npm run e2e -- --grep "collection|Save|Load"`
  Expected: new scenarios reproduce current mismatches before the production fix is implemented.

### Rollback/Containment

- If a new E2E scenario is too coupled to unfinished UI structure, keep the behavior locked in a narrower integration or unit test and add the broader E2E once the UI path exists.

## Milestone 2 - Introduce collection-aware domain rules and state

### Scope

Replace strict full-grid order validation with collection-aware analysis based on selected-folder contents, and introduce state that distinguishes folder contents from the current working collection.

### Files

- `src/domain/order-rules.js` or a renamed collection-focused domain module
- `src/state/app-state.js`
- `src/app/bootstrap.js`
- `tests/unit/logic.spec.js`
- `tests/unit/state/*.spec.js` if new state helpers are added

### Changes

- Refactor domain logic so it returns structured collection analysis instead of only a flat `issues` list.
- Domain output should distinguish:
  - duplicate/blank invalid cases,
  - exact match,
  - subset match,
  - missing entries that require user choice,
  - filtered existing entries for partial apply.
- Track the selected folder's full supported video list separately from the active working collection.
- Update bootstrap/state wiring so collection load decisions operate on folder contents, not just the visible grid order.

### Validation

- Command: `npm run unit`
  Expected: collection-domain tests pass and prove exact/subset/missing-entry analysis.

- Command: `rg -n "getOrderArray\(\)" src`
  Expected: validation/apply logic no longer depends solely on the visible grid for collection-file comparison.

### Rollback/Containment

- Keep the old order-rule function temporarily as a compatibility wrapper if rename churn would otherwise spread through the whole app in one step.
- If state changes cause broad breakage, preserve a derived `getOrderArray()` path for save-only behavior while collection analysis is moved first.

## Milestone 3 - Implement collection load/apply UX

### Scope

Replace alert-only validation with collection-aware UI, including the inline missing-entry decision panel and collection-first fallback messaging.

### Files

- `index.html`
- `src/ui/order-file-controller.js` or renamed collection controller
- `src/ui/view-model.js`
- `src/ui/events.js`
- `src/app/bootstrap.js`
- `tests/integration/ui/*.spec.js`
- `tests/e2e/scenarios.spec.js`

### Changes

- Update menu/button labels and UI copy from order terminology to collection terminology.
- Add inline UI for the missing-entry decision flow with:
  - summary text,
  - missing-count text,
  - filename list,
  - continue/cancel actions.
- Replace generic alert messaging with collection-specific status/error handling where appropriate.
- Add the unsupported-browser message path for collection-first loading.
- If supported-browser collection-first loading is implemented in this milestone, wire the File System Access path here and keep the folder-first fallback intact.

### Validation

- Command: `npm run unit`
  Expected: supporting view-model/controller tests stay green.

- Command: `npm run e2e -- --grep "subset|missing|collection"`
  Expected: exact-match, subset, continue, cancel, and unsupported-browser scenarios pass.

### Rollback/Containment

- Keep the existing hidden input path working for folder-first loading throughout the milestone.
- If collection-first support proves unstable, ship the unsupported-browser guidance and folder-first flow first, then add the supported path in a follow-up milestone before closing the plan.

## Milestone 4 - Update save behavior and filenames

### Scope

Make Save serialize the current working collection exactly and switch the default filename to `default-collection.txt`.

### Files

- `src/business-logic/save-order.js` or renamed save-collection module
- `src/app/bootstrap.js`
- `tests/unit/business-logic.spec.js`
- `tests/e2e/scenarios.spec.js`
- `index.html`

### Changes

- Update save behavior to write the active collection rather than assuming the full folder/grid model.
- Rename user-facing save text and file name to collection terminology.
- Preserve direct-write and download fallback behavior with the new filename.
- Ensure save after subset load or subset edits writes only the active subset in visible order.

### Validation

- Command: `npm run unit`
  Expected: save business-logic tests assert `default-collection.txt` and correct serialized subset data.

- Command: `npm run e2e -- --grep "Save"`
  Expected: download and direct-write scenarios pass with the new filename and correct contents.

### Rollback/Containment

- If downstream fixtures or tests depend on `clip-order.txt`, migrate assertions in one change set and keep a temporary compatibility alias only if needed to avoid split behavior.

## Milestone 5 - Documentation and full verification

### Scope

Bring product and developer docs in line with the new model and verify the complete feature set end to end.

### Files

- `docs/user-guide.md`
- `docs/developer-guide.md`
- `docs/specs/feature-save-load.md`
- `docs/plans/save-load.md`

### Changes

- Update the user guide to describe ordered collections, subset behavior, missing-entry choices, and collection-first fallback behavior.
- Update the developer guide to describe the new collection model and any renamed modules/controllers.
- Update this ExecPlan's living sections as execution progresses.
- Record any residual limitations or follow-up work in `Outcomes & Retrospective`.

### Validation

- Command: `npm run test:all`
  Expected: full suite passes.

- Command: `npm run e2e -- --grep "collection|Save|Load|missing"`
  Expected: ordered-collection workflows are covered and green.

- Command: `rg -n "order file|clip-order|Load Order|Save Order" docs index.html src tests`
  Expected: no stale user-facing terminology remains unless explicitly documented as deferred.

### Rollback/Containment

- If terminology cleanup exposes a larger deferred rename than expected, document the remaining strings precisely and keep behavior changes shipped rather than blocking on total wording cleanup.

## Definition of done

- `docs/specs/feature-save-load.md` is committed and reflects the approved ordered-collection model.
- Save/Load behavior supports exact-match and subset collections.
- Missing collection entries trigger an inline continue/cancel decision flow.
- Save writes the active collection to `default-collection.txt`.
- Unsupported collection-first environments show a clear fallback instruction.
- Unit, integration, and E2E coverage protect the new behavior.
- User and developer docs reflect collection terminology and semantics.

## Execution notes

During execution, keep this file current:
- update `Progress` with timestamps as milestones move,
- record new facts in `Surprises & Discoveries` with evidence,
- log material product or implementation choices in `Decision Log`,
- complete `Outcomes & Retrospective` with actual commands and outcomes.





