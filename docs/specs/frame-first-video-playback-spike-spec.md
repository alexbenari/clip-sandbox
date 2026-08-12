# Feature Spec: Frame-First Video Playback Spike

## 1. Summary

Build an isolated frame-first video playback control spike that can load one movie file, render decoded frames, play through frames, seek by frame, seek by scrubbing, control playback speed, and capture frame ranges.

The spike exists to answer one architecture question:

Can Clip Sandbox use a frame-first WebCodecs-style playback control as the foundation for future movie-to-pipeline clip extraction and frame-analysis workflows?

This is not the full movie-to-pipeline feature. It is a focused technical and UX proof of the playback control that such a feature would need.

## 2. Problem

The planned movie extraction workflow needs a player where the user can review a full-length movie and mark clip boundaries quickly from the keyboard.

Timestamp-based HTML video playback can support basic marking, but it does not provide a standard exact-frame API for:

1. stepping to the next or previous decoded frame,
2. seeking to a frame identity returned by analysis,
3. presenting frame-based object-analysis results with high confidence,
4. capturing clip ranges as frame ranges rather than approximate timestamps.

Future analysis workflows may return information per frame or frame interval, such as object names, bounding boxes, or camera movement labels. The app needs to know whether a frame-first playback control is feasible before committing the broader extraction architecture.

## 3. Goals and Non-Goals

### 3.1 Goals

1. Prove that a frame-first playback control can load and display a real target movie file.
2. Prove that the control can play decoded frames continuously.
3. Prove that the control can pause and step forward/backward by exact frame identity.
4. Prove that the control can seek by frame jumps.
5. Prove that the control can seek by scrubbing on a timeline.
6. Prove that playback speed control works well enough for review workflows.
7. Prove that frame-range capture works with keyboard shortcuts.
8. Measure responsiveness, seek latency, and failure modes on real media.
9. Keep the spike isolated from the production pipeline model unless and until the user signs off on a follow-up implementation plan.
10. Produce a recommendation about whether to continue with a frame-first control, use plain HTML video, or revisit another playback engine.
11. Produce a durable architecture-options document that records the playback approaches considered, the stack options for each approach, the selected approach, and the reasoning behind that selection.
12. Compare two frame-first implementation options side by side in the Electron host.

### 3.2 Non-Goals

1. The spike does not create pipelines from movies.
2. The spike does not extract clips with ffmpeg.
3. The spike does not add generated clips to `Pipeline` or `PipelineSession`.
4. The spike does not implement LLM naming.
5. The spike does not implement cloud analysis or object search.
6. The spike does not require polished production styling.
7. The spike does not need to implement full audio decoding, audio scheduling, or audio/video synchronization inside the frame-first playback control.
8. The spike does not need to solve all codec/container coverage questions.
9. The spike does not choose a long-term dependency without a written spike result and follow-up sign-off.

## 4. Core Concepts

### 4.1 Movie Source

The single local movie file loaded into the spike control.

For this spike, the movie source may be loaded through a simple local file picker, drag/drop, or a temporary spike-only file selector.

### 4.2 Frame Index

A lookup structure that maps frame identity to media timing and decode information.

Each indexed frame should expose at least:

1. frame index,
2. presentation timestamp,
3. frame duration when available,
4. whether the frame is a keyframe when available.

The frame index is the control's navigation truth. Timestamps are still stored because media playback and extraction ultimately need presentation times.

### 4.3 Frame Position

The currently displayed frame.

The control should show:

1. frame index,
2. timestamp,
3. playback state,
4. current playback rate.

### 4.4 Frame Range Draft

The in-progress clip range selected by the user.

The draft has:

1. optional start frame,
2. optional end frame,
3. validation state,
4. optional visual error indication when the user tries to lock an illegal range.

### 4.5 Captured Frame Range

A locked range that will eventually become an extracted clip in the real feature.

Each captured range should include:

1. start frame,
2. end frame,
3. start timestamp,
4. end timestamp,
5. default display name in the form `startFrame-endFrame` or `startTime-endTime`.

The exact display-name format may be adjusted during the spike as long as both frame and timestamp values are visible somewhere.

### 4.6 Scrub Interaction

Timeline dragging that maps pointer position to a target frame and updates the viewport to that frame.

Scrubbing is frame navigation, not only timestamp navigation.

## 5. User Experience

### 5.1 Spike Packaging and Entry Point

The spike should produce a standalone playback control plus a small Electron host that embeds it.

The standalone control should:

1. live in its own folder in the repo,
2. avoid dependencies on existing Clip Sandbox app modules,
3. expose a small embedding surface that can be used from any HTML page,
4. own its playback UI, keyboard handling, scrubber, rendering surface, and range panels,
5. be usable in a plain HTML sandbox page outside the existing app shell.

The Electron host should:

1. embed the standalone control on a single page,
2. prove that the control works in Electron rather than only in a browser demo,
3. be small enough that Electron integration issues are easy to isolate,
4. either live as a separate spike Electron app or as a simple dev-only page reachable from the existing app menu.

The preferred implementation is a separate or clearly isolated spike host. Adding a page to the existing app is acceptable only if it does not disturb existing pipeline browsing behavior or introduce production coupling.

### 5.2 Layout

The spike screen should include:

1. a large fixed video viewport,
2. a playback controls area,
3. a timeline scrubber,
4. a current frame/range panel,
5. a captured ranges panel,
6. a visible keyboard legend or a toggleable legend.

The control can be visually simple. The important requirement is that state is clear while testing.

The Electron host should display the two candidate implementations side by side or in another direct comparison layout that makes UX differences easy to evaluate.

Each candidate must be a totally isolated playback control as defined in section 5.1. Candidate controls should not share decoder state, renderer state, frame cache state, candidate-specific dependencies, or implementation internals with each other.

Each candidate panel should expose the same playback behaviors where feasible:

1. load the same movie source,
2. play/pause/stop,
3. frame stepping,
4. frame jumps,
5. scrub seeking,
6. playback speed control.

The range capture area does not need to be duplicated for each candidate. The Electron host may provide one shared comparison-level range panel that captures ranges from the currently active candidate control.

The host must provide a clear UX affordance for selecting which candidate control is active. The user may switch the active candidate at any time, including midway through review. Keyboard shortcuts such as `q`, `w`, and `a` should always apply to the active candidate's current frame.

The host owns one shared movie source. The same source is available to both candidate controls, but the spike should avoid keeping two independent active decoders/playback sessions running against the movie at the same time. Only the active candidate needs to decode, play, scrub, and step the movie.

When the user switches the active candidate, the host should give the newly active candidate the shared source reference and the desired current position. The previously active candidate should pause and release or idle expensive decode/cache work where practical.

The comparison does not need a plain HTML `<video>` baseline. The two candidates should be frame-first options.

### 5.3 Spike Deliverables

The spike must produce two artifacts:

1. a working playback-control prototype,
2. a Markdown architecture-options document.

The architecture-options document should be written as a future reference for product and architecture decisions, not as a temporary implementation note.

It must explain:

1. plain HTML `<video>` playback and timestamp-based seeking,
2. hybrid HTML `<video>` playback plus WebCodecs frame mode,
3. full frame-first WebCodecs playback,
4. LibVLC native-surface playback,
5. LibVLC canvas/WebGL/WebGPU rendering,
6. roughcut/VideoContext-style WebGL composition,
7. native helper approaches such as a C# process/library using LibVLCSharp, FFmpeg bindings, or platform media APIs,
8. the main stack options considered for demuxing, decoding, rendering, and playback control,
9. the reason the selected approach was chosen or rejected for production follow-up,
10. the tradeoff between frame-based seek and regular `<video>` timestamp playback.

The frame-based seek explanation must make clear that a frame-first player may expose frame-index navigation to the app while still using presentation timestamps internally for playback timing, variable-frame-rate media, audio synchronization, and clip extraction.

The document must also separate:

1. audio preview during playback,
2. full audio/video synchronization inside a frame-first player,
3. preserving source audio during later ffmpeg clip extraction.

### 5.4 Playback Controls

The control must support:

1. play,
2. pause,
3. stop,
4. playback speed changes,
5. next frame,
6. previous frame,
7. forward/backward frame jumps.

Stop means pause playback and return to the first frame. Captured ranges should remain in the current spike session when stop is pressed.

### 5.5 Playback Speed

The control should support at least:

1. `0.25x`,
2. `0.5x`,
3. `1x`,
4. `2x`.

The spike should record whether speed changes feel smooth and whether frames are skipped, duplicated, or delayed.

### 5.6 Audio Preview

The spike should prefer audible playback if the selected implementation can provide it without turning the spike into an audio-player implementation.

Acceptable audio-preview approaches include:

1. using candidate code that already provides audio playback,
2. using a paired hidden or auxiliary HTML media element only for preview audio if it stays simple,
3. deferring audible preview if it would require building full Web Audio scheduling and synchronization.

The spike must not confuse audio preview with extraction correctness. Future clip extraction must preserve the source audio for the selected frame/time range, but that belongs to the later ffmpeg extraction workflow and is out of scope for this spike.

### 5.7 Frame Stepping

When paused, the user can step:

1. one frame forward,
2. one frame backward,
3. a larger fixed number of frames forward,
4. a larger fixed number of frames backward.

The exact keys may be chosen during implementation, but the spike must document them in the visible legend.

### 5.8 Scrub Seeking

The timeline scrubber must:

1. show current position across the full movie,
2. allow dragging to a new position,
3. map drag position to a deterministic target frame,
4. update the viewport to the nearest resolved frame while dragging,
5. discard stale decode results if the user scrubs past them,
6. leave the player paused if scrubbing began while paused,
7. resume playback from the resolved frame if scrubbing began while playing.

Scrubbing should be tested with slow drags, fast drags, and repeated back-and-forth movement.

### 5.9 Frame-Range Capture

The control must support the keyboard marking flow:

1. `q` marks the current frame as the draft start frame,
2. `w` marks the current frame as the draft end frame,
3. `a` locks the draft range if it is valid.

A range is valid when:

1. start frame exists,
2. end frame exists,
3. end frame is greater than or equal to start frame.

If the user presses `a` with an invalid draft:

1. no range is locked,
2. the current range panel shows a visible error state.

After a valid lock:

1. the range appears in the captured ranges panel,
2. the current range panel shows the locked state briefly or clearly,
3. the next `q` or `w` starts a new draft range.

Pressing `a` again before any new `q` or `w` may unlock the current draft if that behavior is simple to implement. If not, the spike should document that unlock behavior is deferred.

## 6. Architecture and Design

### 6.1 Isolation Boundary

The spike should be isolated behind a playback-control boundary so the app can later replace the underlying implementation.

The rest of the app should not depend on a specific demuxer, decoder, renderer, or third-party player API.

The standalone control should not import from existing `src/app/`, `src/domain/`, `src/ui/`, or production adapter modules. Shared production dependencies may be proposed only in the follow-up implementation plan after the spike result is reviewed.

### 6.2 Candidate Implementation Families

The spike should implement two frame-first candidates for side-by-side comparison. Candidate families may include:

1. an existing WebCodecs frame-player example, such as `webcodecs-examples`,
2. a scrub-focused frame decoder example, such as `webcodecs-scroll-sync`,
3. a toolkit approach using Mediabunny,
4. a toolkit approach using Remotion Media Parser or Remotion WebCodecs.

The chosen implementations should be wrapped locally so candidate APIs do not leak into product-facing code. Each candidate should have its own wrapper boundary, even if two candidates happen to use the same lower-level library family.

If one candidate fails early because it cannot load, decode, render, or integrate with Electron, the spike may replace it with another frame-first candidate rather than forcing a broken comparison.

### 6.3 Renderer

The first renderer should be the simplest renderer that proves the behavior:

1. Canvas 2D,
2. `bitmaprenderer`,
3. or another simple canvas-backed frame renderer.

WebGL or WebGPU may be evaluated only if needed to prove performance, overlays, or future analysis visualization.

### 6.4 Frame-First API Shape

The spike should explore an API shaped around frame navigation:

```ts
interface FramePlaybackControl {
  loadMovie(source: MovieSource): Promise<void>;
  play(): void;
  pause(): void;
  stop(): Promise<FramePosition>;
  setPlaybackRate(rate: PlaybackRate): void;
  seekToFrame(frameIndex: FrameIndex): Promise<FramePosition>;
  stepFrames(delta: FrameDelta): Promise<FramePosition>;
  beginScrub(): void;
  scrubToRatio(ratio: number): Promise<FramePosition>;
  endScrub(): Promise<FramePosition>;
  markStart(): void;
  markEnd(): void;
  lockRange(): CapturedFrameRange | null;
}
```

This is a directional interface, not a final code contract. The key requirement is that the control's public behavior is frame-oriented.

### 6.5 State Ownership

The spike should keep these responsibilities separate:

1. playback engine: decoding, playback clock, frame cache, frame seek,
2. renderer: displaying the selected decoded frame,
3. UI control: buttons, keyboard handling, scrubber, panels,
4. range capture model: draft range validation and captured ranges.

The range capture rules should not be embedded in decoder or renderer code.

### 6.6 Production Architecture Constraint

The spike may use pragmatic code to move quickly, but the result should report how it would map into the production architecture:

1. UI behavior under `src/ui/`,
2. workflow orchestration under `src/app/`,
3. frame playback adapter under an adapter/service boundary,
4. extraction later through the existing trusted ffmpeg runtime pattern.

## 7. Technical Requirements

### 7.1 Loading

The control must:

1. accept one local movie file,
2. read enough metadata to display duration and frame count when available,
3. show a useful error if the file cannot be parsed or decoded.

### 7.2 Decode and Cache Behavior

The control should:

1. decode only what is needed for current playback or seek,
2. keep a small nearby frame cache for stepping,
3. release decoded frames that are no longer needed,
4. avoid unbounded memory growth during playback or scrubbing.

### 7.3 Seeking

The control must support:

1. seeking to an exact frame index when possible,
2. seeking to the nearest available frame when exact mapping is unavailable,
3. reporting which behavior occurred.

If exact frame seek cannot be achieved with a candidate implementation, that result must be documented rather than hidden.

### 7.4 Scrub Cancellation

Scrub requests must be cancellable or supersedable.

If a decode request for frame `N` finishes after the user has already requested frame `M`, the control must not display frame `N` as the current frame.

### 7.5 Keyboard Gating

Keyboard shortcuts must not fire when the user is typing in an editable control.

### 7.6 Error Handling

The spike should visibly report:

1. unsupported file,
2. parse failure,
3. decode failure,
4. seek failure,
5. renderer failure when detectable.

## 8. Evaluation Questions

The spike must answer:

1. Can the selected stack load the real target movie?
2. How long does initial metadata/frame-index readiness take?
3. How long does first frame display take?
4. How responsive is next/previous frame stepping?
5. How responsive is +/- larger frame jump seeking?
6. How responsive is scrub seeking?
7. Does continuous playback feel usable at `1x`?
8. Do playback speed changes feel usable?
9. Does memory usage stay bounded during playback and scrubbing?
10. Can the implementation provide audible preview during playback without requiring full frame-first audio scheduling?
11. Does the candidate stack look maintainable inside this framework-free Electron app?
12. Should the production feature use this frame-first control, plain HTML video, or a hybrid?
13. Which architecture options should be preserved as future reference, and why was the selected path chosen over the alternatives?
14. Which of the two frame-first candidates provides the better production starting point, and why?

## 9. Acceptance Criteria

The spike is complete when all of the following are true:

1. A standalone control lives in its own repo folder and does not import production Clip Sandbox app modules.
2. Two frame-first candidate controls are implemented as isolated controls.
3. A small Electron host embeds both candidate controls on a single page.
4. The Electron host compares two frame-first implementation candidates.
5. A user can load one real movie file into both candidate controls in Electron.
6. The first frame is rendered in each candidate viewport.
7. Each candidate displays the current frame index and timestamp.
8. Play, pause, and stop work in each candidate unless a documented candidate limitation prevents it.
9. Playback at `1x` is usable enough to evaluate in each candidate unless a documented candidate limitation prevents it.
10. Playback speed can be changed among the required rates in each candidate unless a documented candidate limitation prevents it.
11. The user can step forward one frame in each candidate.
12. The user can step backward one frame in each candidate.
13. The user can jump forward/backward by a larger frame count in each candidate.
14. The user can scrub through the timeline and see frame updates in each candidate.
15. Scrubbing does not display stale frames after newer scrub targets are requested.
16. The host owns one shared movie source that can be used by either candidate without duplicating the source file.
17. The host provides a clear way to select the active candidate.
18. The user can switch the active candidate at any time.
19. One shared range capture panel captures from the active candidate.
20. `q` marks a start frame from the active candidate.
21. `w` marks an end frame from the active candidate.
22. `a` locks a valid frame range from the active candidate.
23. Invalid ranges are not locked and show a visible error state.
24. Captured ranges show both frame and timestamp information.
25. The spike reports measured findings for both candidates and recommends the next architecture step.
26. The spike produces a Markdown architecture-options document covering the approaches and stack options listed in section 5.3.
27. The architecture-options document clearly explains frame-based seek versus regular HTML `<video>` timestamp playback.

## 10. Open Questions

These questions are intentionally left for the spike result:

1. Which candidate implementation stack should become the production starting point?
2. Is frame-first continuous playback smooth enough, or should production use a hybrid HTML-video plus frame-mode approach?
3. Does the first production extraction workspace need audible preview from the playback control, and if so is simple preview audio enough or is full frame-first A/V synchronization required?
4. Is Canvas 2D sufficient, or do future overlays/performance needs justify WebGL or WebGPU?
5. How expensive is frame indexing on full-length movies?
6. How dense does keyframe spacing need to be for responsive scrubbing?
7. What exact keyboard mapping should become the production control scheme beyond `q`, `w`, and `a`?

## 11. Open Questions Resolved in This Spec

1. Spike purpose:
   Resolved to an isolated frame-first playback control, not the full pipeline-from-movie feature.
2. Primary navigation model:
   Resolved to frame-first navigation with timestamps retained as metadata.
3. Range capture model:
   Resolved to frame ranges, with timestamps included for future extraction.
4. Scrubbing:
   Resolved as a required behavior, not a later enhancement.
5. Pipeline integration:
   Resolved as out of scope for this spike.
6. Extraction:
   Resolved as out of scope for this spike.
7. Dependency choice:
   Resolved that dependency selection is an output of the spike, not a prerequisite decision.
