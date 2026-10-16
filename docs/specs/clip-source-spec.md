# Feature Spec: Build Clips on a Domain `ClipSource` Instead of the Browser `File`

Status: signed off (2026-10-16)

## 1. Goal and scope

A clip in the Collection grid is the domain object `Clip` (`src/domain/clip.ts`). Today each clip wraps a copy of a browser `File` (`ClipFileSnapshot`, a subclass of `File`). That copy also carries two desktop details: the absolute path of the video on disk and the `file://` address the grid and Zoom play it from. The folder model `Pipeline` (`src/domain/pipeline.ts`) keeps one such copy per video.

Nothing in the app uses what makes a `File` a `File`. The Electron folder adapter builds an empty `File` for every video only to attach a name, a path and a media address to it. Collection text files are the one exception: they are `File` objects whose content is the file's text, read back with `file.text()`.

This costs three things:

- The domain cannot be built or tested without a DOM `File` implementation. The unit tests depend on jsdom's.
- A different media host (a web build, another desktop shell) would mean changing the domain.
- Making a video edit reaches into the browser object for the desktop path (`clip.file.path` in `ClipEditor`).

Goal: the domain describes a clip's media with its own small value, `ClipSource`, and nothing in the domain, the business logic or the application layer depends on the `File` type. Only the code that talks to the desktop builds these values.

This is a behavior-preserving refactor. Every user-visible behavior, message, Activity entry and file write stays the same.

Out of scope:

- How the desktop side (`electron/`) lists folders and creates edits;
- frame review and GIF Extraction, which open movies through their own handles and do not use `Clip`;
- saved collection text format and the saved-capture format.

## 2. Target structure

| Part | Layer | What it is |
|---|---|---|
| `ClipSource` | domain (`src/domain/clip-source.ts`) | An immutable value describing one video: its file name, the media address the app plays it from, and its desktop path when it has one. Built only through one factory that checks the name and the media address (D2). |
| `Clip` | domain | Holds a `ClipSource` in place of the `File` copy. Its id, name, media address and metadata stay as today. |
| `Pipeline` | domain | Keeps one `ClipSource` per video name in place of one `File` copy (D3). |
| `FolderEntry` | business logic (`src/business-logic/folder-entry.ts`) | A plain value for one top-level file of an opened folder, as the desktop lists it: name, type, media address, desktop path, and the text of collection files (D4). |
| `PipelineFactory` | business logic | Builds the `Pipeline` from folder entries: videos become `ClipSource` values, collection entries are read from their text (D5). |
| Electron folder adapter | adapters (`ElectronFolderService`) | Turns what the desktop API returns into folder entries, and a newly created edit output into a `ClipSource` (D6). |

## 3. Decisions

| ID | Decision | Rationale |
|---|---|---|
| D1 | `ClipSource` has three fields: `name`, `mediaSource` (the address the grid and Zoom play) and `desktopPath` (`string`, or `null` when the source has no path on disk). It has no size, modification time or MIME type. | These are the only fields any code reads today. A field without a reader would be a guess about future needs. |
| D2 | `ClipSource` is a frozen class built through `ClipSource.create({ name, mediaSource, desktopPath })`. The factory trims the name and rejects an empty name or an empty media address. `Clip` and `Pipeline` accept only `ClipSource` values. If the desktop ever listed a video without a media address, opening that folder would fail with today's folder-read failure report, where today it would show a card that cannot play. The desktop always supplies the address, so users cannot reach this case. | The domain then states its own invariants instead of trusting whatever object it is given, and a clip always has something to play. |
| D3 | `Clip` takes `{ id, source }` and exposes `clip.source`. `Pipeline` methods that take or return video files take or return sources, and are renamed to say so (for example `videoFiles()` becomes `videoSources()` and `upsertVideoClip(file)` becomes `upsertVideoClip(source)`). | Names then match what the methods hold. The rename stays inside the domain and its direct callers. |
| D4 | The folder contents the app receives (`FolderContents`) list `FolderEntry` values, not `File` objects. A folder entry has `name`, `type`, `mediaSource`, `desktopPath` and, for `.txt` files, `text`. | Folder listing is where the desktop's data enters the app; a plain value there removes the last `File` from the renderer's own code. |
| D5 | `PipelineFactory` reads collection files from the entry's text through the existing collection text format. The format's `readFile(file)` entry point, which only existed to call `file.text()`, is removed. An entry without text reads as an empty collection file, as an empty `File` does today. | Same result as today without the browser object. |
| D6 | `ElectronFolderService` builds folder entries from the desktop API's listing, and turns a created edit output into a `ClipSource` (today's `toRendererFile` becomes `clipSourceOf`). Zoom inserts that source into the pipeline working copy (`PipelineWorkingCopy`) as it inserts the converted file today. The desktop API's created-file record (`CreatedVideoFile`) is typed as the plain record it is (name, desktop path, media address), not as a `File`. The end-to-end test that injects a failure after an edit moves its injection point to the renamed method. | The adapter is the one place that knows the desktop's shapes; the edit-recovery test keeps testing the same moment. |
| D7 | `ClipEditor` reads the desktop path from `clip.source.desktopPath`. A clip without one still reports `missing-source-path`. | The path is now part of the domain value, so no lookup through the desktop layer is needed. |
| D8 | The grid's fallback that played a clip without a media address through a `blob:` URL made from the `File`, and the matching `blob:` cleanup, are removed. | D2 guarantees a media address, and the desktop always supplies one, so the fallback cannot run. |
| D9 | `PipelineFactory` stops filtering out entries in subfolders. The desktop lists only the top-level files of a folder. | The filter existed for the browser folder picker, which listed every nested file. No current folder source produces nested entries. |
| D10 | The browser folder adapters (`src/adapters/browser/browser-file-system-service.ts` and `file-system-adapter.ts`) and their unit tests are deleted. The app does not use them, and they build `File`-based entries the app no longer accepts after D4. Decided by the user on 2026-10-16. | Keeping them would leave a second producer of folder entries, used by nothing, in a shape the app no longer takes. |
| D11 | Domain tests prove the goal directly: the tests for `ClipSource`, `Clip`, `Pipeline` and `PipelineFactory` run in a plain Node environment without jsdom. | This is the user-visible goal for developers: the domain works without a DOM. |
| D12 | The work is split into milestones that each keep the type checks and the unit and integration tests green. The full end-to-end suite runs at the end. | Each step stays small and revertible without repeating the slow checks. |

## 4. Ownership and constraints

- `src/domain/` imports nothing from `src/business-logic/`, `src/app/`, `src/adapters/` or `src/ui/`, and uses no DOM type.
- `FolderEntry` lives in business logic because `PipelineFactory` consumes it; the app layer and the adapter import it from there.
- Only the Electron adapter knows the desktop API's response shapes.
- The grid and Zoom keep receiving the media address as a string; their behavior is unchanged.
- User-facing text stays exactly as it is today.

## 5. Acceptance behavior

The refactor is complete when all of the following hold:

1. No file under `src/domain/`, `src/business-logic/`, `src/app/` or `src/ui/` names the `File` type or a type built on it (today `ClipFile`, `ClipFileSnapshot` and `CreatedVideoFile`), calls `file.text()`, or makes a `blob:` address for a clip.
2. The domain tests named in D11 pass in a Node environment.
3. The existing unit and integration tests pass. Tests change only in how they build clips, pipelines and folder contents, and for the renamed members (D3, D6).
4. The full end-to-end suite passes. It covers opening a folder, switching and saving collections, adding to and deleting from collections, deleting from disk, Zoom, a Loopify edit and its recovery after a failure, and the folder refresh after an extraction.
5. `docs/agent-docs/agent-architecture-map.md` describes `ClipSource` and `FolderEntry`, updated with the `doc-update` skill.

## Rejected alternatives

- R1: Keep `File` and only move the desktop path and media address into separate fields - rejected because the domain would still need a DOM `File`; superseded by D1.
- R2: Move the desktop path lookup behind the video-edit service - rejected because, once the path is part of `ClipSource`, the extra indirection adds a dependency without hiding anything; superseded by D7.
- R3: Add size and modification time to `ClipSource` now - rejected because nothing reads them; superseded by D1.
- R4: Keep the unused browser folder adapters - rejected because nothing uses them and their output no longer fits the app; superseded by D10.
