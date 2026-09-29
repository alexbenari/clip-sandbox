# Persist GIF captures per movie and embed extraction provenance

## Why this matters

Users should be able to lock GIF ranges, leave the screen or app, and return to the same unfinished work. A newly extracted MP4 should carry the source movie identity and inclusive original frame ordinals independently of the capture queue. This also prepares a future feature that finds the verified source and extends an extracted clip beyond its current boundaries; source finding and extension are outside this plan. The approved behavior is in `docs/specs/persistent-gif-captures-and-extraction-provenance-spec.md` (signed off 2026-09-27, refined 2026-09-28). The revised formats and execution plan were approved 2026-09-28.

## Progress

- [x] (2026-09-27 15:57Z) Reconcile the signed-off spec with the current architecture and code paths.
- [x] (2026-09-28) Confirm the native sampling profile and stream digest inputs; prepare complete queue and MP4 provenance examples.
- [x] (2026-09-28) Obtain user approval of the fingerprint, queue and MP4 provenance formats and this revised plan.
- [x] (2026-09-28) Confirm the non-disruptive exact-identity lookup and source-identity handoff with focused native and unit tests.
- [x] (2026-09-28) Persist and restore locked ranges as validated per-movie data.
- [x] (2026-09-28) Reopen the last movie and coordinate asynchronous queue updates through Electron.
- [x] (2026-09-28) Embed and read back optional MP4 provenance without making metadata a condition of extraction success.
- [x] (2026-09-28) Run end-to-end user workflows, update agent architecture docs, and complete self-review.
- [x] (2026-09-28) Extend the approved queue to persist exact and approximate drafts after the user's follow-up; remove the discard prompt, order reads after pending saves, and verify switch/restart/lock behavior.
- [x] (2026-09-28) Show a Clips-panel loading status from last-movie lookup through queue attachment, and clear it on empty, failed, or completed restore.

## Skill Gates

Planning-time gates applied: `using-97`, `domain-modeling` (movie queue and durable-state ownership), `api-and-interface-design` (domain data, Electron IPC, format writer contracts), `typescript-coding`, `security-and-trust-boundaries` (saved JSON, paths and grants), `error-and-correctness-traps` (async writes, process calls and failure contracts), `testing-discipline` (behavioral acceptance checks), `working-with-users-and-team` (approved scope), plus `coding-quality.md` and the agent architecture map. `impeccable` guided the signed-off spec's recovery and warning behavior; this plan introduces no new visual design.

Execution-time gates applied: `using-97`, `typescript-coding`, `writing-clean-code`, `api-and-interface-design`, `domain-modeling`, `security-and-trust-boundaries`, `error-and-correctness-traps`, `observability`, `testing-discipline`, `doc-update`, and `pre-commit-self-review`. `before-you-refactor` governed the shared capture/session changes. `using-git-worktrees` was reviewed; the existing checkout on branch `codex/persistent-captures-provenance` retained the approved untracked plan and native build without moving or deleting unrelated work. `coding-quality.md` was reread for the final boundary review.

Availability: all named project skills are present. Tavily authentication was unavailable during the first spec research pass; the follow-up Tavily search and extraction on 2026-09-27 succeeded. Official FFmpeg documentation, FFmpeg muxer source, Apple metadata documentation, and a local bundled-FFmpeg/FFprobe round trip support the MP4 decision.

## Surprises & Discoveries

- `GifExtractionSession.replaceSource` originally created a new `RangeCaptureModel` for every selection, and `hasCapturedIntent` asked to discard even locked ranges. The initial implementation kept draft-discard confirmation; the user's later correction made drafts durable too and removed the prompt.
  Evidence: `src/app/gif-extraction-session.ts` `openMovie`, `replaceSource`, `hasCapturedIntent`.
- A prepared-review cache identity contains tool and preparation versions as well as source fields. Movie identity must use a separate versioned subset of the source-content fields.
  Evidence: `src/frame-review/host/source-inspector.ts` and `src/frame-review/host/exact-review-proxy-cache.ts`.
- The native signature tool called with `--compact` uses profile `sampled-packets-3m-3m-3x1m-v1`: up to three minutes at each end and three deterministic one-minute middle segments, merging overlaps. Its `streamMetadataDigest` hashes video codec ID/tag, width/height, codec extradata length and bytes. It does not hash title, artist, audio metadata or the source path. The sample digest already incorporates this digest and the profile label; their explicit fingerprint fields make identity inputs inspectable.
  Evidence: `native/frame-review/bestsource-gate/media_sample_signature.cpp` and `src/frame-review/host/source-inspector.ts`.
- `ReviewSession.scrubToFrame` pauses playback. Endpoint validation cannot use that visible-player command. `BestSourceFrameReader.exact` obtains canonical identity, but the implementation must check whether using its reader changes the user's next-step position.
  Evidence: `src/frame-review/host/review-session.ts`, `src/frame-review/host/bestsource-frame-reader.ts`.
- Final extraction is a second FFmpeg mux after video encoding, so metadata failure can be retried at that stage without repeating video encoding. The current media result has no warning field.
  Evidence: `electron/clip-extraction-runtime.cjs`, `src/frame-review/clip-extraction-api.ts`.
- Existing extraction already checks that requested ordinals exist via FFprobe's frame list, selects those ordinals in FFmpeg, and verifies the output has a video stream. It does not compare a saved endpoint's decoded-frame hash against a freshly indexed source. Extend that existing path rather than repeat its full frame scan.
  Evidence: `src/business-logic/clip-extractor.ts` and `electron/clip-extraction-runtime.cjs` (`defaultProbeFrameTimes`, `allocateAndExtract`, `defaultVerifyMedia`).
- Tavily follow-up found that FFmpeg's `+use_metadata_tags` sends **every** movie-level metadata key through the `mdta` writer and selects that branch instead of its ordinary iTunes metadata branch. It is a mux-wide representation choice, not an isolated app tag. The 4 KiB provenance cap is this app's safety bound, not a documented MP4 container limit. Check ordinary output tags and downstream clip behavior as well as our custom tag; do not assume their representation stays the same.
  Evidence: [FFmpeg muxer source, `mov_write_mdta_keys_tag` and `mov_write_meta_tag`](https://ffmpeg.org/doxygen/7.1/movenc_8c_source.html), [FFmpeg muxer options](https://ffmpeg.org/ffmpeg-formats.html), and [Apple metadata atoms and types](https://developer.apple.com/documentation/quicktime-file-format/metadata_atoms_and_types).
- Renderer shutdown is best effort; Electron main's `before-quit` barrier is the authoritative place to flush trusted capture writes.
  Evidence: `src/app/application-shutdown-coordinator.ts`, `electron/main.cjs`.
- BestSource's `GetOriginalFrameNumber` remaps only when variable-format filtering is enabled; this app opens the canonical index with `VariableFormat = -1`. The extraction runtime explicitly rejects an ordinal mismatch before writing provenance. A separate native `thumbnail` command reads a saved start frame without changing the adjacent-step cursor.
  Evidence: `tools/frame-review/.deps/bestsource-source/src/videosource.cpp`, `native/frame-review/media-service/bestsource_media_service.cpp`, and `tools/frame-review/tests/native-service-contract.test.mjs`.

## Decision Log

- Decision: Store capture records in `path.join(app.getPath('userData'), 'clip-captures')`, one versioned bounded record per movie plus a last-active pointer. Use a content fingerprint independent of cache build versions.
  Rationale: Approved by user; durable work should not live beside the executable or in ephemeral cache folders.
  Date/Author: 2026-09-28 / user and Codex; directory name updated from the 2026-09-27 choice.
- Decision: Domain ranges convert to and from validated plain data; the main-process store owns JSON, safe filenames, atomic writes and path hints. The renderer receives no persisted source path.
  Rationale: Keep range invariants close to the model and trusted file access behind Electron.
  Date/Author: 2026-09-27 / user and Codex.
- Decision: A failed/cancelled/interrupted extraction returns to pending after restart; a provenance failure warns while otherwise successful media and Collection publication succeed.
  Rationale: User accepted simpler durable queue semantics and optional clip metadata. A crash between media creation and membership save can leave an output that a later retry duplicates; do not claim duplicate prevention.
  Date/Author: 2026-09-27 / user and Codex.
- Decision: Keep the approved MP4 `mdta` approach, but gate it on a tagged-versus-untagged check of ordinary output tags and actual clip playback/Collection loading. Reassess the MP4 writer if that comparison finds a user-visible regression.
  Rationale: FFmpeg's flag changes the metadata representation for all movie-level keys, which the initial round trip with only a custom tag could not expose.
  Date/Author: 2026-09-27 / Codex after Tavily follow-up.
- Decision: Use `clip-captures` in new store/IPC/service filenames, types, and the on-disk directory.
  Rationale: `Clip` is the app's naming convention and the user explicitly renamed the directory.
  Date/Author: 2026-09-28 / user and Codex.
- Decision: Save compact exact endpoints (ordinal, decoded-frame hash, review display time); use `clip-sandbox.prov.v1` as the MP4 key. Rehydrate live frame identity from the current index on demand.
  Rationale: The user rejected storing derivable live frame fields and approved the revised examples and plan.
  Date/Author: 2026-09-28 / user and Codex.

## Outcomes & Retrospective

Implemented per-movie locked capture records and the active unfinished draft under `userData/clip-captures`, the last-active pointer, trusted fingerprint reattachment, lazy hash validation for exact endpoints, non-disruptive restored thumbnails, and optional MP4 `clip-sandbox.prov.v1` metadata with warning-only fallback. Extraction status and thumbnail resources remain session-only. The output contract is a constructor-injected MP4 writer at the runtime boundary; a format registry is intentionally deferred until another output container exists.

Verification: `npm run typecheck` passed; `npm run unit` passed 385/385 tests; `npm run frame-review:build` passed; the native service contract passed 3/3 tests, including a compact fingerprint golden result and a thumbnail/adjacent-step cursor check; `npm run e2e` passed 28/28 Electron tests. Targeted actual-app Electron cases showed A→B→A queue order, screen switches, app restart, automatic thumbnail recreation, missing-source recovery through Open movie, restored exact extraction, and completed capture removal after another restart. Bundled FFprobe read the custom tag from a published MP4 and checked its source and inclusive frame ordinals; Collection loaded the output. A local tagged/untagged mux comparison confirmed FFprobe can read the same ordinary `title` and `encoder` tags in both outputs. Unit tests covered a provenance mux failure that still publishes verified media with a warning, corruption preservation, stale-fingerprint refusal, and coalesced writes. No new compiler warnings or test failures were observed. The only test adjustment was narrowing a duplicated status locator in the new recovery scenario.

Tradeoffs: A sampled fingerprint is not a full-file integrity proof; saved endpoints supply a second on-demand check. The current BestSource canonical open uses `VariableFormat = -1`, so its original-frame mapping is the identity; extraction rejects a future mismatched mapping instead of embedding misleading ordinals. The approved crash window between media creation and Collection membership still permits a duplicate output on a later explicit retry. MP4 metadata may be removed by another editor without making the clip unusable. The implementation follows `coding-quality.md` class and boundary guidance; no deliberate structural deviation remains.

Final review after draft persistence: `npm run typecheck`, `npm run unit` (390/390), `npm run build`, the focused Electron movie-switch/restart case, and `git diff --check` passed. The Electron case covers a complete exact draft returning without a discard dialog and locking after restart. Focused domain and store tests cover approximate and mixed draft round trips, malformed draft rejection, old records without a draft field, and reads ordered after pending writes. The last test failed on the previous store behavior (read sequence 1 instead of 2) before the fix and passed after it. Saved ranges with an unavailable movie disable thumbnail retry as well as Refine and Extract.

Loading-status follow-up: `GifExtractionSession` now exposes an explicit capture-loading state, and `GifRangesPanelControl` shows “Loading saved captures…” in place of its empty copy while the queue is being checked or attached. The state clears on success, no saved movie, unavailable source, or preparation failure. The two focused tests failed before the change and passed after it; `npm run typecheck`, `npm run unit` (394/394), `npm run build`, the focused Electron switch/restart case, and `git diff --check` passed.

## Context and orientation

Run commands from repository root `D:\tmp\dev\clip-sandbox` in PowerShell. `docs/agent-docs/agent-architecture-map.md` is the canonical architecture entry point; read it before editing, followed by its GIF and frame-review sections and `coding-quality.md`. The signed-off spec is the behavioral authority for this feature. Preserve unrelated working-tree changes, including the separate Refine and screen/panel-preference work.

`GifExtractionSession` in `src/app/gif-extraction-session.ts` owns one active `IFrameReviewSession`, a `RangeCaptureModel`, refinement, thumbnails and `ClipExtractionWorkflow`. `RangeCaptureModel` in `src/domain/range-capture-model.ts` owns ordered locked ranges and ID sequence; `src/domain/capture-endpoint.ts` distinguishes canonical exact frames from approximate playback timestamps. A source generation is an ephemeral lease counter, not durable movie identity. `GifRangesPanelControl` renders session snapshots. `GifExtractionScreen` owns the existing Open movie button.

`FrameReviewHost` in `src/frame-review/host/frame-review-host.ts` owns per-window opaque source handles and paths. `SourceInspector` computes the source fields that feed prepared-review identity; `ReviewSession` owns playback and BestSource exact access. `electron/frame-review-ipc.cjs`, `electron/preload.cjs`, and `src/adapters/electron/electron-frame-review-service.ts` form the renderer trust boundary. `electron/main.cjs` composes per-window hosts and owns the final quit barrier. `AppSettingsStore` in `electron/app-settings-store.cjs` is a precedent for BOM-tolerant reads and atomic writes, not a place for capture queues.

`ClipExtractionWorkflow` coordinates media creation and Collection publication. `electron/clip-extraction-runtime.cjs` prepares the original source, selects inclusive canonical ordinals, encodes video, muxes audio into MP4, verifies media, and publishes with collision-safe names. `src/frame-review/clip-extraction-api.ts`, `electron/clip-extraction-ipc.cjs`, the preload, and `src/adapters/electron/electron-clip-extraction-service.ts` carry the result. A completed range can leave the durable unfinished queue only after both media and membership publication succeed.

A **source fingerprint** is the versioned combination of sampled packet digest/profile, source size/duration, selected stream and stream-metadata digest, excluding tool/cache versions. A **canonical ordinal** is the original movie's zero-based frame index, distinct from review-proxy time. **Provenance** is a small versioned record in future extracted MP4 movie-level `mdta` metadata; it is optional for playback and Collection use.

## Test reliability rule

Assert stable product outcomes: restored ranges and order, blocked unsafe actions, successful media publication, readable provenance, and uninterrupted playback. Never synchronize by sleeping a fixed interval or assert exact panel dimensions, pixel positions, animation durations, or incidental operation counts. A bounded timeout may stop a hung test but is not evidence of readiness; wait on observable state or events. If a behavior has no reliable automated oracle, verify it manually in the local Electron app and record what was observed instead of adding a flaky unit/E2E test. Keep known flaky native playback-resumption evidence separate from feature results.

## Milestone 1 - Prove identity and model round trips

### Scope

Establish the two identity contracts before wiring persistence: stable movie ID independent of cache build versions, and an exact-endpoint check that cannot change visible playback or subsequent frame stepping. Before implementation of the serialized formats, present the annotated fingerprint, queue and embedded-provenance examples below to the user and obtain approval of their shape. The examples are proposed, not yet approved.

### Changes

- Inspect `src/frame-review/host/source-inspector.ts`, `review-preparation-service.ts`, `review-session.ts`, `bestsource-frame-reader.ts`, and related native protocol before choosing an identity lookup. Add a focused test or small spike showing whether `exact(frameIndex)` mutates the reader cursor; if it does, use an isolated reader or restore cursor before exposing validation. Do not route this through `scrubToFrame` or emit a displayed frame.
- Add a named, versioned source-fingerprint value at the frame-review model/host boundary (likely `src/frame-review/model/source-fingerprint.ts`) derived from the inspection's source fields. Keep it separate from `IExactReviewProxyIdentity` and its cache key. Define equality and safe, bounded wire shape there; never include a path or tool version.
- Keep the sampling profile name owned and emitted by `media_sample_signature`; `SourceInspector` passes through the native `profileVersion`. Add a deterministic media fixture that checks the native compact profile name and exact sample digest together, plus a direct native range-selection check using a duration long enough to exercise separate head, tail and interior windows. A digest or range change under the same name must fail a test and trigger explicit review of whether the sampler profile version needs a bump; the tests cannot infer that decision themselves.
- Add validated plain-data conversion on `RangeCaptureModel` and its endpoint/range value types in `src/domain/range-capture-model.ts`, `captured-range.ts`, `capture-endpoint.ts`. Save IDs/order/next sequence, the optional active draft, and compact exact endpoints (`frameIndex`, `frameInfoHash`, `reviewTimeUs`); omit ephemeral source generation. Represent restored exact endpoints as unverified until a non-displaying index lookup rehydrates the current full `ISourceFrameIdentity` and binds the current generation. Do not fabricate missing live-identity fields from the saved DTO. Reject malformed IDs, duplicates, invalid order, impossible endpoint kinds and excessive counts without discarding the original stored file.
- Pause before committing to the JSON contracts: show the user the example fingerprint, queue record and MP4 provenance payload below, explain the fields, and get explicit format approval. Revise this plan's examples and Decision Log if the approved shape changes.

### Proposed format for user approval

Example source fingerprint (illustrative digests; the profile label is the one used by `SourceInspector` today):

```json
{
  "fingerprintVersion": 1,
  "sourceSampleDigest": "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
  "sourceBytes": "2147483648",
  "sourceDurationUs": "3600000000",
  "signatureProfileVersion": "sampled-packets-3m-3m-3x1m-v1",
  "selectedStream": 0,
  "streamMetadataDigest": "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2"
}
```

`fingerprintVersion` changes only when the movie-identity composition changes. `signatureProfileVersion` is owned and emitted by the native sampler, not generated from a name in TypeScript: `3m-3m-3x1m` means up to three minutes at the start, three at the end and three deterministic one-minute middle segments. The exact chosen windows depend on movie duration/size, codec and stream; the sampler merges overlaps. We do not duplicate window coordinates in every fingerprint because the profile and source inputs define them. `sourceSampleDigest` is only the final SHA-256 result (32 bytes, rendered as 64 hex characters), **not** the sampled movie bytes. The sampler hashes its profile name, source size/duration, selected stream, stream metadata digest, chosen ranges, and each sampled video packet's timing/flags/size and payload. It can recompute the digest when checking a source. `streamMetadataDigest` is a separate SHA-256 result for the selected video stream's codec ID/tag, width, height and codec setup bytes; it is not title/artist metadata. Tool/cache build versions and source paths are deliberately absent. The record filename uses a hash of this validated value. This is sampled-content identity, not a full-file proof.

Example private on-disk queue record, with one exact range followed by one approximate range:

```json
{
  "schemaVersion": 1,
  "movieFingerprint": {
    "fingerprintVersion": 1,
    "sourceSampleDigest": "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
    "sourceBytes": "2147483648",
    "sourceDurationUs": "3600000000",
    "signatureProfileVersion": "sampled-packets-3m-3m-3x1m-v1",
    "selectedStream": 0,
    "streamMetadataDigest": "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2"
  },
  "displayName": "Take A.mp4",
  "lastKnownPath": "D:\\Media\\Take A.mp4",
  "nextRangeSequence": 3,
  "draft": { "start": { "kind": "playback-timestamp", "timestampUs": "12000000" }, "end": null },
  "ranges": [
    {
      "id": "range-1",
      "start": {
        "kind": "exact-frame",
        "frameIndex": 120,
        "frameInfoHash": "c3c3c3c3c3c3c3c3",
        "reviewTimeUs": "4000000"
      },
      "end": {
        "kind": "exact-frame",
        "frameIndex": 160,
        "frameInfoHash": "d4d4d4d4d4d4d4d4",
        "reviewTimeUs": "5333333"
      }
    },
    {
      "id": "range-2",
      "start": { "kind": "playback-timestamp", "timestampUs": "7000000" },
      "end": { "kind": "playback-timestamp", "timestampUs": "9000000" }
    }
  ]
}
```

`schemaVersion` governs the queue record independently of `fingerprintVersion`. `lastKnownPath` is a private reopening hint in Electron `userData`; it never enters clip provenance or renderer IPC. Array order is the Clips-panel order. `nextRangeSequence` prevents reusing an ID after removal or restart. Optional `draft` holds the one active incomplete range; an older record without it restores an empty draft. For an exact endpoint, `frameIndex` selects the canonical frame used for extraction; `frameInfoHash` is BestSource's 64-bit XXH3 hash of decoded frame data, rendered as 16 hex characters, and checks that the saved ordinal still resolves to the same frame. `reviewTimeUs` preserves the displayed capture position while the range is unverified; it is not a frame identifier. After a match, the current index supplies the full live `ISourceFrameIdentity`, including source PTS, timebase, duration and BestSource's `originalFrameIndex`. The queue does not save those derivable values or the duplicate `frameInfoPts`. Approximate endpoints retain timestamps and still require refinement. Every `bigint` is a decimal string. Runtime `sourceGeneration`, thumbnails and extraction status are deliberately absent. The example values are synthetic; approval is for field shape and ownership, not these sample values.

Proposed value of the MP4 movie-level `mdta` key `clip-sandbox.prov.v1` for an extracted range (the bundled FFmpeg/FFprobe round-tripped this exact key on a local MP4 fixture):

```json
{
  "provenanceVersion": 1,
  "sourceMovie": {
    "displayName": "Take A.mp4",
    "fingerprint": {
      "fingerprintVersion": 1,
      "sourceSampleDigest": "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
      "sourceBytes": "2147483648",
      "sourceDurationUs": "3600000000",
      "signatureProfileVersion": "sampled-packets-3m-3m-3x1m-v1",
      "selectedStream": 0,
      "streamMetadataDigest": "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2"
    }
  },
  "sourceFrameRange": {
    "start": {
      "frameIndex": 120,
      "frameInfoHash": "c3c3c3c3c3c3c3c3"
    },
    "end": {
      "frameIndex": 160,
      "frameInfoHash": "d4d4d4d4d4d4d4d4"
    },
    "endInclusive": true
  }
}
```

`provenanceVersion` versions this clip tag independently of queue and fingerprint versions. `sourceMovie.fingerprint` lets a future flow verify a user-selected original movie; `displayName` is only a hint, and no absolute path or live source handle is embedded. `sourceFrameRange` uses the canonical extraction ordinals in the original source and a decoded-frame hash per endpoint, rather than extracted-clip-relative frame numbers or proxy review time. The original-source fingerprint, ordinal and hash are enough to locate and check each endpoint; a future flow can retrieve PTS, timebase and any BestSource ordinal mapping from the reopened index. `endInclusive` makes the boundary convention explicit for future extension. The trusted extraction runtime supplies these values from the prepared source/index and its validated request, not from unverified renderer JSON. The writer checks UTF-8 byte length against the 4 KiB app cap and reads the exact tag back with bundled FFprobe. Missing or invalid provenance is treated as unavailable while the clip remains usable. The example contains synthetic values; approval is for schema, field meaning and tag key.

### Validation

- Command: `npx vitest run tests/unit/range-capture-model.spec.ts tests/unit/frame-review`
  Expected: exact/approximate round trips, next-ID continuity, malformed-input rejection, fingerprint version separation and non-disruptive frame lookup checks pass. Create focused new unit files as needed; inspect failure output and exit code.
- Native sampler contract checks: run `media_sample_signature --compact` against a fixed MP4 fixture and assert its emitted `profileVersion` and `sampleDigest` as a pair; directly check range selection for a representative long duration; confirm `SourceInspector` passes through the reported version. A changed digest or range with an unchanged profile fails a test and requires a conscious version review.
- Test two realistic cases: two ranges in one movie surviving rebind with their order/IDs, and a same-path changed movie yielding a different fingerprint. Verify tool-version-only changes leave the movie fingerprint unchanged.

### Rollback/Containment

Keep the new value/serialization API unused by the UI until these tests pass. If the reader cannot validate without side effects, stop at this milestone and record a dedicated non-displaying index-query design before proceeding.

## Milestone 2 - Build trusted capture storage and source reattachment

### Scope

Persist and retrieve movie queues under Electron `userData`, and reopen only a verified source with a fresh per-window grant.

### Changes

- Create a focused main-process store, `electron/clip-captures-store.cjs`, from `electron/main.cjs` using `app.getPath('userData')`. File names derive only from validated fingerprint hashes; the saved absolute path stays in trusted JSON as a hint. Cap file and range sizes; strip a legacy UTF-8 BOM on read; validate versions and keep damaged/unknown records intact with actionable errors. Serialize/coalesce per-movie writes, write BOM-free UTF-8 to a unique temp file and rename atomically, track failures, and implement `flush()` for main-process quit. Keep the pointer update ordered with queue saves. Do not scan every movie file at startup.
- Add a narrow capture IPC boundary, `electron/clip-captures-ipc.cjs`, preload methods, `src/app/clip-captures-store-service.ts` interface and `src/adapters/electron/electron-clip-captures-store-service.ts`. Main resolves source handle to a registered per-window path, computes/compares the fingerprint, and returns only opaque movie reference, display name and validated queue data. A stored path alone never grants access. Reopen-last verifies its hint and registers a fresh handle for the requesting window; a failed lookup preserves the queue and returns recovery status. Confirm how to reuse inspection results so source selection does not run an unnecessary second expensive scan.
- Add a host operation for lazy exact endpoint identity validation, wired through `src/frame-review/frame-review-api.ts`, host, IPC, preload and adapter. Look up each saved ordinal without displaying it; compare its current decoded-frame hash with the saved hash, then return the current full identity to hydrate the active range. Prevent races with source changes and cancellation; never pause or seek the visible player. Make validation result explicit: valid, stale/unavailable, or operational failure.
- Extend `electron/main.cjs`'s existing quit barrier to await the store's pending writes. The renderer shutdown path can request a flush, but main remains authoritative. Keep one failed write visible as unsaved rather than reporting success.

### Validation

- Command: `npx vitest run tests/unit/clip-captures-store.spec.ts tests/unit/frame-review/frame-review-ipc.spec.ts tests/unit/frame-review/electron-frame-review-service.spec.ts`
  Expected: create/restart/restore, atomic replacement, coalesced concurrent writes, BOM handling, corrupt-record preservation, wrong-fingerprint refusal, fresh per-window grants, and stale exact-endpoint rejection pass. If a named test file differs in the current tree, use `rg --files tests` to select its existing equivalent.
- A manually changed source at the saved path must leave the old queue recoverable and must not enable extraction. IPC responses must contain no absolute source path.

### Rollback/Containment

Keep each record independent so a corrupt movie cannot hide another movie's queue. On store or IPC failure, preserve the previous file and current in-memory work; return an explicit unsaved/recovery state.

## Milestone 3 - Connect queue lifecycle and recovery UI

### Scope

Make source switches, screen switches and restarts restore unfinished locked ranges without blocking normal playback or controls.

### Changes

- Inject the capture-store service into `GifExtractionSession` from `src/app/app-controller.ts`. On lock, refinement commit, removal, source switch and completed Collection publication, snapshot unfinished locked ranges and schedule an asynchronous save. Preserve the active in-memory queue on storage failure and show an Activity/session warning. Keep thumbnail resources and extraction states session-only. A completed revision remains visible for the current session but is removed from durable unfinished data only after publication succeeds.
- Update `openMovie`, `replaceSource` and `dispose` in `src/app/gif-extraction-session.ts`: save the old movie's locked ranges and active draft, attach the verified new movie's queue, restore with the new source generation, and recreate exact start thumbnails. Switching needs no discard prompt. An in-session failed publication still retries without encoding; after restart it is simply pending. Cancel/ignore late restore and save responses from an obsolete source generation.
- Trigger reopen-last when GIF Extraction first activates, including when it is the startup workspace, through `src/ui/gif-extraction-screen.ts` and/or the app composition root. Do not block shell activation or start an extraction. Update `src/ui/gif-ranges-panel-control.ts` and screen/status copy to show unavailable saved ranges and direct the user to the existing Open movie control. Exact actions call the lazy validator before Refine/Extract, including each item in Extract All; keep approximate ranges in the refine-required state. Recheck generation when async validation returns.
- Keep screen-declared panel fold preferences out of this change. Do not persist player position, selection, thumbnail Blob URL, extraction error/cancel status or in-progress media retry state.

### Validation

- Command: `npx vitest run tests/unit/gif-extraction-session.spec.ts tests/integration/ui/gif-extraction-screen.spec.ts`
  Expected: switching A→B→A preserves locked ranges/order and the active draft without confirmation, late async results cannot attach the wrong queue, failed saves are visible, and stale exact endpoints block the action.
- Command: `npm run build` followed by `npx playwright test tests/e2e/gif-extraction-capture.spec.ts tests/e2e/gif-extraction-shell.spec.ts --workers=1`
  Expected: run the existing scenarios and add only focused cases whose source selection, restart and restored queue can be observed reliably through product state. Use isolated `userData` for every E2E fixture so prior queues cannot leak between tests. If native playback or restart timing prevents a stable oracle, record and perform the affected scenario in local manual QA rather than adding sleeps or brittle screen measurements.

### Rollback/Containment

If reopen or saved data fails, keep the normal Open movie workflow and current session usable. No automatic extraction or source search occurs. A failed write leaves the last good record intact and shows that current work is unsaved.

## Milestone 4 - Embed optional MP4 provenance

### Scope

Future MP4 outputs carry validated source and inclusive original-frame metadata, while metadata failure never prevents otherwise successful media and Collection publication.

### Changes

- Add one format-selected provenance read/write contract at the extraction runtime boundary, with an MP4 implementation (e.g. `electron/clip-provenance/mp4-provenance.cjs`). It owns a versioned app-specific `mdta` key, a compact payload capped at 4 KiB as an application bound, safe decoding, FFmpeg mux arguments and FFprobe readback. Because `+use_metadata_tags` changes the representation of all movie-level tags, inspect the current output's ordinary tags and compare them after tagging; preserve their readable values where applicable. Do not put FFmpeg tag construction in `ClipExtractionWorkflow` or branch on format throughout the app.
- In `electron/clip-extraction-runtime.cjs`, reuse the prepared original source and the existing ordinal lookup, FFmpeg frame selection, and media verification. Derive the source fingerprint from that prepared source. Obtain trustworthy endpoint hashes from the prepared canonical index for the provenance record; for a restored range, compare them with the saved hashes without repeating the FFprobe full-frame scan. Pass saved hashes across the request boundary only if needed for this comparison, and never trust renderer-supplied hashes as proof. Verify that the saved/reported extraction ordinal aligns with the frame selected from the original source, including a case where source normalization or BestSource's `originalFrameIndex` mapping differs; resolve any mismatch before writing provenance. Preserve the already encoded temporary video. During the final mux use `-movflags +faststart+use_metadata_tags` and the custom tag; verify media and read back metadata. If the metadata mux fails, retry finalization without the tag where feasible. If only metadata readback fails, keep the already verified MP4 and warn. Do not mask a real encode/media failure as a metadata warning. Maintain exclusive output naming and temp cleanup.
- Extend `src/frame-review/clip-extraction-api.ts`, the extraction IPC/preload/adapter and `ClipExtractionWorkflow` result path so an optional warning reaches Activity after publication. Missing, malformed or old-version provenance on a clip returns unavailable; it never blocks `Collection` loading or playback. No backfill for preexisting clips.

### Validation

- Command: `npx vitest run tests/unit/clip-extraction-runtime.spec.ts tests/unit/clip-extraction-workflow.spec.ts tests/unit/electron-clip-extraction-service.spec.ts`
  Expected: exact start/end, source identity, 4 KiB bound, malformed/missing tag, mux-only fallback, media failure and warning propagation are distinguished. Tests assert outcome and readback, not merely the presence of an FFmpeg argument.
- Command: `npm run build` followed by `npx playwright test tests/e2e/gif-extraction-output.spec.ts --workers=1`
  Expected: use this only where the existing media fixture and actual published file provide a stable result. Bundled FFprobe reads the custom tag from a real newly extracted MP4; ordinary movie-level tags that the current extractor emits remain readable; a normal clip still loads when the tag is absent. Compare tagged and untagged outputs in the app's playback and Collection flows, and inspect a renamed/moved intact MP4. If player timing cannot be asserted reliably, keep the metadata readback automated and verify playback locally. The local pre-plan round trip established that the custom key is lost without `+use_metadata_tags`.

### Rollback/Containment

Keep provenance as a final-mux adapter. A tag-specific failure produces an untagged, verified MP4 and visible warning. If media verification fails, leave publication failed and do not add Collection membership.

## Milestone 5 - Product verification and architecture maintenance

### Scope

Prove the signed-off user-visible goal in the actual app and leave durable architecture guidance current.

### Changes

- Update `docs/agent-docs/agent-architecture-map.md` with the new capture store, movie identity, lazy endpoint check, optional provenance boundary and quit flush. Update only relevant deeper docs if they already exist. Apply the `doc-update` skill and recheck links. Re-read `coding-quality.md` and record any deliberate structural deviation.
- Maintain this plan's Progress, Surprises & Discoveries, Decision Log, Skill Gates and Outcomes & Retrospective as milestones finish. Do not treat this plan as permission to skip triggered implementation skills.

### Validation

- Command: `npm run typecheck` and `npm run unit`
  Expected: both exit 0, with full output reviewed for new failures or warnings.
- Command: `npm run e2e`
  Expected: run the existing explicit Electron gate with native products available and report its actual outcome. Record any pre-existing flaky playback case separately with exact output; do not call the full suite green if it fails. Do not add a flaky E2E case just to satisfy this plan when local manual verification is more reliable.
- Manual QA in the actual Electron app: lock exact and approximate ranges in movie A, switch to B and back, switch to Collection and Refine, restart on GIF and on another startup workspace, move/change the source, reopen the original through Open movie, refine/extract a restored exact range, and check the published MP4 tag and a missing-tag clip. Record observations for persistence, playback continuity, messages, extraction safety and Collection load.

### Rollback/Containment

Keep any failed case narrowly reproducible and the prior movie queue files intact. Do not report completion from unit tests alone; if manual UX or native-media checks cannot run, state the unverified acceptance behaviors and stop short of claiming the feature complete.
