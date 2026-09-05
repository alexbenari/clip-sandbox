# Playback architecture options

Status: Milestone 7 spike assessment. This document supersedes the older browser-only
recommendation in `spikes/frame-first-video-playback/docs/playback-architecture-options.md`.
It does not claim production adoption or replace the separate POC result report.

## Decision vocabulary

Exact absolute identity means a canonical ordinal and its source metadata: source frame number,
integer PTS, rational timebase, duration when known, and validated source-frame identity. A
timestamp seek or `next_frame()` result is not absolute identity by itself. Nominal FPS conversion,
watch-time callbacks, or a decoded-pixel hash cannot establish the ordinal for arbitrary VFR,
duplicate-picture, repaired, or long-GOP media.

For a normalized movie, canonical PTS/timebase come from the verified review derivative and can
differ from the original container timestamps. Its preserved ordinals/hash order identify original
pictures. Future extraction must resolve those ordinals against the original source; it must not
blindly pass repaired canonical PTS to an original-file timestamp seek.

The source index is authoritative. A proxy index is a second index over encoded review pictures.
The selected mapped GOP1 proxy preserves `proxy ordinal N -> canonical source ordinal N`; its
source-relative monotonic clock preserves presentation timing, repairing duplicate/backward PTS.
This makes playback and scrub access responsive, but its timestamps and
lossy pixels are not source identity.

## Options by layer

### Plain HTML video

`<video>` owns demux, decode, rendering, A/V clock, and audio. The application controls
`currentTime`, so seek is timestamp-oriented and exact next/previous source-frame control is not
a standard contract. It remains a good small timestamp-marking fallback. It is not sufficient as
the identity layer for frame analysis, exact ranges, or reopening a marked source position.

### WebCodecs and browser-side stacks

WebCodecs exposes codec processing primitives; a product still needs demux/container handling,
frame scheduling, rendering, audio, cache policy, and identity bookkeeping. Mediabunny is a
reasonable current browser/Electron demux and media utility candidate. `roughcut`, VideoContext,
and Remotion-style composition layers are useful when timelines, effects, overlays, or rendering
graphs are the product. They do not automatically provide canonical source identity or solve
audio and long-GOP random access.

The old spike recommended a full frame-first WebCodecs/Mediabunny path, with browser-owned decode
and Canvas 2D rendering. That recommendation is superseded for this POC: it remains a future
option for a deliberately browser-first product, not the selected architecture here. The W3C
[WebCodecs specification](https://www.w3.org/TR/webcodecs/) describes codec interfaces, not the
missing application-level source-index contract. See also the current
[Mediabunny repository](https://github.com/muxinc/mediabunny) and
[Remotion Media Parser](https://www.remotion.dev/docs/media-parser/) as adjacent tooling, not
measured alternatives in this spike.

### LibVLC-only C1

C1 asked LibVLC to be normal player, exact-frame source, and renderer. The pinned LibVLC 4 gate
passed relative fixture stepping and first-frame coverage, but failed repeat seeks and complete
operation scripts on the identity-sensitive fixtures. Its public watch-time callback carries a
microsecond clock, not a presentation-order frame index, source PTS/timebase, or atomic coupling
to the decoded display callback. Converting time back through FPS would be approximate.

This is a measured C1 failure, not a claim that LibVLC is a poor ordinary player. The LibVLC gate
also registered callbacks and reported malformed input correctly; a full native GPU surface was
not built after the identity gate failed.

### Selected C2: LibVLC playback plus canonical BestSource

C2 separates responsibilities:

1. LibVLC supplies ordinary source playback, clocked transport, and audio.
2. BestSource builds the canonical source index and serves exact source ordinals.
3. A mapped GOP1 review proxy supplies the visible picture for both ordinary playback and scrub.
4. The mapping manifest and proxy index validate complete ordinal coverage before exact controls
   become ready.

This is the selected POC direction. The prepared-review gate passed identity, cancellation,
reopen, and held-step checks for its bounded target set; the broader original C2 timing/indexing
gate did not pass. The correct description is therefore "selected prepared-review C2," not a
blanket performance certification.

Once preparation completes, playback and scrub use the same proxy. Playback-to-exact handoff
locates the proxy ordinal from its playback clock, then attaches the canonical identity for that
ordinal. Exact-to-playback handoff maps the canonical ordinal back to the proxy's own PTS and
timebase. It must not seek the proxy using unadjusted original-source timestamps. Continuous scrub
requests the mapped proxy ordinal while the canonical index remains the identity authority.

### Direct libav

The direct libav baseline is a useful native primitive and a small fallback: sequential decode,
keyframe seek, then decode-forward. It measured successfully on controlled fixtures, but it does
not itself provide an absolute frame index, persistent canonical identity, cache validation, or a
complete VFR/repair policy. It can implement a backend only after those contracts are added.

### FFmpeg and FFmpeg/WASM

Native FFmpeg is already used by the POC's preparation and proxy paths. It provides demux/decode,
filter, encode, and extraction primitives; the application still owns ordinal mapping, timestamp
repair policy, cache publication, and cancellation. FFmpeg/WASM could improve browser portability
and sandboxing, but its codec/runtime size, memory transfer, hardware limits, and startup cost
were not measured here. It is a future experiment, not evidence against the selected native path.

Range extraction is outside this POC. A future implementation must consume a validated canonical
range and route it through the trusted extraction boundary; a player timestamp alone must not
silently define the saved range.

## Frame transport inside Electron

### Binary Electron bridge

The measured bridge uses a native helper, length-prefixed binary frames, main-process supervision,
preload IPC, and renderer canvas upload. The bridge passed after native frames were bounded to the
viewport. It keeps context isolation, sandboxing, and disabled Node integration intact. It is the
current POC transport for mapped proxy pictures, with latest-wins scrub scheduling and bounded
in-flight work.

### Shared memory

The bounded two-slot SharedArrayBuffer experiment did not cross the Electron 37 trust boundary:
the sandboxed preload did not expose the buffer, and returning main-process shared storage through
`ipcMain.handle` failed structured cloning. No shared-memory latency result exists. Do not weaken
context isolation or enable Node integration merely to revive this experiment. A newer Electron
shared-texture facility would be a separate, version-gated experiment.

### Native window

A native sibling window or embedded native surface could avoid copying pixels into the renderer,
but introduces platform-specific window ownership, resizing, overlay alignment, focus, lifecycle,
signing, and packaging work. It was intentionally not built. It is not needed for the measured
viewport-sized proxy bridge and should enter a decision gate only if a later renderer transport
fails a real requirement.

## What is measured, deferred, and not implied

| Area | Measured conclusion | Status |
| --- | --- | --- |
| LibVLC-only exact identity | C1 failed its canonical identity gate | Rejected as unified backend |
| BestSource source index | Exact ordinal access and persistent identity passed bounded gates; broad timing gate remained expensive | Canonical identity path |
| GOP1 proxy | Complete mapped playback/scrub contract passed selected bounded targets | Selected review path |
| Electron transport | Viewport-sized binary bridge passed; shared ring blocked; native window not built | Binary bridge selected for POC |
| BestSource hardware indexing | Current linked FFmpeg lacks the requested decoder; no hardware index was produced | Unmeasured, not incapable |
| `node-av` | Integration probes failed filter/PTS and custom-loop contracts | Wrapper integration failure, not intrinsic incapability |
| Direct libav | Sequential and seek/decode-forward baseline only | Supporting primitive, not identity backend |
| Range extraction | No clip extraction implementation in this POC | Deferred product work |
| Shared-pass preparation | One-decode source-index plus proxy proposal only | Deferred to [shared-pass plan](../../../docs/plans/shared-pass-review-preparation-exec-plan.md) |

The hardware BestSource result is specifically an environment/configuration limitation: the
linked libraries rejected `d3d11va`, so hardware identity was not measured. Likewise, `node-av`
did not establish an intrinsic inability to perform the work; its tested integration did not meet
the selected pipeline contract.

## Recommendation boundary

For this POC, retain prepared-review C2: LibVLC for ordinary playback/audio, BestSource for
canonical absolute identity, and the validated mapped GOP1 proxy for both playback and scrub,
delivered through the viewport-sized binary Electron bridge. Keep the browser-only WebCodecs
recommendation superseded, not erased: it remains a possible future product architecture if a
new scope values browser portability over the native media and audio contract.

This document recommends the next architecture boundary for the spike; it does not authorize
production adoption. Production work would still require the separate final spike results,
upgrade/retest decisions, packaging/signing work, and a deliberate integration plan.

## Evidence

- `docs/libvlc-gate-results.md`, `docs/bestsource-gate-results.md`,
  `docs/bestsource-preparation-gate-results.md`, `docs/electron-control-results.md`,
  `docs/electron-bridge-m4b-results.md`, `docs/electron-shared-ring-results.md`,
  `docs/preparation-acceleration-results.md`, and `docs/bestsource-failure-analysis.md`.
- `docs/plans/native-frame-identity-playback-spike-exec-plan.md` Milestones 3B-7 and
  `docs/plans/shared-pass-review-preparation-exec-plan.md`.
- Historical comparison: `spikes/frame-first-video-playback/docs/playback-architecture-options.md`.
- Primary external references: [WebCodecs](https://www.w3.org/TR/webcodecs/),
  [Mediabunny](https://github.com/muxinc/mediabunny),
  [Remotion Media Parser](https://www.remotion.dev/docs/media-parser/), and the
  [Electron IPC guide](https://www.electronjs.org/docs/latest/tutorial/ipc).
