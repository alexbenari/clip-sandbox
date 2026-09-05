# BestSource Milestone 3 Failure Analysis

## Decision

Candidate C2 still fails the signed Milestone 3 gate, but the reason is now performance rather than
correctness or stability.

- The corrected clean run indexed and reopened all 45 current representatives. All 45 returned
  stable start, middle, and final frame identities. There were no native crashes.
- A second warm run repeated the 45/45 identity result.
- Seven representatives exceeded the 750 ms warm random-access target.
- Two representatives exceeded the ten-minute full-index target.
- The historical H.264 crashes were caused by the spike harness's RGBA destination allocation, not
  by BestSource, FFmpeg decoder concurrency, or the movie formats.

Per the signed stop rule, Milestone 4 must not begin with stock BestSource as the confirmed v1
backend. The evidence does justify keeping BestSource as a correctness reference and as a candidate
behind a normalization or proxy workflow.

## Current Evidence

The current media scope excludes `D:\tmp\media\watch\rame` and
`D:\tmp\media\family movies`. The regenerated inventory found:

- 2,571 discovered media files;
- 560 files excluded by directory scope;
- 2,011 in-scope files probed;
- 72 FFprobe failures and one attached-picture-only exclusion;
- 1,938 readable target movies grouped into 45 material signatures.

The corrected final-stack measurements are:

| Run | Matrix | Result | Duration |
| --- | ---: | --- | ---: |
| Clean indexes, one media process | 45 | 45/45 identity and stability pass | 118.72 min |
| Existing indexes, one media process | 45 | 45/45 identity and stability pass | 11.59 min |

Each source still used BestSource's configured pool of two reusable decoder instances. The gate ran
only one source process at a time, matching the product's single-active-movie workload. Completing
both matrices without a crash is additional evidence that multiple FFmpeg decoder instances were
not the source of the old heap corruption.

## What Worked

- All six coded fixtures passed forward, reverse, alternating, random-neighbor, repeat, and boundary
  scripts. Burned frame codes, integer PTS, durations, timebases, RGBA hashes, and BestSource hashes
  matched the independent fixture oracle and remained stable after reopen.
- Malformed input, cooperative cancellation, forced termination, partial-index rejection, and
  subsequent recovery passed.
- All 45 real representatives now complete exact start/middle/end access and persistent-index reopen.
- AV1 works in the pinned stack after adding dav1d.
- The direct libav baseline decodes and seeks the controlled fixtures, while deliberately making no
  claim of canonical global frame identity.

## Corrected Crash Diagnosis

Yes: the crash was a memory-allocation defect in the spike harness's own pixel-conversion code.

WinDbg with guarded heap caught corruption of a 705,600-byte allocation, exactly
`490 * 360 * 4`, while the harness was converting a decoded frame to RGBA after BestSource had
returned it. The harness allocated a tightly packed `width * height * 4` buffer and passed it to
`sws_scale` without honoring FFmpeg's aligned destination layout. Depending on width and SIMD write
behavior, the scaler could write beyond that allocation; Windows detected the damaged heap later.

The fix uses `av_image_alloc`, passes its returned aligned stride to `sws_scale`, retains the full
allocated size, and frees the buffer with `av_free`. After the fix:

- the exact pinned upstream CLANG64/FFmpeg 9 and MSVC/FFmpeg 8.1.2 artifacts opened the former
  trigger source;
- the corrected local MinGW harness returned its first, middle, and final frames;
- the corrected harness passed the same operation under guarded heap;
- the new clean 45-source matrix completed without a crash.

The C2 process does not load LibVLC. Its native graph is the harness, BestSource, FFmpeg's libav
libraries, xxHash, and libswscale. Those components are built against one pinned MinGW/FFmpeg stack.
The MinGW triplet remains less upstream-supported than BestSource's recommended MSVC build, but the
current evidence contains no crash attributable to an ABI or native-stack incompatibility.

## Full-Index Requirement

Stock BestSource is not progressive. When no complete persistent index exists, construction calls
`IndexTrack`, decodes through end-of-stream, and hashes every decoded frame before exact frame access
becomes available. It cannot provide an exact global frame ID from a partially built index.

For the product, normal playback and timestamp seeking may begin through a separate player while
indexing runs. Exact stepping, exact `q`/`w` boundaries, and `a` locking must remain disabled until
the full canonical map is ready. A proxy-then-index workflow is viable under this model: play the
source immediately, create a normalized proxy in the background, fully index that proxy, and only
then enable exact review. A genuinely progressive BestSource fork would be a different architecture.

The preparation state must be visible. The UI should identify packet preflight, normalization or
proxy creation, and indexing as separate phases, with progress and a progressively refined ETA.
Persist the validated derivative and BestSource index by source fingerprint, selected track,
BestSource/FFmpeg versions, derivative recipe, and indexing options. A future load may enable exact
controls immediately only after that cache key and source fingerprint validate.

## Initial-Index Performance

The clean run corrected the old claim that `Point Break` never indexed. It did finish, but too slowly
for the signed target.

| ID | Representative | Codec/source | Initial index | Peak RSS |
| --- | --- | --- | ---: | ---: |
| `media-026` | `The Three Musketeers Part I DArtagnan (2023) ...mkv` | 4K 10-bit AV1 | 14.79 min | 1.18 GB |
| `media-035` | `Point.Break.1991...x265-PTer.mkv` | 4K 10-bit HEVC | 21.27 min | 1.64 GB |

Both contain about 175,000 frames. BestSource must decode and hash every one in software, so this
cost is driven by full-frame codec and pixel throughput, not by the number of entries in the final
index. The remaining 43 representatives met the ten-minute target.

For genuine decode-throughput cases such as `media-035`, timestamp repair does not help because
the source already has usable seek points. Available mitigations are:

1. keep ordinary playback/scrubbing in the playback engine and invoke exact access only after scrub
   settlement;
2. retain a warm decoder and bounded cache near the landing point, then prefetch neighboring frames;
3. estimate a distant landing from GOP distance, dimensions, bit depth, codec, and measured decoder
   throughput, and show progress when the estimate is perceptible;
4. create a smaller short-GOP or all-intra review proxy, preserving a verified source-frame map;
5. evaluate hardware decoding separately under the same exact-identity fixtures.

Remuxing does not shorten a GOP. Re-encoding is the reliable way to reduce dependency-chain length.
The current proxy timings below cover the five MPEG-4 timestamp failures, not the 4K HEVC source, so
they do not yet predict `media-035` proxy time.

## Warm-Access Performance

The warm run reproduced seven misses. The three-sample p95 is the slowest start/middle/end request;
it is sufficient to prove a target miss but is not a full latency distribution.

| ID | Representative | Warm p95 | Pinned cause |
| --- | --- | ---: | --- |
| `media-018` | `Les Choses qu'on dit.avi` | 8,943.70 ms | No keyframe with a usable PTS before the request; BestSource decoded linearly from frame 0 |
| `media-019` | `American.Honey.2016.HDRip.XviD.AC3-EVO.avi` | 44,984.46 ms | Same linear-from-zero path; FFmpeg also reports packed Xvid B-frames |
| `media-020` | `Peter Brook - Meetings with remarkable men.avi` | 3,382.53 ms | Same linear-from-zero path |
| `media-023` | `New York Stories.avi` | 32,721.96 ms | Same linear-from-zero path; packed B-frames and damaged MPEG-4 pictures are reported |
| `media-035` | `Point.Break.1991...x265-PTer.mkv` | 1,191.75 ms | Valid seek, then expensive software decode-forward of 4K HEVC frames |
| `media-036` | `I.Knew.Her.Well.1965...HEVC...mkv` | 1,370.34 ms | Five failed seek-location matches, then decode-forward from a much earlier landing point |
| `media-040` | `Les Amis 1971.mkv` | 18,761.57 ms | Linear-from-zero path; FFmpeg reports packed Xvid B-frames |

### Internal Phase Evidence

Temporary timing probes were added to the exact pinned BestSource source, run on one slow frame per
outlier, and then removed before rebuilding the production harness.

Five sources never entered `SeekAndDecode`. `GetSeekFrame` requires a keyframe whose indexed PTS is
not `AV_NOPTS_VALUE`; none was usable before the selected request, so `GetFrameInternal` selected
`GetFrameLinearInternal` from frame 0.

The durable index diagnostic now distinguishes flagged keyframes from PTS-usable keyframes. It found
950/0, 1,931/0, 876/0, 1,109/0, and 754/0 respectively for `media-018`, `media-019`, `media-020`,
`media-023`, and `media-040`. In other words, these files contain many pictures flagged as
keyframes, but none gives BestSource the timestamp it requires for random access.

Timed `SkipFrames` work was:

| ID | Requested frame | Frames skipped from zero | Time inside `SkipFrames` |
| --- | ---: | ---: | ---: |
| `media-018` | 176,240 | 176,220 | 16,627 ms |
| `media-019` | 117,360 | 117,340 | 44,570 ms |
| `media-020` | 77,037 | 77,017 | 3,394 ms |
| `media-023` | 89,515 | 89,495 | 32,707 ms |
| `media-040` | 65,891 | 65,871 | 18,811 ms |

This explains why a small index and a nearby keyframe flag do not guarantee fast access: a keyframe
without a usable timestamp cannot be passed to the demuxer as a seek destination. The decoder then
does real work over tens of thousands of dependent frames.

### Compressed-Packet Preflight

The new lightweight scanner walks the selected compressed video packets without decoding pictures.
For each packet it reads `AV_PKT_FLAG_KEY` and checks whether `AVPacket.pts` is `AV_NOPTS_VALUE`.
For MPEG-4 Part 2 it also counts VOP start codes per packet and looks for the DivX packed marker.
If every key packet lacks PTS, that is a strong early predictor that BestSource will have no
timestamped seek anchor. BestSource's decoded-picture index remains the definitive answer because a
demuxer or decoder may synthesize or reorder timestamps for other formats.

The scan predicted all five zero-usable-keyframe cases exactly. On warm filesystem cache it took
0.86-2.11 seconds per 0.68-1.86 GiB source. It found:

| ID | Packets with PTS | Key packets with PTS | Multi-VOP packets | DivX marker |
| --- | ---: | ---: | ---: | --- |
| `media-018` | 112,759/176,241 | 0/950 | 0 | no |
| `media-019` | 52,769/234,720 | 0/1,931 | 87,409 | yes |
| `media-020` | 75,700/154,075 | 0/876 | 0 | no |
| `media-023` | 0/179,032 | 0/1,110 | 88,427 | yes |
| `media-040` | 34,386/131,783 | 0/754 | 47,881 | yes |

These timestamp gaps are common in legacy AVI because the container can describe a fixed-rate chunk
sequence without storing an explicit presentation timestamp on every packet. B-frames further
separate decode order from display order. Packed Xvid/DivX streams can put two MPEG-4 VOP pictures
in one packet and use a later dummy position, so packet, picture, decode, and display boundaries no
longer line up one-to-one. Old muxers and remuxers may preserve missing packet PTS, while players
synthesize a usable clock during sequential playback.

The DivX marker is only a declaration/hint. More than one VOP in an actual packet is direct evidence
of packing. In `media-019`, the marker remained after the unpack filter had reduced all packets to at
most one VOP, so marker-only output must not be labeled confirmed packing.

For `Point Break`, seek and canonical landing identification took about 141 ms. Decode-forward over
115 skipped 4K frames took about 731 ms; conversion and analysis added roughly 50 ms. This is mainly
software HEVC decode throughput.

The decoder in this path is FFmpeg's HEVC decoder as invoked by BestSource. BestSource chooses the
canonical landing and manages its decoder pool/cache; libavcodec performs the dependent-picture
decode work.

For `I Knew Her Well`, BestSource rejected five candidate seek locations before matching on the
sixth. The five failed attempts took about 205 ms in total. It then decoded forward over 1,379
frames from that earlier match, spending about 1,168 ms in `SkipFrames`. Full-index matching itself
was tens of milliseconds, not the dominant cost.

## Duplicate-Content Diagnostics

The complete-index scan reports duplicate individual hashes, duplicate ten-frame hash sequences,
keyframe gaps, and runtime seek retries. It rules out repeated-content ambiguity for the five
linear-from-zero files because their slow calls never attempt hash-based seek-location matching.

`I Knew Her Well` has four duplicate ten-frame sequence values and five runtime retries. The release
build reports that no destination frame number could be determined, but compiles out the message
that distinguishes an ambiguous hash match from an unsuitable or corrupt landing. To pin that last
branch further:

1. build the same commit without `NDEBUG` so BestSource emits its precise branch at
   `videosource.cpp` around the seek-candidate checks;
2. record the candidate frame-number set after each decoded landing frame;
3. compare the demuxer's requested PTS, actual landed packet/frame, and canonical index hashes;
4. remux a diagnostic copy and repeat to separate container timestamps from codec/GOP behavior.

The current evidence is already sufficient for the product decision because decode-forward, rather
than candidate matching, dominates the observed latency.

A plausible BestSource improvement is to combine hashes with integer timestamps and expected seek
vicinity. After a decoded landing produces several matching hash-sequence positions, filter those
candidates using the landing PTS, requested/actual demux seek PTS, indexed candidate PTS, and a
bounded preroll neighborhood. Identical pictures can occur at many movie positions; their pixels are
the same while their timeline positions are not. PTS can therefore disambiguate position without
making the hash weaker.

This must not become "choose the closest timestamp". VFR, duplicate PTS, discontinuities, open-GOP
preroll, and demuxer undershoot require rational comparisons and tolerances. If several candidates
remain, expand the hash window; if timestamps are unavailable or still ambiguous, retain the current
retreat/fallback. This is a contained BestSource fork/upstream experiment, with dedicated repeated-
still, VFR, duplicate-PTS, discontinuity, and open-GOP fixtures.

## Relevant Media Terms

- A **GOP** is a group of pictures decoded together. An open GOP can depend on pictures before its
  apparent boundary; a closed GOP is self-contained.
- An **I-frame** contains a complete picture, but an H.264 non-IDR I-frame does not necessarily
  prevent later pictures from referring to earlier data. An IDR frame is a stronger restart point.
- **Remuxing** copies compressed streams into a new container without re-encoding. It can repair or
  regenerate container timestamps and keyframe metadata, but it cannot change the encoded GOP.
- **Packed B-frames** are an old MPEG-4 ASP/Xvid convention that packs reordered pictures into AVI
  packets. Packet order, display order, and timestamps can disagree. FFmpeg specifically suggests
  the `mpeg4_unpack_bframes` bitstream filter for affected files. Actual multi-VOP packets confirm
  packing; a DivX packed marker alone can be stale.
- An AVI `idx1` or OpenDML index stores packet offsets and flags. It is distinct from BestSource's
  decoded-frame identity index.

## Remediation Study

The follow-up study measured four interventions on all five missing-keyframe-PTS sources. Full data,
commands, sample hashes, audio checks, and per-source timings are in
[BestSource Remediation Results](bestsource-remediation-results.md).

| Intervention | Rewrite cost | Index cost | Warm exact p95 | Identity result |
| --- | ---: | ---: | ---: | --- |
| Timestamp-only stream-copy | 1.80-3.64 s | 9.00-89.44 s | 16.20-90.00 ms | 5/5 preserve frame count, seven sampled RGBA hashes, ordinals, and audio |
| Unpack-only stream-copy | 1.83-3.37 s | 8.32-25.69 s | 2.86-8.81 s | 0/5 viable; no source gained PTS-usable keyframes |
| Unpack plus timestamps | 2.11-3.97 s | 7.84-25.56 s | 18.02-41.44 ms when identity survived | 3/5 viable; `media-019` lost 74 frame positions and `media-040` lost 28 |
| All-intra proxy | 48.41-146.20 s | 9.53-26.07 s | 74.50-134.21 ms | 5/5 preserve frame count, sampled ordinals, and audio; pixels intentionally change |

### Repair Levels

1. **Detect only.** The packet scan predicts missing seek timestamps cheaply. It changes nothing.
2. **Generate timestamps and remux.** This repairs container timing without decoding or re-encoding.
   It is the safest and cheapest successful intervention here.
3. **Unpack packed MPEG-4 pictures.** This rewrites compressed packet arrangement without changing
   the coded pixel data. It reduced indexing time on packed sources, but did not create timestamped
   seek anchors by itself.
4. **Unpack plus timestamp remux.** This gives excellent access speed but is unsafe as a default for
   source-frame identity: two sources changed total indexed frame count. The likely mechanism is the
   filter's removal/reorganization of dummy packed positions, but this study did not pin the exact
   FFmpeg source branch. The measured frame-map change is enough to reject unconditional use.
5. **Decode/re-encode an all-intra proxy.** This guarantees frequent independent pictures and allows
   a fresh monotonic timeline. It is slower, larger (1.70-2.60 times source size), and lossy, but all
   five completed transform plus indexing in 57.94-172.27 seconds and preserved the canonical source
   frame count through explicit one-picture-per-input-picture timestamping.

The `media-023` "damaged pictures" are concrete FFmpeg decoder warnings, not a label inferred from
its container. A full pinned-FFmpeg decode with repeat suppression disabled emitted 14 `corrupt
decoded frame` reports, 12 `slice end not reached but screenspace end` reports, two macroblock error
reports, one `illegal MB_type`, and one missing marker-bit report. These are MPEG-4 coded-slice or
macroblock syntax problems. FFmpeg still produced the full frame sequence, BestSource indexed it,
and timestamp-only stream-copy preserved all seven sampled decoded hashes. They are therefore not
the cause of the missing keyframe PTS or linear-from-zero seek behavior.

### Packed-Stream Mitigations

- **Leave packing in place and repair timestamps:** 1.80-3.64 seconds, identity-safe on 5/5, but
  indexing packed sources remained slower (35.55-89.44 seconds in this set).
- **Unpack:** similarly cheap sequential I/O and faster packed-source indexing, but unsafe without a
  verified frame map because 2/3 confirmed packed sources changed frame count.
- **All-intra proxy:** 48.41-146.20 seconds plus 9.53-26.07 seconds indexing, identity-safe by ordinal
  on 5/5, and consistently fast later access; larger and lossy.
- **Internal BestSource/FFmpeg-filter integration:** could avoid storing an unpack-only derivative,
  but cannot avoid the frame-map issue and does not synthesize missing PTS by itself. It is not
  justified by this evidence.

## Interpretation

BestSource convincingly proves that canonical global frame identity is achievable above FFmpeg,
and the corrected rerun removes the former stability concern. Stock BestSource still does not meet
the original signed v1 responsiveness contract across the representative set without preparation.

If the product accepts visible background preparation and full indexing, the new evidence makes
BestSource viable for the five missing-PTS failures through timestamp-only normalization. The
recommended order is packet preflight, timestamp-normalized stream-copy when needed, full
BestSource index, then exact controls. Cache the validated derivative and index for future loads.

Use an all-intra proxy as a fallback for genuine decode-forward/indexing cost or sources that remain
problematic after normalization. Do not apply MPEG-4 unpacking unconditionally while source absolute
frame identity is mandatory. The next bounded experiment should apply proxy preparation to the two
4K indexing outliers and `media-036`, then measure the Electron bridge and the background-preparation
UX. The exact fixture oracle and 45-signature matrix remain the comparison standard.
