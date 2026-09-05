# Sampled Cache-Signature Results

## Result

The selected cache signature uses 3 minutes from start, 3 minutes from end, three deterministic 1-minute interior samples. It hashes compressed selected-track packets and does
not decode frames or wait for media-time playback. File size, duration, selected-track metadata,
the exact stored sample ranges, and sampled packet content all participate in validation.

The initially proposed 5+5+5x1 profile is retained as a comparison. The compact 3+3+3x1 profile is
selected because cache reopening is interactive and the larger profile remained disruptive on the
4K HEVC outlier.

| ID | Previous full scan ms | 5+5+5x1 ms | 3+3+3x1 ms | Compact speedup | Compact media s | Merged ranges | Deterministic |
|---|---:|---:|---:|---:|---:|---:|---:|
| media-017 | 11781.93 | 1113.56 | 676.08 | 17.4x | 540.00 | 5 | yes |
| media-018 | 14849.70 | 1141.12 | 744.52 | 19.9x | 540.00 | 5 | yes |
| media-019 | 11211.47 | 733.33 | 495.13 | 22.6x | 540.00 | 5 | yes |
| media-020 | 17135.45 | 1185.33 | 767.29 | 22.3x | 540.00 | 5 | yes |
| media-023 | 16769.53 | 754.91 | 476.83 | 35.2x | 540.00 | 5 | yes |
| media-040 | 5409.35 | 542.65 | 300.50 | 18.0x | 540.00 | 5 | yes |
| media-026 | 24872.80 | 1730.12 | 1065.11 | 23.4x | 540.00 | 5 | yes |
| media-035 | 270021.45 | 12309.83 | 6315.74 | 42.8x | 539.01 | 4 | yes |
| media-036 | 64913.47 | 3745.25 | 2065.01 | 31.4x | 540.00 | 5 | yes |
| fixture-cfr-ffv1 | 185.40 | 56.26 | 37.51 | 4.9x | 3.00 | 1 | yes |
| fixture-bframes-long-gop | 228.19 | 49.95 | 49.30 | 4.6x | 3.00 | 1 | yes |
| fixture-nonzero-start | 71.99 | 36.68 | 39.51 | 1.8x | 8.00 | 1 | yes |
| fixture-rotated | 59.51 | 31.01 | 50.46 | 1.2x | 3.00 | 1 | yes |
| fixture-interlaced | 108.19 | 34.97 | 35.21 | 3.1x | 2.88 | 1 | yes |
| fixture-vfr-ffv1 | 79.75 | 37.86 | 39.23 | 2.0x | 5.80 | 1 | yes |
| media-005 | 37633.76 | 1646.27 | 1155.97 | 32.6x | 540.00 | 5 | yes |

Worst 5+5+5x1 validation: 12309.83 ms. Worst selected 3+3+3x1 validation:
6315.74 ms.

This is probabilistic change detection: content modified outside all sampled ranges can evade the
signature. That residual risk is explicitly accepted for interactive cache reopening. The original
full packet scan remains part of first-time preparation and normalization proof.
