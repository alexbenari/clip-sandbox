# Encapsulation adapter evidence

## Checkpoint coverage (initial)

Static inventory scope: all files under `src/adapters/browser/`, all files under `src/adapters/electron/`, and all files under `electron/`, plus direct TypeScript callers of each adapter contract. The initial file set is:

- `src/adapters/browser/audio-feedback-adapter.ts`
- `src/adapters/browser/browser-file-system-service.ts`
- `src/adapters/browser/clock-adapter.ts`
- `src/adapters/browser/dom-renderer-adapter.ts`
- `src/adapters/browser/file-system-adapter.ts`
- `src/adapters/browser/fullscreen-adapter.ts`
- `src/adapters/electron/electron-app-settings-service.ts`
- `src/adapters/electron/electron-file-system-service.ts`
- `src/adapters/electron/electron-video-edit-service.ts`
- `electron/app-settings-store.cjs`
- `electron/ffmpeg-resolver.cjs`
- `electron/folder-entry.cjs`
- `electron/main.cjs`
- `electron/preload.cjs`
- `electron/video-edit-runtime.cjs`

Direct callers and boundary contracts were traced in `src/app/app-controller.ts`, `src/app/zoom-video-edit-workflow.ts`, `src/business-logic/clip-editor.ts`, `src/domain/clip.ts`, `src/domain/pipeline.ts`, and `src/domain/collection.ts`, with repository-wide searches covering adapter field access and preload names. No code or test changes are in scope.

## Findings

### Intended adapter transport and contracts

- `ElectronFileSystemService` owns the preload API call shape and converts `ElectronFolderEntry` payloads into renderer `File` objects (`src/adapters/electron/electron-file-system-service.ts:6-43,85-116`). `mediaSource` is an intentional renderer media contract: `Clip` and pipeline materialization consume `file.mediaSource` (`src/domain/clip.ts:38,98`; `src/domain/pipeline.ts:315`; `src/domain/collection.ts:266`).
- `ElectronAppSettingsService` treats IPC responses as `unknown`, parses them through `parseAppSettings`, and returns the app settings contract (`src/adapters/electron/electron-app-settings-service.ts:17-42`). `ElectronVideoEditService` similarly translates the preload result into `RuntimeVideoEditResult` (`src/adapters/electron/electron-video-edit-service.ts:24-50`). These are boundary responsibilities, not caller coupling.
- Browser adapters (`FileSystemAdapter`, `BrowserFileSystemService`, `FullscreenAdapter`, `ClockAdapter`, `AudioFeedbackAdapter`, `DomRendererAdapter`) keep platform operations behind methods. `DomRendererAdapter.applyGridLayout` intentionally receives a grid element and mutates its children/styles (`src/adapters/browser/dom-renderer-adapter.ts:1-7`); `app-controller` calls that method with `gridController.getGridElement()` (`src/app/app-controller.ts:408-409`). No caller reaches into adapter internals.
- Electron main/preload modules intentionally carry transport details: preload exposes named IPC methods (`electron/preload.cjs:3-29`), main handlers read folder entries and perform file/edit operations (`electron/main.cjs:67-153`), and `folder-entry.cjs` supplies path/media metadata (`electron/folder-entry.cjs:21-39`). No renderer caller imports these CommonJS helpers directly.

### Concrete suspicious crossings

1. **Filesystem path leaks through two raw structural payloads.** The Electron adapter creates a mutable session containing `folderPath` (`src/adapters/electron/electron-file-system-service.ts:48-52,77-83`). The app controller then re-parses that unknown object itself (`src/app/app-controller.ts:113-117`) and passes a `{ folderPath?: string }` shape to the zoom workflow (`src/app/app-controller.ts:1151-1158`; workflow declaration `src/app/zoom-video-edit-workflow.ts:51-73`). `ClipEditor` reads the field directly to build `outputFolderPath` (`src/business-logic/clip-editor.ts:41-49,75-102`). This bypasses the filesystem service's `canMutateDisk`/edit boundary and makes the business workflow depend on the Electron session representation; a future browser session or renamed path field can fail after the adapter itself remains valid. The evidence is direct; whether this is accepted architecture is a root review decision.

2. **Electron-only source path is embedded in a renderer `File` and consumed outside the adapter.** `toRendererFile` defines a nonstandard `path` property from the desktop payload (`src/adapters/electron/electron-file-system-service.ts:85-115`); `CreatedVideoFile` explicitly exports that property (`src/business-logic/clip-editor.ts:13-16`). `ClipEditor` then reads `clip.file.path` (`src/business-logic/clip-editor.ts:66-73`). This couples business logic to an adapter-specific augmentation of the DOM `File` object and makes video editing unavailable unless that property exists. `mediaSource` has broader, intentional consumers; `path` is the narrower implementation leak.

3. **Exported mutable adapter handles exist, but no external accesses were found.** `FileSystemAdapter` exposes mutable public `win`/`doc` (`src/adapters/browser/file-system-adapter.ts:44-53`); `BrowserFileSystemService` exposes `win`/`fileSystemAdapter` (`src/adapters/browser/browser-file-system-service.ts:26-35`); `AudioFeedbackAdapter` exposes `win`/`audioContext` (`src/adapters/browser/audio-feedback-adapter.ts:6-12`); `FullscreenAdapter` exposes `doc` (`src/adapters/browser/fullscreen-adapter.ts:10-15`); Electron services expose `api`, `win`, or `videoEditService` (`src/adapters/electron/electron-file-system-service.ts:58-74`; `electron-video-edit-service.ts:15-22`). Repository searches found only owning-class reads/writes, so this is latent mutability rather than observed caller coupling.

### Negative evidence

No adapter caller was found to inspect `ElectronVideoEditService.api`, `ElectronFileSystemService.api`, browser handles, audio context, or adapter DOM children directly. No renderer source imports `electron/main.cjs`, `preload.cjs`, `folder-entry.cjs`, `video-edit-runtime.cjs`, `app-settings-store.cjs`, or `ffmpeg-resolver.cjs`. The DOM `dataset`/child manipulation in fullscreen and grid controllers is controller-owned state, not an adapter crossing.

## Gaps and uncertainty

Coverage: 15 adapter/Electron files read; 6 direct TypeScript caller/domain files traced; repository-wide `src`/`tests` searches performed for adapter handles and leaked fields. No builds/tests were run per task scope. Remaining gap: browser filesystem service has no production app-controller caller in the current source; conclusions about its external ownership are therefore based on its public shape and internal delegation only. Root should independently inspect the two flagged path crossings before making review judgments.

## Root review qualification

The raw paths are explicitly present in exported DesktopFolderSession and ClipFile contracts. This is platform-representation coupling, not proof of private-field access or an authorization bypass. The root does not adopt the claim that the edit path bypasses permissions. Fullscreen's grid DOM mutations are a separate confirmed ownership crossing, not cleared by this adapter-only inventory. Public adapter fields have no observed external production mutation in the searched callers.
