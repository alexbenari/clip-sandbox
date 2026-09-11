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
11. Permit ordinary playback during visible background preparation while keeping exact-frame
    operations unavailable until one complete canonical index is ready.

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
interface ISourceFrameIdentity {
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
5. A proxy may also be generated for the application-rendered exact-frame path when direct source
   decoding cannot provide a smooth full-player drag experience. This does not replace direct source
   playback or make proxy timestamps canonical.

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
identity or proceed on the assumption that bridge work will repair an engine-level failure. The
completed Phase 2B did fail its original immediate-readiness performance gate, so Phase 3 remains
blocked unless the following approved remediation gate passes.

#### Phase 2C: Prepared BestSource Remediation Gate

This amendment accepts visible background preparation. Ordinary playback and timestamp seeking may
start immediately, but exact stepping, exact scrubbing, `q`/`w` capture, and `a` locking remain
unavailable until preparation reaches an exact-ready state.

Use these terms consistently:

1. **Source movie:** the user-selected original file. It remains the final clip-extraction input.
2. **Review asset:** the file BestSource indexes and uses for exact review. It is normally the source
   movie itself.
3. **Timestamp-normalized review copy:** an optional generated file whose compressed video and audio
   are stream-copied while missing container timestamps are generated. This is the derivative
   referred to in experiment reports. It is an implementation artifact, not a second user-visible
   movie.
4. **Canonical index:** the one complete persistent BestSource index for the selected review asset.

For a healthy source, the review asset is the source movie and only its index is cached. When packet
preflight finds missing keyframe PTS, the timestamp-normalized review copy becomes the review asset;
the cache then contains that file, its one BestSource index, and a small preparation manifest. The
product path must not build both a source index and a review-copy index. Test-only comparison indexes
may be used to prove the recipe, but they are not part of the proposed product architecture.

Phase 2C must prove:

1. packet preflight selects the source or timestamp-normalized review copy deterministically;
2. normalization preserves compressed picture order and a one-to-one source-frame-index mapping;
3. unconditional MPEG-4 Part 2 packed-B-frame unpacking is not used;
4. preparation reports phase, progress, elapsed time, and a progressively refined ETA, supports
   cancellation, and never publishes partial cache artifacts as ready;
5. a valid cache hit reopens the same canonical frame map without normalization or full indexing;
6. changed source content, selected track, recipe, or dependency versions invalidate the cache;
7. random exact access remains identity-correct even when a known slow source exceeds the original
   latency target;
8. held `+1` uses the persistent decoder as adjacent sequential work rather than repeated random
   seeks, while held `-1` uses a bounded delivered-frame history and an explicit cache-miss path;
9. every displayed adjacent frame advances by exactly one canonical source-frame identity and held
   input cannot create an unbounded request queue.

Future cache reopening uses a deterministic sampled packet signature rather than rereading every
compressed packet. The selected profile covers three minutes from the start, three minutes from the
end, and three pseudo-random one-minute interior segments. It also binds source size, duration,
selected-stream metadata, exact sample locations, preparation contract, dependency versions, and
indexing options. This is probabilistic change detection: modifications confined to unsampled
content can evade it, and that residual risk is explicitly accepted for this local interactive
cache. First-time preparation and source-to-review identity proof remain complete scans.

The first Phase 2C implementation deferred all-intra proxy generation, PTS-assisted BestSource hash
disambiguation, and special acceleration for 4K decode-forward. The later approved full-player scrub
amendment activates the all-intra option only after canonical preparation has passed this gate.
Phase 2C itself stopped for evidence review before the Electron bridge began.

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

1. one play/pause toggle,
2. required playback rates,
3. single-frame forward and backward stepping,
4. continuous stepping while left/right is held,
5. single-frame stepping, with the adapter accepting a bounded configurable count if another step
   button is added in the future,
6. timeline scrubbing,
7. switching smoothly between playback and exact-frame mode when Path C2 is selected,
8. source-frame index and exact timestamp display,
9. `q`, `w`, and `a` range capture using canonical source-frame identities.

Opening a movie must show its first frame while remaining paused; loading must have a visible
processing state. Timeline dragging owns the thumb locally so status polling cannot snap it back.
Releasing the thumb performs one seek and starts playback from the selected position, with the same
processing state visible until the handoff completes.

The approved full-player scrub amendment rejects a small seeker thumbnail as insufficient. Its
initial implementation adds a cached maximum-960-pixel all-intra display proxy and one proxy
BestSource index alongside the canonical source index. The proxy must retain one picture per
canonical ordinal, and the complete canonical/output/proxy frame counts must match before exact
controls are enabled. During dragging, the main viewport shows progressive proxy pictures. On
release, the initial implementation resolves the exact canonical frame identity and resumes the
original source through its canonical PTS. Automated evidence must cover both CFR and VFR coded
fixtures; hands-on evidence must judge enlarged proxy quality and perceived continuous-drag
smoothness.

### 6.4 Phase 3B: Unified Review-Proxy Contract and Profile Gate

The next approved POC step determines whether the display proxy should become a timing-preserving
review proxy used for both ordinary LibVLC playback and BestSource exact-frame review once
preparation completes. This aims to retain the accepted full-player dragging experience while
removing original-resolution decode and CPU-RGBA callback pressure from warm playback, improving
preview-audio stability, and reducing cold preparation cost.

The original movie remains the extraction source and the canonical source index remains the
authority for frame ranges. The review proxy is a replaceable cache artifact, never the durable
identity authority.

This phase uses the current pinned software FFmpeg path. Preparation acceleration is deliberately
excluded so codec profile, timing, audio, handoff, and frame-identity results are not confounded by
hardware- or wrapper-specific behavior.

The gate must:

1. retain exactly one review-proxy picture for every canonical source-frame ordinal and reject a
   proxy whose complete output or indexed frame count differs;
2. preserve source presentation timing and frame durations, including VFR behavior, without
   treating proxy timestamps as canonical frame identities;
3. record an explicit proxy-clock-to-canonical-frame map when damaged or repeated source timestamps
   require normalization instead of assuming that the proxy clock equals the source clock;
4. retain the proved maximum-960-pixel display bound for the first comparison;
5. compare all-intra, GOP 6, and GOP 12 video profiles, all without B-frames;
6. retain only one semantically selected preview-audio program, downmix it to stereo, encode it as
   AAC at 160-192 kbps, and omit all other source audio streams from the review proxy;
7. use LibVLC to play the review proxy for ordinary warm playback and use BestSource to decode the
   same proxy for exact stepping and dragging;
8. allow provisional original-source playback before the review proxy is ready, then transfer
   position, playing or paused state, and playback rate when switching to the proxy;
9. reject any profile that loses, duplicates, or reorders decoded pictures, drifts from source
   presentation timing, or cannot map every displayed proxy picture back to one canonical source
   frame;
10. select one profile and record its complete cache identity so subsequent acceleration candidates
    must generate the same review artifact contract.

Measure and report:

1. proxy encode, proxy index, and total cold preparation time;
2. proxy size and visual quality at the real player size;
3. ordinary-playback startup, sustained delivery rate, CPU/GPU use, and preview-audio stability;
4. random exact landing, released seek, continuous dragging, and adjacent stepping behavior;
5. source-to-proxy frame-count, ordinal, presentation-time, and sampled-pixel correspondence;
6. the visible handoff from provisional source playback to ready proxy playback;
7. profile-specific behavior on CFR, VFR, timestamp-repaired, common 1080p, and difficult 4K
   representatives.

The phase passes when it selects one evidence-backed review profile, preserves exact canonical
range identities, keeps the accepted continuous-drag experience, and provides clean synchronized
warm preview audio on the difficult 4K representative. A shorter GOP that does not improve the
measured result is rejected without invalidating the existing all-intra baseline. Perceived visual
quality, scrub smoothness, and audio cleanliness require hands-on review in addition to automated
timing and identity evidence.

### 6.5 Phase 3C: Preparation-Acceleration Gate

After Phase 3B fixes the review-proxy contract, a separate phase may reduce cold preparation time
without changing that contract. It compares:

1. the current software FFmpeg CLI implementation as the correctness and timing baseline;
2. `node-av` as the first cross-platform FFmpeg API and hardware-selection candidate;
3. `ffmpeg-kit` as a packaged cross-platform FFmpeg execution candidate;
4. direct FFmpeg hardware decode, GPU scaling, and hardware encode as a diagnostic upper-bound path;
5. BestSource software canonical indexing against BestSource configured directly with its own
   supported FFmpeg hardware device.

Proxy-generation candidates must produce the same selected picture order, presentation timeline,
audio contract, and canonical-frame map as Phase 3B. Each hardware job must detect unsupported
codec, pixel-format, filter, or device combinations and retry through the known-correct software
path. BestSource acceleration is measured independently: a `node-av` or `ffmpeg-kit` device cannot
be passed into BestSource's separate native process and FFmpeg build.

Measure cold wall time, startup cost, CPU/GPU use, output equivalence, packaging implications,
failure diagnosis, and fallback cost. Phase 3C may select different implementations per platform,
but all remain behind one platform-neutral preparation adapter. Failure to find a worthwhile
accelerated path does not invalidate the correct Phase 3B software recipe.

### 6.6 Phase 4: Native Window Decision Gate

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
4. whether a future combined custom libav service would save enough time to justify its additional ownership cost,
5. the selected review-proxy GOP and audio profile,
6. whether hardware decode and scaling were used, why that path was selected, and whether fallback
   was exercised.

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
11. pinned source manifests or retrieval instructions for native candidate components whose source is available,
12. a unified review-proxy report comparing timing, GOP, audio, identity, handoff, and perceived-UX
    evidence,
13. a separate preparation-acceleration report comparing wrappers, hardware paths, packaging, and
    software fallback when Phase 3C is executed.

## 12. Acceptance Criteria

The spike is complete when:

1. the representative media matrix covers materially distinct media signatures from `D:\tmp\media` plus generated edge-case fixtures,
2. duplicate files are not tested merely to increase sample count,
3. LibVLC 4 forward and backward stepping has been verified against known frame contents,
4. LibVLC 4 random seek and timestamp behavior has been verified independently rather than assumed,
5. the report states whether LibVLC provides absolute frame identity as defined in this spec,
6. if Path C2 is considered, BestSource passes the same absolute-identity and representative-media
   criteria through the direct Phase 2B gate or the prepared-review Phase 2C gate before Electron
   integration begins,
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
17. no native-window implementation is started unless the Phase 4 gate is reached and separately approved,
18. the unified review-proxy gate verifies one-to-one proxy-to-canonical frame correspondence before
    allowing exact range capture,
19. ready-proxy LibVLC playback provides clean synchronized preview audio on the difficult 4K
    representative while exact review continues to use canonical source identities,
20. any hardware-assisted preparation selected in Phase 3C has a tested per-source software
    fallback and produces an artifact equivalent to the selected Phase 3B contract.

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
11. Can one timing-preserving review proxy serve LibVLC playback and BestSource exact review for both
    CFR and VFR sources without introducing dropped or duplicated pictures?
12. Which of all-intra, GOP 6, or GOP 12 gives the best preparation-time and exact-access tradeoff?
13. Does normalized stereo proxy audio eliminate the observed warm 4K playback jitter?
14. Can an existing FFmpeg hardware abstraction satisfy runtime detection, per-source compatibility,
    GPU scaling, Electron packaging, and job-level software fallback without excessive ownership cost?
15. Can BestSource hardware decoding accelerate canonical indexing without changing frame identity
    or making failure handling less reliable?

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
12. The prepared-review path uses exactly one canonical full BestSource index for the selected
    review source; an optional timestamp-normalized review copy is a media file, not another
    canonical index. A display or review proxy may have its own physical-access BestSource index,
    but that index never becomes the canonical identity authority.
13. Held adjacent stepping and random exact access are different operations with different queue and
    decoder-reuse behavior.
14. The next POC phase evaluates a unified timing-preserving review proxy before entering the native
    window decision gate.
15. Proxy timestamps support playback synchronization and navigation but never replace canonical
    source-frame identity.
16. Review-proxy correctness and profile selection are proven on the current software path before
    preparation acceleration is evaluated.
17. Existing cross-platform hardware-selection implementations must be evaluated before a custom
    OS-specific selector is designed.
18. `node-av`, `ffmpeg-kit`, direct FFmpeg hardware processing, and BestSource hardware indexing are
    separate Phase 3C candidates; none is assumed to configure or accelerate another component.
