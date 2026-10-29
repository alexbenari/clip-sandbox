# Build Zoom edit mode, starting with Refine

## Why this matters

Refining a Collection clip today means a separate screen that shows nothing until the whole source movie is prepared (more than 25 minutes for a feature film) and keys that do nothing while the movie plays. After this work, a clip is refined in place: Zoom enters Zoom edit mode, the clip is trimmed at once with the keyboard, and a clip with source info can be extended up to a minute from a small window of its movie that is ready in about twenty seconds. The signed-off spec is [`docs/specs/zoom-edit-mode-spec.md`](../specs/zoom-edit-mode-spec.md); this plan cites its decisions as "spec D1"–"spec D16".

## Progress

- [x] (2026-10-29) Milestone 0 - Workspace setup. Done in the previous feature: packages installed, and junctions to the main checkout's `native-build`, `tools/frame-review/.deps` and `tests/fixtures/gif-extraction/generated` exist (all ignored by git). Re-check with G0.
- [ ] Milestone 1 - Spike: reading a frame time from a movie's cached index
- [ ] Milestone 2 - Retire Collection Refine
- [ ] Milestone 3 - Source info with reference frames and times
- [ ] Milestone 4 - Clip and movie-window sources in the main process
- [ ] Milestone 5 - Saving a refined clip in the main process
- [ ] Milestone 6 - Player and edit session for Zoom edit mode
- [ ] Milestone 7 - Zoom edit mode in the Collection view
- [ ] Milestone 8 - Keep both, Replace and the grid after saving
- [ ] Milestone 9 - Documentation, full validation and the real-app check
- [ ] Milestone 10 - Design Loopify as an edit inside Zoom edit mode, with the user's approval, then build it

Evidence logs: `test-evidence/zoom-edit-mode/` (ignored by git). Earlier evidence this plan relies on: `test-evidence/collection-refine-keys/findings.md` and `test-evidence/zoom-edit-window-spike/findings.md` (window cut 0.4 s, window ready in 16.4 s, anchor exact). Reuse `test-evidence/clip-source-movie/mutate.cjs` to see each new test fail under a targeted change, and the spike's `time-prepare.cjs` for preparation timings.

## Skill Gates

Planning-time gates:

- plan-review: before each sign-off request and after substantial revisions.
- domain-modeling: the source-info record with separate reference frames (P4) and the clip-relative refine range (P10).
- api-and-interface-design: the new main-process requests (P6–P9) and the edit session's interfaces (P10–P13).
- `coding-quality.md`, `ui-coding-quality.md`, and the architecture map's axioms: class ownership, workflow and control roles, composition-root rules.

Execution-time gates:

- code-quality-review: at the end of Milestones 2–8 and 10, before their validation gates.
- testing-discipline: before writing or changing tests.
- typescript-coding: every TypeScript change.
- security-and-trust-boundaries: Milestones 4 and 5 (renderer-supplied folder and file names, file writes, renames and Recycle Bin moves, records the main process writes).
- error-and-correctness-traps: Milestones 4–8 (child processes, cancellation, stale asynchronous answers, the Replace sequence).
- before-you-refactor: Milestones 2, 5 and 8 (removing Collection Refine; extracting the encoding step from `ClipExtractionRuntime`; moving created-clip insertion out of `ZoomWorkflow`) and Milestone 10 (removing the one-shot edit path).
- build-deploy-and-tooling: Milestone 1 only if it adds a native command.
- writing-clean-code: each new class.
- run: the real-app checks (G1, G9 tail, G18).
- doc-update: Milestone 9.

Unavailable skills or fallbacks:

- none known at planning time.

## Surprises & Discoveries

- Discovery: copying a movie's cached index (`frame-index-cache/<key>/canonical-index.0.bsindex`) beside the movie and running `bestsource_gate timeline` rebuilt the index from scratch instead of reading it; the reason is open and is Milestone 1's question.
  Evidence: the timeline run printed `index-progress` events from 0 % (2026-10-28).
- Discovery: `FrameReviewHost.registerSource` accepts any absolute path, and the `create-video-edit` request (Loopify) checks no folder grant; this plan never registers a renderer-supplied path without the grant and `ClipFilenameRule` (P6). The Loopify gap is a separate proposed task.

## Decision Log

| ID | Decision | Rationale | Date |
|---|---|---|---|
| P1 | Milestone 1 decides how the cached-index step of spec D16 reads one frame's time. If a lookup takes at most 5 s on the user's 3-hour movie with the existing native tools, it is used as written in spec D16. If it needs a new native command, Milestone 1 adds it. If no way stays under 5 s, the step is left out and the user is asked to confirm before Milestone 4 begins. | The user wants the happy path kept; the estimate with widen-and-retry still covers every case. | 2026-10-29 |
| P2 | Collection Refine is removed first (Milestone 2), keeping only what Zoom edit mode reuses: the movie lookup moves from `CollectionClipRefinement.resolve` into a new class `SourceMovieLocator` (`electron/source-movie-locator.cjs`), and `IScreenNavigation` moves to `src/app/screen-navigation.ts`. The right-click Refine item is removed until Milestone 7 brings it back. | Refine is unusable today (spec D12); removing it before building avoids keeping two refine paths and their tests alive. | 2026-10-29 |
| P3 | `ExtractionPublisher`'s folder destination kind, `RangeCaptureModel.withExactRange` and `CaptureQueue.useModel` are deleted with Collection Refine in Milestone 2, since Zoom edit mode does not use them (P11, P16); `UnsavedCaptureStorage`, `RefineLeaveWorkflow`, `DiscardRefinementDialogControl` and the GIF Extraction Refine screen stay. | Only Collection Refine used the former; GIF Extraction uses the latter. | 2026-10-29 |
| P4 | Source info gains version 2 of the `clip-sandbox.prov.v1` tag's record: `sourceMovie` as today; `sourceFrameRange: { start, end, endInclusive, startTimeUs?, endTimeUs? }` with plain frame numbers and optional times in microseconds of the movie; `referenceFrames: [{ frameIndex, frameInfoHash }, …]` with one to four entries. A version 1 record reads as a range whose reference frames are its two ends. A new class `SourceInfo` (`electron/clip-provenance/source-info.cjs`) owns parsing both versions, validation, and deriving new records: `trimmed(startOffset, endOffset)` shifts the range, keeps the movie identity and reference frames, and keeps the stored times as placement hints (a trim moves the ends by at most the clip's length, which the window margin covers); `SourceInfo.forMovieRange(movie, range, referenceFrames, times)` builds a complete record for a range cut from an anchored window. `Mp4Provenance` keeps tag reading and writing. The renderer's `Clip` keeps only its `SourceMovie` (the name for the glyph). | Spec D14 and D16; one owner for the record's rules. | 2026-10-29 |
| P5 | Ordinary GIF extraction writes version 2 records with reference frames at both ends and the ends' review times. | Spec D16: future clips carry their own times. | 2026-10-29 |
| P6 | New class `ZoomEditSources` (`electron/zoom-edit-sources.cjs`) serves `clip-sandbox:zoom-edit-open-clip { folderPath, filename }`, which checks the folder grant and `ClipFilenameRule`, then registers the clip with the window's `FrameReviewHost` and returns its handle. | Opening the clip itself is needed for immediate trimming (spec D5); no other request registers a granted clip. | 2026-10-29 |
| P7 | `ZoomEditSources` also serves `clip-sandbox:zoom-edit-open-window { folderPath, filename, widen }`. It reads the clip's `SourceInfo`, finds the movie with `SourceMovieLocator` (remembered path, pipeline folders, then the picker; spec D6), places the window by stored time, cached index (per P1), or frame-rate estimate (spec D16) with a 15 s margin beyond the one-minute limit on each side (doubled for each `widen` step, at most two), and asks `MovieWindowCache` for the window. It returns the window's handle and an opaque window id, never a path. The main process keeps, per window id, the movie's `SourceInfo` identity and the window's placement. | Spec D6, D15, D16. Keeping movie identity in the main process means the renderer cannot supply a false record. | 2026-10-29 |
| P8 | New class `MovieWindowCache` (`electron/movie-window-cache.cjs`) keeps windows under `<applicationFolder>/movie-window-cache/<key>/window.mkv` with a small manifest; the key is derived from the movie fingerprint and the window's bounds. It cuts a window with FFmpeg stream copy (video and first audio track) into a temporary file and renames it into place. It keeps at most 10 windows and removes the least recently used beyond that, together with that window's entries in the prepared-review caches (found by the window's content key through the host), so nothing is left behind; validated windows survive restarts like the other caches. | Spec D15 "kept in the cache"; the prepared-review caches find the window again only if its file still exists. Each window costs about 100 MB with its prepared copy (about 24 MB for the window and 80 MB prepared, judging by the test window and the movie's full proxy), so 10 windows take about 1 GB; the user chose 10 to keep the disk cost small. | 2026-10-29 |
| P9 | Anchoring: new method `FrameReviewHost.findFrameByCheckValue(sessionId, sourceHandle, frameInfoHash, nearFrameIndex)` searches the exact-ready session outward from the estimate with index-only `frameIdentity` reads and returns the first match. `clip-sandbox:zoom-edit-anchor-window { windowId, sessionId }` tries the clip's reference frames in turn and records the window-to-movie offset for that window id; when none is found it answers `not-found` and the renderer asks for a wider window (P7). In a widened window the search covers every frame but starts with the newly added stretches, nearest to the previous window first, and only then the frames the previous window held; nothing is skipped on the strength of a timestamp mapping between the two cuts. | Spec D15: exact numbering, never guessed; the window fits within the host's existing per-session limits. The search reads only index entries (about a second for a whole window), so ordering it finds a reference in the added part almost at once without the risk of skipping a frame at the seam between cuts. | 2026-10-29 |
| P10 | The staged range is a domain value `RefineRange` (`src/domain/refine-range.ts`) in clip-relative frame numbers: frame 0 is the clip's first frame, and negative numbers or numbers past the last frame are extensions. It knows its limits (the clip's own frames, or one minute of frames beyond each end when a window is anchored) and answers why a requested start or end is refused. | Staged edits survive switching the player from the clip to the window without being invalidated; spec D4 and D5 reasons come from one owner. | 2026-10-29 |
| P11 | `ZoomEditModeSession` (`src/app/zoom-edit-mode-session.ts`) owns one clip's edit: it opens the clip source at once and, for a tagged clip, the window source in the background through the frame-review service, switches the player to the window once it is anchored at the same displayed frame, converts displayed exact frames to clip-relative numbers, holds the `RefineRange`, and reports readiness and hint reasons. It reuses `CurrentMovie` for opening, generations and readiness, and does not extend `MovieRangeSession`. | One edit, one owner; the GIF session's capture queue and extraction model do not apply. | 2026-10-29 |
| P12 | Where the one `FrameReviewPlayerControl` is placed decides how it looks: its `mount(host, emptyMessage)` is replaced by two named methods, `mountInGifScreen(host, emptyMessage)` (today's full look with progress row, transport, readiness and readout; used by GIF Extraction and its Refine screen) and `mountInZoomEdit(host)` (picture only). Each applies its look as a class on the player's root and records it, so the next mount restores the right look. Muting is not part of the look: the frame-review open request gains `muted`, which `ReviewSession` passes to the playback engine instead of its fixed `false`. In Zoom edit mode, readiness and refusal messages belong to Zoom edit mode's hint line, not the player. The GIF screens check whether they are active before touching the player, and call `mountInGifScreen` again on activation. | Spec D1 and D2. One control used in two places gets named entry points rather than a parameter that selects its behavior (`ui-coding-quality.md`); muting belongs to the movie being opened; inactive screens must not disturb the shared player. | 2026-10-29 |
| P13 | Zoom edit mode's keys come from a new `ZoomEditModeKeyboard` (`src/ui/zoom-edit-mode-keyboard.ts`), not `GifWorkflowKeyboard`: every key calls a session command that either acts or returns a reason shown in the hint line. `AppKeyDownHandler` gives it keys before Zoom's own handling while the mode is active, and its dialog check includes the discard and save dialogs. | Spec D3, D4 and D13: own keys, no silent drops, no conflict with F, E or Escape in the GIF keyboard. | 2026-10-29 |
| P14 | `ZoomEditModeWorkflow` (`src/app/zoom-edit-mode-workflow.ts`) runs the flow: entry from the right-click menu and from Zoom's edit menu, the hint line, saving with the Keep both / Replace / Cancel dialog (`SaveRefinementDialogControl`, typed events), and leaving. Leaving with staged edits asks through a Zoom edit variant of `DiscardRefinementDialogControl`. Screen changes are held by a `ZoomEditModeLeavePolicy` that `ApplicationShellControl` consults together with `RefineScreenLeavePolicy`; folder loads and collection switches in `FolderSelectionWorkflow` ask first; the automatic re-listing after a GIF extraction waits until the mode ends. `ZoomOverlayControl` reports a backdrop click as `closeRequested` instead of closing itself. | Spec D10 and the UI guidelines: workflows own flows, controls report intent, overlays are closed by their workflow. | 2026-10-29 |
| P15 | Zoom's edit menu lists Refine as a mode entry, separate from file edits like Loopify in `VideoEditCatalog`, so `ClipEditor` never treats Refine as a file edit. | Spec D13; Loopify's runtime path must not receive Refine. | 2026-10-29 |
| P16 | New class `RefinedClipSaver` (`electron/refined-clip-saver.cjs`) serves `clip-sandbox:zoom-edit-save { folderPath, filename, source: { kind: 'clip' } \| { kind: 'window', windowId }, sessionId, startFrame, endFrame, outcome: 'keep-both' \| 'replace' }` with frame numbers in the source shown. It never accepts a record from the renderer and leaves the record's rules to `SourceInfo` (P4): for a range cut from an anchored window, `SourceInfo.forMovieRange` with the movie identity the main process recorded for that window and the reference frames and times read from the session, converted to movie numbering through the anchor (spec D7 complete case); for a trim of the clip itself, the clip's own `SourceInfo.trimmed(...)` (spec D7 partial case); for an untagged clip, no record. It encodes through an encoding step extracted from `ClipExtractionRuntime` (exact frames, audio kept; spec D11). | The main process writes only records it built; one encoding path for extraction and refinement. | 2026-10-29 |
| P17 | Keep both writes `<stem>-refined.mp4`, then `-refined-2`, … with exclusive creation. Replace writes `<stem>.mp4.refining` (not a video extension, so a re-listing never shows it), moves the original to the Recycle Bin, then renames the temporary file to `<stem>.mp4`; if the Recycle Bin move fails or `<stem>.mp4` is taken by another file, it renames to the Keep both name instead and reports why. The answer gives the final name, a folder entry for it, and for a non-MP4 Replace the old name it replaces. | Spec D8 and D9. | 2026-10-29 |
| P19 | Inserting a newly created clip into the open view next to its original moves out of `ZoomWorkflow.showCreatedClip` into a new class `CreatedClipInsertion` (`src/app/created-clip-insertion.ts`) with one method, `insert(originalClip, createdSource)`: in a saved collection's view it places the clip right after the original (the view becomes unsaved), in the folder's full list where its name sorts; it refreshes the grid, selector and toolbar, reads the clip's source movie, and opens it in Zoom. Loopify and Keep both both use it. The one-shot edit runner `ZoomVideoEditWorkflow` keeps its name until Milestone 10 removes it. | One owner for where a created clip goes, so Loopify and Keep both cannot drift apart; no rename of a class that Milestone 10 is expected to delete. | 2026-10-29 |
| P18 | After Keep both, the new clip is inserted through `CreatedClipInsertion` (P19), exactly as Loopify's output is. After Replace, the clip gets a new `ClipSource` whose media address carries the file's modification time as a query, a new `Clip.replaceFile(source)` clears its duration, size and source movie, the grid's views are invalidated, and the source movie is read again; for a non-MP4 Replace the pipeline renames the video and `CollectionFileWriter` rewrites every collection that lists the old name, as the Recycle Bin flow does. | Spec D8 and D9: the new file must show, not the old picture under the same name. | 2026-10-29 |

## Validation gates

| ID | Milestone | Proves | Needs milestones | How to check | Expected |
|---|---|---|---|---|---|
| G0 | 0 | Workspace ready | 0 | `npm run build`; `Test-Path` on the three junctions | Build passes; all exist. |
| G1 | 1 | How long a cached-index frame-time lookup takes and how | 1 | Spike in `test-evidence/zoom-edit-mode/m1/`, read-only on the main checkout's cache entry for the user's movie | A measured time for one lookup and the method; P1 applied and recorded. |
| G2 | 2 | Collection Refine is gone and nothing else broke | 2 | `npm run typecheck`, `npm run lint`, `npm run unit`; search for `collection-refine`, `CollectionClipRefinement`, `forCollectionRefinement` | All pass; no matches outside docs and history. |
| G3 | 2 | GIF Extraction's Refine still works | 0, 2 | `npm run build`, then the GIF end-to-end tests touching Refine (`gif-extraction-output`, `gif-exact-preview`) | Pass, none skipped. |
| G4 | 3 | Source info versions 1 and 2 read and write correctly | 3 | Unit tests for `SourceInfo`, `Mp4Provenance`, extraction runtime, and the glyph runtime with version 1 and 2 fixtures | All pass, each seen failing first. |
| G5 | 3 | New extractions carry reference frames and times | 0, 3 | `npx playwright test tests/e2e/gif-extraction-output.spec.ts` plus reading the output's tag | The tag is version 2 with both ends as reference frames and their times. |
| G6 | 4 | Clip and window requests enforce grants and place, cut, cache and anchor windows | 4 | Unit tests for `ZoomEditSources`, `MovieWindowCache`, `SourceMovieLocator`; a host test for `findFrameByCheckValue` against a fixture with known frames | All pass. |
| G7 | 4 | Window and anchor on the user's movie through the real main process | 0, 4 | A script in `test-evidence/zoom-edit-mode/m4/` driving the new requests in the real app with a throwaway profile | Window ready in under 30 s; anchor at the movie frame numbers in the clip's tag; second open is a cache hit. |
| G8 | 5 | Saving writes exact frames, audio and the right record, with safe names | 5 | Unit tests for `RefinedClipSaver` and the extracted encoding step, including Replace when the Recycle Bin move fails | All pass. |
| G9 | 6 | Edit session, range rules and compact muted player | 6 | Unit tests for `RefineRange`, `ZoomEditModeSession`, player compact mode, and the `muted` open option | All pass. |
| G10 | 7 | Zoom edit mode keys, hint reasons, entry and leaving | 7 | Unit and integration tests for `ZoomEditModeKeyboard`, `ZoomEditModeWorkflow`, `ZoomOverlayControl`, `AppKeyDownHandler`, leave policy and folder guards | All pass. |
| G11 | 7 | No regression in the renderer | 7 | `npm run typecheck`, `npm run lint`, `npm run unit` | Pass. |
| G12 | 8 | Keep both and Replace in the views | 8 | Unit and app-level tests for insertion, Replace refresh and non-MP4 collection rewriting | Pass. |
| G13 | 8 | The whole feature across the process boundary | 0, 4, 5, 6, 7, 8 | New `tests/e2e/zoom-edit-mode.spec.ts` with a generated movie, a tagged clip cut from it, and an untagged clip: trim and Keep both, extend and Replace | Pass three times in a row; fails when anchoring is broken. |
| G14 | 9 | Documentation matches the code | 9 | `doc-update` report | Map and design system updated. |
| G15 | 9 | Nothing regressed | 9 | `npm run test:all` | All pass, none skipped. |
| G16 | 9 | The user-visible goal | 9 | Real-app check (below) on the user's clips, in a throwaway copy of `extraction-tmp` | Every item holds. |

## Outcomes & Retrospective

Not started.

## Context and orientation

The main process (`electron/*.cjs`, plus the frame-review host in `src/frame-review/host/` compiled into it) is the only part that touches files. Each window has one `FrameReviewHost`, which turns a registered file into an exact-frame review session: LibVLC plays it, BestSource indexes it, and the prepared result is cached by content under `frame-index-cache`, `exact-review-proxy-cache` and `playback-proxy-cache` in the application folder (the project folder in development, the Electron profile when `CLIP_SANDBOX_E2E=1`). The renderer reaches the host through `electron/frame-review-ipc.cjs` and `ElectronFrameReviewService`, and shows a session in the one shared `FrameReviewPlayerControl`.

Source info is the `clip-sandbox.prov.v1` MP4 tag, written by `Mp4Provenance` during extraction and read by `Mp4MetadataTagReader`. Today's Collection Refine (`CollectionRefinementWorkflow`, `CollectionClipRefinementSession`, `RefineGifScreen.forCollectionRefinement`, `electron/collection-clip-refinement.cjs` and its requests) opens the whole movie and is removed by this plan.

Zoom is `ZoomOverlayControl` (a plain `<video>` in `#zoomFrame`) driven by `ZoomWorkflow`; keys reach it through `AppKeyDownHandler`, where Escape closes Zoom, A toggles audio and Left and Right browse. Loopify is the only file edit in Zoom's edit menu (`VideoEditCatalog`, `ClipEditor`, `electron/video-edit-runtime.cjs`); its output is inserted by `ZoomWorkflow.showCreatedClip`.

Tests: `npm run unit` runs Vitest over `tests/unit` and `tests/integration`; main-process modules are loaded with `createRequire` and fakes; end-to-end tests need `npm run build` and the native tools (G0).

## Milestone 1 - Spike: reading a frame time from a movie's cached index

### Scope

Answer P1 with a measured method and time.

### Changes

- Find why `bestsource_gate timeline` rebuilt the copied index: read the cache entry's manifest in the main checkout (read-only) to see whether the canonical index was built against the original movie or a timestamp-corrected copy under `playback-proxy-cache`, and how `ReviewPreparationService` calls the indexer for a cache hit.
- In a throwaway test-mode profile holding a copy of the movie's three cache entries, time one frame-time lookup by the route the host itself uses (P1 options: existing timeline dump with the paths the host uses; otherwise a minimal new `bestsource_gate` command that prints one frame's time, built with `npm run frame-review:build`).
- Record the method, the time and the P1 outcome in this plan; if the step is dropped, stop and ask the user before Milestone 4.

### Validation

Gates: G1. No production code changes unless a native command is added; then its test runs with `npm run frame-review:test`.

### Rollback/Containment

Delete the spike folder; a native command, if added, is reverted with its commit.

## Milestone 2 - Retire Collection Refine

### Scope

Remove the Collection Refine screen and its supporting code (spec D12), keeping what later milestones reuse (P2, P3).

### Changes

- Move `IScreenNavigation` to `src/app/screen-navigation.ts` and update its importers (`folder-selection-workflow.ts`, `gif-range-refinement-workflow.ts`, `refine-leave-workflow.ts`, `settings-workflow.ts`).
- Move the lookup steps of `CollectionClipRefinement.resolve` into `SourceMovieLocator.locate(event, sourceInfo)` returning a registered movie handle or `cancelled`; delete `electron/collection-clip-refinement.cjs`, its requests in `main.cjs` and `preload.cjs`.
- Delete `CollectionRefinementWorkflow`, `CollectionClipRefinementSession`, `src/app/collection-clip-refinement.ts`, `ElectronCollectionClipRefinementService`, `RefineGifScreen.forCollectionRefinement` and its variant data, `GifRangesPanelControl.forCollectionRefinement`, the Refine item and `ClipRefineAvailability` in `GridContextMenuWorkflow` and `GridContextMenuControl`, the Collection Refine parts of `RefineScreenLeavePolicy` and `AppController`, and the pieces named in P3.
- Delete or trim the tests listed for Collection Refine (`tests/e2e/collection-refine.spec.ts`, `tests/unit/collection-clip-refinement*.spec.ts`, `tests/unit/collection-refinement-workflow.spec.ts`, and Collection Refine cases in the refine screen, ranges panel, context menu, leave workflow and policy, catalog refresher, optional adapters and app characterization tests); move `CollectionClipRefinement` lookup tests to `tests/unit/source-movie-locator.spec.ts`.

### Validation

Gates: G2, G3.

### Rollback/Containment

Revert the milestone commit.

## Milestone 3 - Source info with reference frames and times

### Scope

Version 2 records (P4) read and written; extraction writes them (P5).

### Changes

- `electron/clip-provenance/source-info.cjs` (new): `SourceInfo.fromRecord(json)` for versions 1 and 2, `toRecord()`, validation (reference frames 1–4, 16-hex check values, ranges and times as non-negative integers), `trimmed`, `forMovieRange` (P4).
- `Mp4Provenance`: `read` returns a `SourceInfo` or `null`; `create` takes a `SourceInfo`; the 4,096-byte bound stays.
- `ClipExtractionRuntime.prepareProvenance`: build version 2 with both ends as reference frames and the ends' times from the session's frame identities (pts × timebase).
- `ClipSourceMovieRuntime` reads `sourceInfo.movieDisplayName`.
- Fixtures: add version 2 tagged clips and a version 2 record with a single non-end reference frame to `tests/fixtures/source-movie/`, generated as the README describes.

### Validation

Gates: G4, G5.

### Rollback/Containment

Revert the milestone commit before any version 2 clip is written outside tests; afterwards, keep version 2 reading when reverting anything else, so such clips stay readable.

## Milestone 4 - Clip and movie-window sources in the main process

### Scope

Requests to open a clip and its movie window, cut and cache windows, and anchor them (P6–P9).

### Changes

- `electron/zoom-edit-sources.cjs`, `electron/movie-window-cache.cjs` (new); `electron/source-movie-locator.cjs` gains placement by stored time, cached index (per P1) or estimate.
- `FrameReviewHost.findFrameByCheckValue` (and the host's public interface), with a review-session test using a fixture whose frames' check values are known.
- `main.cjs` and `preload.cjs`: the three `zoom-edit-*` requests; a renderer adapter `ElectronZoomEditSourceService` (`src/adapters/electron/`) validating answers.
- E2E hook reuse: the picker continues to honor `__testSetNextMoviePath`.

### Validation

Gates: G6, G7. Negative cases: ungranted folder, path-like names, an untagged clip asking for a window, a movie that does not match the fingerprint, a window without any reference frame (widen, then `not-found`), and in a widened window a reference placed in an added stretch is found before any previously covered frame is read. The cache test fills 11 windows and checks that the least recently used window and its prepared-review entries are gone and the others remain.

### Rollback/Containment

Revert; nothing in the renderer uses the requests yet.

## Milestone 5 - Saving a refined clip in the main process

### Scope

`clip-sandbox:zoom-edit-save` (P16, P17).

### Changes

- Extract the encoding of an exact range with audio from `ClipExtractionRuntime.allocateAndExtract` into a method both extraction and `RefinedClipSaver` use, keeping extraction's behavior (its tests stay green unchanged).
- `electron/refined-clip-saver.cjs` (new) with the naming and Replace sequence of P17, `shell.trashItem` for the Recycle Bin, and the record of P16 written and read back.
- `main.cjs`, `preload.cjs`, and the renderer adapter's save method with progress and cancel like extraction's.

### Validation

Gates: G8. Negative cases: a renderer-supplied range outside the window's one-minute limit, an unanchored window id, the target `.mp4` name taken, the Recycle Bin move refused, cancellation mid-encode (no files left behind).

### Rollback/Containment

Revert; extraction behavior is protected by its unchanged tests.

## Milestone 6 - Player and edit session for Zoom edit mode

### Scope

`RefineRange`, `ZoomEditModeSession`, compact muted player (P10–P12).

### Changes

- `src/domain/refine-range.ts`, `src/app/zoom-edit-mode-session.ts` (new).
- `FrameReviewPlayerControl`: `mountInGifScreen` and `mountInZoomEdit` replace `mount` (P12); `IFrameReviewOpenRequest.muted` through `ElectronFrameReviewService`, `frame-review-ipc.cjs` and `ReviewSession`.
- `GifExtractionScreen` and `RefineGifScreen`: call `mountInGifScreen` on activation and make no player calls while inactive.

### Validation

Gates: G9. Tests include: staged ends survive the clip-to-window switch; Q during playback pauses and stages the shown frame; Z during playback starts the loop; W before the start is refused with its reason; extension refused before anchoring with the right reason, allowed after, and capped at one minute; mounting in Zoom edit mode hides the progress row, transport, readiness and readout, and mounting back in a GIF screen shows them again; an inactive GIF screen's render leaves the player untouched.

### Rollback/Containment

Revert; nothing opens the session yet.

## Milestone 7 - Zoom edit mode in the Collection view

### Scope

Entry, keys, hint line, saving dialog and leaving (P13–P15).

### Changes

- `ZoomOverlayControl`: an edit surface slot that holds the compact player and the hint line under it (column layout), `closeRequested` on backdrop click, current muted state.
- `src/ui/zoom-edit-mode-keyboard.ts`, `src/ui/save-refinement-dialog-control.ts` with markup in `index.html`, `DiscardRefinementDialogControl.forZoomEdit`.
- `src/app/zoom-edit-mode-workflow.ts`, `src/app/zoom-edit-mode-leave-policy.ts`; `ApplicationShellControl` consults both leave policies; `FolderSelectionWorkflow` asks before folder loads and collection switches while the mode has staged edits; `OpenFolderRefresher` defers re-listing while the mode is active.
- `GridContextMenuWorkflow`/`GridContextMenuControl`: Refine item for every clip, opening Zoom and entering the mode; `ZoomEditMenuControl` lists Refine as a mode entry (P15).
- `AppKeyDownHandler`: Zoom edit mode first; dialog check includes the new dialogs.
- `AppController`: composition only.

### Validation

Gates: G10, G11. Tests cover every key while playing and paused, each refusal's hint text, Escape returning to Zoom, a second Escape closing Zoom, backdrop click, screen change and folder load asking with staged edits, and A/Left/Right keeping their Zoom meanings outside the mode.

### Rollback/Containment

Revert; Zoom and Loopify behave as before.

## Milestone 8 - Keep both, Replace and the grid after saving

### Scope

The saved clip in the views (P18).

### Changes

- `src/app/created-clip-insertion.ts` (new, P19): the insertion logic moved from `ZoomWorkflow.showCreatedClip`, which now calls it; Loopify's existing tests in `tests/unit/zoom-workflow.spec.ts` and the app-level Loopify tests stay green unchanged and guard the move.- `ZoomEditModeWorkflow` applies the save answer; `CreatedClipInsertion` for Keep both; `Clip.replaceFile`, cache-busting media address, grid invalidation and source-movie re-read for Replace; `Pipeline` rename plus collection rewriting through `CollectionFileWriter` for a non-MP4 Replace; Activity messages.
- `tests/e2e/zoom-edit-mode.spec.ts` with fixtures generated at test time from `tests/fixtures/gif-extraction/generated` (a movie, a tagged clip cut by a real extraction, an untagged clip).

### Validation

Gates: G12, G13.

### Rollback/Containment

Revert the milestone; Milestones 1–7 stay valid.

## Milestone 9 - Documentation, full validation and the real-app check

### Scope

Docs and the user-visible goal.

### Changes

- `doc-update`: architecture map (Zoom and Zoom edit mode, source info version 2, movie windows, removed Collection Refine); `DESIGN.md` (Zoom edit mode's hint line and compact player).

### Validation

Gates: G14, G15, G16. Real-app check in the running app with a throwaway profile and a throwaway copy of `extraction-tmp` (never the original folder):

1. A clip with source info: trim at once; extend after the window is ready (about twenty seconds on first use); extending stops one minute past each end; save with Replace; the grid and Zoom show the new frames under the same name; reopening finds the window instantly.
2. The same kind of clip with the movie lookup cancelled: trim and Keep both; the saved clip keeps the glyph; reopening it with the movie located extends it.
3. An untagged clip: trim and Keep both; stepping past its ends explains why.
4. Keys while playing and while paused; Escape, backdrop click and switching screens with staged edits ask first.

Record observations and screenshots in `test-evidence/zoom-edit-mode/m9/`.

### Rollback/Containment

Revert the documentation commit.

## Milestone 10 - Loopify as an edit inside Zoom edit mode

### Scope

After Milestones 1–9 are done, Loopify stops being a one-shot menu action and becomes another edit the user can stage in Zoom edit mode, alongside Refine.

### Changes

- First, design it and present the design and its reasoning to the user in the session (not a written spec): how Loopify is staged and previewed in the mode, how it combines with a staged Refine when both are set, its key and hint-line text, how saving and the Keep both / Replace choice apply, what happens to its audio and source info, and which parts of Milestones 6–8 it reuses. The expected outcome is that Loopify is saved through the mode's save path and the one-shot path is removed: `ZoomVideoEditWorkflow`, Loopify's entry as a file edit in Zoom's edit menu and `VideoEditCatalog`, and whatever of `ClipEditor` only that path uses; the FFmpeg step that makes a clip loop stays, called by the save. If the design keeps any of these, it says why.
- After the user approves the design, record its decisions in this plan's Decision Log, add the changes and gates here, and implement them with the same skill gates as Milestones 6–8.

### Validation

Gates are added with the approved design; they include the full suite (`npm run test:all`) and a real-app check of Loopify in Zoom edit mode.

### Rollback/Containment

Revert the milestone's commits; Loopify returns to the one-shot action of Milestones 1–9.

## Rejected alternatives

- R1: Build Zoom edit mode on `MovieRangeSession` - its capture queue, extraction and generation-bound refinement do not fit one clip whose source switches from the clip to its window; superseded by P10 and P11.
- R2: Reuse `GifWorkflowKeyboard` for Zoom edit mode - it drops unavailable keys silently and owns F, E and Escape for movie full screen; superseded by P13.
- R3: Let the renderer send the source-info record to write - the main process would trust renderer data for a file it writes; superseded by P16.
