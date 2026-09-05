# Share Source Decoding Between Indexing and Proxy Creation

Status: deferred future experiment, documented at the user's request on 2026-08-30. This is not
authorization to implement it and it is not a blocker for the current playback POC. Reconfirm
scope, dependency pins, and acceptance targets before execution.

## Why this matters

The current player already provides satisfactory full-player scrubbing, exact stepping, and clean
preview audio after preparation. The remaining optimization opportunity is the wait on a first
load. Cold preparation currently decodes the full-resolution source once for the BestSource index
and again to create the smaller review proxy. Sharing those decoded pictures could remove one
expensive decode without changing the review experience or sacrificing exact source-frame identity.

The user-visible goal is: a newly opened movie becomes exact-review-ready sooner, while showing the
same pictures, playing the same audio, and capturing the same source-frame boundaries as today.
There is no measured speedup for this proposal yet, and no promise of a twofold improvement.

## Progress

- [x] (2026-08-30) Inspected the pinned BestSource indexing loop and current preparation services;
  recorded this separate, deferred plan without changing runtime code.
- [ ] Obtain execution approval and refresh the separate-pass baseline.
- [ ] Prove a no-op and frame-observing indexing hook without changing BestSource results.
- [ ] Produce the accepted proxy from the same software-decoded source frames.
- [ ] Prove cache, cancellation, fallback, and Electron behavior through a combined preparation job.
- [ ] Optionally compare compatible hardware decoding and GPU-side resizing.
- [ ] Publish measurements and an adopt, source-conditional adopt, or defer recommendation.

## Skill Gates

Planning guidance applied: repository `coding-quality.md` and `PLANS.md`,
`api-and-interface-design` for the frame-consumer and preparation boundaries,
`build-deploy-and-tooling` for a reproducible isolated BestSource patch,
`error-and-correctness-traps` for timestamps, frame ownership, bounded queues, and cancellation,
`testing-discipline` for the identity and performance gates, `working-with-users-and-team` for the
deferred scope, and `doc-update` plus `pre-commit-self-review` for documentation/status review.

Before implementation, reapply those skills and `using-97`. Use `using-git-worktrees` in accordance
with the user's checkout instructions; do not move or overwrite their existing spike. Apply
`before-you-refactor` before changing preparation orchestration, `security-and-trust-boundaries`
before process/path handling, and `observability` before adding job diagnostics. Use
`bugfix-by-failing-test` for any regressions found. Use `libvlc` only if playback integration actually
changes. All of these skills are currently available; recheck availability when resuming.

## Surprises & Discoveries

- BestSource's `BestVideoSource::IndexTrack` already visits every decoded picture, records its PTS,
  flags, format, dimensions, and pixel hash, then frees the picture. Its public progress callback
  supplies track and byte progress, not the decoded picture. A frame-consumer hook is a proposed
  extension, not an existing API.
- Some timestamp repairs occur after BestSource's indexing loop. A callback cannot assume that its
  raw PTS is already the finalized canonical timeline.
- Hardware-mode `LWVideoDecoder::DecodeNextFrame` downloads the full frame before returning it.
  Adding only an indexing hook does not automatically retain a GPU surface for GPU-side resizing.
- The current proxy encoder accepts an already completed canonical result, including frame count.
  A true shared pass must begin earlier in preparation; replacing that encoder alone is insufficient.
- Phase 3C did not benchmark accelerated BestSource indexing: its linked FFmpeg libraries rejected
  the requested hardware device before indexing. The separate QSV-enabled FFmpeg executable does
  not accelerate those libraries. Hardware indexing remains an open experiment.

Evidence: pinned BestSource commit `825af4e691524a3c98383d0cfe7d85b4142005cc`, specifically
`src/videosource.cpp` (`IndexTrack`, `DecodeNextFrame`), `src/videosource.h`, and `src/bsshared.h`;
the preparation files listed below; and the
[Phase 3C report](../../spikes/native-frame-identity-playback/docs/preparation-acceleration-results.md).

## Decision Log

- Decision: park this optimization independently of the current POC closeout.
  Rationale: the user accepts current playback, scrub, and audio behavior and can tolerate preparation.
  Date/Author: 2026-08-30 / user and Codex.
- Proposed decision: let BestSource own source decoding/indexing and expose a narrow frame consumer;
  let a separate native encoder own proxy output. Start with software decoding.
  Rationale: retain BestSource's frame-index and verified-seeking behavior while isolating the benefit
  of eliminating duplicate decoding from hardware integration changes.
  Date/Author: 2026-08-30 / Codex; subject to future execution approval.
- Proposed decision: retain proxy indexing and the current two-index cache model.
  Rationale: the source index identifies original positions; the proxy index locates different,
  lossy-encoded pictures. These indexes are not interchangeable.
  Date/Author: 2026-08-30 / Codex.

## Outcomes & Retrospective

Documentation only. No hook, native encoder, shared-pass benchmark, or product integration has been
implemented. No current cache or dependency was changed. The existing software path and conditional
QSV proxy path remain the accepted implementation. The current POC is tracked separately in the
[native playback execution plan](native-frame-identity-playback-spike-exec-plan.md).

## Context and orientation

All paths below are relative to `spikes/native-frame-identity-playback/`, unless stated otherwise.
Use PowerShell from that directory for the commands. Run `npm ci` and follow `README.md` for native
setup before rebuilding. Do not replace established caches to create a benchmark baseline.

An original source is the user's movie. A canonical review asset is that source, or an accepted
timestamp-normalized stream-copy derivative when container repair is required. Stream-copy changes
packaging/timestamps without re-encoding the pictures. A canonical ordinal is the global position
of a decoded source picture, not an estimate made by multiplying time by frame rate.

A display proxy is a lower-resolution encoded movie used for responsive review. Its frame N must
represent canonical frame N. BestSource's source index stores source identities and its separate
proxy index enables fast access to proxy pictures. PTS means presentation timestamp; its integer
value and rational timebase together describe when a picture appears. VFR means those picture
intervals can vary. A frame hash is a fingerprint of decoded pixels, not a unique movie position.

Current cold flow:

    preflight and optional timestamp normalization
        -> decode canonical asset and build source index
        -> decode canonical asset again, resize, encode proxy and normalized audio
        -> decode the small proxy and build proxy index
        -> validate mapping, publish caches, enable exact review

Relevant current files:

- `electron/main.cjs`: `prepareExactReview` runs canonical preparation followed by proxy preparation.
- `src/preparation/interactive-preparation.mjs`: `InteractivePreparationService` owns source cache,
  preflight/normalization, and source indexing through the native harness.
- `src/preparation/preparation-coordinator.mjs`: phase ordering and readiness transitions.
- `src/preparation/all-intra-proxy-preparation.mjs`: proxy profile, timing/audio recipe, proxy cache,
  encoding, proxy indexing, and complete ordinal/timeline validation.
- `src/preparation/review-proxy-encoder.mjs`: current CLI encoder, policy routing, and fallback.
- `src/preparation/preparation-cache.mjs`: preparation workspace and publication rules.
- `native/bestsource-gate/bestsource_gate.cpp`: existing BestSource probe and timeline evidence.
- `scripts/bootstrap-bestsource.ps1`, `scripts/build-bestsource-gate.ps1`, and
  `dependency-manifest.json`: pinned native stack and reproducible build conventions.
- `.deps/bestsource-source/src/videosource.cpp`: generated checkout of the pinned upstream source.
  Store any new patch in tracked files, never only in this generated directory.

## Proposed solution

Keep the existing preflight/normalization policy, then decode the canonical asset once. For each
decoded picture, BestSource records its source-index entry and a native consumer receives the same
picture plus ordinal/timing metadata to resize and encode it into the proxy. After source indexing
and encoding finish, index the finished proxy and validate the complete map before exact-ready.

    canonical decoded frame N
        +-> unchanged source-index entry and source-frame hash
        +-> scale/convert -> proxy encoder -> proxy frame N
    finalized source timeline + finished proxy index -> verified mapping

The first implementation should use one native helper linked against one compatible FFmpeg stack.
Do not send full-resolution frames through Electron, JavaScript, or JSON. A raw-video pipe to a
second FFmpeg process would also need a separate timing protocol for VFR; it is not the initial
approach. Opening the source separately for audio is allowed, provided it does not decode video
again. This is one source-video decode pass, not literally one file read or one total decode pass.

Keep the selected `mpeg4-gop1-q5-960-source-clock-aac-v1` artifact contract: Matroska; MPEG-4 Part 2
at quality value 5, GOP 1 (each encoded picture independently accessible), no B-frames, at most
960 pixels wide without upscaling, `yuv420p`; source-relative monotonic timing at 60,000 ticks per
second; one selected AAC stereo program at 192 kbps/48 kHz, or no audio when the source has none.
Retain the current audio-selection, timestamp-repair, rotation, and color behavior. Do not introduce
a new codec, frame-rate conversion, tone-mapping policy, or different canonical frame space here.

### Ownership and correctness

The hook should expose a read-only borrowed frame, source ordinal, integer PTS, rational timebase,
duration when known, and relevant format metadata. Its lifetime ends when the synchronous call
returns. It must not alter the frame BestSource hashes. Start synchronously with no frame queue;
if profiling justifies overlap later, use retained FFmpeg frame references and an explicit small
memory/queue limit. Backpressure must slow decoding, not discard pictures.

Design the interface around three concrete callers before fixing its signature: ordinary indexing
with no consumer, a test consumer checking ordinals/pixels, and a proxy encoder that can fail or be
cancelled. The consumer must not call back into BestSource frame seeking during construction.

Propagate ordinal N through the encoder bookkeeping and record output correspondence after draining
the encoder. Equal frame counts alone cannot prove that no frame was duplicated or reordered.
Keep integer/rational timestamp arithmetic and validate against BestSource's finalized timeline.
Initially restrict the shared route to supported, valid timing; missing or retrospectively repaired
PTS must trigger the established separate-pass fallback unless equivalent timing handling is proved.
Never fabricate exact identity from FPS or silently drop frames to make timestamps acceptable.

### Cache and failure behavior

A combined job is a preparation operation, not merely a new implementation of the current
already-indexed proxy encoder. Extend orchestration only after the native experiment passes.

- Both source index and proxy valid: reuse both; do not run the hook or encoder.
- Source index valid but proxy absent: use ordinary proxy generation without rebuilding the source
  index merely to obtain callback pictures. BestSource will not emit indexing callbacks on a hit.
- Cold source and proxy: eligible for the combined job after preflight/normalization.
- Failure or unverifiable output: publish no invalid proxy/map; clean only this attempt's temporary
  files and use the established separate-pass path. Do not retry after user cancellation.
- An independently validated source index may be retained after proxy failure, but exact-ready still
  requires the complete proxy and map. Otherwise discard the attempt as a unit.

Version the patch, FFmpeg/BestSource build, decoder backend/options, timing/mapping contract, and
proxy recipe in compatibility metadata. Preserve the accepted sampled source-signature policy.
Do not reuse hardware- and software-derived source hashes interchangeably. A successful hardware
route must prove stable ordinal/timing identity and compatible subsequent exact retrieval, not
assume decoded pixels are bit-identical across decoders.

## Proposed solution approach

Proceed from baseline measurement to a frame-observer hook, then software proxy encoding, then
end-to-end cache/UI verification. Hardware is a separate optional extension, not a prerequisite.
Keep each stage independently rejectable and preserve the working separate-pass path throughout.

When subagents are available, delegate reproducible builds, test execution, and bounded measurement
runs to a simpler model. The primary agent owns the frame-identity design and reviews their evidence.
Do not run competing performance measurements concurrently. Keep compiler/decoder output in ignored
logs and return only commands, exit status, summary metrics, and relevant failures to the main task.

## Milestone 0 - Freeze the baseline and measurement contract

### Scope

Separate two questions: does sharing decode work help, and does hardware help that combined route?
No player behavior changes in this milestone.

### Changes

Create `scripts/run-shared-pass-gate.mjs` and `docs/shared-pass-preparation-results.md`. The runner
must support the proposed commands below, write bounded JSON summaries plus full ignored logs, and
use dedicated caches under `.deps/shared-pass-experiment/`. Record pins, source signatures, actual
sample durations/frame counts, CPU/GPU/driver details, and stage timings.

Use all existing deterministic valid fixtures and the malformed fixture, then bounded samples of
`media-005` (common H.264), `media-017` (legacy/repair case), and `media-035` (difficult 4K HEVC).
Resolve paths from the existing representative manifest; preserve `media-scope.json` exclusions.
Do not rescan or decode the entire media collection. Extend the deduplicated set only for missing
timing, repeat-picture, rotation, or format-change behavior needed by this experiment.

### Validation

New command, available only after this milestone's runner is implemented:

    node ./scripts/run-shared-pass-gate.mjs --profile baseline --targets media-005,media-017,media-035 --duration 60 --repetitions 3

Compare separate software indexing plus software encoding, and separate software indexing plus the
currently selected conditional-QSV encoding. Run serially and alternate order. Record fresh
application-cache runs separately from filesystem warmth; do not label warm disk reads as cold I/O.
Report elapsed time to exact-ready, not just encoder time. Include source indexing, source decoding,
hashing, resize/encode, audio, proxy indexing, validation, memory, and bytes transferred where measurable.

### Rollback/Containment

Measurements only. Use dedicated destinations and preserve all current prepared media.

## Milestone 1 - Prove a narrow BestSource frame hook

### Scope

Show that an observer can consume each indexing picture without changing source identities.

### Changes

Create a tracked patch at `patches/bestsource/index-frame-consumer.patch`, an isolated bootstrap
`scripts/bootstrap-shared-pass.ps1`, and native test/helper files under `native/shared-pass/`.
Apply the patch to a separate pinned checkout and install under `.deps/shared-pass-experiment/`;
do not overwrite the current BestSource DLLs. Verify patch application against the exact commit.
Add native tests for disabled, observing, cancelling, and failing consumers. The test runner must
expose the `hook` profile and fail clearly on malformed input or ordinal mismatch.

### Validation

    powershell -ExecutionPolicy Bypass -File ./scripts/bootstrap-shared-pass.ps1
    node ./scripts/run-shared-pass-gate.mjs --profile hook --fixtures-only

For the same software decoder/options, require identical complete source-index frame counts,
ordinals, finalized timing, and hashes with/without the observer. Confirm frame ownership under a
native memory diagnostic tool, cancellation cleanup, and no reentrant frame request. Do not declare
success solely from a callback invocation count. The disabled hook must preserve normal indexing.

### Rollback/Containment

Keep the extension optional and the original build usable. Stop if the change requires rewriting
BestSource's seek-matching or frame-index algorithm. Document upstreamability and maintenance cost.

## Milestone 2 - Encode the accepted proxy during indexing

### Scope

Generate both source index and proxy video from one software source decode, then validate the proxy.

### Changes

Implement a focused native proxy encoder and coordinator in `native/shared-pass/`, using the same
FFmpeg library versions as the patched BestSource helper. Add audio-only normalization and muxing
without another video decode. Reuse the declared profile and timeline/mapping rules rather than
creating a second implicit definition. Extend the runner with the `shared-software` profile.

Keep source index construction, scaling/encoding, and job coordination separate. Retain the final
proxy-index pass. Handle decoder/encoder drain, first/last frames, VFR, nonzero start times, and
timestamp repair explicitly. Report unsupported timing as fallback, not a passing approximate result.

### Validation

    node ./scripts/run-shared-pass-gate.mjs --profile shared-software --fixtures-only
    node ./scripts/run-shared-pass-gate.mjs --profile shared-software --targets media-005,media-017,media-035 --duration 60 --repetitions 3

Prove the source video is decoded only once in the combined operation through stage diagnostics.
Require complete source-index equality against the same-decoder baseline and recover every fixture's
burned-in frame identity from the proxy. Check complete ordinal/timing maps, distinguish source
hashes from lossy proxy pixels, and compare real-media proxy quality against the accepted profile.
Use the existing quality/timing gates; never relax them because the new path is faster.

Verify the selected audio program, channel/rate/codec contract, duration, and beginning/middle/end
synchronization. Inject encoder failure and cancellation to prove no partially mapped output passes.

### Rollback/Containment

No Electron adoption yet. A failed or unhelpful shared-software route leaves existing preparation
unchanged. Keep any unsupported-source classification in the result, not hidden in averages.

## Milestone 3 - Prove end-to-end preparation and cache behavior

### Scope

Integrate only a passing native route behind an opt-in combined preparation operation and measure
the actual wait until the existing control becomes usable.

### Changes

Create `src/preparation/shared-pass-preparation.mjs` for combined-job orchestration. Adapt
`interactive-preparation.mjs`, `preparation-coordinator.mjs`, and `all-intra-proxy-preparation.mjs`
only where needed to reuse existing preflight, cache, profile, and mapping responsibilities.
Wire selection in `electron/main.cjs` without changing the renderer/playback adapter or range model.
Add preparation integration tests and the runner's `integration` and `full-movies` profiles.

Use an explicit opt-in configuration during the experiment. Ordinary playback stays available
during preparation, progress identifies the combined work, and q/w/a plus exact scrubbing remain
disabled until validation completes. Retain the existing separate path for cache hits, unsupported
timing, and bounded automatic fallback.

### Validation

    npm test
    npm run typecheck
    node ./scripts/run-shared-pass-gate.mjs --profile integration --fixtures-only
    node ./scripts/run-shared-pass-gate.mjs --profile full-movies --targets media-005,media-017,media-035 --repetitions 3

The runner must exercise the opt-in path and existing control smoke journey. Verify cold load,
both-cache hit, source-index-only hit, cancellation/source switch, truncated media, encoder failure,
and failed publication. Reopen at five fixed movie positions and both ends of two locked ranges;
identities and visible content must agree. No actual clip extraction is added by this experiment.

Measure CPU/GPU use where available, total native/renderer memory, time to exact-ready, and cached
scrub/step latency. Queue memory must remain explicitly bounded; normal index metadata growth with
frame count must be distinguished from a pixel-buffer leak. Time full movies only after fixtures and
bounded probes pass, on an otherwise quiet machine. No unscheduled overnight automation is implied.

### Rollback/Containment

Turn off the opt-in route to restore existing behavior. Preserve valid prior cache entries. Treat
partial output as this attempt's data, never as a reason to delete a user's source or shared cache.

## Milestone 4 - Optional hardware extension

### Scope

Only after the software shared path is understood, evaluate hardware without confounding the
duplicate-decode comparison. This stage may be skipped with an explicit recorded reason.

### Changes

Build a separate compatible BestSource/FFmpeg stack with a working hardware decoder and run its
identity gate before timing it. Extend the native helper and runner's `shared-hardware` profile.
First measure hardware decode with full-frame download and CPU resizing. Only if transfer/scaling
is a measured bottleneck, add a deeper decoder hook retaining the GPU frame for GPU-side resizing.

The latter path branches one decoded GPU picture: full-resolution download for BestSource hashing,
and GPU resize plus small download for the existing CPU MPEG-4 encoder. Budget retained hardware
surfaces and avoid GPU pool exhaustion. No hardware H.264/HEVC output or GPU hashing is included.

### Validation

    node ./scripts/run-shared-pass-gate.mjs --profile shared-hardware --fixtures-only
    node ./scripts/run-shared-pass-gate.mjs --profile shared-hardware --targets media-005,media-035 --duration 60 --repetitions 3

Compare the same source/recipe across separate-selected, shared-software, and shared-hardware.
Check frame identity, stable reopen/seeking with the selected backend, visual quality, timing, audio,
memory, transfer volume, and total preparation time. Validate missing/unsupported device fallback.
An unavailable decoder is a build/capability failure, not evidence of poor indexing performance.
Claim support only on tested hardware/OS combinations.

### Rollback/Containment

Hardware remains optional. Its failure must not invalidate the shared-software experiment or alter
existing software-derived cache identities. Stop GPU-surface work if ownership complexity outweighs
the measured saving.

## Milestone 5 - Decide from evidence

### Scope

Decide whether the measured readiness improvement justifies maintaining the optional native path.

### Changes

Publish `docs/shared-pass-preparation-results.md` with reproduction commands, source coverage,
correctness/fallback outcomes, cold/warm comparisons, and maintenance/packaging cost. Link the report
from this plan and the spike README; decide adopt, adopt only for measured source classes, or defer.

### Validation

The correctness gate is mandatory: no changed source ordinals, missing/duplicated frames, weakened
timing/audio contract, unbounded pixel retention, or invalid cache publication. Full-movie timings
must include all preparation stages and fallback costs, with median and range across repeats.

A proposed adoption target, to agree before execution, is at least 20% lower median total cold
preparation time on a targeted expensive class, with no unexplained common-case regression above
10%. These are experimental decision thresholds, not current product requirements or predictions.
Do not generalize a bounded encode-only speedup into a full-movie readiness claim.

If existing tests or exact-frame extraction checks need future extension, record that boundary
explicitly; this experiment proves preparation/review and must not claim unimplemented extraction.
Update `Progress`, discoveries, decisions, and outcomes. Apply `doc-update` only if adoption changes
durable architecture; a deferred experiment does not itself alter production architecture.

### Rollback/Containment

Retain isolated evidence and the optional patch even if rejected. No change to the production
application, canonical-index format, or current default is authorized by this document alone.

## References

- [Current POC execution plan](native-frame-identity-playback-spike-exec-plan.md).
- [Accepted proxy profile and UX evidence](../../spikes/native-frame-identity-playback/docs/review-proxy-profile-results.md).
- [Preparation acceleration evidence](../../spikes/native-frame-identity-playback/docs/preparation-acceleration-results.md).
- [Preparation/cache gate](../../spikes/native-frame-identity-playback/docs/bestsource-preparation-gate-results.md).
- [POC feature suggestions](../../spikes/native-frame-identity-playback/docs/poc-feature-suggestions.md).
- [Pinned upstream indexing/decoding implementation](https://github.com/vapoursynth/bestsource/blob/825af4e691524a3c98383d0cfe7d85b4142005cc/src/videosource.cpp).
