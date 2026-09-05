# BestSource Prepared-Review Gate Results

Generated from `artifacts/bestsource-preparation-raw.json` or the current checkpoint. This is the
Milestone 3b evidence gate; it does not alter the original Milestone 3 result.

## Result

**PASS**

- Target rule: all normalize-timestamps plus media-026/media-035/media-036, fixtures, and one healthy control
- Completed targets: 16/16
- Full normalized source/review frame-map identity: yes
- Exactly one active review index per completed source: yes
- Valid cache reopen without normalization or full indexing: yes
- Held adjacent-step gate: yes
- Cancellation under two seconds with no published partial entry: yes

## Preparation Evidence

| ID | Role | Status | Policy | Review asset | Container | Cache hit | Normalize ms | Index ms | Frames | Identity | Random p95 ms | Held pass | Error |
|---|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| media-017 | timestamp-normalization | complete | normalize-timestamps | normalized-copy | NUT | yes | 12493.04 | 29881.43 | 163003 | yes | 40.53 | yes |  |
| media-018 | timestamp-normalization | complete | normalize-timestamps | normalized-copy | Matroska | yes | 2661.02 | 25626.25 | 176241 | yes | 39.91 | yes |  |
| media-019 | timestamp-normalization | complete | normalize-timestamps | normalized-copy | Matroska | yes | 3500.96 | 89370.04 | 234720 | yes | 69.01 | yes |  |
| media-020 | timestamp-normalization | complete | normalize-timestamps | normalized-copy | Matroska | yes | 2584.32 | 8972.96 | 154075 | yes | 17.86 | yes |  |
| media-023 | timestamp-normalization | complete | normalize-timestamps | normalized-copy | Matroska | yes | 2125.55 | 64530.21 | 179031 | yes | 30.71 | yes |  |
| media-040 | timestamp-normalization | complete | normalize-timestamps | normalized-copy | Matroska | yes | 1930.24 | 35586.22 | 131783 | yes | 58.18 | yes |  |
| media-026 | diagnostic-control | complete | use-source | source | source | yes | n/a | 826348.15 | 174435 | yes | 638.70 | n/a |  |
| media-035 | diagnostic-control | complete | use-source | source | source | yes | n/a | 1249057.41 | 175400 | yes | 1229.86 | n/a |  |
| media-036 | diagnostic-control | complete | use-source | source | source | yes | n/a | 374175.89 | 166320 | yes | 1525.27 | n/a |  |
| fixture-cfr-ffv1 | fixture | complete | use-source | source | source | yes | n/a | 101.02 | 72 | yes | 10.59 | n/a |  |
| fixture-bframes-long-gop | fixture | complete | use-source | source | source | yes | n/a | 121.58 | 72 | yes | 5.49 | n/a |  |
| fixture-nonzero-start | fixture | complete | use-source | source | source | yes | n/a | 147.64 | 72 | yes | 35.33 | n/a |  |
| fixture-rotated | fixture | complete | use-source | source | source | yes | n/a | 73.28 | 72 | yes | 6.03 | n/a |  |
| fixture-interlaced | fixture | complete | use-source | source | source | yes | n/a | 91.50 | 72 | yes | 5.36 | n/a |  |
| fixture-vfr-ffv1 | fixture | complete | use-source | source | source | yes | n/a | 133.44 | 73 | yes | 40.42 | n/a |  |
| media-005 | healthy-control | complete | use-source | source | source | yes | n/a | 206911.59 | 254181 | yes | 259.22 | yes |  |

## Cache Reopen Evidence

Source validation re-reads the selected compressed track before accepting a cache hit. Cache
validation includes manifest/filesystem checks and, for normalized review copies, a fresh review
packet scan. Constructor time is the BestSource persistent-index reopen, not a full rebuild.

| ID | Cache hit | Source validation ms | Cache validation ms | Index reopen ms | Total reopen run ms |
|---|---:|---:|---:|---:|---:|
| media-017 | yes | 11781.93 | 9557.12 | 33.53 | 23133.04 |
| media-018 | yes | 14849.70 | 16610.55 | 124.08 | 34453.27 |
| media-019 | yes | 11211.47 | 13326.51 | 97.39 | 26955.21 |
| media-020 | yes | 17135.45 | 11173.82 | 67.11 | 29682.61 |
| media-023 | yes | 16769.53 | 10768.95 | 102.28 | 29441.05 |
| media-040 | yes | 5409.35 | 5380.65 | 23.44 | 12283.33 |
| media-026 | yes | 24872.80 | 1.38 | 89.19 | 26213.03 |
| media-035 | yes | 270021.45 | 29.11 | 366.40 | 273768.80 |
| media-036 | yes | 64913.47 | 43.96 | 113.52 | 67102.09 |
| fixture-cfr-ffv1 | yes | 185.40 | 1.45 | 4.31 | 566.55 |
| fixture-bframes-long-gop | yes | 228.19 | 11.66 | 4.32 | 520.75 |
| fixture-nonzero-start | yes | 71.99 | 16.19 | 9.50 | 507.60 |
| fixture-rotated | yes | 59.51 | 1.63 | 5.42 | 360.80 |
| fixture-interlaced | yes | 108.19 | 33.21 | 6.98 | 431.18 |
| fixture-vfr-ffv1 | yes | 79.75 | 1.64 | 11.42 | 551.36 |
| media-005 | yes | 37633.76 | 67.20 | 162.50 | 45283.41 |

## Held-Step Evidence

Each row represents 60 serialized forward requests followed by the
same number of reverse requests from one exact landing. Requests are paced at
90 ms, sustaining each direction for at least five wall-clock
seconds with one request in flight; no operating-system key-repeat queue is used.

| ID | Landing | Start frame | Forward fps | Reverse fps | Forward s | Reverse s | Forward p95 ms | Reverse p95 ms | Reverse misses | Delivered cache | Identity |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| media-017 | start | 0 | 10.65 | 10.68 | 5.64 | 5.62 | 6.03 | 5.61 | 0 | 24.1 MiB | yes |
| media-017 | middle | 81471 | 10.69 | 10.71 | 5.61 | 5.60 | 5.62 | 4.94 | 0 | 24.1 MiB | yes |
| media-017 | end | 162942 | 10.73 | 10.68 | 5.59 | 5.62 | 4.61 | 5.61 | 0 | 24.1 MiB | yes |
| media-017 | before-gop-boundary | 81406 | 10.66 | 10.73 | 5.63 | 5.59 | 6.19 | 4.21 | 0 | 24.1 MiB | yes |
| media-017 | at-gop-boundary | 81408 | 10.69 | 10.69 | 5.61 | 5.61 | 6.00 | 5.46 | 0 | 24.1 MiB | yes |
| media-018 | start | 0 | 10.68 | 10.69 | 5.62 | 5.61 | 13.15 | 12.47 | 0 | 59.0 MiB | yes |
| media-018 | middle | 88090 | 10.72 | 10.69 | 5.60 | 5.61 | 8.44 | 11.31 | 0 | 59.0 MiB | yes |
| media-018 | end | 176180 | 10.69 | 10.74 | 5.61 | 5.59 | 13.01 | 13.45 | 0 | 59.0 MiB | yes |
| media-018 | before-gop-boundary | 87905 | 10.67 | 10.71 | 5.62 | 5.60 | 13.13 | 8.15 | 0 | 59.0 MiB | yes |
| media-018 | at-gop-boundary | 87907 | 10.69 | 10.66 | 5.61 | 5.63 | 12.91 | 8.35 | 0 | 59.0 MiB | yes |
| media-019 | start | 0 | 10.71 | 10.65 | 5.60 | 5.63 | 7.94 | 5.96 | 0 | 34.2 MiB | yes |
| media-019 | middle | 117330 | 10.71 | 10.69 | 5.60 | 5.61 | 7.77 | 7.63 | 0 | 34.2 MiB | yes |
| media-019 | end | 234659 | 10.73 | 10.66 | 5.59 | 5.63 | 8.04 | 8.10 | 0 | 34.2 MiB | yes |
| media-019 | before-gop-boundary | 117263 | 10.69 | 10.72 | 5.61 | 5.60 | 7.82 | 7.82 | 0 | 34.2 MiB | yes |
| media-019 | at-gop-boundary | 117265 | 10.67 | 10.71 | 5.62 | 5.60 | 7.94 | 7.36 | 0 | 34.2 MiB | yes |
| media-020 | start | 0 | 10.69 | 10.72 | 5.61 | 5.60 | 3.03 | 3.75 | 0 | 18.3 MiB | yes |
| media-020 | middle | 77007 | 10.76 | 10.67 | 5.58 | 5.62 | 2.56 | 3.42 | 0 | 18.3 MiB | yes |
| media-020 | end | 154014 | 10.65 | 10.72 | 5.64 | 5.60 | 3.95 | 3.24 | 0 | 18.3 MiB | yes |
| media-020 | before-gop-boundary | 76888 | 10.71 | 10.72 | 5.60 | 5.60 | 3.94 | 3.77 | 0 | 18.3 MiB | yes |
| media-020 | at-gop-boundary | 76890 | 10.68 | 10.72 | 5.62 | 5.60 | 4.38 | 4.06 | 0 | 18.3 MiB | yes |
| media-023 | start | 0 | 10.67 | 10.68 | 5.62 | 5.62 | 5.60 | 6.43 | 0 | 26.8 MiB | yes |
| media-023 | middle | 89485 | 10.65 | 10.68 | 5.63 | 5.62 | 5.59 | 6.12 | 0 | 26.8 MiB | yes |
| media-023 | end | 178970 | 10.69 | 10.71 | 5.61 | 5.60 | 6.07 | 5.27 | 0 | 26.8 MiB | yes |
| media-023 | before-gop-boundary | 89371 | 10.66 | 10.71 | 5.63 | 5.60 | 6.88 | 3.86 | 0 | 26.8 MiB | yes |
| media-023 | at-gop-boundary | 89373 | 10.64 | 10.70 | 5.64 | 5.61 | 6.66 | 5.86 | 0 | 26.8 MiB | yes |
| media-040 | start | 0 | 10.69 | 10.70 | 5.61 | 5.61 | 5.10 | 4.73 | 0 | 21.4 MiB | yes |
| media-040 | middle | 65861 | 10.79 | 10.70 | 5.56 | 5.61 | 4.73 | 3.91 | 0 | 21.4 MiB | yes |
| media-040 | end | 131722 | 10.62 | 10.69 | 5.65 | 5.61 | 3.83 | 4.36 | 0 | 21.4 MiB | yes |
| media-040 | before-gop-boundary | 65715 | 10.75 | 10.73 | 5.58 | 5.59 | 4.48 | 4.31 | 0 | 21.4 MiB | yes |
| media-040 | at-gop-boundary | 65717 | 10.74 | 10.71 | 5.59 | 5.60 | 5.49 | 3.37 | 0 | 21.4 MiB | yes |
| media-005 | start | 0 | 10.75 | 10.70 | 5.58 | 5.61 | 25.47 | 29.69 | 0 | 180.9 MiB | yes |
| media-005 | middle | 127060 | 10.72 | 10.71 | 5.60 | 5.60 | 30.07 | 33.26 | 0 | 180.9 MiB | yes |
| media-005 | end | 254120 | 10.73 | 10.67 | 5.59 | 5.62 | 32.70 | 30.36 | 0 | 180.9 MiB | yes |
| media-005 | before-gop-boundary | 126941 | 10.68 | 10.71 | 5.62 | 5.60 | 29.40 | 23.89 | 0 | 180.9 MiB | yes |
| media-005 | at-gop-boundary | 126943 | 10.70 | 10.67 | 5.61 | 5.62 | 33.58 | 29.48 | 0 | 180.9 MiB | yes |

## Cancellation

| Phase | Target | Acknowledged | Elapsed ms | Valid entry published |
|---|---|---:|---:|---:|
| Normalization | media-017 | yes | 284.81 | no |
| Indexing | media-035 | yes | 735.24 | no |

## Interpretation

Initial preparation is allowed to exceed the former ten-minute target, but progress must be visible
and the resulting cache must prevent normalization and full indexing on a valid future load. A
timestamp-normalized review copy is a media artifact; its BestSource index is the one canonical
exact-review index. The original movie remains the extraction source.
