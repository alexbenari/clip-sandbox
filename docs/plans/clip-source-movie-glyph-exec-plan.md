# Show the source movie glyph on Collection clips

## Why this matters

Clips that Clip Sandbox extracts from a movie carry a metadata tag naming that movie, but the Collection grid does not show it, and a clip refined into a saved collection is named after the collection, so its file name no longer reveals the movie. After this work, each such clip's grid card shows a small film glyph whose tooltip names the movie, read straight from the clip file with no cache. The signed-off spec is [`docs/specs/clip-source-movie-glyph-spec.md`](../specs/clip-source-movie-glyph-spec.md); this plan cites its decisions as "spec D1"–"spec D9".

## Progress

- [ ] Milestone 0 - Workspace setup (dependencies, native products for end-to-end tests)
- [ ] Milestone 1 - Direct metadata reader replaces FFprobe for every source-info read
- [ ] Milestone 2 - Folder read across the process boundary
- [ ] Milestone 3 - Glyph on grid cards
- [ ] Milestone 4 - Documentation and full validation

Evidence logs: `test-evidence/clip-source-movie/` (ignored by git). It already holds `probe-bench.cjs` and `benchmark-2026-10-26.txt`: the measurement behind spec D2, a prototype box walker compared against FFprobe on the user's real clips.

## Skill Gates

Planning-time gates:

- plan-review: before each sign-off request and after substantial revisions.
- api-and-interface-design: used for the new IPC request, the renderer service interface, and the reader's error contract (D1, D4, D5).
- domain-modeling: used for the new `SourceMovie` value and where its state lives (D5, D6).
- `coding-quality.md` and `docs/agent-docs/agent-architecture-map.md` (architecture axioms 2, 3, 6, 8, 11): read before choosing class ownership and layer placement.

Execution-time gates:

- code-quality-review: at the end of Milestones 1, 2, and 3, before their validation gates.
- testing-discipline: before writing or changing any test.
- typescript-coding: for every TypeScript change in Milestones 2 and 3.
- security-and-trust-boundaries: Milestones 1 and 2 parse untrusted file bytes and a renderer-supplied folder path and file names.
- error-and-correctness-traps: Milestones 1–3 add I/O error handling, bounded concurrent reads, and stale asynchronous answers.
- writing-clean-code: for each new class.
- `ui-coding-quality.md`: before the grid and workflow changes in Milestone 3.
- run: for the manual check in the real app (G9).
- doc-update: Milestone 4.

Unavailable skills or fallbacks:

- none known at planning time.

## Surprises & Discoveries

- Discovery: switching between a folder's full clip list and a saved collection re-lists the folder from disk, so spec D4's sentence "switching asks nothing new" does not match the code; D7 reads on those switches too. Spec D4 is to be amended to match at plan sign-off.
  Evidence: `FolderSelectionWorkflow.switchSelectionFromDisk` in `src/app/folder-selection-workflow.ts` calls `folders.refreshFolder` before reloading the selection.
- Discovery: `Clip.replaceSource` runs for every listed clip on every view switch, Trash, and Loopify insertion, so it cannot signal "this file was replaced"; D6 replaces spec D6's clearing rule. Spec D6 is to be amended to match at plan sign-off.
  Evidence: `Pipeline.setVideoSources` and `Pipeline.#clipForSource` in `src/domain/pipeline.ts`.
- Discovery: the grid keeps cards of other views in a cache and reuses them unchanged, so glyph updates must reach cached views, not only the visible one (D8).
  Evidence: `gridViewCache`, `cachedEntryFor`, and `showCachedEntry` in `src/ui/clip-collection-grid-control.ts`.
- Discovery: this worktree has no `native-build/` or `tools/frame-review/.deps/` (both ignored by git), so native end-to-end tests would skip; Milestone 0 links them from the main checkout.

## Decision Log

| ID | Decision | Rationale | Date |
|---|---|---|---|
| D1 | New class `Mp4MetadataTagReader` in `electron/clip-provenance/mp4-metadata-tag-reader.cjs` with one method, `read(filePath, key)`. It walks top-level boxes to `moov`, then `udta`, then `meta`, reads at most 64 KiB of `meta`, and returns the raw string stored under `key` in its `keys`/`ilst` lists. It returns `null` when the file has no such key or its box structure is malformed, truncated, or over the bound. It throws only when the file cannot be opened or read. | Separates "no tag" from "cannot read the file", which spec D9 and the Refine reasons need; one method keeps the boundary deep. |
| D2 | `Mp4Provenance` in `electron/clip-provenance/mp4-provenance.cjs` reads through the D1 reader: `read(clipPath)` returns the validated record or `null`, and lets read errors propagate; `readBack(outputPath)` returns the exact serialized string or throws. Both lose their FFprobe, command-runner, environment, and signal parameters. `CollectionClipRefinement` loses `resolveFfprobe`, `runCommand`, and `environment`. The extraction runtime keeps FFprobe for its media check (`verifyMedia`) only. | Spec D2: one reader, no FFprobe for source info. Propagated read errors make the Refine menu show "Couldn't read source movie info" for real read failures. |
| D3 | Only files whose extension is `.mp4` (any letter case) are opened for source info, in the folder read and in Refine. Any other video file has no source info. | Spec D1. Clip Sandbox writes the tag only into `.mp4` output. |
| D4 | New class `ClipSourceMovieRuntime` in `electron/clip-source-movie-runtime.cjs` serves the IPC channel `clip-sandbox:clip-source-movies-read`. Request: `{ folderPath, filenames }` with at most 20,000 names. It checks the folder grant through `FolderAccessRegistry.requireKnownPath` and each name the way `CollectionClipRefinement.clipProvenance` does today, then reads four files at a time and answers `{ clips: [{ filename, kind: 'movie', movieFileName } | { filename, kind: 'none' } | { filename, kind: 'unreadable' }] }` in request order. An invalid request rejects as a whole. | Spec D4 and D5. Only the movie's file name crosses the boundary; the grant check keeps the renderer from probing arbitrary folders. |
| D5 | Renderer contract: `IClipSourceMovieService.readClips(folder: FolderAccess, clipNames: readonly string[]): Promise<ClipSourceMovieReport>` in `src/app/clip-source-movie-service.ts`. `ClipSourceMovieReport` (same file) is an immutable class with `sourceMovieOf(clipName): SourceMovie \| null` and `unreadableCount`. The domain value `SourceMovie` (`src/domain/source-movie.ts`) is built only by `SourceMovie.fromFileName(fileName)` and exposes `fileName` and `name`, the file name without its final extension, or the whole file name when that would be empty. The Electron adapter `src/adapters/electron/electron-clip-source-movie-service.ts` validates the unknown IPC response and builds the report. | Takes `FolderAccess` rather than a raw path, so a caller cannot pass an unopened folder. The movie-name rule lives once, on the domain value. |
| D6 | `Clip` (`src/domain/clip.ts`) gains `sourceMovie: SourceMovie \| null`, initially `null`, set by `recordSourceMovie(movie: SourceMovie \| null)`. `replaceSource` leaves it alone. A clip keeps its value until an answer for it arrives, so a view switch does not make glyphs flicker. | Spec D6, as amended: the file can only be known to have changed when it is read again, so every answer overwrites the stored value. |
| D7 | New class `ClipSourceMovieWorkflow` in `src/app/clip-source-movie-workflow.ts`. `readOpenFolder()` reads every name in the open pipeline (`Pipeline.videoNames()`) and is called by `FolderSelectionWorkflow` after a successful `loadPipeline` (first load, catalog load, and `refreshActiveFolder`) and after a successful `switchSelectionFromDisk`. `readCreatedClip(clip)` reads one clip and is called by `ZoomWorkflow` after a Loopify output is inserted into either view. Trash triggers no read. An answer is applied only when the open `FolderAccess` and `Pipeline` are the same objects as at request time and no newer `readOpenFolder` began; it sets each named clip's `sourceMovie` through `Pipeline.clipMap()`, asks the grid to refresh glyphs, then reports at most one Activity note through `ActivityReporter.information`: `AppText.sourceMovieReadFailedText(folderName)` when the request rejected, or `AppText.unreadableSourceMoviesText(count)` when `unreadableCount > 0`. | Spec D4, D9, and its stale-answer rule. Direct workflow-to-workflow calls follow the existing `FolderSelectionWorkflow` and `ZoomWorkflow` dependency style (narrow `Pick<>` types). |
| D8 | `ClipCollectionGridControl` (`src/ui/clip-collection-grid-control.ts`) adds a glyph element (`span.source-glyph`, a local 16px film SVG with 1.6px strokes using `currentColor`) to cards whose clip has a `sourceMovie`, with `title` and the card's `aria-description` set to `AppText.sourceMovieText(movie)` ("From <name>"). New public method `refreshSourceMovieGlyphs()` updates the glyph and description of every card in the visible view and in every cached view from its clip. The CSS rule that hides `.filename` under `.titles-hidden` also hides `.source-glyph`. `fromDocument` receives `AppText`. | Spec D7. Reusing the titles rule makes the glyph follow titles in the grid, Zoom, and Collection full screen with no new state. The control owns its display text through injected `AppText` (architecture axiom 11). |
| D9 | Test media fixtures are generated once by FFmpeg, committed under `tests/fixtures/source-movie/`, and shared by all reader, runtime, and end-to-end tests. A truncated file is produced inside a test from the tagged fixture, in that test's own temporary folder. | Spec acceptance 8; committed media need no generator in CI. |

## Validation gates

| ID | Milestone | Proves | Needs milestones | How to check | Expected |
|---|---|---|---|---|---|
| G0 | 0 | Tests and native end-to-end tests can run in this worktree | 0 | `npm ci`, then `npm run build`, then `Test-Path` on the `ffprobe` path listed in `tools/frame-review/.deps/resolved-dependencies.json` and on `native-build/frame-review/bin` | Install and build succeed; both paths exist. |
| G1 | 1 | The reader returns tags, "none", and read failures correctly | 1 | `npx vitest --run tests/unit/mp4-metadata-tag-reader.spec.ts` | All cases in Milestone 1 Validation pass. |
| G2 | 1 | Provenance, Refine, and extraction use the reader and no FFprobe for source info | 1 | `npx vitest --run tests/unit/mp4-provenance.spec.ts tests/unit/collection-clip-refinement.spec.ts tests/unit/clip-extraction-runtime.spec.ts`, then `npm run typecheck`, `npm run lint`, `npm run unit`; then search `electron/clip-provenance` and `electron/collection-clip-refinement.cjs` for `ffprobe` and `runCommand` | All pass; the search finds no match. |
| G3 | 1 | The production reader matches FFprobe on the user's real clips | 1 | Copy `test-evidence/clip-source-movie/probe-bench.cjs` to `reader-parity.cjs` there, replace its prototype walker with `Mp4MetadataTagReader.read`, and run it read-only with the main checkout's `ffprobe.exe` on the four folders listed in `benchmark-2026-10-26.txt` | 127 files, 52 tagged, 0 mismatches; output saved to `reader-parity-<date>.txt`. |
| G4 | 1 | Extraction still writes and verifies the tag, and Refine still opens a tagged clip's movie | 0, 1 | `npm run build`, then `npx playwright test tests/e2e/gif-extraction-output.spec.ts tests/e2e/collection-refine.spec.ts` | All pass with none skipped; no "source metadata could not be verified" warning. |
| G5 | 2 | The folder read enforces its boundary and answers per clip | 2 | `npx vitest --run tests/unit/clip-source-movie-runtime.spec.ts tests/unit/electron-clip-source-movie-service.spec.ts tests/unit/source-movie.spec.ts`, then `npm run typecheck`, `npm run lint`, `npm run unit` | All pass. |
| G6 | 3 | Glyph drawing, visibility, cached views, and stale answers | 3 | `npx vitest --run tests/integration/ui/clip-collection-grid-control.spec.ts tests/unit/clip-source-movie-workflow.spec.ts tests/integration/app/app-controller.spec.ts` | All pass, including the Milestone 3 cases. |
| G7 | 3 | No regression across the renderer | 3 | `npm run typecheck`, `npm run lint`, `npm run unit` | All pass. |
| G8 | 3 | Real IPC and file reading show the glyph only on tagged clips | 0, 2, 3 | `npm run build`, then `npx playwright test tests/e2e/clip-source-movie-glyph.spec.ts` | Passes: the tagged clip's card has the glyph with tooltip "From <name>", and the untagged card has none. |
| G9 | 3 | The user-visible goal in the real app | 3 | Manual check through the `run` skill, below | Every item in the Milestone 3 manual check holds. |
| G10 | 4 | Documentation matches the code and nothing regressed | 4 | `doc-update` skill report, then `npm run test:all` | Docs updated; the full suite passes with no unexpected skips. |

## Outcomes & Retrospective

Not started.

## Context and orientation

Clip Sandbox is an Electron app. The main process (`electron/*.cjs`, CommonJS) is the only part that reads files; the renderer (`src/**/*.ts`, built to `build/src/`) reaches it through the preload API in `electron/preload.cjs`, registered with `ipcMain.handle` in `electron/main.cjs`. The renderer layers are `src/domain/` (models such as `Clip` and `Pipeline`), `src/app/` (workflows, interfaces, `AppText`, and the composition root `src/app/app-controller.ts`), `src/adapters/electron/` (renderer-side IPC clients), and `src/ui/` (controls; only the composition root imports them).

Source info today: `Mp4Provenance` writes the `clip-sandbox.prov.v1` tag during extraction and reads it by running FFprobe. `CollectionClipRefinement` (`electron/collection-clip-refinement.cjs`) uses it for `inspect` (the right-click menu's Refine availability, called by `GridContextMenuWorkflow`) and `resolve` (finding the source movie). The extraction runtime (`electron/clip-extraction-runtime.cjs`, `finalizeMedia`) reads the tag back after writing it and warns "Clip saved, but its source metadata could not be verified." when the read-back fails or differs.

Folder loading: `FolderSelectionWorkflow` (`src/app/folder-selection-workflow.ts`) builds a new `Pipeline` on every load or `refreshActiveFolder`, which creates new `Clip` objects; `switchSelectionFromDisk` re-lists the folder and updates the existing pipeline, keeping its clips. Loopify output is inserted by `ZoomWorkflow` (`src/app/zoom-workflow.ts`) through `PipelineWorkingCopy.insertCreatedClipInPipeline` or `insertCreatedClipAfter`. The grid (`ClipCollectionGridControl`) builds cards in `createThumbCard` and caches whole views by key; hiding titles adds `titles-hidden` to the grid root, and Collection full screen hides titles through the same switch.

Testing: `npm run unit` runs Vitest over `tests/unit` and `tests/integration` (jsdom by default; files may opt into Node). Main-process modules are tested by loading them with `createRequire` and injecting fakes. End-to-end tests (Playwright, `tests/e2e/`) need `npm run build` first and, for native media tools, `tests/support/frame-review-dependencies.ts`, which reads `tools/frame-review/.deps/resolved-dependencies.json`.

## Milestone 0 - Workspace setup

### Scope

Make unit and end-to-end tests runnable in this worktree without touching the main checkout.

### Changes

- Run `npm ci` in the worktree.
- Create directory junctions in the worktree (both paths are ignored by git) pointing at the main checkout's prepared native products, read-only:
  `New-Item -ItemType Junction -Path native-build -Target D:\tmp\dev\clip-sandbox\native-build` and
  `New-Item -ItemType Junction -Path tools\frame-review\.deps -Target D:\tmp\dev\clip-sandbox\tools\frame-review\.deps`.
  If `resolved-dependencies.json` holds absolute paths into the main checkout, they still resolve.

### Validation

Gates: G0.

### Rollback/Containment

Remove the two junctions (`Remove-Item` on the junction only, never `-Recurse`) and `node_modules`.

## Milestone 1 - Direct metadata reader replaces FFprobe for every source-info read

### Scope

All source-info reads in the main process go through the D1 reader (spec D2); behavior visible to the user is unchanged except that a clip whose file cannot be read shows "Couldn't read source movie info" in the Refine menu.

### Changes

- File: `tests/fixtures/source-movie/` (new, committed). Generate once with the FFmpeg in `native-build/frame-review/runtime/ffmpeg/` from a 1-second, 64×36 test pattern, each under 20 KB, and record the commands in `tests/fixtures/source-movie/README.md`:
  `tagged.mp4` (a valid `clip-sandbox.prov.v1` record built like `Mp4Provenance.create`, written with `-movflags +faststart+use_metadata_tags`);
  `tagged-moov-at-end.mp4` (same tag, `-movflags +use_metadata_tags` without `faststart`);
  `untagged.mp4` (normal output, no custom key);
  `no-metadata.mp4` (`-map_metadata -1 -fflags +bitexact -flags:v +bitexact`, so no `udta`/`meta`);
  `other-key.mp4` (only `-metadata example.other=1` with `use_metadata_tags`);
  `oversized.mp4` (the key with a 70 KB value);
  `invalid-record.mp4` (the key with valid JSON that fails `Mp4Provenance.validate`).
  Keep the exact tag string in `tests/fixtures/source-movie/expected-tag.json` so tests compare against it.
- File: `electron/clip-provenance/mp4-metadata-tag-reader.cjs` (new). Class per D1, using `fs.promises.open` and positioned reads; 64-bit box sizes supported; never reads `mdat`.
- File: `electron/clip-provenance/mp4-provenance.cjs`. Per D2: constructor takes an optional reader (default `new Mp4MetadataTagReader()`); `read(clipPath)` and `readBack(outputPath)` as in D2; keep `MAX_BYTES` and `validate`.
- File: `electron/collection-clip-refinement.cjs`. Remove `resolveFfprobe`, `runCommand`, `environment`; `clipProvenance` returns `null` without opening the file when the name is not `.mp4` (D3), else `this.provenance.read(clipPath)`.
- File: `electron/clip-extraction-runtime.cjs`. `finalizeMedia` calls `this.provenance.readBack(mediaPath)`; the warning path is unchanged.
- File: `electron/main.cjs`. Construct `CollectionClipRefinement` without the removed options.
- Tests: new `tests/unit/mp4-metadata-tag-reader.spec.ts` (Node environment); update `tests/unit/mp4-provenance.spec.ts`, `tests/unit/collection-clip-refinement.spec.ts`, and any extraction-runtime test that fakes `readBack` arguments.

### Validation

Gates: G1, G2, G3, G4.

New or changed tests, each seen failing first:

- Reader returns the exact `expected-tag.json` string for `tagged.mp4` and for `tagged-moov-at-end.mp4` (seen failing by reading `udta` from the wrong parent box).
- Reader returns `null` for `untagged.mp4`, `no-metadata.mp4`, `other-key.mp4`, `oversized.mp4`, and a copy of `tagged.mp4` cut to half its length in the test's temporary folder (seen failing by removing the bound and the truncation check in turn).
- Reader rejects with the file-system error for a path that does not exist (the "cannot be opened" case).
- `Mp4Provenance.read` returns `null` for `invalid-record.mp4` and the parsed record for `tagged.mp4`; `readBack` returns the exact string for `tagged.mp4` and throws for `untagged.mp4`.
- `CollectionClipRefinement.inspect` answers available for `tagged.mp4`, not available for `untagged.mp4` and for a `.mov` copy of `tagged.mp4` (D3), and rejects when the file is missing (so the menu shows the unreadable reason).

### Rollback/Containment

Revert the milestone commit; no stored data or IPC contract changed.

## Milestone 2 - Folder read across the process boundary

### Scope

The renderer can ask for every clip's source movie in an open folder and receive a validated report (D4, D5). Nothing is shown yet.

### Changes

- File: `src/domain/source-movie.ts` (new). `SourceMovie` per D5; frozen; `fromFileName` rejects an empty or path-containing name.
- File: `electron/clip-source-movie-runtime.cjs` (new). `ClipSourceMovieRuntime` per D4, constructed with `{ folderAccess, provenance }`; a small worker pool of four over the validated names; per-file read errors become `unreadable`, and a `console.warn('[clip-source-movies] unreadable', { count })` is logged once per request when `count > 0`, without file names.
- File: `electron/main.cjs`. Construct the runtime and register `ipcMain.handle('clip-sandbox:clip-source-movies-read', (event, request) => runtime.read(event, request))`.
- File: `electron/preload.cjs`. Expose `clipSourceMovies: { read(request) { return ipcRenderer.invoke('clip-sandbox:clip-source-movies-read', request); } }`.
- File: `src/app/clip-source-movie-service.ts` (new). `IClipSourceMovieService` and `ClipSourceMovieReport` per D5.
- File: `src/adapters/electron/electron-clip-source-movie-service.ts` (new). `static tryCreate(win)` like `ElectronCollectionClipRefinementService`; validates that the response has exactly one entry per requested name, each with a known `kind`, and a string `movieFileName` for `movie`; otherwise throws "Clip source movie answer is invalid."
- Tests: new `tests/unit/source-movie.spec.ts`, `tests/unit/clip-source-movie-runtime.spec.ts` (Node environment, real fixtures copied into a temporary folder, fake folder-access registry), `tests/unit/electron-clip-source-movie-service.spec.ts`.

### Validation

Gates: G5.

New tests, each seen failing first:

- `SourceMovie.fromFileName('Heat.1995.1080p.mkv').name` is `Heat.1995.1080p`; `'Heat'` stays `Heat`; `'.mkv'` stays `.mkv`.
- The runtime answers `movie` with the record's movie file name for `tagged.mp4`, `none` for `untagged.mp4` and for a `.webm` name without opening it (a reader fake records which paths it opened), and `unreadable` for a listed name whose file is missing, in request order.
- The runtime rejects an ungranted folder, a name with a path separator, `..`, a non-video name, and more than 20,000 names, before reading any file.
- The adapter returns a report whose `sourceMovieOf` and `unreadableCount` match the answer, and throws for a missing entry, an unknown `kind`, or a non-string `movieFileName`.

### Rollback/Containment

Revert the milestone commit; the new channel has no caller yet.

## Milestone 3 - Glyph on grid cards

### Scope

The user-visible feature: glyphs on tagged cards after every load or re-listing, following titles, with Activity notes for read failures (spec D4, D6, D7, D9).

### Changes

- File: `src/domain/clip.ts`. `sourceMovie` and `recordSourceMovie` per D6.
- File: `src/app/app-text.ts`. `sourceMovieText(movie)` returns `From <movie.name>`; `unreadableSourceMoviesText(count)` returns `Couldn't read source movie info for 1 clip` or `for <count> clips`; `sourceMovieReadFailedText(folderName)` returns `Couldn't read source movie info in <folderName>`.
- File: `src/app/clip-source-movie-workflow.ts` (new). `ClipSourceMovieWorkflow` per D7, with dependencies `{ service: IClipSourceMovieService | null, pipelineWorkingCopy: Pick<PipelineWorkingCopy, 'pipeline'>, openFolder: Pick<AppSessionState, 'currentFolderAccess'>, grid: { refreshSourceMovieGlyphs(): void }, reporter: Pick<ActivityReporter, 'information'>, appText: AppText }`. With no service (non-Electron runs) both methods do nothing. Methods return promises so tests can await them; callers do not await them.
- File: `src/app/folder-selection-workflow.ts`. Add dependency `sourceMovies: Pick<ClipSourceMovieWorkflow, 'readOpenFolder'>`; call it after a successful `loadPipeline` and after a successful `switchSelectionFromDisk`.
- File: `src/app/zoom-workflow.ts`. Add dependency `sourceMovies: Pick<ClipSourceMovieWorkflow, 'readCreatedClip'>`; call it with the inserted clip in both insertion paths.
- File: `src/ui/clip-collection-grid-control.ts`. Per D8: glyph in `createThumbCard`, `refreshSourceMovieGlyphs()`, CSS for `.source-glyph` (top-left, 6px inset, Quiet Slate `#94a3b8` icon on `rgba(11,15,20,.6)` with 6px radius; it keeps pointer events so its tooltip shows on hover, and since it sits inside the card, clicks and drags that start on it reach the card) and the shared `.titles-hidden` rule; `fromDocument` takes `appText`.
- File: `src/app/app-controller.ts`. Create `ElectronClipSourceMovieService.tryCreate(window)` and `ClipSourceMovieWorkflow`; pass `appText` to the grid factory and `sourceMovies` to the two workflows.
- Tests: extend `tests/integration/ui/clip-collection-grid-control.spec.ts`; new `tests/unit/clip-source-movie-workflow.spec.ts`; extend `tests/integration/app/app-controller.spec.ts` and its desktop API fakes in `tests/integration/app/desktop-api-fakes.ts`; new `tests/e2e/clip-source-movie-glyph.spec.ts` with a fixture folder built at test time from `tests/fixtures/source-movie/tagged.mp4` and `untagged.mp4`.

### Validation

Gates: G6, G7, G8, G9.

New or changed tests, each seen failing first:

- Grid: a card whose clip has a source movie shows the glyph with tooltip and `aria-description` "From Heat"; a card without one has neither; `titles-hidden` hides the glyph while `aria-description` stays; after `refreshSourceMovieGlyphs()`, a card in a cached (not visible) view shows the glyph when that view is shown again.
- Workflow: an answer sets `sourceMovie` on the named clips and refreshes the grid; an answer arriving after another folder opened, or after a newer `readOpenFolder`, changes no clip (hold the first answer open with a deferred promise, open the second folder, then release it); a clip keeps its previous movie until its new answer arrives; one note with the count when some clips are unreadable; one folder note when the request rejects; no note when all clips answer `movie` or `none`.
- App level: after loading a folder through the fake desktop API whose source-movie answer marks one clip, that clip's card shows the glyph; after a Loopify insertion the created clip is read.
- End to end (G8): the real app shows the glyph only on the tagged card.

Manual check in the real app (G9), using the user's `extraction-tmp` pipeline, reading only (do not save, move, or delete anything):

1. Glyphs appear on the 52 tagged clips and on none of the 3 untagged ones, within about a second of the grid appearing.
2. Hovering the glyph shows the tooltip naming the movie without its extension; clicking and dragging from the glyph select and move the card as elsewhere; the accessibility tree (browser pane `read_page`) shows the card's description "From <name>".
3. Hide titles hides the glyphs; show titles restores them; Zoom and Collection full screen follow the titles setting.
4. Switching to a saved collection and back keeps the glyphs without flicker.
5. Right-click Refine availability is unchanged for a tagged and an untagged clip.

Record what was observed in `Progress` and the evidence folder.

### Rollback/Containment

Revert the milestone commit; Milestones 1–2 stay valid on their own.

## Milestone 4 - Documentation and full validation

### Scope

Agent docs and the design system describe the feature; the full suite passes.

### Changes

- `docs/agent-docs/agent-architecture-map.md` through the `doc-update` skill: the direct reader, the folder read and its trigger points, `SourceMovie` on `Clip`, and the glyph's visibility rule; remove the FFprobe description of source-info reads.
- `DESIGN.md`, Clip Cards: one sentence on the source glyph (top-left, Quiet Slate on translucent Booth Black, hidden with titles).
- Spec: no change expected beyond the D4 and D6 amendments made at plan sign-off.

### Validation

Gates: G10.

### Rollback/Containment

Revert the documentation commit.

## Rejected alternatives

- R1: Clear a clip's source movie in `Clip.replaceSource` - rejected because that runs on every view switch, Trash, and Loopify, which would wipe glyphs; superseded by D6.
- R2: Skip the read on view switches - rejected because a switch re-lists the folder from disk and could show stale glyphs for replaced files; superseded by D7.
- R3: Keep the parity check against FFprobe as an automated test - rejected because it would skip wherever native tools are absent; fixtures with a known tag string give the same proof everywhere; superseded by D9 and G3.
