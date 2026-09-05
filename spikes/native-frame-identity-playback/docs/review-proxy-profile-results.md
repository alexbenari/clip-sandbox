# Review Proxy Profile Results

This bounded Phase 3B runner compares GOP 1, 6, and 12 review proxies. Full fixtures are used;
real-media cases are 60-second stream-copy samples beginning at 600 seconds. Targets and profiles
run sequentially in a temporary cache. The canonical BestSource index remains the frame-identity
authority; the proxy index is checked for one-to-one ordinal correspondence.

Presentation timestamps are compared at the first, middle, and last sampled proxy frames. The
documented tolerance is 2000 microseconds. This is a
measurement report, not a claim that proxy pixels equal source pixels.
Timestamp-normalized sources may use an explicitly mapped monotonic repair up to
50000 microseconds; healthy sources must pass the
strict tolerance.

## Run

- Mode: `full`
- Started: `2026-08-28T18:01:14.634Z`
- Completed: `2026-08-28T18:02:54.183Z`
- FFmpeg: `9.0`
- BestSource: `825af4e691524a3c98383d0cfe7d85b4142005cc`

## Results

| Target | Profile | Status | Encode ms | Index ms | Total ms | Proxy bytes | Access p95 ms | Frame map | Audio | Relative time | Error |
|---|---:|---|---:|---:|---:|---:|---:|---|---|---|---|
| fixture-cfr-ffv1 | GOP 1 | complete | 89.12 | 70.04 | 535.21 | 664026 | 0.90 | yes | yes | strict |  |
| fixture-cfr-ffv1 | GOP 6 | complete | 87.45 | 66.38 | 498.14 | 558669 | 0.77 | yes | yes | strict |  |
| fixture-cfr-ffv1 | GOP 12 | complete | 91.42 | 57.17 | 486.36 | 546332 | 0.67 | yes | yes | strict |  |
| fixture-bframes-long-gop | GOP 1 | complete | 72.41 | 58.28 | 460.49 | 643577 | 0.73 | yes | yes | strict |  |
| fixture-bframes-long-gop | GOP 6 | complete | 96.90 | 57.27 | 489.65 | 540461 | 0.69 | yes | yes | strict |  |
| fixture-bframes-long-gop | GOP 12 | complete | 73.70 | 57.16 | 444.49 | 527726 | 0.99 | yes | yes | strict |  |
| fixture-nonzero-start | GOP 1 | complete | 117.58 | 65.59 | 587.82 | 664026 | 0.91 | yes | yes | strict |  |
| fixture-nonzero-start | GOP 6 | complete | 113.97 | 58.30 | 541.45 | 558669 | 0.73 | yes | yes | strict |  |
| fixture-nonzero-start | GOP 12 | complete | 123.53 | 62.07 | 579.55 | 546332 | 0.78 | yes | yes | strict |  |
| fixture-rotated | GOP 1 | complete | 71.53 | 58.62 | 457.53 | 641401 | 0.70 | yes | yes | strict |  |
| fixture-rotated | GOP 6 | complete | 75.50 | 57.98 | 455.46 | 537995 | 0.73 | yes | yes | strict |  |
| fixture-rotated | GOP 12 | complete | 75.60 | 57.10 | 454.15 | 526369 | 0.80 | yes | yes | strict |  |
| fixture-interlaced | GOP 1 | complete | 64.60 | 56.45 | 441.07 | 665888 | 0.71 | yes | yes | strict |  |
| fixture-interlaced | GOP 6 | complete | 75.94 | 60.00 | 468.97 | 563646 | 0.84 | yes | yes | strict |  |
| fixture-interlaced | GOP 12 | complete | 74.45 | 71.84 | 465.02 | 549473 | 0.89 | yes | yes | strict |  |
| fixture-vfr-ffv1 | GOP 1 | complete | 115.41 | 58.64 | 568.26 | 672702 | 0.93 | yes | yes | strict |  |
| fixture-vfr-ffv1 | GOP 6 | complete | 121.16 | 67.23 | 565.38 | 567341 | 0.78 | yes | yes | strict |  |
| fixture-vfr-ffv1 | GOP 12 | complete | 116.33 | 58.94 | 549.68 | 555003 | 0.80 | yes | yes | strict |  |
| media-017 | GOP 1 | complete | 1621.62 | 215.08 | 2401.32 | 36418554 | 7.12 | yes | yes | mapped repair |  |
| media-017 | GOP 6 | complete | 1688.91 | 201.39 | 2492.28 | 16912293 | 8.03 | yes | yes | mapped repair |  |
| media-017 | GOP 12 | complete | 1702.37 | 189.05 | 2453.16 | 15119448 | 6.98 | yes | yes | mapped repair |  |
| media-005 | GOP 1 | complete | 3373.33 | 373.85 | 4614.04 | 43039062 | 10.97 | yes | yes | strict |  |
| media-005 | GOP 6 | complete | 3545.39 | 314.73 | 4723.94 | 14789481 | 10.50 | yes | yes | strict |  |
| media-005 | GOP 12 | complete | 3511.90 | 301.77 | 4660.84 | 12097689 | 10.30 | yes | yes | strict |  |
| media-035 | GOP 1 | complete | 13843.62 | 271.26 | 15677.34 | 16223963 | 8.47 | yes | yes | strict |  |
| media-035 | GOP 6 | complete | 14423.39 | 282.29 | 16261.78 | 6839715 | 8.26 | yes | yes | strict |  |
| media-035 | GOP 12 | complete | 14640.15 | 237.43 | 16411.18 | 5925921 | 8.27 | yes | yes | strict |  |

## Decision

Selected: **GOP 1** (`mpeg4-gop1-q5-960-source-clock-aac-v1`).

All accepted profiles preserved the tested frame map, timing policy, normalized audio, and fast access. GOP 1 had the lowest mean encode time on the real-media samples and minimizes decode-forward work. GOP 6 and GOP 12 reduce cache size, but cache size is not the current optimization target.

## Selected Contract

- Video: MPEG-4 Part 2, maximum 960 pixels wide, quality value 5, GOP 1, no B-frames, 8-bit
  `yuv420p`.
- Clock: 60,000 ticks per second, preserving source-relative presentation times. Duplicate or
  backward timestamps advance to the next tick; the complete proxy ordinal remains mapped to the
  same canonical source ordinal.
- Audio: one non-commentary stereo program is preferred, encoded as AAC stereo at 192 kbps and
  48 kHz. Audio-less sources remain audio-less.
- Runtime: LibVLC switches from provisional original playback to this proxy after preparation;
  BestSource resolves proxy time to proxy ordinal and returns identity from the canonical index.
- Cache: the profile, timing policy, mapping version, source fingerprint, and dependency versions
  participate in cache identity.

## Full-Movie Electron Evidence

- Source: `Point.Break.1991.2160p.UHD.BluRay.DTS-HD.MA.5.1.DoVi.HDR.x265-PTer.mkv`.
- Mapping: 175400 canonical frames;
  175400 proxy frames.
- Cached activation: 1.45 ms; playback source
  `review-proxy`.
- Profile: `mpeg4-gop1-q5-960-source-clock-aac-v1`; GOP 1;
  0 B-frames.
- Full-player drag: 12/12
  positions displayed at 7.94 fps, with
  123.40 ms to the first displayed drag frame and
  106.50 ms p95 landing latency.
- Selected source audio: `ac3`;
  2 channels; source stream
  3. The proxy encodes it as stereo AAC.
- Control result: no player error; exact stepping and canonical range capture passed.

This proves the complete 4K source can reopen its cached one-to-one proxy and exercise the Electron
control through the selected playback path. It does not replace the human audio, enlarged-image,
or handoff-quality judgment.

## Hands-On Result

On 2026-08-29, the user reviewed the selected profile on the
difficult 4K representative and reported that the image looked really good and the sound was great.
The visual-quality and preview-audio gates therefore pass. The cold original-to-proxy transition was
not observed in this cached review and remains a narrow residual UX check.

## Interpretation

`Frame map` requires equal canonical, encoded, and indexed frame counts. `Audio` requires the
selected proxy audio stream to be AAC, stereo, and 48 kHz. `Relative time` requires all three
probed presentation times to be within the stated tolerance. Failed rows are retained so a single
profile or target failure does not hide the rest of the comparison.
