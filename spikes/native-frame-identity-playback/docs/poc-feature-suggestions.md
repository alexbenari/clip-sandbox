# POC Feature Suggestions

This document captures product and architecture ideas produced by the native frame-identity POC.
They are proposals, not signed product requirements. The original remediation measurements cover
five MPEG-4 Part 2 sources with no PTS-usable BestSource keyframes. Milestone 3b added one H.264-in-
AVI case and the prepared-review/cache controls; see [BestSource Remediation Results](bestsource-remediation-results.md)
and [BestSource Prepared-Review Gate Results](bestsource-preparation-gate-results.md).

## Current Direction

The evidence supports this preparation hierarchy:

1. Start ordinary source playback immediately.
2. Run compressed-packet preflight in the background.
3. When seek-point timestamps are missing, create a timestamp-normalized stream-copy derivative.
4. Fully index that canonical review asset with BestSource.
5. Create and index a 960-pixel all-intra display proxy with one proxy picture for every canonical
   source-frame ordinal.
6. Enable exact stepping, full-player drag scrubbing, and range capture only after both complete
   indexes and the ordinal map are ready.

The original movie remains the extraction source. A healthy movie is itself the review asset and
needs one canonical BestSource index. When timestamp repair is required, the canonical cache instead
contains the timestamp-normalized review copy and its index. The display cache separately contains
the all-intra proxy, a proxy BestSource index, a complete ordinal-map manifest, and the preparation
profile. Proxy pixels are used for review responsiveness; canonical identity and final extraction
continue to refer to the original timeline.

## FS-001: Packet Preflight

**Status: recommended for the next product spike.**

Scan compressed video packets before choosing a preparation path. The scan reads packet flags,
packet PTS, MPEG-4 VOP counts, and the DivX packed marker; it does not decode pictures.

- The current 45-signature policy matrix identified all six missing-keyframe-PTS cases before
  BestSource indexing, including a newly selected H.264-in-AVI representative.
- Warm-filesystem scan time was 0.86-2.11 seconds for 0.68-1.86 GiB movies.
- Sequential digest cost is material for very large files: the 4K HEVC control took 270 seconds.
- More than one VOP in a packet confirms packed pictures. A DivX packed marker by itself is only a
  hint because it can remain after packet packing has been removed.
- BestSource's completed decoded-picture index remains authoritative. The packet scan is a routing
  and early-warning mechanism, not the canonical frame map.

Expose byte progress for this sequential read and let it overlap ordinary playback.

## FS-002: Timestamp-Normalized Derivative

**Status: recommended first repair.**

When key packets lack PTS, stream-copy video and audio into a container with generated presentation
timestamps, then index that derivative. Container choice must preserve the compressed picture
stream rather than being assumed universal.

- Transformation time was 1.80-3.64 seconds across all five affected sources.
- Output size was 99.5-100.1% of source size.
- All five preserved frame count, seven non-monotonic sampled RGBA hashes, exact ordinals, and audio
  codec lists.
- All five gained PTS-usable keyframes and reached 16.20-90.00 ms warm exact-access p95.
- Full derivative indexing still cost 9.00-89.44 seconds.

This is normalization, not a transcode: it repairs the container timeline while retaining the
compressed pictures and audio.

Milestone 3b found a sixth case: H.264 in AVI. Remuxing it to Matroska produced usable PTS but changed
raw H.264 packet framing. Remuxing it back to AVI preserved bytes but still exposed no PTS. NUT
provided usable PTS for all 163,003 packets while preserving the exact packet/stream digests; its
BestSource index then matched all 163,003 source frame hashes in order. Use NUT for this proven
H.264 repair class and Matroska for the proven MPEG-4 Part 2 class. Any new codec/container class
must pass the same payload and complete-frame-map checks before becoming policy.

## FS-003: Packed-B-Frame Diagnostics and Conditional Normalization

**Status: rejected as an unconditional default; retain as a diagnostic option.**

Applying FFmpeg's MPEG-4 unpack filter to every MPEG-4 Part 2 source looked attractive before the
full matrix. The measurements changed that recommendation.

- Unpack-only took 1.83-3.37 seconds and reduced indexing work on packed sources, but it did not
  create PTS-usable keyframes and every source still failed the 750 ms exact-access target.
- Combined unpack plus timestamp normalization was fast and viable for three sources.
- It removed 74 indexed frame positions from `media-019` and 28 from `media-040`. Those derivatives
  therefore did not preserve the source's absolute global frame IDs.
- On the three confirmed packed sources, combined unpack plus timestamp normalization reduced warm
  random-access p95 from 66.43-90.00 ms to 18.02-20.73 ms, a 3.2-5.0 times improvement. It also
  reduced clean indexing time by about 4.4-5.0 times. That performance gain does not compensate for
  the frame-identity failures on two of the three sources.
- The packed marker remained as stale marker-only evidence on one unpacked output, demonstrating
  that the marker alone cannot prove current packet shape.

Only use unpacking if a complete source-to-normalized frame map is built and verified, or if the
product explicitly chooses the normalized sequence as a different canonical frame space. Neither
condition is necessary for the five tested sources because timestamp-only normalization passed.
Do not automatically apply the filter to every MPEG-4 Part 2 source. Confirmed multi-VOP packets
justify running the diagnostic experiment, not accepting its output without identity validation.

## FS-004: All-Intra Review Proxy

**Status: implemented; unified proxy image/audio quality accepted by the user. Resource soak remains.**

The measurements and initial profile below record the first display-only experiment. Phase 3B
subsequently selected source-relative timing and normalized stereo AAC, and now uses the proxy for
ordinary playback too. The user accepted that profile's image and audio quality on 2026-08-29;
see [the current profile report](review-proxy-profile-results.md). Do not treat the historical
synthetic-clock/audio-stream-copy recipe below as the current selected contract.

Create a lower-resolution all-intra derivative so distant landing and continuous drag requests do
not repeatedly decode long source GOPs or move full-resolution pixels through the Electron bridge.

- All five proxies preserved source frame count, sampled global ordinals, and audio codec lists.
- Encode time was 48.41-146.20 seconds; clean BestSource indexing added 9.53-26.07 seconds.
- Total preparation was 57.94-172.27 seconds on this machine, below three minutes for all five.
- Warm exact-access p95 was 74.50-134.21 ms.
- Disk use was 1.70-2.60 times the source despite scaling width to at most 960 pixels.

The initial control implementation used Matroska, MPEG-4 Part 2 at quantizer 5, a maximum width of 960
pixels without upscaling, `yuv420p`, GOP size 1, no B-frames, a synthetic monotonic timestamp per
decoded ordinal, and audio stream-copy. It requires canonical decoded-picture count, FFmpeg output
count, and proxy indexed count to be identical before publishing the cache entry. The resulting map
is ordinal: proxy frame N displays canonical frame N. The proxy clock is deliberately noncanonical;
it prevents missing, repeated, or non-monotonic source PTS from blocking encoding. A mapped native
session decodes pixels only from the proxy while
reading PTS, duration, original ordinal, and frame hash from the canonical BestSource index at the
same N. Clip extraction continues to use canonical identities and the source movie, never proxy
timestamps.

The display proxy has its own index in addition to the canonical index. This is intentional: the
proxy index gives fast physical access to proxy pictures, while the canonical index defines what
those ordinal positions mean in the source timeline. Both are cached and versioned by source,
preparation profile, mapping contract, and native dependency versions.

The completed control measurements retained all ordinals and displayed all 12 scripted drag
positions at 7.45-7.57 frames per second on the legacy, high-demand 1080p, and difficult 4K full
movies. Cold encode plus indexing cost 2m 1.0s, 8m 36.0s, and 25m 43.7s respectively, with 3.61-
7.78 GiB proxy files. This is evidence for smooth cached review, not quick universal preparation.
Ordinary source playback must remain usable during the visible background job, and the 4K class
needs a faster conditional preparation policy if a roughly 26-minute wait is unacceptable.

The 4K representative is BT.2020/PQ HDR. Its proxy retains HDR tags in 8-bit `yuv420p`, but the
current canvas path does not explicitly tone-map to SDR. Treat HDR color management as a conditional
profile requirement and compare proxy review against normal LibVLC playback before accepting visual
quality. This does not change the ordinal identity proof.

## FS-005: Persistent Preparation Cache

**Status: recommended.**

Cache the selected canonical review asset and its complete BestSource index. The canonical review
asset is the original source when no preparation is needed; otherwise it is the timestamp-normalized
review copy. Cache the display proxy and its BestSource index as a separate derivative keyed from
that canonical preparation. Cache keys should include:

- sampled packet-content signature, source size, duration, and selected-stream metadata;
- selected video track;
- derivative recipe and frame-map version;
- BestSource and FFmpeg versions;
- indexing, decoder, and pixel-normalization options.

Write derivatives, indexes, and metadata through temporary names and publish them atomically only
after validation. On reopen, validate the cache key and source fingerprint before enabling exact
controls. A valid hit should avoid both transformation and full indexing.

Milestone 3b proved 16/16 valid cache reopens without repeating transformation or full indexing.
BestSource index reopen itself took 4-366 ms. A full cryptographic packet re-read dominated the
future-load cost: about 12-67 seconds on the ordinary/full-length controls and 270 seconds on the
large 4K HEVC source.

The follow-up selected a deterministic sampled signature: three minutes from the start, three
minutes from the end, and three pseudo-random one-minute interior segments. It hashes compressed
packets from the selected video track and also binds source size, duration, stream metadata, exact
sample locations, preparation contract, dependency versions, and indexing options. Across the
full-length controls it was 17.4-42.8 times faster than the full packet digest. Common movies
validated in 0.30-2.07 seconds; the 4K HEVC outlier took 6.32 seconds. The initially proposed
5+5+5x1-minute profile took up to 12.31 seconds and was rejected for interactive reopen.

This policy is probabilistic. A change confined to unsampled content can evade detection, and that
residual risk is accepted for this local interactive cache. Any changed size, duration, selected
track, stream metadata, stored sample layout, sampled packet bytes, preparation contract, dependency
version, or indexing option invalidates the cache. First-time preparation and normalization proof
continue to use the complete packet/frame evidence; only future cache reopening uses the sampled
signature.

## FS-006: Visible Background Preparation

**Status: recommended product behavior.**

Let the user play and timestamp-seek the source immediately through the normal playback engine.
Run preflight, normalization/proxy creation, and BestSource indexing in the background. Show the
active phase, determinate progress where available, elapsed time, and a progressively refined ETA.

Exact frame stepping, `q`/`w` capture, and `a` locking remain disabled until the complete canonical
frame map is ready. The UI should say why those controls are unavailable rather than appearing
unresponsive. A cache hit may transition directly to exact-ready state.

## FS-007: Adaptive Exact-Access Mitigation

**Status: future optimization after the initial remediation/control spike.**

For genuine expensive decode-forward after valid seeking:

- keep a decoder and bounded frame cache warm around the landed area;
- prefetch nearby frames after scrub settlement;
- display progress when a distant exact landing requires substantial decode-forward;
- estimate cost from keyframe distance, dimensions, bit depth, codec, and measured decoder
  throughput;
- fall back to the all-intra proxy when predicted latency remains unacceptable.

Remuxing cannot shorten a GOP. Re-encoding to shorter GOPs or all-intra pictures is the reliable way
to reduce dependency-chain length. Hardware decoding may help, but exact identity must be rerun on
the selected hardware path.

## FS-008: PTS-Assisted Seek Disambiguation

**Status: defer the algorithm change; retain as a BestSource fork or upstream candidate.**

BestSource can encounter several identical hash-sequence candidates when a movie contains long
runs of repeated pictures. Pixel hashes alone then identify content but not temporal position.

The current representative matrix produced this behavior on one source: five rejected seek
locations contributed to a roughly 1.37-second random landing. That is uncommon enough to defer the
matching change initially, but not to ignore the interaction. The first control should discard
superseded scrub results and show that the final exact landing is still in progress.

A stronger matcher can:

1. gather canonical index positions whose hash sequence matches the decoded landing;
2. compare the landing frame's decoded PTS and the demuxer's requested/actual seek PTS with each
   candidate's indexed PTS in integer rational time;
3. reject candidates outside a bounded seek/preroll neighborhood;
4. expand the hash window when several candidates remain;
5. retain the current retreat/fallback path when timestamps are absent, discontinuous, duplicated,
   or still ambiguous.

This is not image matching between accidentally identical scenes. It is temporal disambiguation
when many positions intentionally decode to identical pixels. Required fixtures include long still
runs, VFR, duplicate PTS, timestamp discontinuities, open GOPs, and demuxer seek undershoot.

## FS-009: Sequential Held-Step Path

**Status: proved in Milestone 3b; required in the product path.**

Treat a held `+1` or `-1` key as an adjacent-frame operation on one persistent exact-frame session,
not as a stream of independent random seeks:

- expose `stepAdjacent(direction)` separately from random `getExactFrame(frame)` and latest-wins
  `scrubToFrame(frame)` operations;
- on forward stepping, request `currentFrame + 1` from the same persistent `BestVideoSource` so its
  nearby decoder is reused and decoding continues rather than seeking again;
- retain a bounded history of delivered exact frames for reverse stepping, because video decoders
  do not decode backward; refill that history through an earlier seek plus forward decode only on a
  cache miss;
- allow only one adjacent request in flight and start the next after it completes, so operating-
  system key-repeat events cannot create an unbounded queue;
- stop scheduling new work on key release and prevent an old source or request generation from
  updating the viewport.

The bridge benchmark must report sustained forward and reverse held-step rate, cache-hit rate,
latency across GOP boundaries, and whether every displayed frame advances by exactly one canonical
source-frame identity.

The native prepared session passed this gate on all six normalized movies plus one ordinary 1080p
H.264 full-length control. At five landing regions per movie, 60 forward and 60 cached-reverse steps
were paced one-at-a-time at a 90 ms cadence. Every direction sustained 10.62-10.69 visible frames per
second for at least 5.56 seconds; p95 frame work stayed below 34 ms, canonical ordinals stayed exact,
and reverse cache misses were zero.

Milestone 5 also proved the bounded scheduler in the actual Electron control. The follow-up control
adds a 250 ms threshold before repetition, ensuring that one tap issues exactly one adjacent request,
then holds every later frame for at least 300 ms. A 450 ms held-right journey advances exactly two
frames on the VFR fixture, ordinary 1080p full movie, and difficult 4K HEVC full movie, with one
request in flight and no stale-frame error.

## FS-010: Viewport-Sized Native Previews

**Status: proved in Milestone 4b; recommended for the product path.**

Pass the current video viewport bounds to both native engines. If a decoded source is larger, fit
the RGBA preview within those bounds while preserving aspect ratio; otherwise retain its native
dimensions. Never upscale. Canonical source-frame identity remains independent of preview pixels,
and final extraction continues to use the source movie.

The 4K representative shrank from 3840x1606 to 1264x528, a 9.24 times payload reduction. Bridge p95
fell from 133.29 ms to 28.65 ms, visible callback playback rose from 6.33 to 14.77 fps, and native
playback drops fell from 56 to zero in the warmed comparison. The unchanged 720p source remained at
720x384 with essentially neutral performance. Source decoding remains full-resolution; this
optimization reduces conversion output, transport, upload, and draw work.

The spike supplies bounds at open time. A production control should update them through a bounded
resize policy when the viewport or display scale changes, without rebuilding the canonical index.

## FS-011: Debounced Exact Scrubbing

**Status: proved for expensive source-frame landing; superseded for continuous proxy dragging.**

Wait 100 ms after the newest scrub position before starting BestSource work. Positions superseded
during that interval fail as stale and never reach the native decoder. Keep the existing latest-wins
mailbox behind the debounce as protection when a landing is already running, because an executing
BestSource operation still cannot be cancelled.

In the warmed 20-position burst, 4K settlement fell from 9.86 seconds to 3.85 seconds and the 1080p
case fell from 3.39 seconds to 2.30 seconds. The 720p source moved from 1.78 to 1.82 seconds, showing
the expected roughly 100 ms tradeoff when backend work is already cheap. Pointer release in the
product UI must still request the final exact position; debouncing does not make one intrinsically
expensive landing faster.

The full-player proxy experiment changes the interaction goal. During drag, the user should see a
progression of intermediate all-intra pictures, not only the final settled request. That path uses no
artificial debounce and permits one native operation in flight plus only the newest not-yet-started
position. A completed in-flight frame remains displayable; an obsolete queued position is replaced.
The final pointer release still performs one exact canonical resolution before source playback
resumes. Retain the debounced/latest-only policy for any future direct-source preview path where
intermediate frames are too expensive to be useful.

## FS-012: Shared-Pass Indexing and Proxy Creation

**Status: deferred future experiment; not required for current POC closeout.**

Reuse each full-resolution decoded picture for both BestSource source indexing and proxy encoding,
instead of decoding the source twice. Keep the source index, proxy index, and exact ordinal mapping;
index the finished proxy separately. This targets cold preparation time, not a change to playback,
scrubbing, audio, or extraction semantics.

The [detailed deferred execution plan](../../../docs/plans/shared-pass-review-preparation-exec-plan.md)
records motivation, the proposed BestSource frame-consumer extension, staged software/hardware
experiments, cache-hit behavior, timing/frame ownership, failure handling, measurements, and stop
rules. No speedup has been measured and no implementation is authorized by recording the proposal.
