# Deliver the Application Shell and Global Surfaces

## Why this matters

Clip Sandbox is growing from one collection-management view into an application with several app screens. This plan implements the revised specification in `docs/specs/application-shell-and-global-surfaces-spec.md` so application navigation, screen commands, side panels, keyboard help, Settings, and operational feedback have durable homes before GIF Extraction adds another editing workspace.

The user-visible goal is: the current Collection workspace sits inside a stable shell whose command levels are clear, whose Pipelines and Clips panels fold smoothly, and whose read-only keyboard map and combined Activity and Errors surface are accessible without interrupting the work in the center.

Production registers two real app screens: the existing Collection screen and a Settings screen for the Pipelines top folder and the default audio preference. Tests and the shell sandbox also exercise a screen with commands and one without them. GIF Extraction remains a later screen registration after its own specification is approved.

## Progress

- [x] (2026-09-06 10:29Z) Feature spec signed off in `docs/specs/application-shell-and-global-surfaces-spec.md`.
- [x] (2026-09-06 10:29Z) Execution plan drafted from the signed spec, `PLANS.md`, `docs/agent-docs/agent-architecture-map.md`, `coding-quality.md`, and the current renderer/test seams.
- [x] (2026-09-06) Revised the spec and plan to include the two-setting Settings screen, clearer app-screen terminology, and component-library evaluation.
- [x] (2026-09-06 12:36Z) Split library selection into candidate research and ecosystem/component evaluation; added Astryx, Semantic UI, and UIverse as mandatory research candidates and adopted a controlled mix-and-match policy.
- [x] (2026-09-06) User explicitly requested execution of the revised plan through MS1, with a stop for input after MS1. This authorizes the current research milestone; do not begin MS2 before that input.
- [x] (2026-09-06) Milestone 1 - Researched 13 external candidates plus the native/local baseline; completed the inventory, source records, exclusions and proposed shortlist. Document validation passed; paused for user input before MS2.
- [x] (2026-09-06) Drafted a bounded side-panel pilot contract from the existing specification: eligibility filter, shared fixture, verification, adaptation-cost and stopping rules. Subsequently revised and approved for the smaller first pass below.
- [x] (2026-09-06) Approved and ran the smaller Web Awesome 3.12.0 first pass in an isolated sandbox. F1/F3/F4/F5 and automated F2 pass; static screenshots inspected. See the evaluation report for evidence and ownership costs.
- [x] (2026-09-07) User reviewed the first pass and approved two-panel/real-grid checks, wider Web Awesome coverage and panel code review. Completed the bounded evaluation and reports.
- [x] (2026-09-07) Verified the user-authorized local panel alternative against the same checks: untouched right panel stays exactly 240 pixels, F1-F8 and real-grid continuity pass. Select local panel implementation direction; end the panel-library comparison.
- [x] (2026-09-07) Milestone 2 - User confirmed the local panel host as the settled choice. Panel-library comparison closed. Remaining motion polish, column-change and lifecycle verification belong to later integration; they are not claimed complete by this decision.
- [x] (2026-09-07) User-authorized keyboard-help popover pilot completed: ordinary behavior passes with 16 nonblank TypeScript lines; interrupted open/close/open fails both integrated and bare Web Awesome 3.12.0. Do not adopt as-is. See the dedicated report.
- [x] (2026-09-07) MS3 production baseline captured: strict typecheck passes, 39 unit/integration files with 169 tests pass, 7 Electron scenarios pass. Logs independently checked after one bounded delegated run.
- [x] (2026-09-07) MS3 integrated sandbox built and automatically verified in default-frame and native-overlay modes: real two-to-three-column transition, card/video continuity, reversal, central screen/command ownership, single-host utility switching/focus and reduced motion. [Report and commands](../research/application-shell-motion-prototype.md).
- [x] (2026-09-07) Milestone 3 - User reviewed the integrated prototype and approved it ("Looks good!"). Accept the demonstrated motion and native-overlay direction for production integration. The response is prototype approval, not a claim that each physical-window interaction was individually tested; retain that checklist for final Windows QA.
- [x] (2026-09-07) Milestone 4 - Production shell and screen-registration API integrated around Collection on master, as explicitly requested. Global Activity separated from Collection commands; stable ids, fullscreen and existing workflows preserved. Strict typecheck, 41 unit/integration files (176 tests), 7 Electron scenarios and targeted two-width production layout/Activity/fullscreen checks pass. Settings remains MS5.
- [x] (2026-09-07) Milestone 5 - Durable settings and the real Settings screen implemented on master. Versioned atomic persistence, native folder choice, failure recovery, screen switching and new-Zoom audio preference are integrated. Strict typecheck and 45 unit/integration files (193 tests) pass; all 9 Electron scenarios pass across the regression run and focused Settings rerun. Actual Electron captures inspected at 1440x900 and 900x650. Folder-choice tests supply the existing test hook; physical native-dialog interaction remains part of final Windows QA.
- [x] (2026-09-08) Milestone 6 - Independent Pipelines/Clips panel hosts and coordinated real-grid motion implemented on master. Empty states only; no video player control. Strict typecheck, 199 unit/integration tests and all 10 Electron scenarios pass. Targeted reversal/width/identity/focus/fullscreen checks and desktop/narrow captures reviewed; physical motion acceptance remains in final Windows QA.
- [x] (2026-09-08) Milestone 7 - Shared global-utility coordination and contextual read-only keyboard map implemented on master. Collection interaction hint removed as explicitly requested. 48 unit/integration files (207 tests), 11 Electron scenarios and strict typecheck pass; Collection/Settings captures inspected.
- [x] (2026-09-08) Milestone 8 - Combined Activity and Errors integrated on master: detailed errors, safe Settings retry, local clipboard feedback, 50 clearable entries plus all unresolved errors, protected focus and keyboard/wheel history navigation. Strict typecheck, 222 unit/integration tests and 12 Electron scenarios pass; actual Electron captures reviewed.
- [x] (2026-09-08) Milestone 9 - Desktop integration, documentation and automated verification implemented on master. Strict typecheck, 222 unit/integration tests, 14 Electron scenarios and overlay sandbox checks pass. Native caption controls verified; user accepted the final review app with "looks good" after the physical-drag check request. MS9 complete.

## Skill Gates

MS7 execution used the existing API/interface, TypeScript, clean-code, refactor, testing, correctness, Impeccable, delegation, documentation and self-review guidance, with `coding-quality.md` governing ownership. User approved MS6 and explicitly requested removal of the Collection interaction hint. No video-player-control work or production dependency adoption is included.

MS6 execution used `using-97`, `before-you-refactor`, `api-and-interface-design`, `typescript-coding`, `writing-clean-code`, `testing-discipline`, `error-and-correctness-traps`, `impeccable`, `build-deploy-and-tooling`, `cost-aware-delegation`, `doc-update` and `pre-commit-self-review`; `coding-quality.md` governed ownership. The existing approved local-panel prototype supplies the motion baseline. The user's master and no-video-player-control instructions govern scope.

MS5 execution used `using-97`, `domain-modeling`, `api-and-interface-design`, `typescript-coding`, `writing-clean-code`, `error-and-correctness-traps`, `security-and-trust-boundaries`, `testing-discipline`, `impeccable`, `doc-update`, `cost-aware-delegation` and `pre-commit-self-review`, with `coding-quality.md` governing ownership and code structure. The user's explicit master instruction governs checkout choice.

Planning-time gates:

- Pilot-contract revision: `working-with-users-and-team` governed the narrower decision and stopping rules; `testing-discipline` governed observable acceptance and shared test data; `build-deploy-and-tooling` governed dependency eligibility and adoption limits. `coding-quality.md` governed the distinction between application integration and replacement of library behavior. The first pass adds only isolated sandbox runtime code, with no production API changes. Implementation also used using-97, typescript-coding, writing-clean-code, error-and-correctness-traps, security-and-trust-boundaries, impeccable and pre-commit-self-review. Cost-aware-delegation retained this small task with the root; the agreed sandbox supplies isolation. The Impeccable context helper could not execute on this host; DESIGN.md and the written new-work/craft-floor guidance supplied the visual context.
- `impeccable`: governed the approved visual direction, command hierarchy, utility surfaces, and motion quality targets recorded in the feature spec and comps.
- `working-with-users-and-team`: governed the requirements refinement and the explicit boundary between this shell plus Settings and the later startup, pipeline-content, clips-content, and extraction specifications.
- `api-and-interface-design`: governed the narrow app-screen registration, settings, utility, and error interfaces; caller sketches and consumer-level tests are required before signatures are finalized.
- `build-deploy-and-tooling`: governs broad candidate discovery, whole-library health comparison, dependency cost/license/upgrade review, and any single- or mixed-library adoption decision.
- `domain-modeling`: governs the canonical `AppSettings` value and the explicit choice to persist it as one small versioned document rather than a database or scattered preferences.
- `typescript-coding`: governs the planned TypeScript screen/settings boundaries, immutable values, typed expected failures, strict parsing, and direct module imports.
- `before-you-refactor`: governed the staged migration of the existing toolbar, activity control, DOM fixture, and app-controller wiring; a passing baseline and small reversible steps are mandatory.
- `testing-discipline`: governed the behavioral test split among focused controllers, app integration, Electron E2E, and manual perceived-motion QA.
- `doc-update`: identified `docs/agent-docs/agent-architecture-map.md` as a required implementation deliverable once the shell creates durable UI ownership boundaries.
- `using-97` and `coding-quality.md`: supplied the repository trigger map and normative local rules: framework-free renderer, explicit stateful controllers, thin composition root, and no speculative abstraction.

Execution-time gates:

- MS1 applied `cost-aware-delegation` to two bounded official-source research packets, `build-deploy-and-tooling` to candidate costs and lifecycle assessment, and `using-97` plus `coding-quality.md` to preserve the framework-free ownership constraints. `pre-commit-self-review` governed the final document/scope review. No runtime, API, refactor, or test-writing gates were activated because MS1 changes research documents only; production adoption/build/deploy checklist items do not apply yet.
- `using-97`: re-evaluate the actual files in each milestone before editing and activate any newly relevant project skills.
- `before-you-refactor`: use before moving the static toolbar into the shell or replacing the current activity control; capture baseline tests first and preserve stable selectors during migration.
- `api-and-interface-design`: use before committing the exported app-screen, settings-service, shortcut descriptor, activity/error, or panel callback shapes.
- `domain-modeling`: use before finalizing the persisted settings shape or adding another preference to it.
- `typescript-coding`: use for every TypeScript milestone, especially settings parsing, error results, dependency interfaces, and tests through real seams.
- `testing-discipline`: use before adding each controller test, app integration fixture, animation-state test, or E2E scenario; first prove the intended test fails for the missing behavior.
- `error-and-correctness-traps`: use before implementing clipboard failure, retry failure, animation interruption, timers, and transition completion/fallback paths.
- `security-and-trust-boundaries`: use before adding clipboard access or changing Electron window options; keep Node and Electron APIs out of renderer controllers.
- `build-deploy-and-tooling`: use if the Electron window configuration, build inputs, or package scripts require more than a local `BrowserWindow` option change.
- `doc-update`: use after durable screen/shell/activity ownership lands, before editing the canonical architecture map.
- `impeccable`: use for implementation polish and finish review against the approved comps, especially hierarchy, density, static keycap affordance, overflow cues, and motion.
- `pre-commit-self-review`: use before declaring the implementation complete; review the full diff, test evidence, architecture guidance, and unrelated dirty-worktree boundaries.

Unavailable skills or fallbacks:

- None. All expected project-local skills are available.

## Surprises & Discoveries

- Discovery (MS1): current runtime activity can conceal an older ready-made component catalog. FAST Element's registry latest is 3.0.2 (2026-07-29), whereas `@microsoft/fast-components` remains 2.30.6 (2022-05-06). Zag has a published vanilla adapter despite framework-led installation documentation; its stable 1.43.3 and 2.x prerelease families must be kept distinct.
  Evidence: [candidate research](../research/component-library-candidates.md), with dated official registry and repository links.

- Discovery (MS1): Spectrum is developing a separately versioned Gen2 while its stable Gen1 packages remain at 1.12.2. Web Awesome's Combobox is Pro; its Data Grid and Video are both Pro and experimental. These are lifecycle and future-coverage costs, not reasons to count those components as verified free/stable capabilities.
  Evidence: [Web Component evidence](../research/component-library-web-components-evidence.md), independently checked against official release guidance, registry metadata and catalog labels.

- Discovery: the current renderer has one static toolbar that mixes collection commands, collection selection, clip count, and activity status.
  Evidence: `index.html` lines 352-378 and `src/ui/main-toolbar-control.ts`.

- Discovery: the normal grid subtracts the current toolbar height when calculating its available height, so moving commands into a screen command bar changes a live layout dependency.
  Evidence: `src/ui/clip-collection-grid-controller.ts` stores `toolbar` and uses its bounding height in `layoutMetrics()`.

- Discovery: panel width changes will not naturally trigger the current window-resize path, while recomputing the grid only after a panel transition could create the second visible snap prohibited by the signed spec.
  Evidence: `src/app/event-binding.ts` listens to window resize, and `ClipCollectionGridController` calculates layout from the current grid-root width. Milestone 3 therefore proves a coordinated strategy before production wiring.

- Discovery: `ActivityIndicatorControl` already owns state, recent history, error auto-open, and success timers, but its history is capped at five simple text entries and it has no detailed errors, resolution state, focus model, or keyboard scrolling.
  Evidence: `src/ui/activity-indicator-control.ts` and `tests/unit/activity-indicator-control.spec.ts`.

- Discovery: the current app uses the operating system frame. The approved visual reference places content beside native window controls, so replacing them with custom minimize/maximize/close buttons is unnecessary and would add IPC and accessibility risk.
  Evidence: `electron/main.cjs` creates a default framed `BrowserWindow`. The plan evaluates Electron's native title-bar overlay on Windows while retaining native controls.

- Discovery: Settings and GIF Extraction are intentionally outside the signed shell feature, and production currently has only the Collection screen.
  Evidence: this was true in the first signed draft, but the user subsequently identified two concrete settings and brought Settings into the revised scope. GIF Extraction remains later work.

- Discovery: the existing renderer hard-codes clip videos as muted in both the multi-clip grid and Zoom, while Zoom already allows a session-only audio toggle.
  Evidence: `src/ui/clip-collection-grid-controller.ts`, `src/ui/zoom-overlay-controller.ts`, and `tests/integration/ui/zoom-overlay-controller.spec.ts`. The new default applies to newly opened single-clip playback; the multi-clip grid stays muted.

- Discovery: the initial Web Awesome, Spectrum, and Vaadin examples were a preliminary tree-oriented sample, not a justified candidate universe. The evaluation must first derive a longlist from the full component inventory and whole-library criteria.
  Evidence: user review on 2026-09-06 expanded the question from “which tree control works?” to “which small set of healthy component ecosystems can support the product as it grows?”

- Discovery: the three user-nominated candidates represent materially different adoption models. Astryx presents a large cohesive React/TypeScript system with source-ejection capabilities; Semantic UI describes a broad themable HTML/CSS/JavaScript framework; UIverse is a community gallery whose elements are copied as HTML/CSS, Tailwind, React, or Figma rather than consumed as one governed runtime library.
  Evidence: the official Astryx repository, Semantic UI site, and UIverse site scraped on 2026-09-06. All three remain mandatory research inputs; their category differences are evaluation data, not grounds for silently omitting them.

- Discovery: fullscreen review currently hides `.toolbar` and treats the grid as the full viewport. The shell migration must preserve that behavior by hiding all shell chrome, not only the new global bar.
  Evidence: `index.html` fullscreen selectors and `src/app/fullscreen-session.ts`.

## Decision Log

- Decision (2026-09-08 / Codex): integrate the approved Windows overlay using native caption buttons and CSS safe-area/drag regions. After building, `npx electron . --native-frame` restores the default frame independently. Other platforms retain their default frame. The user accepted the final review after the explicit physical-drag check request.
- Decision (2026-09-08 / Codex): retain synchronous production screen activation and the existing cancelable utility entrance. Do not add delays or a screen fade merely to reach illustrative timing targets; the acceptance behavior is immediate, nonblank content and correct final focus.

- MS4 implementation (2026-09-07): user explicitly chose continued work on master. Three caller sketches (Collection with commands, Settings without, future Extraction with commands) became contract tests before implementation. `AppScreen` declares identity, label, mounted content, nullable commands, immutable shortcut descriptors and synchronous initial focus. The shell accepts a nonempty registration tuple; no dynamic lifecycle/API was added without a current caller. Activation is synchronous and leaves no stale queued requests. Production registers Collection only. Its grid supplies allocated content height via a narrow optional callback; fullscreen and other callers keep prior metric behavior. Commands retain ids/name while the unused Activity reference was removed from MainToolbarControl. No production component dependency added.
- MS4 verification/guidance (2026-09-07): baseline from MS3 retained; new contract initially failed for missing implementation, then seven new contract/focus/height checks passed. Full unit/integration and Electron suites passed; production Electron captures at 1440/800px and Activity/fullscreen were inspected. Architecture map updated via doc-update. API/interface, refactor, TypeScript, clean-code, testing, tooling, correctness/security and review guidance applied. One Luna delegation migrated two existing test fixtures; root inspected it and reran the full suite. Outcome: success, small verification cost, no production rework from delegation. Native frame, panel animation, Settings persistence and utility migration remain later milestones; no claim they shipped in MS4.

- Approval (2026-09-07): user accepted the integrated MS3 prototype with "Looks good!". The prototype review gate is cleared. Proceed next with MS4 shell structure and screen registration; preserve the current Collection behavior. Native overlay remains a sandbox option until its planned production integration in MS9, with final Windows QA retained.

- MS3 prototype (2026-09-07): reuse the existing evaluation sandbox and generate `shell.html`; no second dependency setup or production edits. Candidate motion method is precomputed destination card geometry with CSS interpolation and one settled reconciliation. Single Web Awesome utility host uses a stable anchor plus public offset, avoiding anchor-rebinding hide/focus loss; requests during closing wait for after-hide. Default production frame remains unchanged pending physical title-bar review. Production grid promotion requires reconciling its metric/current-column bookkeeping through an allocated-bounds contract. See [scope, evidence, limitations and skill/delegation record](../research/application-shell-motion-prototype.md). MS4 has not started.

- Pilot result (2026-09-07, user-authorized Spectrum comparison): completed one Gen1 1.12.2 keyboard-help pilot using the same surface and ordinary acceptance behaviors. Passes with 17 nonblank local TypeScript lines; no clear popover advantage over Web Awesome. A fixed roughly 100ms Escape/Enter sequence can miss reopening while focus is returning; 200/350ms trials pass. Measured bundled JS is 455,953 bytes including dark/medium theme versus WA's 71,171. Retain Spectrum as a viable tested alternative; stop comparison here and review the result before the integrated prototype. No paid controls, production adoption, broader comparison or panel reconsideration. [Evidence, scope and governing skills](../research/spectrum-keyboard-help-evaluation.md).

- Constraint (2026-09-07, user stated): no purchased controls. Evaluate only components available without paid licenses; exclude Pro/commercial-only controls from usable coverage and proposed dependencies. In particular, Web Awesome Combobox, Data Grid and Video cannot satisfy our inventory under this constraint. A library may still qualify through its free components; any missing behavior must be stated explicitly rather than assuming a future purchase.

- Decision (2026-09-07, testing lesson): UI evaluation gates must follow user-perceivable consequences in actual workflows. Synthetic failures are diagnostic evidence, not automatic adoption vetoes. Persisted the general rule in AGENTS.md under Goal-based verification. Preserve explicit correctness/accessibility requirements and record reachable edge cases without guessing their frequency.

- Proposed next step (2026-09-07): move from isolated component evaluation to the existing MS3 integrated shell prototype. Reuse the selected local panels and provisionally reuse the Web Awesome keyboard-help pilot; add the representative Activity surface only to verify actual utility switching, focus, dismissal and workspace continuity. Keep the known fast-keyboard race recorded. Use this concrete experience to decide whether the popover needs mitigation before adoption, rather than starting another library comparison. Real-grid column changes remain an MS3 acceptance question. This proposal does not approve production dependency adoption or mark unperformed checks complete.

- Decision (2026-09-07, popover control-input follow-up): retain Web Awesome as a candidate with a documented fast-keyboard defect; adoption remains unresolved. This qualifies the earlier categorical rejection after the user reported successful ordinary use. All six rapid-click trials pass; Escape then Enter fails twice at measured 107–116 ms but passes twice each at the 200/350 ms settings. This establishes reachability, not frequency. No runtime patch or local replacement authorized by this finding.
  Evidence: [control-input results](../research/keyboard-help-popover-evaluation.md#follow-up-actual-control-input).

- Decision (2026-09-07, popover pilot): do not adopt Web Awesome Popover 3.12.0 as-is for global utilities. A stale asynchronous close hides a later requested open; a bare-component reproduction rules out our focus/ARIA handlers. Stop at this concrete limitation without patches or broader comparison. The local panel choice stays settled.
  Evidence: [keyboard-help evaluation](../research/keyboard-help-popover-evaluation.md). U1-U5 pass; U6 fails and is retained. Existing implementation/testing/Impeccable/tooling/review skill gates apply; the small coupled task stayed with the root.

- Decision (2026-09-07, user confirmed): the local panel host is selected; do not reopen the panel-library comparison without a new concrete requirement or failure. Web Awesome adoption for other controls remains a separate decision. This confirmation settles implementation choice, not unperformed production QA.

- Decision (2026-09-07, local verification): build the narrow panel host locally. The same motion assertion passes with explicit pixel grid tracks and still fails for the preserved Web Awesome integration. Local interaction code is 32 nonblank TypeScript lines, plus five layout CSS rules over the shared fixture styles.
  Rationale: removes reciprocal sizing state while retaining the focus/fold logic already owned locally. Both real-grid checks preserve DOM and playback; neither proves column-count transitions. No second library pilot is needed. Other Web Awesome controls remain independent decisions. See [comparison](../research/component-library-evaluation.md).

- Decision (2026-09-07): stop the extended Web Awesome pilot at the independent-motion failure. Keep the failing assertion and qualified code review; do not install a fallback or patch the library during this pass.
  Rationale: endpoint checks passed, but frame sampling exposed transient right-panel growth. The isolated real-grid check preserves DOM/video playback, without proving column-count transitions. Catalog coverage remains useful evidence, not a substitute for this gate. See [current evaluation](../research/component-library-evaluation.md), [coverage](../research/web-awesome-coverage-evidence.md) and [code review](../research/web-awesome-panel-code-review.md).

- Decision (2026-09-06, approved first pass): permit small public collapse wiring and remove speculative time ceilings. Run one left-panel fixture with static workspace; defer broader checks and real-grid integration until review.
  Rationale: user approved a smaller, economical check. Web Awesome 3.12.0 passed the automated first pass with a 32-nonblank-line adapter; continuous-motion appearance remains unverified. Its layout support is useful, but most folding behavior remains local. Stop with a promising result, not production selection. See [evaluation evidence](../research/component-library-evaluation.md).

- Decision (MS1): propose Web Awesome, Spectrum Web Components, Zag, and the native/local baseline for the first comparable MS2 spikes. Keep Lion and Vaadin as reserves and Floating UI DOM as a conditional positioning exception. Keep Astryx, Semantic UI, UIverse and all other researched exclusions visible with reasons and confidence.
  Rationale: the shortlist compares meaningfully different styling and behavior ownership models against the full control inventory. It does not select a production library or exclude candidates merely for lacking a tree. See [candidate research](../research/component-library-candidates.md). User input is required before MS2 by the explicit stop instruction.
  Date/Author: 2026-09-06 / Codex

- Decision: call the concept an **app screen** in product and plan language, and implement a concrete app-screen registration API with a DOM root, optional command-bar root, declared initial-focus callback, and read-only shortcut descriptors; do not introduce a router or screen-type switch.
  Rationale: the shell needs a small framework-free call surface and the signed spec explicitly forbids boolean mode flags and shell knowledge of screen internals.
  Date/Author: 2026-09-06 / Codex

- Decision: register Collection and Settings as real production app screens. The global Settings control activates the same Settings registration available through screen navigation.
  Rationale: the Pipelines top folder and single-clip audio default give Settings sufficient real scope; no placeholder destination is needed.
  Date/Author: 2026-09-06 / Codex

- Decision: keep Pipelines and Clips as shell-owned hosts with honest empty/content-pending states; do not implement discovery, tree contents, locked clips, or drag/drop in this plan.
  Rationale: fold mechanics and layout ownership are shared shell behavior; panel data and domain operations belong to their separately specified features.
  Date/Author: 2026-09-06 / Codex

- Decision: keep panel fold state in memory for the current application session and default both panels open on launch.
  Rationale: even though this plan now adds a settings store, panel persistence is not yet a user-facing setting and should not be smuggled into the durable schema without a product decision.
  Date/Author: 2026-09-06 / Codex

- Decision: persist the two approved settings behind a narrow application-facing settings service; default single-clip audio to off, preserve multi-clip grid muting, and do not replace the current loaded session merely because its configured root changes.
  Rationale: Settings must be functional across restarts, but the shell feature must not invent pipeline discovery/reload semantics or create overlapping autoplay audio.
  Date/Author: 2026-09-06 / Codex

- Decision: discover the candidate universe before selecting the deep-evaluation shortlist. Astryx, Semantic UI, and UIverse are mandatory candidates because the user named them; Web Awesome, Spectrum, and Vaadin remain seed leads rather than preselected finalists.
  Rationale: starting with a tree-only shortlist would bias the result toward one immediate control and ignore ecosystem quality, breadth, reputation, and future needs.
  Date/Author: 2026-09-06 / Codex

- Decision: prefer one primary component ecosystem plus local components. Permit a secondary library or copied standalone component only when it is demonstrably superior for a specific need, adds acceptable dependency/maintenance cost, and passes a visual-normalization review against `DESIGN.md`.
  Rationale: a small coherent set reduces design and maintenance noise, while an absolute single-library rule would reject genuinely exceptional specialized components.
  Date/Author: 2026-09-06 / Codex

- Decision: evolve and rename the current activity controller in place rather than create a parallel error owner.
  Rationale: current status callers and error auto-open behavior can migrate through one compatibility surface, satisfying the signed requirement for one operational entry point.
  Date/Author: 2026-09-06 / Codex

- Decision: retain session-only history, bound resolved/non-error history to 50 entries, and never evict unresolved errors because of that bound.
  Rationale: this is the smallest extension that permits meaningful scrolling and prevents ordinary history growth without inventing durable notification storage or silently dropping actionable failures.
  Date/Author: 2026-09-06 / Codex

- Decision: use an injected clipboard writer for technical details and keep all renderer controls independent of Electron APIs.
  Rationale: the browser clipboard adapter can be tested for success and failure while preserving context isolation and the repository's adapter boundary.
  Date/Author: 2026-09-06 / Codex

- Decision: use native title-bar overlay only if the Windows prototype preserves native controls, drag/maximize behavior, accessible control placement, and a safe fallback. Do not build custom window controls in this feature.
  Rationale: the approved grouping can be achieved without new privileged IPC, while the default frame remains a safe containment path if overlay behavior is poor.
  Date/Author: 2026-09-06 / Codex

## Outcomes & Retrospective

MS9 (2026-09-08): production now uses the approved native Windows overlay with an independent default-frame fallback. Existing workflows and new desktop checks pass from a clean build. The panel fixture now specifies content dimensions so the assertion continues to exercise a real column change across frame modes. No production dependency or custom window IPC was needed. The user accepted the final review app with "looks good" after the physical-drag check request, closing MS9. Automated drag had moved neither overlay nor default-frame baseline; user acceptance, not that inconclusive probe, closes the gate.

Popover input follow-up (2026-09-07): 10 of 12 control-input trials pass. The two fast Escape/Enter trials reproduce the hidden-but-open state with real browser keyboard events. All rapid pointer trials pass. Refined the verdict to a candidate with a specific edge-case constraint; no runtime implementation changed. Existing testing/review guidance governed the bounded reproduction.

Keyboard-help pilot (2026-09-07): Web Awesome supplies useful positioning, dismissal and initial focus. Public events require little local ARIA/return-focus code. However, the interrupted transition contract fails with open=true and a closed native dialog. The source and bare reproduction support an upstream race. The bounded evaluation is complete; utility adoption remains unresolved. Production and root dependencies remain unchanged.

Local verification (2026-09-07): implemented only the user-approved alternative in the sandbox. The shared panel and real-grid checks pass, including the formerly failing independent-motion assertion. The unchanged Web Awesome path still fails it, confirming the oracle remains discriminating. Static appearance inspected; direct continuous-motion review and later production integration remain. End the panel comparison with the local implementation direction. Existing implementation/testing/review skill gates governed this change; no production architecture documentation changed.

Extended evaluation (2026-09-07): static two-panel checks and the bounded real-grid continuity check pass; the new untouched-panel-width motion assertion fails by about 20.53 pixels. Keep MS2 open. Coverage maps all 17 inventory families; code review reproduces an upstream orientation-change defect outside the fixed-horizontal shell path. No library patch, production edit or second-candidate installation. One bounded research delegation produced a partial draft before a usage-limit error; root verification corrected three claims. Savings are inconclusive. Existing skill gates plus before-you-refactor governed reuse of the local adapter; no durable architecture changed.

First-pass outcome (2026-09-06): the user approved the reduced MS2 contract. The isolated Web Awesome pilot passes the automated geometry, reversal, keyboard/focus, reduced-motion and runtime checks, including strict TypeScript. Static screenshots were inspected. Continuous-motion visual acceptance remains unverified; opposite-side/resize/rapid-sequence and real-grid work is deferred. The [evaluation report](../research/component-library-evaluation.md) records exact commands, artifacts, local/library responsibilities and remaining selection uncertainty. Production implementation has not started.

MS1 research has produced the [candidate report](../research/component-library-candidates.md), covering 13 external candidates plus the native/local baseline, the full immediate/future control inventory, dated source evidence, classification, exclusions, confidence, and a proposed MS2 shortlist. Supporting records retain the nominated-candidate and Web Component evidence. Production implementation has not started. No packages were installed, manifests changed, or application tests/builds run for this research-only milestone. Electron, motion, accessibility, imported size and strict TypeScript behavior remain MS2-and-later validation; none are claimed from documentation alone.

MS1 verification (2026-09-06): the prescribed `rg` criteria scan found every mandatory name and criterion. Direct document validation checked 12 local Markdown links with zero broken targets and all four changed/new documents for BOM-free UTF-8 and trailing whitespace, with no issues. Official package metadata, framework requirements, selected issue/PR evidence and Spectrum generation boundaries were independently spot-checked. `git diff --quiet -- package.json package-lock.json src electron index.html` returned 0. Whole-worktree `git diff --check` found pre-existing trailing whitespace at `docs/feature-requests.md:11`; it was left untouched. Final review against `coding-quality.md` found no architecture deviation in this research-only change. Adjacent issues: none in the touched document sections. This was the MS1 stop point; subsequent approved MS2 work is recorded above.

Do not call this specification fully delivered merely because controller tests pass. Completion requires real Collection/Settings switching in Electron, persisted settings, the current Collection workflow to remain intact, and the primary panel and utility transitions to pass manual Windows QA.

## Context and orientation

Clip Sandbox is a framework-free Electron app. `electron/main.cjs` creates the desktop window, `index.html` contains the static renderer DOM and CSS, and `src/app/app-controller.ts` resolves that DOM and composes UI controllers. TypeScript builds into `build/src/...`; `index.html` loads emitted JavaScript.

The current Collection workspace is not yet represented as a main screen. Its top commands and global status share `#toolbar`, while dialogs and `#gridWrap` follow the toolbar in the document. `src/ui/main-toolbar-control.ts` renders collection-specific state. `src/ui/clip-collection-grid-controller.ts` renders clip cards and uses the toolbar height and grid-root width to compute layout. `src/app/fullscreen-session.ts` and fullscreen CSS hide the toolbar and expand the grid.

`src/ui/activity-indicator-control.ts` is the current operational feedback owner. `src/ui/load-status-control.ts`, `src/app/app-controller.ts`, and edit workflows call it through progress/success/error methods. Its existing auto-open-on-error behavior and current callers must survive the migration.

`src/app/app-keydown-handler.ts` and `src/app/fullscreen-session.ts` currently own keyboard actions. The keyboard map is documentation of active shortcuts, not an editor. Shortcut descriptors must be immutable presentation data co-located with the handlers they describe closely enough that tests can detect drift; this plan does not create a remapping system.

The tests are split among focused Vitest files under `tests/unit/`, DOM/controller integration under `tests/integration/`, and real Electron scenarios in `tests/e2e/scenarios.spec.ts`. `tests/unit/app-dom.spec.ts` and `tests/integration/app/app-controller.spec.ts` contain static DOM fixtures that must move with `index.html` instead of becoming divergent miniature apps.

Definitions used below:

- An **app screen** is a primary destination such as Collection, Settings, or future GIF Extraction. It registers a stable id and label, its content element, an optional command-bar element, shortcut descriptions, and a callback that focuses the screen's meaningful entry point after activation.
- A **global utility surface** is an anchored temporary panel opened from the global bar. Only Keyboard shortcuts or Activity and Errors may be open at one time.
- A **reveal rail** is the slim named control left at the window edge while a side panel is folded.
- A **settled-bounds callback** fires once when a panel transition reaches its final width so expensive screen-specific layout work is not repeatedly forced throughout animation.
- **Reduced motion** means the `prefers-reduced-motion: reduce` media query substantially shortens/removes spatial animation without changing final state or focus behavior.

Existing validation entry points:

- `npm run typecheck` runs normal and strict TypeScript checks.
- `npm run unit` runs Vitest unit and integration tests.
- `npm run e2e` builds and runs Playwright against Electron.
- `npm run test:all` runs Vitest and Electron E2E.
- `npm start` builds and opens the real desktop app for manual Windows QA.

## Milestone 1 - Component-library candidate research

### Scope

Produce a justified longlist before choosing libraries to prototype. Research the wider ecosystem against Clip Sandbox's framework-free Electron architecture, approved visual system, immediate controls, and likely future component needs. This milestone selects candidates for evaluation; it does not adopt dependencies.

The inventory must cover at least: hierarchical tree/navigation, foldable or split panels, drag/drop targets, buttons and icon buttons, selects and searchable comboboxes, switches, fields, dialogs, menus, popovers, tooltips, status/progress, tabs, virtualized lists or grids, keyboard-command surfaces, and primitives suitable for future media-editor controls.

Classify candidates so unlike products are not compared as though they had the same ownership model:

1. cohesive runtime component systems,
2. framework-agnostic Web Component systems,
3. behavior/headless primitives,
4. copy-and-own source libraries or galleries,
5. specialized single-component libraries,
6. a native/local implementation baseline.

Mandatory user-nominated candidates:

1. [Astryx](https://github.com/facebook/astryx),
2. [Semantic UI](https://semantic-ui.com/),
3. [UIverse](https://uiverse.io/).

Seed leads, not predetermined finalists:

1. [Web Awesome](https://webawesome.com/),
2. [Spectrum Web Components](https://opensource.adobe.com/spectrum-web-components/),
3. [Vaadin Web Components](https://github.com/vaadin/web-components).

### Changes

- File: `docs/research/component-library-candidates.md`
  Edit: document the search method, dated sources, complete control inventory, classification scheme, longlist, exclusion reasons, and shortlist. For every candidate capture framework/runtime requirements, ownership model, library breadth, theming approach, accessibility claims/evidence, license, governance/maintainer identity, release cadence, recent commit activity, issue/PR responsiveness, security policy, documentation quality, community/adoption signals, upgrade/migration history, and Electron/offline plausibility.

- File: `docs/research/component-library-candidates.md`
  Edit: distinguish evidence from inference. Popularity alone is not quality; recent commits alone are not healthy governance; a large catalog alone is not useful breadth. Record concerns such as dormant releases, single-maintainer risk, framework migration, copied-source maintenance, commercial tiers, or unclear asset licenses.

- File: `docs/plans/application-shell-and-global-surfaces-exec-plan.md`
  Edit: record the resulting shortlist and why it represents meaningfully different strong options. Keep all three user-nominated candidates in the report even if architectural incompatibility prevents a runtime spike.

### Validation

- Command: `rg -n "Astryx|Semantic UI|UIverse|framework|license|release|maintenance|accessibility|theming|component coverage|shortlist" docs/research/component-library-candidates.md`
  Expected: the research artifact contains every mandatory candidate and every required whole-library criterion.

- Review: compare the longlist against the product's immediate and future control inventory.
  Expected: no candidate is shortlisted solely because it has a tree control, and no candidate is excluded solely because it lacks one if its wider ecosystem or exceptional components remain relevant.

- Review: verify claims about versions, activity, governance, licensing, and documentation against official sites, package registries, and source repositories on the research date.
  Expected: each shortlist/exclusion decision has linked evidence and an explicit confidence level.

### Rollback/Containment

This milestone changes research documents only. Do not install candidate packages or copy gallery components into production. If the longlist is too broad for meaningful comparison, refine the control inventory and classification first rather than choosing familiar names by intuition.

## Milestone 2 - Small side-panel first pass

### Status and decision

Follow-up status (2026-09-07): user subsequently authorized the opposite panel, limited real-grid check, coverage inventory and code review. Those are recorded above; the reproduced motion failure prevents acceptance. The following contract preserves the initial scope and stopping principles.

User approved the smaller first pass and instructed revision and execution. This supersedes the previous draft's built-in-collapse requirement, two-panel benchmark and speculative 60/120-minute ceilings. It does not authorize production adoption or expansion into the real grid before reviewing the first-pass result.

Question: can a candidate supply a useful docked panel with simple supported collapse wiring and acceptable design adaptation? Passing qualifies it for further evaluation, not the entire catalog for adoption.

### Eligibility and order

Use MS1 research plus one focused official-source check per plausible candidate. Record exact stable package/version/generation, license/tier, public panel sizing/motion/styling surfaces, and remaining local work. A docked panel must change adjacent workspace width. An overlay-only drawer does not qualify.

Built-in collapse is preferred but not mandatory. Setting a public position, changing an ordinary CSS width, mapping public CSS properties/parts, and supplying a reveal button can be reasonable integration. Reject approaches requiring private internals, a package patch, a replacement animation engine, substantial duplicated interaction logic, or rebuilding the component. An unproven but concrete public CSS/API path is a valid hypothesis for the small pilot; it is not a documented guarantee.

Retain the existing breadth check for dialogs/menus/popovers, searchable selection and hierarchical navigation, including paid/experimental gaps. Do not implement them. Evaluate at most two candidates, sequentially. First choice: Web Awesome Split Panel; fallback: Spectrum Gen1 Split View, only if a failure or named concern justifies it. Confirm versions and public seams before installation. Zag's behavior/DOM integration burden and Spectrum's generation transition remain comparative concerns from MS1.

### First-pass fixture and changes

Create only `sandbox/component-library-evaluation/` and `docs/research/component-library-evaluation.md`; keep this plan current. Root manifests, production imports, grid code and global tools stay unchanged. The sandbox is the agreed isolation boundary; a new worktree is unnecessary for this disjoint experiment amid uncommitted planning files.

Use one left panel, one static workspace and fold/reveal buttons. Start at 1440 x 900 renderer CSS pixels; use a 240-pixel open panel and a 36-pixel folded rail, with no inter-column gap. A static command row and inert numbered tiles make width/alignment visible. These are repeatable fixture choices, not permanent product dimensions. Use DESIGN.md's existing colors/type/radius/focus treatment and simple labels. No real video, second panel, tree, drag/drop, Settings, keyboard map, utility surface, persistence or screen switching.

Use full-travel opening 280 ms and closing 240 ms, consistent with spec section 12.4; CSS may shorten a reversal. Reduced motion removes spatial animation. Small local state/focus wiring is allowed, but the implementation must disclose exactly what the library supplies and what remains ours.

Install the selected exact package with scripts disabled under the sandbox only. Reuse repository Electron, TypeScript and Playwright tools; any extra build dependency must be isolated and justified. Add a minimal build/typecheck command, Electron launcher and focused check script with exact commands in the report. No general multi-candidate adapter framework or frame-trace analysis system.

### Frozen first-pass verification

The goal is to fold/reveal a docked panel smoothly while giving width to the workspace, preserving reachable focus and respecting reduced motion, with small supported integration code. Requirements derive from spec sections 6.3, 12.1, 12.4, 12.5 and 13.5. Later full-shell criteria are deferred, not waived.

| Check | Action and expected result | Evidence |
|---|---|---|
| F1 width | Fold then reopen. Workspace gains 204 pixels and returns; folded rail remains 36 pixels; region edges meet within 1 CSS pixel. | A few real-Electron geometry assertions; open/folded screenshots. |
| F2 motion/reversal | Fold; reverse while between endpoints. Workspace and panel move together from the current position; latest request wins without snap or queued movement. | Simple intermediate/final geometry assertions and direct motion inspection. No fixed sleep as an implementation fix; test waits may observe animation. |
| F3 keyboard/focus | Enter folds, Space reveals. Named controls expose aria-expanded/aria-controls. Hidden panel content is not tabbable. Focus transfers from the disappearing control/content to the reveal button and back to the fold button on reveal. Unrelated workspace focus is not stolen by programmatic folding. | Focus/ARIA assertions and keyboard exercise. |
| F4 reduced motion | Enable reduced motion, fold and reveal. Same geometry/focus outcomes; no spatial transition or dependency on transitionend. | Computed style and geometry/focus checks. |
| F5 adaptation/runtime | Apply existing theme, reload/run with network blocked, exercise the control. No private styling, failed required assets, renderer errors or privileged renderer access; sandbox source typechecks. | Short code review, screenshots and runtime/typecheck results. |

Freeze the assertions before writing interaction code. Demonstrate missing behavior fails first; do not build a fault-injection framework. Automated geometry cannot certify perceived smoothness: report manual observation separately. If available tools cannot observe continuous motion, preserve a replay and label the visual gate unverified rather than claiming it passed.

### Cost and stopping rules

No speculative duration estimates or long time allowances. Record the authored integration code and responsibilities, simple styling changes, package choice and verification commands. Identify harness effort separately; a small line count does not excuse replacing the library's behavior.

1. Start with documented setup, basic styling and minimal collapse wiring. Use a few focused assertions and direct inspection, not the former broad test matrix.
2. Correct an obvious local setup/wiring mistake once when the fix is clear. If a check requires substantial investigation, private APIs or replacement behavior, stop that candidate and record the obstacle before spending more effort. Do not keep layering workarounds.
3. If the first candidate passes this small check with acceptable integration, stop and present it as promising. Do not automatically implement the second. Use the fallback only when the first fails or a concrete unresolved concern could change selection, and explain that concern first.
4. If both are unsuitable or inconclusive, report no selection. Do not expand the candidate universe or build a third local implementation without review.
5. A passing first pass still needs opposite-side/independence checks, narrow/resize cases, rapid sequences and settlement behavior before panel acceptance. Add those only after reviewing promise; do not label them already proven.
6. Keep the real-grid check for the provisional winner only. Reuse the pilot in MS3 after review, verify playback/DOM continuity and absence of a second layout snap, and distinguish grid-specific failure from candidate failure. No full-grid integration in the initial first pass.
7. No automatic return to a full-catalog comparison. Any next control needs a named uncertainty and a bounded check. No production dependency until the selected component and its license, assets, upgrade owner and removal path are accepted.

### Validation and containment

The report records F1-F5 as pass, fail or unverified, with links to actual artifacts and exact commands. A promising result with an explicitly unverified visual gate is not complete panel acceptance. Test only the isolated pilot for this change; do not run the unrelated full application suite. Preserve failed evidence and existing user files. Runtime experiments remain in the sandbox and can be removed without reverting application code.

## Milestone 3 - Baseline and motion prototype

### Scope

After the reviewed MS2 first pass and any agreed panel follow-up, perform the real-grid portion only for the provisional winner, reusing its panel fixture. Do not repeat panel-library selection here. The remaining baseline, screen/utility-motion and native-title-bar work below stays separate and starts only after the panel gate's review; it is outside the initial first pass.

Record the current behavior before refactoring and use an isolated sandbox to select the simplest panel/workspace animation that remains smooth when the current grid changes width. Also evaluate native title-bar overlay without committing the production window to it.

### Prototype

Hypothesis: CSS-controlled shell columns can animate the panel, reveal rail, and central width as one transition, while a single settled-bounds notification can preserve the grid's final layout without a visible second correction. If the current grid changes column count, a View Transition or a precomputed target layout may be needed; choose the smallest technique that is interruptible and has a reduced-motion fallback.

How to run: build `sandbox/application-shell-demo.html` with two fake screens, open/fold controls, representative clip-grid blocks, both utilities, and a rapid-toggle harness. Open it in the existing Electron/browser development workflow and test normal motion, reversal halfway through, rapid screen changes, and reduced motion. Separately launch a temporary Electron window option or narrowly guarded demo path to evaluate `titleBarStyle: 'hidden'` plus `titleBarOverlay` on Windows.

Pass signal: panel and workspace move continuously; reversing does not queue an old final state; no blank gutter or second layout snap is visible; utilities never overlap; rapid screen requests settle on the last request; reduced motion changes state promptly; native controls remain native, reachable, and do not overlap app controls.

Fail signal: a column-count change visibly snaps after the panel stops, rapid commands finish in the wrong state, focus lands in hidden content, overlay controls cover app actions, or the Windows window loses normal drag/maximize behavior.

Decision informed: CSS transition versus View Transition/precomputed layout, the exact settled-bounds callback, timing/easing within the signed ranges, and whether production adopts native title-bar overlay or retains the default frame.

### Changes

- File: `sandbox/application-shell-demo.html`
  Edit: add a dependency-free shell/motion demo using representative blocks rather than movie-editor internals. Include controls for left/right folds, two fake screens (one with and one without commands), keyboard/activity utility switching, rapid reversal, and reduced-motion emulation guidance.

- File: `sandbox/application-shell-demo.ts` or an inline demo script if no reusable production logic exists yet
  Edit: keep prototype behavior isolated. Promote only the selected mechanics into production controllers in later milestones.

- File: `docs/plans/application-shell-and-global-surfaces-exec-plan.md`
  Edit: record observed motion, the chosen implementation, title-bar result, and any rejected approach in `Surprises & Discoveries` and `Decision Log` before Milestone 4.

### Validation

- Command: `npm run typecheck`
  Expected: the unchanged production baseline passes before source edits.

- Command: `npm run unit`
  Expected: all current unit/integration tests pass; record the file/test counts in `Progress`.

- Command: `npm run e2e`
  Expected: all current Electron scenarios pass before the shell refactor.

- Manual: open `sandbox/application-shell-demo.html` and exercise the prototype at the 1440×900 production window size, then at narrower and wider sizes.
  Expected: the pass signals above are observable; record the chosen motion method rather than relying on subjective memory.

### Rollback/Containment

Keep all experiments in `sandbox/` or behind a temporary development-only branch in `electron/main.cjs`. Do not modify production `index.html` or controller wiring until the motion and title-bar decisions are recorded. If no technique avoids the second grid snap, stop and revise the shell/grid coordination contract before proceeding.

## Milestone 4 - Shell and app-screen registration API

### Scope

Create the stable global/workspace structure, move existing Collection commands into the central screen command slot, and register the current workspace through a narrow app-screen API. Preserve existing Collection behavior and selectors.

### Changes

- File: `index.html`
  Edit: replace the single `#toolbar` structure with `#appShell`, `#globalAppBar`, `#workspaceRow`, `#mainScreenHost`, and `#screenCommandHost`. Move Browse Folder, Actions, title toggle, fullscreen, collection selector, clip count, and future grid commands into a Collection-owned command bar. Wrap existing dialogs/grid in the Collection screen root. Keep overlays that must span screens outside the screen root.

- File: `index.html`
  Edit: establish the approved tokens, spacing, hierarchy, utility grouping, and responsive constraints from `DESIGN.md` and the signed comps. Retain stable element ids used by current controllers and E2E tests wherever ownership, not semantics, is changing.

- File: `src/ui/application-shell-controller.ts`
  Edit: add a stateful class that registers app screens, renders selector options, activates exactly one screen, removes inactive content and commands from layout/tab order, invokes the incoming screen's `focusInitial()` after mounting, and lets the final rapid activation request win. It must not branch on screen ids or import Electron/filesystem code.

- File: `src/ui/app-screen.ts`
  Edit: define the narrow app-screen registration and immutable shortcut descriptor types after writing caller sketches for Collection, Settings, and an Extraction-like fake. Prefer required behavior and optional command content over boolean mode flags. Include explicit activation/deactivation cleanup only if a real current caller needs it.

- File: `src/ui/collection-screen.ts`
  Edit: adapt the existing static Collection DOM to the shell contract. Its initial-focus callback should choose a meaningful current target based on Collection state without making the shell inspect internals.

- File: `src/ui/main-toolbar-control.ts`
  Edit: rename only if the final responsibility is clearly Collection-specific; otherwise keep the class but update its element ownership. Do not mix global utility state back into it.

- File: `src/app/app-controller.ts`
  Edit: compose the shell and Collection app screen, pass the Collection command-bar height to the grid, and leave existing pipeline/collection workflows in place.

- Files: `tests/unit/application-shell-controller.spec.ts`, `tests/unit/app-screen.spec.ts`
  Edit: add caller-level tests for no-command screens, removal of stale commands, exact last-request-wins behavior, inactive tab order, declared focus invocation, and selector state with one or multiple registered app screens.

- Files: `tests/unit/app-dom.spec.ts`, `tests/unit/main-toolbar-control.spec.ts`, `tests/integration/app/app-controller.spec.ts`
  Edit: update fixtures and assertions for the new hierarchy while preserving existing collection operations.

### Validation

- Command: `npm run unit -- --run tests/unit/application-shell-controller.spec.ts tests/unit/app-screen.spec.ts tests/unit/main-toolbar-control.spec.ts tests/unit/app-dom.spec.ts tests/integration/app/app-controller.spec.ts`
  Expected: focused tests prove command ownership, focus delegation, last-request-wins activation, and unchanged Collection wiring.

- Command: `npm run typecheck`
  Expected: the contract is strict-TypeScript clean and contains no screen-name branching.

- Manual: run `npm start`, load a folder, switch collections, save, use Actions, zoom, and enter/exit fullscreen.
  Expected: all commands still work from the Collection command bar; the global shell does not appear in fullscreen; returning restores the normal shell and grid.

### Rollback/Containment

Keep the old element ids while moving ownership so the migration can be reverted structurally without changing business workflows. If app-controller changes begin manufacturing screen-specific DOM, stop and move that behavior into the Collection screen before continuing.

## Milestone 5 - Durable settings and Settings app screen

### Scope

Add one canonical persisted `AppSettings` value and a real Settings app screen. The screen edits the Pipelines top folder and whether newly opened single-clip playback starts with audio. It has no screen command bar.

### Changes

- File: `src/app/app-settings.ts`
  Edit: define one immutable canonical settings value with `pipelinesRootPath` and `singleClipAudioDefault`. Represent unset root explicitly and default audio to off. Provide parsing/defaulting at the persistence boundary rather than distributing nullable raw JSON through the UI.

- File: `src/app/app-settings-service.ts`
  Edit: define the smallest application-facing capability needed to load settings, choose a pipelines root, and persist an updated complete value. Model expected read/write/cancel outcomes explicitly; do not expose Electron IPC shapes to the screen.

- File: `src/adapters/electron/electron-app-settings-service.ts`
  Edit: implement the renderer adapter over a narrow preload API. Keep the concrete adapter wider than the dependency shape used by the Settings screen only when another real caller needs it.

- Files: `electron/app-settings-store.cjs`, `electron/preload.cjs`, `electron/main.cjs`
  Edit: persist a versioned, validated JSON settings document under Electron's `app.getPath('userData')`; choose the pipeline root with the native directory picker; write updates atomically; and return typed renderer-safe results. Reject malformed stored values by falling back to defaults while reporting diagnostics. Add no general filesystem read/write IPC.

- File: `src/ui/settings-screen.ts`
  Edit: implement the approved Settings layout as an app screen with no command bar. Show the full root path with an accessible label and a Choose folder action, and expose a clearly labeled on/off switch for `Clip audio by default`. Save each deliberate change, show progress/error through Activity and Errors, and preserve the prior value if persistence fails.

- File: `src/ui/zoom-overlay-controller.ts`
  Edit: accept the audio default as an injected value/provider when opening a new Zoom session. Preserve the existing local toggle and do not retroactively change an already-open video when Settings changes.

- File: `src/ui/clip-collection-grid-controller.ts`
  Edit: keep grid videos muted regardless of the single-clip preference and add a focused regression assertion so future callers cannot confuse the two policies.

- File: `src/app/app-controller.ts`
  Edit: load settings during startup composition, register Settings beside Collection, wire the app-bar Settings control to that registration, and pass the audio default into single-clip playback. Changing the configured root must not replace the active pipeline session.

- Files: `tests/unit/app-settings.spec.ts`, `tests/unit/settings-screen.spec.ts`, `tests/unit/electron-app-settings-service.spec.ts`
  Edit: cover defaults, versioned parsing, malformed data, canceled folder choice, atomic-write failure, prior-value restoration, no command bar, initial focus, and path rendering.

- Files: `tests/integration/ui/zoom-overlay-controller.spec.ts`, `tests/integration/ui/clip-collection-grid-controller.spec.ts`, `tests/integration/app/app-controller.spec.ts`
  Edit: prove audio-off and audio-on defaults for newly opened Zoom, grid-always-muted behavior, persisted values after screen switching, and unchanged active working session after root updates.

### Validation

- Command: `npm run unit -- --run tests/unit/app-settings.spec.ts tests/unit/settings-screen.spec.ts tests/unit/electron-app-settings-service.spec.ts tests/integration/ui/zoom-overlay-controller.spec.ts tests/integration/ui/clip-collection-grid-controller.spec.ts tests/integration/app/app-controller.spec.ts`
  Expected: both settings round-trip, cancel/failure paths retain prior state, Settings leaves no empty command row, new Zoom sessions follow the preference, and grid clips remain muted.

- Command: `npm run typecheck`
  Expected: the persisted JSON is parsed at the boundary and renderer code cannot depend directly on IPC DTOs.

- Manual: run `npm start`, switch from Collection to Settings, choose a root, toggle audio, restart the app, and open Zoom from Collection.
  Expected: both settings survive restart; the root is displayed accurately; Settings receives meaningful initial focus; the current loaded collection is not silently replaced; a newly opened Zoom follows the preference.

### MS5 verification record (2026-09-07)

Acceptance goal: preferences survive restart, root changes preserve the loaded working session, and only newly opened single-clip videos follow the audio default while grid previews remain muted.

- `npm run typecheck`: both compiler passes clean.
- `npm run unit`: 45 files / 193 tests pass, including storage corruption/BOM/atomic failure, cancellation, malformed IPC, pending-save UI, prior-value restoration and Zoom session semantics.
- `npm run e2e`: all 7 existing Electron scenarios pass. The 2 new Settings scenarios pass on focused rerun after correcting the test's assumption about Activity (errors already open it) and fixing switch pending-state feedback. They verify isolated-profile restart, Unicode root persistence, retained selection/clip sequence, audio on/off, always-muted grid, screen-switch Zoom cleanup, keyboard isolation, visible errors and retry after a real rename failure.
- Actual Electron screenshots `test-results/settings-desktop.png` and `test-results/settings-narrow.png` inspected: labeled path, on/off switch, reachable controls, and no empty command row. These are generated test artifacts. The native picker uses the existing production dialog path; automation supplies its selected-folder test hook. No physical dialog or listening test is claimed.
- Review against `coding-quality.md`: settings presentation, committed application state and Electron storage remain separate; no new production dependency. Temporary-file cleanup is best effort after a reported save failure. Adjacent pre-existing Zoom seek/play catches remain outside this milestone's scope.

### Rollback/Containment

Version the settings document from its first release and keep default construction centralized. If a stored file is absent or malformed, the app must still launch with no configured root and audio off. If persistence cannot be made atomic and recoverable, stop before exposing editable Settings rather than presenting success for an unsafe write.

## Milestone 6 - Foldable side-panel hosts and coordinated layout

### Scope

Add open/folded Pipelines and Clips hosts, persistent reveal rails for the current session, and the selected motion strategy. Panel contents remain honest empty states pending later features.

### Changes

- File: `index.html`
  Edit: add left Pipelines and right Clips `aside` regions, named headers, fold buttons, reveal rails, and accessible empty states. Give each fold/reveal control `aria-expanded` and `aria-controls`. Clips may expose a hidden count-badge slot but must not invent locked clips.

- File: `src/ui/foldable-panel-controller.ts`
  Edit: add one shared class because the behavior now has two real callers. Own open/folded state, accessible attributes, class changes, interrupted reversal, reduced-motion completion, and one settled-bounds callback. Do not own Pipelines or Clips content.

- File: `src/ui/application-shell-controller.ts`
  Edit: coordinate the two panel controllers with workspace classes and expose one bounds-settled notification to the active screen. Avoid per-frame JavaScript layout writes.

- File: `src/ui/clip-collection-grid-controller.ts`
  Edit: adapt layout measurement to the Collection command bar and selected panel-transition strategy. Recompute expensive optimal layout only at the agreed point and ensure any concurrent visual interpolation prevents a second snap.

- File: `src/app/app-controller.ts`
  Edit: wire the shell's final-bounds notification to the active Collection grid without placing animation logic in the composition root.

- Files: `tests/unit/foldable-panel-controller.spec.ts`, `tests/unit/application-shell-controller.spec.ts`, `tests/integration/ui/clip-collection-grid-controller.spec.ts`
  Edit: prove independent states, width reclamation classes, reversal, stale-event rejection, single settled callback, reduced motion, focus/ARIA state, and final grid layout notification.

### Validation

- Command: `npm run unit -- --run tests/unit/foldable-panel-controller.spec.ts tests/unit/application-shell-controller.spec.ts tests/integration/ui/clip-collection-grid-controller.spec.ts tests/integration/app/app-controller.spec.ts`
  Expected: transitions settle on the latest state, each panel is independent, and one final grid-layout callback occurs per settled change.

- Manual: run `npm start`, load a representative multi-row folder, fold/open each side separately and together, then reverse each transition halfway through.
  Expected: panel, rail, command bar, grid, and central width move as one continuous change with no blank gutter or post-transition snap.

### MS6 verification record (2026-09-08)

Acceptance goal: independently folding either panel reclaims central space continuously while preserving the working grid and accessible controls.

- Shared panel controller: independent state, both controls' ARIA, focus handoff, stale completion rejection, reduced-motion interruption and disposal. Root reviewed and corrected the first delegated ARIA/test gaps before acceptance.
- Shell and grid tests: destination width, final column bookkeeping, unchanged video elements and one settled notification after concurrent panel motion. Settings keeps no command row.
- `npm run unit`: 46 files, 199 tests pass. `npm run typecheck`: both passes clean.
- `npm run e2e`: 10 scenarios pass with one worker. A drag-and-drop run failed when multiple native Electron windows shared focus; direct event inspection and isolated replay succeeded. Playwright now serializes desktop scenarios, preserving the original drag/drop assertions.
- Real Electron eight-clip sequence: each folded panel reclaims 204px; both reclaim 408px. Three columns become four. Independent and simultaneous operations, mid-motion reversal, focus/ARIA, video-node identity, selected clip, Settings access and fullscreen state restoration pass. Recorded reversal samples showed less than 1px late-frame card movement and no second settled jump in this sequence; this is bounded diagnostic evidence, not a universal motion threshold.
- Captures inspected: `test-results/panels-open.png`, `panels-folded.png`, and `panels-settings-narrow.png` (900px content width); controls remain reachable without horizontal page overflow. `panel-motion-samples.json` contains the generated geometry trace. Human-perceived motion and physical window interactions remain in MS9's Windows acceptance review.
- No player-control implementation or dependency adoption. Grid changes affect card geometry only; pipeline discovery and clip-lock behavior remain outside this milestone.

### Rollback/Containment

If motion fails with the real grid, retain correct instant fold behavior behind reduced-motion/zero-duration classes and return to the Milestone 3 prototype. Do not conceal a second snap by adding delays or queued timers.

## Milestone 7 - Global utilities and read-only keyboard map

### Scope

Create one coordinator for anchored app-bar utilities and implement the contextual, unmistakably read-only Keyboard shortcuts surface.

### Changes

- File: `index.html`
  Edit: add the app-bar utility group, separator, adjacent keyboard and Settings triggers, utility host, and keyboard-map panel. Keep Activity/Errors in its existing temporary markup until Milestone 8. Settings activates the real screen registered in Milestone 5.

- File: `src/ui/global-utility-coordinator.ts`
  Edit: own the invariant that only one utility is open, Escape closes it, opening another transfers focus directly, outside-click policy is consistent, closing restores focus to the correct invoker, and stale transition completions cannot reopen a prior surface.

- File: `src/ui/keyboard-map-control.ts`
  Edit: render the active screen name, the note beside that context, its screen-specific shortcuts, and a section labeled `Global`. Render keys as non-focusable semantic `<kbd>` tokens with no edit affordance. Move focus to the panel heading/scroll container on open and expose a focused empty state when a screen has no shortcuts.

- Files: `src/app/app-keydown-handler.ts`, `src/app/fullscreen-session.ts`, and a narrowly named shortcut-catalog file only if needed
  Edit: describe only shortcuts that the current code actually handles. Co-locate immutable descriptors with their handlers or share constants so displayed combinations do not silently drift. Do not introduce shortcut remapping, recording, or persistence.

- File: `src/app/app-controller.ts`
  Edit: compose the coordinator and keyboard map, update the map when the active screen changes, and place utility-key handling before screen shortcuts only where required for Escape/focus protection.

- Files: `tests/unit/global-utility-coordinator.spec.ts`, `tests/unit/keyboard-map-control.spec.ts`, `tests/unit/app-keydown-handler.spec.ts`
  Edit: cover exclusive opening, direct transfer, focus restoration, Escape precedence, `Global` wording, note placement, static keycaps, empty/long/chord cases, and no editable elements.

### Validation

- Command: `npm run unit -- --run tests/unit/global-utility-coordinator.spec.ts tests/unit/keyboard-map-control.spec.ts tests/unit/app-keydown-handler.spec.ts tests/unit/application-shell-controller.spec.ts`
  Expected: keyboard-only open/traverse/close behavior passes; utilities never coexist; map content changes with fake active screens and contains no editing affordance.

- Manual: run `npm start`, open Keyboard shortcuts by mouse and keyboard, tab through it, close with Escape, and rapidly alternate it with the Activity trigger.
  Expected: the panel stays anchored to its trigger, never shifts the workspace, and focus returns or transfers predictably without flashing both surfaces.

### MS7 verification record (2026-09-08)

Acceptance goal: users can read shortcuts for the active screen, switch exclusively between keyboard help and Activity, and dismiss either with predictable focus while the workspace stays fixed.

- `npm run unit`: 48 files / 207 tests pass. Coordinator tests cover direct transfer, current-invoker restoration, Escape precedence, immediate reopening, outside pointer/focus dismissal and canceled entrance animation. Map tests cover empty/long/chord cases, safe literal labels and non-editable keycaps.
- `npm run typecheck`: both passes clean. `npm run e2e`: all 11 scenarios pass; the expanded utilities scenario also passes on focused rerun with real loaded clips, F/Delete isolation, Tab dismissal, Escape/Enter reopening, Settings context, 900px anchoring and keyboard scrolling to Global.
- Actual Electron captures `test-results/keyboard-map-collection.png` and `keyboard-map-settings.png` inspected with entrance animations completed. The old `drag to reorder ...` hint and its unused CSS are removed. Existing side-panel, persistence, edit, drag/drop and fullscreen scenarios pass.
- The shared host uses existing DOM/CSS and synchronous visibility with a short cancelable opacity entrance; it adds no component dependency. This implements the planned coordinator without adopting the unresolved Web Awesome production dependency. Activity's existing five-entry history is temporarily registered to verify real utility exclusivity; its richer model remains MS8.
- An exploratory check confirmed that the existing Zoom overlay intercepts app-bar pointer clicks. That unreachable click sequence was excluded from utility acceptance; Zoom presentation/player behavior was not changed. Escape precedence is covered at the coordinator boundary, and existing Zoom scenarios continue to pass.
- Review against `coding-quality.md`: shell screen-change notification, utility policy and keyboard-map rendering remain separate. No adjacent unsafe patterns found around MS7 hunks. Physical title-bar/window-motion acceptance remains MS9.

### Rollback/Containment

Keep utility coordination separate from the keyboard map's rendering. If focus or animation remains unreliable, disable spatial utility motion while retaining exclusive state and focus correctness; do not weaken the one-open-surface invariant.

## Milestone 8 - Combined Activity and Errors

### Scope

Replace the current five-message activity dropdown with the signed combined surface while preserving every current progress, success, and error caller.

### Changes

- File: `src/ui/activity-indicator-control.ts`
  Edit: migrate to a discriminated entry model for progress/success/information and errors. Add stable entry ids, unresolved/resolved state, human message, affected object/operation, recovery text, optional retry callback, expandable technical details, and injected clipboard writing. Return an error id or focused handle only where callers need later resolution. Preserve error auto-open unless a blocking/protected-focus surface is active.

- File: `src/ui/activity-indicator-control.ts`
  Edit: implement session-only retention: keep up to 50 resolved/non-error entries and retain all unresolved errors until resolved or explicitly handled. A bulk clear removes only clearable entries and explains retained unresolved errors.

- File: `src/ui/activity-indicator-control.ts`
  Edit: make the named history region keyboard reachable. Support ArrowUp/Down entry focus, PageUp/Down, Home/End, `scrollIntoView`, wheel/trackpad native scrolling, interactive-child key preservation, hidden scrollbar with no reserved gutter, and restrained overflow fades.

- File: `src/ui/global-utility-coordinator.ts`
  Edit: register Activity and Errors as the second global utility so it shares exclusive opening, focus transfer, Escape, and restoration behavior with Keyboard shortcuts.

- Files: `src/ui/load-status-control.ts`, `src/app/app-controller.ts`, `src/app/zoom-video-edit-workflow.ts` and other direct status callers found by `rg`
  Edit: preserve simple progress/success calls and enrich errors where the affected operation, recovery, retry, or technical details are already available. Do not fabricate retry actions that cannot safely replay an operation.

- File: `src/adapters/browser/clipboard-adapter.ts`
  Edit: add the smallest injected browser clipboard boundary if a direct callback at composition is not sufficient. Report copy failure inside the open surface without recursively adding a new global error entry.

- Files: `tests/unit/activity-indicator-control.spec.ts`, `tests/unit/load-status-control.spec.ts`, `tests/integration/app/app-controller.spec.ts`
  Edit: cover migration compatibility, detailed error rendering, copy success/failure, retry state, unresolved retention, safe clear, error auto-open protection, history overflow, all navigation keys, interactive child behavior, and global-utility exclusivity.

### Validation

- Command: `npm run unit -- --run tests/unit/activity-indicator-control.spec.ts tests/unit/load-status-control.spec.ts tests/unit/global-utility-coordinator.spec.ts tests/integration/app/app-controller.spec.ts`
  Expected: existing operational status flows remain green and new detailed-error, retention, scrolling, clipboard, and focus behaviors pass.

- Manual: run `npm start`, trigger a normal load/success flow and an existing recoverable error, create enough development entries to overflow the panel, then use wheel, Arrow keys, Page keys, Home/End, details expansion, and Copy details.
  Expected: no scrollbar or gutter is visible; overflow remains discoverable; focused entries scroll into view; unresolved errors survive bulk clear; copy feedback stays local.

### Rollback/Containment

Preserve the existing `showProgress`, `showSuccess`, and `showError` call shape through a temporary adapter while callers migrate. If detailed errors regress existing reporting, restore the simple methods over the new model rather than reintroducing a separate old panel.

### MS8 implementation and verification (2026-09-08)

Acceptance goal: users can inspect and recover from operational errors in one Activity surface, retain unresolved errors through ordinary history clearing, and navigate long history without losing their working context.

- `ActivityIndicatorControl` remains the sole session owner. Existing simple status calls are preserved over a discriminated entry model; error ids support resolution. Keyed DOM views retain focus and expanded details during incoming activity. Removed views and their listeners are collectible; disposal stops observers/timers and ignores late copy/retry results.
- Retention keeps the newest 50 clearable entries plus all unresolved errors. Clear history explains retained errors; Clear error is explicit individual dismissal and is disabled during its retry. Bulk clear can still remove ordinary entries during retry because unresolved entries are always retained.
- The named history region handles Arrow keys, Home/End and geometry-based Page movement; interactive children keep their native keys. Native wheel scrolling, hidden scrollbar/no gutter and conditional edge fades were verified in Electron. No persistence or additional dependency was introduced.
- The composition injects browser clipboard writing directly. Copy and retry feedback stay local. Settings retries only the failed preference against current committed values, returning typed failure to the original entry. Human messages stay concise; filesystem diagnostics are expandable/copyable. Folder, collection and existing video-edit status errors gain available context without replaying destructive operations. No player-control implementation changed.
- Error auto-open preserves dialogs, Zoom, fullscreen, Save as Collection and collection-conflict focus. Integration checks exercise the four protected DOM surfaces; existing fullscreen/utility Electron checks remain green.
- Validation: `npm run typecheck` passed; `npm run unit` passed 48 files / 222 tests; `npm run e2e` passed all 12 scenarios. After final visual/copy cleanup, focused Activity/Settings unit tests (17) and Activity/Settings/utility Electron scenarios (4) passed again. Actual Electron QA reproduced a filesystem rename failure, failed then successful retry, native clipboard contents, unresolved retention through bulk clear, explicit dismissal, 51-entry overflow, wheel and all navigation keys. Captures at desktop and 900x650 were visually inspected; this was not a separate screen-reader or physical-trackpad assessment.
- Guidance: coding-quality.md, using-97, TypeScript, API/interface, clean-code, correctness/security, testing, doc-update and pre-commit self-review governed implementation. Canonical architecture map updated. No important design-guidance deviation remains.
- Cost-aware delegation: one bounded control/test packet went to Luna medium. It stopped at its usage limit with incomplete code and no new tests. Root found retention/focus/lifetime issues, completed the implementation and wrote/ran the tests. Outcome: partial/blocked delegation, substantial root rework; no demonstrated cost saving from this packet. No policy change inferred from this result.

## Milestone 9 - Desktop integration, documentation, and final verification

### Scope

Finalize the Windows-first shell, preserve fullscreen and existing workflows, add real Electron coverage, update canonical architecture documentation, and perform the finish review against the signed acceptance criteria.

### Changes

- File: `electron/main.cjs`
  Edit: adopt the Milestone 3 native title-bar overlay result if it passed. Use native controls and CSS drag/no-drag regions; add no custom window-management IPC. If it failed, retain the default frame and document the visual deviation.

- File: `index.html`
  Edit: finish responsive and fullscreen selectors so app bar, side panels, rails, command bar, and utility surfaces disappear during fullscreen review and return without stale open/focus state. Add `prefers-reduced-motion` rules for every shell transition.

- File: `tests/e2e/scenarios.spec.ts`
  Edit: preserve existing scenarios and add shell coverage for Collection/Settings switching, Settings persistence, Collection command placement, no empty Settings command row, both panel states and width reclamation, utility exclusivity, focus restoration, keyboard history navigation, fullscreen chrome removal/restoration, rapid toggles, and reduced-motion final state. Use test-only fake app screens only in the sandbox/controller tests, not as production destinations.

- File: `docs/agent-docs/agent-architecture-map.md`
  Edit: document shell ownership, app-screen registration, global-utility coordination, foldable hosts, AppSettings persistence, Activity and Errors ownership, current Collection/Settings registrations, and where future screens/panels attach.

- File: `docs/documentation/object-oriented-exception-register.md`
  Edit: update only if the final implementation introduces or removes a stateful non-class module that must be recorded under repository guidance.

- File: `docs/plans/application-shell-and-global-surfaces-exec-plan.md`
  Edit: keep Progress, discoveries, decisions, and retrospective current with exact evidence and remaining later-screen dependencies.

### Validation

- Command: `npm run typecheck`
  Expected: normal and strict source type checks pass.

- Command: `npm run unit`
  Expected: all unit and integration tests pass; record totals.

- Command: `npm run e2e`
  Expected: all real Electron scenarios pass, including existing Collection, zoom, edit, and fullscreen behavior plus new shell scenarios.

- Command: `npm run test:all`
  Expected: the combined verification passes from a clean build.

- Manual Windows QA: run `npm start` at 1440×900 and at one narrower supported size. Exercise folder load, collection switching, both panel folds and reversals, utility switching, error overflow, fullscreen, reduced motion, and the sandbox's rapid two-screen transitions.
  Expected: panel/workspace motion is continuous with no second correction; utilities do not flash or coexist; fullscreen is unchanged; the sandbox never shows blank/stale central content; focus ends at the declared target; native window drag/minimize/maximize/close remain correct if overlay is enabled.

- Review: compare the running app with `.impeccable/mocks/shell-command-levels.png`, `.impeccable/mocks/keyboard-map-open.png`, `.impeccable/mocks/activity-errors-open.png`, and `.impeccable/mocks/extraction-approved-folded.png`.
  Expected: hierarchy, grouping, folded rails, static keycaps, scroll treatment, and motion intent match; illustrative movie-editor internals are not implemented.

### Rollback/Containment

Title-bar overlay is independently reversible to the default frame. Shell controller, panels, utilities, and activity migration are separate classes, so failures can be isolated without reverting domain or filesystem behavior. Do not complete the plan with failing existing E2E scenarios or with manual motion defects hidden by longer timers. Record any approved visual deviation and its reason in `Decision Log`.

### MS9 implementation and verification (2026-09-08)

Acceptance goal: the Windows shell keeps native window controls usable, preserves working Collection/Settings flows through rapid navigation and fullscreen, and remains usable at desktop/narrow widths with reduced motion.

- Windows uses the MS3 native overlay direction in `electron/main.cjs`; `index.html` reserves caption-button space and marks app-bar controls as no-drag. Native caption actions need no renderer IPC. Compact app-bar spacing supports 800px content width. Activity's icon-only trigger now has a tooltip as well as its accessible name. Fullscreen also explicitly hides the global utility host.
- `tests/e2e/desktop-shell.spec.ts` adds overlay and default-frame scenarios at 1440x900 and 800x650 content sizes: caption clearance, reachable controls, no horizontal page overflow, 16 alternating screen requests, declared focus, reduced-motion panels/utilities and fullscreen restoration. Existing tests retain their assertions. The panel test now sets 1100x900 content dimensions to exercise a real column boundary independent of native-frame height.
- Verification: `npm run typecheck` passes normal and strict source checks. `npm run test:all` passes a clean build, all 48 unit/integration files (222 tests) and all 14 Electron scenarios, including existing folder/collection/edit/Zoom workflows. `npm --prefix sandbox/component-library-evaluation run test:shell-overlay` passes typecheck/build, two-to-three-column reflow, reversal, screen/command/focus ownership, exclusive utilities, rapid final requests, reduced motion and caption clearance.
- Desktop/narrow production captures inspected. The four approved mocks were compared for command hierarchy, utility grouping, folded rails, static keycaps and scroll treatment, not illustrative editor internals or pixel parity. Previously user-approved panel motion remains the baseline. No player control was implemented.
- Native Windows UI automation verified app-bar double-click maximize, native maximize/restore/minimize/close. Its physical drag probe moved neither the overlay window nor the default-frame baseline, so this evidence is inconclusive. A fresh isolated-profile overlay app is left open for the user to drag the empty app-bar area and review motion. Native folder-dialog interaction, screen-reader and physical-trackpad use were not separately established by these checks; folder-choice automation uses the existing test hook.
- Canonical architecture map updated with native-frame ownership, fallback and verification boundary. The exception register was reviewed and remains unchanged: no new stateful non-class responsibility was introduced. Existing main-process bootstrap is already registered.
- Guidance: `coding-quality.md`, using-97, cost-aware-delegation, TypeScript, clean-code, testing-discipline, build-deploy-and-tooling, Impeccable, doc-update, Computer Use and pre-commit-self-review governed MS9. Integration and acceptance stayed with the root under the cost-aware gate. No new delegation or important code-design deviation. No added runtime logs or motion-delay workaround. Adjacent issues: none found in +/-20 lines of MS9 touched hunks.
- Two task-created workspace profiles (`.qa-ms9-0wvXdG` and `.qa-ms9-frame-T7i79T`) remain because automatic approval review rejected their deletion with "blocked by policy". No alternate deletion method was attempted after the exact-path rejection.
- Remaining feature boundaries: pipeline discovery, locked-clip content, startup selection and GIF Extraction need their later specifications. Their placeholder panel hosts and screen-registration seams are ready; this milestone does not implement those features. The user subsequently accepted the final review app with "looks good" after the physical-drag check request; MS9 and this execution plan are complete.

## Post-acceptance UX remediation (2026-09-09)

User authorized implementation of the independent [remediation brief](../research/application-shell-ux-remediation-brief.md). Activity labels/counts and global order are corrected; shell controls, panels, utility headers and Settings are refined; keyboard descriptors now distinguish groups, alternatives and chords. Existing completed milestones remain historical acceptance records. The [new verification report](../research/application-shell-ux-remediation-verification.md) records 227 unit/integration tests, 14 Electron scenarios, final captures, detector classifications and subsequent user acceptance of dragging and smoothness. This remediation uses coding-quality.md, TypeScript/API/clean-code/testing guidance, Impeccable, cost-aware-delegation, doc-update and final self-review; it adds no future panel content or player functionality.

Collection-command follow-up: replaced overlapping selector positioning with normal-flow rows, kept all four command icons and labels visible, and preserved fullscreen button markup after exit. Bugfix-by-failing-test governed the regression; build/typecheck, 227 unit/integration tests and three focused Electron scenarios passed. See the verification report for current captures and the narrow-layout tradeoff.

## Post-acceptance DOM ownership correction

User requested immediate review and correction of child-DOM access. CollectionScreen now uses grid/toolbar capabilities; grid measurement, panel sizing, utility Close events and fullscreen button presentation stay with their owners. Activity protection queries existing controller state. See [ownership review and verification](../research/application-shell-dom-ownership-review.md). Normal/strict typecheck, 229 unit/integration tests and all 14 Electron scenarios pass; actual Electron focus/dismissal/fullscreen and desktop/narrow layouts were checked. Refactor, TypeScript, API/interface, clean-code, testing, documentation and self-review guidance governed this correction. A broader UI coding-guideline change is deferred for discussion.
