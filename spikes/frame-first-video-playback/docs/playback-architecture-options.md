# Playback Architecture Options

## Why this document exists

The movie-to-pipeline feature needs a review surface that is pleasant in normal playback, but also trustworthy when the user wants to move one frame at a time, capture ranges quickly, and later jump to analysis results like "show me all frames with a window."

This document records the playback architecture options discussed during spike planning and the reasoning behind the current recommendation.

## Frame-based seek vs regular `<video>` playback

Regular HTML `<video>` playback is timestamp-first:

- the browser owns demuxing, decode, render, and A/V sync,
- the public navigation model is `currentTime`,
- seeking means "go to approximately this presentation time,"
- frame stepping is not a standard first-class API.

Frame-first playback is app-first:

- the app owns or orchestrates frame identity,
- the public navigation model can be `seekToFrame(15342)` or `stepFrames(+1)`,
- the player still uses timestamps internally for media timing and extraction handoff,
- analysis results can attach cleanly to stable frame positions.

Important nuance: frame-first does not mean "timestamps disappear." Even a frame-first player still needs timestamps for:

- variable-frame-rate media,
- playback clocks,
- audio synchronization,
- ffmpeg clip extraction,
- interoperability with external tools and metadata.

The practical difference is where the truth lives:

- `<video>`: time is the truth, frame identity is inferred if you can infer it at all.
- frame-first control: frame identity is the truth, time remains attached metadata.

## Option 1: Plain HTML `<video>`

Main stack:

- demux/decode/render: browser media pipeline
- control surface: app code around `<video>`
- audio preview: free

Strengths:

- smallest implementation
- broad codec/container support through the browser
- good normal playback UX
- audio preview is simple

Weaknesses:

- no standard exact next-frame / previous-frame API
- no strong contract for seek-to-frame
- future analysis features have to keep translating frame results back into timestamps and hoping the browser lands where you expect

Verdict:

- still a viable fallback for a lightweight timestamp-marking workflow
- not the right foundation for the frame-analysis and frame-navigation direction discussed for Clip Sandbox

## Option 2: Hybrid `<video>` playback plus frame mode

Main stack:

- normal playback: `<video>`
- frame mode: WebCodecs or an app-owned decoder path for precise review moments
- extraction: ffmpeg later

Strengths:

- normal playback and audio are easy
- exact frame review can be isolated to the moments where the user cares
- can reduce custom playback complexity

Weaknesses:

- two playback paths to keep aligned
- handoff between "time mode" and "frame mode" can get subtle
- harder mental model and more state to test

Verdict:

- plausible if full frame-first playback later proves too heavy on very large or messy sources
- not chosen for this spike because the spike’s question was whether a frame-first control can stand on its own

## Option 3: Full frame-first WebCodecs playback

Main stack options:

- demux/container: Mediabunny, MP4Box.js, Remotion Media Parser, custom demux logic
- decode: WebCodecs
- render: Canvas 2D, `bitmaprenderer`, WebGL, or WebGPU
- playback control: app-owned clock and seek logic
- audio preview: app-owned, or deferred

Strengths:

- best match for exact frame stepping and frame-addressable search results
- easiest place to add future overlays and analysis layers
- lets the app own stale-seek suppression, cache policy, and navigation semantics

Weaknesses:

- more implementation work
- audio preview is not free
- container/demux and render choices become your responsibility

Verdict:

- this is the architecture family recommended by the spike
- Candidate B is the current production-leaning embodiment of this path

## Option 4: LibVLC native-surface playback

Main stack:

- demux/decode/render/audio: LibVLC
- Electron integration: native child window or embedded surface
- HTML overlay: host UI on top

Strengths:

- mature playback engine
- strong codec/container support
- audio and transport behavior already solved

Weaknesses:

- native surface coordination inside Electron is awkward
- overlay alignment and resizing become a platform-integration problem
- frame-addressable app contracts are still not naturally a web-first surface

Verdict:

- viable for a desktop-native heavy path
- not chosen for this spike because the user wanted to prove something that plays well with the Electron web UI and future in-app analysis overlays

## Option 5: LibVLC with canvas / WebGL / WebGPU rendering

Main stack:

- decode: LibVLC
- frame delivery into web renderer: custom bridge
- render: canvas / WebGL / WebGPU in the renderer process

Strengths:

- keeps LibVLC codec strengths
- future overlay work becomes easier than with a native child window

Weaknesses:

- the bridge itself is the hard problem
- browser/Electron integration complexity remains high
- more custom plumbing than either plain LibVLC surface embedding or a pure web stack

Verdict:

- interesting if LibVLC 4.x or future bindings make frame delivery dramatically cleaner
- not the lowest-risk way to get the next product milestone moving

## Option 6: roughcut / VideoContext-style WebGL composition

Main stack:

- demux/decode: browser media or WebCodecs-adjacent libraries
- render/composition: WebGL graph
- control surface: app UI plus composition engine

Strengths:

- useful once you care about effects, layering, filters, and compositing
- visually rich overlay paths are natural here

Weaknesses:

- more of a composition engine than a focused review control
- can become unnecessary baggage if the immediate job is just "play, step, scrub, mark ranges"

Verdict:

- good reference space, not the selected starting point
- better as a later evolution when editing/composition needs justify the machinery

## Option 7: Native helper approaches (for example C# / LibVLCSharp / FFmpeg bindings / platform APIs)

Main stack:

- native helper process or library does playback or indexing
- Electron renderer talks to it through IPC

Strengths:

- opens the door to mature native media stacks
- could isolate heavy media work out of the renderer

Weaknesses:

- IPC complexity
- packaging and cross-platform support cost
- less direct fit for a standalone embeddable HTML control

Verdict:

- worth keeping on the board as a future fallback
- not touched in this spike beyond documentation

## Stack choices considered inside the selected family

### Demuxing / container parsing

- `webcodecs-examples` assembled path: package-owned demuxing via its own stack
- Mediabunny path: app-owned input and packet access
- `webcodecs-scroll-sync`: useful reference for frame-buffer behavior

Recommendation:

- Prefer Mediabunny for the app-owned path because it keeps demuxing legible and TypeScript-native.

### Decoding

- WebCodecs in both candidates

Recommendation:

- Keep WebCodecs as the decode primitive for the browser/Electron path unless a later codec-coverage requirement forces a native fallback.

### Rendering

- Candidate A: package-owned render path
- Candidate B: Canvas 2D via `CanvasSink`
- future options: `bitmaprenderer`, WebGL, WebGPU

Recommendation:

- Keep Canvas 2D for the near-term product path until overlays or performance pressure justify a GPU render path.

### Audio preview

- Candidate A: already solved by the package
- Candidate B: not implemented yet

Recommendation:

- Treat "simple audible preview while reviewing" as desirable follow-up work, but not as a blocker to choosing the frame-first custom path.

## Selected approach

Current recommendation:

- keep the production architecture decision in the full frame-first WebCodecs family,
- continue from the custom Mediabunny-based control,
- use the assembled `webcodecs-examples` wrapper as a benchmark and reference implementation for audio preview and worker architecture.

Why this choice won:

- it preserves the frame-first public contract cleanly,
- it keeps future analysis overlays in app-owned code,
- it already demonstrates frame stepping, scrubbing, shared range capture, and playback-rate control in Electron,
- it avoids coupling the product surface to a larger opaque player stack.

Why the selected approach is still incomplete:

- audible preview for Candidate B remains follow-up work,
- the spike has not yet been profiled on a real full-length feature film,
- memory behavior on long scrubs still needs dedicated measurement.
