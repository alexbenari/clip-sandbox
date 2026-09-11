# Feature Spec: GIF Extraction Workflow

## 1. Summary

Add GIF Extraction as a production app screen inside the existing Clip Sandbox shell. The screen
lets the user open a full movie, continue ordinary playback while exact review is prepared, capture
many prospective clip ranges efficiently, refine boundaries with canonical frame accuracy, and
batch-create MP4 clips in the `extraction-tmp` system pipeline.

Despite the feature name, the first output format is MP4 rather than animated GIF. Created clips
use the original movie and its selected audio, preserve the source dimensions, and never use the
lossy review proxy as export media.

The screen must integrate and adapt the tested player, preparation, range, scheduling, and native
process work in `spikes/native-frame-identity-playback/`. It must not replace that work with a new
player implementation or copy the spike's large Electron composition wholesale.

## 2. User-Visible Goal

The user can move quickly through a full movie, capture approximate moments without stopping
playback, capture exact boundaries while reviewing frame by frame, distinguish which captured
ranges are ready to extract, and create all eligible clips into the movie's collection in
`extraction-tmp` without losing successful results when another range fails.

## 3. Product Context

The primary user is the product's creator, working locally on Windows with a personal collection
of short, GIF-like movie clips. This is an Operate surface: playback, capture state, readiness,
eligibility, and recovery must be immediately legible. The existing Screening Room Workbench visual
system remains authoritative.

The primary workflow advantage is continuous capture. The user can mark multiple interesting
ranges during playback without stopping after every endpoint, then resolve only the ranges that
need exact boundaries before extraction.

## 4. Confirmed Decisions

1. The output is an MP4 clip with source dimensions and source audio.
2. Export reads the original movie, not the review proxy.
3. The default destination is the system pipeline named `extraction-tmp`.
4. The target collection is created lazily on the first successful extraction.
5. The initial collection name is the movie filename without its extension.
6. Later extractions from the same validated movie append to the same collection.
7. Final cleanup of movie names and naming of individual output clips are deferred decisions.
8. Capture remains disabled until exact-review preparation is ready.
9. A range is exact only when both endpoints are canonical source-frame identities.
10. A range is inexact when either endpoint is a playback timestamp.
11. Inexact ranges cannot be exported until the user replaces both timestamp endpoints with exact
    frame endpoints through a later refinement mini-flow.
12. A mixed extraction result keeps successful clips and leaves failed ranges retryable.
13. The center workspace uses the existing player progress bar. It does not add a filmstrip,
    Premiere-style editing timeline, or a second scrub timeline.
14. Every Clips-panel range uses its captured start picture as its thumbnail.

## 5. Terminology

### 5.1 Extraction Source

The original movie selected by the user, including its selected video and audio tracks and its
validated source revision. Export is always associated with this source.

### 5.2 Review Proxy

The prepared GOP1 media used by LibVLC for responsive playback and by exact review for mapped
navigation. It is a disposable review asset and is never an export source.

### 5.3 Exact Endpoint

A start or end position captured from a displayed exact-review frame. It carries canonical source
frame identity, integer timing data, rational timebase, the mapped review time, and source
generation. The canonical ordinal is the authority for extraction.

### 5.4 Timestamp Endpoint

A start or end position captured while ordinary playback continues. It carries the playback time,
source generation, and a preview picture, but does not claim that the visible playback picture has
a canonical frame identity.

### 5.5 Captured Range

A source-bound draft or locked pair of endpoints. Each endpoint is either exact or timestamp-based.
Exactness is derived from the endpoints; it is not a separately editable flag.

### 5.6 Exact Range

A captured range whose start and end are both exact endpoints. A locked exact range is eligible for
extraction when its source association remains valid.

### 5.7 Inexact Range

A captured range with at least one timestamp endpoint. It preserves captured intent but is not
eligible for extraction.

### 5.8 Created Clip

The normal Clip Sandbox `Clip` produced after successful export and inserted into the target
pipeline and collection. A captured range is not a `Clip` until export succeeds.

## 6. Visual and Layout Direction

### 6.1 Approved Direction

The screen uses the approved balanced three-pane workbench shown in:

1. `.impeccable/mocks/extraction-approved-open.png`,
2. `.impeccable/mocks/extraction-approved-folded.png`, and
3. `.impeccable/mocks/extraction-balanced-three-pane.json`.

Those artifacts establish topology, hierarchy, density, and panel behavior. Their filmstrip-style
timeline, imagery, incidental labels, paths, counts, and timestamps are not literal requirements.
This specification supersedes the filmstrip with the existing player's single progress bar.

### 6.2 Shell Placement

The global app bar remains shell-owned and contains application identity, app-screen selection,
Activity, Keyboard shortcuts, Settings, and native window controls. GIF Extraction registers as an
`IAppScreen`; the shell must not branch on the screen id to manufacture extraction behavior.

The GIF Extraction command bar contains screen-level commands and state:

1. `Open movie...`,
2. the opened movie filename when one is present, and
3. compact preparation readiness or progress.

Detailed preparation failures belong in Activity and Errors. Local playback, capture, range, and
extraction actions remain inside the screen.

### 6.3 Three-Pane Workspace

1. **Pipelines panel:** the existing shell-owned left panel. The extraction destination does not
   depend on manually selecting a pipeline: `extraction-tmp` is the default system destination.
2. **Center workspace:** the reused movie player viewport, transport controls, one progress bar,
   concise mode/readiness state, and local capture feedback.
3. **Clips panel:** the shell-owned right panel populated with the current source's range draft and
   locked captured ranges.

General pipeline discovery, arbitrary cross-pipeline destination selection, and dragging captures
to other pipelines or collections are not required by this feature.

### 6.4 Responsive Desktop Behavior

The primary target is the Windows desktop app. When space narrows, either side panel may fold into
the existing named reveal rail and the player consumes the reclaimed width. The central player and
its progress bar must remain usable with both panels open at the normal desktop target and with
either panel folded at narrower supported window widths.

No mobile layout is required.

## 7. Player and Preparation Flow

### 7.1 Empty State

With no movie open, the center presents a restrained empty state and `Open movie...` as the primary
action. The Pipelines and Clips panel hosts remain available according to normal shell behavior.

If the Pipelines root is not configured, movie review may still begin. Extraction remains disabled
and the point-of-action explanation links the user to Settings to configure the destination root.

### 7.2 Provisional Playback

Opening a movie starts ordinary original-source playback as soon as the backend makes it available.
Exact-review preparation continues independently. The player opens paused on its primed preview,
then the user may play with audio according to the existing single-clip audio preference.

While preparation is incomplete:

1. play, pause, rate, volume, and ordinary time seeking remain available,
2. frame stepping and exact frame scrubbing remain unavailable,
3. `Q`, `W`, range locking, and extraction remain unavailable, and
4. the UI explains that capture becomes available when exact review is ready.

Preparation progress uses the backend's real stage vocabulary: validating cache, normalizing when
needed, indexing canonical media, encoding the review proxy, indexing the proxy, validating the
map, ready, failed, or cancelled. A percentage, work count, or ETA is shown only when supplied by
the underlying operation.

### 7.3 Exact-Review Activation

After canonical and proxy preparation, map validation, publication, and exact-reader opening all
succeed, the player activates the prepared proxy and declares exact review ready. Playback and
preparation state remain separate.

Readiness enables capture, frame stepping, exact scrubbing, and range locking. A preparation
failure may leave ordinary playback usable, but capture and extraction remain disabled.

### 7.4 Playback Mode

While the movie is playing:

1. `Q` captures the current playback time as the draft start,
2. `W` captures the current playback time as the draft end,
3. playback continues without pausing or resolving a canonical frame,
4. the displayed picture at start capture is retained as the range thumbnail, and
5. the endpoint is visibly identified as time-based rather than frame-exact.

The product must not label a clock lookup, callback sequence, or nearest-index result as the exact
identity of the picture visible at keydown.

### 7.5 Exact Frame-by-Frame Mode

Pausing after exact review is ready resolves and displays an exact frame. Scrubbing and stepping in
this mode display `IDisplayFrame` values carrying canonical identities.

While an exact frame is displayed:

1. `Q` captures that frame as the draft start,
2. `W` captures that frame as the draft end,
3. the start picture becomes the Clips-panel thumbnail, and
4. the endpoint retains both canonical identity and mapped review time without confusing the two.

Starting playback leaves frame-by-frame mode. A stale previously displayed exact identity must not
be captured after playback resumes.

## 8. Range Workflow

### 8.1 Draft and Locking

`Q` replaces the current draft start. `W` replaces the current draft end. `A` locks or unlocks the
draft. When a locked range exists, the next `Q` or `W` archives it in the Clips panel and begins a
new draft, preserving the behavior already proved by the spike's `RangeCaptureModel`.

A range may mix endpoint kinds. Replacing its timestamp endpoint with an exact endpoint can move it
toward eligibility. Exact range order is validated by canonical ordinal. A mixed or fully
timestamp-based range is validated by its mapped playback positions until the refinement flow
replaces both endpoints.

Equal exact start and end ordinals form a valid one-frame range.

### 8.2 Exactness Is Derived

The state model uses a closed endpoint distinction:

```text
CaptureEndpoint = ExactFrameEndpoint | PlaybackTimestampEndpoint

CapturedRange is exact     when start and end are ExactFrameEndpoint
CapturedRange is inexact   when either endpoint is PlaybackTimestampEndpoint
```

There is no mutable `isExact` boolean that can disagree with the endpoint data. Extraction accepts
only the exact-range form, making accidental timestamp export difficult at the boundary.

### 8.3 Clips-Panel Entries

Every locked range entry contains:

1. the picture captured at its start endpoint,
2. start and end values in a form appropriate to their endpoint kinds,
3. duration or unresolved-duration state,
4. exact/inexact status expressed through text, iconography, and shape,
5. extraction or refinement status, and
6. local actions that apply to that range.

Exact ranges use the established solid container treatment and a lock/exact indicator. Projector
Blue remains reserved for selection, focus, and the active action rather than decorating every
eligible card.

Inexact ranges use a dashed boundary, a clock icon, and the visible label `Needs exact frames`.
They are not colored as errors because they represent valid captured intent. Their local `Refine`
entry point is visible but may remain disabled or explanatory until the refinement mini-flow is
specified and implemented.

An inexact start thumbnail is a preview of the displayed playback picture associated with the
captured timestamp. It is not evidence of canonical frame identity.

### 8.4 Queue States

A locked range may be:

1. `needs-exact-frames`,
2. `ready-to-extract`,
3. `extracting`,
4. `created`, or
5. `failed` and retryable.

Successfully created entries remain visible and cannot be accidentally extracted again. Failed
entries retain their range data. Clearing entries affects only the working queue; it never deletes
created media or removes a created clip from its collection.

### 8.5 Refinement Boundary

The detailed inexact-to-exact refinement interaction is intentionally deferred. This feature must
nevertheless preserve enough information to support it later:

1. both original endpoint kinds and values,
2. their source generation and validated source association,
3. the start thumbnail,
4. the mapped review positions needed to reopen nearby exact frames, and
5. an explicit local `Refine` entry point.

Until that mini-flow exists, inexact ranges remain visible but non-exportable. The app must never
silently snap them to nearby frames and export them.

## 9. Extraction and Publication

### 9.1 Eligibility

The extraction action is enabled only when all prerequisite destination state is valid and at least
one locked range is `ready-to-extract`. Its label counts eligible ranges, not every panel entry.
Supporting copy distinguishes the queue, for example `3 exact - 2 need frames`.

Inexact, already-created, and currently extracting ranges are excluded from a new batch.

### 9.2 Source and Boundaries

For each eligible range, extraction must:

1. validate the original source revision and selected tracks,
2. resolve the canonical start and end ordinals in the original picture sequence,
3. include both the first and last selected pictures,
4. use the original source video and audio rather than proxy media,
5. preserve the source dimensions, and
6. align audio to the resolved source interval without treating repaired canonical PTS or proxy PTS
   as original-container seek times.

The exporter may use validated normalization or index provenance to resolve the source interval,
but the review proxy cannot become the media source for the output.

### 9.3 Default Destination

The app resolves the system pipeline `extraction-tmp` beneath the configured Pipelines root. If the
destination cannot be resolved or written, extraction fails before starting FFmpeg work and reports
an actionable destination error.

The movie collection is created only after the first clip in the batch has been created
successfully. Its initial display name is the movie filename without the final extension; its
backing collection filename follows the existing collection validation and serialization rules.

Later sessions append to that collection only when the opened movie has the same validated source
identity. Collection-name equality by itself is insufficient evidence that two sources are the same
movie. The execution plan must choose a source-association persistence mechanism without changing
the plain-text collection format implicitly.

### 9.4 Insertion

Each successful runtime result is converted to the normal folder-entry/Clip representation, added
to the `extraction-tmp` pipeline inventory, and appended to the movie collection through the
existing `Pipeline` and `PipelineSession` mutation boundaries. Renderer DOM state is not the source
of durable membership.

The collection file is updated as part of publishing each successful result or through an equally
safe batch publication contract. The UI must not report success while the media exists but the
collection membership has silently failed.

### 9.5 Partial Success

Each exact range produces an independently identifiable result.

1. Successful outputs remain on disk and in the target collection.
2. Their range entries move to `created`.
3. Failed ranges move to `failed` and remain retryable.
4. Retry includes only failed eligible ranges and cannot recreate successful outputs.
5. Activity and Errors reports the batch summary and individual actionable failures.

The batch is therefore not rolled back merely because one range failed. Publication of any single
clip must still avoid a half-published media/collection state.

## 10. Naming

### 10.1 Collection Name

For the first version:

```text
movie filename: Paris.Texas.1984.1080p.mkv
collection name: Paris.Texas.1984.1080p
```

Future work may remove codec, resolution, release-group, or other filename metadata. This spec does
not define that parser.

### 10.2 Output Clip Names

The user-facing rule for individual output filenames is not decided by this specification. The
execution plan may sequence player/screen integration before the production exporter, but it must
not invent a permanent naming policy. Actual export cannot be considered complete until a
collision-safe initial naming rule is approved.

## 11. Session and Source Behavior

The range queue belongs to one opened source generation. Switching app screens keeps the extraction
screen mounted and preserves its current movie and ranges according to the shell contract.

Opening a different movie invalidates the active source generation. Stale frames, preparation
updates, thumbnails, and export results must not enter the new session. If uncreated ranges exist,
the app asks before discarding them.

For the first implementation, captured ranges do not need to survive application restart. Durable
range persistence is future work; if later added, it must bind ranges to the validated original
source and preparation identity rather than to a filename alone. User-authored ranges must never be
stored as disposable prepared-review cache entries.

## 12. Errors and Recovery

The screen and Activity and Errors surface distinguish at least:

1. unsupported media,
2. source changed during preparation or before export,
3. exact-review preparation failed,
4. incompatible or corrupt prepared artifacts,
5. invalid canonical/proxy map,
6. unavailable or unwritable Pipelines root,
7. failure to resolve or create `extraction-tmp`,
8. target collection conflict or persistence failure,
9. native process failure or timeout,
10. extraction failure for one range, and
11. user cancellation.

Cancellation is not shown as failure and is not automatically retried. A failed preparation can
leave playback available. A failed extraction can leave other successful batch results available.
Technical details remain in bounded logs and Activity; primary UI copy states the consequence and
next action.

## 13. Keyboard and Accessibility

1. `Space` plays or pauses.
2. Left and Right step exact frames when exact review is ready and playback is paused.
3. `Q` captures or replaces the start endpoint.
4. `W` captures or replaces the end endpoint.
5. `A` locks or unlocks the current range.
6. Shortcut handling is active only while GIF Extraction is the active screen and does not steal
   keystrokes from text-entry controls.
7. The global Keyboard shortcuts surface obtains these descriptors from the screen registration;
   it does not duplicate a separate hard-coded list.
8. Exactness, failure, selection, and readiness are never communicated by color alone.
9. Disabled controls have an adjacent or accessible explanation of the unmet prerequisite.
10. Preparation and batch updates use appropriate status semantics without repeatedly interrupting
    focus.
11. Initial screen focus goes to `Open movie...` when empty and to the player/progress control when
    a movie is already open.

## 14. Architecture and Reuse Constraints

### 14.1 Reuse the Proved Player Work

The implementation must begin from the isolated native-frame player rather than designing a new
playback control. Reuse or adapt the proved responsibilities represented by:

1. `spikes/native-frame-identity-playback/src/ui/control-app.ts`,
2. `spikes/native-frame-identity-playback/src/ui/keyboard-controller.ts`,
3. `spikes/native-frame-identity-playback/src/model/range-capture-model.ts`,
4. `spikes/native-frame-identity-playback/src/model/captured-frame-range.ts`,
5. the playback/exact adapters and schedulers under `src/adapter/`,
6. the preparation policy and cache work under `src/preparation/`, and
7. the native helpers and framed binary transport.

Integration may reshape interfaces and split responsibilities according to `backend-design.md`, but
must preserve proved behavior and regression coverage. It must not rewrite the native algorithms
merely to achieve new class names.

### 14.2 Production Boundaries

1. Keep `src/app/app-controller.ts` as composition root and orchestration layer.
2. Add the extraction screen through the existing `IAppScreen` registration contract.
3. Keep player presentation and local interaction in focused `src/ui/` controls.
4. Keep range rules outside DOM code.
5. Keep preparation, playback, and reader lifecycle behind an injected renderer-safe service.
6. Keep Electron IPC, executable discovery, filesystem paths, FFmpeg, LibVLC, BestSource, and helper
   processes outside the renderer.
7. Keep pipeline and collection mutation in `Pipeline` and active working state in
   `PipelineSession`.
8. Reuse the existing `ClipEditor -> ElectronVideoEditService -> preload -> video-edit-runtime`
   trust-boundary pattern for export, but do not pretend its current edit request already supports
   canonical-range extraction.
9. Do not add per-property or per-frame IPC round trips. Pixels and associated identity metadata
   travel together through the bounded delivery contract.

### 14.3 First-Stage Native Scope

The first production integration remains software-only:

1. software FFmpeg proxy generation,
2. software BestSource indexing,
3. no QSV implementation,
4. no hardware selection or capability checks,
5. no acceleration fallback wrapper,
6. no accelerated runtime package, and
7. no disabled hardware feature flag.

`ProxyCreator` remains a replaceable boundary for a separately qualified future implementation.

### 14.4 State and Ownership

Captured endpoints and ranges are immutable values. The extraction session has identity and mutable
lifecycle because it owns one opened movie, preparation subscription, playback/reader resources,
draft, queue, source generation, and disposal.

The endpoint union and exact-range eligibility rule have one canonical domain definition. UI,
application workflow, IPC, and export code must not maintain competing exactness calculations.

Prepared-review cache artifacts, in-memory decoded-picture caches, user-authored captured ranges,
created media, and collection files have distinct owners and lifetimes.

## 15. Explicit Non-Goals

1. Animated GIF output.
2. Exporting from the review proxy.
3. A filmstrip or nonlinear-editor timeline.
4. The detailed inexact-range refinement mini-flow.
5. Permanent individual clip-naming rules.
6. Automatic movie-name cleanup beyond removing the final extension.
7. Arbitrary output pipeline selection.
8. General pipeline discovery or drag-to-pipeline behavior.
9. Durable captured-range persistence across app restarts.
10. QSV or any other hardware-accelerated preparation path.
11. HDR, interlace, rotation, or source-track-selection policy beyond behavior already established
    by the selected player stack.
12. Replacing the app shell, visual system, framework-free renderer, or collection persistence
    model.

## 16. Acceptance Criteria

1. GIF Extraction appears as a registered app screen without shell id branching.
2. Its screen command bar contains Open movie and preparation state; those controls do not enter the
   global app bar.
3. The center uses the integrated tested player and one progress bar with no filmstrip or secondary
   editing timeline.
4. Ordinary playback becomes usable before cold exact-review preparation completes.
5. All capture controls remain disabled until exact review is ready.
6. Pressing `Q` or `W` during playback records a timestamp endpoint and playback continues.
7. Pressing `Q` or `W` on a displayed exact-review frame records its canonical identity.
8. A range with either timestamp endpoint is visibly inexact and cannot be submitted to extraction.
9. Exact/inexact status is conveyed by text and icon/shape, not color alone.
10. Every locked range shows the captured start picture as its thumbnail.
11. A locked range with two valid exact endpoints is eligible for extraction, including a one-frame
    range.
12. Extraction counts and processes eligible exact ranges only.
13. Exported video is derived from the original movie, preserves source dimensions, includes source
    audio, and has the exact selected first and last source pictures.
14. The first successful extraction resolves `extraction-tmp`, lazily creates the movie-stem
    collection, and inserts the created Clip into both pipeline inventory and collection membership.
15. Later extraction from the same validated movie appends to the same collection.
16. A mixed-result batch preserves and publishes successful clips, marks them created, and leaves
    failed exact ranges retryable without duplicating successful outputs.
17. Inexact ranges remain available for the later refinement flow and are never silently snapped or
    approximately exported.
18. Source switching rejects stale frames, progress, thumbnails, and results and protects uncreated
    ranges from silent loss.
19. Preparation, export, cancellation, destination, and collection failures produce concise recovery
    UI plus bounded technical details in Activity and Errors.
20. Side-panel folding, screen switching, initial focus, keyboard scope, reduced motion, and
    framework-free operation preserve the existing shell contracts.

## 17. Verification Requirements

Verification must prove the user-visible goal: the user can capture rapidly in playback, capture
accurately in exact review, understand which ranges are eligible, and create correct source-derived
clips without losing successful batch results.

### 17.1 Domain and Caller-Level Tests

Use concrete mixed endpoint examples to prove:

1. exact + exact produces an extractable range,
2. exact + timestamp, timestamp + exact, and timestamp + timestamp produce inexact ranges,
3. range order and equal-frame behavior,
4. playback capture does not pause,
5. resumed playback cannot reuse a stale exact identity,
6. the extraction workflow cannot accept an inexact range,
7. retry excludes already-created results, and
8. same-movie reuse depends on validated association rather than collection name alone.

Caller-level preparation tests retain the required cold-build, warm-cache, invalidation,
cancellation, source-generation, and lease behavior from `backend-design.md`.

### 17.2 Integration and Native Verification

1. Verify real audible playback in Electron.
2. Verify exact frame step and scrub behavior with VFR, repaired timestamps, and equal-looking
   repeated frames.
3. Verify timestamp capture during continuous playback without interruption.
4. Verify exact endpoint capture from displayed scrubbed/stepped frames.
5. Verify first and last exported source pictures and audio boundaries from the original movie,
   including a normalized-input case.
6. Verify partial export failure and retry without duplicate successful outputs.
7. Verify cache reopen, source replacement, source switching, process failure, cancellation, and
   disposal without stale delivery or leaked workers.
8. Verify that first-stage package composition contains no QSV or acceleration-specific code or
   runtime dependency.

### 17.3 Manual Windows QA

In the actual Electron app, verify:

1. the player remains the visual focus with both panels open,
2. the single progress bar is usable at supported window widths,
3. continuous `Q`/`W` playback capture feels immediate and does not interrupt audio or motion,
4. exact and inexact range entries are distinguishable at a glance,
5. start thumbnails correspond to what the user captured,
6. panel folding reallocates the player smoothly,
7. keyboard focus and shortcuts follow the active screen, and
8. progress, partial success, failure, and retry remain understandable without consulting logs.

## 18. Deferred Decisions Before Full Export Completion

1. The detailed `Refine` mini-flow for replacing timestamp endpoints with exact frames.
2. The initial collision-safe naming rule for individual output clips.
3. The future movie-title cleanup policy for collection names.
4. The persistence mechanism that binds a movie source identity to its reused collection without
   changing plain-text collection contents.
5. Policies for HDR, interlacing, rotation, and explicit track selection.

These decisions do not block player/screen integration or the exact/inexact capture model. The
individual output-name rule does block claiming the production export path complete.

## 19. Governing Guidance

This specification is governed by:

1. `PRODUCT.md` and `DESIGN.md`,
2. `docs/agent-docs/agent-architecture-map.md`,
3. `coding-quality.md`,
4. `spikes/native-frame-identity-playback/docs/frame-scrub-supporting-player-control-integration-handoof.md`,
5. `spikes/native-frame-identity-playback/docs/backend-design.md`,
6. the approved extraction comps listed in section 6.1,
7. `impeccable` shape and Operate guidance,
8. `api-and-interface-design`,
9. `domain-modeling`,
10. `error-and-correctness-traps`,
11. `testing-discipline`, and
12. `working-with-users-and-team`.

Because this document specifies future work rather than implemented production architecture,
`docs/agent-docs/agent-architecture-map.md` remains unchanged. Its durable architecture and routing
guidance must be updated as part of implementation when these proposed components become real.
