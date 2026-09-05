# Video player component integration handoff

Verified against the isolated Windows x64 POC on 2026-08-30. The next task is to design and
integrate a reusable video player component. This document does not implement that feature or
claim that the production application already uses this player.

First-stage integration scope updated and agreed on 2026-08-31: software-only preparation;
QSV is excluded entirely, not included behind a disabled flag. The POC evidence remains historical.

Start with the repository's [agent architecture map](../../../docs/agent-docs/agent-architecture-map.md)
and [code design guidance](../../../coding-quality.md), then read [spike results](spike-results.md),
the [architecture diagram](architecture-diagram.md), and [architecture options](playback-architecture-options.md).
Use [stress results](bridge-results.md) for the final validation status, not an older pilot run.

## Selected implementation

Prepared-review C2 combines LibVLC playback/audio, canonical BestSource identity, and a cached
GOP1 review proxy for both visible playback and exact review. Native helpers deliver viewport-sized
RGBA through a binary process protocol and the isolated Electron main/preload boundary to Canvas 2D.
Shared memory, a native rendering window, `node-av`, and browser-only decoding are not selected.

Paths below are relative to `spikes/native-frame-identity-playback/`:

| Responsibility | Reference implementation |
| --- | --- |
| Player UI, keyboard, busy/ready state, canvas | `src/ui/control-app.ts`, `src/ui/keyboard-controller.ts`, `electron/control.html`, `electron/control.css` |
| Range draft/locking rules | `src/model/range-capture-model.ts`, `src/model/captured-frame-range.ts` |
| Renderer-safe API and trusted composition | `src/ui/control-api.ts`, `electron/control-preload.cjs`, `electron/main.cjs` |
| Playback/exact mode handoff | `src/adapter/hybrid-frame-playback-adapter.ts` |
| Backend operations and scheduling | `src/adapter/libvlc-playback-adapter.ts`, `src/adapter/bestsource-frame-playback-adapter.ts`, `src/adapter/adjacent-step-scheduler.ts`, `src/adapter/progressive-frame-mailbox.ts` |
| Identity, payload, process lifetime | `src/model/source-frame-identity.ts`, `src/adapter/frame-playback-adapter.ts`, `src/adapter/native-process-client.ts`, `native/common/protocol.cpp` |
| Canonical preparation and cache policy | `src/preparation/interactive-preparation.mjs`, `src/preparation/preparation-coordinator.mjs`, `src/preparation/preparation-policy.mjs`, `src/preparation/preparation-cache.mjs` |
| Proxy recipe, map, audio, software encoding | `src/preparation/all-intra-proxy-preparation.mjs`, the software encoder in `src/preparation/review-proxy-encoder.mjs` |
| Experimental acceleration, excluded from first-stage integration | `src/preparation/proxy-acceleration-policy.mjs`, `src/preparation/ffmpeg-hardware-diagnostic.mjs` |
| Native services and adjacent access | `native/media-service/`, `native/bestsource-gate/prepared_video_session.cpp` |

The selected profile is `mpeg4-gop1-q5-960-source-clock-aac-v1`: MPEG-4 Part 2, GOP1, no B-frames,
quantizer 5, YUV420P, maximum width 960 without upscaling. Source-relative timing uses 60,000 ticks/s
with monotonic repair. When audio is present, the selected main track becomes 48 kHz stereo AAC
at 192 kbit/s. This is a review asset, not an export master.

Exact dependency versions, retrieval URLs and integrity records belong in
[dependency-manifest.json](../dependency-manifest.json) and [package-lock.json](../package-lock.json).
The native bootstrap scripts also contain required build adaptations; a source commit alone is
not the complete build recipe. The runtime roots in the existing POC are listed below; this is
not a list of dependencies to copy wholesale into the first-stage control:

- `.deps/libvlc/`, including its `plugins/` tree and notices; `VLC_PLUGIN_PATH` points here.
- `.deps/bestsource-install/` and `.deps/vcpkg-installed/x64-mingw-release/` for BestSource and
  its software FFmpeg libraries/tools.
- `.deps/phase3c-vcpkg-installed/x64-mingw-release/` belongs to the experimental QSV path.
  Preserve it for POC reproduction, but do not package it with the first-stage control.
- `build/windows-x64/`, `build/bestsource-gate/`, and `build/bridge-js/` for generated helpers
  and TypeScript output. `electron/main.cjs` is the current path/environment composition point.

## Hardware acceleration bottom line

**First-stage decision, agreed 2026-08-31: software-only preparation.** Use direct software FFmpeg
for proxy generation and the pinned software BestSource stack for indexing. Do not bring QSV code,
hardware capability checks, acceleration selection/fallback wrappers, accelerated runtime packages,
or a disabled hardware feature flag into the first-stage control. Retain the `ProxyCreator` boundary
so a separately qualified implementation could be introduced later; do not implement it in advance.

QSV remains a promising experiment, not an integration dependency. On the measured 60-second 4K
HEVC Main 10 sample, QSV decode/scale reduced proxy generation from 11.57 seconds to 6.75 seconds
(`1.713x`), with GOP1 video and AAC audio still encoded in software. It was slower on the common
1080p H.264 sample (`0.809x`) and missed that lane's similarity threshold. Those bounded Windows
results do not qualify automatic selection across full movies, machines, or driver configurations.
Fallback handles failures, not successful-but-slower output or subtle timing/visual regressions.

Before any later adoption, run a separate qualification spike covering representative full movies,
repeated end-to-end timings, canonical frame correspondence, picture/audio timing, hardware/driver
variation, and failure/cancellation behavior. Preserve existing Phase 3C code and measurements in
the isolated spike for that work; do not port its selector or bootstrap into the integrated control.

BestSource canonical indexing remains on the pinned software stack. Its separate D3D11VA requests
were rejected by the linked decoder configuration before indexing, so this POC measured no hardware
index speedup or identity equivalence. That is an unproved future optimization, not evidence that
BestSource can never use hardware decoding. Direct FFmpeg remains the selected integration path;
`node-av` and FFmpegKitNext are not adopted.
See the complete [preparation acceleration results](preparation-acceleration-results.md).

## Proposed backend design

The POC proves a stack and data flow; it does not yet provide the reusable backend class boundaries.
Use the companion [backend design](backend-design.md) for the proposed interfaces, ownership,
component diagram, preparation/cache lifecycle, call-site examples, and migration from current files.
These are design proposals for the next component spec, not implemented classes or a new engine choice.

| Boundary | Intended responsibility |
| --- | --- |
| `ReviewPreparationService` | Coordinate preparation and expose progress; return a validated, pinned prepared review. |
| `FrameIndexer` / `BestSourceFrameIndexer` | Build a complete index of a specified asset/track, independent of cache and playback policy. |
| `FrameIndexCache` | Reuse compatible persistent indexes or invoke the indexer; used for both canonical and proxy indexes. |
| `ProxyCreator` / `FfmpegProxyCreator` | Encode review video/audio with the selected software profile only; do not also index or publish readiness. |
| `SourceInspector`, `SourceNormalizer`, `FrameMapValidator` | Source freshness, conditional timestamp repair, and validated canonical/proxy correspondence. |
| `PreparedReviewCache` | Own media, manifests, index artifacts, maps, atomic publication, pins and eviction. `FrameIndexCache` collaborates with this one physical store. |
| `FrameReader` / `BestSourceFrameReader` | Read exact pictures from prepared indexes; own per-open decoder state and bounded decoded-picture caches. |
| `PlaybackEngine` / `LibVlcPlaybackEngine`, `ReviewSession` | Ordinary playback/audio and the lifetime/mode transitions of one open movie. |

Persistent frame indexes are not the in-memory decoded-picture cache. Indexing is a preparation
operation; interactive reading must not silently trigger another full index build. Keep the backend
isolated from pipeline/application dependencies and expose it through an injected renderer-safe adapter.
The companion design also separates exact displayed-frame capture from approximate playback position;
the live q/w correctness gap below remains work to prove, not an accepted product limitation.

## Contracts to preserve

1. **Readiness:** ordinary playback may start before preparation. Exact stepping, exact scrubbing,
   and q/w/a capture require both canonical preparation and proxy validation. Opening primes a
   muted frame and remains paused; later playback has audio. Surface progress/failure explicitly.
2. **Two indexes:** healthy sources use the original input for canonical indexing. Selected broken
   timestamp cases use a stream-copy normalized asset. The proxy always has its own BestSource
   index. Require canonical count = encoded count = proxy indexed count before activation.
3. **Identity vs clock:** `SourceFrameIdentity` carries ordinals, integer PTS/duration, rational
   timebase, and canonical hash. Big integers cross JSON as decimal strings. Canonical PTS on a
   normalized asset is not necessarily original-container PTS. `DisplayFrame.reviewTimeUs` belongs
   to the proxy; use it when resuming LibVLC. Never derive canonical ordinals from nominal FPS.
4. **Range ownership:** q/w replace draft endpoints; a validates/locks, then toggles unlock until
   the next q/w archives the locked range and starts another draft. A range may have equal start
   and end ordinals. `exportableRanges()` includes the final locked draft. The POC clears ranges
   on source open; persistence must bind them to the source and validated preparation identity.
5. **Bounded delivery:** progressive scrubbing keeps one native request executing and one newest
   pending request; it can display completed intermediate pictures. It does not cancel executing
   decode work. Preserve source-generation invalidation and final-target settlement. Held adjacent
   steps have their own scheduler and must not be collapsed like scrub targets.
6. **Process/render boundary:** retain validated framing, dimensions/stride, bounded payloads,
   helper timeouts/shutdown, and playback acknowledgements. The renderer has no Node integration;
   context isolation and sandboxing remain enabled. Audio comes from LibVLC, not RGBA messages.
7. **Preparation/cache:** use atomic publication and cancellation cleanup. Source signatures are
   sampled compressed-packet checks, not exhaustive content hashes. Keep dependencies, indexing
   options, and the proxy recipe in cache identity. Source/proxy media and both indexes must agree.
8. **Native regression:** do not restore forced linear forward decoding after a delivered-frame
   cache jump. `PreparedVideoSession` lets BestSource choose its normal access path; the final
   soak includes forward/reverse steps after distant seeks to protect this behavior.

Historical evidence caveat: eight old initial one-frame preparation probes recorded false identity
flags without retaining the reason. Later cache-reopen/random probes and current control checks
pass; the old flags remain unresolved, not relabeled. See [final results](spike-results.md). A
product integration must independently exercise cold-open frame identity, not infer it from an
aggregate historical gate label.

## Run and reproduce

Run commands in PowerShell from the spike root. A prepared checkout can launch with
`npm run control:start`; this rebuilds the selected helpers and bridge before opening Electron.
Use Space to play/pause, Left/Right to step, hold arrows for paced stepping, and q/w/a to mark/lock.
The timeline scrubs the full player; release resolves the final frame and resumes playback.

For a new checkout, follow the full [README](../README.md). Required host tools include Node 22+,
npm, Git, Python available as `python`, CMake 3.25+, Visual Studio C++ x64 tools, and the Cygwin MinGW environment
under `C:\cygwin64`. The fixture generator separately needs a working FFmpeg/FFprobe pair on PATH
with libx264, FFV1 and MPEG-2 encoders. The runtime's minimal FFmpeg 9 build is not a substitute
for that fixture tool. Dependency bootstrap/build may take much longer than five minutes.

```powershell
npm ci
npm run preflight
./scripts/bootstrap-native.ps1 -InstallMissing
npm run verify:libvlc-api
npm run bootstrap:bestsource
npm run control:build
npm run fixtures:generate
npm run fixtures:verify
npm run typecheck
npm test
npm run native:test
npm run control:smoke
```

For experimental POC reproduction only, accelerated preparation uses
`./scripts/bootstrap-accelerated-ffmpeg.ps1` after the software bootstrap. The existing POC still
contains its conditional QSV selector; do not copy that wiring/bootstrap into the first-stage
control. Do not rebuild native libraries during a media measurement. After dependencies are ready,
exercise the real player and the expensive gate serially:

```powershell
node ./scripts/run-control-smoke.mjs --target fixture-vfr-ffv1
node ./scripts/run-control-smoke.mjs --target media-035
./scripts/run-soak.ps1 -Target media-035 -Seconds 600
npm run verify:reports
```

The real-movie IDs require the external corpus and target paths in the ignored preparation evidence;
fixtures do not provide that full-movie evidence. Follow README's inventory/preparation gates to
regenerate it on another machine. Default interactive file selection works without historical logs.
`node ./scripts/verify-reports.mjs --archived` checks retained summaries only; it is not a fresh playback test.
Generated assets live under `.deps/`, `build/`, `fixtures/`, and `artifacts/`; preserve final evidence
and active caches during routine cleanup. Use the final README cleanup policy, not guessed paths.

## Accepted limits and next task

Cold canonical indexing and proxy preparation are separate, potentially multi-minute costs. Proxy
scrubbing was measured around 7.5-7.9 displayed frames/s on selected journeys, not video-rate scrub.
User picture/audio acceptance is recorded in [hands-on evidence](review-proxy-hands-on-result.json).
The cold original-to-proxy transition was not observed in that acceptance and remains non-blocking.
Consult the final stress report for sustained performance; do not treat a short pilot as a soak pass.

**Unresolved correctness requirement, not an accepted limitation:** while playing, q/w resolves a
sampled playback clock to canonical identity; the POC does not prove atomic identity of the canvas
picture visible at the exact instant of the key event. Paused exact review captures the displayed
canonical frame, but live capture still needs the [presentation/identity contract](backend-design.md#exact-capture-is-a-separate-correctness-contract)
and a passing visible-picture test. Preparation readiness alone does not close this gap.

Proxy mapping checks complete counts plus bounded picture/timing evidence, not exhaustive lossy
pixel equivalence for all real movies.
HDR, interlacing, rotation, source-track selection, and original-quality output need product policy.

Only Windows x64 is measured. macOS/Linux, arm64, installers, signing/notarization, security upgrades,
and clean-machine deployment require separate validation. Follow the
[packaging assessment](cross-platform-packaging.md) for release responsibilities and license review.
Shared-pass preparation and BestSource hardware indexing remain unproved future optimizations.

For the future integration agent:

1. Start from the [proposed backend design](backend-design.md) and refine its contracts in the
   component spec. Design a reusable, class-backed UI control with injected renderer-safe services,
   integrated through the app's `src/ui/` boundary while preserving the component's own folder.
   Keep application workflow in `src/app/`, domain range rules separate from DOM code, and native
   process/filesystem behavior behind Electron adapters. The spike's large `electron/main.cjs`
   is reference wiring, not a production component boundary to copy wholesale.
2. Keep the existing app controller as composition root. The current product is framework-free;
   introduce neither a framework nor new pipeline ownership through this integration.
3. Define session persistence, source association, cancellation/retry, cache invalidation/eviction,
   lifecycle disposal, and visible error recovery. Preserve range identities across reopening only
   after source validation. Follow the repo's spec/plan sign-off flow for the new product feature.
4. Actual clip extraction is new work. Use original source media/audio and validated canonical
   ordinals, not the lossy proxy or blindly copied repaired PTS. Define inclusive/exclusive endpoint
   semantics, VFR/timestamp-repair handling, audio boundaries, and original-picture validation.
5. Use the existing `ClipEditor -> ElectronVideoEditService -> preload -> video-edit-runtime`
   trust-boundary pattern when designing extraction; its current edit API does not already implement
   canonical-range export. For created clips, inspect `PipelineSession.insertCreatedClipInPipeline`,
   `insertCreatedClipAfter`, and `Pipeline.upsertVideoClip`; leave durable pipeline state there.
6. Before calling integration complete, verify real audible playback, visible exact steps/scrub,
   five points and two ranges before/after reopen, resource stability, and error/cancel paths in the
   actual app. When extraction is added, verify original-source first/last pictures and audio too.
   Re-run affected gates after any Electron, native dependency, transport, or proxy-profile change.

This handoff follows `coding-quality.md` and the `doc-update` boundary: it describes reusable spike
evidence and proposed integration work without changing the production architecture axioms.
