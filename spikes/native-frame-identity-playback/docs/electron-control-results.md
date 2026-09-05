# Milestone 5 Electron Control Results

## Result

Milestone 5 passes its implementation and automated behavior gate. The spike has one coherent C2
control: LibVLC owns normal source playback and audio, the canonical BestSource index owns absolute
source-frame identity, and a cached all-intra proxy supplies responsive exact-review pixels. This is
ready for user hands-on review before Milestone 6; it is not yet the final production architecture
decision.

## Implemented Experience

- main-process file selection with no renderer-visible source path;
- ordinary LibVLC playback while canonical and proxy preparation runs visibly in the background;
- preparation phase, progress, ETA, cache reuse, cancellation, and local failure display;
- one viewport shared by playback, exact stepping, and progressive full-player drag scrubbing;
- one play/pause toggle, `0.25x`/`0.5x`/`1x`/`2x`, timeline scrubbing, and single-frame navigation;
- a local timeline selection that polling cannot overwrite, followed by one exact canonical seek and
  automatic source playback when the thumb is released;
- a compact busy indicator over the full viewport while a requested drag picture is outstanding;
- a full-viewport processing indicator during first-frame loading and seek-to-play handoff;
- exact one-frame taps plus continuous one-request-at-a-time stepping after a 250 ms key hold, with
  a 150 ms repeat interval (about 6.7 frames per second when decoding keeps up);
- q/w/a canonical range marking, validation, lock/unlock, and captured-range list;
- playback-to-exact mapping through current LibVLC time and exact-to-playback resume through the
  selected source frame's integer PTS and rational timebase.

The Electron window is context-isolated and sandboxed, with Node integration disabled and a strict
content security policy. The preload exposes named operations rather than Electron primitives or a
generic native command channel.

## Proxy and Identity Architecture

Preparation first produces the canonical review asset and one complete BestSource index. Healthy
sources use the movie directly; timestamp-repair cases use the verified stream-copy derivative.
It then creates a second cached review asset with this fixed display profile:

- Matroska container and MPEG-4 Part 2 video;
- maximum width 960 pixels, preserving aspect ratio and never upscaling;
- quantizer 5, `yuv420p`, GOP size 1, and no B-frames;
- one synthetic monotonic proxy timestamp per decoded ordinal and audio stream-copy.

The proxy is accepted only when canonical decoded-picture count, FFmpeg output-picture count, and
proxy BestSource index count are identical. The mapping contract is ordinal: proxy picture N shows
canonical source-frame N. The proxy's synthetic clock prevents missing, repeated, or non-monotonic
source PTS from blocking the encoder; it is never used as source identity. The native exact service
decodes and transports only proxy pixels, while
reading frame index, original frame number, PTS, duration, timebase, and frame hash from the
canonical index at the same ordinal. It does not decode a full-resolution canonical picture merely
to obtain that metadata.

The proxy, proxy index, ordinal-map manifest, and recipe are published atomically below
`.deps/prepared-review-cache/proxies/`. The cache identity includes the canonical preparation key,
frame count, mapping version, proxy profile, and FFmpeg/BestSource versions. A valid reopen skips
both encoding and proxy indexing.

## Correctness Evidence

The complete Vitest run passed 104 tests in 29 files. It contains unit coverage for range rules,
shortcuts, held-step scheduling,
boundary clamping, hybrid mode ownership, stale work, progressive scrub queueing, and atomic proxy
cache validation. Native-service integration checks both CFR and VFR coded fixtures at the first,
middle, and last ordinal. It independently decodes the visible proxy frame code and proves that the
reported identity equals the canonical source identity. This catches a same-count but reordered,
dropped, or duplicated proxy sequence on the controlled fixtures.

The handoff regression reopens each source and runs three playback -> canonical exact frame ->
configurable seven-frame jump -> resume cycles on CFR and VFR fixtures plus the ordinary 1080p
movie. It found a native seek-barrier defect during implementation: an obsolete pre-seek frame
acknowledgement could remain active and suppress post-seek frames. `BeginSeek` now waits for an
active protocol write, drops pending pre-seek output, and retires obsolete backpressure before
LibVLC seeks. The repeated CFR/VFR test passes after that correction.

A follow-up regression proved that seeking before the first explicit play previously timed out
because LibVLC was still in its playback-ready state. The service now primes one muted display frame,
pauses, and leaves the player seekable. A defensive pre-play seek also initializes the player while
suppressing its disposable startup frame, so only the requested landing can reach the renderer.
Repeated preview/seek/play cycles on the 1080p source also exposed a transient LibVLC response in
which video-size lookup succeeded with `0x0`. The service now waits for both success and nonzero
dimensions and preserves the largest coded-buffer extent across callback renegotiation.

The first full-player proxy regression exposed a renderer bug: periodic playback status polling
rewrote the timeline from the last reported frame while the pointer was still dragging. Polling now
leaves the local value untouched until release. The CFR smoke then displayed all 12 requested proxy
positions in the main viewport, left the slider at the selected position, resolved the exact release,
and resumed playback without an error.

LibVLC's watch-time callback is separate from its display callback. The deterministic fixtures keep
the first resumed callback within 200 ms of the requested exact PTS. One 1080p run reported the
callback clock 537 ms after the requested PTS; this is metadata timing and does not by itself prove
the displayed pixels jumped. Perceptual handoff remains an explicit hands-on and Milestone 6 check.

## Full-Player Drag Evidence

| Target | Role | Requested / displayed | Displayed fps | First frame | Latency p50 / p95 | Result |
|---|---|---:|---:|---:|---:|---|
| `fixture-cfr-ffv1` | deterministic CFR | 12 / 12 | 7.80 | 33.7 ms | 16.0 / 19.5 ms | pass |
| `fixture-vfr-ffv1` | deterministic VFR | 12 / 12 | 7.60 | 35.2 ms | 18.3 / 20.7 ms | pass |
| `media-005` | high-demand 1080p H.264 common signature | 12 / 12 | 7.50 | 177.4 ms | 33.5 / 177.4 ms | pass |
| `media-017` | repaired H.264-in-AVI legacy source | 12 / 12 | 7.57 | 113.3 ms | 18.5 / 103.9 ms | pass |
| `media-035` | difficult 4K HEVC HDR source | 12 / 12 | 7.45 | 173.9 ms | 33.7 / 100.0 ms | pass |

Displayed fps is the number of completed full-player proxy pictures divided by the scripted drag
duration. It is not the movie playback rate. The test moves through 12 timeline positions at 120 ms
intervals, verifies that at least two intermediate frames become visible, and confirms that the main
canvas changed before release. The one-in-flight/one-newest-pending mailbox deliberately allows a
completed in-flight picture to appear, while replacing only queued positions that have not started.

The CFR proxy was a cache hit and retained all 72 canonical ordinals. Its initial encode and proxy
index measurements stored in the cache manifest were 177.2 ms and 168.2 ms. That tiny fixture is a
correctness control, not evidence for full-movie preparation cost.

## Verification Commands

```powershell
npm run typecheck
npm test
npm run native:test
npm run bridge:test
npm run control:smoke
node ./scripts/run-control-smoke.mjs --target fixture-vfr-ffv1
node ./scripts/run-control-smoke.mjs --target media-005
node ./scripts/run-control-smoke.mjs --target media-017
node ./scripts/run-control-smoke.mjs --target media-035
```

## Remaining Review

Automated evidence can prove visible, ordered frame updates and measure their timing, but it cannot
decide whether 960-pixel quantizer-5 proxy quality is satisfactory when enlarged to the user's real
player size. That is a hands-on visual gate. The same review should confirm that continuous dragging
feels smooth enough, that ordinary playback audio is audible, and that exact-to-playback transitions
do not visibly jump. The difficult 4K representative is 10-bit BT.2020/PQ HDR; the current 8-bit
proxy recipe does not explicitly tone-map HDR to SDR, so color and brightness are a separate visual
gate from spatial resolution and quantizer quality.

Milestone 6 still owns long-duration stress, CPU/GPU/resource measurements, broader media
repetition, and cross-platform cost. Cold proxy preparation measured 2m 1.0s, 8m 36.0s, and 25m
43.7s across the legacy, high-demand common-signature, and difficult 4K movies respectively; proxy
sizes were 3.61, 7.78, and 6.09 GiB. Range persistence and clip extraction are product work outside
this spike.
