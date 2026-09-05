# Prove a Native Exact-Frame Playback Path

## Why this matters

The movie-to-pipeline workflow must let a user play a full movie normally, pause, move to exact
source frames, scrub, and save ranges that reopen on the same pictures later. The previous
WebCodecs/Mediabunny spike did not cover enough of the user's media. This spike must therefore prove
an exact native frame backend before spending time on Electron integration.

The governing spec is
[`docs/specs/native-frame-identity-playback-spike-spec.md`](../specs/native-frame-identity-playback-spike-spec.md).
The implementation is a new isolated experiment under `spikes/native-frame-identity-playback/`.
It must not modify the production pipeline application or quietly reuse the old side-by-side
comparison UI.

The spike has four hard decision gates:

1. LibVLC 4 either proves both relative stepping and absolute frame identity, or it does not.
2. If LibVLC fails that exact-frame gate, BestSource must independently prove exact random frame
   access before any fuller Electron control is built.
3. Because BestSource failed the original immediate-readiness performance gate but passed identity,
   a prepared-review amendment may proceed only through Milestone 3b. Electron work remains blocked
   until that milestone proves visible preparation, one canonical index, cache reuse, and optimized
   adjacent stepping and the user reviews its evidence.
4. The unified review proxy must first pass a software-only correctness, timing, audio, and UX gate.
   Preparation acceleration is evaluated separately and may not change the selected proxy contract.

"Absolute frame identity" means a stable presentation-order frame index carried together with its
integer PTS, rational timebase, and duration or next PTS. A rounded time or `time * fps` is not an
identity.

## Progress

- [x] (2026-08-12 11:42+03:00) Revised feature spec signed off with absolute identity mandatory,
  sequential LibVLC and BestSource gates, and a single-candidate Electron UI.
- [x] (2026-08-12 12:34+03:00) Created the isolated spike skeleton, pinned dependency manifest,
  executable preflight/bootstrap, exact VLC source-header pin, and runtime API probe. The probe
  compiled under the installed Hostx64 MSVC toolchain and confirmed the required symbols in the
  SHA-512-verified `baad2c52` nightly DLL.
- [x] (2026-08-12 13:40+03:00) Built six valid deterministic fixtures plus one malformed fixture,
  verified their presentation-order oracles independently with FFmpeg, and reduced 2,510 playable
  files under `D:\tmp\media` to 63 material signatures. Seventy-two files failed FFprobe and one
  audio-only source with attached cover art was explicitly excluded.
- [x] (2026-08-12 13:43+03:00) Ran the pinned LibVLC 4 native engine gate. All six fixtures passed
  relative stepping, only two passed the complete seek/step script, all 63 real representatives
  displayed a first frame, and the public API did not expose canonical frame identity. C1 failed;
  C2 is provisional pending the separately gated BestSource milestone.
- [x] (2026-08-12 19:42+03:00) Implemented and ran the BestSource exact-frame gate. All six coded
  fixtures and all failure-path checks passed. The historical run reported 59/63, one 4K HEVC source
  produced no index within 30 minutes, and six supported representatives missed the 750 ms warm
  exact-access p95 target. C2 failed; execution stops before Milestone 4.
- [x] (2026-08-13 12:19+03:00) Corrected product media scope by excluding all files below
  `D:\tmp\media\watch\rame` and `D:\tmp\media\family movies`, and fixed insignificant rational-rate
  rounding in media signatures. The current matrix has 45 signatures: 40 retain historical
  representatives (39 pass, one fails), while five replacements remain untested.
- [x] (2026-08-13 14:02+03:00) Corrected the historical BestSource crash diagnosis. Both exact-commit
  upstream Windows artifacts opened `The Silence`; WinDbg located the overwrite in the harness's
  tightly packed RGBA conversion buffer. A stride-aware FFmpeg allocation now passes first, middle,
  and final access under guarded heap. The three historical crash rows no longer count as BestSource
  failures, but the indexing and warm-access failures still keep C2 below the signed gate.
- [x] (2026-08-13 16:45+03:00) Regenerated the current 45-signature matrix and reran it with clean
  indexes and then warm indexes, one media process at a time. Both runs passed exact identity and
  stability for 45/45 representatives with no crash. Seven sources failed the 750 ms warm-access
  target and two 4K sources failed the ten-minute initial-index target. Internal phase probes pinned
  five warm failures to linear decoding caused by unusable keyframe PTS, one to 4K HEVC
  decode-forward, and one to repeated BestSource seek-location retries plus decode-forward.
- [x] (2026-08-15 00:59+03:00) Completed a five-source remediation matrix for every zero-usable-PTS
  outlier. Timestamp-normalized stream-copy preserved exact source frame identity and reached the
  warm target on 5/5 in 1.80-3.64 seconds rewrite plus 9.00-89.44 seconds indexing. All-intra proxy
  preparation passed 5/5 in 57.94-172.27 seconds including indexing. Unconditional MPEG-4 unpacking
  is rejected because two sources changed canonical frame count. The signed Milestone 3 gate remains
  failed, but a visible background-preparation variant is now evidence-backed for a revised spec.
- [x] (2026-08-15 17:42+03:00) Implemented and ran Milestone 3b's prepared-review gate. Packet
  policy classified 39/45 representatives as direct-source and six as timestamp-normalized. The
  16-target cold, cache-reopen, cancellation, complete-map, and paced held-step gates passed. The
  spike stops here for user evidence review before Milestone 4.
- [x] (2026-08-15 18:31+03:00) Replaced full-packet cache validation with the accepted deterministic
  3+3+3x1-minute sampled-packet signature. The selected profile was 17.4-42.8 times faster on
  full-length sources, with 0.30-2.07 second common-case validation and a 6.32 second 4K outlier.
- [x] (2026-08-15 19:38+03:00) Completed Milestone 4's versioned native protocol, C2 adapters,
  process supervision, bounded scrub/playback queues, Electron bridge benchmark, and renderer pixel
  verification. Binary transport passed 720p/1080p but missed the 4K p95 bridge target. The bounded
  shared-ring experiment is blocked because Electron 37 cannot clone `SharedArrayBuffer` between
  main and the sandboxed renderer. Stop here before Milestone 5 for evidence review.
- [x] (2026-08-26 14:52+03:00) Completed approved Milestone 4b. Both native engines now fit
  oversized RGBA previews to the renderer viewport without upscaling, and exact scrubbing waits
  100 ms for a quiet position. The warmed binary comparison passed all three representatives. The
  4K payload fell 9.24 times, bridge p95 fell from 133.29 to 28.65 ms, callback playback rose from
  6.33 to 14.77 fps, and the scrub burst fell from 9.86 to 3.85 seconds.
- [x] (2026-08-26 15:51+03:00) Completed Milestone 5's secure single-control C2 Electron host,
  visible preparation, ordinary LibVLC playback, BestSource exact review, bounded held stepping,
  exact scrubbing, speed control, and q/w/a range capture. CFR/VFR handoff integration passed, and
  Electron smoke journeys passed the VFR fixture, ordinary 1080p full movie, and difficult 4K HEVC
  movie. Stop here for user hands-on review before Milestone 6.
- [x] (2026-08-26 16:50+03:00) Corrected Milestone 5 hands-on defects. LibVLC now primes a muted
  first-frame preview and can seek before an explicit play; initialization frames cannot leak before
  the requested landing. Timeline polling no longer overrides a dragged or exact-frame position,
  release performs one seek and starts playback behind a processing overlay, Space pauses while the
  range input has focus, one arrow tap advances exactly one frame, and transport uses one play/pause
  button. The 98-test suite and CFR/VFR/1080p/4K Electron journeys pass.
- [x] (2026-08-26 17:35+03:00) Slowed held single-frame navigation to a watchable cadence. A tap
  remains immediate, repetition begins after 250 ms, and every later frame remains visible for at
  least 300 ms. Removed the `+10` selector while generalizing the validated adapter count to 1-1000,
  so a future data-configured button may choose any bounded jump value.
- [x] (2026-08-26 22:43+03:00) Added the first seeker-thumbnail implementation. Dragging uses a
  dedicated latest-wins BestSource worker opened on the existing prepared asset and index at
  240x135 bounds, so it cannot move the canonical exact-frame cursor, pause LibVLC, replace the
  main display, or block the release seek. CFR, ordinary 1080p, and difficult 4K Electron journeys
  passed; first-thumbnail latency was 162 ms, 337 ms, and 1.25 seconds respectively.
- [x] (2026-08-28 09:23+03:00) Increased held adjacent stepping from a 300 ms to a 150 ms repeat
  interval after the existing 250 ms hold threshold. A tap remains exactly one frame, native work
  remains serialized, and the cadence is capped near 6.7 visible frames per second when decoding
  keeps up.
- [x] (2026-08-28 10:31+03:00) Replaced the rejected seeker-thumbnail experiment with a cached
  960-pixel all-intra display proxy, a second BestSource index, and a validated ordinal map to the
  canonical source index. Dragging now renders progressive proxy pictures in the full player while
  release resolves the canonical frame before source playback resumes. CFR/VFR coded-picture
  oracles prove proxy pixels and canonical identity stay aligned; representative movie performance
  and hands-on enlarged-image quality remain the evidence gates.
- [x] (2026-08-28 15:08+03:00) Completed the representative full-player proxy measurements. The
  legacy, high-demand 1080p, and difficult 4K sources retained every canonical ordinal and displayed
  all 12 drag positions at 7.45-7.57 frames per second. Cold encode plus proxy indexing took 2m 1s,
  8m 36s, and 25m 44s, so cached dragging passes its automated gate while preparation policy and
  enlarged-image/HDR quality remain explicit product decisions. The full suite passes 104 tests.
- [x] (2026-08-28) Split the previously mixed review-proxy work into Milestone 5b, which selects and
  proves the software review-proxy contract, and Milestone 5c, which later compares `node-av`,
  `ffmpeg-kit`, direct FFmpeg hardware processing, and separate BestSource hardware indexing.
- [x] (2026-08-29 08:10+03:00) Implemented and measured Milestone 5b's timing-preserving unified
  review proxy. All 27 fixture/representative profile rows preserved the declared frame map, audio,
  and relative-time contract. GOP 1 was fastest to encode on all three real-media samples and was
  selected. The full 4K Electron journey reopened 175,400 mapped frames, used the selected stereo
  source program, displayed 12/12 rapid drag positions at 7.94 fps, and passed exact stepping and
  canonical range capture. Perceived audio, enlarged-image, and handoff quality remain the user's
  hands-on gate.
- [x] (2026-08-29 08:37+03:00) The user completed the selected difficult-4K hands-on review and
  reported that the image looked really good and the sound was great. Enlarged proxy quality and
  preview audio therefore pass. The cached review did not exercise the cold original-to-proxy visual
  transition, which remains a narrow residual UX check rather than a proxy-contract blocker.
- [x] (2026-08-29 19:46+03:00) Completed Milestone 5c. A platform-neutral encoder boundary now
  retains software FFmpeg as oracle/fallback and conditionally selects QSV for measured large HEVC
  sources. The pinned 60-second 4K gate passed at 1.71x speedup; common H.264 remained on software.
  BestSource hardware indexing, `node-av`, and FFmpegKitNext were rejected by their stop rules.
- [x] (2026-08-30) Documented the optional
  [shared-pass preparation experiment](shared-pass-review-preparation-exec-plan.md) separately.
  The user accepts the current review experience; further preparation optimization is deferred,
  not a prerequisite for POC closeout. At this planning checkpoint Milestones 6 and 7 were still
  uncompleted, not implicitly waived; their subsequent completion is recorded below.
- [x] Implement the neutral native-process protocol and selected backend adapter.
- [x] Build the single-control Electron host and complete range-capture interactions.
- [x] (2026-08-30) Completed Milestone 6. The fixed Windows 4K proxy soak ran 600.195 seconds,
  199 mixed cycles and 796 held-step frames. Five canonical identities/canvas hashes and two ranges
  remained identical across reopen. Queues stayed bounded (2 progressive, 1 exact); no crash,
  stale overwrite or sustained memory-growth flag occurred. Corrected cached-jump forced-linear
  stepping; +1/-1 maximum latency is now below 53 ms in the full soak.
- [x] (2026-08-30) Completed Milestone 7. Published final results, architecture options/diagram,
  packaging costs, integration handoff, evidence snapshot, report verifier and cleanup record.
  Clean native rebuild, regenerated fixtures, six-fixture gate, 126 tests (0 skipped), typecheck,
  VFR/4K smoke and post-cleanup 4K smoke passed. Removed 10.98 GiB of obsolete listed artifacts;
  active runtimes/caches and verification harnesses remain. Product integration is not implemented.
- [x] Measure correctness, latency, resource use, source coverage, and mode handoff in the real app.
- [x] Publish the final recommendation and update the architecture reference.

## Current Status - 2026-08-30

The spec's **Phase 3B** and **Phase 3C** correspond to execution **Milestones 5b** and **5c**.
Both are complete. Milestones 0-5, including the accepted 3b prepared-review amendment and M4b
bridge remediation, are complete; this does not turn the original rejected C1/immediate-ready C2
gates into passes. The selected direction is prepared-review C2: LibVLC playback, BestSource exact
identity, and a mapped GOP-1 proxy used for both playback and responsive frame review.

**Milestones 6 and 7 are complete.** See the spike's
[final result](../../spikes/native-frame-identity-playback/docs/spike-results.md),
[stress/resource results](../../spikes/native-frame-identity-playback/docs/bridge-results.md),
[architecture diagram](../../spikes/native-frame-identity-playback/docs/architecture-diagram.md), and
[integration handoff](../../spikes/native-frame-identity-playback/docs/frame-scrub-supporting-player-control-integration-handoof.md).
`doc-update` concludes that no production architecture-map change is appropriate yet: this is an
accepted isolated POC, while the product's native component/integration has not been designed or
implemented. The handoff routes its next agent through the current canonical map first.

No new playback-engine search, shared-pass implementation, or native window is required by the
current evidence. The cold original-to-proxy visual transition is explicitly non-blocking. The
native-window gate is conditional, not a mandatory next phase. Product pipeline creation and exact
clip extraction remain outside this POC and need their own implementation scope.

Phase 3C evidence boundaries: hardware BestSource indexing never started with the current linked
libraries, so its potential speedup remains unmeasured. The node-av integration failed its timing
contract without an established root cause; this is not proof that node-av is inherently incapable
or slower. Neither unanswered question blocks closing the current accepted path.

## Skill Gates

Planning-time gates:

- `using-97`: establishes the repository's engineering-principle trigger map.
- `working-with-users-and-team`: governs the conversion of the signed product requirements into
  testable scope and explicit stop/go decisions.
- `api-and-interface-design`: applies to `SourceFrameIdentity`, the native process protocol, and the
  renderer-facing playback adapter.
- `domain-modeling`: applies because canonical source-frame identity and captured ranges need clear
  state ownership even though this remains a spike.
- `build-deploy-and-tooling`: applies to the native compiler setup, pinned binary/source
  dependencies, CMake/Meson configuration, and reproducible bootstrap scripts.
- `libvlc`: applies to all LibVLC 4 signatures, callbacks, lifecycle, threading, and deployment.
  Exact signatures must be verified against the pinned nightly's installed `vlc.h`, not copied from
  this plan or a secondary binding.
- `error-and-correctness-traps`: applies to asynchronous LibVLC callbacks, child processes, bounded
  frame queues, timeouts, rational timestamp arithmetic, and crash handling.
- `testing-discipline`: applies to deterministic media fixtures, operation scripts, expected frame
  identities, negative cases, and performance profiles.
- `security-and-trust-boundaries`: applies when exposing file selection and native commands through
  Electron preload and IPC.
- Repository `coding-quality.md`: governs responsibility boundaries and requires the renderer UI,
  application orchestration, native adapters, and frame-identity rules to remain separate.

Execution-time gates:

- Milestones 6/7 applied `testing-discipline`, `bugfix-by-failing-test`,
  `error-and-correctness-traps`, `observability`, `security-and-trust-boundaries`,
  `build-deploy-and-tooling`, `doc-update`, `pre-commit-self-review`, and `coding-quality.md`.
  Read-only diagnostic access stays behind native adapters; no production layer owns spike state.
  Work stayed on master as explicitly authorized. Routine builds/measurement and packaging review
  were delegated to `gpt-5.6-luna` at medium effort, with full chatter kept in ignored logs.

- `using-git-worktrees`: run before implementation starts. Detect whether the current checkout is
  already isolated; otherwise ask for worktree consent as that skill requires. Do not move, revert,
  or overwrite the user's current untracked spike files.
- `testing-discipline`: run before adding each fixture or automated test. Tests assert decoded
  picture identity and user-visible behavior, not internal call counts.
- `error-and-correctness-traps`: run before implementing process framing, callback synchronization,
  cancellation, request supersession, or performance queues.
- `build-deploy-and-tooling`: run before adding or changing bootstrap/build/package scripts or
  adopting a native dependency.
- `libvlc`: verify the exact pinned headers before compiling each LibVLC-facing unit.
- `doc-update`: run at the final milestone. Update `docs/agent-docs/` only if the spike changes a
  durable production architecture assumption; an isolated inconclusive experiment does not by
  itself justify an architecture-map edit.
- `pre-commit-self-review`: run before declaring the plan implemented or presenting final results.

Unavailable skills or fallbacks:

- None. All expected repository skills are available.

## Surprises & Discoveries

- (2026-08-30) MS6 caught a cached-frame jump followed by forced-linear forward decode, causing
  8.75-second taps and a failed held-step pilot. BestSource's default request path already reuses
  nearby decoders. Removing forced-linear mode preserves adjacent identity and reduced full-soak
  tap p95 below 27 ms. The failed pilots and fixed run are retained.
- (2026-08-30) A fixture-only rerun overwrote the old full-media report and required private media
  inventory. It now has a separate report, requires no inventory, and leaves the latest media
  coverage report intact. Direct Node commands avoid the local npm.ps1 forwarding trap.
- (2026-08-30) Eight historical preparation initial-probe flags are false without retained reasons.
  Later cache-reopen/random probes pass for all 16 targets. Final docs preserve those unresolved
  historical flags rather than upgrading the original observations to passes.

- Discovery: Visual Studio 2022 Professional is installed without its C++ workload, and unattended
  attempts to modify or install that workload were rejected at the UAC boundary (`5007` from the
  Visual Studio Installer and `1602` through winget). Visual Studio 2017 Build Tools does include
  the x64 C++ compiler and is sufficient for the LibVLC C-ABI gate in Milestones 0-2. A current
  compiler remains mandatory before the conditional BestSource build in Milestone 3.
  Evidence: `vswhere -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64`, installer logs,
  and direct discovery of MSVC 14.16 on 2026-08-12.
- Discovery: The first `cmake` and `ninja` commands on `PATH` are non-working Python launcher
  shims. A working CMake 3.29.3 is installed at `C:\Program Files\CMake\bin\cmake.exe`; tooling must
  validate command execution instead of equating command discovery with availability.
  Evidence: preflight execution on 2026-08-12.
- Discovery: The official LibVLC nightly runtime ZIP has DLLs and plug-ins but no SDK headers or
  import library. The harness therefore pins headers from the exact matching VLC source commit and
  resolves the runtime C symbols dynamically instead of manufacturing an import library.
  Evidence: SHA-512-verified runtime ZIP, exact source checkout, and `verify-libvlc-api.ps1`.
- Discovery: The first `next_frame()` call while playing is a pause-prime operation and reports
  `-EAGAIN`; it is not a guaranteed one-frame advance. Once primed, all six fixtures stepped forward
  and backward in the expected presentation order.
  Evidence: fixture callback traces in `artifacts/libvlc-gate-raw.json`.
- Discovery: Precise seek plus a materializing `next_frame()` passed the complete operation script
  on only two of six fixtures in the captured final run. The passing fixture set changed across
  repeated gate runs, and one repeated B-frame seek returned two different wrong pictures for the
  same requested target. That run-to-run and within-run variability is itself a determinism failure.
  Evidence: `spikes/native-frame-identity-playback/docs/libvlc-gate-results.md`.
- Discovery: CPU display callbacks provide pixels, while watch-time callbacks provide a separate
  microsecond player clock that can lag the displayed callback. Neither callback exposes source PTS,
  source timebase, duration, or a presentation-order frame index.
  Evidence: pinned public headers and per-operation callback traces.
- Discovery: Attached MJPEG cover art was initially classified as video. Excluding streams with the
  FFprobe `attached_pic` disposition reduced the real matrix from 73 misleading signatures to 63
  playable signatures; all 63 displayed a first frame.
  Evidence: media-signature tests, regenerated inventory, and final LibVLC report.

- Discovery: The old spike already lives under `spikes/frame-first-video-playback/`, includes two
  candidate controls, and is intentionally historical evidence rather than the base UI for this
  experiment.
  Evidence: `spikes/frame-first-video-playback/README.md`, `package.json`, and `src/candidates/`.
- Discovery: The current shell has Node, npm, CMake, Ninja, FFmpeg, and FFprobe. It does not have
  VLC, Meson, `cl`, or Clang on `PATH`. `vswhere` finds Visual Studio 2017 Build Tools, but the current
  BestSource instructions recommend a current Visual Studio toolchain.
  Evidence: `Get-Command` preflight and
  `C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe` on 2026-08-12.
- Discovery: A pin-able official VLC 4 Windows nightly is available for 2026-08-12 as commit
  `baad2c52`; its ZIP SHA-512 is
  `d600546eaa8f6b79efdf5d98a262945a2e751c738ae468b55a58e391da77ec22084b91aac64cc5eb123262725ca5c0a9fdf1657e072c1ba39614a8c6c47db340`.
  Evidence: `https://artifacts.videolan.org/vlc/nightly-win64/20260812-0429/` and its `SHA512SUM`.
- Discovery: LibVLC 4's texture-output callbacks run on VLC's rendering thread and require
  application synchronization. The callbacks are a rendering mechanism, not proof that an exact
  source-frame identifier is exposed.
  Evidence: official `libvlc_video_set_output_callbacks()` documentation.
- Discovery: BestSource commit `825af4e691524a3c98383d0cfe7d85b4142005cc` can be built as a
  standalone C++ library with `-Denable_plugin=false`. It requires FFmpeg libraries, libp2p, and
  xxHash; it does not require using VapourSynth or AviSynth in that mode.
  Evidence: the pinned repository's `meson.build` and `meson_options.txt`.
- Discovery: The available non-elevated path for Milestone 3 is a release-only dynamic MinGW build
  with GCC 11.4.0. Reproducible vcpkg FFmpeg 9.0 required a narrow NASM path-translation wrapper and
  a pinned Meson-tool fix for MSYS paths; x86 assembly and dav1d decoding are enabled in the final
  build.
  Evidence: `scripts/bootstrap-bestsource.ps1`, `dependency-manifest.json`, and the final native
  dependency inspection.
- Discovery: BestSource returned exact, persistent canonical identities on all six coded fixtures
  and all 45 current media representatives. The historical 59/63 run included three false crash
  failures caused by the harness's tightly packed RGBA output allocation. Both upstream Windows
  builds and the corrected MinGW harness open `The Silence`; the corrected clean and warm matrices
  complete without a crash. The current blockers are initial-index and warm-access performance.
  Evidence: `docs/bestsource-gate-results.md`, `docs/bestsource-failure-analysis.md`, and WinDbg.
- Discovery: `The Silence` contains two duplicate individual frame hashes but no duplicate ten-frame
  hash sequence, so BestSource's hash-based seek-location matching cannot remain ambiguous for ten
  frames on this source. A diagnostic mode now reports these counts and representative positions.
  Evidence: `bestsource_gate hash-diagnostics` over the complete 137,035-frame index.
- Discovery: Adding dav1d converted both AV1 representatives from decode failures to stable exact
  frame passes. In the corrected clean run, the 4K AV1 source indexed in 14.79 minutes and the 4K
  HEVC `Point Break` source indexed in 21.27 minutes. Seven representatives repeatedly missed the
  750 ms warm target, from 1.19 to 44.98 seconds.
  Evidence: the corrected clean and warm matrices and targeted internal BestSource timing probes.
- Discovery: A compressed-packet scan predicted all five sources whose BestSource keyframes lacked
  PTS in 0.86-2.11 seconds on warm filesystem cache. Timestamp-only stream-copy repaired all five
  without changing sampled decoded pixels or frame count. MPEG-4 unpacking reduced packed-source
  indexing cost but changed frame count by 74 and 28 on two sources. A DivX packed marker can remain
  after packets contain only one VOP, so marker-only evidence is not proof of current packing.
  Evidence: `docs/bestsource-remediation-results.md` and
  `artifacts/bestsource-remediation-raw.json`.
- Discovery: The tested all-intra review proxy preserved source frame count and sampled ordinals on
  5/5 when proxy timestamps were generated monotonically from decoded frame ordinal. Encode plus
  clean indexing took 57.94-172.27 seconds, warm exact p95 was 74.50-134.21 ms, and disk size was
  1.70-2.60 times source size.
  Evidence: `docs/bestsource-remediation-results.md`.
- Discovery: The first control integration accidentally passed source PTS into the proxy encoder.
  The H.264-in-AVI normalized review asset contains repeated PTS, so MPEG-4 rejected a frame with
  `Invalid pts (4) <= last (4)`. Restoring the already-proven monotonic ordinal clock fixed the full
  source: all 163,003 proxy/canonical ordinals matched, cold encode plus indexing took 2m 1s, and
  full-player dragging displayed all 12 requested positions at 7.57 frames per second.
  Evidence: `spikes/native-frame-identity-playback/docs/all-intra-proxy-results.md` and
  `artifacts/control-smoke-media-017.json`.
- Discovery: A 960-pixel all-intra proxy makes exact full-player dragging largely independent of the
  original codec once cached: the 1080p H.264, legacy repaired source, and 4K HEVC source all
  delivered 12/12 scripted positions at 7.45-7.57 visible frames per second. Cold preparation did
  not become codec-independent; the 4K HEVC/HDR source required 25m 44s versus 8m 36s for the
  high-demand 1080p source. Its BT.2020/PQ proxy also has no explicit canvas tone-map stage.
  Evidence: `spikes/native-frame-identity-playback/docs/all-intra-proxy-results.md`.
- Discovery: The pinned FFmpeg package initially omitted `swresample`, so the selected stereo-audio
  contract could not be built reproducibly. Adding that feature to the bootstrap and dependency
  manifest produced the required `aresample` filter. A synthetic source with audio delayed by 500 ms
  retained approximately 500 ms of leading silence after proxy encoding, confirming that the
  resample/timestamp chain preserves delayed audible content rather than pulling it to time zero.
  Evidence: reproducible FFmpeg rebuild, filter probe, and delayed-audio encode/decode probe on
  2026-08-29.
- Discovery: All 27 GOP-profile rows preserved complete ordinal mapping, selected audio, and the
  declared relative-time policy. GOP 1 encoded fastest on each of the three real-media samples. The
  rebuilt full 4K Electron journey reopened 175,400 mapped frames, selected the AC3 stereo program,
  used the review proxy for playback, and displayed 12/12 rapid drag positions at 7.94 fps without a
  player error.
  Evidence: `spikes/native-frame-identity-playback/docs/review-proxy-profile-results.md` and
  `artifacts/control-smoke-media-035.json`.
- Discovery: Intel QSV decode and scale is source-class dependent. The pinned FFmpeg 9 package was
  1.71 times faster than software on the 60-second 3840x1606 HEVC sample, but 0.81 times as fast on
  common 1080p H.264. Complete HEVC timing differed by at most one non-accumulating Matroska tick,
  while PSNR 51.54 dB and SSIM 0.9967 passed the visual gate.
  Evidence: `spikes/native-frame-identity-playback/docs/preparation-acceleration-results.md`.
- Discovery: A reproducible MinGW QSV package required explicit HEVC QSV, D3D11VA/DXVA2 child
  devices, and collection of the exact compiler's MinGW runtime DLLs. vcpkg's stock MinGW FFmpeg
  branch did not enable the Windows child device needed to initialize QSV.
  Evidence: `scripts/bootstrap-accelerated-ffmpeg.ps1` and the ignored Phase 3C build logs.
- Discovery: BestSource's current canonical FFmpeg stack rejects both H.264 and HEVC `d3d11va`
  devices. `node-av` detected the Intel GPU but failed the selected filter/PTS pipeline, while
  FFmpegKitNext offered no Electron-facing layer beyond another native bridge.
  Evidence: `artifacts/bestsource-hardware-raw.json`, the isolated node-av logs, and the Phase 3C
  report.

## Decision Log

- (2026-08-30) Close the POC on prepared-review C2 for measured Windows x64 use. Reuse the user's
  accepted audio/image review and record the new ten-minute stress evidence. Keep GPU utilization,
  other OSes, clean-machine installation and production cold-open validation explicitly unproved.
- (2026-08-30) Honor the requested cleanup with an explicit path allowlist and vcpkg-aware removal.
  Retain selected software/QSV runtimes, source/proxy caches and small reproducibility harnesses.
  Add a layered architecture diagram and integration handoff; do not start product work.

- Decision: Use the existing Visual Studio 2017 x64 C++ toolchain for Milestones 0-2 and a pinned
  release-only MinGW GCC 11.4.0 stack for Milestone 3.
  Rationale: The LibVLC harness consumes a stable C ABI. The current Visual Studio C++ workload
  remained unavailable without elevation, while the isolated MinGW stack could compile current
  BestSource and its pinned dependencies reproducibly. The result is evidence for this exact stack,
  not a claim about every BestSource Windows toolchain.
  Date/Author: 2026-08-12 / Codex

- Decision: Build a new spike at `spikes/native-frame-identity-playback/` and leave the previous
  WebCodecs spike intact as evidence.
  Rationale: The prior candidates and side-by-side host answer a different question and have known
  support failures.
  Date/Author: 2026-08-12 / user and Codex
- Decision: Use C++17 for native harnesses and services, CMake for local harness/service builds, and
  Meson only where the pinned BestSource upstream build requires it.
  Rationale: LibVLC and BestSource expose native C/C++ APIs directly; C++ avoids a binding becoming
  another unmeasured variable. CMake is already available locally and BestSource itself uses Meson.
  Date/Author: 2026-08-12 / Codex
- Decision: The deterministic fixture oracle is test-only. Content hashes or burned-in frame codes
  may prove what was displayed, but production frame identity must come from the backend's canonical
  timeline mapping rather than visual content matching.
  Rationale: Duplicate or visually identical frames cannot be addressed reliably by image content.
  Date/Author: 2026-08-12 / Codex
- Decision: Try CPU-memory output first for correctness and bridge measurement; add a narrow D3D11
  texture callback probe for LibVLC 4 without making a native window.
  Rationale: CPU frames are easiest to inspect and hash. The GPU callback path answers whether a
  lower-copy renderer is available if CPU delivery misses performance targets.
  Date/Author: 2026-08-12 / Codex
- Decision: The new Electron host has one viewport, one transport surface, and one range panel.
  Rationale: Candidates are evaluated sequentially. Path C2's normal-playback and exact-frame
  backends are internal modes of one control, not two visible candidates.
  Date/Author: 2026-08-12 / user and Codex
- Decision: A candidate does not pass because it merely returns plausible frames or timestamps.
  Rationale: All deterministic fixtures and all valid required media signatures must avoid wrong
  identities, hangs, and silent fallback. Unsupported media must be explicit.
  Date/Author: 2026-08-12 / user and Codex
- Decision: Reject C1 and select C2 provisionally, with no Electron bridge work yet.
  Rationale: Relative stepping and broad first-frame decoding are promising, but LibVLC failed the
  mandatory canonical-identity criterion and four of six fixtures failed exact seek/boundary scripts.
  BestSource must independently pass Milestone 3 before C2 is confirmed.
  Date/Author: 2026-08-12 / Codex
- Decision: Stop the D3D11 probe after proving callback registration and defer a real render target.
  Rationale: A full GPU callback renderer cannot repair the already decisive identity failure. This
  is explicit rendering-feasibility debt if LibVLC is later retained only for normal playback.
  Date/Author: 2026-08-12 / Codex
- Decision: Reject provisional C2 and stop before the Electron bridge.
  Rationale: BestSource proved the identity model on controlled fixtures and all 45 current media
  representatives, but stock BestSource failed both the warm exact-access and initial-indexing
  performance targets. Per the signed stop rule, UI and bridge work cannot make this backend
  acceptable for v1 as currently configured.
  Date/Author: 2026-08-12 / Codex
- Decision: For a future revised product contract that accepts visible background preparation,
  prefer packet preflight followed by timestamp-normalized stream-copy and complete BestSource
  indexing; retain an all-intra proxy as a fallback. Do not unpack MPEG-4 Part 2 unconditionally.
  Rationale: Timestamp normalization passed all five missing-PTS cases cheaply and preserved source
  identities. Unpacking changed two source frame maps. Proxying passed all five but costs more time,
  disk, and pixel fidelity. This does not retroactively pass the signed Milestone 3 gate.
  Date/Author: 2026-08-15 / Codex
- Decision: Amend the spike with Milestone 3b before any Electron bridge work.
  Rationale: The user accepts ordinary playback while one selected review asset is prepared and
  indexed visibly in the background. The amended gate must prove one active BestSource index,
  timestamp normalization only when needed, cache reuse, and a distinct adjacent-step path. Proxy
  creation, packed-picture unpacking, PTS-assisted hash matching, and 4K acceleration are deferred.
  Date/Author: 2026-08-15 / user and Codex
- Decision: Record the prepared-review C2 Milestone 3b gate as passing and stop before the Electron
  bridge for user evidence review.
  Rationale: All 16 clean targets prepared and reopened from one canonical index; all six
  timestamp-normalized review copies preserved complete source frame-hash order. H.264-in-AVI uses
  NUT to preserve packet framing, while the five MPEG-4 Part 2 repairs use Matroska. Cancellation
  published no partial entry, and seven full-length movies sustained exact one-in-flight forward
  and reverse stepping above ten visible frames per second for more than five seconds. The original
  immediate-readiness gate remains failed, and two known random-access outliers remain phase-one
  limitations.
  Date/Author: 2026-08-15 / Codex
- Decision: Use the deterministic 3+3+3x1-minute sampled packet signature for future cache reopen.
  Rationale: It was 17.4-42.8 times faster than the complete packet digest on full movies. The
  proposed 5+5+5x1-minute profile reached 12.31 seconds on 4K, while the compact profile reached
  6.32 seconds. The user explicitly accepts probabilistic invalidation for this local cache.
  Date/Author: 2026-08-15 / user and Codex
- Decision: Retain ordinary binary bridge transport through 1080p, but do not claim full-resolution
  4K readiness or start a native window in Milestone 4.
  Rationale: Binary transport passed the 100 ms bridge p95 gate at 720p and 1080p but measured
  146.34 ms at 3840x1606. The bounded two-slot shared-ring experiment could not cross Electron
  37's sandboxed main/renderer IPC because `SharedArrayBuffer` is unavailable in preload and cannot
  be structured-cloned from main. Milestone 5 remains pending user review.
  Date/Author: 2026-08-15 / Codex
- Decision: Separate the unified review-proxy contract from preparation acceleration.
  Rationale: GOP, timing, audio, frame mapping, and playback handoff must be proved without hardware
  or wrapper behavior clouding the result. Milestone 5b therefore uses the pinned software FFmpeg
  path. Milestone 5c later compares `node-av`, `ffmpeg-kit`, direct FFmpeg hardware processing, and
  BestSource's separate hardware device against that fixed artifact contract.
  Date/Author: 2026-08-28 / user and Codex
- Decision: Select GOP 1 as the Phase 3B review-proxy profile and record the automated contract gate
  as passing, subject to the user's perceptual review.
  Rationale: GOP 1, 6, and 12 all preserved the tested frame, timing, and audio contracts. GOP 1 was
  fastest to encode on every real-media sample and removes decode-forward work; the alternatives
  primarily saved disk space, which is not the current optimization target. The complete 4K smoke
  also proved proxy playback, exact canonical stepping, and range capture in the Electron control.
  Clean synchronized audio, enlarged-image quality, and the visible handoff remain human judgments.
  Date/Author: 2026-08-29 / Codex
- Decision: Select conditional direct-FFmpeg QSV preparation for measured large HEVC sources only.
  Keep common sources and all BestSource indexing on software, with software as automatic fallback.
  Rationale: The 4K HEVC lane passed contract, complete timing tolerance, visual-quality, and speed
  gates at 1.71x, while H.264 was slower and failed the visual threshold. The wrappers and
  BestSource hardware lane added risk or failed without supplying a better measured result.
  Date/Author: 2026-08-29 / Codex
- Decision: Record shared-pass source indexing/proxy creation as a deferred follow-up, not another
  required POC gate. Keep Milestones 6 and 7 as the remaining closeout work.
  Rationale: the user accepts current review UX and preparation cost; the combined native pass is a
  potential optimization, not needed to establish the chosen playback direction.
  Date/Author: 2026-08-30 / user and Codex

## Outcomes & Retrospective

Closeout on 2026-08-30: all planned POC milestones and conditional decisions are resolved. The
selected prepared-review implementation passes the fixed real-Electron soak, exact reopen/range
checks, native fixture gate, 126 automated tests and post-cleanup playback smoke. The native-window
branch was not needed after viewport/proxy remediation; shared-ring and alternate acceleration
experiments remain rejected or deferred, not secretly required next steps. The final report retains
historical failures and unresolved old initial-probe flags alongside current passing evidence.

Validation rebuilt generated native outputs and fixtures, not third-party dependency source trees
from scratch on a new machine. Python/full fixture FFmpeg prerequisites and exact pins are now
documented. Raw-report verification checks all 45 current representatives against source paths and
signatures, native identity arrays, prepared/proxy evidence, dependency hashes and the full soak.
The next step is a separately scoped production component and app integration, including actual
clip extraction. No production architecture/code changed as part of this closeout.

Milestones 0-3 establish a reproducible native workspace, a deduplicated source matrix, exact test
oracles, and reviewable LibVLC and BestSource gates. The result rejects unified Path C1: LibVLC 4
has useful relative stepping and opened all 63 playable representatives, but it neither exposes
canonical source-frame identity nor passes exact seek/boundary scripts on four difficult fixture
families.

The result also rejects provisional Path C2 under the signed v1 gate. BestSource proved exact
absolute identity on all controlled fixtures and all 45 current representatives. The corrected
clean and warm runs contain no native crash. Two 4K sources took 14.79 and 21.27 minutes to build a
full index, and seven sources had repeatable multi-second warm exact access. Five of those warm
failures linearly decode from frame zero because no prior keyframe has a usable indexed PTS. The
ignored raw JSON retains per-operation timing and logs; the committed reports retain the decision
evidence. Per the signed stop rule at that point, the next experiment tested normalization/proxy
preparation against these measured costs before Electron work began.

That follow-up found a viable revised direction for the five missing-PTS failures: timestamp-only
stream-copy plus full BestSource indexing. It also proved an all-intra proxy fallback within three
minutes on those five sources. Remaining evidence gaps are the proxy cost for the two 4K indexing
outliers, PTS-assisted disambiguation for `media-036`, audible playback/mode handoff, and the visible
background-preparation UX. The production architecture map is not updated yet because the selected
full-resolution delivery path and actual control remain unproved.

The user subsequently approved a bounded Milestone 3b amendment. It does not erase the original
Milestone 3 failure. It asks whether a different product contract, ordinary playback immediately
plus visible exact-review preparation, is viable enough to unlock bridge work. Milestone 3b must
stop for evidence review before Milestone 4.

Milestone 3b passed that revised contract. A fresh 45-signature packet pass selected six timestamp
repairs, including a newly selected H.264-in-AVI case. Cold preparation completed 16/16 targets;
full source/review BestSource hash sequences matched for every repaired movie. Valid cache reopens
skipped normalization and indexing, although the initial full-packet validation itself ranged from
about 12 seconds to 270 seconds. The approved deterministic 3+3+3x1-minute packet signature now
validates common full movies in 0.30-2.07 seconds and the 4K outlier in 6.32 seconds, with an explicit
probabilistic-change-detection tradeoff. Cancellation completed in 285 and 735 ms without
publishing partial work.
Across seven full-length movies, five landing regions each sustained 10.62-10.69 exact forward and
cached-reverse frames per second for at least 5.56 seconds per direction with zero reverse misses.
The 4K HEVC and repeated-content random-access controls still measured 1.23 and 1.53 second p95 and
remain documented limitations. The user accepted those product accommodations and approved
Milestone 4, whose bridge evidence is now recorded separately.

Milestone 4 proved the platform-neutral C2 boundary: persistent LibVLC playback and BestSource exact
processes, canonical bigint identity, length-prefixed binary framing, structured errors, crash and
timeout supervision, latest-wins scrubbing, adjacent stepping, and one acknowledged playback frame
in flight. Pixel-verified Electron rendering passed the bridge target for 720p and 1080p. Native
RGBA format negotiation fixed an initially mislabeled `RV32` callback that would have rendered
transparent or color-swapped frames. Full-resolution 4K delivery missed the gate, and the bounded
shared-ring experiment is blocked by Electron 37 IPC. The spike therefore stops before Milestone 5
with viewport-resolution delivery, a native addon/newer shared-texture path, and the signed native-
window gate as explicit alternatives.

Milestones 5b and 5c subsequently proved a unified GOP-1 review proxy and a bounded preparation
accelerator. The user accepted full-player proxy image and audio quality. Phase 3C keeps canonical
BestSource indexing unchanged and conditionally uses a reproducibly packaged QSV FFmpeg child
process only for large HEVC decode and scaling. The software recipe remains independently usable,
and any accelerated failure retries it before a cache entry can be published. The cold original-to-
proxy transition remains a non-blocking UX observation.

As of 2026-08-30, Milestones 6 and 7 are complete with the bounded evidence above. The shared-pass preparation
proposal is documented separately and remains unimplemented. The POC is functionally demonstrated
on the tested Windows path, but is not yet formally complete against those final milestones.

## Context and orientation

The production Electron app is framework-free TypeScript. `electron/main.cjs` and
`electron/preload.cjs` own trusted desktop access; renderer-facing native behavior belongs behind
adapters. This spike must not import production modules because its purpose is to choose a backend,
not to ship the pipeline workflow.

The failed experiment is under `spikes/frame-first-video-playback/`. Its reusable lessons are in:

- `spikes/frame-first-video-playback/docs/spike-results.md`
- `spikes/frame-first-video-playback/docs/media-support-spike.md`
- `spikes/frame-first-video-playback/docs/playback-architecture-options.md`

The real media root is `D:\tmp\media`. It is external test data and must never be copied into Git.
Generated deterministic fixture source scripts and manifests belong in Git; generated movie files,
native dependencies, build output, and raw measurements do not.

The implementation should create this shape:

    spikes/native-frame-identity-playback/
      README.md
      package.json
      package-lock.json
      tsconfig.json
      vite.config.ts
      dependency-manifest.json
      CMakeLists.txt
      CMakePresets.json
      scripts/
        preflight.ps1
        bootstrap-native.ps1
        inventory-media.mjs
        generate-fixtures.mjs
        run-libvlc-gate.ps1
        run-bestsource-gate.ps1
        run-electron.ps1
        generate-reports.mjs
      native/
        common/
        libvlc-gate/
        bestsource-gate/
        direct-libav-baseline/
        media-service/
      electron/
        main.cjs
        preload.cjs
      src/
        adapter/
        model/
        ui/
        main.ts
      tests/
        unit/
        integration/
        e2e/
      fixtures/
        manifest.json
      artifacts/
      docs/
        media-matrix.md
        libvlc-gate-results.md
        bestsource-gate-results.md
        bridge-results.md
        playback-architecture-options.md
        spike-results.md

`.gitignore` must exclude `.deps/`, `build/`, `dist/`, `node_modules/`, generated fixture movies,
raw decoded frames, raw gate JSON, indexes, crash dumps, and performance traces. Commit the small
derived Markdown reports and dependency/fixture/media manifests needed to understand the result.

### Definitions used by the harnesses

- **Required media signature:** a materially distinct, readable real-media group selected from
  `D:\tmp\media`. Corrupt fixtures are diagnostic, not required-success media.
- **Canonical identity:** `{frameIndex, pts, timebaseNumerator, timebaseDenominator,
  durationTimestamp}`. Integer values that can exceed JavaScript's safe integer range travel across
  JSON as decimal strings and become `bigint` in TypeScript.
- **Relative step:** request the picture immediately before or after the current picture.
- **Random exact access:** request a stable absolute frame index after no assumption about current
  decoder position.
- **Oracle:** independent test evidence that identifies the decoded picture. It is not the runtime
  source of frame identity.
- **C1:** LibVLC supplies normal playback and exact-frame behavior.
- **C2:** a normal player supplies clocked playback while BestSource supplies exact paused frames.
- **Review asset:** the media file indexed for exact review. It is the source movie when usable, or
  an optional timestamp-normalized stream-copy when the source lacks usable keyframe PTS.
- **Timestamp-normalized review copy:** the generated media file called a derivative in earlier
  experiment reports. It is not an index and is not a second user-visible movie.
- **Canonical index:** the one complete persistent BestSource index belonging to the selected review
  asset. Test-only comparison indexes are evidence artifacts, not product cache entries.

### Original Milestone 3 correctness and performance gates

Correctness is non-negotiable:

1. Every deterministic CFR/VFR/reordering fixture must return the expected picture and canonical
   identity for every scripted operation.
2. Every valid required real-media representative must either pass or cause the candidate to fail
   the gate. "Unsupported" is useful diagnosis, not a passing result for a format present in the
   target collection.
3. No operation may hang, return a stale frame as current, infer identity from nominal fps, or hide
   an error behind approximate success.
4. Reopening the same source must reproduce the same canonical frame map.

Use these go/no-go responsiveness targets for the selected full-length movie after warm-up:

1. warm adjacent exact-frame request: p95 at or below 100 ms in the native gate;
2. held `+1` or `-1`: at least 10 visible frames/second for five seconds without queue growth;
3. warm random exact access: p95 at or below 750 ms;
4. scrub settlement: newest requested frame visible within 250 ms after input stops;
5. index progress visible within one second and cancellation acknowledged within two seconds;
6. BestSource full-movie initial indexing: at most ten minutes unless exact review can begin
   progressively before completion; otherwise C2 is not acceptable for v1;
7. ten minutes of mixed interaction must show bounded cache/queue memory, no monotonic leak, and no
   stale-result overwrite.

If a correctness gate fails, stop that path. If only a performance target fails, perform one bounded
profiling/optimization pass, rerun the same script, and then record pass/fail. Do not repeatedly tune
until an unsuitable architecture looks acceptable.

## Milestone 0 - Establish a reproducible native workspace

### Scope

Create the isolated folder, pin every external component, and provide one preflight plus one
bootstrap path. Do not write engine behavior before the compiler, headers, libraries, plugins, and
runtime paths are reproducible.

### Changes

- File: `spikes/native-frame-identity-playback/dependency-manifest.json`
  Edit: pin the VLC ZIP URL, commit `baad2c52`, SHA-512 above, BestSource commit
  `825af4e691524a3c98383d0cfe7d85b4142005cc`, vcpkg commit
  `aae277acf4e7de287ddb5e208b5316614de6aad7`, and every resolved FFmpeg/libp2p/xxHash version and
  license. Never use `latest` at build time.
- File: `spikes/native-frame-identity-playback/scripts/preflight.ps1`
  Edit: detect Windows x64, Node/npm, PowerShell, Git, CMake, Ninja, Meson, FFmpeg/FFprobe, and a
  VS 2022 C++ workload through `vswhere`. Print exact versions and actionable failures. Do not rely
  on a developer command prompt already being open.
- File: `spikes/native-frame-identity-playback/scripts/bootstrap-native.ps1`
  Edit: optionally install the VS 2022 C++ Build Tools workload and Meson when explicitly invoked
  with `-InstallMissing`; otherwise fail with the exact command needed. Download the pinned VLC ZIP,
  verify SHA-512 before extraction, clone source mirrors at pinned commits, bootstrap pinned vcpkg,
  and write resolved paths to `.deps/resolved-dependencies.json`.
- Files: `CMakeLists.txt`, `CMakePresets.json`, `package.json`, `tsconfig.json`, `vite.config.ts`,
  `.gitignore`, and `README.md`
  Edit: create isolated native and Electron builds. The parent repo's package scripts and runtime
  dependencies must remain unchanged.
- File: `scripts/verify-libvlc-api.ps1`
  Edit: compile a tiny header probe and inspect the pinned DLL exports for the exact APIs used,
  including previous/next frame, player callbacks, CPU-memory callbacks, and texture-output
  callbacks. Save the ABI/version/change-set output.

### Validation

- Command:

      cd D:\tmp\dev\clip-sandbox\spikes\native-frame-identity-playback
      powershell -ExecutionPolicy Bypass -File .\scripts\preflight.ps1

  Expected: either a complete version table ending in `READY`, or a non-zero exit with the exact
  missing VS 2022/Meson action. The current machine is expected to need that setup initially.
- Command:

      powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-native.ps1
      powershell -ExecutionPolicy Bypass -File .\scripts\verify-libvlc-api.ps1

  Expected: hashes verify, the pinned VLC version/change-set are printed, required symbols compile
  and resolve, and no dependency path points outside `.deps/` except the detected compiler tools.
- Command: `npm ci; npm run typecheck; npm test`
  Expected: clean isolated TypeScript setup and manifest/preflight tests pass.

### Rollback/Containment

All downloaded and built native material is under `.deps/` or `build/` and ignored. Delete those two
directories to return to a source-only spike. Do not uninstall a pre-existing compiler or edit the
parent application's package files.

## Milestone 1 - Build the media matrix and exact-frame oracle

### Scope

Reduce `D:\tmp\media` to meaningful representatives and generate small fixtures whose exact frame
sequence can be recognized independently of candidate timestamps.

### Changes

- File: `scripts/inventory-media.mjs`
  Edit: recursively enumerate media, invoke FFprobe with a per-file timeout and bounded concurrency,
  and record container, codec/profile, pixel format/bit depth, dimensions, rational rates,
  field/repeat information, start time, duration, rotation, video/audio tracks, and probe failures.
  Group by a stable signature and select a demanding representative rather than testing duplicates.
- File: `artifacts/media-inventory.json`
  Edit: generated manifest containing every discovered file, its signature, selected representative,
  required/diagnostic classification, and probe error. Keep absolute source paths because this is a
  local spike; never copy the movie files.
- File: `docs/media-matrix.md`
  Edit: generated readable summary with one row per signature, representative path, reason selected,
  and later per-candidate status columns.
- File: `scripts/generate-fixtures.mjs`
  Edit: generate lossless source images with a high-contrast binary frame code and visible decimal
  number, then use the pinned FFmpeg executable to create CFR, deliberately VFR, B-frame-heavy,
  long-GOP, interlaced/repeat-field, non-zero-start, rotated, and malformed fixtures. Generation
  must be deterministic from a recorded seed.
- File: `fixtures/manifest.json`
  Edit: record every fixture's frame count, exact PTS/timebase/duration sequence, encoded frame code,
  and normalization rules. Generated movies are ignored and regenerated on demand.
- Files under `native/common/`
  Edit: implement rational timestamp values, overflow-safe rescaling, pixel normalization, frame-code
  extraction, and normalized hashes. Keep integer timestamps throughout. The hash oracle may verify
  test output but must not be exposed as production identity.
- Tests under `tests/unit/`
  Edit: prove CFR and VFR identities, non-zero starts, duplicate-looking images, rational rescaling,
  frame-code extraction, and grouping stability with concrete examples.

### Validation

- Command:

      npm run media:inventory
      npm run fixtures:generate
      npm run fixtures:verify

  Expected: every readable file belongs to one signature, duplicates are not selected simply because
  there are many of them, each generated fixture decodes to the exact manifest sequence, and the
  malformed fixture is classified as an expected failure.
- Command: `npm test`
  Expected: frame identity, grouping, and fixture tests pass with readable scenario names.

### Rollback/Containment

Inventory and generation are read-only against `D:\tmp\media`. Delete generated fixture movies and
raw artifact JSON, rerun the scripts, and obtain the same committed manifest structure.

## Milestone 2 - Run the LibVLC 4 determinism gate

### Scope

Answer whether pinned LibVLC can be the unified C1 backend before any Electron UI is built.

### Changes

- Files under `native/libvlc-gate/`
  Edit: implement a command-line harness that owns one LibVLC instance/player per test case, uses
  RAII for every LibVLC object, serializes callback observations through a bounded event queue, and
  enforces operation/startup/teardown timeouts. Enable VLC logs into a per-case artifact without
  flooding stdout.
- File: `native/libvlc-gate/cpu_frame_output.*`
  Edit: use format plus lock/unlock/display callbacks to receive inspectable pixels. Associate the
  displayed callback observation with player time/events and the harness's requested operation.
  Never treat the earlier unlock callback as proof that a frame was displayed.
- File: `native/libvlc-gate/d3d11_output_probe.*`
  Edit: create the smallest off-screen D3D11 output needed to exercise
  `libvlc_video_set_output_callbacks`. Capture swap/metadata timing and one inspectable render target.
  This is a callback feasibility probe, not a native window.
- File: `native/libvlc-gate/operation_runner.*`
  Edit: execute forward, backward, alternating, random-seek-plus-step, repeated-seek, start/end, and
  reopen scripts. Wait on documented status callbacks instead of sleeping a guessed duration.
- File: `native/libvlc-gate/identity_evaluator.*`
  Edit: compare displayed fixture content to the oracle and evaluate whether a runtime identity can
  be obtained from documented LibVLC data or deterministic tracked operations. Test hashes prove
  correctness but cannot count as the production identity mechanism.
- Files: `scripts/run-libvlc-gate.ps1`, `scripts/generate-reports.mjs`,
  `docs/libvlc-gate-results.md`
  Edit: run all fixtures and required real representatives, preserve raw JSON separately, and render
  per-operation correctness, exact mapping mechanism, source coverage, latency, callbacks, crashes,
  timeouts, and logs into a reviewable report.

### Validation

- Command:

      powershell -ExecutionPolicy Bypass -File .\scripts\run-libvlc-gate.ps1

  Expected: every case terminates, the report distinguishes next/previous correctness from absolute
  identity, and every failure names source, operation, expected identity, observed identity, and
  relevant callback/time evidence.
- Command: `ctest --preset native-tests --output-on-failure`
  Expected: lifecycle, timeout, event-queue, rational timestamp, and fixture-operation tests pass.
- Manual check: open representative captured frames from beginning, middle, random seek, backward
  GOP crossing, and VFR cases.
  Expected: burned-in numbers match report identities; no plausible timestamp is accepted when the
  picture is wrong.

### Rollback/Containment

If LibVLC cannot expose absolute identity, record a C1 failure and retain only the harness and
evidence. Do not add guessed timestamp-to-frame logic. LibVLC may remain a normal-playback candidate
for C2, but the plan proceeds to Milestone 3.

## Milestone 3 - Conditionally prove BestSource exact access

### Scope

Run only if LibVLC fails C1. BestSource must earn C2 using the same media and correctness standard.
If it fails, stop this ExecPlan before Electron integration and complete the results as "no viable
backend proved."

### Changes

- Files: `scripts/bootstrap-bestsource.ps1`, `scripts/build-bestsource-gate.ps1`
  Edit: build the pinned BestSource source with Meson `-Denable_plugin=false`, pinned vcpkg FFmpeg,
  dav1d, and xxHash dependencies, and the upstream libp2p wrap. Set an explicit install prefix under
  `.deps/`. Record resolved library versions and licenses.
- Files under `native/bestsource-gate/`
  Edit: construct `BestVideoSource` directly, set an explicit cache limit and decoder count, expose
  `GetFrame(N)` plus `GetFrameInfo(N)`, and copy/normalize the returned `AVFrame` without leaking its
  lifetime. Keep PTS/timebase/duration as integers.
- File: `native/bestsource-gate/operation_runner.*`
  Edit: run sequential forward/reverse frame-number requests, alternating direction, random plus
  neighboring frames, repeated frame, start/end, persistent-index reopen, malformed input, and
  cancellation/progress cases. Use the identical oracle and source classifications from Milestone 1.
- File: `native/bestsource-gate/direct_libav_baseline.cpp`
  Edit: implement only sequential decode and keyframe-seek-plus-decode-forward timing. Do not grow a
  second frame index, cache, or production candidate.
- Files: `scripts/run-bestsource-gate.ps1`, `docs/bestsource-gate-results.md`
  Edit: report initial indexing, reopen, cold/warm access, frame correctness, source coverage,
  memory, decoder/cache settings, and direct-libav baseline timings.

### Validation

- Command:

      powershell -ExecutionPolicy Bypass -File .\scripts\run-bestsource-gate.ps1

  Expected: all deterministic fixtures and all valid required representatives satisfy exact
  picture/identity behavior; indexes reopen to the same map; failures are explicit; native p95 and
  indexing targets are included.
- Command: run the gate a second time without deleting indexes.
  Expected: the report clearly separates first index cost from warm reopen and produces identical
  canonical identities.
- Command: cancel an index and kill the harness during a disposable test.
  Expected: cancellation/termination completes within the target, partial state is not treated as a
  valid index, and the next run either rebuilds or reports a clear error.

### Execution Result

Completed on 2026-08-12 and corrected and fully rerun on 2026-08-13. Exact fixtures, malformed input,
cancellation, forced termination, and partial-index recovery passed. The current clean and warm
matrices both pass exact identity and stability for 45/45 representatives without a crash. Two
sources exceed the ten-minute initial-index target and seven exceed the 750 ms warm-access target. See
`spikes/native-frame-identity-playback/docs/bestsource-gate-results.md` and
`spikes/native-frame-identity-playback/docs/bestsource-failure-analysis.md`. The original rollback
rule remains active for Milestones 4 through 6. The approved amendment permits only Milestone 3b.

### Rollback/Containment

BestSource, FFmpeg libraries, indexes, and build products remain under ignored `.deps/`, `build/`,
and `artifacts/`. If the gate fails, do not implement Milestones 4 through 6. The separately approved
Milestone 3b may test the amended visible-preparation contract, but it cannot retroactively change
this gate's result.

## Milestone 3b - Prove the prepared BestSource review flow

### Scope

Test one revised hypothesis before Electron integration: BestSource can be viable when normal
playback begins immediately, exact controls wait visibly for preparation, and future loads reuse a
validated cache. This milestone has no Electron UI. It builds a production-shaped preparation
harness and exact-frame session, runs the representative evidence, writes a report, and stops for
user review.

For a healthy source, the review asset is the source movie. When packet preflight proves that key
packets lack PTS, create a timestamp-normalized stream-copy and use that as the review asset. In
either case, publish exactly one full BestSource index for the selected review asset. The original
movie remains the final extraction source.

Do not create a proxy, unpack packed MPEG-4 pictures, change BestSource hash matching, build the
Electron bridge, or optimize 4K decode-forward in this milestone.

### Changes

- Files: `src/preparation/preparation-policy.mjs`, `tests/unit/preparation-policy.spec.ts`
  Edit: implement a pure decision from packet evidence to `use-source`, `normalize-timestamps`, or
  explicit failure. Confirmed packed pictures may add diagnostics but must not select unpacking.
  Model `preparing`, `exact-ready`, `cancelled`, and `failed` explicitly so exact operations cannot
  run before the complete index is published.
- Files: `native/bestsource-gate/media_packet_scan.cpp`, `scripts/build-bestsource-gate.ps1`
  Edit: extend the sequential packet scan with periodic byte progress and a deterministic digest of
  selected-track codec extradata plus compressed packet payloads in order. Emit key-packet PTS and
  multi-VOP evidence separately. The digest lets normalization prove that the compressed picture
  stream was not changed.
- Files: `src/preparation/preparation-coordinator.mjs`,
  `scripts/run-bestsource-preparation-gate.mjs`
  Edit: orchestrate preflight, optional timestamp normalization with the pinned FFmpeg binary, one
  complete BestSource index, and atomic cache publication. Emit structured phase, percent, elapsed,
  ETA, cancellation, and error events. Never treat a partial derivative, index, or manifest as
  ready. Re-scan the selected source track on reopen before accepting a cache hit.
- File: `src/preparation/preparation-cache.mjs`
  Edit: key entries by source-track packet digest, source size, selected track, normalization recipe,
  BestSource/FFmpeg versions, and indexing options. Cache either `(source reference, index, manifest)`
  or `(timestamp-normalized review copy, index, manifest)`, never simultaneous product indexes for
  source and copy. Publish through temporary names followed by atomic rename.
- Files: `native/bestsource-gate/prepared_video_session.hpp`,
  `native/bestsource-gate/prepared_video_session.cpp`, `native/bestsource-gate/bestsource_gate.cpp`
  Edit: separate `getExact(frameIndex)` from `stepAdjacent(direction)`. After an exact landing,
  forward `+1` must call the same persistent `BestVideoSource` with its linear/nearby decoder path.
  Reverse `-1` first uses a bounded cache of already delivered exact frames; a miss is reported and
  may seek earlier and decode forward. Every response carries canonical identity and timing.
- File: `src/adapter/adjacent-step-scheduler.ts`
  Edit: model held input as direction state with at most one request in flight. Schedule the next
  adjacent request only after the prior result arrives, stop scheduling on key release, and reject
  stale source generations. Do not translate operating-system key repeat into a random-seek queue.
- Tests under `tests/unit/` and `tests/integration/`
  Edit: cover preparation decisions, illegal exact access before ready, phase/progress ordering, ETA
  availability, cancellation, partial-artifact recovery, cache hit, fingerprint invalidation,
  normalization failure, packet-digest mismatch, bounded held-step scheduling, key release, reverse
  cache miss, boundaries, and stale-generation suppression.
- File: `scripts/run-bestsource-preparation-gate.mjs`
  Edit: on deterministic fixtures and the five known timestamp-repair sources, compare the complete
  source and normalized BestSource frame-hash sequences and frame counts. Existing source indexes
  may be reused for this test-only proof; the product-shaped cache still contains one index. Exercise
  packet preflight and preparation policy over all 45 current representatives without rebuilding
  every healthy index. Derive the clean end-to-end target set from every representative classified
  `normalize-timestamps`, then add both slow-indexing 4K sources (`media-026` and `media-035`), the
  repeated-content seek outlier (`media-036`), deterministic fixtures, and one ordinary healthy
  control. The five currently known timestamp repairs are evidence, not a hardcoded ceiling; any new
  `normalize-timestamps` result must enter the clean target set automatically. Separately benchmark
  the known 4K decode-forward and repeated-content outliers without treating their original latency
  misses as correctness failures.
- File: `docs/bestsource-preparation-gate-results.md`
  Edit: report per source the selected review-asset kind, transform/index/cache-open times, progress
  and ETA behavior, identity evidence, random access, sustained forward/reverse adjacent rate,
  reverse cache misses, memory bounds, cancellation, and any explicit failure. Distinguish initial
  preparation from subsequent cache reopen and random landing from adjacent stepping.
- Files: `package.json`, `README.md`
  Edit: add one reproducible preparation-gate command, a render-only report command, artifact paths,
  cleanup instructions, and the explanation that a timestamp-normalized review copy is a media
  artifact while its BestSource index is the one canonical exact-review index.

### Validation

- Command: `npm test`
  Expected: preparation policy, state, cache, scheduler, cancellation, and identity tests pass.
- Command: `npm run typecheck`
  Expected: the TypeScript preparation and adjacent-step contracts pass without errors.
- Command: `powershell -ExecutionPolicy Bypass -File .\scripts\build-bestsource-gate.ps1`
  Expected: the scanner and prepared-session harness build against the pinned stack.
- Command: `npm run gate:bestsource:preparation:policy`
  Expected: all 45 representatives receive a deterministic `use-source`, `normalize-timestamps`, or
  explicit-failure policy result without rebuilding their established BestSource indexes.
- Command: `npm run gate:bestsource:preparation:targeted -- --reset`
  Expected: fixtures, every matrix source classified `normalize-timestamps`, `media-026`,
  `media-035`, `media-036`, and the healthy control finish clean end-to-end preparation or produce an
  explicit gate failure. Every normalized source preserves complete frame count/hash order and uses
  no unpack filter. Progress appears for every long phase and cancellation leaves no valid partial
  entry.
- Command: `npm run gate:bestsource:preparation:targeted -- --resume`
  Expected: valid entries skip normalization and full indexing, reopen the same canonical map, and
  report the cache-validation cost separately.
- Command: `npm run gate:bestsource:preparation:held`
  Expected: after random landings near the start, middle, end, and both sides of a GOP boundary, the
  selected full movie and every policy-selected timestamp-normalized source sustain at least ten
  identity-correct visible `+1` and cached `-1` frames per second for five seconds with one request
  in flight and no queue growth. Slower representative codecs remain measured limitations rather
  than approximate-success results.
- Command: cancel once during normalization and once during indexing, then reopen each source.
  Expected: cancellation is acknowledged within two seconds; the next run rebuilds rather than
  accepting a partial derivative, index, or manifest.

Milestone 3b passes only if absolute identity remains correct, every prepared source uses exactly
one active full index, every policy-selected timestamp repair passes complete source-to-review
sequence comparison, progress/cancellation/cache behavior is reliable, and adjacent stepping proves
the sequential request path. Initial indexing may exceed the original ten-minute target; that
duration must be visible, cancellable, measured, and avoided on a valid future cache hit. Known slow
random landings remain documented phase-one limitations. Stop and share the evidence with the user
before starting Milestone 4, even when every check passes.

### Rollback/Containment

All preparation media, indexes, manifests, and raw measurements remain below ignored spike-local
directories. If mapping, cache validation, cancellation, or sequential stepping fails, retain the
harness and report as evidence and do not start the Electron bridge. No production application code
is changed by this milestone.

## Milestone 4 - Define and measure the Electron bridge

### Scope

Run only after C1 passes directly or the user reviews and approves a passing Milestone 3b for C2.
Expose the selected native behavior through one platform-neutral, versioned protocol and measure
copies before adding polished interactions.

### Changes

- Files under `native/media-service/`
  Edit: wrap the selected backend behind commands for open, close, play, pause, stop, rate, step,
  exact frame, scrub, status, and shutdown. C1 may use one service. C2 may use separate persistent
  LibVLC playback and BestSource exact-frame processes to avoid native dependency/ABI collision;
  only one engine actively decodes for the viewport at a time.
- File: `native/common/protocol.*`
  Edit: use a versioned length-prefixed binary frame protocol over child-process stdio. Metadata is
  UTF-8 JSON; pixel payload is binary, never base64. Include request id, source generation, frame
  generation, dimensions, stride, pixel format, canonical identity, timing stages, and structured
  error. Cap payload and header lengths before allocation.
- Files under `src/model/`
  Edit: define immutable `SourceFrameIdentity`, media status, backend error categories, and captured
  frame range. Decimal timestamp strings parse to `bigint`; no floating-point identity conversion.
- Files under `src/adapter/`
  Edit: define a small `FramePlaybackAdapter` and implement native process supervision in Electron
  main/preload. Spawn fixed absolute executables without `shell: true`, validate commands and local
  paths, set explicit operation/shutdown timeouts, and surface crashes.
- File: `src/adapter/latest-frame-mailbox.ts`
  Edit: implement a bounded latest-wins mailbox for scrub requests and a serialized queue for held
  stepping. Old source/request generations must never overwrite new ones.
- Tests under `tests/unit/` and `tests/integration/`
  Edit: cover split headers/payloads, oversized lengths, invalid JSON, bigint round-trip, helper
  crash, timeout, stale responses, cancellation, bounded queues, and clean shutdown.

### Validation

- Command: `npm run bridge:test`
  Expected: protocol fragmentation and failure tests pass without launching Electron.
- Command: `npm run bridge:benchmark -- --movie "<selected full movie path>"`
  Expected: report separates index/seek, decode, conversion, native-to-main transport,
  main-to-renderer transfer, upload/draw, and end-to-end latency. Queue depth remains bounded.
- Decision: if CPU pixel transfer misses the agreed targets, perform one bounded shared-memory ring
  buffer experiment with explicit slot ownership and generation counters. If that still fails, do
  not invent a native window here; record the Phase 4 decision gate.

### Rollback/Containment

The protocol and adapter are spike-local. Shared-memory code, if attempted, lives behind the same
adapter and can be deleted without changing frame/range models or the Electron UI.

## Milestone 4b - Fit previews to the viewport and debounce scrubbing

### Scope

Remediate the measured bridge rather than changing architecture. Apply one dimension-based preview
policy to every codec and container: preserve native size when the source fits, otherwise resize the
native RGBA output to the renderer viewport without upscaling. Add a scrub quiet period before
BestSource execution. Preserve source-frame identity independently from preview dimensions.

### Changes

- File: `native/common/preview_size.hpp`
  Edit: define aspect-preserving, no-upscale fitting and padded-buffer visible-size projection.
- Files: `native/media-service/bestsource_media_service.cpp`,
  `native/media-service/libvlc_media_service.cpp`
  Edit: accept bounded preview dimensions during open. BestSource resizes in its existing swscale
  conversion; LibVLC requests a smaller callback buffer and retains visible cropping separately.
- Files: `src/adapter/frame-playback-adapter.ts`, `src/adapter/scrub-request-scheduler.ts`, native
  adapter implementations
  Edit: carry preview bounds and source dimensions through the neutral contract. Debounce scrub
  positions by 100 ms while retaining latest-wins protection for already executing work.
- Files: Electron benchmark host, `scripts/run-bridge-benchmark.mjs`, `package.json`
  Edit: compare warmed full-resolution and viewport-sized runs over the same 720p, 1080p, and 4K
  targets; report payload reduction, conversion, bridge, scrub, playback, drops, and pixel checks.
- Files: `docs/electron-bridge-m4b-results.md`, `README.md`, related spike references
  Edit: retain Milestone 4 as the failing full-resolution baseline and record the remediation result.

### Validation

- Command: `npm run native:test`
  Expected: fitting and padded visible projection pass.
- Command: `npm run bridge:test`
  Expected: exact and playback services return bounded previews with original source dimensions;
  scrub bursts execute only the latest position after the quiet period.
- Command: `npm run bridge:benchmark:m4b`
  Expected: renderer pixels match, the newest scrub position wins, queues remain bounded, and all
  viewport-sized representatives remain below the 100 ms p95 bridge threshold.

### Execution Result

Passed on 2026-08-26. The worst viewport-sized bridge p95 was 40.23 ms. The 4K representative
measured 28.65 ms p95 bridge overhead, 14.77 visible callback fps, zero native drops, and 3.85-second
scrub settlement. Full-resolution source decoding remains expensive and is explicitly outside this
transport remediation.

### Rollback/Containment

Preview fitting and debounce sit behind the same spike-local adapter. Removing them restores the
Milestone 4 baseline without changing canonical indexes, frame identities, or range rules.

## Milestone 5 - Build the single playback and range-capture control

### Scope

Create the actual Electron experience used to judge C1 or C2. It must show one solution, not a
candidate comparison page.

### Changes

- Files: `electron/main.cjs`, `electron/control-preload.cjs`
  Edit: create a context-isolated Electron window, secure file picker, native service lifecycle, and
  transferable frame channel. Keep `nodeIntegration` disabled and expose only the narrow adapter API.
- Files under `src/ui/`
  Edit: implement one video viewport, compact transport controls, speed selector (`0.25x`, `0.5x`,
  `1x`, `2x`), single-frame controls, timeline scrubber, current source-frame identity, optional
  keyboard legend, current range panel, and captured ranges panel. Use stable control dimensions and
  the existing visual conventions where applicable.
- File: `src/ui/keyboard-controller.ts`
  Edit: left/right step by the selected amount while paused, with bounded continuous repetition while
  held; Space toggles play/pause; `q`, `w`, and `a` implement the signed-off range flow. Ignore these
  shortcuts while typing in an editable element, but keep them active when the timeline range has
  focus.
- File: `src/model/range-capture-model.ts`
  Edit: store start/end as canonical identities, reject missing/reversed ranges visibly, lock a valid
  draft, allow the specified immediate unlock, and start a new draft on the next `q` or `w`.
- File: `src/adapter/hybrid-frame-playback-adapter.ts` for selected path C2
  Edit: present normal playback and exact-frame access as modes of one adapter. Pause and capture the
  current canonical frame before showing exact mode; resume from that frame's exact PTS. Keep one
  viewport and make handoff state observable for tests.
- Tests under `tests/unit/`, `tests/integration/`, and the Electron smoke runner
  Edit: cover shortcuts, held keys, mode handoff, scrub latest-wins behavior, playback rates, range
  validation/locking/unlocking, source reload, helper failure, and visible error states.

### Validation

- Command: `npm run typecheck; npm test; npm run e2e`
  Expected: all unit/integration/Electron tests pass. Deliberately breaking expected frame identity or
  stale-response rejection makes the relevant test fail with an understandable message.
- Manual QA in the actual Electron app:
  load deterministic CFR/VFR fixtures, a difficult representative, and the full movie; play with
  audible audio, change speeds, scrub slowly and rapidly, hold left/right, mark
  valid/invalid ranges, switch play/exact mode if C2, pause, reopen, and repeat a saved boundary.
  Expected: one coherent control, no side-by-side candidate UI, no stale frame flash, and range
  boundaries reopen on the same burned-in pictures.

### Execution Result

Milestone 5 passes its implementation and automated behavior gate. The renderer receives no raw
filesystem path or Node/Electron capability; the main process owns file selection, preparation,
native process lifecycle, and validated IPC. The C2 adapter opens LibVLC playback immediately,
enables BestSource exact review after visible background preparation, maps pause time to a canonical
source frame, and seeks LibVLC back to that frame's exact PTS before resume.

The final suite passed 98 TypeScript tests across 27 files plus the native C++ test. A repeated
CFR/VFR/1080p integration test covers source reopen and three playback-to-exact-to-resume cycles per
source. Electron smoke journeys passed `fixture-vfr-ffv1`, `media-005`, and `media-035`. With the
250 ms hold threshold and current 150 ms repeat interval, each 450 ms held-key journey advances exactly three
frames, creates a captured range, scrubs, changes rate, and resumes without a visible error. A
discovered native defect retained pre-seek
frame acknowledgement backpressure and could suppress the first post-seek frame; the seek barrier
now retires obsolete acknowledgement state only after any active pipe write completes. Hands-on
audio perception and extended stress/resource measurements remain for user review and Milestone 6.
The follow-up UI correction also primes and displays a paused first frame, supports seek before the
first explicit play, commits timeline seeks on release with automatic playback, and suppresses
disposable LibVLC initialization output. Repeated prime/seek/play integration also waits through
LibVLC's transient successful `0x0` video-size result before configuring the callback surface.
The initial seeker-thumbnail follow-up was rejected after hands-on review because a small image did
not provide the desired full-player drag experience. It has been removed. The replacement uses a
separately cached maximum-960-pixel all-intra proxy and proxy index. Proxy picture N is accepted only
as the display for canonical source-frame N after the complete frame counts match; the native
service decodes proxy pixels while reading PTS, duration, hash, and original ordinal from the
canonical BestSource index. A progressive one-in-flight/one-pending mailbox shows intermediate drag
pictures without building an unbounded queue, and release retains the canonical exact-seek handoff.
The representative Electron journeys then displayed 12/12 drag positions at 7.45-7.57 frames per
second on the legacy, high-demand 1080p, and difficult 4K movies. Cold proxy encode plus indexing
took 2m 1s, 8m 36s, and 25m 44s respectively. The automated continuous-drag gate passes after
preparation; perceived smoothness, enlarged-image quality, and HDR tone mapping remain hands-on or
follow-up gates.
See `spikes/native-frame-identity-playback/docs/electron-control-results.md`.

### Rollback/Containment

UI code consumes only `FramePlaybackAdapter`. A failed native path can be removed without changing
range rules; a failed UI experiment can be removed without changing native gate evidence.

## Milestone 5b - Select the unified review-proxy contract

### Scope

Turn the accepted 960-pixel drag proxy into one timing-preserving review asset used by LibVLC for
ordinary playback and BestSource for exact review after preparation completes. Use the existing
software FFmpeg path so the comparison isolates profile, timing, audio, and handoff behavior.

### Changes

- File: `src/preparation/all-intra-proxy-preparation.mjs`
  Edit: generalize the cached recipe into all-intra, GOP 6, and GOP 12 profiles with no B-frames;
  preserve source-relative presentation timing; retain exactly one proxy picture per canonical
  ordinal; select one preview-audio stream and encode normalized stereo AAC; include the complete
  recipe and map contract in cache identity and validation.
- Files: `src/adapter/frame-playback-adapter.ts`, `src/adapter/hybrid-frame-playback-adapter.ts`
  Edit: represent the proxy-to-canonical timeline transform explicitly. When preparation finishes,
  switch LibVLC from the provisional original source to the proxy while preserving position,
  playing or paused state, playback rate, exact-review state, and canonical identities.
- File: `electron/main.cjs`
  Edit: coordinate the source handoff, retire stale playback-frame acknowledgements, expose the
  selected profile and handoff evidence, and keep preparation failure visible.
- Tests under `tests/unit/` and `tests/integration/`
  Edit: first add failing coverage for timing-preserving FFmpeg arguments, GOP profiles, audio
  selection, cache identity, CFR/VFR mapping, handoff state/rate/position, and source-generation
  boundaries. Keep canonical identity assertions independent of proxy timestamps.
- Files under `scripts/` and `docs/`
  Edit: compare profiles on short representative segments before expensive full-movie jobs. Run the
  selected profile on CFR, VFR, timestamp-repaired, common 1080p, and difficult 4K cases; publish
  machine-readable evidence and a concise review-proxy result.

### Validation

- Command: `npm run typecheck; npm test`
  Expected: contract, cache, mapping, handoff, and existing control tests pass.
- Command: run the profile comparison and selected-profile integration runner documented by the
  spike.
  Expected: every accepted source retains complete frame-count and ordinal correspondence; sampled
  source-relative presentation times remain within the declared integer-timebase tolerance; no
  stale original-source frame appears after proxy activation.
- Electron smoke on CFR, VFR, common 1080p, and difficult 4K representatives.
  Expected: original playback is available while preparing; proxy activation preserves the visible
  location and transport state; ordinary playback thereafter uses the proxy; dragging and exact
  stepping retain canonical frame identity.
- Hands-on review of the difficult 4K representative.
  Expected: full-player quality and dragging remain acceptable and warm preview audio is clean and
  synchronized. This perceptual gate is reported as awaiting the user until the user exercises it.

### Execution Result

The bounded profile runner completed 27/27 rows without a frame-map, audio, or timing failure: six
full coded-picture fixtures and three 60-second real-media samples, each encoded as GOP 1, 6, and 12.
All healthy sources met the 2 ms relative-presentation-time tolerance. The timestamp-repaired legacy
source retained explicit ordinal identity and stayed within its declared 50 ms monotonic-repair
tolerance. GOP 1 was selected because it had the lowest encode time on every real-media sample and
removes decode-forward work; GOP 6 and 12 primarily saved cache space, which is not the current goal.

The selected full 4K source then prepared 175,400 proxy frames for 175,400 canonical frames and
selected its AC3 stereo source program for AAC proxy audio. A cache-hit Electron journey activated
the review proxy in 1.45 ms, displayed 12/12 rapid drag positions at 7.94 fps with 106.5 ms p95 landing
latency, advanced one exact frame per tap, and captured a canonical range without a player error.
The automated Phase 3B contract passes. The user subsequently accepted the enlarged 960-pixel image
quality and preview audio on the difficult 4K representative, so Phase 3B passes overall. The cold
original-to-proxy visual transition is an informational UX observation, not a blocker or a Phase 3C
gate.

### Rollback/Containment

The selected review profile and clock map are cache-versioned. Reverting the handoff leaves the
existing original-playback plus all-intra exact-review path available without changing canonical
indexes or captured range identities.

## Milestone 5c - Accelerate review preparation

### Scope

After Milestone 5b fixes the artifact contract, compare preparation implementations without
reopening profile or identity decisions. Phase 3C accelerates preparation only; it must not trade
away the accepted review quality, clean preview audio, source-relative timing, or canonical frame
identity.

### Changes

1. Add a platform-neutral encoding backend around the fixed Milestone 5b recipe. The existing
   software FFmpeg CLI implementation remains the default, fallback, and correctness oracle. The
   backend contract owns only proxy encoding; cache publication, BestSource indexing, complete
   ordinal mapping, and validation remain host-owned.
2. Run an adoption gate before implementing wrappers:
   - verify runtime, packaging, licensing, Electron isolation, hardware-device detection, and the
     ability to express the complete selected proxy contract;
   - reject a wrapper early when it only adds a native bridge without solving detection, fallback,
     or reproducible packaging;
   - keep candidate dependencies in isolated folders and invoke native add-ons in a child process so
     a candidate failure cannot terminate Electron.
3. Compare these preparation lanes:
   - current pinned software FFmpeg CLI baseline;
   - `node-av` pinned to an exact package version and isolated behind a worker process;
   - a direct FFmpeg hardware diagnostic as an upper-bound measurement;
   - `ffmpeg-kit` only if the adoption gate finds a maintained, reproducible Windows/Electron path.
4. Preserve the Milestone 5b output contract: Matroska, MPEG-4 Part 2 GOP 1 video at no more than
   960 pixels wide, no B-frames, `yuv420p`, source-relative monotonic presentation times, and selected
   stereo AAC. Commodity hardware encoders do not provide MPEG-4 Part 2 encoding, so hardware
   acceleration may decode and scale the source but the selected software video encoder remains in
   use. Hardware H.264/HEVC output would be a separate profile decision and is outside Phase 3C.
5. Evaluate in bounded stages: generated fixtures, 60-second common H.264 and difficult 4K HEVC
   samples, then a full difficult movie only when the bounded result is both correct and materially
   faster. Stop an acceleration lane after an unsupported device, contract mismatch, or lack of a
   useful bounded speed improvement.
6. In a separate native lane, compare BestSource software indexing with BestSource configured using
   its own `HWDevice`; do not imply that a device owned by another FFmpeg process can be shared. Use
   separate cache identities for software and hardware indexes.
7. Record runtime device detection, per-source compatibility, initialization, fallback, output
   equivalence, dependency pinning, licensing, installed size, cold wall time, and whether the
   accelerated path was actually used rather than merely requested.

### Validation

- Every accelerated proxy is compared against the selected Milestone 5b frame count, sampled pixel
  identity, presentation timeline, audio contract, and canonical-frame map.
- Every unsupported or failed hardware job automatically retries through the software baseline and
  reports both attempts.
- BestSource hardware indexing must return the same canonical identities as software indexing or be
  rejected.
- Automated fault injection proves that a candidate crash, unsupported device, and invalid output
  all select the software fallback without publishing a partial cache entry.
- Build and benchmark output is written to artifact logs. The execution summary retains only command
  status, bounded diagnostics, measurements, and the path to the complete log.

### Stop Rules

- Do not implement `ffmpeg-kit` if its adoption gate finds no maintained Windows x64 Electron-facing
  API or if it merely requires another custom native bridge around the same FFmpeg calls.
- Do not run a full-movie benchmark for a lane that fails the 60-second contract gate or does not
  improve its relevant preparation stage.
- Do not select hardware indexing when any tested requested frame resolves to a different canonical
  identity than the software index.
- Do not make hardware availability a product requirement. The current software path must remain
  functional and independently testable on every supported platform.

### Execution Result

The neutral encoding backend, policy router, partial-output cleanup, and software fallback are
implemented and tested. The isolated pinned FFmpeg 9 QSV runtime is 29.22 MiB. On the accepted
60-second 4K HEVC sample, software took 11,567.7 ms and QSV decode/scale took 6,751.6 ms, a 1.71x
speedup. All 1,552 proxy and BestSource frame counts matched. Relative proxy timestamps were either
identical or differed by one non-accumulating 1 ms Matroska tick; visual similarity measured 51.54 dB
PSNR and 0.9967 SSIM. The common H.264 sample was slower under QSV and remains software-routed.

BestSource hardware indexing was rejected because its pinned H.264 and HEVC decoders do not support
the requested `d3d11va` device. `node-av` 6.1.1 detected the Intel device but its selected pipeline
failed on filter timebase/encoder PTS and installed 412.87 MiB. FFmpegKitNext was not implemented
because it provides no maintained Electron-facing Windows path and would require another custom
bridge around the same FFmpeg calls. Full evidence and reproduction commands are in
`spikes/native-frame-identity-playback/docs/preparation-acceleration-results.md`.

### Rollback/Containment

Each accelerator is a replaceable implementation behind the preparation adapter. The software
recipe selected in Milestone 5b remains the required fallback and independent correctness oracle.

## Milestone 6 - Stress, performance, and cross-platform cost

### Scope

Measure the behavior that unit tests cannot prove: full-movie latency, perceived mode handoff,
memory stability, preview audio, and realistic packaging cost.

### Changes

- File: `docs/bridge-results.md`
  Edit: record hardware/OS, dependency commits, source signature, cold/warm sample counts, p50/p95/max
  stage timings, held-step rate, scrub settlement, CPU/GPU, helper and renderer RSS, index time, and
  proxy time if applicable.
- File: `scripts/run-soak.ps1`
  Edit: automate ten minutes of mixed deterministic play, pause, adjacent/reverse step, random exact
  access, and scrub requests while sampling process memory and queue depth.
- File: `docs/cross-platform-packaging.md`
  Edit: enumerate Windows, macOS, and Linux binaries/plugins, licenses, signatures/notarization,
  architecture variants, expected package-size contribution, update cadence, and which rendering
  callback path is platform-specific. Do not claim another OS works without running it.

### Validation

- Command: `powershell -ExecutionPolicy Bypass -File .\scripts\run-soak.ps1`
  Expected: no crash, stale overwrite, unbounded queue, or monotonic memory leak; all targets are
  printed with pass/fail rather than hidden in raw logs.
- Manual comparison: exercise at least five scripted points and two marked ranges before and after
  reopening the full movie.
  Expected: identical canonical identities and visible pictures.
- If GPU/texture output is recommended, inspect captured pixels and callback timing rather than
  accepting a nonblank window as proof.

### Rollback/Containment

Performance traces and screenshots remain ignored artifacts. Keep only summarized evidence and the
small scripts needed to reproduce it.

## Milestone 7 - Publish the architecture decision

### Scope

Leave a durable result that explains what was tested, what passed, and what should be built next.

### Changes

- File: `docs/spike-results.md`
  Edit: state C1, C2, or neither; provide correctness/coverage/performance tables; explain every
  unsupported signature; distinguish measured facts from inference; and name residual risks.
- File: `docs/playback-architecture-options.md`
  Edit: supersede the previous WebCodecs recommendation. Explain LibVLC, BestSource, direct libav,
  proxy playback, Electron bridge, shared memory, native window, and FFmpeg/WASM by layer and with
  evidence from this spike.
- File: `README.md`
  Edit: provide five-minute run instructions, generated/downloaded paths, cleanup commands, selected
  backend, keyboard map, and links to all reports.
- File: `dependency-manifest.json`
  Edit: finalize exact source/binary versions, hashes, licenses, and source retrieval locations.
- File: `docs/agent-docs/agent-architecture-map.md`
  Edit only if `doc-update` concludes that a production architecture decision is now durable. If the
  result remains experimental, record in this ExecPlan that no canonical architecture update was
  appropriate.
- This ExecPlan
  Edit `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` with the
  actual evidence and skipped conditional milestones.

### Validation

- Command: `npm run verify:reports`
  Expected: every selected representative has a result, dependency pins/hashes are complete, report
  links resolve, and no pass claim lacks raw evidence.
- Command: run the full applicable test/build sequence documented in `README.md` from a clean
  generated-artifact state.
  Expected: a new contributor can regenerate fixtures, build the selected harness/service, run its
  gate, and launch the Electron control without undocumented local files.
- Final goal check: a user can load the full movie in the Electron spike, hear normal playback,
  navigate exact source frames, scrub, capture canonical ranges, and reopen those boundaries on the
  same pictures; or the spike clearly and correctly concludes that no tested backend can do so.

### Rollback/Containment

The entire experiment is isolated under `spikes/native-frame-identity-playback/`. If no candidate
passes, retain the source, manifests, and reports as evidence; do not merge native dependencies or
adapter contracts into production code.
