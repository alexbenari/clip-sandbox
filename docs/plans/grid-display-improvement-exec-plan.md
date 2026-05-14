# Improve Metadata-Aware Grid Layout

## Why this matters

Clip Sandbox is used to review many local video clips at once. The current normal grid sometimes picks layouts with too few rows and too many columns, making each rendered video thumbnail hard to inspect. This plan implements the approved spec in `docs/specs/grid-display-improvement-spec.md`: the grid should score layouts by expected visible video area, use real clip dimensions once rendered card videos load metadata, and perform at most one quiet correction relayout per current sequence.

## Progress

- [x] (2026-05-14 05:55Z) Feature spec signed off in `docs/specs/grid-display-improvement-spec.md`.
- [x] (2026-05-14 05:55Z) Prototype decision recorded: do not use `ffprobe` for the hot path; use rendered card video metadata instead.
- [x] (2026-05-14 06:22Z) Milestone 1 - Added metadata-aware layout scoring and dimension-driven tests.
- [x] (2026-05-14 06:25Z) Milestone 2 - Made active-pipeline clips canonical and metadata-bearing.
- [x] (2026-05-14 06:30Z) Milestone 3 - Captured rendered-card metadata and added one-shot correction relayout.
- [x] (2026-05-14 06:30Z) Milestone 4 - Wired diagnostics, created-clip insertion, and interaction guards.
- [x] (2026-05-14 06:33Z) Milestone 5 - Updated agent architecture docs and passed final verification.

## Surprises & Discoveries

- Discovery: current normal-grid scoring maximizes abstract cell area, not rendered video area.
  Evidence: `src/ui/display-layout-rules.ts` computes each candidate score as `cellW * cellH`, while `.thumb > video` in `src/ui/clip-collection-grid-controller.ts` uses contained sizing.

- Discovery: `Pipeline` and `Collection` currently create fresh runtime `Clip` objects on materialization.
  Evidence: `src/domain/pipeline.ts` creates `new Clip(...)` in `materializePipeline(...)`; `src/domain/collection.ts` creates `new Clip(...)` through `materializedClips(...)`.

- Discovery: card videos already expose the metadata event needed for this feature.
  Evidence: `src/ui/clip-collection-grid-controller.ts` already listens to `loadedmetadata` and writes duration to the clip with `clip.setDuration(video.duration)`.

- Discovery: `ffprobe` works but is too expensive as the default first-layout path.
  Evidence: a prototype against 34 `downhill-racer` videos succeeded for all files, but took about `2867ms` serial warm, `950ms` at concurrency 4, and `663ms` at concurrency 6. The approved direction avoids a separate metadata probe and uses actual rendered card videos instead.

- Discovery: metadata-aware layout scoring now has focused coverage for count, dimensions, aspect-ratio mix, invalid dimensions, and gap effects.
  Evidence: `npm run unit -- --run tests/unit/logic.spec.ts` passed with 17 tests on 2026-05-14.

- Discovery: canonical clip reuse can be implemented inside `Pipeline` while preserving filename-based collection persistence.
  Evidence: `npm run unit -- --run tests/unit/clip-models.spec.ts tests/unit/pipeline-selection.spec.ts tests/unit/pipeline-factory.spec.ts` passed with 21 tests on 2026-05-14.

- Discovery: collection order and canonical clip id assignment are intentionally different concepts now.
  Evidence: `tests/unit/business-logic.spec.ts` was updated so collection order remains `['bravo.mp4', 'alpha.mp4']`, while clip ids reflect canonical pipeline inventory order as `['clip_2', 'clip_1']`.

- Discovery: the full Vitest suite passes after metadata lifecycle and canonical clip changes.
  Evidence: `npm run unit` passed with 37 files and 152 tests on 2026-05-14.

## Decision Log

- Decision: use rendered card videos as the only metadata source for grid layout.
  Rationale: this avoids duplicate media reads and avoids spawning one metadata process per clip. First layout may use fallback dimensions, then one correction can happen when card metadata is complete.
  Date/Author: 2026-05-14 / Codex

- Decision: make `Clip` objects canonical within the active `Pipeline` session.
  Rationale: metadata should remain attached to the same runtime clip while switching between pipeline and collection views. This avoids a separate metadata cache.
  Date/Author: 2026-05-14 / Codex

- Decision: do not inherit metadata from a source clip when creating derived clips such as Loopify outputs.
  Rationale: keeping all newly created clips on the same rendered-card metadata flow is simpler and avoids edit-specific assumptions.
  Date/Author: 2026-05-14 / Codex

- Decision: keep metadata failure diagnostics out of the activity indicator.
  Rationale: metadata failure is a diagnostic concern; users should not see noisy status messages when fallback layout remains usable.
  Date/Author: 2026-05-14 / Codex

- Decision: do not retry browser card-video metadata failures.
  Rationale: browser `loadedmetadata` failures are likely deterministic for a rendered card source, and retries add timers, stale-event handling, and tests without much expected benefit. A later rerender naturally creates a fresh attempt.
  Date/Author: 2026-05-14 / Codex

## Outcomes & Retrospective

Implemented metadata-aware normal-grid layout and canonical runtime clip ownership.

Shipped behavior:

- normal-grid layout scoring now maximizes expected contained video area using known clip dimensions and a `16:9` fallback,
- `Clip` stores duration, intrinsic dimensions, and metadata failure state,
- `Pipeline` owns canonical runtime clips for the active folder session, and materialized collection sequences reference those same clips,
- rendered card videos update canonical `Clip` metadata through `loadedmetadata`,
- `GridVideoMetadataTracker` tracks active-sequence pending/loaded/failed state and emits one metadata-complete correction opportunity,
- the grid applies metadata-complete relayout only when the best column count changes and defers while dragging,
- metadata failures are logged through `AppDiagnostics` to `err.log` and do not appear in the activity indicator,
- newly created clips in collection view are inserted as canonical pipeline clips and use the same rendered-card metadata flow,
- `docs/agent-docs/agent-architecture-map.md` documents canonical clip and metadata-layout ownership.

Validation evidence:

- `npm run unit -- --run tests/unit/logic.spec.ts` passed.
- `npm run unit -- --run tests/unit/clip-models.spec.ts tests/unit/pipeline-selection.spec.ts tests/unit/pipeline-factory.spec.ts` passed.
- `npm run unit -- --run tests/unit/grid-video-metadata-tracker.spec.ts tests/integration/ui/clip-collection-grid-controller.spec.ts tests/integration/app/app-controller.spec.ts` passed.
- `npm run build` passed.
- `npm run unit` passed with 37 files and 152 tests.
- `npm run test:all` passed with 37 unit/integration files, 152 tests, and 7 Electron E2E scenarios.

Residual note:

- The E2E run emitted a Node deprecation warning about passing args with `shell: true` in a child process. The suite passed, and the warning appears unrelated to this grid-layout change.

## Context and orientation

Clip Sandbox is a framework-free Electron renderer app. The current folder session owns a `Pipeline`, and the active grid view is a runtime `ClipSequence`. Pipeline mode displays all clips in the selected folder. Collection mode displays an ordered subset from a saved `.txt` collection.

Important files:

- `src/domain/clip.ts`: runtime clip model. It currently stores id, file, media source, and optional duration.
- `src/domain/pipeline.ts`: folder-backed model. It currently stores video files and saved collections, then creates fresh `Clip` instances when materializing views.
- `src/domain/collection.ts`: saved collection model. It currently materializes a `ClipSequence` by matching collection filenames to available video files and creating fresh `Clip` instances.
- `src/domain/clip-sequence.ts`: ordered runtime clip list used by the grid, reorder, selection, and save flows.
- `src/ui/display-layout-rules.ts`: pure normal/fullscreen grid layout rules.
- `src/ui/clip-collection-grid-controller.ts`: owns grid card rendering, card video lifecycle, selection, drag/drop, and layout recomputation.
- `src/ui/grid-video-metadata-tracker.ts` or similar new file: planned focused UI helper for one active grid sequence's metadata lifecycle.
- `src/adapters/browser/dom-renderer-adapter.ts`: applies grid columns and card heights to the DOM.
- `src/app/app-controller.ts`: composition root that wires pipeline materialization, grid rendering, diagnostics, edit-created clips, and toolbar state.
- `src/app/app-diagnostics.ts`: appends diagnostic text to `err.log` in the selected folder.
- `docs/agent-docs/agent-architecture-map.md`: canonical agent-facing architecture map. It should be updated if this plan changes durable ownership or routing guidance.

Definitions:

- "Rendered video area" means the visible `<video>` rectangle inside a grid cell after `object-fit: contain` behavior. A cell can be large while the video inside it is small if the aspect ratio does not fit well.
- "Canonical Clip" means one runtime `Clip` object per available video file in the active pipeline session. Views reference that object instead of creating a new `Clip` for each materialization.
- "Sequence activation" means rendering a new current `ClipSequence`, either after folder load, collection switch, returning to pipeline view, or adding a created clip to the visible sequence.
- "Metadata complete" means every clip in the current sequence has either loaded metadata from its rendered card video or failed after the allowed attempts.

Existing validation entrypoints:

- `npm run unit` runs unit and integration tests under Vitest.
- `npm run e2e` builds and runs Playwright Electron scenarios.
- `npm run test:all` runs unit tests and E2E scenarios.

## Milestone 1 - Metadata-Aware Layout Scoring

### Scope

Change normal-grid scoring so it maximizes aggregate rendered video area using known clip dimensions and a deterministic fallback aspect ratio. This milestone is pure policy work and should not change card rendering yet.

### Changes

- File: `src/ui/display-layout-rules.ts`
  Edit: extend `computeBestGrid(...)` to accept optional per-clip dimension/aspect inputs, such as a `clips` array or `aspectRatios` array. Keep the existing `count`, `availW`, `availH`, and `gap` behavior working for callers/tests that do not pass metadata.

- File: `src/ui/display-layout-rules.ts`
  Edit: score each candidate column count from `1` through clip count by:
  - `rows = Math.ceil(count / cols)`,
  - available cell width and height after gaps,
  - per-clip aspect ratio from valid `videoWidth / videoHeight` or fallback `16 / 9`,
  - contained rendered area `min(cellW, cellH * aspect) * min(cellH, cellW / aspect)`,
  - sum across actual clips only.

- File: `src/ui/display-layout-rules.ts`
  Edit: return `cols`, `rows`, and `cellH` as before. If useful for tests, expose a small helper for contained-area scoring, but keep the public API focused.

- File: `tests/unit/logic.spec.ts`
  Edit: replace broad current grid assertions with dimension-driven tests for:
  - raw cell area no longer dominates rendered video area,
  - empty final-row slots can win,
  - large clip counts do not over-prefer very wide low-row layouts,
  - mixed aspect ratios,
  - portrait, square, and landscape inputs,
  - zero clips, one clip, missing dimensions, invalid dimensions, constrained dimensions, and gap effects.

### Validation

- Command: `npm run unit -- --run tests/unit/logic.spec.ts`
  Expected: layout-rule tests pass and prove the selected columns follow rendered-area scoring.

- Command: `npm run unit`
  Expected: all Vitest unit/integration tests still pass.

### Rollback/Containment

If metadata-aware scoring destabilizes unrelated layout behavior, keep the old scoring behind a local helper during the milestone and add tests that compare the old and new behavior. Do not proceed until the new scoring has clear expected outcomes for edge cases.

## Milestone 2 - Canonical Clip Metadata Model

### Scope

Make `Clip` store video dimensions and make `Pipeline` reuse one runtime `Clip` per video file within the active pipeline session. Collection and pipeline views should reference the same clip instances.

### Changes

- File: `src/domain/clip.ts`
  Edit: add runtime metadata fields for intrinsic video width and height. Add methods such as `setVideoMetadata({ durationSec, videoWidth, videoHeight })`, `setDuration(...)` compatibility if still needed, `hasUsableDimensions()`, and accessors for `videoWidth` and `videoHeight`.

- File: `src/domain/pipeline.ts`
  Edit: add canonical clip ownership keyed by video filename. Preserve sorted video-file behavior, but have materialization reuse existing `Clip` instances when possible.

- File: `src/domain/pipeline.ts`
  Edit: update `materializePipeline(...)` so it returns a `ClipSequence` over canonical clips. `nextClipId` can still be passed for newly encountered files, but repeated materialization should not create new clip ids for the same file.

- File: `src/domain/pipeline.ts`
  Edit: update `upsertVideoFile(...)` or add a companion method so newly created video files get a canonical `Clip` when they are first needed.

- File: `src/domain/collection.ts`
  Edit: change collection materialization so it can consume canonical clips by name rather than raw video files. Preserve missing-entry analysis and returned shape.

- File: `src/domain/clip-sequence.ts`
  Edit: verify it already stores object references and needs no changes beyond tests. Keep order and lookup semantics unchanged.

- Files: `tests/unit/clip-models.spec.ts`, `tests/unit/pipeline-selection.spec.ts`, `tests/unit/pipeline-factory.spec.ts`, and any affected domain tests.
  Edit: add assertions that repeated pipeline materialization and collection materialization reuse the same `Clip` instance for the same video file and preserve metadata across view switches.

### Validation

- Command: `npm run unit -- --run tests/unit/clip-models.spec.ts tests/unit/pipeline-selection.spec.ts tests/unit/pipeline-factory.spec.ts`
  Expected: domain tests pass, including canonical clip reuse and metadata storage.

- Command: `npm run unit`
  Expected: all unit/integration tests still pass.

### Rollback/Containment

If canonical clip ownership touches too many domain paths at once, first add a `Pipeline` private helper that maps files to canonical clips while preserving current public method signatures. Avoid changing collection persistence semantics; collection files remain filename-based.

## Milestone 3 - Rendered-Card Metadata Lifecycle and One-Shot Relayout

### Scope

Use the actual rendered card videos to populate clip metadata and trigger at most one metadata-complete correction relayout per current sequence activation. Keep the active-sequence metadata lifecycle in a focused UI helper object rather than spreading pending/loaded/failed state through the grid controller.

### Changes

- File: `src/ui/grid-video-metadata-tracker.ts`
  Edit: create a focused helper class for one active grid sequence's metadata lifecycle. It should track the current sequence token, per-clip metadata state, failure log de-duplication for the sequence, and whether a metadata-complete relayout has already been requested.

- File: `src/ui/clip-collection-grid-controller.ts`
  Edit: when rendering a collection, start a new metadata tracker sequence. The tracker token should make stale `loadedmetadata` or failure events from old renders harmless.

- File: `src/ui/clip-collection-grid-controller.ts`
  Edit: update `onLoadedMetadata(...)` to write duration, `video.videoWidth`, and `video.videoHeight` to the canonical `Clip`.

- File: `src/ui/grid-video-metadata-tracker.ts`
  Edit: track per-card metadata state for the active sequence: loaded, failed, or pending. Known dimensions on `Clip` should count as loaded for layout purposes.

- File: `src/ui/grid-video-metadata-tracker.ts`
  Edit: expose an explicit metadata-complete signal after all active-sequence clips are loaded or failed, with debounce support and a guard so this happens once per sequence activation.

- File: `src/ui/clip-collection-grid-controller.ts`
  Edit: when the tracker emits metadata complete, recompute normal grid layout using clip metadata and fallback dimensions. Apply it only if the best column count differs from the current applied column count.

- File: `src/ui/clip-collection-grid-controller.ts`
  Edit: preserve DOM order and selection. Do not reorder clips during correction. Add a short card height transition through the injected grid CSS.

- File: `src/ui/clip-collection-grid-controller.ts`
  Edit: add an active-drag guard. If metadata completion happens during drag/reorder, defer correction until drag end.

- File: `src/adapters/browser/dom-renderer-adapter.ts`
  Edit: if needed, return or expose the applied column count so the grid controller can compare current vs recomputed columns. Keep adapter responsibility limited to DOM style application.

- File: `tests/integration/ui/clip-collection-grid-controller.spec.ts`
  Edit: add tests for `loadedmetadata` metadata storage, single correction after all metadata completes, no relayout when columns are unchanged, relayout when columns change, drag deferral, and stale sequence protection.

- File: `tests/unit/grid-video-metadata-tracker.spec.ts`
  Edit: add focused tests for tracker state transitions: known metadata starts loaded, pending clips complete only when all loaded/failed, stale sequence tokens are ignored, completion fires once, and failure logging de-duplicates within a sequence.

### Validation

- Command: `npm run unit -- --run tests/integration/ui/clip-collection-grid-controller.spec.ts`
  Expected: grid lifecycle tests pass and demonstrate one-shot correction behavior.

- Command: `npm run unit -- --run tests/unit/grid-video-metadata-tracker.spec.ts`
  Expected: metadata tracker lifecycle tests pass without needing real media playback.

- Command: `npm run unit`
  Expected: all Vitest tests still pass.

### Rollback/Containment

If the tracker abstraction grows beyond sequence lifecycle and failure de-duplication, reduce it back to state tracking and keep DOM video event handling in the grid controller. Keep it renderer/UI scoped; do not move DOM video event handling into `app-controller.ts`.

## Milestone 4 - Diagnostics, Created Clips, and App Wiring

### Scope

Wire the new grid metadata lifecycle into app diagnostics and ensure created clips, such as Loopify outputs, enter the same canonical-clip and relayout flow.

### Changes

- File: `src/app/app-diagnostics.ts`
  Edit: add a method such as `logVideoMetadataFailure({ filename, error })` that appends a human-readable `err.log` entry. Include clip name, final error or reason, and fallback behavior.

- File: `src/app/app-controller.ts`
  Edit: pass a metadata-failure callback to the grid controller so failures are logged through `AppDiagnostics` and do not appear in the activity indicator.

- File: `src/ui/clip-collection-grid-controller.ts`
  Edit: handle card video metadata failure once for the rendered card. On failure, report failure to the metadata tracker; the tracker marks the clip failed for the active sequence and invokes the diagnostics callback once for that clip in that sequence.

- File: `src/app/app-controller.ts`
  Edit: update created-clip flows around `applyCreatedClipToPipelineView(...)` and `applyCreatedClipToCollectionView(...)` so `Pipeline` creates the canonical `Clip` for the new file and the rendered grid card loads metadata through the same flow. Do not inherit metadata from the source clip.

- File: `tests/integration/app/app-controller.spec.ts`
  Edit: add or adjust tests for created clip insertion so the created clip is canonical, selected, and eligible for the metadata-complete relayout lifecycle.

- File: `tests/integration/ui/clip-collection-grid-controller.spec.ts`
  Edit: add failure tests that verify metadata failure logs once, uses fallback aspect ratio, and allows sequence metadata completion.

### Validation

- Command: `npm run unit -- --run tests/integration/ui/clip-collection-grid-controller.spec.ts tests/integration/app/app-controller.spec.ts`
  Expected: diagnostics, retry, and created-clip flow tests pass.

- Command: `npm run unit`
  Expected: all Vitest tests pass.

### Rollback/Containment

If browser media retry simulation is brittle in jsdom, isolate retry state in a small helper that can be unit-tested without real media playback, and keep only a thin integration test for wiring from card events to the helper.

## Milestone 5 - Documentation and Final Verification

### Scope

Update durable agent-facing documentation for the new canonical clip and metadata-layout ownership, then run broad verification.

### Changes

- File: `docs/agent-docs/agent-architecture-map.md`
  Edit: update stable concepts and grid flow to state that `Pipeline` owns canonical runtime clips for the active folder session, `Clip` stores runtime metadata including dimensions, and `ClipCollectionGridController` consumes card-video metadata for layout correction.

- File: `docs/plans/grid-display-improvement-exec-plan.md`
  Edit: update `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` with actual implementation evidence.

- File: `docs/specs/grid-display-improvement-spec.md`
  Edit: only if implementation reveals a signed-off requirement needs clarification. Do not silently change product decisions.

### Validation

- Command: `npm run unit`
  Expected: all Vitest tests pass.

- Command: `npm run e2e`
  Expected: Playwright Electron scenarios pass.

- Command: `npm run test:all`
  Expected: full verification passes.

- Manual check: run the app with `npm start`, open `C:\Users\alexb\OneDrive\studio\projects\gif art\downhill-racer`, and inspect the full pipeline plus `static-landscape`.
  Expected: first layout appears quickly; if metadata changes the best columns, the grid performs at most one correction; resulting clips are materially larger than the previous tiny two-row display; collection switches reuse metadata already loaded.

### Rollback/Containment

If E2E fails in fullscreen or zoom behavior, first inspect whether canonical clip ids or grid rerender timing changed those flows. If the visual layout feature is correct but broad UI behavior regressed, revert only the app/grid wiring from Milestones 3-4 while keeping pure layout tests and domain metadata changes isolated for another pass.
