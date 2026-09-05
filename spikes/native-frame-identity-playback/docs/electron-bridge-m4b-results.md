# Electron Frame-Bridge M4b Results

## Result

**PASS**

- Measured transport: binary
- Preview policy: fit oversized sources to the renderer viewport without upscaling
- Scrub debounce: 100 ms
- Ordinary length-prefixed binary stdio plus Electron structured-clone transfer: sufficient
- Viewport-sized 4K bridge gate: pass (28.65 ms p95)
- Shared-memory ring-buffer experiment: not required for viewport-sized preview frames
- Latest-wins scrub queue bounded to one in-flight plus one pending: yes
- Newest scrub request was the only delivered result: yes
- Renderer pixel checks passed: yes
- Worst measured p95 bridge-copy/upload overhead: 40.23 ms

Bridge overhead is native-to-main pipe transfer plus main serialization, main-to-renderer transfer,
and Canvas 2D upload/draw. Decode time is reported separately so known codec/GOP costs do not get
misattributed to Electron IPC.

| Target | Source | Source frame | Preview frame | Payload reduction | Exact decode p95 ms | Conversion p95 ms | Exact bridge p95 ms | Exact total p95 ms | Adjacent bridge p95 ms | Adjacent total p95 ms | Scrub settle ms | Scrub delivered | Playback visible fps | Native drops | Pixels |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| media-005 | tuntematon_sotilas-finnish.mp4 | 1920x1080 | 1264x711 | 2.31x | 251.33 | 4.17 | 26.97 | 272.30 | 40.23 | 35.30 | 2296.10 | 1/20 | 23.03 | 0 | yes |
| media-017 | Dizengoff.99.1979.DVDRip-IL.XviD-DownRev.avi | 720x384 | 720x384 | 1.00x | 68.09 | 0.39 | 24.01 | 75.20 | 24.48 | 16.70 | 1818.50 | 1/20 | 25.68 | 0 | yes |
| media-035 | Point.Break.1991.2160p.UHD.BluRay.DTS-HD.MA.5.1.DoVi.HDR.x265-PTer.mkv | 3840x1606 | 1264x528 | 9.24x | 1639.99 | 7.97 | 23.29 | 1669.30 | 28.65 | 34.30 | 3852.50 | 1/20 | 14.77 | 0 | yes |

## Before/After

The baseline is the full-resolution, zero-debounce Milestone 4 binary run captured on the same
machine. Decode cost remains separate from bridge cost.

| Target | Baseline bridge p95 ms | M4b bridge p95 ms | Baseline scrub settle ms | M4b scrub settle ms | Baseline playback fps | M4b playback fps |
|---|---:|---:|---:|---:|---:|---:|
| media-005 | 55.77 | 40.23 | 3386.30 | 2296.10 | 18.31 | 23.03 |
| media-017 | 16.47 | 24.48 | 1783.50 | 1818.50 | 24.63 | 25.68 |
| media-035 | 133.29 | 28.65 | 9861.20 | 3852.50 | 6.33 | 14.77 |

## Interpretation

The bridge gate uses a 100 ms p95 ceiling for delivery and draw overhead. Exceeding native decode
targets alone does not trigger shared memory because shared memory cannot accelerate decoding. The
benchmark uses one persistent LibVLC playback process and one persistent BestSource exact-frame
process; only the engine supplying the current viewport actively decodes frames.

The scrub scheduler waits 100 ms for a quiet point before beginning native work.
It still cannot cancel a BestSource landing already executing. Measured settlement ranged from
1818.50 ms to 3852.50 ms.

Viewport-sized previews remove bridge transport as the reason to enter the native-window gate.
Source decode latency remains visible and is not repaired by smaller preview payloads.
