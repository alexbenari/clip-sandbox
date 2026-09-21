# Feature Spec: GIF Extraction Workflow

## 1. Summary

Add GIF Extraction and its focused Refine Gif companion as production app screens inside the
existing Clip Sandbox shell. GIF Extraction lets the user open a full movie, continue ordinary
playback while exact review is prepared, capture many prospective clip ranges efficiently, and
batch-create MP4 clips in the `extraction-tmp` system pipeline. Refine Gif turns one inexact capture
at a time into an exact range without competing with the broader capture queue.

Despite the feature name, the first output format is MP4 rather than animated GIF. Created clips
use the original movie and its selected audio, preserve the source dimensions, and never use the
lossy review proxy as export media.

Both screens must integrate and adapt the tested player, preparation, range, scheduling, and native
process work identified by the integration handoff's selected-implementation source map. They must
not replace that work with a new player implementation, indiscriminately copy the spike folder, or
copy the spike's large Electron composition wholesale.

## 2. User-Visible Goal

The user can move quickly through a full movie, capture approximate moments without stopping
playback, capture exact boundaries while reviewing frame by frame, refine any inexact capture in a
dedicated workspace, distinguish which captured ranges are ready to extract, and create all
eligible clips into the movie's collection in `extraction-tmp` without losing successful results
when another range fails.

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
7. Individual clips use the collection name plus a three-digit sequence, for example
   `Paris-Texas-001.mp4`, `Paris-Texas-002.mp4`, and so on.
8. Capture remains disabled until exact-review preparation is ready.
9. A range is exact only when both endpoints are canonical source-frame identities.
10. A range is inexact when either endpoint is a playback timestamp.
11. Inexact ranges cannot be exported until the user replaces both timestamp endpoints with exact
    frame endpoints in the Refine Gif screen.
12. A mixed extraction result keeps successful clips and leaves failed ranges retryable.
13. The center workspace uses the existing player progress bar. It does not add a filmstrip,
    Premiere-style editing timeline, or a second scrub timeline.
14. Every Clips-panel range uses its captured start picture as its thumbnail.
15. Opening a movie checks the prepared-review cache before starting any expensive indexing or
    proxy creation.
16. Captured-range thumbnails live under the app-data `cache` folder; that folder is wholly
    ephemeral and is deleted on normal app close or cleaned on the next startup after an unclean exit.

## 5. Terminology

### 5.1 Extraction Source

The original movie selected by the user, including its selected video and audio tracks and its
validated source revision. Export is always associated with this source.

### 5.2 Review Proxy

The prepared GOP1 media used by LibVLC for responsive playback and by exact review for mapped
navigation. It is regenerable but remains persistently cached across app sessions while valid. It
is never an export source.

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

### 5.9 Refine Gif Session

A focused editing session for one inexact captured range. It stages replacement endpoints against
the same validated movie source and commits an updated exact range only when both endpoints are
canonical and ordered correctly.

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
Activity, Keyboard shortcuts, Settings, and native window controls. GIF Extraction and Refine Gif
each register as an `IAppScreen`; the shell must not branch on either screen id to manufacture their
behavior.

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

### 6.4 Refine Gif Workspace

Refine Gif is a focused app screen rather than a modal or an editing layer inside a range card. Its
central workspace contains one selected inexact range, the same integrated player, its transport,
and its single progress bar. It does not render a second copy of the capture queue or add an editor
timeline.

The screen command bar identifies the range being refined and provides a clear return to GIF
Extraction. On entry, the shell-owned Clips panel is open and shows all ranges from the current
source that still require refinement, with the current range selected. The user may fold the panel
afterward through the existing shell control. The panel and the mounted GIF Extraction screen read
the same live extraction-session state, so both reflect a committed exact replacement immediately.
Refine Gif does not create a separate source of truth for the list.

The editing surface gives one endpoint primary focus at a time. It shows whether Start or End is
being resolved, the approximate timestamp that supplied the starting location, the current exact
frame identity, and explicit `Set exact start` or `Set exact end` actions. The player remains larger
and more visually important than this compact endpoint state.

### 6.5 Responsive Desktop Behavior

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

### 7.2 Cache Lookup Before Preparation

After the user chooses a movie, the player first inspects source and track identity and checks the
persistent prepared-review cache using the validated cache identity from the existing control. A
valid cache hit acquires the prepared bundle and opens the exact reader without rebuilding either
index or the proxy. A missing, incompatible, corrupt, or observably stale entry proceeds to the
normal preparation flow with its reason classified rather than disguised as an ordinary miss.

The cache check precedes expensive indexing, normalization, or proxy creation. It does not delay
ordinary source playback beyond the minimum source inspection needed to make the lookup safe.

Prepared-review media, maps, and BestSource indexes remain the persistent cache described by the
existing backend design. They do not live in the app-data `cache` folder that is deleted on close;
that ephemeral folder is reserved for captured-range thumbnails and other disposable UI previews.
The default persistent locations are `<app-folder>/frame-index-cache` for frame indexes and
`<app-folder>/proxy-cache` for prepared proxies and their associated maps. Opening either app screen
must reuse a valid entry from those locations rather than rebuilding it.

### 7.3 Provisional Playback

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

### 7.4 Exact-Review Activation

After canonical and proxy preparation, map validation, publication, and exact-reader opening all
succeed, the player activates the prepared proxy and declares exact review ready. Playback and
preparation state remain separate.

Readiness enables capture, frame stepping, exact scrubbing, and range locking. A preparation
failure may leave ordinary playback usable, but capture and extraction remain disabled.

### 7.5 Playback Mode

While the movie is playing:

1. `Q` captures the current playback time as the draft start,
2. `W` captures the current playback time as the draft end,
3. playback continues without pausing or resolving a canonical frame,
4. the displayed picture at start capture is retained as the range thumbnail, and
5. the endpoint is visibly identified as time-based rather than frame-exact.

The product must not label a clock lookup, callback sequence, or nearest-index result as the exact
identity of the picture visible at keydown.

### 7.6 Exact Frame-by-Frame Mode

Pausing after exact review is ready resolves and displays an exact frame. Scrubbing and stepping in
this mode display `IDisplayFrame` values carrying canonical identities.

While an exact frame is displayed:

1. `Q` captures that frame as the draft start,
2. `W` captures that frame as the draft end,
3. the start picture becomes the Clips-panel thumbnail, and
4. the endpoint retains both canonical identity and mapped review time without confusing the two.

Starting playback leaves frame-by-frame mode. A stale previously displayed exact identity must not
be captured after playback resumes.

A Left or Right press steps one exact frame. Holding either key performs the paced adjacent stepping
already implemented by the control's dedicated scheduler. Scrub targets continue to use bounded
latest-target behavior; held adjacent steps must not be collapsed as though they were scrub input.

## 8. Range Workflow

### 8.1 Draft and Locking

`Q` replaces the current draft start. `W` replaces the current draft end. Before locking, further
`Q` or `W` presses replace the corresponding endpoint on that same draft. `A` locks the completed
draft and adds it to the Clips panel. The next `Q` starts a new capture rather than changing the
locked range, preserving the behavior already proved by the spike's `RangeCaptureModel`.

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
They are not colored as errors because they represent valid captured intent. Double-clicking an
inexact range or activating its local `Refine` action opens that range in Refine Gif.

An inexact start thumbnail is a preview of the displayed playback picture associated with the
captured timestamp. It is not evidence of canonical frame identity.

Thumbnail files are written beneath the application data directory in `cache/thumbnails`. The
renderer receives opaque references rather than arbitrary filesystem paths. The entire app-owned
`cache` directory is disposable: close player/native handles first, remove it on orderly app close,
and retry cleanup on the next startup after a crash. Settings, captured-range state, prepared-review
indexes/proxies, created MP4s, and collection files must never be placed in this ephemeral folder.

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

### 8.5 Entering Refine Gif

Double-clicking an inexact range or activating its local `Refine` action navigates to Refine Gif
with the selected range, its parent movie, prepared-review reference, validated source generation,
and the `extraction-tmp` destination context. The screen reuses the current prepared-review lease
when possible; otherwise it performs the same safe cache lookup and readiness checks as GIF
Extraction.

If both endpoints are timestamps, Start is selected first. If only one endpoint is timestamp-based,
that endpoint is selected. The player seeks near the selected endpoint's approximate time, enters
paused exact frame-by-frame mode, and displays the exact frame resolved through the prepared map.
The approximate timestamp is navigation input only; it is not silently accepted as the replacement.

### 8.6 Refining One Endpoint

The user scrubs with the player's existing progress bar or steps with Left and Right until the
desired exact frame is displayed. The screen offers the pointer-accessible action appropriate to
the selected endpoint:

1. `Set exact start` stores the displayed canonical frame as the staged start, or
2. `Set exact end` stores the displayed canonical frame as the staged end.

`Q` remains the keyboard equivalent for setting Start and `W` for setting End. Pressing the key for
the other endpoint changes focus to that endpoint and seeks near its captured position; it does not
overwrite the currently selected endpoint by surprise. Further `Q` or `W` presses replace the
corresponding staged endpoint until the user locks the refinement with `A`.

After Start is staged, Refine Gif advances to End when End still needs resolution. The user may
move back to Start at any time. The staged range displays both endpoint kinds and refuses completion
when the exact end ordinal precedes the exact start ordinal.

### 8.7 Completing Refinement

Once both staged endpoints are exact and ordered, `A` locks the refinement and atomically replaces
the original inexact range with the new exact value. The live Clips panel updates immediately
without a reload. The replacement keeps the range's stable identity and queue position, refreshes
its start thumbnail from the chosen exact start frame, changes its status to `ready-to-extract`,
and discards superseded ephemeral thumbnails. The just-refined entry remains in place long enough
to show its exact treatment and current-range actions; it leaves the needs-refinement list only when
the user advances or returns.

After the refined range is locked, the local `Extract` action becomes available and extracts only
that current range; its keyboard shortcut is `E`. The Clips panel also owns `Extract All`, in both
GIF Extraction and Refine Gif, and submits every currently eligible locked exact range in the
source-bound queue. Neither action includes an unlocked, inexact, extracting, or already-created
range.

After saving, the screen presents two equally clear continuations:

1. `Next inexact clip` opens the next range in queue order, when one exists, or
2. `Back to GIF Extraction` returns to the capture screen and restores meaningful focus to the
   refined range in the Clips panel.

Leaving Refine Gif before locking discards only the staged replacements and leaves the original
inexact range untouched. Source invalidation, preparation failure, or a removed range blocks the
lock and returns an actionable explanation. The app must never silently snap an inexact range to
nearby frames and export it.

## 9. Extraction and Publication

### 9.1 Eligibility

The Clips-panel `Extract All` action is enabled only when all prerequisite destination state is valid
and at least one locked range is `ready-to-extract`. Its label counts eligible ranges, not every
panel entry. Supporting copy distinguishes the queue, for example `3 exact - 2 need frames`.

Refine Gif's local `Extract` action is enabled only when the current range is locked,
`ready-to-extract`, and still belongs to the active source generation. It submits that range alone.

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

The active extraction session resolves that collection once for the opened movie, and every later
successful extraction from that source appends to it. If a collection with the derived name already
exists in `extraction-tmp`, the app reuses it rather than creating a duplicate. The first version
does not add hidden source metadata to the plain-text collection or introduce a separate persistent
source-to-collection registry. Distinguishing two different source files with the same filename
stem is deferred and must not be disguised as already solved.

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
movie filename: Paris-Texas.mkv
collection name: Paris-Texas
```

Future work may remove codec, resolution, release-group, or other filename metadata. This spec does
not define that parser.

### 10.2 Output Clip Names

An output filename is:

```text
<collection-name>-<sequence>.mp4
```

The sequence begins at `001` and is padded to at least three digits. For example, the first two
clips in the `Paris-Texas` collection are `Paris-Texas-001.mp4` and `Paris-Texas-002.mp4`. Values
above `999` continue without truncation.

The trusted extraction runtime allocates the next number immediately before creating the output.
It considers existing output filenames for that collection, serializes allocations within one
collection, and creates the file without overwrite. If the name has appeared since inspection, it
rescans and tries the next number. Failed or cancelled work may leave a numbering gap; retry uses a
new safe number rather than overwriting or guessing that an earlier result is absent. Collection
membership records the actual filename returned by the successful runtime result.

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
9. output-name allocation or no-overwrite conflict,
10. native process failure or timeout,
11. extraction failure for one range, and
12. user cancellation.

Cancellation is not shown as failure and is not automatically retried. A failed preparation can
leave playback available. A failed extraction can leave other successful batch results available.
Technical details remain in bounded logs and Activity; primary UI copy states the consequence and
next action.

## 13. Keyboard and Accessibility

1. `Space` plays or pauses.
2. Left and Right step exact frames when exact review is ready and playback is paused.
3. `Q` captures or replaces the start endpoint.
4. `W` captures or replaces the end endpoint.
5. `A` locks the current draft in GIF Extraction or commits the valid staged refinement in Refine
   Gif.
6. `E` extracts the current locked exact range in Refine Gif.
7. Shortcut handling is active only for the active GIF Extraction or Refine Gif screen and does not
   steal keystrokes from text-entry controls.
8. The global Keyboard shortcuts surface obtains these descriptors from the screen registration;
   it does not duplicate a separate hard-coded list.
9. Exactness, failure, selection, and readiness are never communicated by color alone.
10. Disabled controls have an adjacent or accessible explanation of the unmet prerequisite.
11. Preparation and batch updates use appropriate status semantics without repeatedly interrupting
    focus.
12. Initial screen focus goes to `Open movie...` when empty and to the player/progress control when
    a movie is already open.

## 14. Architecture and Reuse Constraints

### 14.1 Reuse the Proved Player Work

The implementation must begin from the isolated native-frame player rather than designing a new
playback control. The integration handoff's selected-implementation source map is the bounded
starting point. Inspect these files and only their direct dependencies and tests as needed:

1. Player surface and keyboard contracts: `src/ui/control-app.ts`,
   `src/ui/keyboard-controller.ts`, `src/ui/control-api.ts`, `electron/control.html`, and
   `electron/control.css`.
2. Range and frame identity: `src/model/range-capture-model.ts`,
   `src/model/captured-frame-range.ts`, and `src/model/source-frame-identity.ts`.
3. Renderer/trusted-process composition references: `electron/control-preload.cjs` and
   `electron/main.cjs`.
4. Mode orchestration: `src/adapter/hybrid-frame-playback-adapter.ts`.
5. Playback, exact-frame delivery, and input scheduling:
   `src/adapter/libvlc-playback-adapter.ts`, `src/adapter/bestsource-frame-playback-adapter.ts`,
   `src/adapter/adjacent-step-scheduler.ts`, and `src/adapter/progressive-frame-mailbox.ts`.
6. Adapter and process contracts: `src/adapter/frame-playback-adapter.ts`,
   `src/adapter/native-process-client.ts`, and `native/common/protocol.cpp`.
7. Preparation and persistent-cache behavior: `src/preparation/interactive-preparation.mjs`,
   `src/preparation/preparation-coordinator.mjs`, `src/preparation/preparation-policy.mjs`, and
   `src/preparation/preparation-cache.mjs`.
8. Software proxy creation: `src/preparation/all-intra-proxy-preparation.mjs` and the software
   encoder path in `src/preparation/review-proxy-encoder.mjs`.
9. Native helpers: `native/media-service/` and
   `native/bestsource-gate/prepared_video_session.cpp`.

All paths in this subsection are relative to `spikes/native-frame-identity-playback/`. Reports,
experiments, accelerated variants, and unrelated spike material are evidence only, not a request to
read or port the folder wholesale.

Integration may reshape interfaces and split responsibilities according to `backend-design.md`, but
must preserve proved behavior and regression coverage. It must not rewrite the native algorithms
merely to achieve new class names.

### 14.2 Production Boundaries

1. Keep `src/app/app-controller.ts` as composition root and orchestration layer.
2. Add both GIF Extraction and Refine Gif through the existing `IAppScreen` registration contract.
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
10. Give one extraction-session owner responsibility for the opened source, live range queue,
    prepared-review lease, destination context, and source generation shared by both screens.
11. Keep Refine Gif's staged endpoint edits local until `A` commits one valid immutable replacement;
    update screen and panel views through shared state notification rather than direct cross-screen
    DOM mutation.

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

Prepared-review cache artifacts, ephemeral thumbnail files, in-memory decoded-picture caches,
user-authored captured ranges, created media, and collection files have distinct owners and
lifetimes. Closing the app deletes only the ephemeral app-data `cache` tree; it does not delete the
persistent `frame-index-cache` or `proxy-cache` trees.

## 15. Explicit Non-Goals

1. Animated GIF output.
2. Exporting from the review proxy.
3. A filmstrip or nonlinear-editor timeline.
4. Automatic movie-name cleanup beyond removing the final extension.
5. Disambiguating different source movies that produce the same filename stem.
6. Arbitrary output pipeline selection.
7. General pipeline discovery or drag-to-pipeline behavior.
8. Durable captured-range persistence across app restarts.
9. QSV or any other hardware-accelerated preparation path.
10. HDR, interlace, rotation, or source-track-selection policy beyond behavior already established
    by the selected player stack.
11. Replacing the app shell, visual system, framework-free renderer, or collection persistence
    model.
12. Reimplementing the tested player control or broadly porting unrelated spike material.

## 16. Acceptance Criteria

1. GIF Extraction and Refine Gif appear as registered app screens without shell id branching.
2. Their screen command bars contain only their local movie, preparation, range, and navigation
   state; those controls do not enter the global app bar.
3. Both centers reuse the integrated tested player and its one progress bar, with no filmstrip or
   secondary editing timeline.
4. Selecting a movie checks `<app-folder>/frame-index-cache` and `<app-folder>/proxy-cache` before
   preparation; a valid hit reopens the prepared review without rebuilding its index or proxy.
5. Ordinary playback becomes usable before cold exact-review preparation completes, while all
   capture controls remain disabled until exact review is ready.
6. Pressing `Q` or `W` during playback records a timestamp endpoint and playback continues.
7. Pressing `Q` or `W` on a displayed exact-review frame records its canonical identity.
8. Before `A`, repeated `Q` or `W` replaces the corresponding draft endpoint; `A` locks the range,
   and the next `Q` begins a new capture without altering it.
9. A range with either timestamp endpoint is visibly inexact and cannot be submitted to extraction;
   exact/inexact status is conveyed by text and icon/shape, not color alone.
10. Every locked range shows the captured start picture as its thumbnail, whether that picture came
    from timestamp playback or an exact frame.
11. Double-clicking an inexact range or activating `Refine` opens Refine Gif near the selected
    approximate endpoint, paused in exact frame-by-frame mode, with the needs-refinement list open.
12. Refine Gif dedicates its center to one range, resolves Start and End one at a time through the
    existing progress bar and frame controls, and never accepts a timestamp as an exact replacement.
13. `A` atomically commits a valid two-endpoint refinement, retains the range identity and order,
    and updates the live Clips panel immediately; the user can then open the next inexact range or
    return to GIF Extraction.
14. Refine Gif's `Extract`/`E` extracts only the current locked exact range. The Clips-panel
    `Extract All` in both screens submits all and only currently eligible locked exact ranges.
15. A locked range with two valid exact endpoints is eligible for extraction, including a one-frame
    range; held Left or Right retains the tested accelerating exact-step behavior.
16. Exported video is derived from the original movie, preserves source dimensions, includes source
    audio, and has the exact selected first and last source pictures.
17. Output names follow `<collection-name>-NNN.mp4`, begin at `001`, and are allocated without
    overwriting an existing file.
18. The first successful extraction resolves `extraction-tmp`, lazily creates or reuses the
    movie-stem collection, and inserts the created Clip into both pipeline inventory and collection
    membership. Later extraction for the opened movie appends to that collection.
19. A mixed-result batch preserves and publishes successful clips, marks them created, and leaves
    failed exact ranges retryable without duplicating successful outputs.
20. Source switching rejects stale frames, progress, thumbnails, and results and protects uncreated
    ranges from silent loss.
21. Orderly app close deletes the ephemeral app-data `cache` tree, and startup retries cleanup after
    an unclean exit, without deleting prepared indexes, proxies, created MP4s, or collections.
22. Preparation, export, cancellation, destination, naming, and collection failures produce concise
    recovery UI plus bounded technical details in Activity and Errors.
23. Side-panel folding, screen switching, initial focus, keyboard scope, reduced motion, and
    framework-free operation preserve the existing shell contracts.

## 17. Verification Requirements

Verification must prove the user-visible goal: the user can capture rapidly in playback, capture
accurately in exact review, refine inexact ranges without losing context, understand which ranges
are eligible, and create correctly named source-derived clips without losing successful batch
results.

### 17.1 Domain and Caller-Level Tests

Use concrete mixed endpoint examples to prove:

1. exact + exact produces an extractable range,
2. exact + timestamp, timestamp + exact, and timestamp + timestamp produce inexact ranges,
3. range order and equal-frame behavior,
4. playback capture does not pause,
5. repeated `Q`/`W` replaces an unlocked draft and `A` prevents later capture from mutating it,
6. resumed playback cannot reuse a stale exact identity,
7. refinement stages one endpoint at a time and commits only an ordered exact pair atomically,
8. leaving Refine Gif before `A` leaves the original inexact range unchanged,
9. current-only and extract-all selection exclude inexact, unlocked, extracting, and created ranges,
10. retry excludes already-created results, and
11. sequence allocation starts at `001`, advances safely, tolerates gaps, and never overwrites.

Caller-level preparation tests retain the required cold-build, warm-cache, invalidation,
cancellation, source-generation, and lease behavior from `backend-design.md`, including proof that
a valid warm-cache lookup performs no new indexing or proxy encoding.

### 17.2 Integration and Native Verification

1. Verify real audible playback in Electron.
2. Verify exact frame step and scrub behavior with VFR, repaired timestamps, and equal-looking
   repeated frames.
3. Verify timestamp capture during continuous playback without interruption.
4. Verify exact endpoint capture from displayed scrubbed/stepped frames.
5. Verify first and last exported source pictures and audio boundaries from the original movie,
   including a normalized-input case.
6. Verify partial export failure and retry without duplicate successful outputs.
7. Verify Refine Gif navigation, approximate seek, one-endpoint-at-a-time staging, atomic `A`
   commit, live list update, current-only extraction, and next/back continuation.
8. Verify sequential output naming, collision handling, and collection membership using the actual
   successful runtime filename.
9. Verify cache reopen, source replacement, source switching, process failure, cancellation, and
   disposal without stale delivery or leaked workers.
10. Verify orderly and crash-recovery thumbnail-cache cleanup while persistent prepared-review
    caches and exported media remain intact.
11. Verify that first-stage package composition contains no QSV or acceleration-specific code or
   runtime dependency.

### 17.3 Manual Windows QA

In the actual Electron app, verify:

1. the player remains the visual focus with both panels open,
2. the single progress bar is usable at supported window widths,
3. continuous `Q`/`W` playback capture feels immediate and does not interrupt audio or motion,
4. single presses of Left and Right step once while a held key accelerates frame scrubbing without
   dropping requested adjacent steps,
5. exact and inexact range entries are distinguishable at a glance,
6. start thumbnails correspond to what the user captured,
7. Refine Gif opens with the refinement queue visible, keeps one range as the center's focus, and
   makes the endpoint currently being resolved unmistakable,
8. locking a refinement updates the list without a reload and both `Extract`/`E` and `Extract All`
   act on the expected ranges,
9. panel folding reallocates the player smoothly,
10. keyboard focus and shortcuts follow the active screen, and
11. progress, partial success, failure, and retry remain understandable without consulting logs.

## 18. Deferred Decisions

1. The future clean-movie-name parser for collection and output names.
2. How to disambiguate two different source movies whose filenames produce the same collection
   stem without changing the existing plain-text collection format.
3. Durable captured-range persistence across application restarts.
4. Policies for HDR, interlacing, rotation, and explicit track selection.

None of these decisions blocks the first production workflow specified here. Until a clean-name
parser exists, both collection and output names use the movie filename without its final extension.

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
