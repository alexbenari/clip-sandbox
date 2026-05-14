# Deliver Video Edits as a Layered Zoom Workflow

## Why this matters

Reviewers can already open a clip in zoom mode, but they still have to leave the app to generate a derived video. This feature closes that gap by adding a first built-in edit action, `Loopify`, directly on the zoomed clip.

The change also introduces two durable capabilities the app does not currently have: writing a new video file into the active pipeline folder and reporting long-running work through a reusable activity surface instead of a short-lived footer toast.

This plan implements the approved spec in [video-edits-spec.md](/C:/dev/clip-sandbox/docs/specs/video-edits-spec.md).

## Progress

- [x] (2026-05-05 17:44Z) Reviewed the approved spec, architecture map, repository design guidance, and the `solid` skill instructions.
- [x] (2026-05-05 17:44Z) Mapped the implementation seams across zoom UI, toolbar UI, session orchestration, runtime sequence state, pipeline inventory, and Electron disk boundaries.
- [x] (2026-05-05 17:44Z) Drafted this execution plan from the spec and current repository state.
- [x] (2026-05-06 08:13Z) Confirmed the `ffmpeg` loop-generation contract with a real prototype script and a manifest-backed resolver under `tools/ffmpeg/`.
- [x] (2026-05-06 08:13Z) Added the dedicated edit request workflow, renderer adapter, preload bridge, and trusted runtime runner for video generation.
- [x] (2026-05-06 08:13Z) Replaced the footer status bar with the toolbar activity indicator and added the zoom edit menu.
- [x] (2026-05-06 08:13Z) Wired success behavior for pipeline mode and collection mode without auto-saving collection files.
- [x] (2026-05-06 08:13Z) Hardened busy-state, failures, and partial-success behavior.
- [x] (2026-05-06 08:13Z) Finished unit, integration, and Electron-visible coverage; updated agent-facing docs.

## Surprises & Discoveries

- Discovery: the app has no existing mechanism for creating a new video file.
  Evidence: [electron/preload.cjs](/C:/dev/clip-sandbox/electron/preload.cjs) only exposes folder picking, text-file save/append, and delete operations; [electron/main.cjs](/C:/dev/clip-sandbox/electron/main.cjs) implements only those handlers.

- Discovery: zoom mode is visually isolated but not interaction-extensible yet.
  Evidence: [src/ui/zoom-overlay-controller.ts](/C:/dev/clip-sandbox/src/ui/zoom-overlay-controller.ts) only opens, closes, and swaps the zoomed video; it has no right-click callback or menu hook.

- Discovery: the current status abstraction is too weak for edit progress because it only shows one transient string and auto-hides.
  Evidence: [src/ui/status-bar-control.ts](/C:/dev/clip-sandbox/src/ui/status-bar-control.ts) exposes only `show(message, timeout)`; [index.html](/C:/dev/clip-sandbox/index.html) renders the status surface as a bottom-right `#status` footer element.

- Discovery: collection view cannot simply reload from the saved collection after an edit because the runtime working sequence may already contain unsaved changes.
  Evidence: [src/app/app-controller.ts](/C:/dev/clip-sandbox/src/app/app-controller.ts) keeps the durable selected collection in `state.activeCollection` but renders and mutates `state.currentClipSequence`; [src/app/app-session-state.ts](/C:/dev/clip-sandbox/src/app/app-session-state.ts) computes dirty state from the current runtime order.

- Discovery: the pipeline model already has a natural place for incremental inventory updates, but it does not yet expose a focused helper for adding one freshly created top-level video file.
  Evidence: [src/domain/pipeline.ts](/C:/dev/clip-sandbox/src/domain/pipeline.ts) owns the top-level video-file map and sorts it through `setVideoFiles(...)`, but there is no single-file add/update method today.

- Discovery: `tools/ffmpeg/` is currently absent.
  Evidence: repository inspection on 2026-05-05 found no `C:/dev/clip-sandbox/tools/ffmpeg` directory in the workspace.

- Discovery: a package-backed manifest is a practical V1 bridge for the unresolved bundled-binary question.
  Evidence: `tools/ffmpeg/current-binary.json` now points at the installed `@ffmpeg-installer/win32-x64/ffmpeg.exe`, while [electron/ffmpeg-resolver.cjs](/C:/dev/clip-sandbox/electron/ffmpeg-resolver.cjs) keeps the runtime lookup anchored in `tools/ffmpeg/`.

## Decision Log

- Decision: keep video-edit workflow rules in an app-facing `ClipEditor` abstraction and keep `app-controller.ts` limited to orchestration.
  Rationale: the repository guidance treats the controller as a composition root, not a home for reusable business rules. This split also matches the `solid` skill by giving edit workflow code one cohesive reason to change.
  Date/Author: 2026-05-05 / Codex

- Decision: split naming responsibility in two layers.
  Rationale: the app-facing workflow should own the deterministic naming recipe (`[base]-[suffix].mp4`), while the trusted runtime should own final collision resolution against real disk state because only it can authoritatively see existing files at write time.
  Date/Author: 2026-05-05 / Codex

- Decision: keep session-application outcomes out of `ClipEditor`.
  Rationale: `ClipEditor` ends when it knows whether edit execution created a file or failed. Applying that created file to the active pipeline or collection session is app orchestration and belongs in `src/app/app-controller.ts`.
  Date/Author: 2026-05-05 / Codex

- Decision: introduce one dedicated runtime adapter for edit execution rather than letting renderer code call `ffmpeg` or raw process APIs indirectly.
  Rationale: the spec requires a replaceable editing adapter and the repository architecture keeps runtime capabilities behind adapters or services.
  Date/Author: 2026-05-05 / Codex

- Decision: replace the current footer status bar entirely instead of adding a second status mechanism.
  Rationale: load/save/delete/edit messages should share one status surface with consistent history and failure behavior. Two user-visible status channels would create conflicting ownership.
  Date/Author: 2026-05-05 / Codex

- Decision: add only the minimal mutation helpers needed to support edit insertion and pipeline refresh.
  Rationale: the spec explicitly rejects a generic plugin system and does not justify a broad editing framework. Small focused helpers follow the repo’s anti-overengineering guidance.
  Date/Author: 2026-05-05 / Codex

- Decision: keep the runtime happy-path verification in Electron e2e and the prototype script rather than adding a dedicated Vitest import of `electron/video-edit-runtime.cjs`.
  Rationale: the Electron scenario and prototype already prove the real contract against the same implementation path, while direct Vitest loading of that CommonJS runtime was not worth the extra runner complexity in this repo.
  Date/Author: 2026-05-06 / Codex

## Outcomes & Retrospective

Shipped behavior:

1. zoom mode now exposes a right-click `Loopify` action with icon-capable menu rendering,
2. the toolbar activity indicator replaced the footer toast and now carries load/save/delete/edit status plus short history,
3. successful edits write `.mp4` files into the pipeline folder, refresh pipeline view immediately, and insert into collection runtime state without auto-saving the backing `.txt`.

Evidence:

1. `node C:\dev\clip-sandbox\sandbox\ffmpeg-loopify-prototype.mjs C:\dev\clip-sandbox\tests\e2e\fixtures\video-edit\clips\source.mp4` returned a successful created-file payload on 2026-05-06,
2. `npm run unit` passed on 2026-05-06,
3. `npm run e2e` passed on 2026-05-06,
4. `npm run test:all` passed on 2026-05-06.

Tooling constraint:

1. V1 currently resolves `ffmpeg` through `tools/ffmpeg/current-binary.json`, which points at the installed `@ffmpeg-installer/ffmpeg` Windows x64 package path instead of a committed binary.

## Context and orientation

Clip Sandbox is a framework-free Electron desktop app for reviewing the clips in one selected folder at a time. The durable folder model is `Pipeline`, which contains top-level video files and zero or more saved `Collection` objects. The active UI view is a mutable `ClipSequence` materialized from that durable state.

Important current modules:

- [src/app/app-controller.ts](/C:/dev/clip-sandbox/src/app/app-controller.ts): app composition root and workflow coordinator.
- [src/app/app-session-state.ts](/C:/dev/clip-sandbox/src/app/app-session-state.ts): session state for folder, pipeline, current sequence, active collection, and dirty tracking.
- [src/business-logic/PipelineFactory.ts](/C:/dev/clip-sandbox/src/business-logic/PipelineFactory.ts): builds `Pipeline` from top-level folder entries.
- [src/domain/pipeline.ts](/C:/dev/clip-sandbox/src/domain/pipeline.ts): durable video inventory and saved collection registry.
- [src/domain/collection.ts](/C:/dev/clip-sandbox/src/domain/collection.ts): durable collection-file model.
- [src/domain/clip-sequence.ts](/C:/dev/clip-sandbox/src/domain/clip-sequence.ts): mutable runtime clip order used by the visible grid or active collection view.
- [src/domain/clip.ts](/C:/dev/clip-sandbox/src/domain/clip.ts): runtime clip wrapper around a renderer-side `File`.
- [src/ui/zoom-overlay-controller.ts](/C:/dev/clip-sandbox/src/ui/zoom-overlay-controller.ts): zoom overlay rendering and lifecycle.
- [src/ui/context-menu-controller.ts](/C:/dev/clip-sandbox/src/ui/context-menu-controller.ts): generic menu shell used for right-click actions.
- [src/ui/main-toolbar-control.ts](/C:/dev/clip-sandbox/src/ui/main-toolbar-control.ts): toolbar count and action-state rendering.
- [src/ui/load-status-control.ts](/C:/dev/clip-sandbox/src/ui/load-status-control.ts): status publishing for load and selection messages.
- [src/ui/status-bar-control.ts](/C:/dev/clip-sandbox/src/ui/status-bar-control.ts): existing footer-toast implementation to be removed or absorbed.
- [src/adapters/electron/electron-file-system-service.ts](/C:/dev/clip-sandbox/src/adapters/electron/electron-file-system-service.ts): renderer-facing desktop filesystem service.
- [electron/preload.cjs](/C:/dev/clip-sandbox/electron/preload.cjs): preload bridge to trusted Electron APIs.
- [electron/main.cjs](/C:/dev/clip-sandbox/electron/main.cjs): trusted-process IPC implementations.
- [index.html](/C:/dev/clip-sandbox/index.html): toolbar markup, footer status markup, and app shell CSS.

Definitions used in this plan:

- `edit request`: the explicit request to transform one source clip using one predefined manipulation and write the result into the current pipeline folder.
- `ClipEditor`: the app-facing workflow object that validates and prepares an edit request, derives the preferred output filename recipe, and delegates execution to a runtime editing service.
- `runtime editing service`: the Electron-backed adapter that turns the request into a real disk mutation and returns metadata for the created file.
- `activity indicator`: the new toolbar dot button and collapsible panel that shows current state and recent messages.
- `partial success`: the output file exists on disk, but the active collection view could not be updated safely in memory.

Constraints that must remain true:

1. all generated outputs are `.mp4`,
2. the manipulation catalog is predefined and fixed in V1,
3. pipeline ordering remains normal filename ordering in pipeline view,
4. collection file persistence remains an explicit save action,
5. the renderer does not know where `ffmpeg` lives or how to invoke it,
6. fullscreen can continue to hide the toolbar and status surface in V1.

## Responsibility model

This feature must keep boundaries clear.

- UI layer:
  owns indicator rendering, indicator interactions, and zoom-menu presentation.

- Application orchestration layer:
  owns when edits start, when they are blocked, how results are applied to current session state, and which status message should be emitted.

- Business/domain layer:
  owns manipulation definitions, preferred output naming rules, and small runtime sequence or pipeline mutations that are independent of Electron.

- Electron/runtime layer:
  owns binary resolution, process execution, file creation, collision checking against disk, and re-reading created-file metadata.

A change that starts mixing these responsibilities should be treated as a design regression and corrected before continuing.

## Milestone 1 - Validate the edit engine contract

### Scope

Remove the largest unknown first: prove that a binary under `tools/ffmpeg/` can generate the boomerang-loop output required by `Loopify`, and define the exact result payload that the renderer will receive after a successful write.

### Changes

- File: `tools/ffmpeg/README.md`
  Edit: document the expected binary layout, the current platform assumption, and the contract that runtime code will use to resolve the executable.

- File: `tools/ffmpeg/`
  Edit: add the required directory structure for the V1 binary or, if the binary cannot be committed yet, add the exact placeholder structure and record the temporary limitation in this plan.

- File: `sandbox/ffmpeg-loopify-prototype.mjs`
  Edit: add a small prototype script that:
  - accepts a source clip path,
  - resolves the binary from `tools/ffmpeg/`,
  - runs the reverse-plus-concatenate flow,
  - writes an `.mp4` output,
  - prints enough metadata to validate the later IPC payload shape.

- File: `docs/plans/video-edits-exec-plan-solid.md`
  Edit: record the final command shape and any codec or container caveats discovered during the spike.

### Validation

- Command: `Get-ChildItem C:\dev\clip-sandbox\tools\ffmpeg`
  Expected: the tool directory exists and clearly shows the path the runtime resolver must use.

- Command: `node C:\dev\clip-sandbox\sandbox\ffmpeg-loopify-prototype.mjs <source-clip-path>`
  Expected: the script creates a playable `.mp4` boomerang clip and prints stable metadata for the created file.

- Command: manual playback of the generated output in the app or a media player
  Expected: the clip plays forward and then backward as one seamless output.

### Rollback/Containment

If the first prototype command does not yield a usable output, keep the problem inside the prototype script and this plan. Do not wire any app code to edit generation until the runtime contract is stable.

## Milestone 2 - Add the edit workflow and runtime adapter

### Scope

Introduce the permanent backend path for video edits: the request model, the app-facing workflow abstraction, the renderer adapter, and the trusted Electron implementation.

### Changes

- File: `src/business-logic/video-edit-catalog.ts`
  Edit: define the V1 manipulation catalog with stable ids and metadata:
  - display label,
  - filename suffix,
  - availability in zoom mode,
  - any future-ready descriptive fields that are immediately useful for UI and tests.

- File: `src/business-logic/clip-editor.ts`
  Edit: implement the app-facing edit workflow. It should:
  - accept the source `Clip`,
  - derive the preferred output filename recipe,
  - create a concrete edit request object,
  - delegate to an injected runtime editing service,
  - return a structured result type that clearly distinguishes successful file creation from execution failure, without making any claim about whether the app session was updated afterward.

- File: `src/adapters/electron/electron-video-edit-service.ts`
  Edit: implement the renderer-side runtime editing service. It should translate the edit request into the preload IPC payload and translate the response back into a renderer-usable result shape.

- File: `src/adapters/electron/electron-file-system-service.ts`
  Edit: expose or compose the video-edit service in the existing Electron-facing service boundary so the renderer still has one coherent desktop mutation surface.

- File: `electron/ffmpeg-resolver.cjs`
  Edit: centralize binary lookup under `tools/ffmpeg/`.

- File: `electron/video-edit-runtime.cjs`
  Edit: implement the trusted runtime edit runner. It should:
  - validate request fields,
  - resolve the binary,
  - compute final collision-free destination path,
  - run the edit,
  - verify the output exists,
  - return created-file metadata in the same structural shape used by folder loading.

- File: `electron/preload.cjs`
  Edit: expose a narrow `createVideoEdit(...)` bridge.

- File: `electron/main.cjs`
  Edit: register the new IPC handler and delegate to `electron/video-edit-runtime.cjs`.

### Validation

- Command: `npm run unit`
  Expected: tests pass for catalog metadata, preferred output naming, and request/result mapping.

- Command: targeted Vitest coverage for `electron/video-edit-runtime.cjs`
  Expected: the runtime returns success payloads on valid input, resolves collision names correctly, and returns explicit failure codes for missing binary, missing source, and process failures.

### Rollback/Containment

If the first response shape feels too renderer-specific or too runtime-specific, refine it now before the UI depends on it. Keep the runtime boundary explicit and small.

## Milestone 3 - Replace the footer toast and add the zoom edit surface

### Scope

Introduce the new status surface and the zoom-mode edit entry point without yet coupling those UI pieces to all session-update details.

### Changes

- File: `index.html`
  Edit: replace the footer `#status` host with toolbar markup for:
  - the existing clip count,
  - a new rightmost activity-indicator button,
  - an anchored message panel that can show recent messages.

- File: `src/ui/activity-indicator-control.ts`
  Edit: add a focused control that owns:
  - `idle`, `progress`, `success`, and `error` states,
  - a newest-first message history capped at five entries,
  - click-to-toggle panel behavior,
  - auto-open on error,
  - persistent red state after a dismissed error until a later status replaces it.

- File: `src/ui/load-status-control.ts`
  Edit: publish load and selection messages through the new activity control instead of the removed footer status control.

- File: `src/ui/status-bar-control.ts`
  Edit: remove the old control or reduce it to a temporary adapter that is deleted before the feature is complete.

- File: `src/ui/main-toolbar-control.ts`
  Edit: refresh toolbar rendering so count and indicator state can be updated without leaking DOM structure into `app-controller.ts`.

- File: `src/ui/context-menu-controller.ts`
  Edit: allow context-menu items to render an icon-capable label while preserving keyboard navigation and disabled behavior.

- File: `src/ui/zoom-overlay-controller.ts`
  Edit: add a right-click interaction seam for the zoomed video element.

- File: `src/ui/zoom-edit-menu-control.ts`
  Edit: add a focused menu-builder for zoom edit actions. In V1 it should produce exactly one action: `Loopify`, with a chisel icon.

### Validation

- Command: `npm run unit`
  Expected: UI-level tests pass for state changes, message ordering, panel toggling, and icon-capable menu rendering.

- Command: targeted integration tests under `tests/integration/ui`
  Expected: right-clicking the zoomed video opens the edit menu; the indicator auto-opens on error; success messages do not auto-open the panel.

### Rollback/Containment

If migrating all status callers at once is too disruptive, keep a temporary publisher shim that maps the old call pattern to the new activity control. Do not keep the old footer visible.

## Milestone 4 - Apply edit results to the active session

### Scope

Wire `Loopify` through the app controller so a completed edit immediately updates the current session in the correct way for pipeline mode and collection mode.

### Changes

- File: `src/domain/clip-sequence.ts`
  Edit: add a focused mutation method for inserting one new clip after a known source clip in the runtime sequence.

- File: `src/domain/pipeline.ts`
  Edit: add a focused mutation method for adding one new top-level video file to the in-memory pipeline inventory while preserving normal filename ordering.

- File: `src/app/app-text.ts`
  Edit: add centralized status text for:
  - edit start,
  - edit success,
  - edit failure,
  - partial success with reopen-the-collection guidance.

- File: `src/app/app-controller.ts`
  Edit: orchestrate the end-to-end flow:
  - resolve the currently zoomed source clip,
  - start the activity indicator,
  - call `ClipEditor`,
  - convert created-file metadata into a renderer `File`,
  - update the in-memory pipeline inventory,
  - in pipeline mode, rebuild the visible pipeline selection and select the new clip,
  - in collection mode, insert the new clip immediately after the source in `state.currentClipSequence` and refresh dirty-state tracking,
  - reopen zoom on the new clip,
  - emit the final status message.

- File: `src/ui/clip-collection-grid-controller.ts`
  Edit: add any small lookup or selection helper needed so the app controller can reliably target the created clip after refresh or insertion.

### Validation

- Command: `npm run unit`
  Expected: tests pass for `ClipSequence` insertion and `Pipeline` single-file inventory updates.

- Command: targeted integration tests under `tests/integration/app/app-controller.spec.ts`
  Expected: pipeline mode selects the newly created clip after refresh; collection mode inserts it immediately after the source, marks the collection dirty, and does not write the collection file.

- Command: `npm run e2e -- --grep "zoom|collection|load"`
  Expected: existing zoom and collection flows continue to pass after session-update wiring is introduced.

### Rollback/Containment

If collection-mode insertion introduces unstable state transitions, isolate the problem to the new `ClipSequence` helper and the app-controller integration path. Do not “fix” it by auto-saving collection files or by re-materializing from the saved collection model.

## Milestone 5 - Harden failure behavior and duplicate-request handling

### Scope

Make the feature safe under repeated clicks, runtime failures, and partial-success cases where the file was created but the collection runtime view cannot be updated.

### Changes

- File: `src/app/app-controller.ts`
  Edit: add explicit in-flight edit tracking so edit actions are disabled while a request is running and always re-enabled on completion.

- File: `src/business-logic/clip-editor.ts`
  Edit: make result states explicit enough that the app layer can distinguish:
  - no file created,
  - file created successfully and returned with metadata.

- File: `src/app/app-controller.ts`
  Edit: classify post-edit application outcomes explicitly enough that the app can distinguish:
  - file created and session updated,
  - file created but the current collection session could not be updated safely.

- File: `electron/video-edit-runtime.cjs`
  Edit: return actionable failures for:
  - missing binary,
  - missing source file,
  - runtime process failure,
  - output missing after process completion.

- File: `src/app/app-text.ts`
  Edit: add exact user-facing copy for each failure family and for the approved partial-success message.

### Validation

- Command: `npm run unit`
  Expected: tests prove duplicate requests are blocked and result-state branching is deterministic.

- Command: targeted integration tests under `tests/integration/app/app-controller.spec.ts`
  Expected: error status drives the indicator into red state with panel auto-open; partial success keeps the created file and shows reopen guidance; duplicate edit attempts are ignored while one request is in flight.

### Rollback/Containment

If a failure branch is difficult to trigger with a real edit invocation, cover it at the integration seam with mocked runtime responses. Do not leave the user-facing behavior unspecified for mixed-success outcomes.

## Milestone 6 - Complete coverage and update the architecture knowledge base

### Scope

Prove the final user-visible behavior and keep the canonical agent-facing docs current with the new subsystem boundaries.

### Changes

- File: `tests/unit/*.spec.ts`
  Edit: add or update pure tests for naming, catalog metadata, runtime sequence insertion, pipeline inventory mutation, and activity-indicator logic.

- File: `tests/integration/ui/*.spec.ts`
  Edit: cover the zoom edit menu and the activity indicator interactions.

- File: `tests/integration/app/app-controller.spec.ts`
  Edit: cover success, failure, and partial-success orchestration with a mocked Electron desktop API.

- File: `tests/e2e/scenarios.spec.ts`
  Edit: add Electron-visible scenarios for:
  - running `Loopify` from zoom mode,
  - seeing the new clip selected afterward,
  - seeing collection mode stay dirty rather than auto-save,
  - seeing the activity indicator show progress and the final result.

- File: `docs/agent-docs/agent-architecture-map.md`
  Edit: add the new video-edit runtime boundary, the activity indicator, and the zoom edit flow to the canonical orientation map.

- File: `docs/plans/video-edits-exec-plan-solid.md`
  Edit: keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` updated with real implementation evidence.

### Validation

- Command: `npm run unit`
  Expected: all Vitest coverage passes.

- Command: `npm run e2e`
  Expected: Electron-visible scenarios pass, including at least one real `Loopify` success path.

- Command: `npm run test:all`
  Expected: the complete regression suite passes.

### Rollback/Containment

If broad end-to-end failure simulation becomes too brittle because it depends on a real external binary, keep one true happy-path Electron test and move failure-detail verification into integration tests. The final suite must still prove one real edit succeeds end to end.

## Definition of done

The work is complete when all of the following are true:

1. right-clicking the zoomed clip opens a manipulation menu,
2. the menu shows a chisel-icon `Loopify` action,
3. selecting `Loopify` writes a boomerang-loop `.mp4` into the active pipeline folder,
4. output naming follows the approved suffix and collision rules,
5. the created file becomes part of the in-memory pipeline immediately,
6. pipeline mode refreshes to include and select the new clip,
7. collection mode inserts the new clip immediately after the source in the runtime sequence and does not auto-save the backing collection file,
8. repeated edit actions are blocked while an edit is already running,
9. the top-right activity indicator replaces the old footer status surface and retains recent messages,
10. error states auto-open the indicator panel and partial success preserves the created file with clear reopen guidance,
11. agent-facing architecture docs reflect the new boundaries,
12. `npm run test:all` passes.
