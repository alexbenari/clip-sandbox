# All-Intra Full-Player Scrub Results

## Purpose

This follow-up tests the two questions left by the rejected seeker-thumbnail experiment:

1. Can a cached review proxy show a useful progression of full-player frames while the timeline is
   dragged?
2. Is the selected 960-pixel proxy visually adequate when enlarged to the real player?

The first question has automated timing and visible-canvas evidence. The second remains a hands-on
quality decision; a screenshot can prove that the image rendered, but cannot decide whether its
loss of detail is acceptable to the user.

## Selected Profile

The fixed spike profile is `mpeg4-all-intra-q5-960-ordinal-clock-v2`:

- Matroska container;
- MPEG-4 Part 2 video at quantizer 5;
- maximum width 960 pixels, preserving aspect ratio and never upscaling;
- `yuv420p`, GOP size 1, and no B-frames;
- one synthetic monotonic proxy timestamp per decoded input ordinal;
- audio stream-copy.

All-intra coding makes every proxy picture independently decodable. The modest resolution bounds
native decode output, Electron transport, and canvas upload. Quantizer 5 favors review quality over
small files; the evidence confirms that this can produce a proxy larger than the source.

The synthetic proxy clock is essential. One H.264-in-AVI review asset contains repeated PTS values;
passing those timestamps through caused the MPEG-4 encoder to reject a frame. The v2 recipe assigns
monotonic timestamps from decoded ordinal instead. Proxy PTS is never treated as source identity.

## Identity Model

Canonical preparation still happens first. It produces either the source movie or a verified
timestamp-normalized review copy plus one complete BestSource index. The proxy stage then creates:

1. `proxy.mkv`,
2. a second BestSource proxy index,
3. `frame-map.json`, and
4. an atomic manifest containing the canonical cache key, profile, mapping version, dependency
   versions, counts, timings, and proxy size.

The accepted mapping is constant and ordinal: proxy picture N displays canonical source-frame N.
Publication requires canonical frame count, FFmpeg encoded-picture count, and proxy indexed-picture
count to match. The native review process opens both indexes. It decodes pixels only from the proxy,
but obtains frame index, original ordinal, PTS, duration, timebase, and hash from the canonical index
at N. Exact release, q/w/a ranges, and eventual extraction therefore remain in canonical source
coordinates.

## Correctness Evidence

The CFR and VFR fixtures contain independently decodable picture codes. Integration tests request
the first, middle, and final proxy ordinals, decode the visible code from proxy RGBA pixels, and
compare the reported metadata with the canonical BestSource frame. Both fixtures pass. The VFR
fixture intentionally ends with two visually identical pictures at distinct ordinals and PTS; the
oracle compares declared picture content rather than assuming pixels must encode the ordinal.

Cache entries are versioned by the complete v2 recipe, so proxies created before the ordinal-clock
fix cannot reopen as current evidence.

## Continuous Drag Measurements

The Electron smoke moves through 12 timeline positions at 120 ms intervals. It observes actual main-
canvas frame identity changes, verifies that the canvas pixels changed before release, and asserts
that status polling did not move the local timeline thumb. Release then resolves the exact canonical
frame and resumes source playback.

| Target | Role | Requested / displayed | Displayed fps | First frame | Latency p50 / p95 | Result |
|---|---|---:|---:|---:|---:|---|
| `fixture-cfr-ffv1` | deterministic CFR | 12 / 12 | 7.80 | 33.7 ms | 16.0 / 19.5 ms | pass |
| `fixture-vfr-ffv1` | deterministic VFR | 12 / 12 | 7.60 | 35.2 ms | 18.3 / 20.7 ms | pass |
| `media-005` | high-demand 1080p H.264 common signature | 12 / 12 | 7.50 | 177.4 ms | 33.5 / 177.4 ms | pass |
| `media-017` | repaired H.264-in-AVI legacy source | 12 / 12 | 7.57 | 113.3 ms | 18.5 / 103.9 ms | pass |
| `media-035` | difficult 4K HEVC HDR source | 12 / 12 | 7.45 | 173.9 ms | 33.7 / 100.0 ms | pass |

Displayed fps is the number of completed proxy pictures divided by scripted drag duration; it is
not movie playback rate. The theoretical maximum for this script is about 8.33 displayed frames per
second. The adapter permits one request in flight and keeps only the newest queued position. Unlike
a final-only debounce, a completed in-flight picture remains visible, so the user sees intermediate
locations without an unbounded native queue.

## Cold Preparation Measurements

| Target | Frames | Encode | Proxy index | Encode + index | Proxy size | Complete ordinal count |
|---|---:|---:|---:|---:|---:|---|
| `fixture-cfr-ffv1` | 72 | 0.18 s | 0.17 s | 0.35 s | 0.63 MiB | yes |
| `fixture-vfr-ffv1` | 73 | 0.44 s | 0.41 s | 0.85 s | 0.64 MiB | yes |
| `media-005` | 254,181 | 7m 41.5s | 54.5 s | 8m 36.0s | 7.78 GiB | yes |
| `media-017` | 163,003 | 1m 45.0s | 16.0 s | 2m 1.0s | 3.61 GiB | yes |
| `media-035` | 175,400 | 25m 9.9s | 33.8 s | 25m 43.7s | 6.09 GiB | yes |

These are single machine observations, not distributions. The fixture numbers are correctness
controls. `media-005` is the highest-demand representative of a common 1080p H.264 signature, not an
average-length movie. Its result establishes the central tradeoff: the warm drag path is responsive,
but cold preparation substantially exceeds the earlier two-minute aspiration. The legacy source is
close to that aspiration and proves that repeated source PTS no longer blocks proxy creation.
Ordinary LibVLC playback remains available while this work runs; exact stepping, dragging, and q/w/a
capture wait.

## Current Interpretation

The architecture succeeds at separating display cost from identity. All three real-movie journeys
delivered every scripted position at 7.45-7.57 displayed frames per second, and exact release
remained canonical. The proxy does not remove preparation cost; it moves decode-forward expense into
one visible, cacheable sequential job. Preparation is acceptable only under a product contract that
allows minutes of visible background work: about two minutes for the legacy source, nine minutes for
the high-demand common signature, and nearly 26 minutes for the difficult 4K source. The last result
needs a different preparation policy if exact controls must become ready quickly.

Visual quality is not signed off by automation. The current 1080p screenshot is coherent and fills
the real player at 884x497 without upscaling beyond the 960-pixel proxy source, but the user must
judge fine detail, motion, and larger-window expansion. The 4K representative is 10-bit BT.2020/PQ
HDR, while this first profile emits 8-bit `yuv420p` without an explicit HDR-to-SDR tone-map stage.
The generated 4K proxy retains BT.2020/PQ tags, but the current CPU-to-RGBA canvas path does not
explicitly tone-map them. That cannot affect ordinal identity, but it may make the review picture too
dark or tonally wrong. The captured night-scene screenshot is visibly dark and cannot settle whether
that appearance matches normal LibVLC playback. An unacceptable hands-on HDR comparison would
require a conditional color-management recipe rather than a global profile change.

The continuous-drag performance question therefore passes its automated representative-media gate;
whether 7.45-7.80 fps feels smooth enough is still a user-experience judgment. The enlarged-image
quality question remains unsigned, especially for HDR. Both caches are now warm, so those judgments
can be made without repeating cold preparation.

## Reproduction

```powershell
npm run control:start
node ./scripts/run-control-smoke.mjs --target fixture-vfr-ffv1
node ./scripts/run-control-smoke.mjs --target media-005
node ./scripts/run-control-smoke.mjs --target media-017
node ./scripts/run-control-smoke.mjs --target media-035
```

Ignored JSON and screenshots are written under `artifacts/control-smoke-*`. Proxy media, indexes,
and manifests are under `.deps/prepared-review-cache/proxies/`.
