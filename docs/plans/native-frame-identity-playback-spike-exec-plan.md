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

The spike has two hard decision gates:

1. LibVLC 4 either proves both relative stepping and absolute frame identity, or it does not.
2. If LibVLC fails that exact-frame gate, BestSource must independently prove exact random frame
   access before any fuller Electron control is built.

"Absolute frame identity" means a stable presentation-order frame index carried together with its
integer PTS, rational timebase, and duration or next PTS. A rounded time or `time * fps` is not an
identity.

## Progress

- [x] (2026-08-12 11:42+03:00) Revised feature spec signed off with absolute identity mandatory,
  sequential LibVLC and BestSource gates, and a single-candidate Electron UI.
- [ ] Create the isolated spike skeleton, dependency manifest, and reproducible Windows toolchain
  preflight.
- [ ] Build the deduplicated real-media matrix and deterministic exact-frame fixtures.
- [ ] Implement and run the LibVLC 4 native engine gate; record a C1 pass or C2 provisional decision.
- [ ] If C2 is provisional, implement and run the BestSource native engine gate; stop if it fails.
- [ ] Implement the neutral native-process protocol and selected backend adapter.
- [ ] Build the single-control Electron host and complete range-capture interactions.
- [ ] Measure correctness, latency, resource use, source coverage, and mode handoff in the real app.
- [ ] Publish the final recommendation and update the architecture reference.

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

## Decision Log

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

## Outcomes & Retrospective

Not started. During execution, keep this section current with the selected path, the exact evidence
that justified it, unsupported media, measured latency, deliberate debt, and whether a production
follow-up is warranted.

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

### Hard correctness and performance gates

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

      npm run media:inventory -- --root "D:\tmp\media"
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

- File: `scripts/build-bestsource.ps1`
  Edit: build the pinned BestSource source with Meson `-Denable_plugin=false`, pinned vcpkg FFmpeg and
  xxHash dependencies, and the upstream libp2p wrap. Set an explicit install prefix under `.deps/`.
  Record resolved library versions and licenses.
- Files under `native/bestsource-gate/`
  Edit: construct `BestVideoSource` directly, set an explicit cache limit and decoder count, expose
  `GetFrame(N)` plus `GetFrameInfo(N)`, and copy/normalize the returned `AVFrame` without leaking its
  lifetime. Keep PTS/timebase/duration as integers.
- File: `native/bestsource-gate/operation_runner.*`
  Edit: run sequential forward/reverse frame-number requests, alternating direction, random plus
  neighboring frames, repeated frame, start/end, persistent-index reopen, malformed input, and
  cancellation/progress cases. Use the identical oracle and source classifications from Milestone 1.
- Files under `native/direct-libav-baseline/`
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

### Rollback/Containment

BestSource, FFmpeg libraries, indexes, and build products remain under ignored `.deps/`, `build/`,
and `artifacts/`. If the gate fails, do not implement Milestones 4 through 6. Complete Milestone 7's
reports with the blocking evidence and propose a new architecture separately.

## Milestone 4 - Define and measure the Electron bridge

### Scope

Run only after C1 or C2 passes. Expose the selected native behavior through one platform-neutral,
versioned protocol and measure copies before adding polished interactions.

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

## Milestone 5 - Build the single playback and range-capture control

### Scope

Create the actual Electron experience used to judge C1 or C2. It must show one solution, not a
candidate comparison page.

### Changes

- Files: `electron/main.cjs`, `electron/preload.cjs`
  Edit: create a context-isolated Electron window, secure file picker, native service lifecycle, and
  transferable frame channel. Keep `nodeIntegration` disabled and expose only the narrow adapter API.
- Files under `src/ui/`
  Edit: implement one video viewport, compact transport controls, speed selector (`0.25x`, `0.5x`,
  `1x`, `2x`), `+1`/`+10` step selector, timeline scrubber, current source-frame identity, optional
  keyboard legend, current range panel, and captured ranges panel. Use stable control dimensions and
  the existing visual conventions where applicable.
- File: `src/ui/keyboard-controller.ts`
  Edit: left/right step by the selected amount while paused, with bounded continuous repetition while
  held; Space toggles play/pause; `q`, `w`, and `a` implement the signed-off range flow. Ignore these
  shortcuts while typing in an editable element.
- File: `src/model/range-capture-model.ts`
  Edit: store start/end as canonical identities, reject missing/reversed ranges visibly, lock a valid
  draft, allow the specified immediate unlock, and start a new draft on the next `q` or `w`.
- File: `src/adapter/hybrid-playback-adapter.ts` when C2 is selected
  Edit: present normal playback and exact-frame access as modes of one adapter. Pause and capture the
  current canonical frame before showing exact mode; resume from that frame's exact PTS. Keep one
  viewport and make handoff state observable for tests.
- Tests under `tests/unit/`, `tests/integration/`, and `tests/e2e/`
  Edit: cover shortcuts, held keys, mode handoff, scrub latest-wins behavior, playback rates, range
  validation/locking/unlocking, source reload, helper failure, and visible error states.

### Validation

- Command: `npm run typecheck; npm test; npm run e2e`
  Expected: all unit/integration/Electron tests pass. Deliberately breaking expected frame identity or
  stale-response rejection makes the relevant test fail with an understandable message.
- Manual QA in the actual Electron app:
  load deterministic CFR/VFR fixtures, a difficult representative, and the full movie; play with
  audible audio, change speeds, scrub slowly and rapidly, hold left/right in both step modes, mark
  valid/invalid ranges, switch play/exact mode if C2, stop, reopen, and repeat a saved boundary.
  Expected: one coherent control, no side-by-side candidate UI, no stale frame flash, and range
  boundaries reopen on the same burned-in pictures.

### Rollback/Containment

UI code consumes only `FramePlaybackAdapter`. A failed native path can be removed without changing
range rules; a failed UI experiment can be removed without changing native gate evidence.

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
