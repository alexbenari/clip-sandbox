# Feature Spec: First-Class Pipeline Model

## 1. Summary

Introduce `Pipeline` as a first-class concept in the codebase and remove the synthetic "default collection" model.

After this change:

1. the app loads a pipeline, not a folder plus a fake collection,
2. a pipeline is the context in which a set of clips was originally created,
3. a pipeline is physically represented by the selected folder,
4. a pipeline contains all clips in that folder,
5. a pipeline can have zero or more persisted collections,
6. a collection remains an ordered subset of clips from one pipeline,
7. the app can display either the pipeline view or a specific collection view,
8. the pipeline view is not persisted as a fake collection file.

This feature is primarily a conceptual and architectural cleanup. It should preserve current product capability while replacing ambiguous model boundaries with explicit domain concepts that can support future cross-pipeline features.

## 2. Problem

The current code already uses the word "pipeline" in some business-logic module names, but the actual durable model is still centered on `ClipCollectionInventory` plus a synthetic default collection.

Current problems:

1. the app conceptually loads a pipeline, but the code models it as a folder inventory plus a fake collection,
2. "all clips in the folder" is represented as a synthetic default collection even though it is not actually a collection in the product sense,
3. the fake default collection leaks into persistence behavior, selector refs, tests, naming, and delete flows,
4. runtime `ClipCollection` is used for both true collections and the "all clips" view, which obscures the distinction between pipeline and collection,
5. `ClipCollectionInventory` mixes folder-level clip registry concerns with collection concerns,
6. the codebase lacks a clean foundation for future features that operate across pipelines, such as copying or duplicating clips between pipelines.

The result is that the current architecture encodes the wrong product concepts even when user-visible behavior mostly works.

## 3. Goals and Non-Goals

### 3.1 Goals

1. Introduce a first-class `Pipeline` domain model.
2. Remove the synthetic default collection concept.
3. Preserve the idea that collections are ordered subsets of clips from one pipeline.
4. Ensure the app explicitly supports two display targets: pipeline view and collection view.
5. Make the pipeline view transient and non-persisted.
6. Clean up type boundaries so runtime and persisted concepts have precise names.
7. Replace `ClipCollectionInventory` with a cleaner model centered on pipeline ownership.
8. Preserve current functionality while clarifying semantics.
9. Establish a solid foundation for future cross-pipeline operations.
10. Update test names and helpers so they use the new pipeline terminology.

### 3.2 Non-Goals

1. This feature does not introduce cross-pipeline duplication yet.
2. This feature does not add nested folders or multi-level pipeline storage.
3. This feature does not change the collection file format.
4. This feature does not add new user-visible pipeline metadata beyond the existing folder-derived identity.
5. This feature does not require new backend storage outside the local filesystem.

## 4. Core Concepts

### 4.1 Pipeline

A `Pipeline` is the first-class domain object representing one loaded clip source.

A pipeline owns:

1. pipeline identity derived from the selected folder,
2. the full set of clips physically present in that folder,
3. the canonical pipeline ordering used when materializing the pipeline view,
4. zero or more persisted collections defined for that pipeline,
5. lookup and query operations that resolve pipeline-level and collection-level targets.

A pipeline does not itself perform persistence side effects. File reads and writes remain outside the pure domain model.

### 4.2 Collection

A `Collection` is a first-class domain object representing a named, persisted, ordered subset of clips from one pipeline.

A collection owns:

1. collection name,
2. backing filename,
3. ordered clip names,
4. collection-level mutation helpers such as append-missing or remove-names,
5. serialization to and from collection-file text.

Collections remain persisted as top-level `.txt` files in the pipeline folder.

### 4.3 Sequence Source Interfaces

`Pipeline` and `Collection` should share a common interface for "things that can produce a displayed clip sequence".

The exact naming may vary, but the design should be equivalent to:

1. `IClipSequenceSource` for shared sequence-source behavior,
2. focused capability interfaces for optional behaviors such as saving or non-physical delete.

The shared interface should cover:

1. stable source identity for selector and switching logic,
2. display label,
3. materialization into a runtime displayed clip sequence,
4. dirty-state baseline,
5. any conflict-aware materialization result needed by the app.

The design should prefer capability interfaces over `kind` checks or large target-policy objects.

Examples of capability-style interfaces:

1. a save capability implemented by `Collection` but not `Pipeline`,
2. a non-physical-delete capability implemented by `Collection` but not `Pipeline`.

This keeps semantics attached to the domain concept itself rather than pushing them into type-aware orchestration code.

### 4.4 Clip Sequence

The runtime ordered set currently displayed in the grid must no longer be modeled as a `ClipCollection`, because pipeline view is not a collection.

Introduce a neutral runtime type for the displayed ordered clip set. The exact name may vary, but the concept should be equivalent to `ClipSequence`.

A clip sequence:

1. is the runtime ordered list of `Clip` objects currently shown in the grid,
2. can represent the pipeline view,
3. can represent a materialized collection view,
4. supports reorder and removal operations needed by the UI,
5. does not imply persistence by itself.

This runtime type replaces the overloaded use of `ClipCollection` as both a real collection and a transient displayed list.

### 4.5 Active Source

The app must track one active sequence source at a time.

The active source will always be one of:

1. the pipeline view,
2. a specific collection view.

The current `default` versus `saved` collection-ref model should be replaced with source identity semantics equivalent to:

1. `pipeline`,
2. `collection(filename)`.

The app should prefer capability checks on the active source over branching business logic on `kind`.

## 5. Product Semantics

### 5.1 Loading

When the user picks a folder, the app loads a pipeline.

Loading behavior:

1. the folder becomes the current pipeline,
2. top-level video files become the pipeline's clips,
3. top-level `.txt` files become persisted collections when valid,
4. the initial displayed source is the pipeline,
5. the pipeline view displays all pipeline clips.

### 5.2 Pipeline View

The pipeline view is the transient working view over all clips in the pipeline.

Pipeline-view rules:

1. it is not a collection,
2. it has no direct backing file,
3. it is selectable as the active sequence source,
4. its visible label is the pipeline name derived from the folder name,
5. it may be reordered transiently,
6. it may be saved only through a dedicated `Save as Collection` action,
7. generic remove actions in this view are interpreted as physical delete requests, not logical remove-from-view operations.

### 5.3 Collection View

A collection view displays one persisted collection from the current pipeline.

Collection-view rules:

1. it represents only that collection's ordered subset,
2. it remains editable as today,
3. generic remove actions remove clips from the active collection only,
4. explicit physical-delete actions still delete clips from disk and then remove them from all affected collections,
5. saving writes back to that collection's file,
6. saving the current sequence under another collection name remains supported, but should use collection-specific wording rather than `Save As New`.

### 5.4 Existing `<folder>-default.txt` Files

Files that previously matched the old synthetic default naming convention, such as `<folder>-default.txt`, lose their special meaning.

Resolved behavior:

1. such files are treated as ordinary collections,
2. they appear in the collection list like any other collection,
3. initial load still opens the pipeline view, not that file,
4. no filename is reserved for the pipeline view.

## 6. Functional Requirements

### 6.1 Domain Model Requirements

The architecture must introduce or rename types so the product vocabulary is explicit:

1. `Pipeline` replaces `ClipCollectionInventory` as the folder-level aggregate,
2. `Collection` replaces the current persisted collection-description concept,
3. a neutral runtime ordered-view type replaces `ClipCollection` for the current displayed clip sequence,
4. shared sequence-source identity plus capability interfaces replace the old `default` collection ref semantics.

The implementation should avoid retaining old names when they encode the wrong concept.

### 6.2 Pipeline Requirements

`Pipeline` must support:

1. returning all pipeline clips in canonical pipeline order,
2. returning the pipeline name,
3. listing all collections in stable display order,
4. resolving a collection by filename,
5. resolving source identity into either the pipeline source or a collection source,
6. reporting which collections contain a given set of clip names,
7. updating its clip registry after physical deletion,
8. updating or upserting collections after collection persistence.

### 6.3 Collection Requirements

`Collection` must support:

1. validation of collection names,
2. filename derivation from collection names,
3. append-missing merge semantics,
4. remove-name semantics,
5. serialization to file text,
6. parsing from filenames and file text.

Collections must remain pipeline-scoped. A collection cannot reference clips outside its pipeline.

### 6.4 Clip Sequence Requirements

The runtime displayed clip-sequence type must support:

1. stable ordered clip identity for the grid,
2. reorder operations,
3. logical remove operations,
4. conversion into a persisted collection payload when saving a collection,
5. materialization from either pipeline clips or collection clip-name order.

It must not encode whether it came from pipeline view or collection view. That distinction belongs to the active source and its capabilities.

### 6.5 Active Source and Selector Requirements

The active selector must:

1. always include the pipeline target,
2. list collections separately from the pipeline target,
3. use source identity that distinguishes pipeline from collection,
4. use the pipeline name itself as the pipeline option label,
5. stop using synthetic default labels such as `<folder>-default`.

The orchestration layer should:

1. track the active source,
2. materialize the current runtime clip sequence from that source,
3. enable or disable commands by checking source capabilities rather than branching on source kind wherever practical.

### 6.6 Save Requirements

Save behavior must become source-aware.

Resolved requirements:

1. `Save` is enabled only when the active source implements the capability for writing back to an existing backing file,
2. `Save` is disabled in pipeline view,
3. pipeline view exposes a dedicated `Save as Collection` action,
4. `Save as Collection` from pipeline view creates a real collection from the current transient pipeline sequence,
5. collection view continues to support saving the current sequence under another collection name, but that command should use collection-specific wording such as `Save Collection As...`,
6. the phrase `Save As New` is reserved for future pipeline-duplication semantics and should not be used for collection commands in this feature,
7. pipeline view is never directly persisted under an implicit default filename.

### 6.7 Dirty-State Requirements

Dirty state must compare the current runtime sequence against the correct baseline provided by the active source.

Resolved requirements:

1. in pipeline view, the dirty baseline is the canonical pipeline ordering,
2. in collection view, the dirty baseline is the active collection's persisted ordering,
3. switching sources or browsing away with unsaved pipeline-view changes must trigger the unsaved-changes flow,
4. if the user chooses to save while leaving dirty pipeline view, the app should route to `Save as Collection` and suggest saving the current pipeline state as a collection.

### 6.8 Delete and Remove Requirements

Delete semantics must depend on the active source and its capabilities.

Required behavior:

1. in pipeline view, generic remove or delete actions are treated as physical-delete requests,
2. in pipeline view, there is no logical "remove from view" concept,
3. in collection view, generic remove or delete actions remove clips from the active collection only,
4. in collection view, explicit "Delete from Disk" remains available and performs physical deletion,
5. physical deletion always removes the deleted clips from the pipeline's clip set and rewrites all affected collections,
6. after physical deletion, the current runtime sequence must be rebuilt from the updated pipeline state.

### 6.9 Missing-Clip Collection Handling

Collection materialization must preserve the existing missing-entry handling behavior.

Required behavior:

1. if a collection references missing clips, the app surfaces the same conflict flow,
2. the user may still accept a partial materialization,
3. this behavior applies only to collection views, not to pipeline view,
4. the pipeline view itself is always materialized from clips physically present in the pipeline.

## 7. Architecture Impact

### 7.1 Existing Types Expected to Be Removed or Replaced

The refactor should remove or replace these conceptually incorrect types:

1. `ClipCollectionInventory`,
2. the synthetic default collection concept,
3. `createDefaultCollectionRef` and `kind: 'default'` semantics,
4. any filename special-casing that treats `<folder>-default.txt` as the pipeline view,
5. runtime naming that implies the active displayed clip set is always a collection.

### 7.2 Existing Types Expected to Survive in Renamed or Narrowed Form

The following concepts still exist but should be renamed or narrowed so boundaries are precise:

1. the persisted collection-description model should become `Collection`,
2. the current runtime `ClipCollection` concept should become a neutral ordered runtime clip-sequence type,
3. collection option and selector code should become active-source option and selector code,
4. app session state should track current pipeline, active source, and current clip sequence instead of folder session plus inventory plus current collection.

### 7.3 Business-Logic Boundaries

Expected business-logic boundaries after the refactor:

1. pipeline loading builds a `Pipeline` aggregate from files,
2. source materialization converts a `Pipeline` or `Collection` sequence source into a runtime clip sequence,
3. collection persistence writes `Collection` data and updates the in-memory pipeline,
4. collection-management operations work only on collections,
5. physical-delete operations work on the pipeline aggregate and affected collections.

### 7.4 Adapter Boundary

The filesystem adapter remains responsible for:

1. picking a folder,
2. reading top-level entries,
3. saving collection text files,
4. appending logs,
5. deleting files from disk.

The domain model must not absorb filesystem side effects.

## 8. Backward-Compatibility and Migration Rules

### 8.1 File Compatibility

Existing collection files remain valid without migration.

Compatibility rules:

1. ordinary `.txt` collection files still load,
2. old `<folder>-default.txt` files still load,
3. those old default-named files are treated as ordinary collections,
4. no new implicit default collection file is written.

### 8.2 UX Compatibility

Most user-visible behavior should remain familiar.

Preserved behavior:

1. browse a folder and view clips,
2. switch among named collections,
3. reorder clips,
4. save collections,
5. save the current sequence as another collection,
6. add selected clips to another collection,
7. physically delete clips from disk,
8. handle missing collection entries through the existing conflict flow.

Intentional UX changes:

1. the initial target is explicitly the pipeline view,
2. the selector label for the "all clips" view becomes the pipeline name, not `<folder>-default`,
3. pipeline view can no longer be directly saved,
4. pipeline view uses `Save as Collection` instead of inheriting collection-save wording from the old synthetic-default model,
5. pipeline view delete behavior becomes explicitly physical,
6. collection-view delete remains logical by default.

## 9. Testing Requirements

### 9.1 Domain Tests

Add or update tests for:

1. pipeline creation from folder files,
2. collection creation and validation,
3. pipeline target and collection target resolution,
4. pipeline canonical ordering,
5. clip-sequence materialization from pipeline view,
6. clip-sequence materialization from collection view,
7. old `<folder>-default.txt` files being treated as ordinary collections.

### 9.2 App and Integration Tests

Add or update tests for:

1. initial load selecting the pipeline target,
2. selector options including pipeline plus collections,
3. `Save` disabled in pipeline view,
4. `Save as Collection` from pipeline view creating a collection,
5. unsaved pipeline-view changes prompting on navigation,
6. save-from-unsaved pipeline-view changes routing to `Save as Collection`,
7. collection-view delete removing from collection only,
8. pipeline-view delete invoking physical-delete flow,
9. explicit physical delete from collection view still rewriting affected collections.

### 9.3 E2E Regression Tests

The E2E suite should continue to prove:

1. load folder,
2. switch collection,
3. reorder and save collection,
4. save a collection from pipeline view,
5. logical delete from collection view,
6. physical delete from pipeline view,
7. physical delete from collection view via explicit command,
8. zoom behavior,
9. fullscreen behavior.

### 9.4 Test Naming and Terminology

New and updated test names must use the new domain vocabulary.

Required terminology rules:

1. tests should refer to `pipeline` and `collection` according to the real concept under test,
2. tests should stop referring to the synthetic default collection except when explicitly covering backward compatibility for legacy `<folder>-default.txt` files,
3. test names should stop describing initial load as loading a default collection,
4. test helpers and fixture names should be updated where practical so they do not reintroduce obsolete terminology.

## 10. Acceptance Criteria

This feature is complete when:

1. the codebase contains a first-class `Pipeline` concept,
2. `ClipCollectionInventory` and the synthetic default collection concept are gone,
3. the app loads a pipeline and initially makes the pipeline the active sequence source,
4. collections are modeled as true collections only,
5. the active selector distinguishes pipeline from collections and is backed by shared source identity semantics,
6. the pipeline selector entry shows the pipeline name rather than `<folder>-default`,
7. pipeline view is never directly persisted,
8. `Save` is disabled in pipeline view,
9. `Save as Collection` from pipeline view creates a real collection,
10. delete semantics differ correctly between pipeline view and collection view,
11. old `<folder>-default.txt` files load as ordinary collections,
12. tests reflect the new model boundaries, behavior, and terminology.

## 11. Open Issues and Implementation Risks

These are not open product questions, but they are the main implementation risks to account for in the execution plan:

1. the current codebase uses "collection" names pervasively in app state, selector code, texts, tests, and runtime models, so the rename and concept cleanup will be broad,
2. the current save, dirty-state, and delete flows all assume the active "all clips" view is a collection, so they need coordinated refactoring rather than isolated renames,
3. keyboard delete and context-menu actions must be audited carefully so the active-source-specific semantics do not regress,
4. tests currently encode synthetic default labels and files, so the suite will need deliberate migration rather than piecemeal edits,
5. future cross-pipeline features will be easier only if this refactor avoids reintroducing folder/default aliases under new names,
6. the interface design should not collapse into one oversized shared contract with many irrelevant members; optional behavior should be expressed through focused capabilities.

## 12. Resolved Decisions

1. The pipeline view is transient, reorderable, and can be saved only through `Save as Collection`.
2. The pipeline view has no logical "remove from view"; remove maps to physical delete there.
3. In collection view, default delete remains logical removal from the active collection.
4. Physical delete remains explicitly available from collection view.
5. Unsaved pipeline-view changes should prompt on navigation and offer saving as a collection.
6. Existing `<folder>-default.txt` files are ordinary collections.
7. `ClipCollectionInventory` should be removed.
8. The refactor should include type cleanup, not just a minimal wrapper rename.
9. `Save As New` is reserved for future pipeline-duplication semantics and should not be used for collection commands in this feature.
10. Test names and helpers should adopt the new pipeline terminology.
11. `Pipeline` and `Collection` should share a common sequence-source interface, with optional behavior modeled through capability interfaces rather than type-aware business logic.
