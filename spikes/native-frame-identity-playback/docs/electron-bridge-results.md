# Electron Frame-Bridge Results

## Result

**BINARY 4K FAIL; SHARED-RING IPC BLOCKED**

- Measured transport: binary
- Preview policy: source resolution
- Scrub debounce: 0 ms
- Ordinary length-prefixed binary stdio plus Electron structured-clone transfer: insufficient
- Viewport-sized 4K bridge gate: fail (133.29 ms p95)
- Shared-memory ring-buffer experiment: previously attempted; blocked by Electron 37 IPC
- Latest-wins scrub queue bounded to one in-flight plus one pending: yes
- Newest scrub request was the only delivered result: yes
- Renderer pixel checks passed: yes
- Worst measured p95 bridge-copy/upload overhead: 133.29 ms

Bridge overhead is native-to-main pipe transfer plus main serialization, main-to-renderer transfer,
and Canvas 2D upload/draw. Decode time is reported separately so known codec/GOP costs do not get
misattributed to Electron IPC.

| Target | Source | Source frame | Preview frame | Payload reduction | Exact decode p95 ms | Conversion p95 ms | Exact bridge p95 ms | Exact total p95 ms | Adjacent bridge p95 ms | Adjacent total p95 ms | Scrub settle ms | Scrub delivered | Playback visible fps | Native drops | Pixels |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| media-005 | tuntematon_sotilas-finnish.mp4 | 1920x1080 | 1920x1080 | 1.00x | 271.39 | 3.57 | 52.43 | 315.60 | 55.77 | 50.30 | 3386.30 | 1/20 | 18.31 | 6 | yes |
| media-017 | Dizengoff.99.1979.DVDRip-IL.XviD-DownRev.avi | 720x384 | 720x384 | 1.00x | 66.14 | 0.38 | 19.54 | 73.00 | 16.45 | 16.70 | 1783.50 | 1/20 | 24.63 | 0 | yes |
| media-035 | Point.Break.1991.2160p.UHD.BluRay.DTS-HD.MA.5.1.DoVi.HDR.x265-PTer.mkv | 3840x1606 | 3840x1606 | 1.00x | 1665.87 | 30.56 | 145.32 | 1820.30 | 123.22 | 135.80 | 9861.20 | 1/20 | 6.33 | 56 | yes |



## Interpretation

The bridge gate uses a 100 ms p95 ceiling for delivery and draw overhead. Exceeding native decode
targets alone does not trigger shared memory because shared memory cannot accelerate decoding. The
benchmark uses one persistent LibVLC playback process and one persistent BestSource exact-frame
process; only the engine supplying the current viewport actively decodes frames.

The scrub scheduler waits 0 ms for a quiet point before beginning native work.
It still cannot cancel a BestSource landing already executing. Measured settlement ranged from
1783.50 ms to 9861.20 ms.

When the binary path fails, see [Electron Shared-Ring Experiment](electron-shared-ring-results.md)
for the bounded follow-up and the native-window decision gate.
