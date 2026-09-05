# Phase 3C: Review Preparation Acceleration

## Decision

Subsequent integration decision, agreed 2026-08-31: QSV is excluded from the first-stage control,
including disabled code paths and accelerated packages. The results and selection policy below
describe the historical Phase 3C experiment, not current authorization to integrate acceleration.
See the [hardware decision](frame-scrub-supporting-player-control-integration-handoof.md#hardware-acceleration-bottom-line).

Phase 3C passed its bounded experimental gate with a deliberately narrow selection policy:

- keep the pinned software FFmpeg recipe as the default, correctness oracle, and automatic fallback;
- use Intel QSV only to decode and scale large HEVC sources in the measured class;
- keep MPEG-4 Part 2 GOP-1 encoding and stereo AAC in software so Phase 3B's accepted proxy contract does not change;
- keep BestSource indexing on its current software stack;
- do not adopt `node-av` or FFmpegKitNext for this path.

The cold transition from original playback to the completed review proxy remains informational. It
is not a blocker or an adoption gate.

## Fixed Output Contract

All candidates produced or were required to produce the selected Phase 3B artifact:

- Matroska;
- MPEG-4 Part 2 video, GOP 1, no B-frames;
- no more than 960 pixels wide, `yuv420p`;
- source-relative monotonic presentation times;
- one selected stereo AAC track at 48 kHz;
- one proxy frame for every canonical source-frame ordinal.

Hardware H.264 or HEVC encoding was not tested because it would change the accepted artifact and
reopen the exact source-frame map.

## Direct FFmpeg Gate

The selected package is FFmpeg 9 built in an isolated vcpkg root with `libvpl`, QSV, D3D11VA, and
DXVA2. The runtime directory is 29.22 MiB; the complete installed target tree is 59.00 MiB. The
bootstrap also packages the MinGW runtime DLLs from the compiler sysroot used for the build.

| Source class | Bounded input | Software | QSV decode/scale | Speedup | Quality | Result |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Common H.264, 1080p (`media-005`) | 10 s / 351 frames | 754.5 ms | 932.6 ms | 0.809x | 41.55 dB PSNR, 0.9874 SSIM | Reject QSV |
| Difficult HEVC Main 10, 3840x1606 (`media-035`) | 60 s / 1,552 frames | 11,567.7 ms | 6,751.6 ms | 1.713x | 51.54 dB PSNR, 0.9967 SSIM | Accept QSV |

Both HEVC outputs preserved the selected codec/audio contract, frame count, BestSource index count,
and monotonic frame order. Across all 1,552 frames, 904 relative timestamps were identical and 648
differed by exactly one Matroska timestamp tick (1 ms). The difference never exceeded 1 ms and did
not accumulate. Strict equality remains visible in the raw result, while the gate accepts one
container tick because canonical identity is the complete ordinal map, not the proxy timestamp.

Exact decoded-pixel hashes differed, as expected between hardware and software decoding. The gate
therefore also measures decoded visual similarity and requires at least 40 dB PSNR and 0.99 SSIM.
The selected HEVC lane passed both thresholds. The H.264 lane was slower and missed the SSIM gate,
independently confirming that it should stay on software.

## Backend Boundary And Fallback

Proxy encoding now sits behind a platform-neutral backend contract. Cache publication, BestSource
indexing, the complete ordinal map, and validation remain host-owned. A policy selector routes only
measured large HEVC sources to QSV. Unsupported sources go directly to software and are not reported
as failures. Any selected-QSV initialization, process, output, or frame-count failure removes the
partial output and retries through the software backend.

Electron enables the policy backend only on Windows and only when the isolated accelerated binary
exists. Otherwise it constructs the unchanged software service. This keeps hardware availability
optional and keeps OS-specific details out of clip marking, extraction, and pipeline code.

## Packaging And Licensing

The measured accelerated runtime directory is 29.22 MiB, compared with 25.98 MiB for the existing
software runtime. Local vcpkg metadata identifies FFmpeg under LGPL 2.1-or-later for this build,
libvpl under MIT, and dav1d under BSD-2-Clause. The packaged GCC/MinGW runtime files retain their
upstream runtime-license obligations and must be included in a production third-party-notices pass.

The `node-av` probe reported an FFmpeg build configured with both GPL and nonfree components. Even
apart from its size and pipeline failures, its exact bundled codec configuration would therefore
need a separate redistribution review; adopting the JavaScript wrapper's MIT license alone would
not settle the licenses of its native payload.

## Wrapper Adoption Gates

### node-av 6.1.1

`node-av` successfully detected the Intel UHD 630 through D3D11VA and ships FFmpeg 8.1 with broad
hardware support. It did not pass the selected-artifact gate:

- its installed `node_modules` tree is 412.87 MiB;
- the high-level pipeline failed while initializing its filter source with `Invalid time base 0/1`;
- the custom frame loop failed with repeated MPEG-4 PTS and encoder errors;
- the software custom loop did not complete the bounded probe within 60 seconds.

These are potentially solvable wrapper-integration problems, but direct FFmpeg already expresses the
same hardware pipeline with less code, a much smaller runtime, and a working fallback. `node-av`
therefore adds risk without a measured preparation benefit in this phase.

Source: <https://github.com/seydx/node-av>

### FFmpegKitNext

The original ffmpeg-kit project is retired. Its maintained successor is source-build oriented and
offers a Windows C/C++ API, but no Node/Electron API or automatic hardware-selection layer. Adopting
it would require another custom native bridge around the same FFmpeg operations already proven by
the direct child-process lane. The stop rule therefore rejects implementation.

Source: <https://github.com/arthenica/ffmpeg-kit-next>

## BestSource Hardware Indexing

BestSource was tested separately with distinct software and hardware index paths. The canonical
pinned FFmpeg libraries do not expose a D3D11VA decoder to BestSource:

| Source | Software index | Hardware request | Result |
| --- | ---: | --- | --- |
| `media-005` H.264 | 739.2 ms | `d3d11va` | `Decoder h264 does not support device type d3d11va` |
| `media-035` HEVC | 4,592.5 ms | `d3d11va` | `Decoder hevc does not support device type d3d11va` |

No hardware index was produced, so there was no identity comparison to accept. Rebuilding the
canonical BestSource stack around a different FFmpeg configuration would expand risk without being
required for the proxy-preparation speedup. BestSource remains software-canonical.

## Reproduction And Evidence

Run from `spikes/native-frame-identity-playback`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-accelerated-ffmpeg.ps1
npm run gate:preparation-acceleration -- --duration 60 --targets media-035
npm run build:bestsource-gate
npm run gate:bestsource:hardware -- --duration 10
```

The preparation gate defaults to the bootstrapped accelerated executable. `PHASE3C_FFMPEG` is an
optional diagnostic override for comparing another FFmpeg build.

Retained raw evidence:

- `artifacts/preparation-acceleration-60s-media-035-raw.json`
- `artifacts/preparation-acceleration-10s-media-005-raw.json`
- `artifacts/bestsource-hardware-raw.json`
- `artifacts/rejected-node-av-probe.log`
- `artifacts/rejected-node-av-pipeline-probe.log`
- `artifacts/rejected-node-av-transcode.log`

At MS7 closeout, the rejected `candidates/node-av` package, probe code and generated output were
removed. The three small logs above preserve the decision evidence; that dependency is not part
of the selected control or its setup. See [cleanup record](cleanup-results.md).

Compiler and FFmpeg process chatter is redirected to ignored logs under `artifacts/`; the retained
JSON and this report contain the bounded evidence needed to review the decision.
