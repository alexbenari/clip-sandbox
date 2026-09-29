# Build exact capture preview and revised GIF shortcuts

## Why this matters

The user needs to see the exact first and last pictures of a GIF capture and watch that inclusive range at normal speed before locking it. The same Q/W, A/S, Z, Space, X, and E controls must work in GIF Extraction and Refine Gif. The signed-off behavior is in `docs/specs/capture-preview-and-shortcuts-spec.md`. This plan requires sign-off before implementation.

**User-visible completion goal:** In the running Electron app, an exact draft, selected locked range, or staged Refine pair can be jumped to and looped silently at 1× with a clear silent-preview cue; every observed cycle includes its exact Start and End pictures, shows no outside picture, and Space leaves an exact frame ready for arrow stepping. Normal movie playback remains audible when resumed.

## Progress

- [x] (2026-09-28) Spec signed off; current architecture, design guidance, and `PLANS.md` reviewed.
- [ ] Execution plan signed off.
- [ ] Establish the proxy profile contract and cached packet-only index; record any encoder-profile change.
- [ ] Prototype bounded packet selection and the real-player loop; record the gate decision below.
- [ ] Add trusted preview ownership and narrow frame-review commands.
- [ ] Add capture-target orchestration and shared screen/keyboard controls.
- [ ] Complete automated and actual-app verification, documentation, and review.

## Skill Gates

Planning-time gates used: `working-with-users-and-team` for the user decisions and acceptance language; `impeccable` for the control flow and visible states; `api-and-interface-design` and `domain-modeling` for boundary and lifetime design; `error-and-correctness-traps` for timestamps, races, cancellation, and native errors; `testing-discipline` for the media oracle; `observability` for useful preparation/failure timing; `security-and-trust-boundaries` for IPC input and FFmpeg invocation; `build-deploy-and-tooling` for fixture/tool additions; `typescript-coding` for the typed API design; `doc-update` for architecture documentation; `pre-commit-self-review` and `coding-quality.md` for the final design check. The repository's `docs/agent-docs/agent-architecture-map.md` was read before code paths.

Execution-time gates: read `using-97` and reapply `typescript-coding` before TypeScript edits; apply `api-and-interface-design`, `domain-modeling`, `writing-clean-code`, and `error-and-correctness-traps` before adding the preview contracts and owner; apply `security-and-trust-boundaries` to IPC validation and native process argv; apply `testing-discipline` to fixtures and tests; apply `impeccable` to visible controls; apply `observability` to preview measurements and errors; apply `build-deploy-and-tooling` if package scripts or native build files change; apply `doc-update` to durable module boundaries; apply `pre-commit-self-review` and `coding-quality.md` before calling the work complete. If a refactor becomes necessary, apply `before-you-refactor` first. If a bug is discovered during execution, use `bugfix-by-failing-test` for that fix. No expected skill is unavailable. Record any new skill trigger or unavailable skill here when encountered.

## Surprises & Discoveries

- Existing GIF fixture movies are only 72 frames and their selected ranges are under one second (`tests/fixtures/gif-extraction/manifest.json`). They can check media selection, but cannot serve as the representative several-second playback or long-movie preparation gate.
- The current playback event carries a sampled playback timestamp and RGBA pixels, while exact scrub carries a canonical frame ordinal (`src/frame-review/host/libvlc-playback-engine.ts`, `src/frame-review/frame-review-api.ts`). A timestamp or final canvas screenshot cannot prove which pictures appeared at the loop boundary.
- The native product already stages FFmpeg and FFprobe in `native-build/frame-review/runtime/ffmpeg/` (`tools/frame-review/verify-native-products.mjs`). Use these pinned tools; do not add a media dependency just for this feature.
- `FfmpegProxyCreator` encodes `proxy.mkv` as MPEG4 with `-g 1`, `-bf 0`, source-relative monotonic video timestamps, and AAC audio. That makes video packet copy a plausible first prototype, but packet keyframe flags, frame/packet ordinal correspondence, and remuxed timestamps still need measurement. The preview asset omits the proxy's audio stream.
- The proxy profile uses `-fps_mode passthrough` and a 1/60000 filter clock, rather than an explicit output frame-rate option. A current cached proxy reports video time base 1/1000 and keyframe flags on sampled packets; test the full stream and VFR fixtures before declaring these universal.
- On 2026-09-29, a five-packet stream-copy probe from a cached proxy with `-ss 0.417` produced five packets with first PTS zero and the expected relative gaps. This confirms only that representative case; FFmpeg documents input seeking to the closest earlier seek point under stream copy, so an ordinal and timestamp check remains necessary.
- Matroska permits `BlockDuration` for a final picture. The feedback's absolute claim that Matroska cannot store frame duration is false; what this proxy actually writes and what LibVLC uses at end of stream still need measurement.
- A cached 24-fps proxy reports alternating 41/42-ms PTS gaps but FFprobe reports 41-ms packet duration for each inspected video packet. Its container duration is 8.687 s while the last video PTS is 8.625 s; the proxy also has audio. Neither reported packet duration nor container end alone establishes the last picture's visible hold.
- On 2026-09-29, a five-packet Matroska-to-Matroska stream-copy probe preserved MPEG4 codec name, dimensions, pixel format, and SHA-256 codec extradata hash. This supports a cheap production configuration check; fixture decoding must still prove that the chosen proxy profile's packets are independently decodable and map to the expected pictures.
- `ReviewPreparationService` already runs a BestSource decode/index pass over the proxy and validates its decoded frame count against the canonical source count through `FrameMapValidator`. A new whole-proxy decode just for packet correspondence would duplicate expensive preparation work.

## Decision Log

- Decision: Keep Refine Gif and its staged `X` commit/Back discard flow. Date/Author: 2026-09-28 / user. Rationale: It still guides approximate marks to exact frames, makes edits reversible, and advances to the next inexact range.
- Decision: Prototype a frame-selected, range-only proxy asset before production changes. Date/Author: 2026-09-28 / user-approved spec. Rationale: The time-based LibVLC A–B loop does not establish that the End picture is displayed. A bounded asset prevents outside-range pictures, but actual boundary display and 1× timing still require proof.
- Decision: Try frame-bounded video packet copy/remux from the GOP1 proxy before any video re-encode. Date/Author: 2026-09-29 / user. Rationale: The proxy already uses independently decodable GOP1 video; copying the selected packets may be simpler, faster, and avoid another lossy encode. This is a prototype choice, not a claim that packet boundaries, timestamps, or repeated playback are correct.
- Decision: Loop previews are silent video-only assets; full-movie playback and extracted clips keep their existing audio behavior. Date/Author: 2026-09-29 / user. Rationale: Exact visual review is the purpose of the loop, while dropping preview audio removes AAC cuts, priming, synchronization, and audible-wrap requirements. Show a silent-preview cue so the change in sound is clear.
- Decision: Replace the segment-muxer candidate with input seek plus bounded stream copy to Matroska. Date/Author: 2026-09-29 / plan revision after user feedback. Rationale: a direct late-range seek avoids writing unrelated earlier segments; packet identity and timestamps will be verified rather than inferred from the seek.
- Decision: Require complete packet-payload, timestamp, and codec-configuration comparison for each generated preview asset; keep decoded packet-to-picture and asset-picture proofs in the profile fixtures. Date/Author: 2026-09-29 / user feedback. Rationale: the profile-level proof, existing decoded proxy count, and production packet/configuration checks establish the asset's encoded picture identity without another full proxy decode or a decode on every endpoint revision. The real-player gate still proves presentation. Measure the cost of building and caching the proxy packet index; do not block ordinary playback or exact-frame readiness on a new avoidable full-proxy pass.
- Decision: Use the proxy's preceding positive PTS gap as the hold duration only when End is the proxy's last frame and no trustworthy explicit duration exists. Date/Author: 2026-09-29 / user. Rationale: this rare boundary needs a sensible proxy-based default rather than an exact-duration guarantee.
- Decision: Give proxy-profile conformance and packet-index ownership a separate milestone before loop-asset experiments. Date/Author: 2026-09-29 / user. Rationale: profile assumptions and any necessary change to proxy creation need their own validation and rollback boundary.
- Decision pending: The observed proxy time base, whether plain repeat needs a Start sentinel, whether any repeated-file variant earns its size, any measured re-encode fallback, and the final host API. Record measured evidence and the choice here after Milestone 2; do not silently weaken the oracle.

## Outcomes & Retrospective

Pending implementation. Fill with user-visible behavior, actual fixture/range and timing results, test commands and exit codes, manual app observations of silent preview and resumed full-movie audio, and remaining limitations. A green unit suite alone does not satisfy the goal.

## Context and orientation

Read `docs/agent-docs/agent-architecture-map.md` and `coding-quality.md` before editing. `RangeCaptureModel` in `src/domain/range-capture-model.ts` owns the draft and locked queue. `GifExtractionSession` in `src/app/gif-extraction-session.ts` is the workflow façade and selected-range owner; `RefineGifSession` in `src/app/refine-gif-session.ts` owns an unsaved pair copied from a locked range. `FrameReviewPlayerControl` in `src/ui/frame-review-player-control.ts` owns the visible canvas and transport. Both `src/ui/gif-extraction-screen.ts` and `src/ui/refine-gif-screen.ts` use `src/ui/gif-workflow-keyboard-controller.ts`.

The renderer calls `IFrameReviewSession` (`src/frame-review/frame-review-api.ts`) through `src/adapters/electron/electron-frame-review-service.ts`, `electron/preload.cjs`, and `electron/frame-review-ipc.cjs`. `FrameReviewHost` and `ReviewSession` in `src/frame-review/host/` own the trusted per-window native sessions. Prepared review creates a GOP1 proxy: every proxy picture ordinal maps to the same canonical source picture ordinal, although proxy presentation times need not equal source times. `LibVlcPlaybackEngine` sends playback pixels/times through the native service; `BestSourceFrameReader` supplies exact canonical scrubbing. A **canonical ordinal** is the zero-based frame number in the original source's prepared frame index. **PTS** is a picture's presentation timestamp. A **source generation** distinguishes a newly chosen movie from stale work. A **bounded asset** is a temporary playable file whose normal cycle contains Start through End proxy pictures, inclusive; an experimentally justified seam variant may append a repeat of Start. It is not a saved clip or extraction output.

Current capture shortcuts are Q/W/A/E, with A locking. This plan changes lock to X, adds A/S jumps and Z loop, and keeps E, Space outside preview, and arrow stepping. Jump requires two exact endpoints in inclusive order from the current source generation. Loop Preview requires Start before End; its control is disabled for one-frame ranges, which remain valid to lock and extract.

## Exact proxy loop solution

### Correctness basis and options

Do not use `libvlc_media_player_set_abloop_time` as the loop's correctness basis. The pinned LibVLC 4 code in `tools/frame-review/.deps/vlc-source/src/player/player.c` schedules the B boundary from a clock deadline and seeks to A; its A–B test in `test/src/player/abloop.c` does not exercise video. A successful timestamp assertion would therefore not prove that End was shown. No A–B comparison is needed; use the picture oracle to decide whether the bounded asset works.

The initial candidate remuxes without re-encoding the GOP1 proxy video packets corresponding to validated proxy ordinals Start through End, inclusive, for Start before End. Establish on CFR/VFR fixtures produced by the actual pinned `FfmpegProxyCreator` and FFmpeg build that video packet order, PTS, and decoded-picture order correspond one-to-one, including noninitial packets decoded from a fresh seek. Keep this profile-conformance test in the relevant validation suite; changing encoder settings or FFmpeg requires rerunning it and reviewing `FRAME_REVIEW_PROXY_PROFILE_ID`. `SourceInspector` already includes that profile ID and FFmpeg version in the prepared cache identity. In production, build a versioned packet sidecar tied to that identity with a **single packet-only FFprobe pass** (`-select_streams v:0 -show_streams -show_packets -show_data_hash sha256`). Record video codec identity, dimensions, pixel format, extradata hash, and each packet's demux ordinal, integer PTS/time base, keyframe/discard flags, size, and SHA-256 payload hash. Stream-parse the probe output with bounded memory. Require the packet count to equal the existing decoded proxy frame count in `FrameMapValidator`'s validated map; reject unkeyed, empty, discarded, non-monotonic, or missing-PTS packets. Do not decode the whole proxy again for this sidecar. Measure its hash-pass and storage cost on a long proxy; do not assume it is strictly I/O-bound. Build on first preview request or opportunistically after exact readiness, whichever the prototype shows gives a responsive first preview without competing with movie preparation. Reuse an atomically published valid sidecar. Ordinary playback and exact-frame readiness never await it.

For a proxy whose measured time base permits exact input-seek expression, try `ffmpeg -ss START_PTS -i proxy.mkv -map 0:v:0 -an -c:v copy -frames:v N out.mkv`, with `N = End - Start + 1` and `START_PTS` formatted exactly from the indexed integer PTS and time base. The current FFmpeg Matroska proxy reports 1/1000, so three decimal seconds suffice for that profile; verify the time base for every candidate and fail or choose another proven selection method if it differs. Do not use the segment muxer. FFmpeg documents that input seeking with stream copy preserves packets from the preceding seek point; keyframe flags do not alone prove which ordinal is first. On **every** generated asset, compare all N output video-packet payload hashes with indexed proxy entries Start through End, the codec identity and extradata hash with the source proxy, and the full packet PTS sequence with the indexed sequence shifted by Start's PTS. Require first output PTS zero, exactly one video stream, and no audio. The matching packet count, payloads, codec configuration, existing decoded proxy count, and fixture-level profile proof are the production picture-identity gate; do not decode the asset per revision. Decode and compare complete picture identities in the reproducible probe and fixture tests to validate that inference and any seam variant. A mismatch fails preview generation with a recoverable error. Validate the actual output, including a Start=0 range, rather than relying on command-line semantics as proof.

Measure a range near the end of a long proxy to check that input seeking stays responsive. Keep a re-encode path as an unbuilt contingency unless packet copy fails the hash, timestamp, decoded-picture, or real-player gate. If needed, prototype `trim=start_frame=START:end_frame=END_PLUS_ONE` first in the video filter chain, `setpts=PTS-STARTPTS`, the existing GOP1 MPEG4 profile, and `-fps_mode passthrough`; check for any option that forces CFR, compare decoded picture identities and timing, and measure a late range because decoding from the beginning may be slow. Packet hashes cannot validate re-encoded pictures. Do not combine a video filter with `-c:v copy`; filtering decodes and requires re-encoding. Keep one proven production path. The [FFmpeg command reference](https://ffmpeg.org/ffmpeg.html) documents input seeking and `-frames:v`; the [FFmpeg formats reference](https://ffmpeg.org/ffmpeg-formats.html) documents concat duration directives and packet-hash formats, and [FFprobe](https://ffmpeg.org/ffprobe.html) can hash demuxed packet payloads with `-show_data_hash`.

### End duration, seam, and repeat decision

The proxy's indexed playback timeline is the timing authority for preview; do not use original-source timestamps to time a proxy loop. For End before the proxy's last frame, its intended hold is the difference between End's proxy PTS and the next proxy frame's PTS, even though that next picture is excluded from the asset. The proxy is not necessarily timestamp-identical to the original: its creator starts timestamps at zero, repairs duplicate/backward timestamps, and Matroska currently exposes millisecond ticks. These changes protect monotonic playback and can slightly alter intervals. Inspect whether this profile records a trustworthy duration for the proxy's final packet; Matroska can encode `BlockDuration`, but FFprobe's reported packet duration may be nominal. If End is the proxy's last frame and no trustworthy explicit duration exists, use the positive proxy PTS gap from the preceding frame as End's hold. Loop Preview requires at least two frames, and the packet index rejects non-monotonic PTS, so this gap exists. Treat this rare boundary as an approximation and check that it looks reasonable in the renderer; do not call it an exact source-derived duration. Do not use the proxy's overall duration without separating video from its audio stream.

First play the plain `[Start, ..., End]` asset under the player's own repeat and measure whether End is visible for a usable interval and whether restart causes a visible seam. If it fails, prototype a second asset with a copied Start packet placed after End at `End PTS + chosen End duration`. The normal range still contains exactly N pictures; this seam candidate deliberately contains a repeated Start picture. A concat demuxer with an explicit duration is one candidate assembly mechanism, not a guarantee of its output timestamp: inspect the resulting packet PTS, hash, decoded sequence, and actual renderer timing. A Start sentinel may move the pause to Start or lengthen Start across the file restart, so compare Start-to-Start cycle time and visible dwell before choosing it. Only if the seam remains visible, test a bounded K-repeat file, measure whether the larger asset makes a meaningful difference, and retain it only with a recorded size/latency benefit. The finite file still restarts. Do not introduce End+1 or stop playback by a clock boundary.

### Prototype procedure and evidence

Milestone 1 creates `tests/fixtures/frame-review-preview/` coded CFR/VFR sources and `tools/frame-review/probe-proxy-profile.mjs` for the proxy-profile check. Milestone 2 creates `tools/frame-review/probe-exact-preview.mjs` for the range asset and player gate. Use the staged FFmpeg tools and existing prepared-review creation, not arbitrary system FFmpeg. On PowerShell, the baseline is:

    npm run frame-review:verify
    powershell -ExecutionPolicy Bypass -File ./tools/frame-review/bootstrap-native.ps1
    powershell -ExecutionPolicy Bypass -File ./tools/frame-review/build-native.ps1
    powershell -ExecutionPolicy Bypass -File ./tools/gif-extraction/create-fixtures.ps1
    node ./tools/frame-review/probe-proxy-profile.mjs --create-fixtures
    node ./tools/frame-review/probe-exact-preview.mjs --create-fixtures --candidate=packet-copy
    node ./tools/frame-review/probe-exact-preview.mjs --play-in-electron --cycles=3 --candidate=packet-copy

The probes may skip bootstrap/build if `npm run frame-review:verify` already passes; document the skip. The Milestone 1 profile probe reports the executable paths, proxy profile/cache key, proxy time base and distinct PTS intervals, fixture packet-to-decoded-picture correspondence, a standalone-decode check for noninitial fixture packets, and packet-only index build/storage time. The Milestone 2 range probe reports fixture/source generation, ordinal pair, all copied payload-hash and codec-extradata comparisons, expected and decoded barcode sequence, full input/output PTS deltas including origin, chosen End duration and its evidence, absence of audio streams, asset byte size, first-preview delay under lazy and post-readiness background indexing, endpoint-revision latency, and cleanup result. Use `framehash -hash sha256` with explicit stream copy or FFprobe `-show_data_hash sha256`, not decoded-default `framecrc`/`framemd5`, when comparing packet payloads. Use argument arrays in `NativeCommandProcess`, not shell-built commands. Write scratch assets only inside a unique temporary directory under the prepared-review workspace and remove them in `finally` after dependent playback ends; keep diagnostic files only behind an explicit probe option.

Create independently recognizable frame numbers in the source video (for example, a high-contrast binary tile pattern encoded before proxy creation). Decode the generated plain asset's whole video stream to raw frames and read the tile pattern; compare the exact ordered list to `[Start, ..., End]`, or `[Start, ..., End, Start]` for a verified sentinel candidate. Packet count and FFprobe timestamps alone are insufficient. Use at least 24-fps CFR and nonuniform-PTS VFR with several-second ranges (for example, 48–144 and 40–120) if the prepared proxy retains distinct inter-frame intervals; inspect its index before fixing VFR assertions. Include Start=0, End=last, and a late range in a representative several-minute source; boundary-gap cases apply only if the proxy is VFR. Confirm actual fixture duration and selected PTS before choosing final ordinal values. Reject one-frame loops at the preview control; one-frame capture and extraction remain valid. Include a source with audio to prove the generated preview deliberately omits it and ordinary full-movie playback remains audible after stopping the loop.

Add a controlled Electron/native player probe that opens the generated asset through `LibVlcPlaybackEngine` and records a monotonic timestamp and the frame tile from each RGBA picture delivered to the canvas, plus sampled canvas images across Start, End, and wrap. A native callback proves delivery, not necessarily presentation; the Electron observations must establish that End actually appears. Play at 1× for at least three complete cycles for each relevant CFR/VFR fixture. Report cycle by cycle: first/last presented tile, observed picture list, out-of-range count, Start/End visibility and dwell, wrap ordering and delay, Start-to-Start wall time, and PTS-derived expected cycle time. Compare the plain slice, Start-sentinel candidate if needed, and K-repeat candidate only if an earlier measured seam warrants it. A rendered-frame loss can occur under load; distinguish a dropped interior frame from missed Start or End, and reproduce a boundary miss through ordinary controls and timing before judging it. Both boundary pictures must appear in every observed cycle; an out-of-range picture is always failure. Assess 1× using cycle elapsed time over repeated cycles and the indexed intervals, with measured scheduler/decoder variation stated; reject sustained faster/slower playback or a visible Start hold rather than demanding arbitrary timestamp equality. Record cold and warm preparation and endpoint-revision delay on the long fixture.

**Gate:** Continue to production work only if all output packet hashes, codec configuration, and timestamp deltas match the indexed slice; probe/fixture decoding confirms the expected picture sequence; real playback shows both endpoints and no outside picture over at least three cycles at usable 1× without a distracting seam; the preview is silent; ordinary full-movie audio remains available after preview; and indexing/creation/revision latency is usable in capture work without delaying ordinary movie readiness. If packet copy fails the picture or playback gate, compare the measured ordinal-trim/re-encode fallback under the same oracle. If boundary display, timing, or reasonable responsiveness cannot be established, stop this plan after logging evidence here and propose a revised solution for user review. Do not substitute a time-based loop or relax exactness silently.

### Intended production contract and lifetime

Subject to the gate, add a cohesive trusted `ExactPreviewSession`/asset producer under `src/frame-review/host/` rather than placing media work in `GifExtractionSession` or the separate extraction runtime. `ReviewSession` controls switching its existing LibVLC playback source between full proxy and bounded asset while its BestSource exact reader remains attached to the canonical source. The host owns all asset paths and FFmpeg arguments. The renderer sends only validated exact ordinal boundaries and source generation. The host checks both ordinals are safe integers, ordered, in the prepared frame count, and current; it never accepts a renderer-supplied path. The temporary asset has a revision token, one active owner, an abort signal for generation, and cleanup after playback relinquishes the file. Make canceled generations and stale native callbacks unable to reopen a previous asset.

Design a minimal typed command sequence after the prototype: `prepareExactPreview({startFrameIndex,endFrameIndex,sourceGeneration})` (nonblocking request with ready/error state), `startExactPreview()` (starts/restarts from Start only for the current ready revision), `stopExactPreview()` (restores full proxy and returns/displays a canonical exact frame inside the pair). A single combined command is acceptable if it makes races and call sites simpler; record the actual API in this plan. Three call sites to check before freezing it: draft marks change while a prior asset prepares; a locked range is selected while ordinary movie playback runs; Refine stages an endpoint then presses Z or Back. Extend `IFrameReviewSession`, the Electron adapter, `electron/frame-review-ipc.cjs`, `IFrameReviewHostSession`, `ReviewSession`, and the native LibVLC service only as required by the measured repeat mechanism. Source generation and preview revision must be explicit across asynchronous replies/events, with renderer and host both dropping stale results. Do not expose raw paths via IPC.

For Space, stop the bounded source, derive a canonical ordinal inside `[Start, End]` from the last reliable preview picture identity or the bounded asset's verified ordinal-to-PTS map, clamp it, restore the full proxy, and call `scrubToFrame` on the exact reader before reporting stopped. Do not turn the temporary asset's relative clock into a capture timestamp. The displayed position may differ from the last sampled playback picture. A/S bypass the asset, stop preview, and scrub directly to their canonical ordinals. Arrows, movie seeking, changing target/endpoint, screen departure, source replacement, and disposal cancel preview before acting. During a running loop, Q/W are disabled or explain “Press Space to stop preview before marking”; the keyboard handler must not issue a mark from the asset clock. If preview preparation/playback fails, preserve all endpoints and queue state, show a recoverable error, and keep exact scrubbing available.

## Milestone 1 - Establish the review proxy contract and packet index

### Scope

Prove that the current proxy profile supports ordered, independently decodable one-packet-per-picture selection, then add the packet-only sidecar without delaying existing movie preparation. This milestone does not assume an encoder change; it owns one if the profile proof requires it.

### Changes

- Add deterministic coded CFR/VFR sources under `tests/fixtures/frame-review-preview/`, a profile probe in `tools/frame-review/probe-proxy-profile.mjs`, and a retained conformance test in `tools/frame-review/tests/proxy-profile-contract.test.mjs`. Run the real `FfmpegProxyCreator` and pinned FFmpeg. Compare packet order/count/PTS with the decoded fixture pictures, check all packet flags, and independently decode a noninitial selection. Keep generated media out of the repository and ensure `npm run frame-review:test` runs the contract test.
- Add `src/frame-review/host/proxy-packet-index-cache.ts` as the packet-sidecar owner adjacent to `ExactReviewProxyCache`, with its typed index in `src/frame-review/host/proxy-packet-index.ts`. Stream-parse a single FFprobe packet/hash pass, verify packet count against the existing decoded proxy count, validate PTS and flags, and atomically cache the versioned result by proxy identity/profile. A missing or invalid sidecar rebuilds without changing the existing proxy, frame index, or map. Start lazily for this milestone; Milestone 2 compares first-preview latency with optional background construction after exact readiness. No ordinary playback or exact-frame readiness path awaits this sidecar.
- If the fixture gate fails because of the current proxy encoding, revise only `src/frame-review/host/ffmpeg-proxy-creator.ts` and its `FRAME_REVIEW_PROXY_PROFILE_ID` as needed, then regenerate the fixture proxy and repeat the profile and ordinary-playback checks. Record the new cache identity and the precise profile change here before proceeding. Do not modify the encoder merely to simplify the packet index.
- Update `Decision Log`, `Surprises & Discoveries`, and `Progress` with profile and sidecar evidence.

### Validation

Run `npm run frame-review:verify`, `node ./tools/frame-review/probe-proxy-profile.mjs --create-fixtures`, `npm run frame-review:test`, `npm run typecheck`, and targeted packet-index/cache tests. Success means every fixture packet has a matching decoded picture in order; a noninitial packet selection decodes independently; the sidecar count equals the existing proxy index count; cold and cached sidecar creation work; invalid sidecars rebuild; and ordinary playback and exact-frame readiness remain independent of sidecar construction. Record the hash-pass time and bytes on a representative long proxy. If the encoder changed, also run the normal-playback gate before proceeding.

### Rollback/Containment

An invalid packet sidecar is ignored and rebuilt without affecting the prepared proxy or existing review workflow. If a necessary encoder change breaks ordinary playback or exact-frame readiness, restore the prior profile, retain the probe evidence, and revise this plan before implementing preview. Do not add loop controls on an unproved profile.

## Milestone 2 - Prove the bounded loop asset and renderer

### Scope

Determine whether the verified proxy and packet index can produce a responsive, exact-picture silent loop at normal playback speed.

### Changes

- Add `tools/frame-review/probe-exact-preview.mjs` using the Milestone 1 packet sidecar and coded fixtures. Try video-only input-seek/frame-count packet copy first. Record full output-payload comparison, decoded-asset and on-screen playback, timing, absence of preview audio, and late-range preparation evidence.
- Compare lazy sidecar creation against opportunistic construction after exact readiness; record first-preview latency and any preparation/playback contention. Select the scheduling mode in `Decision Log` before production integration.
- Test a Start sentinel only if plain repeat has a measured seam; investigate video re-encode only in response to a measured failure under the identical oracle. Record the selected asset recipe and repeat behavior in the plan before proceeding.

### Validation

Run the range probe and its real Electron playback mode after `npm run frame-review:verify`. Success is the Exact proxy loop solution gate above, with full command outputs/exit codes and per-cycle Start/End evidence for representative several-second CFR and, if preserved by the proxy, VFR ranges.

### Rollback/Containment

If the gate fails, delete only probe scratch files that the probe owns, preserve evidence, and request review of a revised media solution. The Milestone 1 proxy and packet sidecar remain usable for diagnosis; no user-facing loop controls are added.

## Milestone 3 - Own exact preview in frame review

### Scope

Make verified asset generation, repeat playback, stop-to-exact-scrub, and cleanup available through the trusted frame-review session.

### Changes

- Add a focused producer in `src/frame-review/host/` using the Milestone 2 asset recipe and Milestone 1 packet sidecar. Apply the sidecar scheduling decision recorded in Milestone 2; neither ordinary playback nor exact-frame readiness awaits it. For every asset, compare all selected packet hashes and PTS, check codec identity/extradata and stream inventory, and reject any mismatch before exposing it for playback; do not run a production decode-and-compare pass. Reuse the bounded asset only for the same immutable source generation/endpoints, and cancel/delete obsolete work. Keep resource lifecycle with this owner, not the thumbnail owner or extraction runtime.
- Extend `src/frame-review/frame-review-api.ts`, `src/frame-review/host/frame-review-host.ts`, `src/frame-review/host/review-session.ts`, `src/frame-review/host/libvlc-playback-engine.ts`, `src/adapters/electron/electron-frame-review-service.ts`, `electron/frame-review-ipc.cjs`, and `electron/preload.cjs` only where the chosen contract requires. Validate typed input once at IPC/host boundaries. Extend `native/frame-review/media-service/libvlc_media_service.cpp` and `native/frame-review/libvlc-gate/` only if the existing play/end/open commands cannot repeat the verified asset without a boundary miss.
- Expose preparation/playing/stopping/error states and measured durations through existing state/event patterns without sending temporary paths to the renderer. Serialize source switches and stop/cleanup; late callback generations must be ignored.

### Validation

Run `npm run typecheck`, `npm run unit -- tests/unit/frame-review`, `npm run frame-review:test`, and the Milestone 2 media probe against the production owner. Add focused host/IPC tests for invalid ordinals, stale revisions, cancellation, source replacement, failed FFmpeg, failed playback, and cleanup after disposal. Expected: capture state survives failures; no obsolete asset plays or remains after owner disposal; the real player still meets the picture/timing gate.

### Rollback/Containment

Keep preview behind new commands until verified. On generation/playback failure, restore full proxy and exact scrub; leave the range model untouched. Revert only this milestone's preview service/commands if it cannot preserve those invariants.

## Milestone 4 - Add capture targets and controls

### Scope

Make draft, selected locked range, and staged Refine pair previewable by pointer and keyboard with the signed-off mappings.

### Changes

- In `src/app/gif-extraction-session.ts`, derive one active preview target from its draft or `selectedRangeId`; a new Q draft takes priority, selecting a card switches target, and removal/source change invalidates it. In `src/app/refine-gif-session.ts`, expose the staged exact pair without committing it. Keep the range model's lock/extraction rules unchanged. Centralize exact-pair readiness (both exact, current generation, ordered) near domain capture values, not duplicated per screen.
- In `src/ui/frame-review-player-control.ts`, coordinate direct ordinal jump, preview start/stop, Space, arrow/seek exit, display identity, and pending-render invalidation. Never treat a loop playback timestamp as a source capture point. Keep preview display time/range labeling clear and return to the full-movie timeline after stopping.
- In `src/ui/gif-workflow-keyboard-controller.ts`, map Q/W marks, A/S jumps, Z loop, X lock/commit, E extract, Space loop stop or ordinary toggle, and existing arrows; suppress repeats/editable/inactive screen as before. In `src/ui/gif-extraction-screen.ts`, `src/ui/refine-gif-screen.ts`, and `src/ui/gif-ranges-panel-control.ts`, add matching pointer controls, keycaps, active-target cue, a visible “Preview is silent” cue while looping, preparing/error messages, and disabled reasons. Keep Refine Back discard and Next inexact behavior. Update any shortcut guidance and `.impeccable/surfaces/src-ui-refine-gif-screen-ts.md` as part of UI work.

### Validation

Run `npm run typecheck` and targeted unit/integration tests: `npx vitest --run tests/unit/gif-workflow-keyboard-controller.spec.ts tests/unit/gif-extraction-session.spec.ts tests/unit/refine-gif-session.spec.ts tests/unit/frame-review-player-control.spec.ts tests/integration/ui/gif-extraction-screen.spec.ts tests/integration/ui/refine-gif-screen.spec.ts tests/integration/ui/gif-ranges-panel-control.spec.ts`. Add cases for each pointer/keyboard mapping, draft versus selected locked target, staged Refine without commit, timestamp/mixed disabled, silent-preview cue shown only while looping, loop Q/W guard, source/screen change, and Space-to-exact-arrow. Expected: UI and keyboard routes agree, no capture intent changes on preview, existing E and Refine behavior still work.

### Rollback/Containment

If controls expose an unproved or stale target, disable preview actions and preserve Q/W/X capture and Refine state while correcting the target derivation. Do not let the renderer bypass the host's ordinal validation.

## Milestone 5 - Verify the user-visible flow and update architecture

### Scope

Confirm behavior in the actual Electron app and keep the canonical agent documentation accurate.

### Changes

- Extend `tests/e2e/gif-extraction-capture.spec.ts` and `tests/e2e/gif-refinement.spec.ts` (or one focused `tests/e2e/gif-exact-preview.spec.ts`) to exercise draft, locked, and staged targets; key and pointer controls; exact versus timestamp disabled behavior; three-cycle coded CFR/VFR preview; Space/A/S exact scrub; and target/source/screen cancellation. Reuse the Milestone 2 picture decoder/oracle rather than asserting only clock/state/screenshot. Assert that the preview asset has no audio stream and the silent cue follows preview state. Keep an actual-app manual script to confirm the loop is silent, full-movie audio returns when playback resumes, and perceived 1× motion is usable.
- Update the relevant `docs/agent-docs/` pages through `doc-update` with the preview owner, IPC contract, temporary asset lifecycle, target-selection rule, and keyboard mapping. Keep historical specs/plans as history. Review against `coding-quality.md` and record any justified deviations here.

### Validation

Run `npm run typecheck`, `npm run unit`, `npm run frame-review:test`, `npm run build`, targeted `npx playwright test tests/e2e/gif-exact-preview.spec.ts tests/e2e/gif-extraction-capture.spec.ts tests/e2e/gif-refinement.spec.ts` (adjust the focused filename if needed), and `git diff --check`. Run the actual Electron app with the generated coded CFR and VFR sources: create a several-second draft, inspect A/S, loop three times in silence with the cue visible, stop with Space and step, resume full-movie playback and confirm its audio, lock with X, select/preview the locked card, refine a staged pair then Back, and change source during preparation. Record observed picture identities, measured cycle/preparation times, silent-preview/full-movie-audio behavior, and failures. A native E2E run is only called green if its entire output and exit code are captured; report any unrelated playback-resumption flake separately.

### Rollback/Containment

If real UI playback misses a boundary or leaks a stale asset, keep the feature unfinished, reproduce the user-visible consequence, and return to the Milestone 2 gate and `Decision Log`. Do not claim completion from mock tests or an isolated successful screenshot. The app must still permit ordinary capture and exact scrub after a preview failure.

## Sign-off and execution rule

The current task ends after this plan is reviewed and signed off. Implementation begins only after plan sign-off per `AGENTS.md`. During execution, update every living section as evidence arrives and revise the plan before deviating from the signed-off exactness requirement.
