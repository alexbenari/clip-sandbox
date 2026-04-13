# Implement the Electron Runtime Migration

## Why this matters

Clip Sandbox is currently a browser-served local app. That runtime was a reasonable starting point, but it now blocks the product direction. The next planned capabilities require direct local-system access for operations such as working with clips across pipeline folders. If the app stays browser-native, each new filesystem-heavy feature will fight the browser sandbox and keep deployment awkward.

This plan migrates the app to Electron while preserving the exact current user-facing functionality. The goal is not to add features. The goal is to replace the runtime shell, remove the browser-only read-only mode, and establish a durable desktop boundary that future filesystem work can build on.

This plan implements the approved spec in [electron-migration-spec.md](/C:/dev/clip-sandbox/docs/specs/electron-migration-spec.md).

## Progress

- [x] (2026-04-13 11:10Z) Approved feature spec captured in `docs/specs/electron-migration-spec.md`.
- [x] (2026-04-13 11:22Z) Execution plan drafted in `docs/plans/electron-migration-exec-plan.md`.
- [x] (2026-04-13 16:48Z) Prototyped the Electron file-loading contract and locked the clip/media representation strategy.
- [x] (2026-04-13 17:20Z) Added Electron application bootstrap, preload bridge, and local dev launch scripts.
- [x] (2026-04-13 17:58Z) Replaced the shipped browser filesystem service path with an Electron-backed desktop adapter while preserving business logic behavior.
- [x] (2026-04-13 18:20Z) Removed the read-only folder-import path and switched the renderer to Electron-backed direct folder access only.
- [x] (2026-04-13 19:03Z) Updated automated tests so fast renderer tests remain useful and end-to-end coverage proves the Electron runtime.
- [x] (2026-04-13 19:12Z) Retired the old runtime guidance and updated agent-facing architecture documentation.
- [x] (2026-04-13 19:20Z) Removed the legacy `deployment/` folder and its obsolete integration test because nothing current depends on it.

## Surprises & Discoveries

- Discovery: the current runtime boundary is clean enough to migrate without rewriting the entire app, because file access is already concentrated in browser adapter modules.
  Evidence: `src/adapters/browser/browser-file-system-service.js` and `src/adapters/browser/file-system-adapter.js` isolate folder picking, writes, appends, and deletes from `src/app/app-controller.js`.

- Discovery: the app is more than browser-hosted; it is also `File`-centric throughout loading and validation flows.
  Evidence: `src/domain/clip.js` stores a browser `File`, `src/domain/collection-description-validator.js` parses collection files via `file.text()`, and `src/business-logic/load-collection-inventory.js` passes file objects through inventory-building code.

- Discovery: the current shipped runtime and deployment flow are tightly tied to static hosting.
  Evidence: `deployment/deploy.ps1` copies static assets, `deployment/launch.ps1` starts bundled `miniserve`, and `playwright.config.mjs` launches `npx http-server . -p 4173`.

- Discovery: removing the read-only mode is a product simplification, but it also removes one of the app’s current save/download fallback paths.
  Evidence: `src/adapters/browser/browser-file-system-service.js` distinguishes `accessMode: 'readwrite'` versus `accessMode: 'read-only'`, and `saveTextFile(...)` falls back to browser download when direct mutation is unavailable.

- Discovery: the current architecture map explicitly says the app should remain browser-native unless a larger architecture decision is approved, and this feature is that approved exception.
  Evidence: `docs/agent-docs/agent-architecture-map.md` lists “Keep the app browser-native and framework-free unless a larger architecture decision is approved.”

- Discovery: preserving browser `File` objects all the way through Electron would have required IPC-copying full video bytes, which is the wrong contract for large local media.
  Evidence: the working implementation instead keeps collection files as renderer `File` objects but passes video playback through Electron-produced `file://` URLs from `electron/main.cjs` into `src/adapters/electron/electron-file-system-service.js`.

- Discovery: Playwright Electron coverage is simpler and more realistic when it uses real temporary folders instead of renderer-side directory-picker mocks.
  Evidence: `tests/e2e/scenarios.spec.js` now copies fixture folders into temp directories, injects the next folder path through a test-only preload hook, and verifies actual filesystem writes and deletes.

- Discovery: after the Electron migration landed, the only remaining live references to `deployment/` were the legacy deployment test and transitional docs.
  Evidence: targeted search across active code, tests, and current docs found `deployment/` only in `tests/integration/deployment/deploy-script.spec.js`, `docs/agent-docs/agent-architecture-map.md`, and `docs/documentation/windows-deployment.md`.

## Decision Log

- Decision: migrate the shipped runtime to Electron without adding new end-user features.
  Rationale: the user explicitly approved a migration-only scope so behavior changes and runtime churn stay separable from future product work.
  Date/Author: 2026-04-13 / Codex + user

- Decision: design the runtime to be cross-platform, but allow Windows-first verification in this milestone.
  Rationale: cross-platform architecture is modest cost at the developer-runnable stage, while full multi-OS validation would materially increase scope.
  Date/Author: 2026-04-13 / Codex + user

- Decision: fully replace the browser-plus-`miniserve` end-user runtime, but keep pragmatic internal test seams if they still reduce migration risk.
  Rationale: the user wants Electron to be the supported local runtime; fully deleting every browser-oriented harness during the same change would add cost with limited product value.
  Date/Author: 2026-04-13 / Codex + user

- Decision: remove the read-only file-list import mode from the shipped app.
  Rationale: Electron can provide direct folder access, so preserving the browser fallback would keep unnecessary product complexity.
  Date/Author: 2026-04-13 / Codex + user

- Decision: the Electron runtime must use `contextIsolation: true`, `nodeIntegration: false`, and a narrow preload/IPC bridge.
  Rationale: local-only apps still need a strict renderer boundary because the renderer processes user-controlled local file names and content and should not receive unrestricted OS access.
  Date/Author: 2026-04-13 / Codex + user

- Decision: do not redesign the visible collection model during this feature, but avoid deepening filename-only assumptions where Electron integration touches contracts.
  Rationale: the user expects future pipeline-scoped clip identity and cross-pipeline duplication, but approved this feature as migration-only.
  Date/Author: 2026-04-13 / Codex + user

- Decision: keep a hybrid renderer file contract for now.
  Rationale: collection files remain renderer `File` objects so existing validation logic still works, while video clips carry Electron-generated `mediaSource` URLs so the app does not IPC-copy large video payloads into the renderer.
  Date/Author: 2026-04-13 / Codex

- Decision: keep legacy `deployment/` artifacts temporarily, but demote them to historical guidance rather than the supported runtime.
  Rationale: the user only required a developer-runnable Electron app in this milestone, so the migration updates current docs and defaults without forcing a packaged desktop-distribution design prematurely.
  Date/Author: 2026-04-13 / Codex

- Decision: remove the legacy `deployment/` folder once the repo confirmed nothing current depended on it.
  Rationale: the user explicitly requested the cleanup, and after the Electron harness replaced the old runtime there was no remaining live dependency on those scripts or assets.
  Date/Author: 2026-04-13 / Codex + user

## Outcomes & Retrospective

Shipped behavior:

- Clip Sandbox launches as an Electron desktop app from the repo.
- The supported local runtime no longer depends on `miniserve`, `http-server`, localhost ports, or the default browser.
- Folder selection is handled through Electron and always yields a writable folder session.
- Current collection, selection, save, add-to-collection, delete-from-disk, zoom, and fullscreen flows still work.
- The renderer remains framework-free and continues to use the existing UI and business-logic modules where practical.
- The Electron bridge is narrow enough that future filesystem operations can be added without exposing raw Node APIs to the renderer.
- The old browser read-only import path is removed from the shipped renderer flow.
- The architecture map and Windows runtime guide now describe Electron as the current runtime.
- The legacy `deployment/` folder and its obsolete integration test are removed.

Validation evidence collected:

- `npm run unit`
  Result: 24 test files passed, 104 tests passed after removing the obsolete deployment test.
- `npm run e2e`
  Result: 6 Electron Playwright scenarios passed against real temporary folders.
- `npm run test:all`
  Result: the full unit plus Electron e2e suite passed.
- `npx playwright test tests/e2e/scenarios.spec.js --grep "loads clips"`
  Result: the first Electron smoke scenario passed while the new harness was being brought up.

Follow-up work that is intentionally out of scope here:

- pipeline-scoped clip identity,
- cross-pipeline duplication or move workflows,
- packaged installers or signed distributables,
- broader macOS/Linux verification.

## Context and orientation

This repository is currently a framework-free browser app loaded from `index.html` and `app.js`.

Key current files:

- `index.html`
  The static shell. It loads `./app.js` as an ES module and contains all current app DOM roots and dialogs.

- `app.js`
  A thin compatibility entrypoint that re-exports `initApp` from `src/app/app-controller.js`.

- `src/app/app-controller.js`
  The composition root. It owns DOM wiring, folder loading, collection switching, save flows, delete-from-disk flow, zoom, fullscreen, and status updates.

- `src/adapters/browser/browser-file-system-service.js`
  The app-facing filesystem boundary for the current browser runtime. It owns writable versus read-only session behavior.

- `src/adapters/browser/file-system-adapter.js`
  The low-level browser API wrapper around `showDirectoryPicker`, directory reads, writes, appends, and deletes.

- `src/business-logic/*` and `src/domain/*`
  The current logic for collection inventory, materialization, persistence, and clip models. This logic should be preserved wherever possible.

- `deployment/deploy.ps1` and `deployment/launch.ps1`
  The current Windows deployment/runtime path based on static hosting and `miniserve`. This path is retired by this migration.

- `playwright.config.mjs`
  The current e2e harness, which assumes a web server and browser base URL.

Terms used in this plan:

- `main process`: the Electron process that creates windows and is allowed to use Node and desktop APIs directly.
- `renderer`: the browser-like window process that renders the app UI.
- `preload`: a small script loaded into the renderer before app code. It exposes a controlled API from the main process to the renderer.
- `IPC`: inter-process communication. In Electron this is the message channel between main and renderer.
- `folder session`: the app’s current representation of the selected clip folder. Today it distinguishes writable and read-only browser paths; after migration it should represent a direct-access desktop folder.
- `pipeline`: future product concept for the parent clip folder. It is not implemented in this feature, but the migration should not make it harder.

Implementation constraints that must remain true:

1. Preserve exact current user-facing functionality.
2. Keep the renderer framework-free unless a user-approved exception is required.
3. Keep platform-specific OS and filesystem behavior behind adapters or services rather than leaking Electron details into all layers.
4. Do not expose unrestricted Node APIs to the renderer.
5. Remove the shipped read-only import path.
6. Replace the end-user runtime and deployment path, not just add a second runtime beside the first one.
7. Update `docs/agent-docs/` as part of implementation because this is a durable architecture change.

## Milestone 0 - Prototype the clip-file contract under Electron

### Scope

Reduce the biggest migration risk first: determine how Electron-backed file access will satisfy the current `File`-centric loader, validator, clip model, and media-source flow.

This milestone is explicitly a prototype. It should answer whether the renderer can continue to work with browser `File` objects created from desktop reads, or whether the migration should introduce a small app-level file abstraction that preserves the current behavior without leaking Node types into domain code.

### Changes

- File: `src/adapters/electron/` or `electron/` prototype files
  Edit: create a minimal spike that can select a folder through Electron, enumerate top-level files, and pass one video file plus one text collection file into the existing browser-side logic for validation and materialization.

- File: `src/domain/clip.js`
  Edit only if the prototype proves the current `File` storage model is too narrow. Prefer delaying permanent edits until the spike answers the question.

- File: `src/domain/collection-description-validator.js`
  Edit only if necessary for the prototype to support a non-browser file wrapper. Keep the spike minimal and reversible.

- File: `docs/plans/electron-migration-exec-plan.md`
  Edit: record the chosen file representation strategy, prototype result, and resulting implementation direction in `Surprises & Discoveries` and `Decision Log`.

### Validation

- Command: run the prototype Electron entrypoint from the repo
  Expected: the spike can select a folder, read top-level files, and prove whether current loader/validator code can operate on Electron-sourced file objects without broad rewrites.

- Command: if the prototype introduces a temporary test, run that targeted test
  Expected: the test demonstrates the chosen representation boundary rather than just compiling.

### Rollback/Containment

If the prototype shows that preserving browser `File` objects in the renderer is awkward or brittle, stop and introduce a small app-facing file object contract before broader migration work begins. Do not start patching Electron exceptions into multiple business-logic modules without an explicit contract decision.

## Milestone 1 - Add the Electron app shell and developer launch path

### Scope

Create the basic Electron runtime: main process, preload bridge, renderer load path, and developer scripts. This milestone should produce a working desktop window even before folder operations are fully migrated.

### Changes

- File: `package.json`
  Edit: add Electron as a dependency or dev dependency, update `main`, and add developer scripts such as:
  - `start` or `electron`
  - updated `test` scripts if needed to distinguish unit versus e2e runtime assumptions.

- File: `electron/main.js` or `src/electron/main.js`
  Edit: create the Electron main-process entrypoint that:
  - creates the BrowserWindow,
  - loads the local renderer entry,
  - configures `contextIsolation: true`,
  - configures `nodeIntegration: false`,
  - uses the preload script,
  - avoids any remote-content loading assumptions.

- File: `electron/preload.js` or `src/electron/preload.js`
  Edit: create the preload script and expose a minimal initial API using `contextBridge`.

- File: `app.js`
  Edit if needed so the renderer bootstrap remains stable inside Electron and tests.

- File: `index.html`
  Edit only if the renderer load path or asset assumptions need a small Electron-safe adjustment.

- File: `deployment/` runtime files or replacement desktop docs
  Edit: mark the old launch path as obsolete or prepare replacement developer-run instructions, but do not remove old files until the Electron runtime is proven.

### Validation

- Command: `npm install`
  Expected: Electron and related dependencies install cleanly.

- Command: `npm run start` or the new Electron launch command
  Expected: an Electron window opens and loads the current app shell without using a localhost server.

- Command: manual smoke check of the blank app shell
  Expected: the toolbar, dialogs, and initial UI render as before.

### Rollback/Containment

If the initial Electron shell requires broad renderer rewrites just to boot, stop and reduce the delta by loading the existing `index.html` more directly. The app shell should come up before filesystem migration begins.

## Milestone 2 - Replace browser filesystem services with Electron-backed desktop adapters

### Scope

Introduce the real desktop boundary for folder selection, file enumeration, text reads, writes, appends, deletes, and diagnostics logging, while keeping that behavior behind an app-facing service instead of scattering Electron calls into the renderer.

### Changes

- File: `src/adapters/browser/browser-file-system-service.js`
  Edit: either retire this file or narrow it to browser-test-only helpers. Do not leave it as the shipped runtime path.

- File: `src/adapters/electron/electron-file-system-service.js`
  Edit: create the Electron-backed app-facing filesystem service that mirrors the capabilities the app needs:
  - pick folder,
  - enumerate top-level files,
  - read collection file text,
  - save text files,
  - append diagnostics text,
  - delete top-level entries,
  - report a direct-access folder session.

- File: `src/adapters/electron/electron-ipc-contract.js` or equivalent
  Edit: centralize channel names and request/response shapes so IPC usage stays explicit.

- File: `electron/main.js`
  Edit: implement IPC handlers for the allowed filesystem and dialog operations.

- File: `electron/preload.js`
  Edit: expose only the narrow renderer-safe desktop API required by the app-facing service.

- File: `src/app/app-controller.js`
  Edit: instantiate the Electron-backed filesystem service at the composition root or through a runtime-selection seam. Keep business logic and UI code agnostic about Electron where possible.

- File: relevant business-logic or domain files
  Edit only where required by the representation decision from Milestone 0.

- File: `tests/unit/*` and `tests/integration/*`
  Edit: adapt mocks and stubs so renderer-layer tests can exercise the new service boundary without a real Electron process.

### Validation

- Command: `npm run unit`
  Expected: renderer logic and service-boundary tests pass against the Electron-shaped contract.

- Command: manual local run of the Electron app
  Expected: folder selection works, clips load, and current save/delete flows work through Electron-backed file operations.

- Command: targeted tests for new adapter or preload contract files
  Expected: channel and service behavior are deterministic and do not depend on the real filesystem unless intentionally tested.

### Rollback/Containment

If Electron-specific details start leaking into domain or UI modules, move them back behind the app-facing service immediately. The migration must replace the runtime boundary, not dissolve it.

## Milestone 3 - Remove the read-only path and preserve functional parity

### Scope

Change the renderer flow so the shipped app always uses direct folder access and no longer exposes or depends on the browser-only read-only import fallback.

### Changes

- File: `index.html`
  Edit: remove the hidden `<input type="file" ... webkitdirectory>` fallback and any UI copy that refers to browser download fallback or read-only limitations.

- File: `src/app/app-controller.js`
  Edit: remove:
  - browser fallback picker logic,
  - `folderInput` handling,
  - read-only session branching,
  - download fallback behavior assumptions.

  Preserve:
  - folder load,
  - save and save-as-new flows,
  - add-to-collection,
  - delete-from-disk,
  - collection switching,
  - zoom and fullscreen.

- File: `src/app/app-text.js`
  Edit: remove or revise copy that mentions download fallback or permission-unavailable save behavior.

- File: `src/adapters/browser/file-system-adapter.js`
  Edit: retire browser-only folder picker and download helpers from the shipped runtime path. Keep only what is still needed for tests, if anything.

- File: `src/business-logic/persist-collection-content.js`
  Edit if needed so persistence assumes direct save in the shipped runtime while remaining testable.

- File: tests that assert read-only behavior
  Edit: remove or replace read-only-mode assertions with Electron direct-access expectations.

### Validation

- Command: manual local run of the Electron app
  Expected: browse folder, save, save as new, add to collection, and delete-from-disk all work without any browser fallback UI.

- Command: targeted unit/integration tests around collection persistence
  Expected: save behavior no longer falls back to browser download in the shipped path.

- Command: `npm run unit`
  Expected: full renderer and business-logic suite still passes after removal of read-only branching.

### Rollback/Containment

If removing the read-only path breaks too many tests at once, keep a temporary internal test shim for browser-style file objects, but do not keep the read-only product path alive in production code.

## Milestone 4 - Migrate end-to-end coverage from browser-server flow to Electron runtime

### Scope

Make the automated high-confidence path prove the Electron app itself rather than a browser-served approximation.

### Changes

- File: `playwright.config.mjs`
  Edit: replace the `http-server`/`baseURL` assumptions with an Electron-compatible test harness. The implementation may:
  - launch Electron directly from Playwright,
  - or split browser-only and Electron e2e configs if that is materially cleaner during migration.

- File: `tests/e2e/scenarios.spec.js`
  Edit: adapt existing scenarios so they run against Electron. Keep the same user-visible expectations:
  - folder load,
  - collection switching,
  - save,
  - add to collection,
  - delete from disk,
  - zoom,
  - fullscreen.

- File: any Electron-specific test fixture helpers
  Edit: add helpers for Electron app launch, dialog mocking, and IPC/file fixtures where necessary.

- File: `package.json`
  Edit: update `e2e` and `test:all` scripts so the default suite proves the Electron runtime.

### Validation

- Command: `npm run e2e`
  Expected: the end-to-end suite launches Electron and passes key parity scenarios.

- Command: `npm run test:all`
  Expected: unit plus e2e coverage passes using the migrated runtime assumptions.

- Command: at least one targeted destructive-path scenario
  Expected: delete-from-disk still works end to end inside Electron and still updates saved collections correctly.

### Rollback/Containment

If converting every scenario at once is too disruptive, first migrate a small parity subset that proves launch, folder load, save, and delete. Expand coverage after the Electron harness is stable, but do not leave the default high-confidence path proving only the old browser runtime.

## Milestone 5 - Retire the old runtime path and update durable docs

### Scope

Remove the old browser-plus-static-server runtime as the supported local flow and update durable documentation so future agents and developers orient correctly.

### Changes

- File: `deployment/deploy.ps1`
  Edit: retire, replace, or clearly mark the old static deployment workflow as obsolete if it is no longer valid.

- File: `deployment/launch.ps1`
  Edit: retire or replace the `miniserve` launch path.

- File: `docs/documentation/windows-deployment.md`
  Edit: replace browser/static-hosting instructions with Electron developer-run instructions, or move legacy content under a clearly marked historical section if needed temporarily.

- File: `docs/agent-docs/agent-architecture-map.md`
  Edit: update the architecture map to reflect:
  - Electron as the runtime,
  - main/preload/renderer ownership,
  - the new filesystem boundary,
  - removal of the read-only mode,
  - updated validation map.

- File: any deeper agent docs created during implementation
  Edit: add them only if the migration creates new architecture that is materially cheaper to understand through docs than through code alone.

- File: `docs/plans/electron-migration-exec-plan.md`
  Edit: update `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` with actual implementation results and final verification evidence.

### Validation

- Command: read the updated architecture docs and developer-run instructions
  Expected: a new agent can understand how the Electron runtime is structured and how to run it without consulting the old browser deployment flow.

- Command: manual local run from the repo using the documented Electron command
  Expected: the documented flow matches reality.

- Command: search the repo for stale runtime guidance
  Expected: obsolete references to the browser-plus-`miniserve` runtime are removed or clearly marked as historical.

### Rollback/Containment

If old deployment files must temporarily remain for transition reasons, keep them clearly labeled as legacy and ensure no primary doc or default script points new work toward them. The architecture docs must not present both runtimes as equally current if only Electron is supported.
