# BestSource Remediation Results

Generated 2026-08-14T21:58:59.538Z on Windows x64 by `scripts/run-bestsource-remediation.mjs`.

## Sources

| Media | Source file |
| --- | --- |
| media-023 | New York Stories.avi |
| media-018 | Les Choses qu'on dit.avi |
| media-019 | American.Honey.2016.HDRip.XviD.AC3-EVO.avi |
| media-020 | Peter Brook - Meetings with remarkable men.avi |
| media-040 | Les Amis 1971.mkv |

## Method

The five sources are the complete set in the current representative matrix for which BestSource found zero PTS-usable keyframes. Each candidate is measured as a distinct intervention:

1. `timestamp-remux`: synthesize missing timestamps while stream-copying into Matroska.
2. `unpack-only-remux`: apply FFmpeg's MPEG-4 Part 2 packed-B-frame bitstream filter while stream-copying into AVI, without requesting timestamp generation.
3. `unpack-and-timestamp-remux`: combine packed-picture normalization with timestamp generation and Matroska remuxing.
4. `all-intra-proxy`: decode and re-encode a maximum-960-pixel-wide, all-intra review proxy while preserving one output picture per input picture and stream-copying audio.

BestSource builds a clean index for every derivative. The baseline reuses the persistent source index produced by the main gate, so its constructor time is a warm-cache reopening measurement rather than a fresh indexing cost. Warm access uses seven deliberately non-monotonic frame requests, modeling a quick scrub to a distant area followed by exact work. Stream-copy candidates must preserve frame count and all seven sampled RGBA hashes. The lossy proxy must preserve frame count and sampled ordinal identity, but pixel hashes are expected to differ.

## Findings

- Compressed-packet preflight predicted all five missing-keyframe-PTS cases and took 0.86-2.11 seconds on warm filesystem cache.
- Timestamp-only stream-copy was viable for 5/5: 1.80-3.64 seconds rewrite, 9.00-89.44 seconds indexing, and 16.20-90.00 ms warm exact-access p95. It preserved frame count, sampled pixels, ordinals, and audio.
- Unpack-only was viable for 0/5 because it did not create PTS-usable keyframes.
- Combined unpack plus timestamp repair was viable for 3/5. It changed `media-019` from 234,720 to 234,646 indexed frames and `media-040` from 131,783 to 131,755, so it cannot preserve source absolute frame identity by default.
- The all-intra proxy was viable for 5/5: 48.41-146.20 seconds encode plus 9.53-26.07 seconds indexing, 74.50-134.21 ms warm p95, and 1.70-2.60 times source disk size.

## Measurements

| Media | Level | Scan s | Transform s | GiB | Packet key PTS | Packed evidence | Index s | Indexed key PTS | Warm p95 ms | Source->candidate frames | Sample pixels | Ordinal | Audio | Viable | Error |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- |
| media-023 | baseline | 1.53 |  | 1.40 | 0/1110 | confirmed | 0.08 | 0/1109 | 32944.18 | 179031->179031 | yes | yes | yes | no |  |
| media-023 | timestamp-remux | 2.07 | 2.34 | 1.39 | 1110/1110 | confirmed | 64.85 | 1109/1109 | 90.00 | 179031->179031 | yes | yes | yes | yes |  |
| media-023 | unpack-only-remux | 1.68 | 2.48 | 1.40 | 0/1110 | none | 13.42 | 0/1109 | 4825.68 | 179031->179031 | yes | yes | yes | no |  |
| media-023 | unpack-and-timestamp-remux | 1.57 | 2.70 | 1.39 | 1110/1110 | none | 13.08 | 1109/1109 | 18.02 | 179031->179031 | yes | yes | yes | yes |  |
| media-023 | all-intra-proxy | 2.96 | 86.94 | 3.13 | 179031/179031 | none | 16.43 | 179031/179031 | 98.13 | 179031->179031 | n/a | yes | yes | yes |  |
| media-018 | baseline | 2.01 |  | 1.86 | 0/950 | none | 0.14 | 0/950 | 8549.34 | 176241->176241 | yes | yes | yes | no |  |
| media-018 | timestamp-remux | 1.96 | 3.21 | 1.86 | 950/950 | none | 25.59 | 950/950 | 38.91 | 176241->176241 | yes | yes | yes | yes |  |
| media-018 | unpack-only-remux | 2.00 | 3.09 | 1.86 | 0/950 | none | 25.69 | 0/950 | 8811.93 | 176241->176241 | yes | yes | yes | no |  |
| media-018 | unpack-and-timestamp-remux | 1.95 | 3.97 | 1.86 | 950/950 | none | 25.56 | 950/950 | 41.44 | 176241->176241 | yes | yes | yes | yes |  |
| media-018 | all-intra-proxy | 3.23 | 105.74 | 3.39 | 176241/176241 | none | 20.40 | 176241/176241 | 101.63 | 176241->176241 | n/a | yes | yes | yes |  |
| media-019 | baseline | 2.11 |  | 1.66 | 0/1931 | confirmed | 0.29 | 0/1931 | 44927.79 | 234720->234720 | yes | yes | yes | no |  |
| media-019 | timestamp-remux | 1.71 | 3.64 | 1.65 | 1931/1931 | confirmed | 89.44 | 1931/1931 | 78.48 | 234720->234720 | yes | yes | yes | yes |  |
| media-019 | unpack-only-remux | 2.15 | 3.37 | 1.66 | 0/1931 | marker-only | 21.20 | 0/1931 | 6725.51 | 234720->234646 | no | yes | yes | no |  |
| media-019 | unpack-and-timestamp-remux | 1.74 | 3.97 | 1.65 | 1931/1931 | marker-only | 20.48 | 1931/1931 | 18.10 | 234720->234646 | no | yes | yes | no |  |
| media-019 | all-intra-proxy | 3.44 | 146.20 | 3.71 | 234720/234720 | none | 26.07 | 234720/234720 | 134.21 | 234720->234720 | n/a | yes | yes | yes |  |
| media-020 | baseline | 1.70 |  | 1.36 | 0/876 | none | 0.16 | 0/876 | 3532.44 | 154075->154075 | yes | yes | yes | no |  |
| media-020 | timestamp-remux | 1.56 | 3.03 | 1.36 | 876/876 | none | 9.00 | 876/876 | 16.20 | 154075->154075 | yes | yes | yes | yes |  |
| media-020 | unpack-only-remux | 1.58 | 2.94 | 1.37 | 0/876 | none | 9.34 | 0/876 | 3531.17 | 154075->154075 | yes | yes | yes | no |  |
| media-020 | unpack-and-timestamp-remux | 1.53 | 2.81 | 1.36 | 876/876 | none | 9.14 | 876/876 | 18.59 | 154075->154075 | yes | yes | yes | yes |  |
| media-020 | all-intra-proxy | 2.33 | 55.31 | 2.31 | 154075/154075 | none | 10.22 | 154075/154075 | 82.83 | 154075->154075 | n/a | yes | yes | yes |  |
| media-040 | baseline | 0.86 |  | 0.68 | 0/754 | confirmed | 0.07 | 0/754 | 18876.03 | 131783->131783 | yes | yes | yes | no |  |
| media-040 | timestamp-remux | 0.91 | 1.80 | 0.68 | 754/754 | confirmed | 35.55 | 754/754 | 66.43 | 131783->131783 | yes | yes | yes | yes |  |
| media-040 | unpack-only-remux | 1.34 | 1.83 | 0.80 | 0/754 | none | 8.32 | 0/754 | 2860.07 | 131783->131755 | no | yes | yes | no |  |
| media-040 | unpack-and-timestamp-remux | 0.91 | 2.11 | 0.68 | 754/754 | none | 7.84 | 754/754 | 20.73 | 131783->131755 | no | yes | yes | no |  |
| media-040 | all-intra-proxy | 1.80 | 48.41 | 1.76 | 131783/131783 | none | 9.53 | 131783/131783 | 74.50 | 131783->131783 | n/a | yes | yes | yes |  |

`Packet key PTS` is the lightweight compressed-packet preflight. `Indexed key PTS` is BestSource's definitive decoded-picture index. `Sample pixels` compares seven normalized RGBA hashes for stream-copy candidates; proxy pixels intentionally differ.

## Interpretation

This experiment distinguishes detection cost, sequential rewrite cost, initial BestSource indexing cost, and later exact random-access cost. A stream-copy result is only accepted when decoded samples remain bit-for-bit identical. A proxy result is only accepted as an exact review surrogate when its global frame ordinal remains one-to-one with the source; final clip extraction would still use the original source and the captured global frame IDs.
