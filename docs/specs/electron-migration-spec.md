# Feature Spec: Electron Migration

## 1. Summary

Migrate Clip Sandbox from a browser-served static app to a local Electron desktop app while retaining the exact current user-facing functionality.

The motivation is architectural: future features will require reliable access to system APIs such as filesystem operations, including moving or duplicating clips between pipeline folders. This feature does not implement those future capabilities yet. It establishes Electron as the new runtime shell and deployment model so those capabilities can be added cleanly later.

The migration includes:
- replacing the current browser plus local static-server runtime with Electron,
- introducing a secure desktop boundary between renderer code and OS/file APIs,
- preserving the current feature set and behavior as closely as practical,
- removing the browser-only read-only folder-import mode,
- keeping the app developer-runnable without requiring packaged installers in this milestone.

## 2. Problem

The current app is intentionally browser-native:
- it runs as static HTML and ES modules,
- it depends on browser file APIs such as `showDirectoryPicker`,
- deployment relies on copying files and launching a local static server,
- filesystem capabilities are constrained by the browser execution model.

That architecture is now a blocker for planned product direction. The user intends to add features that require direct local filesystem operations, including manipulating clips across pipeline folders. Continuing to build on the browser-hosted runtime would force increasingly awkward capability workarounds and would keep the product constrained by browser sandbox semantics.

This feature addresses the runtime architecture shift now, before those future filesystem-heavy features are added.

## 3. Goals and Non-Goals

### 3.1 Goals

1. Replace the current browser-served runtime with a local Electron desktop runtime.
2. Preserve the exact current end-user functionality in the migrated app.
3. Remove the current read-only file-list import path and standardize on direct folder access.
4. Establish a narrow, explicit Electron boundary for filesystem and other OS interactions.
5. Keep the renderer architecture as close as practical to the current framework-free HTML plus ES module approach.
6. Make the migrated app developer-runnable on local machines without requiring an installer or packaged distributable.
7. Design the migration so future pipeline-aware cross-folder operations can be added without another runtime rewrite.
8. Replace the current end-user deployment model based on `miniserve` and the browser.

### 3.2 Non-Goals

1. No new end-user features beyond the runtime migration.
2. No clip move, copy, duplicate, or cross-pipeline workflows in this feature.
3. No redesign of the visible UI, interaction model, or collection model behavior.
4. No installer, updater, code signing, or packaged distribution pipeline in this milestone.
5. No requirement to fully eliminate every browser-oriented internal test seam if retaining some reduces migration risk.
6. No full redesign of clip identity or pipeline identity semantics in this feature.

## 4. Users and Use Cases

### 4.1 Primary User

A local desktop user or developer running Clip Sandbox on their own machine to review and manage clips stored on disk.

### 4.2 Main Use Cases

1. Launch the app locally as a desktop application instead of through a browser and static server.
2. Choose a clip folder directly from the OS and work with it in read-write mode.
3. Continue using all current collection, selection, save, add-to-collection, delete-from-disk, zoom, and fullscreen behavior unchanged from the user’s perspective.
4. Prepare the product for future filesystem-heavy features without needing another major runtime shift.

## 5. Product Decisions Locked for This Feature

1. Scope is migration only. The migrated app must retain the same functionality as the current app.
2. The target architecture should be cross-platform in design, but first-milestone verification may remain Windows-first.
3. The browser plus `miniserve` end-user runtime is fully replaced by a local Electron runtime.
4. The current browser read-only fallback mode is removed.
5. Developer-runnable Electron startup is sufficient for this milestone.
6. The Electron runtime must use a secure preload plus IPC boundary rather than exposing raw Node APIs to renderer code.
7. Future product direction will scope clips by pipeline name and clip name, but that data-model shift is not part of this feature.
8. Internal test or renderer harness choices may remain pragmatic as long as the shipped runtime is Electron-only.

## 6. Functional Requirements

### 6.1 Electron Runtime Shell

The repository must provide an Electron-based runtime that becomes the primary way to run Clip Sandbox locally.

Required behavior:
1. launching the app must open an Electron desktop window rather than a browser tab,
2. the app must load the existing renderer experience inside Electron,
3. the end-user runtime must not depend on `miniserve`, localhost ports, or the default browser,
4. the runtime must remain developer-runnable from the repository.

### 6.2 Renderer Preservation

The migration must preserve current renderer behavior as closely as practical.

Required behavior:
1. the app must remain framework-free unless implementation evidence requires otherwise and the user approves a change,
2. current UI flows and controls must remain functionally equivalent,
3. current collection loading, switching, save, save-as-new, add-to-collection, delete-from-disk, zoom, and fullscreen behavior must continue to work,
4. any unavoidable behavioral differences introduced by Electron must be documented and kept minimal.

### 6.3 Folder Access Model

The migrated app must use direct folder access rather than the current browser fallback model.

Required behavior:
1. the user must select a folder through an Electron-backed OS dialog or equivalent desktop flow,
2. the selected folder session must support direct read-write filesystem operations,
3. the read-only file-list import path must be removed from the shipped product flow,
4. saving collections must write directly to disk rather than triggering browser downloads.

### 6.4 Filesystem and OS API Boundary

Electron filesystem and OS interactions must be routed through an explicit desktop boundary.

Required behavior:
1. the renderer must not call Node APIs directly,
2. the renderer must use a preload-exposed API backed by explicit IPC channels,
3. IPC capabilities must be limited to the app’s concrete needs,
4. the boundary must support current folder load, file reads, text writes, append, delete, and related diagnostics flows,
5. the boundary should be shaped so future cross-pipeline file operations can be added without breaking the renderer contract unnecessarily.

### 6.5 Security and Runtime Constraints

Even though the app is local-only, the Electron runtime must follow baseline desktop-app isolation practices.

Required behavior:
1. `contextIsolation` must be enabled,
2. `nodeIntegration` in the renderer must remain disabled,
3. the preload layer must expose only the minimum allowed API surface,
4. the app must not depend on remote web content,
5. the migrated runtime must continue to work entirely against local assets and local files.

### 6.6 Deployment and Launch Behavior

The end-user runtime model changes in this feature.

Required behavior:
1. Electron becomes the supported local runtime,
2. the current browser-plus-static-server deployment flow is retired for end users,
3. this milestone only needs a developer-runnable launch path,
4. packaged installers, signed builds, and auto-update workflows are deferred.

## 7. Architecture Expectations

### 7.1 Current Architectural Reality

Today the app is browser-native and file-access behavior is concentrated in browser adapters:
- `src/app/app-controller.js`
- `src/adapters/browser/browser-file-system-service.js`
- `src/adapters/browser/file-system-adapter.js`

The migration must preserve the useful boundary between:
- app orchestration and business logic,
- domain/runtime collection behavior,
- platform-specific filesystem and runtime APIs.

### 7.2 Target Architectural Direction

The preferred target shape is:
1. an Electron main process responsible for window creation and native dialogs,
2. a preload layer exposing a narrow renderer-safe desktop API,
3. a renderer that continues to host the existing app UI and orchestration,
4. platform-specific filesystem behavior moved behind an Electron-oriented adapter/service layer,
5. current domain and business logic reused wherever possible rather than rewritten.

### 7.3 Data Model Forward-Compatibility

This feature does not change the visible collection model, but implementation should avoid deepening assumptions that clips are identified only by filename within a single ad hoc browser folder session.

The migration should preserve room for a future model where:
- a clip is scoped by pipeline identity plus clip name,
- pipelines correspond to parent folders,
- clip duplication or movement across pipelines becomes possible.

This is a forward-compatibility constraint, not a requirement to implement those capabilities now.

## 8. Testing and Verification Expectations

The migration should preserve the current verification discipline while adjusting it to the new runtime.

Implementation should include practical verification for:
1. Electron app startup from the repository,
2. folder selection through the Electron runtime,
3. direct-write save behavior to collection files,
4. delete-from-disk behavior through the Electron-backed filesystem path,
5. current collection switching and persistence flows,
6. zoom and fullscreen flows inside Electron,
7. regression coverage for the current feature set.

Testing guidance:
1. existing unit and renderer-level tests should be retained or adapted where they still provide fast confidence,
2. end-to-end coverage should prove the Electron runtime, not just browser mocks,
3. Windows-first validation is acceptable for this milestone, but implementation should avoid Windows-only architectural assumptions unless truly necessary.

## 9. Risks and Complexity Notes

This feature is a major architecture change because it affects:
- runtime shell,
- filesystem capability model,
- launch and deployment approach,
- test strategy,
- adapter boundaries.

Primary risks:
1. coupling renderer code too tightly to Electron and eroding current separation of concerns,
2. over-broad preload or IPC exposure that makes future changes harder or less safe,
3. unintentionally changing behavior while claiming functional parity,
4. keeping hidden assumptions around browser `File` objects that do not map cleanly to Electron-backed file handling,
5. allowing migration scope to expand into future cross-pipeline capabilities before the runtime shift is stabilized.

## 10. Acceptance Criteria

The feature is complete when all of the following are true:

1. Clip Sandbox runs locally as an Electron desktop application from the repository.
2. The supported end-user runtime no longer depends on a browser plus local static server.
3. The app preserves the current end-user functionality without intentional feature additions.
4. Folder selection uses an Electron-backed direct-access flow.
5. The browser read-only fallback mode is removed from the shipped product flow.
6. Collection saves write directly to disk through the Electron-backed filesystem path.
7. Delete-from-disk and related file mutation flows work through the Electron runtime.
8. The renderer does not receive unrestricted Node.js access.
9. The Electron runtime uses a preload plus IPC boundary with `contextIsolation` enabled and `nodeIntegration` disabled.
10. The migration remains developer-runnable without requiring packaged installers.
11. The implementation preserves a viable path toward future pipeline-scoped clip identity and cross-pipeline operations without implementing them now.

## 11. Out of Scope Follow-Up Work

Likely future features after this migration:
1. pipeline-scoped clip identity,
2. cross-pipeline clip duplication,
3. clip move operations between pipeline folders,
4. packaged desktop distribution,
5. installer and update flows,
6. broader cross-platform verification and release hardening.
