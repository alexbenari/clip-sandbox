# Build Clips on a Domain `ClipSource` Instead of the Browser `File`

Status: signed off (2026-10-16)

Spec: [`docs/specs/clip-source-spec.md`](../specs/clip-source-spec.md) (signed off 2026-10-16). Spec decisions are cited as spec D1 to D12; this plan's own decisions are P1 onward.

## Why this matters

Users see no change: opening folders, collections, the grid, Zoom and video edits behave exactly as before. The change matters to whoever works on the app next. Today the domain's clip (`Clip`) and folder model (`Pipeline`) are built on the browser's `File` type, so the domain cannot be built or tested without a DOM, and a different media host would mean changing the domain. After this plan the domain describes a clip's media with its own value, `ClipSource`, and only the Electron adapter knows the desktop's data shapes.

## Progress

- [ ] M1: delete the unused browser folder adapters.
- [ ] M2: `ClipSource` in the domain; `Clip`, `Pipeline`, the working copy, Zoom, `ClipEditor` and the grid use it.
- [ ] M3: folder listings arrive as `FolderEntry` values; the last `File`-based types are removed.
- [ ] M4: full end-to-end run, architecture map, acceptance check.

Evidence logs: `test-evidence/clip-source/` (ignored by git, never cleaned by a test runner). Each commit's pre-commit hook output goes to `test-evidence/clip-source/m<N>-commit-hook.log`.

## Skill Gates

Planning-time gates:

- `plan-review` (`.agents/skills/plan-review/SKILL.md`): run on this plan before the sign-off request and after any substantial revision.
- `coding-quality.md`: governs the new value class, layer placement and naming (P1 to P4). Its comment rule applies: no introductory doc blocks on classes, methods or types.
- `docs/agent-docs/agent-architecture-map.md` axioms: domain imports nothing outward (axiom 8 on class ownership applies to `ClipSource.create`); interfaces carry the `I` prefix, type aliases do not (axiom 13).

Execution-time gates:

- `coding-quality.md` and `ui-coding-quality.md`: before editing each file, and a final pass at M4 recording any deviation in `Outcomes & Retrospective`.
- `cost-aware-delegation` (`.agents/skills/cost-aware-delegation/SKILL.md`): applied to the test-fixture migration in M2 and M3; the decision is P6.
- `doc-update` (`.agents/skills/doc-update/SKILL.md`): at M4 for the architecture map.
- Goal-based verification (`AGENTS.md`): the M4 gates prove the spec's acceptance behavior, not only that code changed.

Unavailable skills or fallbacks:

- none.

## Surprises & Discoveries

- Discovery: one end-to-end check is intermittent. "F and Escape review the same movie at display size and restore the workspace" (`tests/e2e/gif-movie-fullscreen.spec.ts`) sometimes sees the full-screen controls still visible 5 seconds after a mouse move.
  Evidence: on 2026-10-16 it failed 2 of 9 runs at commit `f5bd13a` and passed 5 of 5 at `76f22a0`; logs in `test-evidence/remaining-review-findings/e2e-after-15*.log`. That code is not touched by this plan; G9 says how to treat a failure there.

## Decision Log

| ID | Decision | Rationale | Date |
|---|---|---|---|
| P1 | `ClipSource` is a class in `src/domain/clip-source.ts` with a private constructor, `static create({ name, mediaSource, desktopPath })`, and read-only `name`, `mediaSource` and `desktopPath` properties; instances are frozen. `create` trims `name` and `mediaSource`, throws `Error('Clip source name is required.')` or `Error('Clip source media address is required.')` when either is empty, and stores `desktopPath` trimmed, or `null` when missing or blank. | Implements spec D1 and D2 with explicit class ownership. The two errors are programmer-facing; users only see them through the existing folder-read and edit failure reports. | 2026-10-16 |
| P2 | `Pipeline` members are renamed: `videoFiles()` to `videoSources()`, `setVideoFiles` to `setVideoSources`, `upsertVideoFile` to `upsertVideoSource`, constructor option `videoFiles` to `videoSources`. `videoFileMap()` is removed because nothing in `src/` calls it. `upsertVideoClip(source)` keeps its name. `Clip.replaceFile` becomes `replaceSource`. | Implements spec D3; names say what the members hold. | 2026-10-16 |
| P3 | `FolderEntry` is a type alias in `src/business-logic/folder-entry.ts`: `Readonly<{ name: string; type: string; mediaSource: string; desktopPath: string \| null; text?: string }>`. | Implements spec D4. A plain data shape crossing a boundary needs no behavior, so a type alias, not a class. | 2026-10-16 |
| P4 | `ElectronFolderService.clipSourceOf(created)` converts a created edit output. During M2 the folder listing still produces `File` objects through the existing `toRendererFile`; M3 replaces that with `folderEntryOf(entry)` and removes `toRendererFile`. | Lets M2 change the domain without also changing folder loading, so each milestone is smaller and green on its own (spec D12). | 2026-10-16 |
| P5 | During M2 only, `PipelineFactory` turns each incoming video `File` into a `ClipSource` (name, the `mediaSource` property, the `path` property), and the `ClipFile` type that describes those files lives in `PipelineFactory.ts`, not the domain. M3 removes both. | The single place that touches `File` between M2 and M3, so M2 can be verified with folder loading unchanged. | 2026-10-16 |
| P6 | The test-fixture migration stays with the root. A shared helper, `tests/support/clip-source-fixtures.ts`, builds `ClipSource` and `FolderEntry` values, so most test edits become one-line replacements. | About 85 `File` constructions in 16 test files, 66 of them in four files. The edits depend on API changes made in the same milestone, and type checks plus the test run verify them. Briefing a cheaper agent on that context would cost about as much as doing it, so the cost gate does not pass. | 2026-10-16 |
| P7 | The domain tests run in Node by adding `// @vitest-environment node` as the first line of `tests/unit/clip-models.spec.ts`, `tests/unit/pipeline-selection.spec.ts` and `tests/unit/pipeline-factory.spec.ts`, plus the new `tests/unit/clip-source.spec.ts`. | Proves spec D11: if anything in those paths needed jsdom or another DOM API, these files would fail. Node 22 itself defines a global `File`, so the absence of the `File` type is proved by the searches in G5 and G7, not by the environment. | 2026-10-16 |
| P8 | The unit and integration gate for each milestone is the pre-commit hook's full run (`npx vitest run`), recorded in its log. During editing, run only the affected spec files. | The hook already runs the full suite on every commit; running it again by hand would repeat the same measurement. | 2026-10-16 |
| P9 | `PipelineFactory.filterAndSortFiles` is removed with its test case in `tests/unit/logic.spec.ts`. | Nothing in `src/` calls it, and it only differed from the factory's own classification by the subfolder filter that spec D9 removes. | 2026-10-16 |

## Validation gates

| ID | Milestone | Proves | Needs milestones | How to check | Expected |
|---|---|---|---|---|---|
| G1 | 1 | The browser folder adapters are gone and nothing referred to them | 1 | `npx tsc --noEmit -p tsconfig.json` and `npx tsc --noEmit -p tsconfig.strict-src.json`; search `src`, `tests`, `docs/agent-docs` for `browser-file-system-service`, `file-system-adapter`, `BrowserFileSystemService`, `FileSystemAdapter` | Both type checks print nothing; the search finds nothing |
| G2 | 1 | Existing behavior unchanged | 1 | Pre-commit hook log `test-evidence/clip-source/m1-commit-hook.log` | All test files pass; the test count drops only by the deleted adapter tests |
| G3 | 2 | The domain works without jsdom | 2 | `npx vitest run tests/unit/clip-source.spec.ts tests/unit/clip-models.spec.ts tests/unit/pipeline-selection.spec.ts` (Node environment, P7) | All pass |
| G4 | 2 | `ClipSource` enforces its invariants | 2 | Cases in `tests/unit/clip-source.spec.ts`: trims name; rejects empty name; rejects empty media address; blank desktop path becomes `null`; instance is frozen | All pass |
| G5 | 2 | The domain names no `File` type | 2 | Search `src/domain` for `\bFile\b`, `ClipFile`, `ClipFileSnapshot` | No match |
| G6 | 2 | Type checks and the full unit and integration suite stay green | 2 | Both `tsc` commands from G1; hook log `m2-commit-hook.log` | No type errors; all tests pass |
| G7 | 3 | No `File`-based type, `file.text()` or clip `blob:` address remains in renderer code (spec acceptance 1) | 3 | Search `src/domain src/business-logic src/app src/ui` for `\bFile\b` used as a type, `ClipFile`, `ClipFileSnapshot`, `CreatedVideoFile = File`, `.text()`, `createObjectURL(clip` | No match. Allowed: `File:` inside err.log text in `app-diagnostics.ts` |
| G8 | 3 | Folder loading builds the pipeline from plain entries and still reports invalid collections; it runs without a DOM | 3 | `npx vitest run tests/unit/pipeline-factory.spec.ts tests/unit/business-logic.spec.ts tests/unit/electron-folder-services.spec.ts`; both `tsc` commands; hook log `m3-commit-hook.log` | All pass; `pipeline-factory.spec.ts` runs in Node |
| G9 | 4 | Every user flow touched is unchanged in the real app (spec acceptance 4) | 3 | `npm run e2e` with output to `test-evidence/clip-source/e2e-final.log` | 33 of 33 pass. If only the intermittent full-screen check fails, rerun `npx playwright test tests/e2e/gif-movie-fullscreen.spec.ts --repeat-each=5`; accept when it passes at least as often as recorded in `Surprises & Discoveries`, and report it |
| G10 | 4 | The architecture map is current (spec acceptance 5) | 4 | Map describes `ClipSource` and `FolderEntry`; no reference to `ClipFileSnapshot` or the deleted adapters; every relative link resolves | True |

## Outcomes & Retrospective

To be written at M4: what shipped, gate evidence, the final `coding-quality.md` pass, and follow-ups.

## Context and orientation

The app is an Electron desktop app. Its renderer code is TypeScript under `src/`, in layers:

- `src/domain/`: the model. `Clip` (`clip.ts`) is one video in the grid; `Pipeline` (`pipeline.ts`) is an opened folder's videos plus its saved collections, with exactly one `Clip` per video name.
- `src/business-logic/`: rules built on the domain. `PipelineFactory.ts` builds a `Pipeline` from an opened folder's files; `clip-editor.ts` (`ClipEditor`) prepares a video edit such as Loopify; `collection-text-format.ts` reads and writes collection `.txt` files.
- `src/app/`: workflows. `pipeline-working-copy.ts` (`PipelineWorkingCopy`) is the editable state of the open folder; `zoom-workflow.ts` runs Zoom and inserts the clip a video edit creates; `folder-access.ts` defines `FolderContents`, what opening a folder yields; `folder-selection-workflow.ts` opens and refreshes folders.
- `src/adapters/electron/`: the only code that talks to the desktop API. `electron-folder-service.ts` (`ElectronFolderService`) turns the desktop's folder listing into renderer objects; `electron-video-edit-service.ts` runs edits.
- `src/ui/`: controls. `clip-collection-grid-control.ts` renders clip cards and plays each clip from its media address.

How a clip's media flows today: the desktop process (`electron/folder-entry.cjs`) lists each top-level file as `{ name, path, relativePath, mediaSource, type, lastModifiedMs, size, text? }`, where `mediaSource` is a `file://` address and `text` is present for `.txt` files. `ElectronFolderService.toRendererFile` wraps each record in an empty browser `File` with extra properties. `PipelineFactory` sorts these into videos and collection files, reads collection files with `file.text()`, and gives the videos to `Pipeline`, which copies each into a `ClipFileSnapshot` (a frozen `File` subclass in `clip.ts`). `Clip` wraps one snapshot; the grid plays `clip.mediaSource`; `ClipEditor` reads `clip.file.path`. A created edit output (`CreatedVideoFile` in `clip-editor.ts`, a plain record typed as `File`) goes through `toRendererFile` and into the working copy.

The browser folder adapters `src/adapters/browser/browser-file-system-service.ts` and `src/adapters/browser/file-system-adapter.ts` are not imported by any production code (verified 2026-10-16).

Commands: `npx tsc --noEmit -p tsconfig.json` and `npx tsc --noEmit -p tsconfig.strict-src.json` (type checks); `npx vitest run [files]` (unit and integration, jsdom by default per `vitest.config.ts`); `npm run e2e` (rebuilds, then Playwright against the real Electron app). The pre-commit hook runs the full Vitest suite. On Windows use PowerShell, write BOM-free UTF-8, and make scripted edits assert their match counts (`AGENTS.md`).

## Milestone 1 - Delete the unused browser folder adapters

### Scope

Implements spec D10.

### Changes

- Delete `src/adapters/browser/browser-file-system-service.ts`, `src/adapters/browser/file-system-adapter.ts`, `tests/unit/browser-file-system-service.spec.ts` and `tests/unit/file-system-adapter.spec.ts`. The other files in `src/adapters/browser/` stay.
- Remove any reference found by the G1 search.

### Validation

Gates: G1, G2.

### Rollback/Containment

One commit; `git revert` restores the files.

## Milestone 2 - `ClipSource` in the domain

### Scope

Implements spec D1, D2, D3, D7, D8, D11, and the created-output half of D6. Folder loading still receives `File` objects (P4, P5).

### Changes

- File: `src/domain/clip-source.ts` (new)
  Edit: `ClipSource` per P1.
- File: `src/domain/clip.ts`
  Edit: `Clip` takes `{ id, source, durationSec?, videoWidth?, videoHeight? }` and stores the `ClipSource`; getters `source`, `name` (`source.name`) and `mediaSource` (`source.mediaSource`); `replaceSource(source)` replaces `replaceFile`. Remove `ClipFileSnapshot` and the `mediaSource` constructor option. Move the `ClipFile` type (a `File` with the desktop's extra properties) out of the domain into `src/business-logic/PipelineFactory.ts`, where the P5 bridge uses it; `src/app/folder-access.ts` and `ElectronFolderService` import it from there until M3 removes it.
- File: `src/domain/pipeline.ts`
  Edit: store `Map<string, ClipSource>`; renames per P2; `#clipForFile` becomes `#clipForSource`; sorting compares `source.name` as today.
- File: `src/business-logic/PipelineFactory.ts`
  Edit: bridge per P5 in `buildPipeline`: map each video file to `ClipSource.create({ name: file.name, mediaSource: file.mediaSource, desktopPath: file.path })` before constructing `Pipeline`.
- File: `src/business-logic/clip-editor.ts`
  Edit: source path is `clip.source.desktopPath ?? ''` (spec D7).
- File: `src/adapters/electron/electron-folder-service.ts`
  Edit: add `clipSourceOf(created: CreatedVideoFile): ClipSource` using `ClipSource.create({ name, mediaSource, desktopPath: path })`.
- File: `src/app/zoom-workflow.ts`
  Edit: `IZoomFolderFiles` declares `clipSourceOf` instead of `toRendererFile`; `showCreatedClip` converts once and passes the `ClipSource` to the working copy; messages use `source.name`.
- File: `src/app/pipeline-working-copy.ts`
  Edit: `insertCreatedClipInPipeline` and `insertCreatedClipAfter` take a `ClipSource`.
- File: `src/app/folder-selection-workflow.ts`
  Edit: `pipeline.setVideoSources(refreshed.pipeline.videoSources())`.
- File: `src/ui/clip-collection-grid-control.ts`
  Edit: play `clip.mediaSource` directly; remove the `URL.createObjectURL(clip.file)` fallback and the `blob:` revocation in `clearGridCards` (spec D8).
- File: `tests/support/clip-source-fixtures.ts` (new)
  Edit: `clipSource(name, { mediaSource?, desktopPath? })` returning `ClipSource.create` with `mediaSource` defaulting to `file:///clips/<name>` (P6).
- Files: `tests/unit/clip-source.spec.ts` (new, G4 cases); `tests/unit/clip-models.spec.ts`, `tests/unit/pipeline-selection.spec.ts` (Node environment per P7; build clips and pipelines from `clipSource`; the `ClipFileSnapshot` instance check becomes a `ClipSource` instance check); `tests/unit/encapsulation-contracts.spec.ts` (assert `clip.source` is frozen instead of `clip.file`); `tests/unit/clip-editor.spec.ts`, `tests/unit/pipeline-working-copy.spec.ts`, `tests/unit/zoom-workflow.spec.ts`, `tests/unit/zoom-video-edit-workflow.spec.ts`, `tests/unit/add-to-collection-workflow.spec.ts`, `tests/unit/collection-save-workflow.spec.ts`, `tests/unit/collection-view-workflow.spec.ts`, `tests/unit/delete-from-disk-workflow.spec.ts`, `tests/unit/grid-context-menu-workflow.spec.ts`, `tests/unit/grid-video-metadata-tracker.spec.ts`, `tests/integration/ui/clip-collection-grid-control.spec.ts` (use `clipSource` wherever they build a `Clip` or `Pipeline`).
- Files: `tests/integration/app/app-controller.spec.ts` and `tests/e2e/video-edit-recovery.spec.ts`
  Edit: the injected failure after an edit targets `ElectronFolderService.prototype.clipSourceOf` instead of `toRendererFile` (spec D6). The e2e change is exercised at G9.

### Validation

Gates: G3, G4, G5, G6. A test whose only purpose was the `blob:` fallback is deleted, not adapted; record it in `Surprises & Discoveries`.

### Rollback/Containment

One commit, or one per step if the edit grows; each keeps G6 green. `git revert` restores the previous model. Folder loading is untouched, so a failure here cannot affect how folders open.

## Milestone 3 - Folder listings as `FolderEntry` values

### Scope

Implements spec D4, D5, D9 and the listing half of D6; removes the P5 bridge.

### Changes

- File: `src/business-logic/folder-entry.ts` (new)
  Edit: `FolderEntry` per P3.
- File: `src/app/folder-access.ts`
  Edit: `FolderContents.files` is `FolderEntry[]`.
- File: `src/adapters/electron/electron-folder-service.ts`
  Edit: `contentsOf` maps each desktop record with `folderEntryOf(entry)`: `name`, `type` (or `''`), `mediaSource` (or `''`), `desktopPath` (`path` or `null`), and `text` when it is a string. Remove `toRendererFile` and the `relativePath`, `lastModifiedMs` handling.
- File: `src/business-logic/PipelineFactory.ts`
  Edit: work on `FolderEntry`. Remove `isTopLevelFolderEntry` and `topLevelFiles` (spec D9), `filterAndSortFiles` (P9) and the P5 bridge. Videos (by `type` starting with `video/` or a known extension, as today) become `ClipSource.create({ name, mediaSource, desktopPath })`; collection entries (`.txt`) are read with `collectionFormat.read({ text: entry.text ?? '', filename: entry.name })` (spec D5). `buildPipeline` declares `collectionFormat: Pick<CollectionTextFormat, 'read'>`. `PipelineBuildResult` lists `FolderEntry` values.
- File: `src/business-logic/collection-text-format.ts`
  Edit: remove `readFile`.
- File: `src/business-logic/clip-editor.ts`
  Edit: `CreatedVideoFile` becomes `Readonly<{ name: string; path?: string; mediaSource?: string }>`.
- File: `src/business-logic/PipelineFactory.ts`
  Edit: remove the `ClipFile` type moved here in M2.
- File: `src/app/folder-selection-workflow.ts`, `src/app/app-controller.ts`
  Edit: type follow-through only, if the type checks ask for it.
- Files: `tests/support/clip-source-fixtures.ts` (add `folderEntry(name, { text?, type? })`); `tests/unit/pipeline-factory.spec.ts` (Node environment per P7), `tests/unit/business-logic.spec.ts`, `tests/unit/logic.spec.ts` (drop the subfolder-filter and `filterAndSortFiles` cases, since spec D9 and P9 remove that behavior), `tests/unit/folder-selection-workflow.spec.ts`, `tests/unit/electron-folder-services.spec.ts` (assert folder entries instead of `File` properties).

### Validation

Gates: G7, G8.

### Rollback/Containment

One commit; `git revert` returns to the M2 state, where folder loading still works through the bridge.

## Milestone 4 - End-to-end check and documentation

### Scope

Spec acceptance 4 and 5, and the final review.

### Changes

- Run `npm run e2e` with output to `test-evidence/clip-source/e2e-final.log`.
- File: `docs/agent-docs/agent-architecture-map.md`
  Edit, with the `doc-update` skill: describe `ClipSource` in the domain list and `FolderEntry` in the folder-load flow; replace the `ClipFileSnapshot` mention in the frame-review paragraph with `ClipSource`; update freshness.
- File: this plan
  Edit: `Progress`, `Outcomes & Retrospective` (gate evidence, the `coding-quality.md` final pass, follow-ups).

### Validation

Gates: G9, G10.

### Rollback/Containment

Documentation only, plus test evidence. If G9 fails beyond the known intermittent check, find which milestone caused it by rerunning the failing spec at each milestone commit, and fix it there.

## Rejected alternatives

- R1: Replace `File` with `FolderEntry` and `ClipSource` in one milestone - rejected because one failing step would mix folder loading and the domain model; superseded by P4 and P5.
- R2: Delegate the test-fixture migration to a cheaper agent - rejected because the cost gate does not pass for edits tied to same-milestone API changes; superseded by P6.
