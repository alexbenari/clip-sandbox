# Feature Spec: Native Frame-Identity Playback Spike

## 1. Summary

Build a phased spike that determines whether a native media engine can provide broad source-media support, smooth review playback, and trustworthy absolute frame identity inside an Electron application.

The spike begins with a small LibVLC 4 engine gate outside Electron. It must prove or disprove LibVLC's frame behavior before any substantial UI integration is built. If LibVLC passes, the spike continues by testing callback-based rendering through an Electron bridge. If it does not provide trustworthy absolute frame identity, the spike instead evaluates a hybrid control that uses ordinary playback for fluid review and BestSource for exact frame access.

The spike supersedes the architecture recommendation from the original WebCodecs/Mediabunny spike. Candidate A was unsuitable as a product foundation, and Candidate B's container and codec coverage was insufficient for the target media collection.

## 2. Problem

The movie-to-pipeline workflow needs more than a player that can move to the next visible picture. It needs a stable coordinate system in which the application can identify, store, revisit, analyze, and extract the exact source frame the user saw.

Browser-native decoding does not cover enough of the user's media. At the same time, a mature native player may support relative next/previous stepping without exposing enough information to prove which absolute source frame is displayed. The next spike must separate these questions:

1. Can the engine display the next and previous source frames correctly?
2. Can the application identify each displayed frame by a stable source-frame index and exact presentation timestamp?
3. Can decoded frames be delivered into Electron quickly enough for held-key stepping and scrubbing?
4. If one engine cannot satisfy all three, can normal playback and exact frame access be combined smoothly?

## 3. Goals and Non-Goals

### 3.1 Goals

1. Treat absolute frame identity as a mandatory product capability.
2. Build a representative media matrix from `D:\tmp\media` without testing duplicate files that exercise the same relevant media characteristics.
3. Run a focused LibVLC 4 determinism gate before building a full Electron control.
4. Verify frame behavior against numbered or hashed reference frames rather than trusting player timestamps alone.
5. Determine whether LibVLC 4 can be both the normal-playback engine and the exact-frame backend.
6. If LibVLC cannot supply absolute frame identity, evaluate BestSource as the exact-frame backend for a hybrid playback control.
7. Measure the cost of moving exact preview frames from a persistent native helper into Electron.
8. Determine whether callback-based rendering is viable before considering a separate native review window.
9. Preserve a platform-neutral playback contract so product workflow code does not depend on LibVLC, BestSource, FFmpeg, or operating-system APIs.
10. Produce a written recommendation based on measured correctness, coverage, latency, memory use, implementation complexity, and cross-platform packaging implications.

### 3.2 Non-Goals

1. The spike does not create pipelines or extract final clips.
2. The spike does not implement LLM naming or frame analysis.
3. The spike does not build a polished production extraction workspace.
4. The spike does not implement a complete native window unless callback-based Electron rendering fails and the user approves that follow-up.
5. The spike does not reproduce BestSource's indexing algorithms in custom libav code.
6. The spike does not benchmark every movie under `D:\tmp\media`; it benchmarks representative media signatures and purpose-built edge-case fixtures.
7. The spike does not adopt FFmpeg/WASM as the primary desktop playback engine. It may retain a small documented feasibility check if useful, but native FFmpeg is the relevant desktop comparison.
8. The spike does not retain the old side-by-side candidate comparison UI. It evaluates one exact-frame backend at a time and embeds only the selected path in the Electron host.

## 4. Core Requirements

### 4.1 Absolute Frame Identity

For this project, absolute frame identity means that the application can associate the currently displayed source picture with all of the following:

1. a stable zero-based frame index in presentation order,
2. the frame's presentation timestamp as integer ticks,
3. the timebase that gives those ticks meaning,
4. the frame's display duration or the next frame's presentation timestamp,
5. enough independent evidence, such as a frame hash or burned-in fixture number, to verify that the mapping is correct.

A rounded playback time, an estimated frame number, or `timestamp * averageFps` does not satisfy this requirement.

Absolute identity must remain stable across:

1. pause and resume,
2. repeated forward and backward stepping,
3. random seeks,
4. scrubbing,
5. closing and reopening the same source when a persistent index is used,
6. handoff between normal playback and exact-frame mode if the selected architecture has two modes.

### 4.2 Relative Stepping Is Insufficient by Itself

An engine may correctly display the next or previous picture while exposing only an approximate playback clock. Such an engine can provide pleasant local navigation but cannot by itself support durable frame ranges, exact return-to-mark behavior, or future cloud-analysis results addressed by frame number.

Therefore:

1. next-frame and previous-frame behavior must be tested separately from absolute identity,
2. a candidate that passes relative stepping but fails identity does not pass the engine gate as a unified backend,
3. that candidate may still be retained as the normal-playback half of a hybrid architecture.

### 4.3 Canonical Source Timeline

The spike should evaluate a platform-neutral value shaped conceptually as:

```ts
interface SourceFrameIdentity {
  readonly frameIndex: number;
  readonly presentationTimestamp: bigint;
  readonly timebaseNumerator: number;
  readonly timebaseDenominator: number;
  readonly durationTimestamp: bigint | null;
}
```

This is a directional contract, not a final production API. The important rule is that frame index and timestamp travel together. Product code must not infer one from a nominal frame rate.

## 5. Representative Media Matrix

### 5.1 Source Inventory

Recursively inspect `D:\tmp\media`, which already contains the previously analyzed `gif material` folder. Group files by characteristics that can materially change decode, seek, or rendering behavior.

The grouping key should consider at least:

1. container,
2. video codec,
3. codec profile,
4. pixel format and bit depth,
5. constant or variable frame rate,
6. progressive or interlaced presentation,
7. resolution class,
8. audio codec when normal playback is evaluated,
9. rotation or other display transforms,
10. unusual stream structure such as multiple video tracks or unreliable indexes.

Select one or more representatives for each materially distinct group. Prefer a full-length or otherwise demanding example when several files share the same signature.

### 5.2 Purpose-Built Fixtures

Add generated fixtures for important cases not represented adequately in the inventory:

1. CFR video with every frame visibly numbered,
2. VFR video with visibly numbered frames and deliberately irregular timestamps,
3. dense B-frame reordering,
4. long GOPs,
5. interlaced or repeat-field material,
6. a source with a non-zero starting timestamp,
7. a source with rotation metadata,
8. a malformed or truncated source for failure reporting.

Fixtures used to verify identity must have a machine-readable expected frame sequence. Frame hashes should be computed from a normalized decoded representation so harmless renderer color conversion is not mistaken for the wrong frame.

## 6. Phased Spike

### 6.1 Phase 1: LibVLC 4 Engine Gate

Build a minimal native harness with no Electron UI. The harness should load each representative source and record frame operations, callback events, timestamps, and independently verified displayed-frame identities.

Test:

1. sequential next-frame operations,
2. sequential previous-frame operations,
3. switching repeatedly between forward and backward stepping,
4. random seek followed by next/previous stepping,
5. repeated seeks to the same requested position,
6. beginning and end-of-stream behavior,
7. decoded-memory callbacks and LibVLC 4 texture-output callbacks,
8. frame ordering and timestamp information observed at the output callback boundary.

For each operation, compare the displayed picture with the fixture's expected frame number or normalized hash. Do not declare success from a plausible timestamp alone.

#### Phase 1 Pass Condition

LibVLC passes as a unified backend only if it can:

1. step forward and backward to the expected displayed source frames,
2. expose or support deriving an exact, repeatable mapping from each displayed picture to the canonical source timeline,
3. preserve that mapping after random seek,
4. deliver output callbacks in a form suitable for application-controlled rendering,
5. support the representative media matrix with clearly reported failures.

If relative stepping works but absolute identity cannot be established, LibVLC fails as the unified exact-frame backend but remains eligible as a normal-playback engine.

Playback-rate changes are not part of this correctness gate. They exercise ordinary clocked playback,
not exact frame access. The selected Electron control tests the required rates later in Phase 3.

### 6.2 Phase 2: Select and Gate Candidate C's Exact-Frame Backend

#### Phase 2A: Provisional Path Selection

Use Phase 1 evidence to select one of these paths:

##### Path C1: Unified LibVLC

Choose this path when LibVLC passes the complete engine gate.

1. LibVLC owns demuxing, decoding, playback timing, audio, speed control, seeking, and frame stepping.
2. The application owns the canonical frame identity exposed through its neutral adapter.
3. LibVLC output callbacks feed the Electron rendering path.
4. BestSource and browser proxy generation are not required for exact navigation.

##### Path C2: Hybrid Playback Plus BestSource

Provisionally choose this path when LibVLC cannot provide absolute identity or when another normal playback path is materially simpler. BestSource must then pass the Phase 2B engine gate before Path C2 is confirmed.

1. Chromium `<video>`, a browser-friendly proxy, or LibVLC provides normal fluid playback and preview audio.
2. BestSource provides persistent frame indexing and exact `getFrame(N)` access over FFmpeg.
3. Pausing, stepping, or exact scrubbing switches the viewport to an application-rendered exact frame.
4. Resuming playback seeks the normal player to the selected source frame's presentation timestamp and switches the viewport back.
5. A proxy is generated only when the selected normal player cannot play the source directly.

Direct Chromium playback never supplies exact frame scrubbing in this path. It supplies normal playback only; BestSource supplies exact paused navigation.

#### Phase 2B: BestSource Engine Gate

Run this conditional phase only when Path C2 is provisionally selected. Use a minimal persistent
native harness with no Electron UI, and evaluate BestSource against the same representative media
matrix, deterministic fixtures, and absolute-identity standard used for LibVLC.

Test:

1. opening and indexing each representative source,
2. sequential access to the next and previous frame numbers,
3. repeatedly alternating forward and backward access,
4. random frame access followed by neighboring-frame access,
5. repeated requests for the same frame,
6. beginning and end-of-stream behavior,
7. closing and reopening a source using its persistent index,
8. exact frame-index, PTS, timebase, and duration mapping,
9. decoded-frame identity against the fixture's expected frame number or normalized hash,
10. cold and warm access latency, indexing time, memory use, and decoded output format,
11. clear reporting for unsupported, malformed, unindexable, or unverifiable sources.

BestSource passes only if it returns the expected decoded picture for every tested exact-frame
operation, preserves the canonical source identity across random access and reopen, supplies decoded
frames suitable for application rendering, and supports the representative media matrix with
explicit failures. Performance results must also be good enough to justify proceeding to bridge
measurement; the execution plan will record concrete interaction targets before implementation.

If BestSource fails this gate, stop before building the fuller Electron implementation and report
that neither candidate has established a viable exact-frame backend. Do not silently relax absolute
identity or proceed on the assumption that bridge work will repair an engine-level failure.

### 6.3 Phase 3: Electron Bridge and Renderer

Embed the selected backend in a small isolated Electron host. Keep the native helper persistent for the loaded movie; do not launch one process per requested frame.

The host uses one movie viewport, one transport area, and one range-capture panel. It does not show
LibVLC and BestSource side by side and does not need an active-candidate selector. For Path C2, normal
playback and exact-frame mode are two internal modes of the same control, not two user-visible
candidate controls.

The bridge experiment must separate and measure:

1. native index or seek time,
2. native decode time,
3. pixel-format conversion time,
4. native-to-Electron transport time,
5. renderer upload and draw time,
6. total keypress-to-visible-frame latency.

Start with the simplest correct transport. If copying full frames is too expensive, evaluate a bounded shared-memory ring buffer before a native window. The protocol should send frame metadata separately from pixel storage and must support request supersession during scrubbing.

The Electron control must exercise:

1. play, pause, and stop,
2. required playback rates,
3. single-frame forward and backward stepping,
4. continuous stepping while left/right is held,
5. `+1` and `+10` frame step modes,
6. timeline scrubbing,
7. switching smoothly between playback and exact-frame mode when Path C2 is selected,
8. source-frame index and exact timestamp display,
9. `q`, `w`, and `a` range capture using canonical source-frame identities.

### 6.4 Phase 4: Native Window Decision Gate

Do not build a full native review window merely because native decoding is used.

Consider a native sibling window only when:

1. the selected engine satisfies frame correctness and media coverage,
2. callback-based or shared-memory Electron rendering cannot meet the measured interaction targets,
3. the failure is attributable to frame delivery/render integration rather than decode or seek performance.

If these conditions hold, write a follow-up recommendation comparing a native sibling review workspace with shared-GPU-texture integration. That recommendation requires separate user approval before implementation.

## 7. Direct FFmpeg Baseline and Proxy Cost

BestSource is a cross-platform frame-access library built on FFmpeg libraries. Its value is not broader decoding than FFmpeg; its value is the indexing, seek verification, caching, and `getFrame(N)` behavior that raw libav does not provide as a ready-made application contract. Phase 2B verifies that value directly rather than assuming it.

If Phase 1 provisionally selects Path C2, include a narrow direct-libav baseline alongside the
BestSource native harness. The baseline should measure:

1. sequential decode throughput,
2. a basic keyframe seek followed by decode-forward.

If BestSource passes and the Electron bridge is built, transport both backends through the same
bridge only when doing so remains a narrow comparison rather than a second implementation effort.

The baseline must not grow into a second custom exact-frame implementation. It exists to quantify BestSource's overhead and show what correctness and convenience the dependency buys.

If proxy generation is required, separately record:

1. BestSource indexing time,
2. FFmpeg proxy-generation time,
3. whether running both independently causes material duplicate decode work,
4. whether a future combined custom libav service would save enough time to justify its additional ownership cost.

## 8. UX Performance Questions

The spike should measure behavior rather than assume the Electron bridge is either cheap or prohibitive.

Record at least:

1. first-frame latency,
2. cold and warm one-frame step latency,
3. sustained held-key stepping rate,
4. backward stepping across a GOP boundary,
5. random-seek latency,
6. slow and rapid scrub behavior,
7. stale-request suppression,
8. memory use during ten minutes of mixed playback and scrubbing,
9. CPU and GPU use where observable,
10. proxy startup delay and generation rate if Path C2 needs a proxy.

The result must distinguish desired interaction targets from measured results. Targets are not promises that an engine will meet them.

## 9. Error Handling

The spike must visibly or structurally distinguish:

1. unsupported container or codec,
2. malformed media,
3. index construction failure,
4. decode failure,
5. seek or frame-identity verification failure,
6. output callback or renderer failure,
7. helper process crash,
8. superseded scrub request,
9. proxy-generation failure when applicable.

A frame that cannot be identified with the required confidence must not be silently presented as exact.

## 10. Architecture Constraints

1. The Electron renderer talks only to a platform-neutral playback adapter.
2. Clip marking, extraction, pipeline, and future analysis code must not depend on LibVLC, BestSource, FFmpeg, native window handles, or operating-system texture APIs.
3. Native file and process access remains in the trusted Electron/native boundary.
4. The spike remains isolated under `spikes/` and does not import production app modules.
5. Native dependencies, licenses, binary sizes, supported platforms, update strategy, and packaging requirements must be recorded before recommending production adoption.
6. The exact-frame backend owns frame identity; the range-capture model merely consumes identities and does not reconstruct them from time or frame rate.

## 11. Deliverables

The spike must produce:

1. a deduplicated representative-media manifest derived from `D:\tmp\media`,
2. generated deterministic frame fixtures and their expected identities,
3. a repeatable LibVLC 4 native engine-gate harness,
4. an engine-gate report with per-case correctness and timing evidence,
5. an explicit Path C1 or Path C2 decision,
6. a BestSource engine-gate report when Path C2 is provisionally selected,
7. a small isolated, single-candidate Electron host using the selected path,
8. bridge and renderer measurements,
9. an updated architecture-options document that supersedes the old WebCodecs recommendation,
10. a final spike-results document with a production recommendation and remaining risks,
11. pinned source manifests or retrieval instructions for native candidate components whose source is available.

## 12. Acceptance Criteria

The spike is complete when:

1. the representative media matrix covers materially distinct media signatures from `D:\tmp\media` plus generated edge-case fixtures,
2. duplicate files are not tested merely to increase sample count,
3. LibVLC 4 forward and backward stepping has been verified against known frame contents,
4. LibVLC 4 random seek and timestamp behavior has been verified independently rather than assumed,
5. the report states whether LibVLC provides absolute frame identity as defined in this spec,
6. if Path C2 is considered, BestSource passes the same absolute-identity and representative-media criteria before Electron integration begins,
7. the selected Candidate C path follows directly from the applicable engine-gate evidence,
8. the Electron host presents one selected solution rather than the old side-by-side candidate comparison,
9. the Electron host supports exact frame stepping, held-key stepping, and exact-frame scrubbing on representative sources,
10. every marked range stores canonical source-frame indices and exact presentation timestamps,
11. normal playback includes audible preview in the selected path,
12. the spike reports decode, bridge, and render latency separately,
13. stale scrub results never replace a newer requested frame,
14. memory remains bounded by an explicit cache or ring-buffer policy,
15. unsupported or unverifiable media produces a clear error rather than an approximate-success state,
16. the final report recommends one production direction or explicitly concludes that neither tested path is ready,
17. no native-window implementation is started unless the Phase 4 gate is reached and separately approved.

## 13. Open Questions

These questions are intentionally left for measured spike results:

1. Does LibVLC 4 provide a sufficiently exact frame identity at its output callback boundary?
2. Are LibVLC 4 previous-frame operations correct and responsive across the representative matrix?
3. Is CPU-memory frame delivery sufficient, or is shared memory required?
4. Can the selected Electron renderer preserve responsive held-key stepping at full review resolution?
5. If Path C2 is selected, how disruptive is switching between normal playback and exact-frame mode?
6. How long does BestSource indexing take on full-length and difficult sources?
7. Is BestSource's correctness worth its dependency and indexing cost compared with owning a custom libav layer?
8. When a proxy is required, can review begin progressively before the complete proxy exists?
9. What representative media failures remain even with the selected native stack?
10. What is the real cross-platform packaging cost for Windows, macOS, and Linux?

## 14. Decisions Fixed by This Spec

1. Absolute frame identity is mandatory, not an optional enhancement.
2. Relative next/previous stepping does not prove absolute identity.
3. The media test set is deduplicated by meaningful media characteristics and sourced recursively from `D:\tmp\media`.
4. LibVLC 4 receives a focused native engine gate before Electron integration.
5. Candidate C's exact-frame backend is chosen after that gate, not before it.
6. BestSource is the preferred exact-frame fallback when LibVLC cannot provide the required identity, but it must pass its own engine gate before adoption.
7. Direct libav is a narrow performance baseline, not a commitment to implement custom frame indexing.
8. The Electron bridge is measured only after the exact-frame backend passes its applicable gate.
9. The Electron host presents one selected solution; the old side-by-side comparison UI is retired.
10. A native review window is a gated fallback, not the default spike deliverable.
11. FFmpeg remains the eventual extraction engine independently of the playback architecture.
