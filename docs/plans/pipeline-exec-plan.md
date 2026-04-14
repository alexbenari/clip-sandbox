# Introduce First-Class Pipeline and Collection Sequence Sources

## Why this matters

Today the app conceptually loads a pipeline, but the code still models "all clips in the folder" as a synthetic default collection. That mismatch leaks into persistence, switching logic, delete semantics, UI labels, user-facing messages, and tests. It also makes future cross-pipeline features harder because the core domain concepts are not represented cleanly.

This plan implements the approved spec in [docs/specs/pipeline-spec.md](/C:/dev/clip-sandbox/docs/specs/pipeline-spec.md). The goal is to make `Pipeline` and `Collection` first-class sibling sequence sources, remove the fake default collection, preserve current behavior where intended, and deliberately ship the new pipeline-specific save and delete semantics.

## Progress

- [x] (2026-04-14 00:00+03:00) Approved feature spec recorded in `docs/specs/pipeline-spec.md`.
- [x] (2026-04-14 00:00+03:00) Execution strategy fixed: use interface-and-capability polymorphism instead of target-kind-aware policy logic.
- [x] (2026-04-14 14:19+03:00) Created a regression-safe baseline: `npm run unit` passed with 104 tests and `npm run e2e` passed with 6 Electron scenarios.
- [x] (2026-04-14 14:23+03:00) Validated the `IClipSequenceSource` seam with focused unit tests for `Pipeline`, `Collection`, and runtime `ClipSequence`, then reran the full unit suite successfully.
- [x] (2026-04-14 14:46+03:00) Replaced `ClipCollectionInventory` and related default-collection domain types with `Pipeline`, `Collection`, `ClipSequence`, source ids, and sequence-source capability helpers. Removed the dead default-collection modules from `src/domain/`.
- [x] (2026-04-14 14:46+03:00) Replaced default/saved collection refs with active-source identity and capability-driven command behavior in app state, loader logic, selector helpers, and the app controller.
- [x] (2026-04-14 14:46+03:00) Shipped renamed save commands plus target-specific delete semantics: pipeline view saves as a collection and routes generic delete to physical delete; collection view preserves logical remove by default.
- [x] (2026-04-14 14:46+03:00) Updated UI labels, user-facing messages, tests, and `docs/agent-docs/agent-architecture-map.md` to the pipeline terminology. Final validation passed with `npm run unit` and `npm run e2e`.

## Surprises & Discoveries

- Discovery: the repo already uses the word `pipeline` in business-logic module names, but the real aggregate is still `ClipCollectionInventory`.
  Evidence: [src/business-logic/clip-pipeline-loader.js](/C:/dev/clip-sandbox/src/business-logic/clip-pipeline-loader.js) loads an inventory and materializes `inventory.defaultCollection()`.

- Discovery: the synthetic default collection is not just naming; it currently drives active selection, dirty baselines, save behavior, add-to-collection destinations, and delete-from-disk cleanup.
  Evidence: [src/domain/clip-collection-inventory.js](/C:/dev/clip-sandbox/src/domain/clip-collection-inventory.js), [src/app/app-session-state.js](/C:/dev/clip-sandbox/src/app/app-session-state.js), and [src/app/app-controller.js](/C:/dev/clip-sandbox/src/app/app-controller.js).

- Discovery: current tests encode the old model explicitly, including `clips-default`, `__default__`, and `clips-default.txt`.
  Evidence: [tests/unit/clip-models.spec.js](/C:/dev/clip-sandbox/tests/unit/clip-models.spec.js), [tests/unit/collection-manager.spec.js](/C:/dev/clip-sandbox/tests/unit/collection-manager.spec.js), and [tests/e2e/scenarios.spec.js](/C:/dev/clip-sandbox/tests/e2e/scenarios.spec.js).

- Discovery: the terminology cleanup must include user-facing copy, not only domain names and control labels.
  Evidence: [src/app/app-text.js](/C:/dev/clip-sandbox/src/app/app-text.js) currently encodes synthetic-default and collection-oriented wording that will drift if only type names are changed.

- Discovery: old terminology also appears in selector serialization and in UI fixtures that assert literal button labels.
  Evidence: [src/ui/collection-option-value.js](/C:/dev/clip-sandbox/src/ui/collection-option-value.js), [tests/integration/app/app-controller.spec.js](/C:/dev/clip-sandbox/tests/integration/app/app-controller.spec.js), [tests/unit/app-dom.spec.js](/C:/dev/clip-sandbox/tests/unit/app-dom.spec.js), and [tests/integration/ui/order-menu-controller.spec.js](/C:/dev/clip-sandbox/tests/integration/ui/order-menu-controller.spec.js).

- Discovery: the current grid boundary is already neutral enough that pipeline view and collection view should share one grid controller rather than separate UI stacks.
  Evidence: [src/ui/clip-collection-grid-controller.js](/C:/dev/clip-sandbox/src/ui/clip-collection-grid-controller.js) operates on a runtime ordered clip set and does not need to know whether that set came from a pipeline or a collection.

- Discovery: the interface-and-capability design works cleanly in plain JavaScript via small method contracts and helper predicates; a dedicated type-aware policy object is not needed.
  Evidence: [tests/unit/sequence-source.spec.js](/C:/dev/clip-sandbox/tests/unit/sequence-source.spec.js) proves shared source behavior plus capability differentiation, and `npm run unit` still passed after adding the new source-model files.

## Decision Log

- Decision: `Pipeline` and `Collection` will be modeled as sibling sequence sources rather than branching orchestration on target kind.
  Rationale: this keeps semantics on the domain concepts themselves and reduces type-aware business logic in the app layer.
  Date/Author: 2026-04-14 / Codex

- Decision: shared behavior should live behind a small interface such as `IClipSequenceSource`, while optional behaviors should be expressed as focused capability interfaces rather than booleans on one large contract.
  Rationale: this keeps the design extensible without forcing `Pipeline` to pretend it supports collection-only operations such as non-physical delete or save-back-to-file.
  Date/Author: 2026-04-14 / Codex

- Decision: keep a separate runtime `ClipSequence` type even after `Pipeline` and `Collection` become sequence sources.
  Rationale: the grid still needs a mutable runtime ordered clip set with runtime clip ids, and that should remain a materialized view rather than the durable domain entity itself.
  Date/Author: 2026-04-14 / Codex

- Decision: actual filesystem writes stay outside domain entities even though `Collection` remains aware of filenames and text serialization.
  Rationale: file I/O is an infrastructure side effect; keeping it in persistence/business-logic services preserves a cleaner domain boundary and simpler tests.
  Date/Author: 2026-04-14 / Codex

- Decision: `Save As New` is reserved for future pipeline-duplication semantics and must not be reused for collection commands in this feature.
  Rationale: the approved spec deliberately reserves that phrase for future product meaning.
  Date/Author: 2026-04-14 / Codex

## Outcomes & Retrospective

- Shipped architecture:
  `Pipeline` is now the folder-level aggregate, `Collection` is the persisted ordered subset, and `ClipSequence` is the runtime mutable view rendered by the grid. The app now loads the pipeline first instead of synthesizing a fake default collection.

- Final interface/capability split:
  `Pipeline` and `Collection` are sibling clip-sequence sources behind the shared helper seam in `src/domain/clip-sequence-source.js`. Save-to-existing and non-physical-delete behavior is capability-driven rather than branch-heavy type logic in the app layer.

- User-visible command changes:
  pipeline view now exposes `Save as Collection` and treats generic remove/delete as a physical-delete flow;
  collection view keeps `Save`, `Save Collection As...`, and logical remove-from-collection behavior.
  Status text and dialog copy now say `pipeline`, `current view`, and `current pipeline folder` instead of synthetic-default wording.

- Validation evidence:
  final verification passed with `npm run unit` and `npm run e2e` on 2026-04-14 after the semantic cleanup and dead-type removal.

- Follow-up posture:
  the codebase now has a clean source model for future cross-pipeline features such as duplicating clips between pipelines, but those features are not implemented in this change.

## Context and orientation

This repository is an Electron desktop app with a framework-free renderer. The current architecture already separates runtime clip objects, persisted collection descriptions, Electron filesystem access, and UI controllers, but the core folder-level aggregate is still modeled incorrectly.

Key current files for a newcomer:

- [docs/specs/pipeline-spec.md](/C:/dev/clip-sandbox/docs/specs/pipeline-spec.md): approved feature spec and source of truth for desired behavior.
- [docs/agent-docs/agent-architecture-map.md](/C:/dev/clip-sandbox/docs/agent-docs/agent-architecture-map.md): canonical architecture orientation doc that must be updated when this refactor lands.
- [src/domain/clip-collection-inventory.js](/C:/dev/clip-sandbox/src/domain/clip-collection-inventory.js): current folder-level aggregate that must be replaced.
- [src/domain/clip-collection-content.js](/C:/dev/clip-sandbox/src/domain/clip-collection-content.js): current persisted collection model that should become `Collection`.
- [src/domain/clip-collection.js](/C:/dev/clip-sandbox/src/domain/clip-collection.js): current runtime ordered clip-list type that should become a neutral runtime `ClipSequence`.
- [src/domain/collection-ref.js](/C:/dev/clip-sandbox/src/domain/collection-ref.js): current default-vs-saved identity model that must be replaced with active-source identity.
- [src/business-logic/clip-pipeline-loader.js](/C:/dev/clip-sandbox/src/business-logic/clip-pipeline-loader.js): current loader entrypoint that still materializes the synthetic default collection.
- [src/business-logic/load-collection-inventory.js](/C:/dev/clip-sandbox/src/business-logic/load-collection-inventory.js): current inventory-building path that should become pipeline-building logic.
- [src/business-logic/load-collection.js](/C:/dev/clip-sandbox/src/business-logic/load-collection.js): collection materialization path whose missing-entry behavior must be preserved.
- [src/business-logic/collection-manager.js](/C:/dev/clip-sandbox/src/business-logic/collection-manager.js): collection-only mutation logic that should remain collection-specific after the refactor.
- [src/business-logic/clip-pipeline.js](/C:/dev/clip-sandbox/src/business-logic/clip-pipeline.js): physical-delete logic that should move to the new `Pipeline` aggregate terminology.
- [src/app/app-session-state.js](/C:/dev/clip-sandbox/src/app/app-session-state.js): current session state holding folder session, inventory, and current collection.
- [src/app/app-controller.js](/C:/dev/clip-sandbox/src/app/app-controller.js): composition root and the highest-risk seam for save/switch/delete behavior.
- [src/app/app-text.js](/C:/dev/clip-sandbox/src/app/app-text.js): central user-facing message copy that must be migrated with the semantic cleanup.
- [src/ui/clip-collection-grid-controller.js](/C:/dev/clip-sandbox/src/ui/clip-collection-grid-controller.js): shared runtime grid controller that should continue to back both pipeline and collection displays.
- [src/ui/collection-option.js](/C:/dev/clip-sandbox/src/ui/collection-option.js), [src/ui/collection-option-value.js](/C:/dev/clip-sandbox/src/ui/collection-option-value.js), and [src/ui/active-collection-selector.js](/C:/dev/clip-sandbox/src/ui/active-collection-selector.js): selector code that must shift to active-source terminology.
- [tests/unit/clip-models.spec.js](/C:/dev/clip-sandbox/tests/unit/clip-models.spec.js), [tests/unit/clip-pipeline-loader.spec.js](/C:/dev/clip-sandbox/tests/unit/clip-pipeline-loader.spec.js), [tests/unit/collection-manager.spec.js](/C:/dev/clip-sandbox/tests/unit/collection-manager.spec.js), [tests/unit/clip-pipeline.spec.js](/C:/dev/clip-sandbox/tests/unit/clip-pipeline.spec.js), and [tests/e2e/scenarios.spec.js](/C:/dev/clip-sandbox/tests/e2e/scenarios.spec.js): main regression layers that currently encode the default-collection model.

Definitions used in this plan:

- `Pipeline`: the folder-backed aggregate that owns all clips physically present in the folder and all persisted collections belonging to that folder.
- `Collection`: the persisted ordered subset of clips from one pipeline, currently represented by a top-level `.txt` file.
- `IClipSequenceSource`: the shared interface implemented by things that can materialize a displayed clip sequence.
- `Capability interface`: a focused optional interface such as save-to-existing-file or non-physical-delete support.
- `ClipSequence`: the runtime ordered clip set rendered by the grid, with runtime clip ids and mutable order.
- `Active source`: the currently selected `IClipSequenceSource` instance in memory, either the pipeline object or one collection object from that pipeline. When selector values or reload-safe references are needed, the app should derive a stable source identity such as `pipeline` or `collection(filename)` from that instance rather than treating active source as a separate domain concept.

Critical behavioral assumptions that implementation must preserve:

- folder scanning remains top-level only for videos and `.txt` collection files,
- existing `<folder>-default.txt` files remain loadable but become ordinary collections,
- missing-entry conflict handling for collection materialization remains intact,
- pipeline view is the initial active source and is never directly persisted,
- pipeline view uses physical-delete semantics for generic remove/delete,
- collection view keeps logical remove as the default delete behavior,
- the same grid controller continues to render both pipeline and collection materializations.

## Milestone 0 - Establish a safe baseline and rename-sensitive test inventory

### Scope

Lock down the observable behaviors most likely to regress and identify the tests and fixtures that currently hard-code the synthetic default collection terminology.

### Changes

- File: [tests/e2e/scenarios.spec.js](/C:/dev/clip-sandbox/tests/e2e/scenarios.spec.js)
  Edit: review and, if needed, strengthen coverage for initial load, selector options, reorder/save, logical collection delete, physical delete, and user-facing wording for commands and messages.

- File: [tests/unit/clip-models.spec.js](/C:/dev/clip-sandbox/tests/unit/clip-models.spec.js)
  Edit: identify cases that explicitly prove synthetic default behavior so they can be rewritten or split into backward-compatibility coverage.

- File: [tests/unit/clip-pipeline-loader.spec.js](/C:/dev/clip-sandbox/tests/unit/clip-pipeline-loader.spec.js)
  Edit: mark the tests that need terminology and behavioral migration once initial load becomes pipeline-first instead of default-collection-first.

- File: [tests/unit/collection-manager.spec.js](/C:/dev/clip-sandbox/tests/unit/collection-manager.spec.js) and [tests/unit/clip-pipeline.spec.js](/C:/dev/clip-sandbox/tests/unit/clip-pipeline.spec.js)
  Edit: isolate collection-only semantics from synthetic-default semantics so later milestones can migrate them deliberately.

- File: `docs/plans/pipeline-exec-plan.md`
  Edit: record any added coverage or discovered gaps in `Progress` and `Surprises & Discoveries`.

### Validation

- Command: `npm run unit`
  Expected: current unit suite passes before structural edits start.

- Command: `npm run e2e`
  Expected: current Electron-visible behavior passes before the refactor begins.

- Command: `Get-ChildItem tests -Recurse -File | Select-String -Pattern 'clips-default|__default__|default collection|synthetic default'`
  Expected: a concrete inventory of files and tests that still encode the old terminology is available for later milestones.

### Rollback/Containment

If new baseline assertions prove flaky, narrow them to stable observable outcomes such as selector labels, filenames written, and status text. Do not proceed into the domain refactor without strong coverage around save and delete semantics.

## Milestone 1 - Prototype the sequence-source and capability seam

### Scope

Reduce architecture risk by introducing the shared interface and capability boundaries in a narrow, testable slice before broad file and type renames.

### Changes

- File: `src/domain/clip-sequence-source.js` or equivalent
  Edit: define the shared `IClipSequenceSource`-style contract and any focused capability interfaces needed by the app.

- File: [src/domain/clip-collection.js](/C:/dev/clip-sandbox/src/domain/clip-collection.js)
  Edit: sketch or adapt the runtime ordered clip-set type toward the neutral `ClipSequence` concept without yet changing all call sites.

- File: `tests/unit/sequence-source.spec.js` or the closest fitting unit spec
  Edit: add a narrow prototype test layer that proves both a pipeline-like source and a collection-like source can materialize a runtime sequence and expose different capabilities.

- File: `docs/plans/pipeline-exec-plan.md`
  Edit: record what the prototype confirmed and any interface adjustments it forced.

### Validation

- Command: `npm run unit -- sequence-source`
  Expected: prototype tests pass and confirm the chosen interface split is viable.

- Command: `npm run unit`
  Expected: the prototype does not destabilize unrelated tests.

### Rollback/Containment

If the prototype reveals that the interface is too large or awkward, shrink the shared contract and move more behavior into capability interfaces before touching the rest of the app. Do not proceed with broad renames on an unstable shared abstraction.

## Milestone 2 - Replace `ClipCollectionInventory` with `Pipeline`

### Scope

Introduce the real `Pipeline` aggregate and move the current inventory-building and default-selection logic onto pipeline-first concepts.

### Changes

- File: `src/domain/pipeline.js`
  Edit: create the folder-level aggregate that owns pipeline name, pipeline clips, collections, source resolution, and collection lookup.

- File: [src/domain/clip-collection-inventory.js](/C:/dev/clip-sandbox/src/domain/clip-collection-inventory.js)
  Edit: remove or deprecate this model as implementation migrates to `Pipeline`.

- File: [src/domain/clip-collection-content.js](/C:/dev/clip-sandbox/src/domain/clip-collection-content.js)
  Edit: rename or narrow this into `Collection`, keeping filename, validation-adjacent helpers, ordered clip names, and text serialization.

- File: [src/business-logic/load-collection-inventory.js](/C:/dev/clip-sandbox/src/business-logic/load-collection-inventory.js)
  Edit: replace inventory-building logic with pipeline-building logic.

- File: [src/business-logic/clip-pipeline-loader.js](/C:/dev/clip-sandbox/src/business-logic/clip-pipeline-loader.js)
  Edit: change the loader so initial load returns a `Pipeline`, selects the pipeline as the initial active source, and materializes the pipeline sequence rather than `inventory.defaultCollection()`.

- File: [src/business-logic/load-collection.js](/C:/dev/clip-sandbox/src/business-logic/load-collection.js)
  Edit: preserve missing-entry behavior while letting collection materialization start from a `Collection` sequence source rather than the old inventory/default pairing.

- File: [tests/unit/clip-models.spec.js](/C:/dev/clip-sandbox/tests/unit/clip-models.spec.js) and [tests/unit/clip-pipeline-loader.spec.js](/C:/dev/clip-sandbox/tests/unit/clip-pipeline-loader.spec.js)
  Edit: rewrite model tests around `Pipeline`, `Collection`, and legacy `<folder>-default.txt` compatibility.

### Validation

- Command: `npm run unit`
  Expected: domain and loader tests pass with `Pipeline` as the new aggregate.

- Command: `Get-ChildItem src\\domain -File | Select-Object Name`
  Expected: the domain layer now contains `pipeline` and no longer depends on `clip-collection-inventory` as the active aggregate.

### Rollback/Containment

If the migration is too broad for one pass, keep compatibility wrappers in loader/business-logic modules temporarily, but the single source of truth must become `Pipeline` before this milestone is complete.

## Milestone 3 - Introduce active-source identity and capability-driven app state

### Scope

Replace default-vs-saved collection refs with active-source identity and move app/session state onto `Pipeline`, active source, and current runtime `ClipSequence`.

### Changes

- File: [src/domain/collection-ref.js](/C:/dev/clip-sandbox/src/domain/collection-ref.js)
  Edit: replace the current default/saved ref model with source identity semantics for pipeline and collection.

- File: [src/ui/collection-option-value.js](/C:/dev/clip-sandbox/src/ui/collection-option-value.js)
  Edit: rename and adapt selector serialization/parsing to active-source values.

- File: [src/ui/collection-option.js](/C:/dev/clip-sandbox/src/ui/collection-option.js) and [src/ui/active-collection-selector.js](/C:/dev/clip-sandbox/src/ui/active-collection-selector.js)
  Edit: rename and adapt selector helpers to source terminology, with the pipeline name as the pipeline option label.

- File: [src/app/app-session-state.js](/C:/dev/clip-sandbox/src/app/app-session-state.js)
  Edit: replace `collectionInventory` and `currentCollection` assumptions with `currentPipeline`, `activeSource`, and `currentClipSequence`, plus dirty-state comparison against the active source baseline.

- File: [src/app/app-controller.js](/C:/dev/clip-sandbox/src/app/app-controller.js)
  Edit: switch view-selection, dirty-prompt flow, and selector rendering to active-source semantics and capability checks rather than `kind === 'default'`-style branching.

- File: [tests/unit/state.spec.js](/C:/dev/clip-sandbox/tests/unit/state.spec.js) and relevant integration tests
  Edit: rewrite state and selector tests around active-source identity and pipeline-first initial selection.

### Validation

- Command: `npm run unit`
  Expected: state and selector tests pass using pipeline/collection source identity rather than default/saved refs.

- Command: `npm run e2e -- --grep "loads clips from an Electron-selected folder|switches between saved collections"`
  Expected: initial load selects the pipeline source and selector switching still works for collections.

### Rollback/Containment

If selector migration destabilizes too much at once, keep temporary adapter functions that map old values to new active-source identity, but do not keep the old default-collection semantics alive in the domain layer.

## Milestone 4 - Rename commands and ship source-specific save behavior

### Scope

Make save behavior capability-driven, rename the user-facing commands, and preserve the reserved meaning of `Save As New`.

### Changes

- File: [index.html](/C:/dev/clip-sandbox/index.html)
  Edit: rename UI controls so pipeline view exposes `Save as Collection`, while collection view uses collection-specific wording such as `Save Collection As...`.

- File: [src/app/app-controller.js](/C:/dev/clip-sandbox/src/app/app-controller.js)
  Edit: enable `Save` only when the active source supports save-to-existing-file, route dirty pipeline-save prompts to `Save as Collection`, and route collection save-under-new-name to collection-specific wording.

- File: [src/business-logic/persist-collection-content.js](/C:/dev/clip-sandbox/src/business-logic/persist-collection-content.js)
  Edit: keep persistence outside the domain entity while adapting it to the renamed `Collection` model.

- File: [src/app/app-text.js](/C:/dev/clip-sandbox/src/app/app-text.js)
  Edit: update status messages, prompts, button text, dialog copy, and tab text to pipeline/collection terminology.

- File: [tests/e2e/scenarios.spec.js](/C:/dev/clip-sandbox/tests/e2e/scenarios.spec.js)
  Edit: assert the renamed command text, updated user-facing messages, and pipeline-view save flow.

- File: relevant unit/integration tests
  Edit: verify `Save` enablement is capability-driven, `Save As New` is no longer used for collection commands, and renamed user-facing copy is consistent.

### Validation

- Command: `npm run unit`
  Expected: save-flow and text-oriented tests pass with the renamed commands.

- Command: `npm run e2e -- --grep "save"`
  Expected: pipeline view can save as a collection, collection view can save or save under another collection name, and the old `Save As New` wording is gone from collection workflows.

### Rollback/Containment

If command renaming reveals deeply shared UI assumptions, keep temporary internal function names if needed, but the shipped labels and behavior must match the spec before this milestone is marked complete.

## Milestone 5 - Ship source-specific delete semantics

### Scope

Implement the deliberate semantic split between pipeline-view delete and collection-view delete while preserving explicit physical delete from collection view.

### Changes

- File: [src/app/app-controller.js](/C:/dev/clip-sandbox/src/app/app-controller.js)
  Edit: route generic remove/delete commands by active-source capability. Pipeline view should treat them as physical-delete requests; collection view should treat them as logical remove-from-collection.

- File: [src/business-logic/collection-manager.js](/C:/dev/clip-sandbox/src/business-logic/collection-manager.js)
  Edit: keep non-physical delete and add-to-collection behavior collection-specific.

- File: [src/business-logic/clip-pipeline.js](/C:/dev/clip-sandbox/src/business-logic/clip-pipeline.js)
  Edit: adapt physical-delete logic to the new `Pipeline` terminology and post-delete pipeline refresh flow.

- File: [src/ui/clip-collection-grid-controller.js](/C:/dev/clip-sandbox/src/ui/clip-collection-grid-controller.js)
  Edit: keep the grid generic, but ensure emitted remove intents remain neutral so the app can apply source-specific semantics.

- File: [tests/unit/collection-manager.spec.js](/C:/dev/clip-sandbox/tests/unit/collection-manager.spec.js), [tests/unit/clip-pipeline.spec.js](/C:/dev/clip-sandbox/tests/unit/clip-pipeline.spec.js), and [tests/e2e/scenarios.spec.js](/C:/dev/clip-sandbox/tests/e2e/scenarios.spec.js)
  Edit: rewrite or add tests for pipeline-view physical delete, collection-view logical delete, and explicit collection-view delete-from-disk.

### Validation

- Command: `npm run unit`
  Expected: collection delete and physical delete tests pass with the new semantics.

- Command: `npm run e2e -- --grep "delete"`
  Expected: collection view removes only from the collection by default, pipeline view performs physical delete, and explicit delete-from-disk from collection view still rewrites affected collections.

### Rollback/Containment

If the semantic split causes confusion in shared handlers, move more decision-making to capability checks on the active source rather than reintroducing hard-coded branching on source type names.

## Milestone 6 - Full terminology migration and documentation refresh

### Scope

Finish the refactor by removing obsolete names, updating tests and fixtures to the new vocabulary, and refreshing the canonical agent-facing docs because the architecture will have changed materially.

### Changes

- File: all affected test files under [tests/unit](/C:/dev/clip-sandbox/tests/unit), [tests/integration](/C:/dev/clip-sandbox/tests/integration), and [tests/e2e/scenarios.spec.js](/C:/dev/clip-sandbox/tests/e2e/scenarios.spec.js)
  Edit: rename tests, helpers, fixtures, and string assertions from default-collection terminology to pipeline/collection terminology, except where a test explicitly covers legacy `<folder>-default.txt` compatibility.

- File: [docs/agent-docs/agent-architecture-map.md](/C:/dev/clip-sandbox/docs/agent-docs/agent-architecture-map.md)
  Edit: update the canonical architecture map to describe `Pipeline`, `Collection`, active source, and the runtime `ClipSequence` boundary.

- File: relevant docs under `docs/documentation/`
  Edit: update user/developer docs for pipeline-first loading, renamed save commands, and delete semantics.

- File: `docs/plans/pipeline-exec-plan.md`
  Edit: update `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` with implementation evidence and any deviations.

### Validation

- Command: `npm run test:all`
  Expected: the full unit, integration, and E2E suite passes with the new terminology and behavior.

- Command: `Get-ChildItem tests -Recurse -File | Select-String -Pattern 'clips-default|__default__|synthetic default'`
  Expected: matches remain only where explicitly justified for backward-compatibility coverage.

- Command: `Get-Content docs\\agent-docs\\agent-architecture-map.md`
  Expected: the architecture map describes `Pipeline` and the new source/capability model rather than inventory plus synthetic default.

### Rollback/Containment

If documentation reveals an implementation gap, keep the docs aligned to shipped behavior and record the gap honestly in `Outcomes & Retrospective` rather than documenting intended-but-unshipped behavior.

## Definition of done

- `ClipCollectionInventory` and the synthetic default collection model are removed from the active architecture.
- `Pipeline` is the folder-level aggregate and `Collection` is the persisted ordered subset concept.
- `Pipeline` and `Collection` share a common sequence-source interface, with optional behavior expressed through focused capabilities.
- The runtime displayed ordered clip set is a neutral `ClipSequence`.
- The app initially selects the pipeline as the active source.
- The selector uses pipeline/collection source identity instead of default/saved collection refs.
- The pipeline selector entry shows the pipeline name rather than `<folder>-default`.
- Pipeline view uses `Save as Collection` and is never directly persisted.
- Collection commands no longer use `Save As New`.
- Pipeline view generic delete is physical; collection view generic delete is logical; explicit delete-from-disk still exists in collection view.
- Existing `<folder>-default.txt` files still load as ordinary collections.
- Tests and docs use the new terminology, except for explicit backward-compatibility coverage.
- UI labels and user-facing messages use the new terminology, except for explicit backward-compatibility coverage.
