# Native Frame-Identity Playback Spike

This isolated experiment tests whether LibVLC 4 can provide broad playback support and a canonical
source-frame identity. It implements the signed plan in
`../../docs/plans/native-frame-identity-playback-spike-exec-plan.md`.

Milestones 0 through 7 are complete, including the accepted 3b and 4b amendments. The spec calls
Milestones 5b and 5c Phase 3B and Phase 3C respectively. LibVLC C1 failed the mandatory identity
gate, and the original immediate-readiness BestSource C2 gate failed its indexing and warm-access
targets. The amended prepared-review C2 gate passed. The neutral native protocol and Electron bridge are now measured,
and the single C2 playback/range control passes automated Electron journeys. The user accepted
full-player proxy image quality and clean preview audio. Milestone 6's fixed-build ten-minute soak
passed 199 mixed cycles, and Milestone 7's clean build, 126 tests and final report verification pass.
This is a Windows x64 POC, not a shipped cross-platform component. M4b proved
viewport-sized frames as the binary-bridge remediation. The subsequent full-player scrub experiment
replaces the discarded thumbnail path with a cached 960-pixel all-intra display proxy whose frame ordinals are
validated against the canonical BestSource index. Full-player dragging delivered all scripted
positions at 7.45-7.80 displayed fps after preparation; cold proxy encoding/indexing ranged from about two
to 26 minutes on the measured full movies, excluding original-source indexing. Phase 3C adds a conditional QSV decode/scale path for
large HEVC sources; its 1.71x bounded encode speedup is not a measured full-movie preparation speedup.
Shared-pass indexing/proxy creation is a [deferred future experiment](../../docs/plans/shared-pass-review-preparation-exec-plan.md),
not a prerequisite for POC closeout. The cold source-to-proxy transition is also non-blocking.
See the
[final decision](docs/spike-results.md), [architecture diagram](docs/architecture-diagram.md),
[integration handoff](docs/frame-scrub-supporting-player-control-integration-handoof.md), [stress results](docs/bridge-results.md),
[architecture options](docs/playback-architecture-options.md), [cleanup record](docs/cleanup-results.md),
[LibVLC report](docs/libvlc-gate-results.md), [BestSource report](docs/bestsource-gate-results.md),
[BestSource failure analysis](docs/bestsource-failure-analysis.md),
[remediation matrix](docs/bestsource-remediation-results.md),
[prepared-review gate](docs/bestsource-preparation-gate-results.md),
[sampled cache-signature results](docs/cache-signature-results.md),
[Electron bridge results](docs/electron-bridge-results.md),
[M4b viewport/debounce results](docs/electron-bridge-m4b-results.md),
[Electron control results](docs/electron-control-results.md),
[all-intra proxy results](docs/all-intra-proxy-results.md),
[unified review-proxy profile results](docs/review-proxy-profile-results.md),
[preparation acceleration results](docs/preparation-acceleration-results.md),
[shared-ring experiment](docs/electron-shared-ring-results.md),
[POC feature suggestions](docs/poc-feature-suggestions.md), and
[representative media matrix](docs/media-matrix.md).

The selected revised contract permits ordinary playback while exact review prepares visibly in the
background. Healthy sources use the original movie for the canonical BestSource index. Sources with
no PTS-usable key packets receive a timestamp-normalized stream-copy review asset plus one index.
MPEG-4 Part 2 uses Matroska; the H.264-in-AVI case uses NUT to preserve packet framing and the complete frame map.
Both paths also prepare the mapped display proxy and its separate BestSource index. Once ready,
LibVLC plays that proxy, while exact review reports identities from the canonical source index.

## Setup

### Existing checkout: try it now

From this directory, `npm run control:start` rebuilds the control/helpers and opens the Electron
page. With the existing dependencies and prepared caches this is the short path, not a fresh
machine installation. Open one of these previously measured sources:

- `media-005`: a common H.264 source (the exact path is in `docs/closeout-evidence.json`'s coverage
  entry by filename, or `artifacts/media-inventory.json` by full path).
- `media-017`: Dizengoff 99, the normalized H.264-in-AVI case.
- `media-035`: Point Break 4K HEVC, the slowest measured preparation case and the ten-minute soak
  target. The proxy keeps warm review responsive; its cold preparation is not a five-minute task.

### Fresh Windows x64 setup

Prerequisites are Node.js 22+, npm, Git, Python available as `python`, CMake 3.25+, Visual Studio C++ x64 tools, and the Cygwin
MinGW x64 compiler at `C:\cygwin64\bin\x86_64-w64-mingw32-g++.exe` (measured version 11.4.0).
The current build scripts assume that Cygwin layout. Use a repository path without spaces for the
vcpkg FFmpeg build. This is a documented Windows developer setup, not a portable installer.

Put a **full FFmpeg/FFprobe CLI pair on PATH** before bootstrap. Fixture generation requires
`libx264`, `ffv1`, and `mpeg2video` encoders. The smaller linked FFmpeg 9 runtime deliberately does
not contain `libx264`; it cannot replace this fixture-only tool. Bootstrap resolves the PATH
executables and records their paths/versions under `.deps/resolved-dependencies.json`. The test
oracle reads the burned frame codes, so fixtures are regenerated and verified rather than assumed
bit-identical across arbitrary fixture-encoder builds. The closeout build log records the local
tool versions; no external movie is needed for the generated-fixture checks.

Run from this directory in PowerShell:

```powershell
npm ci
./scripts/preflight.ps1
./scripts/bootstrap-native.ps1 -InstallMissing
./scripts/verify-libvlc-api.ps1
./scripts/bootstrap-bestsource.ps1
npm run control:build
```

Downloaded dependencies and native build outputs stay under `.deps/` and `build/` and are ignored.
The bootstrap verifies the pinned VLC archive before extracting it.
Native source archives are pinned by commit or by the pinned vcpkg port's SHA-512 in
`dependency-manifest.json`; Electron and JavaScript packages are fixed by `package-lock.json`.
The optional Phase 3C QSV runtime has its own bootstrap recipe in
[preparation acceleration](docs/preparation-acceleration-results.md). Software fallback works
without that optional runtime; do not substitute accelerated DLLs into BestSource's linked stack.

## Reproduce Milestones 1-2

From this directory, after setup:

```powershell
npm test
npm run typecheck
npm run native:test
npm run fixtures:generate
npm run fixtures:verify
node ./scripts/inventory-media.mjs --media-root "D:\tmp\media"
npm run gate:libvlc
```

The gate writes the committed summary under `docs/` and ignored per-operation evidence under
`artifacts/`.

`media-scope.json` defines corpus paths that are intentionally outside the product target. The
inventory excludes them before grouping material signatures or choosing representatives.

## Reproduce Milestone 3

Bootstrap the pinned MinGW, FFmpeg, dav1d, xxHash, libp2p, and BestSource stack, then build the
native gate:

```powershell
./scripts/bootstrap-bestsource.ps1
./scripts/build-bestsource-gate.ps1
```

The complete clean-index matrix can take well over an hour and deliberately gives each full movie
up to 30 minutes to index:

```powershell
npm run gate:bestsource:cold
```

After a clean run, recheck every available persistent index without rebuilding it, or regenerate
the Markdown report from the latest raw evidence:

```powershell
npm run gate:bestsource:warm
npm run report:bestsource
```

Reproduce the five-source remediation study. The runner checkpoints after every source/level; use
`--resume` after interruption. Generated derivatives remain under ignored `.deps/` storage.

```powershell
node ./scripts/run-bestsource-remediation.mjs --reset
node ./scripts/run-bestsource-remediation.mjs --resume
node ./scripts/run-bestsource-remediation.mjs --render-only
```

## Reproduce Milestone 3b

Build the native harness, classify all current representatives without rebuilding healthy indexes,
then run the clean targeted preparation set:

```powershell
npm run build:bestsource-gate
npm run gate:bestsource:preparation:policy
node ./scripts/run-bestsource-preparation-gate.mjs --profile targeted --reset
```

The targeted runner checkpoints after every source. Use `--resume` after interruption. Once the cold
run is complete, one resume performs a fresh packet validation and proves that normalization and
full indexing are skipped for every valid cache entry. The held profile then runs the paced
five-second forward/reverse evidence without repeating source scans:

```powershell
node ./scripts/run-bestsource-preparation-gate.mjs --profile targeted --resume
npm run gate:bestsource:preparation:held
npm run report:bestsource:preparation
```

Generated preparation media, indexes, and manifests are under `.deps/prepared-review-cache/`.
Ignored raw/checkpoint evidence is under `artifacts/`; the reviewable summary is
`docs/bestsource-preparation-gate-results.md`.

The cache-reopen path now uses the selected deterministic 3+3+3x1-minute sampled packet signature.
Reproduce the comparison against the original full scan and the proposed 5+5+5x1-minute profile:

```powershell
npm run benchmark:cache-signature
```

## Reproduce Milestone 4

Build both native services, compile the TypeScript adapters, and run protocol/process integration
tests:

```powershell
npm run native:build
npm run build:bestsource-gate
npm run bridge:test
```

Run the visible Electron benchmark over the 720p, 1080p, and 4K representatives:

```powershell
npm run bridge:benchmark
```

The shared-ring mode deliberately reproduces the Electron 37 structured-clone blocker documented
in `docs/electron-shared-ring-results.md`:

```powershell
node ./scripts/run-bridge-benchmark.mjs --target media-017 --transport shared-ring
```

## Reproduce Milestone 4b

Run a warmed full-resolution baseline followed by the viewport-sized, 100 ms scrub-debounce
variant. The command applies preview fitting to every source by dimensions, preserves aspect ratio,
and never upscales a smaller source:

```powershell
npm run bridge:benchmark:m4b
```

The M4b report compares both runs. Source-frame identity remains attached to the original decoded
frame; only the RGBA preview crossing the Electron bridge is reduced.

## Run Milestone 5

Build the native services and launch the single Electron control:

```powershell
npm run control:start
```

Use **Open movie** to select a source. Ordinary LibVLC playback is available immediately. The exact
frame controls, full-player drag scrubbing, and q/w/a range capture become available after the
visible canonical-index and display-proxy preparation completes or its caches reopen. The player
primes a muted first frame and remains paused after opening. Dragging the timeline displays
progressive proxy frames in the main viewport. Releasing it resolves the exact canonical frame,
seeks the active playback asset using its mapped time, and starts playback; a processing overlay
remains visible until that handoff completes. Space toggles playback; left/right step one frame at a
time, repeating at about 6.7 frames per second while held; `q`, `w`, and `a` mark start, mark end, and
lock/unlock the range.

Run the automated CFR smoke journey, or target a prepared representative by ID:

```powershell
npm run control:smoke
node ./scripts/run-control-smoke.mjs --target fixture-vfr-ffv1
node ./scripts/run-control-smoke.mjs --target media-005
node ./scripts/run-control-smoke.mjs --target media-017
node ./scripts/run-control-smoke.mjs --target media-035
```

The smoke runner exercises the opening frame, progressive full-player proxy dragging, final exact
release, pre-play seek, release-to-play handoff, Space pause, exact one-frame tap and paced held
stepping, range locking, rate changes, source reload, and exact-to-playback resume. It also asserts a
complete canonical/proxy frame-count match and that the removed thumbnail elements are absent. It
writes ignored JSON and screenshot evidence under `artifacts/`.

## Closeout verification

On the prepared Windows checkout, run these **sequentially**. Do not benchmark while rebuilding
native libraries or running another media workload. Native outputs are rebuilt from source;
fixture generation overwrites all generated fixture movies and oracles. Keep expensive source
indexes/proxies and pinned dependency downloads, which are not build outputs.

```powershell
./scripts/run-native-cmake.ps1 -Action test -CleanFirst
npm run build:bestsource-gate
npm run fixtures:generate
npm run fixtures:verify
node ./scripts/run-bestsource-gate.mjs --fixtures-only
npm test
npm run typecheck
npm run build:bridge
node ./scripts/run-control-smoke.mjs --target fixture-vfr-ffv1
node ./scripts/run-control-smoke.mjs --target media-035
./scripts/run-soak.ps1 -Target media-035 -Seconds 600
npm run verify:reports
```

The movie-specific smoke/soak and historical raw-report verification require the local media
corpus/caches. The fixture smoke prepares itself without those movies; some integration tests also
use the preparation evidence in `artifacts/bestsource-preparation-raw.json` and skip if it is absent.
Check the skipped-test count on a new machine. To reconstruct that evidence, run the documented
Milestone 3b gate with the corpus available. For a checkout without large ignored raw artifacts,
`node ./scripts/verify-reports.mjs --archived` validates the retained summary, pins and links only; it does
not claim to have rerun the measurements. After deliberately rerunning a historical gate, review
its results and use `node ./scripts/verify-reports.mjs --refresh` to update evidence digests. The
direct Node commands avoid this host's `npm.ps1` shim consuming forwarded `--` options. The
fixture-only native gate writes `docs/bestsource-fixture-results.md` without replacing the
historical full-media report, and needs no media inventory.

The full ten-minute journey mixes playback/rate changes, exact random landings, adjacent/reverse
steps, held stepping, rapid drag bursts and Space pause. It compares five frame identities and
canvas-pixel hashes and two captured ranges across reopen, while sampling queues and Windows
process memory/CPU. See [stress results](docs/bridge-results.md),
[final decision](docs/spike-results.md), [architecture options](docs/playback-architecture-options.md),
[architecture diagram](docs/architecture-diagram.md), [integration handoff](docs/frame-scrub-supporting-player-control-integration-handoof.md),
and [packaging costs](docs/cross-platform-packaging.md).

## Cleanup

MS7 removed the rejected node-av sandbox, stale package copies, and obsolete diagnostic tooling
and derivatives, totaling 10.98 GiB of listed logical file sizes. Active runtimes and prepared
review caches were preserved. See [cleanup record](docs/cleanup-results.md). The safe allowlist
can be inspected with `./scripts/cleanup-rejected-candidates.ps1` and applied with `-Apply`.

For a **deliberate complete reset**, stop the player/builds first:

Delete `.deps/`, `build/`, `node_modules/`, generated fixtures, and JSON artifacts to remove all
spike outputs. To reset only Milestone 3b, remove `.deps/prepared-review-cache/` and the
`artifacts/bestsource-preparation-*` files. Display proxies are cached separately below
`.deps/prepared-review-cache/proxies/`; removing that directory forces proxy regeneration without
discarding the canonical preparation cache. No production application dependency or source file is
changed by this spike.
