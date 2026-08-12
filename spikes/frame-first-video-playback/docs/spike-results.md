# Spike Results

## Scope exercised

The current spike was verified in Electron against:

- `D:\\tmp\\dev\\clip-sandbox\\tests\\e2e\\fixtures\\video-edit\\clips\\source.mp4` (7.8 KB, tiny smoke clip),
- `D:\\tmp\\dev\\clip-sandbox\\sandbox\\hand-closes-curtain.mp4` (about 1.1 MB, longer local clip).

Verification covered:

- app startup in Electron,
- shared movie load,
- first-frame rendering in both candidates,
- frame stepping,
- candidate switching with handoff to the same frame,
- shared `q/w/a` capture routed through the active candidate,
- continuous playback in both candidates,
- playback-rate control in Candidate B.

## Candidate A

Stack:

- `webcodecs-examples@0.1.15`
- shared host-owned frame index from Mediabunny packet metadata
- package-owned worker demux/decode/render/audio path

Observed behavior:

- Loads and renders frame 0 in Electron.
- Plays successfully in Electron and advances frames on the longer local MP4.
- Step forward/back and scrub work through a frame-index-to-timestamp adapter.
- Audio preview is available out of the box.
- Stop returns to frame 0 and shared handoff to Candidate B works.

Limitations:

- The package does not expose playback-rate control in its public API, so the spike can only surface a documented limitation here.
- The package public API also does not repaint immediately after a paused seek inside the current chunk. The spike wrapper works around this by calling the wrapped renderer directly after `seek(...)` so frame stepping actually redraws.
- The player path uses an MP4-only demuxer. Non-MP4 input such as MKV is rejected by the spike with a visible candidate-local error; Candidate B can still be used with the same movie.
- The package bundle is large; the built `webcodecsExamples` chunk is about 2.6 MB minified before gzip.
- Frame stepping is only as exact as the package seek path plus the shared frame-index adapter. It is good enough for the spike, but it is not the cleanest ownership model for production frame-first editing.

Measured/observed notes:

- On the `hand-closes-curtain.mp4` sample, the candidate reached its loaded/first-frame state in roughly 300 ms in the Electron automation smoke test.
- One-frame step latency measured around 194 ms in the same smoke test.
- Playback on the longer sample advanced to frame 58 / 2.419 s after about 2.5 s of runtime, confirming real progression rather than a static first frame.

## Candidate B

Stack:

- `mediabunny@1.50.6`
- host-owned presentation index derived from encoded-packet timestamps and sorted into presentation order
- custom Electron renderer control using `CanvasSink`
- custom frame-first playback clock in renderer code

Observed behavior:

- Loads and renders frame 0 in Electron.
- Plays successfully in Electron and advances frames on the longer local MP4.
- Step forward/back is direct and responsive.
- Scrubbing works through frame-index lookup plus `CanvasSink.getCanvas(...)`.
- Playback-rate control works for `0.25x`, `0.5x`, `1x`, and `2x`.
- Candidate switch handoff works: when Candidate A is playing and the user switches to Candidate B, Candidate A pauses and Candidate B seeks to the same frame.

Limitations:

- Audio preview is not implemented in this candidate yet.

Index exactness boundary:

- The index is exact relative to the encoded-packet metadata reported by Mediabunny. The current spike treats each encoded video packet as one presentation frame; it has not independently validated that mapping against every decoded frame across the supported input set.
- For the ordinary MP4 samples tested so far, packet timestamps and `CanvasSink` frame retrieval produced consistent frame navigation. A decoded-frame validation pass would be needed before making a format-independent exactness guarantee.

Performance optimization not yet implemented:

- Candidate B currently relies on `CanvasSink` and does not maintain an application-owned bounded cache of nearby rendered frames. Such a cache is a straightforward follow-up optimization; its size, prefetch policy, and measured benefit should be selected from full-movie results.

Evaluation in progress:

- Full movie-length behavior is currently being evaluated. Until those results are recorded, indexing time, long-range scrub latency, and bounded-memory behavior remain unmeasured rather than known limitations.

Measured/observed notes:

- On the `hand-closes-curtain.mp4` sample, the candidate reached loaded/first-frame state in roughly 308 ms in the Electron automation smoke test.
- One-frame step latency measured around 31 ms.
- A scrub operation to the middle of the sample took about 524 ms in the same smoke test.
- At `2x`, the candidate advanced to frame 94 / 3.921 s after about 2 s of runtime on the longer sample, confirming that the custom clock honors the selected playback rate.

## Shared host behavior

Observed behavior:

- The Electron host owns one shared movie source and one shared frame index.
- Both candidates can load the same selected movie without duplicating the source file on disk.
- Candidate loading is isolated: a rejected or never-settling Candidate A load does not prevent Candidate B from becoming selectable and usable.
- Candidate load failures are surfaced in the affected candidate panel instead of propagating as a host-wide loading failure.
- The active candidate selector works, and the shared range panel now refreshes correctly when the active candidate changes.
- Shared `q/w/a` capture stores ranges with both frame and timestamp values.

Observed issue fixed during the spike:

- Initial Vite output used absolute `/assets/...` paths, which produced a blank window under Electron `file://` loading. The spike now uses `base: './'` in Vite so the static build works inside Electron.

## Recommendation

Recommended production starting point: Candidate B.

Reasoning:

- It matches the desired ownership model better: the app owns frame indexing, playback clock, scrubbing behavior, and future overlay hooks directly.
- Playback-rate control already works here, which matters for review workflows.
- The code is much smaller and easier to reason about than the assembled Candidate A stack.
- Future frame-analysis overlays and per-frame navigation results will fit more naturally into a control we own.

Keep Candidate A as a benchmark and reference for:

- preview audio behavior,
- worker-based playback architecture ideas,
- a "good enough quickly" assembled-player fallback if the custom path stalls.

Recommended follow-up work:

1. Add audible preview to Candidate B, either directly or through a deliberately simple paired-audio path.
2. Add a small explicit nearby-frame cache, tuning its size and prefetch policy from full-movie measurements.
3. Record the in-progress full-length movie evaluation: indexing time, memory behavior, scrubbing feel, and seek stability over longer durations.
