# Make exact clip extraction local to each range

## Why this matters

`Extract All` currently scans frame timestamps across the original movie for every clip and decodes video from the start each time. A few seconds near the end of a three-hour movie can therefore take minutes. Deliver faster exact clips, a visible account of what is happening, and a safe way to stop. The signed-off behavior contract is `docs/specs/faster-exact-extraction-spec.md`.

An **ordinal** is a frame's numbered position in the selected original video stream. A **presentation timestamp** (PTS) is when that frame is presented in the media timeline. A **keyframe** can begin decoding independently; a seek commonly lands on a keyframe before the requested time. **Pre-roll** means decoding frames from that keyframe up to the selected first frame. The prepared review proxy has a validated 1:1 ordinal mapping to the canonical source, but FFmpeg input seeking takes time, and its `select` filter's `n` counter starts with frames entering that filter after the seek. The original ordinal therefore cannot simply be passed to `-ss` or reused as post-seek `n`. [FFmpeg documents input seeking and the select filter](https://ffmpeg.org/ffmpeg.html), [select `n` and `pts`](https://ffmpeg.org/ffmpeg-filters.html#select_002c-aselect).

## Progress

- [x] (2026-10-06) Feature behavior signed off; current extraction path and prepared index inspected.
- [x] (2026-10-06) M1: Prove a bounded seek and exact frame/audio mapping on representative sources, recording baseline and candidate timings.
- [x] (2026-10-06) M2: Add trusted original-source boundary metadata and the guarded fast extraction path with exact fallback.
- [x] (2026-10-06) M3: Add correlated progress, visible status, and Cancel with publication-safe state transitions.
- [x] (2026-10-06) M4: Verify automated behavior and the actual long-movie workflow; update architecture documentation.

Evidence logs: keep prototype output and measurements under `tests/fixtures/gif-extraction/generated/` or a temporary directory, not in source control. Record source type, clip ordinals, cache state, commands, frame comparison, audio comparison, and stage timings in a concise result file. Never put the user's full source path in committed output.

## Skill Gates

Planning-time gates:

- `working-with-users-and-team`: interpreted the long-movie problem and confirmed progress, Cancel, and automatic exact fallback.
- `api-and-interface-design`, `domain-modeling`, `typescript-coding`, `coding-quality.md`: define one owner for source-bound metadata and batch state; keep IPC progress correlated and typed.
- `error-and-correctness-traps`, `testing-discipline`: require checked timebase conversion, bounded native output, meaningful fallback causes, and independent media checks.
- `plan-review`: review this plan before sign-off and after substantial revisions.

Execution-time gates:

- `using-97`, `typescript-coding`, `api-and-interface-design`, `writing-clean-code`, `security-and-trust-boundaries`: before changing TypeScript, native-process inputs, exported contracts, or UI behavior.
- `bugfix-by-failing-test`, `testing-discipline`, `error-and-correctness-traps`: before tests and process/cancellation/seek changes.
- `observability`: before adding progress events and stage timing.
- `doc-update`: when the durable extraction boundary or progress contract changes `docs/agent-docs/`.
- `plan-review`, `pre-commit-self-review`, `finishing-a-development-branch`: before final handoff or integration.

Unavailable skills or fallbacks: none known. Recheck the current skill list when executing; the repository's `coding-quality.md` governs structure where guidance differs.

## Surprises & Discoveries

- The current `defaultProbeFrameTimes` in `electron/clip-extraction-runtime.cjs` runs `ffprobe -show_frames` over the entire source per clip. `encodeVideo` uses movie-wide `n` without a seek. `finalizeMedia` opens audio from the source beginning.
- `BestSourceFrameIndexer` already builds a persistent source index. The native gate can ask `GetFrameInfo(ordinal)` for timestamps and keyframe flags without decoding all preceding pictures. For sources that needed timestamp normalization, that canonical index describes the normalized file; its timestamps cannot automatically seek the original file.
- The prepared cache entry for the user's currently selected long movie records no normalization and about 249,000 frames. This makes the ordinary original-index path plausible for that movie, but is not proof that its seek and output will pass validation.
- `ClipExtractionWorkflow.cancel()` currently marks the active range cancelled before the native result is known. This must change because media may already have been copied or collection publication may be underway.
- The renderer already has an operation-scoped AbortController route: `ElectronClipExtractionService.cancelCurrent()` calls extraction IPC, which aborts the active FFmpeg/FFprobe child. Safe cancellation also requires waiting for process exit, cleaning the temporary directory, and resolving any publication already committed.
- FFmpeg has machine-readable `-progress pipe:1` records at a configurable `-stats_period`; those records report encoding work but do not describe source inspection or collection publication. See [FFmpeg's progress option](https://ffmpeg.org/ffmpeg.html).
- The already open native review session exposes indexed `identity` reads. A bounded host method can collect the requested window without a new native command. This changes M2's anticipated file list, not the source-index or validation contract.
- FFmpeg `showinfo` can log one frame beyond `-frames:v` because it sits before the output frame cap. The first capped frame sequence still matches the index; final output frame count is checked separately with FFprobe.
- The old full-decode video command selected the chosen ordinal range but did not cap its output count. During a controlled reference run it continued decoding after the selected range; both the fallback and the reference command now stop after the expected number of output frames.

## Decision Log

| ID | Decision | Rationale | Date |
| --- | --- | --- | --- |
| D1 | Reuse the prepared BestSource index for original-source frame metadata when canonical source and original source are the same. Query the selected range through the following frame; do not build a second whole-movie FFprobe timeline. | The existing 1:1 mapping supplies ordinals, while the index supplies original timing needed for an FFmpeg seek. | 2026-10-06 |
| D2 | Request an FFmpeg input seek five seconds before the indexed start; FFmpeg locates its preceding decodable point. Select the requested PTS interval from that decode and compare every emitted pre-encode PTS with the index's expected ordered sequence before publication. Require strictly increasing, unambiguous PTS in the selected window and the expected final output frame count. | A local seek is fast only if its output can be tied back to the original ordinals. Exact integer timebase comparison catches any rounded seek-boundary error; unusual long keyframe intervals can fail back safely. | 2026-10-06 |
| D3 | Use the existing exact full-decode method for a clip when the source needed timestamp normalization, original PTS/keyframe mapping is missing or ambiguous, local seek/PTS verification disagrees, or the media fails its output checks. If fallback also fails, publish nothing for that clip. | These are concrete cases where the proxy ordinal alone does not establish a safe original-file seek. They should be uncommon for ordinary indexed sources, including the current movie, but must be measured rather than assumed. | 2026-10-06 |
| D4 | Derive audio start and end from original-source frame timing; seek the original audio input near start, trim against the original timeline, and compare decoded samples against a full-decode reference. | Proxy or normalized timing can shift audio. Audio seeking needs independent proof. | 2026-10-06 |
| D5 | Send operation-ID-correlated, bounded stage events from main to renderer. Parse FFmpeg `-progress pipe:1` for output-frame counts during encoding; show stage and batch counts throughout, for example `Clip 2 of 3 · Encoding video · 18 of 39 frames`. No overall percentage or ETA. | FFmpeg cannot describe all workflow stages. Counts and stage names are truthful even when duration is unpredictable. | 2026-10-06 |
| D6 | Cancel is a request, not an immediate terminal result. Abort the active child while extracting, wait for exit and cleanup, then resolve the result. Once media copy or collection publication has crossed its commit point, complete or recover publication before stopping later ranges. | Killing FFmpeg alone would not settle the publish race or preserve completed media. | 2026-10-06 |
| D7 | Reuse existing source/index caches and destination semantics; add no dependency or new durable capture format. | The missing capability is bounded metadata access and guarded media work, not another persistent copy of the movie. | 2026-10-06 |
| D8 | Use the existing native indexed `identity` request through a host-owned bounded window, capped at 5,000 frames, instead of adding a new native batch command now. | It supplies the same per-frame original PTS and source binding; the three real saved ranges completed through the local route. A future batch command could reduce metadata latency if measurements justify it. | 2026-10-06 |

## Validation gates

| ID | Milestone | Proves | Needs milestones | How to check | Expected |
| --- | --- | --- | --- | --- | --- |
| G1 | 1 | Nearby seeking can be mapped to the selected original frames and audio; candidate is actually faster on a late range. | 1 | `powershell -ExecutionPolicy Bypass -File .\tools\gif-extraction\probe-fast-extraction.ps1` | Result file records exact frame-sequence match, bounded audio difference, and baseline/candidate timings on named synthetic fixtures; any unsupported case is identified for fallback. |
| G2 | 2 | Fast path and fallback preserve frame boundaries and output safety. | 2 | `npx vitest --run tests/unit/clip-extraction-runtime.spec.ts`; `npm run frame-review:test`; both `probe-fast-extraction*.ps1` scripts | Fast cases read a local region; ambiguity/normalization declines the fast route; failed local finalization retries exact extraction after cleanup. Native indexed identity tests and independent media comparisons pass. |
| G3 | 3 | Users can understand and safely stop one or many clips. | 3 | `npx vitest --run tests/unit/clip-extraction-workflow.spec.ts tests/unit/electron-clip-extraction-service.spec.ts tests/integration/ui/gif-ranges-panel-control.spec.ts` | Active clip/stage/count and fallback appear; Cancel waits for result, prevents later clips, and preserves a clip committed before cancellation. |
| G4 | 4 | Complete product flow and regression checks pass. | 4 | `npm run typecheck`; `npm run unit`; `npm run frame-review:test`; `npm run e2e`; `git diff --check` | All commands finish with exit code 0. E2E covers extraction and normalized-source fallback; the real-app check covers Cancel/retry without duplicate collection entries. |
| G5 | 4 | Long-movie speed and exactness are user-visible in the actual app. | 4 | Run the app with the user's source and its saved ranges; compare outputs with a full-decode reference and inspect progress/Cancel/retry. | Stage timings and output checks are recorded; the saved-range batch avoids repeated whole-source work and succeeds or each fallback/failure is explained. The separate late-range fixture checks a position near the source end. |

## Outcomes & Retrospective

On the prepared-cache movie, all three saved ranges (around 10-13 minutes into a 2-hour-53-minute source) used the local route and were published as clips 002-004 with 39, 32, and 69 video frames, audio streams, and collection membership. The app showed the current clip and stage throughout; the batch completed roughly 30 seconds after extraction began, including source checks for each clip. The first range's saved decoded frames matched all 39 frames of an independent original-source full-decode reference. That reference video stage took 19.6 seconds with a frame cap; the observed local video stage for the same range was under one second. These are one warm-cache run and one baseline measurement, not a general speed guarantee. A near-end range on this particular movie was not measured; the synthetic late-range probe covers that source position shape.

The synthetic long-GOP fixture matched all 24 video frames and 48,000 audio samples against the full-decode reference (audio correlation 0.999918). Its measured local video stage was 239.9 ms versus 468.5 ms for full decode in the same run. Seven further ranges across constant and variable frame rates, no audio, nonzero timestamp origin, one-frame clips, and final frames matched source frame hashes. The existing original-source timestamp-normalization fixture completed through the exact fallback in the app. A real Cancel during fallback left the active range retryable and later ranges pending; the following full batch succeeded without duplicate collection entries.

The first diagnostic uncovered FFmpeg's one-frame `showinfo` lookahead before its output cap; validation now checks the emitted sequence and separately checks the final media frame count. The reference run also exposed that the old full-decode command continued through the rest of the movie after selecting its clip; the fallback now stops at the expected frame count. Source checking still takes several seconds per clip on the user's long movie. The current bounded indexed-identity read can be batched in a future optimization if that cost becomes material.

## Context and orientation

Start with `docs/agent-docs/agent-architecture-map.md` and the signed-off spec. `GifExtractionSession` in `src/app/gif-extraction-session.ts` owns the opened movie and exposes `extractAll`, `extractRange`, and `cancelExtraction`. `ClipExtractionWorkflow` in `src/app/clip-extraction-workflow.ts` owns ordered ranges and publication outcomes. `ClipExtractor` in `src/business-logic/clip-extractor.ts` validates exact-only requests. The Electron adapter in `src/adapters/electron/electron-clip-extraction-service.ts` calls the trusted IPC boundary in `electron/clip-extraction-ipc.cjs`, which invokes `ClipExtractionRuntime` in `electron/clip-extraction-runtime.cjs`. That runtime obtains the original source and prepared index through `FrameReviewHost`, runs FFprobe/FFmpeg, verifies temporary media, and exclusively copies the finished MP4. `ExtractionDestinationSession` then publishes collection membership. `GifRangesPanelControl` and Refine Gif show the shared capture state. The current media settings and provenance contract must remain intact.

Use PowerShell syntax on Windows. The native tools require the project's staged runtime environment; use `tools/gif-extraction/media-proof-common.ps1` to resolve them. Recheck `git status --short` before editing: this checkout has unrelated uncommitted changes, which must be preserved. Do not execute this plan until the user signs it off under `AGENTS.md`.

## Milestone 1 - Establish the media proof

### Scope

Resolve the exact FFmpeg seek/selection recipe and its limits before production edits. Hypothesis: original indexed PTS and a nearby keyframe can identify the same ordered pictures as full decoding while only decoding a local region.

### Changes

- File: `tools/gif-extraction/probe-fast-extraction.ps1` (new). Extend the existing media-proof helpers and `benchmark-recipes.ps1` fixture pattern. Produce constant-frame-rate, variable-frame-rate, long-keyframe-interval, nonzero-origin, and repaired-timestamp fixtures. Run full-decode reference and candidate extraction for one-frame, mid-range, late-range, and end-of-source clips. Use lossless video solely for frame comparison, and compare decoded PCM audio with an explicit sample-position tolerance.
- File: `tests/fixtures/gif-extraction/manifest.json` if needed. Register only deterministic fixture recipes, not large generated movies.
- Prototype input `-ss` near the preceding indexed keyframe, preservation of source PTS, an output cap at the expected number of frames, and an input read limit shortly after the end boundary. Capture the selected frames' original PTS before `setpts`; compare their complete ordered sequence with the index. Use integer/rational comparisons after rescaling timebases. A pass requires matching frame content in the lossless proof, matching frame count/order, bounded audio alignment, and lower measured late-range time. A mismatch makes that source shape an explicit fallback case or changes D2 before M2.

### Validation

Gate: G1. Record actual FFmpeg arguments, exit codes, timings, and why each source did or did not qualify. Keep the user's source and personal paths out of committed fixtures.

### Rollback/Containment

The probe creates only disposable generated media. If the hypothesis fails, leave production untouched, update D2/D3 with the observed limitation, and use a different indexed/local extraction method before M2.

## Milestone 2 - Guarded local extraction

### Scope

Replace repeat full-source work for qualifying clips, while retaining the exact fallback in the same trusted runtime.

### Changes

- File: `src/frame-review/host/frame-review-host.ts`. Reuse the already open BestSource session's metadata-only identity request to return a bounded window from start through end-plus-one, capped at 5,000 frames. Reject index/source mismatch and ambiguous or non-increasing PTS. For a final source frame, derive the end boundary from its indexed duration only after validation. D8 records why no new native command was needed.
- File: `electron/clip-extraction-runtime.cjs`. Split original-source boundary resolution, guarded local video encode, nearby audio mux, and existing exact fallback into cohesive runtime-owned operations. Preserve quality settings, original stream selection, provenance, no-overwrite publication, and temp cleanup. Check source identity before use, compare FFmpeg-selected source PTS and frame count to the indexed proof before publishing, and independently verify temporary output streams. Bound process stdout/stderr and any per-frame verification data. On fast-path qualification or verification failure, remove its temporary output before trying fallback; do not run both methods after a cancelled signal.
- Files: `tests/unit/clip-extraction-runtime.spec.ts`, the existing native frame-review tests, and the independent media proofs. Cover a valid indexed window, normalization, duplicate PTS, FFmpeg lookahead, failed local finalization followed by exact fallback, and output publication. The media proofs cover one/end frame, variable frame rate, decoded picture identity, and nearby audio alignment.

### Validation

Gate: G2. Use M1's independent frame/audio oracle; a runtime count alone is not sufficient proof of frame identity.

### Rollback/Containment

Keep the current full-decode implementation callable. If local extraction fails for a source, use D3 without publishing its candidate; do not weaken the exactness tests to make the fast path pass.

## Milestone 3 - Progress and safe Cancel

### Scope

Expose what the batch is doing and connect the existing cancellation route to a visible control without corrupting publication state.

### Changes

- Files: `src/frame-review/clip-extraction-api.ts`, `src/business-logic/clip-extractor.ts`, `src/adapters/electron/electron-clip-extraction-service.ts`, `electron/clip-extraction-ipc.cjs`, `electron/preload.cjs`. Add a narrow progress callback/event contract with operation ID and a closed set of stages. Main emits stage changes; during video encoding it parses FFmpeg `-progress pipe:1` records (`frame` and `progress`) as bounded, throttled output. The adapter validates and forwards only events for its current operation; it ignores late events after completion or source switch. Source paths, raw stderr, and untrusted process text do not cross IPC.
- File: `electron/clip-extraction-runtime.cjs`. Extend `runProcess` to stream progress rather than accumulate unbounded output. Abort the active child on Cancel, wait for its close, and remove the operation's temporary directory. Check abort before exclusive media copy. If the copy has already committed, return the created-media result even if Cancel arrived, so collection membership can be resolved.
- Files: `src/app/clip-extraction-workflow.ts`, `src/app/gif-extraction-session.ts`. Represent running/cancelling and current stage/count in one batch snapshot. Stop marking a range cancelled at button press. During encoding, request native abort; during media or collection publication, finish or resolve that publication, then stop. Leave unstarted ranges pending, preserve publication-failed retry without re-encoding, and report a truthful cancelled/completed summary.
- Files: `src/ui/gif-ranges-panel-control.ts`, `src/ui/refine-gif-screen.ts`, `index.html`. Place the status and keyboard-accessible Cancel at the point of extraction in both screens; keep `Extract All` disabled while a batch runs, retain visible per-range outcomes, and announce stage/count changes accessibly without flooding live regions.
- Files: `tests/unit/clip-extraction-workflow.spec.ts`, `tests/unit/electron-clip-extraction-service.spec.ts`, `tests/integration/ui/gif-ranges-panel-control.spec.ts`, `tests/e2e/gif-extraction-output.spec.ts`. Cover Cancel during encode and after media copy, stale events, fallback notice, batch counts, focus/keyboard access, and retry after restart.

### Validation

Gate: G3. Use observable state and media/collection outcomes rather than fixed waits or private DOM details.

### Rollback/Containment

The existing abort path and per-range outcomes remain the safety net. If progress parsing fails, keep the stage name and clip count visible; do not invent a percentage. If cancellation races publication, prefer a recoverable publication-failed state to an incorrect cancelled state.

## Milestone 4 - Product acceptance and documentation

### Scope

Prove the signed-off user goal, including the actual long movie and full batch.

### Changes

- Files: `tests/e2e/gif-extraction-output.spec.ts` and M1's probe. Keep E2E focused on extraction, Cancel, retry, and collection results; keep detailed frame/audio comparisons in the media proof. Compare before/after stages for same source and ordinals, with cold/warm cache called out. Run a complete batch on the user's long movie without overwriting prior clips; inspect frame sequence, audio, progress, cancellation/retry, and collection membership.
- File: `docs/agent-docs/agent-architecture-map.md` and the relevant extraction agent document if the new boundary requires one. Document the source-index query, fast/fallback rule, progress ownership, and publication-safe Cancel behavior. Apply `doc-update` and a final `coding-quality.md` review.
- File: this plan. Mark gates and evidence, record measured results, limitations, and any decision changes in the living sections.

### Validation

Gates: G4, G5. If the actual movie takes the fallback or remains slow, report that plainly and continue diagnosis rather than claiming the speed goal from fixture results.

### Rollback/Containment

Do not publish a candidate clip when any exactness check fails. Preserve the existing exact path and saved captures. If product acceptance fails, keep the implementation unshipped or revise D2 with a new proof milestone.

## Rejected alternatives

- R1: Pass the movie-wide frame ordinal straight to FFmpeg after `-ss` - rejected because `select` counts frames entering the post-seek filter, not movie-wide frames; superseded by D2.
- R2: Seek using proxy or normalized-source time alone - rejected because these clocks may differ from the original container; superseded by D1 and D3.
- R3: Treat Cancel as an immediate range failure as soon as the button is pressed - rejected because publication may already have committed; superseded by D6.
- R4: Display an overall percentage from FFmpeg - rejected because FFmpeg does not cover inspection, fallback, and publication; superseded by D5.
