# GIF Extraction Original-Source Proof

Date: 2026-09-13

Status: Milestone 1 proof passed on the configured Windows development machine.

## Result

An exact locked range can be exported from the original movie as an MP4 without reading video or audio from the playback proxy. The proved recipe:

1. treats the selected canonical ordinals as an inclusive interval `[startFrame, endFrame]`;
2. decodes the original video from its beginning and selects frames by decoded ordinal;
3. uses the original source presentation time of `startFrame` as the audio start and the original source presentation time of `endFrame + 1` as the exclusive audio end;
4. preserves the input timestamp clock while trimming audio, then rebases both output streams to zero;
5. encodes lossless H.264 RGB video and AAC audio into MP4 without changing the source's declared width or height.

The existing BestSource gate already exposed the required canonical ordinal, original-source PTS, timebase, duration, and decoded-frame identity when opened on the original movie. No spike source change or broad spike inspection was needed.

## Fixture construction

Run:

```powershell
powershell -ExecutionPolicy Bypass -File tools/gif-extraction/create-fixtures.ps1
```

The generator uses deterministic FFmpeg `testsrc` video and sine-wave audio and writes a BOM-free manifest at `tests/fixtures/gif-extraction/manifest.json`. Generated media and caches remain under the ignored `tests/fixtures/gif-extraction/generated/` subtree.

| Fixture | Purpose | Selected ordinals | Source interval |
| --- | --- | ---: | ---: |
| `cfr-audio` | CFR video plus PCM audio | 8-23 | 0.333-1.000 s |
| `vfr-audio` | deliberately non-uniform presentation cadence plus PCM audio | 7-19 | 0.375-1.083 s |
| `timestamp-repair` | original PTS offset by five seconds; review derivative normalized near zero | 5-15 | 5.208-5.667 s |
| `odd-dimensions-audio` | source dimensions that common 4:2:0 encoders cannot represent unchanged | 3-11 | 0.125-0.500 s |
| `no-audio` | negative selected-stream validation | 4-8 | not exportable |

The checked-in manifest records expected dimensions, source/review frame counts, presentation intervals, sample rate, and every selected decoded RGBA frame hash. Regeneration validates that the timestamp-repair derivative keeps one-to-one canonical frame content while changing its playback clock.

## Ordinal and audio mapping

The frame index is the identity authority; proxy or repaired-review time is not an export coordinate. For a source description containing presentation-ordered frames `F`:

```text
video frames = F[startFrame ... endFrame]
audio interval = [PTS(F[startFrame]), PTS(F[endFrame + 1]))
```

For the timestamp-repair fixture, ordinal 5 is at 5.208 seconds in the original but at 0.208 seconds in the normalized review file. The proof succeeds with 5.208 seconds and deliberately rejects substituting the review input. This is the evidence that the implementation must return to original-source presentation metadata rather than reuse proxy time.

The current prototype requires a following frame. For a range ending on the movie's final canonical frame, production code must derive the exclusive audio end from that final frame's original duration. That end-of-file case remains a Milestone 7 implementation and oracle case; it must not fall back to proxy duration.

## Candidate recipes

### Full source decode with ordinal selection - selected

The video stage uses the original input and the equivalent of:

```text
select='between(n,startFrame,endFrame)',setpts=PTS-STARTPTS
```

The audio stage reopens the original input with input timestamps preserved, trims the original presentation interval, rebases it, and muxes it with the selected video. This direct ordinal mapping passed CFR, VFR, repaired-timestamp, and odd-dimension cases, so it is the correctness-first production baseline.

### Coarse input seek plus relative ordinal selection - deferred optimization

The benchmark also sought to 50 seconds before decode and selected relative ordinals 120-143 to reach canonical ordinals 1320-1343 in a known 24 fps CFR file. Its output passed the same video and audio checks. It is not the initial production recipe because an arbitrary VFR or timestamp-repaired source needs an additional proved mapping from the seek landing frame to a canonical source ordinal. A timestamp-only guess would recreate the proxy-time error this milestone is intended to prevent.

Run the comparison with:

```powershell
powershell -ExecutionPolicy Bypass -File tools/gif-extraction/benchmark-recipes.ps1
```

One run on the generated 60-second, 1280x720, 24 fps, 1,440-frame, 240-frame-GOP MP4 selected frames 1320-1343:

| Recipe | Video stage | Total encode/mux | Exact 24 video frames | Audio boundary difference | Audio correlation |
| --- | ---: | ---: | --- | ---: | ---: |
| Full decode | 448 ms | 622 ms | yes | 0 samples | 0.999918 |
| Coarse seek | 228 ms | 391 ms | yes | 0 samples | 0.999918 |

These are single-run development-machine observations, not a performance threshold. Correctness keeps full decode as the baseline; coarse seek can be reconsidered only with a canonical landing-frame proof across the full fixture matrix.

## Codec and tool result

The original MS1 proof used the repository FFmpeg `N-92722-gf22fcd4483` for its available `libx264rgb` encoder and the spike's pinned FFmpeg/FFprobe 9.0 build for current AAC timestamp handling and probing, so that first prototype was intentionally two-stage. MS2 resolved that packaging gap: the production-owned vcpkg graph enables FFmpeg 9.0's `gpl` and `x264` features, producing one pinned distribution with `ffmpeg.exe`, `ffprobe.exe`, built-in AAC, and `libx264rgb`. The complete four-fixture proof was rerun successfully with that one distribution on 2026-09-14. Application startup does not build or bootstrap it.

The selected output policy is:

- MP4 container;
- H.264 RGB, CRF 0, `rgb24` input to preserve decoded RGBA frame hashes and odd dimensions;
- AAC at 192 kbit/s;
- no resize, pad, crop, rotation, or proxy input;
- the source's first audio stream for this milestone's selected-audio proof.

The initial experiment used the old repository FFmpeg for AAC decode verification and observed a 752-sample priming discrepancy. Re-running both reference and output decoding with the pinned FFmpeg 9.0 correctly honored MP4 skip/edit metadata: every fixture and the longer AAC-source benchmark had a zero-sample boundary difference. AAC is lossy, so audio content is checked by sample count plus correlation and normalized error rather than byte equality.

## Automated evidence

Run:

```powershell
powershell -ExecutionPolicy Bypass -File tools/gif-extraction/verify-extraction.ps1 -All
```

Results:

| Fixture | Output frames | Dimensions | Audio samples | Boundary difference | Correlation | Normalized error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| CFR | 16 | 320x180 | 32,016 | 0 | 0.999759 | 0.021957 |
| VFR | 13 | 320x180 | 33,984 | 0 | 0.999985 | 0.005538 |
| Timestamp repair | 11 | 320x180 | 22,032 | 0 | 0.999965 | 0.008356 |
| Odd dimensions | 9 | 321x181 | 18,000 | 0 | 0.999946 | 0.010374 |

For every positive fixture, the verifier asserts:

- source and review canonical frame sequences correspond one-to-one;
- BestSource endpoint ordinals, PTS values, and timebase match the original-source index evidence;
- output count is `endFrame - startFrame + 1`;
- every output decoded RGBA hash, including the first and last, equals the selected original decoded frame;
- output width and height equal the original source;
- H.264 video and AAC audio streams exist;
- decoded audio length differs from the original selected interval by at most one sample (observed: zero);
- decoded audio content passes correlation and normalized-error bounds.

Negative controls prove that the verifier rejects a one-frame-shifted range, rejects the no-audio fixture, and rejects use of the timestamp-normalized review file in place of the original source.

The 321x181 output was also opened through both product playback paths:

- Electron 37 reached `HAVE_ENOUGH_DATA`, played beyond 0.1 seconds, and reported 321x181 video dimensions;
- the spike's LibVLC smoke gate completed and displayed a frame. Its callback buffer was internally aligned to 336x194, while container/display metadata remained 321x181.

Use the Electron check directly with:

```powershell
node tools/gif-extraction/check-electron-playback.mjs tests/fixtures/gif-extraction/generated/proof-output/odd-dimensions-audio.mp4
```

## Limits carried forward

- The fixtures are deterministic synthetic sources. Representative real-movie acceptance remains required in Milestones 7 and 8.
- Only the first selected audio stream is proved here; any multi-stream selection policy must be explicit before it is broadened.
- H.264 RGB plus AAC was exercised in the Windows Electron/LibVLC stack, not claimed as universal browser compatibility.
- The end-of-movie inclusive-frame audio boundary still needs its final-frame-duration case.
- The benchmark does not authorize a coarse-seek optimization and establishes no latency pass/fail target.
- Generated proof JSON is diagnostic output and is intentionally ignored; the manifest, scripts, and this report are the reviewable evidence.

With those limits recorded, the original-source extraction contract is feasible and Milestone 1 may pass without altering the spike implementation.
