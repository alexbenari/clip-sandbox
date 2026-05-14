# Feature Spec: Metadata-Aware Grid Display

## 1. Summary

Improve the normal clip grid so it chooses rows and columns that maximize the visible video size, not just the abstract grid-cell area.

The grid should use each clip's real video dimensions when available. On first display of a sequence, it may use a deterministic fallback layout while the actual rendered card videos load metadata. Once metadata has loaded or failed for the current sequence, the grid should perform at most one correction relayout when the real dimensions produce a better column count.

## 2. Problem

The current normal grid layout occasionally chooses layouts that technically maximize cell area but make the actual videos hard to see.

Examples from `C:\Users\alexb\OneDrive\studio\projects\gif art\downhill-racer`:

1. The full pipeline can display as two rows with many clips per row, making clips very small. A three- or four-row layout would show larger usable video thumbnails.
2. The `static-landscape` collection has seven clips and should be allowed to use a two-row layout with one blank final slot when that produces larger clips.

The root cause is that the current layout logic scores candidate layouts by `cellW * cellH`. Grid cards contain videos with `object-fit: contain`, so the actual visible video area depends on the clip's aspect ratio and may be much smaller than the card area.

## 3. Goals and Non-Goals

### 3.1 Goals

1. Choose normal-grid columns and rows by maximizing aggregate rendered video area.
2. Use real intrinsic video dimensions for scoring whenever metadata is available.
3. Use the actual rendered card videos as the metadata source; avoid a separate pre-layout metadata probe that would duplicate media reads.
4. Use fallback aspect ratio for first layout when clip dimensions are not yet known.
5. Store runtime video dimensions on `Clip` alongside `durationSec` as card videos load metadata.
6. Treat metadata as complete for a clip once it has loaded or failed for the rendered card.
7. Avoid multiple relayouts; the metadata-based correction should happen only after all outstanding metadata for the current sequence has loaded or failed.
8. Apply the correction relayout only if the selected column count changes.
9. Treat `Clip` objects as canonical runtime objects within the active pipeline session, so switching between pipeline and collection views reuses the same clip instances and their loaded metadata.
10. Newly created clips, such as Loopify outputs, should enter the same metadata-loading and correction-relayout flow because adding them can change the best grid layout.
11. Preserve all existing selection, drag/drop, zoom, fullscreen, save, and collection behavior.

### 3.2 Non-Goals

1. Do not persist video dimensions to collection files or other durable pipeline files.
2. Do not add an in-app metadata warning or toolbar/activity-history message.
3. Do not change fullscreen slot behavior as part of this feature.
4. Do not require every clip in a large or slow folder to finish metadata loading before the app becomes usable.
5. Do not introduce a broad layout redesign beyond normal-grid sizing policy.

## 4. User-Facing Behavior

### 4.1 Normal Grid Layout

The normal grid should choose the layout that maximizes the expected visible video area across the clips in the current sequence.

For each candidate column count from `1` through the clip count:

1. compute `rows = Math.ceil(count / cols)`,
2. compute available cell width and height after gaps,
3. for each clip, choose its known aspect ratio or a fallback aspect ratio,
4. compute the clip's contained rendered size inside the cell,
5. sum rendered video area across all actual clips,
6. choose the candidate with the largest aggregate rendered video area.

The algorithm should score actual clips, not empty slots. It is acceptable for the final row to contain blank space when that layout produces larger videos.

### 4.2 Metadata Loading

When a grid sequence is activated, either by loading a pipeline or switching to a collection:

1. already-known runtime metadata on `Clip` should be reused,
2. first layout should use real dimensions for clips that already have usable dimensions,
3. first layout should use fallback dimensions for clips whose metadata is not yet known,
4. rendered card videos should load metadata through the browser media pipeline,
5. each successful `loadedmetadata` event should update the corresponding canonical `Clip`,
6. the sequence should track whether each clip has loaded or failed metadata for the current activation.

The fallback aspect ratio should be deterministic. `16:9` is acceptable unless implementation evidence shows the repo already has a better default.

When the active pipeline is first loaded, metadata loading should happen through the actual rendered card videos. Collection switches should usually reuse metadata that was already loaded for those same clip objects.

### 4.3 Metadata-Complete Relayout

After the first layout, unresolved metadata may still arrive from the rendered card videos.

Metadata-complete relayout behavior:

1. store the newly known metadata on the runtime `Clip`,
2. wait until all outstanding metadata for the current sequence has either loaded or failed before considering a late relayout,
3. debounce the late relayout decision,
4. recompute the best normal-grid layout using all final known metadata plus fallback aspect ratios for failed clips,
5. apply the new layout only if the selected column count differs from the current column count.

This prevents repeated relayouts as individual clips finish loading.

If the user switches folder or collection before late metadata finishes, stale metadata completions from the previous sequence must not trigger relayout of the new sequence.

When a clip is added to the current sequence after initial render, such as a newly created Loopify clip:

1. create a new canonical runtime `Clip` for the new file,
2. render the updated sequence using known metadata and fallback aspect ratio for the new clip if needed,
3. collect metadata from the new rendered card video,
4. run the same metadata-complete relayout decision for the updated sequence once outstanding metadata has loaded or failed.

Adding a clip may cause the best column count to change even when existing clip metadata is already known.

Derived clips should not special-case metadata inheritance from their source clip. Even when an edit likely preserves dimensions, the new clip should use the same rendered-card metadata flow as any other newly added clip.

The relayout should be visually quiet:

1. perform at most one metadata-based correction per sequence activation,
2. do not apply the correction while the user is actively dragging/reordering; defer until drag ends,
3. preserve DOM order and selection,
4. use a short card height transition so pure resize corrections do not snap,
5. skip relayout when the computed column count is unchanged.

Some corrections may still visibly change the grid from a single row to multiple rows, or from too few rows to more rows. That is acceptable when real metadata shows the corrected layout has larger visible videos.

### 4.4 Metadata Load Failures

Each clip's rendered card video gets one metadata load attempt for the current sequence render. If the card video reports a metadata load failure:

1. mark that clip's metadata state as failed,
2. treat the failed clip as complete for the current sequence lifecycle,
3. use the fallback aspect ratio for that clip in layout scoring,
4. append a human-readable failure diagnostic to the existing selected-folder log file path.

The failure diagnostic must include:

1. clip name,
2. error or failure reason when available,
3. the fact that fallback layout settings are being used for the clip.

The app should avoid duplicate failure log entries for the same clip within the same sequence load. Metadata failures must not be shown in the activity indicator.

## 5. Runtime Model

`Clip` should store runtime metadata:

1. `durationSec`,
2. intrinsic video width,
3. intrinsic video height.

Layout should derive aspect ratio as `width / height` when both dimensions are valid positive numbers. Invalid or missing dimensions should be treated as unavailable metadata and should fall back to the default aspect ratio for layout scoring.

The metadata is runtime state only. Collection files and pipeline durable data remain filename-based.

`Clip` objects should be canonical for the active pipeline session. The pipeline should own one runtime `Clip` instance per available video file, and pipeline/collection grid sequences should reference those existing clips instead of creating fresh `Clip` objects for every view switch. This lets duration and dimensions travel naturally with the clip during collection switching without a separate metadata cache.

When a clip is newly added to the pipeline during the session, such as after a video edit creates a new file, the pipeline should create one canonical runtime `Clip` for it and use the same rendered-card metadata loading flow when that clip appears in the grid.

## 6. Architecture Notes

The layout scoring policy belongs in `src/ui/display-layout-rules.ts` or a similarly focused UI layout-policy module.

Metadata loading should use the rendered card videos rather than a separate pre-layout probing pass. The grid controller can own card-level browser media events, retry attempts, and result application to `Clip`, because those responsibilities belong to the rendered card lifecycle. The app controller may provide diagnostics wiring, but it should not own low-level video metadata event handling.

The existing `AppDiagnostics` / `err.log` path should be reused for metadata failure diagnostics.

The grid controller should consume metadata from `Clip` for layout scoring. It may own rendered card media elements and their metadata events, but `Clip` remains the source of truth for metadata state. The sequence metadata lifecycle should be explicit enough that tests can cover failure, stale-sequence, and single-relayout behavior.

## 7. Test Requirements

Add unit or focused integration tests for:

1. layout scoring uses per-clip aspect ratios rather than raw cell area,
2. layout scoring can choose a layout with empty final-row slots when it produces larger rendered video area than a fully packed alternative,
3. layout scoring handles large clip counts without over-preferring very wide, low-row grids that shrink contained videos,
4. layout scoring handles mixed aspect ratios by maximizing aggregate rendered area across the actual clips,
5. layout scoring handles portrait, square, and landscape dimensions,
6. layout scoring handles edge cases: zero clips, one clip, unavailable dimensions, invalid dimensions, constrained width/height, and gap values that materially affect cell size,
7. first layout uses fallback aspect ratio for clips whose metadata is not known yet,
8. card video `loadedmetadata` stores duration and dimensions on the canonical `Clip`,
9. metadata-complete relayout waits for all outstanding metadata before considering relayout,
10. metadata-complete relayout does not apply layout if the recomputed column count is unchanged,
11. metadata-complete relayout applies layout if the recomputed column count changes,
12. metadata-complete relayout is deferred while drag/reorder is active,
13. adding a newly created clip to the current sequence can trigger the same metadata-complete relayout flow,
14. stale metadata completions from a prior collection or folder load do not relayout the current sequence,
15. metadata load failure marks the clip failed, logs once, uses fallback aspect ratio, and allows the sequence to complete,
16. pipeline and collection materialization reuse canonical `Clip` instances within the active pipeline session,
17. metadata loaded in pipeline view is still present after switching to a collection containing the same clip,
18. `Clip` stores duration and intrinsic dimensions from metadata.

Existing grid interaction tests should continue to pass unchanged unless their layout assertions need to account for the new metadata-aware inputs.

## 8. Acceptance Criteria

1. Loading the `downhill-racer` full pipeline no longer presents the clips as tiny two-row thumbnails when a three- or four-row layout gives larger visible videos.
2. Loading `static-landscape` may choose a two-row layout even though the final row has one blank slot.
3. Normal-grid layout uses real video dimensions for clips whose metadata is known.
4. First layout appears quickly using known metadata and fallback aspect ratios where needed.
5. Metadata load failures are logged once per clip per sequence load and use fallback aspect ratio.
6. Metadata-complete relayout can improve layout, but only after all outstanding metadata for the current sequence has loaded or failed and only when the best column count changes.
7. Adding a newly created clip can trigger the same relayout decision for the updated sequence.
8. Runtime clip metadata is not persisted to collection files.
9. Tests cover layout scoring, failure logging, metadata-complete relayout, relayout after new-clip insertion, canonical clip reuse, and runtime clip metadata storage.
