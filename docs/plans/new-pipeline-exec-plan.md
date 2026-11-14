# New pipeline: execution plan

## Why this matters

The user can create an empty pipeline (a folder directly under the Pipelines top folder set in Settings) from a + button in the Pipelines panel, name it inline, and see it in the Pipelines list at once, without leaving the app. Empty pipelines become visible in the list. Along the way, the app's five copies of the Windows file-name check become one rule. The signed-off spec is `docs/specs/new-pipeline-spec.md`; its decisions are cited here as spec D1–D10 and are not restated.

## Progress

- [ ] Milestone 1: one Windows name rule replaces the five copies (spec D10). G0, G1, G2 passed (2026-11-14). Code-quality review (fresh-context reviewer): fixed the device-name base stripping only spaces, the rule comparing plain spaces rather than all whitespace at the ends (Windows allows a no-break space; new test), a construction guard in `ClipFileRenamer`, the extraction runtime's checks made private and named `#isLegalBoundedName` / `#isLegalBoundedFilename`, and explicit arguments to `registerIpc`. Kept as the user named them: `WindowsFileNameValidity.isLegalWindowsFileName`. Left as before: the window's and main process's identical top-level file-name checks (the window's is an early refusal, the main process's the trust boundary). Known gap: `validateTopLevelFilename` in `main.cjs` has no unit test; G3 covers its save and Recycle Bin paths.
- [ ] Milestone 2: the trusted process lists empty pipelines and creates pipelines (spec D5, D7, D9)
- [ ] Milestone 3: the + button, name field, workflow and Activity report (spec D1–D4, D6, D8, D9)
- [ ] Milestone 4: end-to-end test and manual check in the real app
- [ ] Milestone 5: agent docs, DESIGN.md and feature list updated

Evidence logs: `test-evidence/new-pipeline/` (ignored by git; no test runner cleans it). Each gate's full output and exit code go to `test-evidence/new-pipeline/<gate id>.log`. While iterating inside a milestone, run only the spec files named in its gate; the full commands run once, at the gate.

## Skill Gates

Planning-time gates:

- plan-review: before each sign-off request and after substantial revisions.
- impeccable (shape): settled the button placement and inline naming with the user (spec D1, D3).
- before-you-refactor: shaped Milestone 1 (existing tests listed, goal sentence, smallest steps).
- security-and-trust-boundaries: shaped the create request (name only from the window, path checked against the top folder; plan D3).
- `coding-quality.md` and `ui-coding-quality.md` (through the axioms in `docs/agent-docs/agent-architecture-map.md`): placed the rule in the domain, the request in the catalog runtime, the field in a control and the flow in a workflow.

Execution-time gates:

- code-quality-review: at the end of Milestones 1, 2, 3 and 4, before each milestone's gates.
- testing-discipline: before writing or changing any test.
- typescript-coding and writing-clean-code: before TypeScript edits in Milestones 1 and 3.
- before-you-refactor: before Milestone 1 edits; run the existing tests green first.
- security-and-trust-boundaries and error-and-correctness-traps: before Milestone 2 edits (path from input, file-system errors).
- api-and-interface-design: before adding the create request (Milestone 2) and the control's new events and methods (Milestone 3).
- impeccable: load its craft floor (`.claude/skills/impeccable/reference/craft-floor.md`) before the Milestone 3 markup and CSS edits.
- doc-update: Milestone 5.
- pre-commit-self-review: before each commit.
- finishing-a-development-branch: after G8; this project merges into `master` and pushes without a pull request.

Unavailable skills or fallbacks:

- none known; if one is missing at execution time, record it here and apply `coding-quality.md` directly.

## Surprises & Discoveries

- Discovery: the main process can `require()` the compiled ES module synchronously (Electron 37, Node 22.21.1), but unit tests run with Vitest and no build step, so a `require` of `build/` from a `.cjs` file would break `npm run unit` on a clean checkout.
  Evidence: probe on 2026-11-14 requiring `build/src/domain/zoom-edit-composition.js` from a `.cjs` script under `ELECTRON_RUN_AS_NODE`; `package.json` script `unit` is `vitest --run` with no build.
- Discovery: Windows does not refuse most bad names; it creates something else. Through Node on this machine, `mkdir` and `writeFile` created `trail-dot.`, `trail-space `, `con` and `nul.txt` as written (names that File Explorer and many programs cannot open or delete), and `writeFile("a:b-f")` created a file `a` with a hidden alternate data stream. Only `? * | < >` and control characters were refused, as `EINVAL` from `mkdir` and a misleading `ENOENT` ("no such file or directory") from `writeFile`, each with the full path in the message. So the app's own rule is needed, both to refuse what Windows silently accepts and to give a readable reason.
  Evidence: probe on 2026-11-14, Windows 10.0.26100, Node 22.17.0, script kept in the session scratchpad and not committed.
- Discovery: there was a fifth copy of the Windows name check, in the extraction runtime, which the planning search missed because it spelled the device names inside a different pattern.
  Evidence: gate G2's search on 2026-11-14 matched `electron/clip-extraction-runtime.cjs:23`.
- Discovery: `tests/unit/clip-filename-rule.spec.ts` held only plain-video-name cases, so nothing moved out of it.
  Evidence: the file's contents on 2026-11-14.
- Discovery: of the three users of `ClipFilenameRule` (`electron/clip-filename-rule.cjs`), only `ClipFileRenamer` calls the Windows-name part (`isCreatableVideoFilename`); `GrantedClipResolver` and `ClipSourceMovieRuntime` call only `isPlainVideoFilename`.
  Evidence: search for `filenameRule.` in `electron/`.

## Decision Log

All decisions dated 2026-11-14.

| ID | Decision | Rationale |
|---|---|---|
| D1 | The rule is a stateless class `WindowsFileNameValidity` in `src/domain/windows-file-name-validity.ts` with one method `isLegalWindowsFileName(name: string): boolean`, implementing spec D10 exactly. It does not trim; callers trim first where they do today. Its device-name pattern is written as `/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i`, the same text as today's copies, so gate G2 can find every copy. | Both processes need it; the domain is the one place both reach, and the domain holds no user text, so the rule answers yes or no and callers keep their own messages. |
| D2 | The main process gets the rule the way it gets `ZoomEditComposition`: `loadEditComposition` in `electron/main.cjs` becomes `loadSharedDomain(projectFolder)`, which imports both compiled modules and returns `{ editComposition, fileNameValidity }`, where `fileNameValidity` is one `WindowsFileNameValidity` instance. It is passed to `registerIpc`, which hands it to `ClipFileRenamer`, `PipelineCatalogRuntime` and the file-name check used by the save, append and Recycle Bin handlers. Unit tests import the rule from `src/` and pass it in. | Keeps `.cjs` files free of build-output imports, so unit tests need no build (see Surprises). |
| D3 | `ClipFilenameRule.isCreatableVideoFilename` and its two Windows patterns are removed; `ClipFileRenamer` checks `isPlainVideoFilename(newFilename) && fileNameValidity.isLegalWindowsFileName(newFilename)` plus its existing same-extension check. `GrantedClipResolver` and `ClipSourceMovieRuntime` are untouched. | Only the renamer needs the Windows rule; this avoids threading it through five constructors. |
| D4 | `validateTopLevelFilename` in `electron/main.cjs` and the private method of the same name in `ElectronFolderFileService` (`src/adapters/electron/electron-folder-file-service.ts`) keep their trimming and their error message and call the rule for everything else. `Collection.validateCollectionName` (`src/domain/collection.ts`) keeps its `required` and `illegal-chars` codes and uses the rule in place of `ILLEGAL_COLLECTION_NAME_CHARS`, `WINDOWS_RESERVED_BASENAME` and `#hasWindowsInvalidFilenameShape`, which are removed. | Callers' observable contracts (messages, result codes) stay as they are; only which names pass changes, per spec D10. |
| D5 | Creating a pipeline is a method `createPipeline(name)` on `PipelineCatalogRuntime` (`electron/pipeline-catalog-runtime.cjs`), which receives `fileNameValidity` in its constructor. It trims the name, reads the top folder with the existing `configuredRootPath()`, refuses `no-top-folder` when there is none and `invalid-name` when the rule refuses, resolves the target with `path.resolve(root, name)` and refuses `invalid-name` unless its parent is exactly the root, then calls `fs.mkdir(target)` without `recursive`. `EEXIST` answers `name-taken` (Windows compares names without case, so this covers spec D4's case rule and a folder created meanwhile); `ENOENT` answers `top-folder-missing`; any other error is thrown, so the IPC call rejects. Success answers `{ kind: 'created', name }` with the trimmed name; a refusal answers `{ kind: 'refused', reason }`. | The runtime already owns the top folder and the listing rule, and creating a folder the list shows changes for the same reasons. Letting `mkdir` decide existence avoids a check-then-create race. |
| D6 | The listing rule becomes `#isListedPipelineFolder(folderPath)`: true when the folder's entries include a video file, or when it has no entries at all (spec D7). `describePipeline` and `openPipeline` already work on an empty folder. | Spec D7, one method. |
| D7 | The IPC channel is `clip-sandbox:create-pipeline`, payload `{ name }`; the preload adds `createPipeline(payload)`. The renderer adapter `ElectronPipelineCatalogService` gains `createPipeline(name)`, which validates the answer's shape and throws on anything else, like its other methods. The outcome type lives in `src/app/pipeline-catalog.ts`: `PipelineCreationOutcome` (`created` with `name`, or `refused` with `PipelineCreationRefusal`: `invalid-name`, `name-taken`, `no-top-folder`, `top-folder-missing`). | Same shape and validation style as the existing catalog requests and the rename request. |
| D8 | A new `PipelineCreationWorkflow` (`src/app/pipeline-creation-workflow.ts`) subscribes to the catalog control's `createRequested({ name })`, calls the adapter, and then: on `created`, calls `endCreate()`, awaits `load()`, calls `focusPipeline(name)` (which focuses nothing if a newer reload has not yet drawn the entry, or the reload failed) and reports success through `ActivityReporter` with text from `AppText` ("Created pipeline <name>"); on `refused`, calls `showCreateProblem(reason)`; when the call throws, calls `showCreateProblem('failed')` and reports a failure with technical details. It depends on a narrow consumer-declared interface `IPipelineCreationCatalog`, not on the control class. | Mirrors `ClipRenameWorkflow` and the architecture axioms: controls report intent as events, workflows run flows. |
| D9 | `PipelineCatalogControl` (`src/ui/pipeline-catalog-control.ts`) finds the new header button (`#newPipeline`) itself through `DocumentElements`, keeps the list in its own child container so a reload replaces only the list, and owns the name field through a new small class `NewPipelineField` (`src/ui/new-pipeline-field.ts`) modeled on `ClipNameEditor` (Enter, Escape with `stopPropagation`, leave-submits, refusal text, read-only while waiting). The control owns all refusal and reason texts (spec D2, D4, D9). Button availability follows the control's own load state: available after a load answering `available`; disabled with the spec D2 reasons for `unconfigured` and for a failed list load; disabled with no reason while loading. Disabled means `aria-disabled="true"` plus a reason in `title` and `aria-description`, so the button stays focusable. New methods: `endCreate()`, `showCreateProblem(problem)`, `focusPipeline(name): boolean`. | Axiom 11: a control finds its own parts and owns its text. Splitting the field out keeps the control at one responsibility per class. |
| D10 | The button's markup is added to `index.html` in the Pipelines panel header before the fold button, reusing the header button styles and a 1.6px-stroke plus icon, with the disabled look (reduced opacity, same shape) applied through `aria-disabled="true"`; the field reuses the clip rename field's look (spec D3). | DESIGN.md's existing vocabulary covers both; no new visual language. |
| D11 | The extraction runtime's own check (`validCollectionName` and `validTopLevelFilename`, module-level functions in `electron/clip-extraction-runtime.cjs`) becomes two methods on `ClipExtractionRuntime`, which receives `fileNameValidity` as a required constructor option: a collection name is a string of at most 180 characters that the rule accepts, and a published file name is such a name with the expected extension. | A fifth copy found during Milestone 1 (see Surprises); the 180-character limit is the runtime's own and stays. |

## Validation gates

| ID | Milestone | Proves | Needs milestones | How to check | Expected |
|---|---|---|---|---|---|
| G0 | 1 | The tests protecting the copies pass before any edit | none | `npx vitest --run tests/unit/clip-filename-rule.spec.ts tests/unit/clip-file-renamer.spec.ts tests/unit/electron-folder-services.spec.ts tests/unit/clip-models.spec.ts tests/unit/collection-name-validator.spec.ts tests/unit/new-collection-name-check.spec.ts` | all pass |
| G1 | 1 | The rule refuses and allows names exactly as spec D10 says, and each caller uses it | 1 | `npm run typecheck`, `npm run lint`, `npm run unit` | all pass; the new rule tests were each seen failing first |
| G2 | 1 | Only one place in the source names the reserved devices | 1 | `git grep -i -F "com[1-9]" -- src electron` (after staging new files with `git add -N`) | exactly one match, in `src/domain/windows-file-name-validity.ts` |
| G3 | 1 | Saving a collection, moving clips to the Recycle Bin and renaming a clip still work in the real app through the changed checks | 1 | `npm run build`, then `npx playwright test tests/e2e/collection-workflows.spec.ts` | all pass |
| G4 | 2 | The listing shows empty and video folders only, and creation answers every case of plan D5 without ever leaving the top folder | 2 | `npx vitest --run tests/unit/pipeline-catalog-runtime.spec.ts`, then `npm run unit` | all pass; new tests seen failing first |
| G5 | 3 | Button availability, the field's keys and leave rules, refusal texts, list-refresh survival and the workflow's outcomes behave per spec D2–D4, D6, D9 | 3 | `npx vitest --run tests/unit/pipeline-catalog-control.spec.ts tests/unit/pipeline-creation-workflow.spec.ts`, then `npm run typecheck`, `npm run lint`, `npm run unit` | all pass; new tests seen failing first |
| G6 | 4 | A user creates a pipeline through the + button in the real app; it appears focused in the list, the open pipeline is unchanged, and the new empty pipeline loads into an empty grid | 1–4 | `npm run build`, then `npx playwright test tests/e2e/new-pipeline.spec.ts` | passes; seen failing first with the + button's click handler disconnected |
| G7 | 4 | Perceived behavior in the real app matches the spec's Visible behavior section | 1–4 | manual check in `npm start` (list in Milestone 4) | every item observed; findings recorded in Surprises |
| G8 | 5 | Nothing else broke | 1–5 | `npm run test:all`, run in the background, output to `test-evidence/new-pipeline/G8.log` | exit code 0 |

## Outcomes & Retrospective

To be written at the end of execution.

## Context and orientation

The app is an Electron desktop app. The main process (`electron/main.cjs` and other `electron/*.cjs` CommonJS files) alone touches the disk; the window's code is TypeScript under `src/`, compiled to `build/src/` by `npm run build`, and reaches the main process only through the preload API (`electron/preload.cjs`, exposed as `window.clipSandboxDesktop`). Renderer layers: `src/domain/` (rules, no DOM and no user text), `src/app/` (workflows, services, `AppText`), `src/adapters/electron/` (wrappers around the preload API that validate answers), `src/ui/` (controls; only `src/app/app-controller.ts`, the composition root, imports from it).

The Pipelines panel is the left side panel in `index.html` (`#pipelinesPanel`; header `<header class="panel-heading">` with the title and fold button `#foldPipelines`; list host `#pipelinesPanelHost`). `PipelineCatalogControl` fills the host from `ElectronPipelineCatalogService`, which calls three IPC channels served by `PipelineCatalogRuntime`: list, describe and open. `PipelineCatalogRefresher` (`src/app/pipeline-catalog-refresher.ts`) reloads the list after an extraction publishes clips, and `SettingsWorkflow` reloads it after the top folder changes.

The five Windows name-check copies before this work: `ClipFilenameRule.isCreatableVideoFilename` (`electron/clip-filename-rule.cjs`, clip rename), `validateTopLevelFilename` (`electron/main.cjs`, save/append/Recycle Bin handlers), `ElectronFolderFileService.validateTopLevelFilename` (`src/adapters/electron/electron-folder-file-service.ts`, the same check before the request leaves the window), and `Collection.validateCollectionName` with `#hasWindowsInvalidFilenameShape` (`src/domain/collection.ts`, collection names, also used by `NewCollectionNameCheck`, `ClipExtractor` and `ExtractionPublisher`), and `validCollectionName` with `validTopLevelFilename` (`electron/clip-extraction-runtime.cjs`, extraction's collection name and published collection file, with its own 180-character limit).

Clip rename is the model for the new flow: `ClipNameEditor` (`src/ui/clip-name-editor.ts`) is the inline field, `ClipRenameWorkflow` (`src/app/clip-rename-workflow.ts`) the workflow, `ElectronClipRenameService` the adapter and `ClipFileRenamer` (`electron/clip-file-renamer.cjs`) the main-process side.

Work happens on the branch `new-pipeline` in the main checkout at `D:\tmp\dev\clip-sandbox`, which already has `node_modules` and the native frame-review build the app needs to start. The user does not switch branches there until the work is merged. The user's uncommitted edit to `docs/feature-requests.md` and the untracked `.codex/` folder stay uncommitted except for the one line Milestone 5 changes. Commit at the end of each milestone after its gates pass.

## Milestone 1 - One Windows name rule

### Scope

Spec D10: every Windows name check goes through `WindowsFileNameValidity` (plan D1–D4). The only behavior change is the one spec D10 describes.

### Changes

- File: `src/domain/windows-file-name-validity.ts` (new)
  Edit: `WindowsFileNameValidity.isLegalWindowsFileName(name)` per spec D10: refuse empty, `.`, `..`, a name differing from its trimmed self, a trailing dot, any of `< > : " / \ | ? *` or U+0000–U+001F, and a name whose part before the first dot, with trailing spaces and dots removed, is a reserved device name in any case.
- File: `src/domain/collection.ts`
  Edit: plan D4; remove the two static patterns and `#hasWindowsInvalidFilenameShape`.
- File: `src/adapters/electron/electron-folder-file-service.ts`
  Edit: plan D4; remove the module-level patterns.
- File: `electron/main.cjs`
  Edit: plan D2 (`loadSharedDomain`) and plan D4 (`validateTopLevelFilename` takes the rule); pass the rule to `ClipFileRenamer`.
- File: `electron/clip-filename-rule.cjs`, `electron/clip-file-renamer.cjs`
  Edit: plan D3.
- File: `electron/clip-extraction-runtime.cjs`
  Edit: plan D11.
- Tests: new `tests/unit/windows-file-name-validity.spec.ts` covering each refusal and allowance of spec D10, including `con .txt` refused, `a .b.txt` allowed and a control character refused; move the Windows-name cases out of `tests/unit/clip-filename-rule.spec.ts` (keep its plain-video-name cases); `tests/unit/clip-file-renamer.spec.ts` passes the real rule; adjust any collection-name or folder-service case whose expected answer spec D10 changes, citing D10 in the test name.

### Validation

Gates: G0 before editing, then G1, G2, G3.

New or changed tests: each new rule test is written first and seen failing (the class does not exist yet does not count: first add the class returning `true`, see the refusal tests fail, then implement). Changed caller tests that flip because of spec D10 are seen failing against the old code before the rule is wired in.

### Rollback/Containment

One commit; revert it to restore the five copies.

## Milestone 2 - Listing empty pipelines and creating one

### Scope

Spec D5, D7, D9 on the main-process side: plan D5, D6, D7 (IPC and preload only).

### Changes

- File: `electron/pipeline-catalog-runtime.cjs`
  Edit: plan D5 and D6; constructor takes `fileNameValidity`.
- File: `electron/main.cjs`
  Edit: construct the runtime with `fileNameValidity`; register `clip-sandbox:create-pipeline` calling `pipelineCatalogRuntime.createPipeline(payload.name)`.
- File: `electron/preload.cjs`
  Edit: `createPipeline(payload)` beside the other catalog calls.
- Tests: `tests/unit/pipeline-catalog-runtime.spec.ts` with temporary folders under the test's own root: an empty folder is listed; a folder with only a `.txt` or only a subfolder is not; creation answers `created` and the folder exists; `invalid-name` for a refused name and for `..`, `a\b` and an absolute path, with no folder created anywhere; `name-taken` for a differing-case existing folder and for an existing file; `no-top-folder`; `top-folder-missing` when the top folder was removed, with nothing created; the trimmed name is used.

### Validation

Gates: G4.

New or changed tests: written before the runtime changes and seen failing on the missing behavior (listing tests fail against today's filter; creation tests fail on the missing method, then on each wrong answer as it is implemented).

### Rollback/Containment

One commit; reverting it removes the channel. The renderer does not call it yet.

## Milestone 3 - The + button, name field and workflow

### Scope

Spec D1–D4, D6, D8, D9 in the window: plan D7 (adapter and types), D8, D9, D10.

### Changes

- File: `src/app/pipeline-catalog.ts`
  Edit: `PipelineCreationOutcome` and `PipelineCreationRefusal` (plan D7).
- File: `src/adapters/electron/electron-pipeline-catalog-service.ts`
  Edit: `createPipeline(name)` (plan D7).
- File: `src/app/pipeline-creation-workflow.ts` (new)
  Edit: plan D8, with `dispose()` removing its subscription.
- File: `src/app/app-text.ts`
  Edit: the success text.
- File: `src/ui/new-pipeline-field.ts` (new), `src/ui/pipeline-catalog-control.ts`
  Edit: plan D9.
- File: `index.html`
  Edit: plan D10 markup and styles.
- File: `src/app/app-controller.ts`
  Edit: build the workflow when the catalog control exists, and dispose it with the other workflows in shutdown.
- Tests: `tests/unit/pipeline-catalog-control.spec.ts` (built from the control's own factory on the shipped page markup): availability and reason text for each load state; the field opens focused and the button refocuses it; Enter emits `createRequested` with the typed name; Escape closes without emitting and does not reach a document listener; leaving with text emits, leaving empty or a just-refused name closes; each refusal text shows and typing hides it; read-only while waiting; a `load()` while the field is open keeps it and its text; `focusPipeline` focuses the entry. New `tests/unit/pipeline-creation-workflow.spec.ts` with a stub catalog and service: each outcome calls the right control methods and reports, including a thrown call. Adapter answer validation joins that adapter's existing spec file (find it first).

### Validation

Gates: G5.

New or changed tests: each written before its behavior and seen failing on it.

### Rollback/Containment

One commit; reverting it leaves Milestones 1 and 2 in place with no visible change except empty folders being listed.

## Milestone 4 - End-to-end test and manual check

### Scope

Prove the user-visible goal: a user creates a pipeline from the Pipelines panel and sees it in the list, focused, with nothing else changed.

### Changes

- Tests: new `tests/e2e/new-pipeline.spec.ts`, one workflow test: seed the test profile's `app-settings.json` with a temporary `pipelinesRootPath` holding one pipeline with a clip, as `tests/e2e/settings.spec.ts` seeds settings; load that pipeline; click +, type a name, press Enter; check the folder exists on disk, the list shows it focused, and the Collection view still shows the first pipeline; then load the new pipeline and check the grid shows no clips. Refusals and disabled states stay in Milestone 3's unit tests.

### Validation

Gates: G6, G7.

Manual list for G7, in `npm start` with a real top folder: create from the Collection, GIF Extraction and Settings screens; the Visible behavior section's refusal examples; Escape; clicking away with a name; folding with a name typed; disabled button with the top folder cleared, by hover and by keyboard focus; setting the top folder re-enables it; an empty pipeline expands to "No saved collections." and "No clips." and loads. Record findings in Surprises.

### Rollback/Containment

Test-only milestone; any product bug found goes back to the milestone that owns it.

## Milestone 5 - Documentation

### Scope

Keep the agent knowledge base and design record true.

### Changes

- File: `docs/agent-docs/agent-architecture-map.md`
  Edit: through the doc-update skill: the Pipelines catalog paragraph (listing rule, the create request), `WindowsFileNameValidity` as the one Windows name rule, the new workflow in System Shape and Where To Look, and the "Verified against" list.
- File: `DESIGN.md`
  Edit: the Pipelines panel header's + button and the inline name field, in the Application shell refinement section.
- File: `docs/feature-requests.md`
  Edit: remove "New Pipeline" (the file has the user's uncommitted edits; edit only that line and commit only that hunk).

### Validation

Gates: G8.

### Rollback/Containment

Documentation only.

## Rejected alternatives

- R1: Require the compiled rule from `electron/clip-filename-rule.cjs` directly — unit tests run without a build; superseded by D2.
- R2: Write the rule twice, once per process, with a shared test table — keeps two copies, which the user asked to remove; superseded by D1.
- R3: Inject the rule into `ClipFilenameRule` and thread it through every class that builds one — only the renamer needs it; superseded by D3.
- R4: A separate main-process class for creating pipelines — would read the top folder a second way; superseded by D5.
- R5: Check whether the name exists before calling `mkdir` — racy and redundant on Windows; superseded by D5.
- R6: Drop the rule and rely on the operating system's errors — Windows silently creates trailing-dot, device-name and alternate-stream names and words the errors it does raise poorly (see Surprises); superseded by D1.
