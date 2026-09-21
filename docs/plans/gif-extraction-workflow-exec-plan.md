# Implement GIF Extraction and Refine Gif

## Why this matters

This plan implements the signed specification in `docs/specs/gif-extraction-workflow-spec.md`. It gives Clip Sandbox a fast, source-faithful workflow for marking many ranges while a movie plays, proving exact endpoints when needed, refining timestamp-based ranges in a focused companion screen, and batch-creating source-resolution MP4 clips with audio.

The user-visible goal is: a person can open one movie, reuse or prepare its exact-frame review assets, capture exact or visibly inexact ranges with `Q`, `W`, and `A` without interrupting ordinary playback, refine any inexact range with the same player and progress bar, then use `E` or `Extract All` to create correctly named MP4 clips in a lazily created movie collection inside the `extraction-tmp` system pipeline.

Completion requires real Windows Electron QA and media-level proof against the original movie. Passing controller tests alone is not completion.

## Progress

- [x] (2026-09-13 18:35Z) The feature specification was signed off in `docs/specs/gif-extraction-workflow-spec.md`.
- [x] (2026-09-13 18:35Z) Drafted this execution plan from the signed specification, `PLANS.md`, `docs/agent-docs/agent-architecture-map.md`, `coding-quality.md`, the current production seams, and the handoff-selected native-frame spike files.
- [x] (2026-09-13 19:56Z) Milestone 1 - Captured green production/spike baselines and proved the correctness-first original-source extraction recipe across CFR, VFR, repaired-timestamp, odd-dimension, and negative fixtures. The reviewable report is `docs/research/gif-extraction-original-source-proof.md`; generated proof output remains ignored.
- [x] (2026-09-14 05:56Z) Milestone 2 - Established the production-owned, pinned software-only native toolchain. One FFmpeg 9.0/x264 distribution now provides FFmpeg, FFprobe, current AAC, and `libx264rgb` for the frame-review/GIF Extraction workflow; repeat bootstrap/build are reuse-only/incremental; selected BestSource and LibVLC services plus bounded protocol tests pass from `native-build/frame-review/`; ordinary build/startup leave native products unchanged.
- [x] (2026-09-14 19:36Z) Milestone 3 - Ported the prepared-review, cache, playback, and exact-frame backend behind a renderer-safe service. Per-window hosts issue opaque source/session handles; provisional LibVLC playback activates before preparation; exact capture remains gated on a validated BestSource canonical index plus software GOP1 proxy; persistent cache hits skip builders in-session and after restart without touching mtimes; bounded scrub/held-step scheduling, consumer-aware cancellation, source/protocol invalidation, validated IPC, Blob reconstruction, and destruction-safe disposal are covered by focused and real native/Electron tests.
- [x] (2026-09-15 00:48+03:00) Milestone 4 - Integrated the reusable single player control, screen-scoped keyboard behavior, listed/contextual screen lifecycle, and generic panel contributions. GIF Extraction and Refine Gif now render in the real Electron shell with one reparented player and one progress bar; opening a source and range behavior remain deliberately in Milestones 5 and 6.
- [x] (2026-09-15 08:46+03:00) Milestone 5 - Implemented the source-bound extraction session, lock-only Q/W/A range state machine, exact/inexact endpoints, start-frame thumbnails, accessible Clips queue, confirmed source replacement, and real GIF Extraction screen. Electron QA proves exact progress-bar capture, uninterrupted timestamp capture, next-Q drafts, opaque cache lifecycle, and normal-shutdown thumbnail cleanup.
- [x] (2026-09-19 14:15+03:00) Milestone 6 - Implemented one-range refinement staging, exact endpoint focus/seek, atomic same-id replacement, cancellation/invalidation, needs-refinement panel behavior, Next/Back focus continuity, and the contextual Refine Gif workbench. The real Electron scenario proves discard-before-`A`, paused exact entry, Q/W/A commit, stable queue order, retained exact card, and truthful disabled MS7 extraction at desktop and narrow widths. Strict typecheck, 69 Vitest files/310 tests, and the focused Electron refinement gate pass; the complete Electron run passed 20/21, with only the pre-existing Activity system-clipboard assertion still failing identically on focused retry.
- [x] (2026-09-20) Milestone 7 - Implemented exact original-source extraction, lazy `extraction-tmp` destination/collection publication, exclusive numbered naming, per-range and partial-batch recovery, cancellation, `E`/`Extract All`, and Loopify migration to the single staged FFmpeg distribution. Production-runtime media proofs pass for CFR, VFR, repaired timestamps, odd dimensions, and audio; strict typecheck, 74 Vitest files/334 tests, native verification, and all 22 Electron scenarios pass. The real Electron flow publishes and displays two source-resolution clips, and the independent visual finish review passed after completed-state corrections.
- [x] (2026-09-20) Milestone 8 - Added ordered, idempotent renderer shutdown coordination while retaining the main process as the authoritative native-process barrier; surfaced preparation phases and prepared-cache reuse through Activity; added real close-during-preparation/extraction and controlled publication-repair scenarios; refreshed canonical architecture documentation; and completed strict typecheck, 75 Vitest files/342 tests, native-product verification, the four-fixture original-source media oracle, production build, and all 25 Windows Electron scenarios.

## Skill Gates

Planning-time gates:

- `impeccable`: governed the approved screen hierarchy, player-first layout, single-progress-bar constraint, range-card states, keyboard-first flow, and finish-quality expectations.
- `working-with-users-and-team`: governed requirements refinement and the distinction between an exact frame endpoint, a playback timestamp, locking, refinement, and extraction.
- `api-and-interface-design`: governed the new screen registration extension, renderer-safe player/session contracts, typed extraction boundary, caller sketches, and consumer-level contract tests.
- `domain-modeling`: governed immutable capture endpoints and ranges, the identityful extraction/refinement sessions, queue states, and the decision to keep workflow state in memory while caches remain file-backed.
- `before-you-refactor`: governed the planned extraction of reusable, tested player behavior from the spike and the staged modification of `ApplicationShellController`, `PipelineSession`, preload, and the large `AppController` composition root.
- `typescript-coding` and `writing-clean-code`: governed strict TypeScript, `I`-prefixed authored interfaces, class ownership, small files, discriminated states, and explicit boundary parsing.
- `testing-discipline`: governed the prototype-first export gate and the split among pure state tests, host/IPC tests, renderer integration tests, Electron E2E, and manual media QA.
- `error-and-correctness-traps`: governed source generations, cancellation, cache writers, frame delivery backpressure, output-name races, partial batches, and cleanup failures.
- `security-and-trust-boundaries`: governed opaque renderer handles, main-process path ownership, IPC validation, executable launch arguments, and rejection of renderer-supplied source/cache/output paths.
- `observability`: governed bounded operation/session identifiers, preparation phases, actionable Activity errors, and the prohibition on per-frame logging.
- `build-deploy-and-tooling`: governed pinned native dependencies, software-only native builds, artifact directories, package scripts, and clean-machine verification.
- `doc-update`: identified `docs/agent-docs/agent-architecture-map.md` as a required implementation deliverable when the new player, screen, cache, and extraction boundaries land.
- `using-97` and `coding-quality.md`: supplied the project trigger map and normative local ownership rules. Repository guidance takes precedence where generic skill guidance differs.

Execution-time gates:

- Re-read `using-97` before implementation and re-evaluate each milestone against the then-current tree.
- Use `before-you-refactor` before moving spike behavior or changing shell, preload, main-process, pipeline-session, or app-controller seams. Capture passing baselines first and keep each migration reversible.
- Use `api-and-interface-design` and write the three consumer sketches and contract tests in Milestones 3 and 4 before finalizing exported APIs.
- Use `domain-modeling` before implementing endpoint, range, queue, destination, or refinement state. Do not add mutable status booleans that permit invalid combinations.
- Use `typescript-coding` and `writing-clean-code` for all TypeScript work. Production behavior must have a named class owner unless `coding-quality.md` documents a concrete free-function exception.
- Use `testing-discipline` before every new test group. Demonstrate that a new behavioral test fails because the capability is absent or wrong before implementing the minimal passing behavior.
- Use `error-and-correctness-traps` for all asynchronous generation checks, cancellation, child-process events, cache publication, frame mailboxes, and batch continuation.
- Use `security-and-trust-boundaries` before extending preload or IPC. Validate every `unknown` payload in the trusted host and never expose filesystem paths or executable arguments to renderer code.
- Use `observability` when defining preparation/extraction events and process diagnostics. Reuse Activity and Errors for user-visible progress and failures; do not introduce remote telemetry or verbose frame logs.
- Use `build-deploy-and-tooling` before changing `package.json`, native scripts, dependency pins, `.gitignore`, or packaged runtime discovery.
- Use `impeccable` during screen integration and final visual QA against the signed visual rules and existing Clip Sandbox system.
- Use `doc-update` after the durable boundaries exist and before editing canonical agent documentation.
- Use `pre-commit-self-review` before each milestone handoff and before claiming the feature complete. Review the complete diff, tests, generated artifacts, architecture guidance, and unrelated dirty-worktree boundaries.
- Use `bugfix-by-failing-test` only if implementation uncovers a defect outside the already specified missing behavior.
- Use `cost-aware-delegation` only if delegation is considered during execution. No delegation is required by this plan.

Unavailable skills or fallbacks:

- None. All expected project-local skills are available at plan creation time.

Milestone 1 execution gates:

- `using-97`, `before-you-refactor`, and `coding-quality.md` kept this milestone at the prototype boundary: no production architecture or spike behavior was moved before the export contract passed.
- `build-deploy-and-tooling` governed the reproducible PowerShell tools, existing/pinned FFmpeg discovery, BOM-free manifest, generated-artifact boundary, and the decision not to build native products during application startup.
- `testing-discipline` governed the independent decoded-frame/audio oracles and negative controls. The verifier was first observed failing for a missing manifest, then exposed incorrect BestSource field usage, old-FFmpeg AAC priming behavior, and missing original timestamp preservation before it passed.
- `error-and-correctness-traps` governed inclusive/exclusive boundary arithmetic, VFR/original PTS handling, process exit/timeout checks, and the one-sample audio boundary.
- `security-and-trust-boundaries` governed argument-array process execution and path containment for all generated, cache, temporary, and proof-output files.
- `writing-clean-code` governed the shared proof helpers and narrow generator, verifier, benchmark, and Electron playback scripts. No TypeScript production code or exported production API changed in this milestone.

Milestone 2 execution gates:

- `cost-aware-delegation` was explicitly re-run before implementation. The milestone remained with the root agent because pin/licensing choices, the one-distribution decision, cross-toolchain build ownership, signed-plan reconciliation, and final media/runtime acceptance were cross-cutting work whose independent verification would repeat most of the task; there was no cheaper bounded subtask with a clear savings margin.
- `using-97`, `coding-quality.md`, and `before-you-refactor` kept the port limited to handoff-selected native sources and their direct compile dependencies. The spike remains unchanged; production ownership is isolated under `native/frame-review/` and `tools/frame-review/`.
- `build-deploy-and-tooling` governed exact pins, one FFmpeg/FFprobe distribution, explicit setup/build commands, generated-artifact roots, noninteractive failures, reuse stamps, and the Cygwin-aware incremental CMake graph.
- `testing-discipline` governed the failing missing-verifier and missing-bootstrap observations, corrupt-cache negative, native protocol boundary cases, BestSource exact/cache/error integration, LibVLC playback integration, and the repeated original-source proof using the production FFmpeg.
- `error-and-correctness-traps` and `security-and-trust-boundaries` governed bounded protocol allocation, invalid ordinals/commands, child-process timeouts, argument arrays, verified hashes, path containment, and fail-fast product checks.
- For Milestone 2, `doc-update` added only the durable native build boundary to `docs/agent-docs/agent-architecture-map.md`. The Milestone 3 gate below records the subsequently implemented Electron/runtime integration.

Milestone 3 execution gates:

- `cost-aware-delegation` sent one bounded, read-only spike inventory to a lower-cost agent; the root independently checked its cited selected files and retained API design, ownership, implementation, integration, and acceptance. The task-local ledger is `docs/plans/gif-extraction-workflow-exec-plan-delegation-log.md`.
- `api-and-interface-design`, `domain-modeling`, `typescript-coding`, and `writing-clean-code` governed opaque renderer identifiers, exact-versus-timestamp capture points, immutable wire parsing, class-owned host/cache/session responsibilities, and the absence of host paths from `IFrameReviewService`.
- `testing-discipline` first observed missing production contracts, schedulers, cache, session, and IPC modules; focused tests then proved bounded requests, source-generation suppression, cache reuse/stale rebuild/one-writer behavior, independent cancellation of coalesced consumers, source/protocol invalidation, exact-readiness gating, renderer Blob reconstruction, and close ordering.
- `error-and-correctness-traps`, `security-and-trust-boundaries`, and `observability` governed abort propagation, partial workspace cleanup, versioned cache identity, binary payload bounds, inbound IPC validation, bounded operation/session identifiers, phase events, and expected failure translation.
- `before-you-refactor` kept the spike unchanged and limited the port to handoff-selected behavior. A final class-ownership pass moved frame identity parsing/calculation behind `SourceFrameIdentity` rather than adding a free-function exception.
- `bugfix-by-failing-test` reproduced the Electron shutdown failure seen as `Object has been destroyed`, then kept the fix to capturing the `webContents` id before window destruction and retaining an actual-process shutdown timeout/stderr regression.
- `doc-update` replaced the obsolete build-only note with the durable prepared-review runtime, cache, source-handle, Electron bridge, and validation boundaries while keeping the MS4 player UI explicitly outside this milestone.

Milestone 4 execution gates:

- `cost-aware-delegation` sent the bounded player/keyboard test matrix and the required Impeccable finish review to lower-cost agents. Root review corrected ownership and asynchronous-observation assumptions in the test packet, verified the visual finding against actual Electron screenshots, and recorded both outcomes in `docs/plans/gif-extraction-workflow-exec-plan-delegation-log.md`.
- `api-and-interface-design`, `typescript-coding`, `writing-clean-code`, and `before-you-refactor` governed the generic `IAppScreen` navigation/panel/lifecycle contract, deterministic shell activation ordering, one shared player root, and separation between transport and shortcut owners.
- `testing-discipline` first observed the delegated missing-module failures, then proved synchronous displayed capture points, stale-render rejection, ordinary-versus-exact progress behavior, held-step release (including window focus loss), contextual navigation, one-time panel expansion, focus, and teardown.
- `error-and-correctness-traps` governed render/session generations, promise failure presentation, synchronous capture identity, timestamp arithmetic, teardown idempotence, and held-input release.
- `impeccable` governed the player-first three-pane surface, one-progress-bar constraint, existing visual tokens, normal/narrow screenshot pass, and independent finish review. Its one P2 finding—the persistent empty-screen scrollbar gutter—was fixed and the Electron visual scenario rerun.
- `doc-update` recorded the listed/contextual screen rules, panel contribution semantics, shared player ownership, and keyboard lifecycle in the canonical architecture map.
- `bugfix-by-failing-test` kept two final-gate corrections in E2E setup/assertions: unique generated media now guarantees the intended cold-cache precondition across repeated runs, and fullscreen identity waits for Chromium media readiness after restored cards become visible. Production cache persistence and fullscreen behavior were not weakened.

Milestone 5 execution gates:

- `cost-aware-delegation` kept the cross-cutting session, IPC, lifecycle, UI, and Electron acceptance work with the root because the weekly allowance was low and independent verification would repeat most of the work. The only delegated packet is the Impeccable-required bounded finish review recorded in the task-local ledger.
- `domain-modeling`, `api-and-interface-design`, `typescript-coding`, and `writing-clean-code` governed immutable exact/timestamp endpoints, the source-generation-bound range state machine, the identityful extraction session, narrow thumbnail service, and class ownership across renderer and trusted runtime boundaries.
- `testing-discipline` first observed missing range/session/cache modules, then proved replacement marks, inclusive exact ranges, mixed inexactness, lock-only behavior, next-Q drafts, source replacement, thumbnails, keyboard routing, panel semantics, and the actual Electron capture workflow.
- `error-and-correctness-traps`, `security-and-trust-boundaries`, and `observability` governed stale source/render rejection, async thumbnail ownership, bounded PNG validation, opaque paths and ids, safe Activity messages, and shutdown ordering between native handles and ephemeral cleanup.
- `impeccable` governed the player-first capture controls and scanable start-thumbnail range cards. Batched normal/narrow screenshots drove the final hidden-hint, duration, typography, static loading, and palette corrections before the independent finish review.
- `doc-update` recorded the capture/session, exact-mode race guard, thumbnail cache lifecycle, and renderer/main-process trust boundaries in the canonical architecture map.
- `bugfix-by-failing-test` reproduced a real Electron race in which a late playback callback could replace the exact frame selected through the sole progress bar. The player now explicitly retains exact-scrub mode until playback is deliberately restarted, and a focused regression plus repeated E2E runs prove the behavior.

Milestone 8 execution gates:

- `cost-aware-delegation` sent one bounded lifecycle test matrix to a lower-cost agent after a fresh usage preflight. Root retained shutdown architecture, production integration, Activity behavior, native/runtime analysis, documentation, full acceptance, and the final decision. The reconciled record is in the task-local delegation ledger.
- `api-and-interface-design`, `typescript-coding`, `writing-clean-code`, and `before-you-refactor` governed the small `ApplicationShutdownCoordinator` owner and kept lifecycle policy out of `ApplicationEventController` and the GIF UI controls.
- `testing-discipline` first observed the missing shutdown module and later a synchronous-phase continuation failure, then proved ordered/idempotent cleanup. Existing extraction cancellation was pinned with a trusted-runtime characterization test, while real Electron tests covered cold-preparation close, in-flight extraction close, cache Activity, and publication repair.
- `error-and-correctness-traps` and `observability` governed abort propagation, teardown failure containment, operation-temp cleanup, phase-only Activity updates, truthful cache-hit copy, and the prohibition on noisy per-frame status.
- `doc-update` refreshed the canonical architecture map with the GIF session/extraction/shutdown owners, current tool/runtime paths, and the renderer-versus-main close guarantee.
- `impeccable` hardening guidance was applied to error, progress, narrow-layout, keyboard/focus, and accessible-state evidence. MS8 changed status copy but no layout, color, spacing, or component structure, so the already-passed MS7 independent visual finish review remained the relevant final visual gate.
- `pre-commit-self-review` and `coding-quality.md` governed the final adjacent-context review, generated-artifact check, ownership pass, and explanation of any remaining limitations.

## Surprises & Discoveries

- Discovery: the production application has no native helper project or native dependency bootstrap at its root. The exact-frame implementation exists only under `spikes/native-frame-identity-playback/`.
  Evidence: the root has `src/`, `electron/`, and `tools/ffmpeg/`, while the handoff points to the spike's CMake sources, dependency manifest, and PowerShell build scripts.

- Discovery: `npm run build` deletes the root `build/` directory before compiling TypeScript. The spike also made startup look like a cold build because `control:start` always ran `control:build`: bridge TypeScript compilation, CMake configure/build, and `build-bestsource-gate.ps1`. CMake could reuse object files, but the BestSource gate script unconditionally invoked the compiler for each helper executable on every launch.
  Evidence: root and spike `package.json`, `spikes/native-frame-identity-playback/scripts/run-native-cmake.ps1`, and `spikes/native-frame-identity-playback/scripts/build-bestsource-gate.ps1`. Production startup must not copy that orchestration. Native output must use a separate ignored directory such as `native-build/frame-review/`, not the root `build/`, so the ordinary TypeScript build cannot erase it and trigger recompilation.

- Discovery: the current production edit route exports a whole loaded clip through `ClipEditor -> ZoomVideoEditWorkflow -> ElectronVideoEditService -> preload -> video-edit-runtime`; it does not accept canonical source-frame endpoints and currently uses an overwrite-capable FFmpeg path.
  Evidence: `src/business-logic/clip-editor.ts`, `src/app/zoom-video-edit-workflow.ts`, `src/adapters/electron/electron-video-edit-service.ts`, `electron/preload.cjs`, and `electron/video-edit-runtime.cjs`.

- Discovery: the existing `PipelineSession` owns one actively loaded pipeline, while GIF Extraction needs a separate default destination without replacing the Collection screen's active pipeline.
  Evidence: `src/app/pipeline-session.ts` and `src/app/app-controller.ts`.

- Discovery: both shell side-panel hosts exist, but their contents are static empty placeholders. `IAppScreen` has no panel contribution or activation-lifecycle contract, and `ApplicationShellController` currently adds every registered screen to the global selector.
  Evidence: `index.html`, `src/ui/app-screen.ts`, and `src/ui/application-shell-controller.ts`.

- Discovery: the signed cache location is the application folder. Installed application folders can be read-only on some Windows deployments.
  Evidence: the signed requirement still mandates `<app-folder>/frame-index-cache` and `<app-folder>/proxy-cache`. Implementation must surface an actionable cache-I/O error rather than silently relocate these persistent caches.

- Discovery: output must preserve source dimensions, but common H.264 `yuv420p` output cannot encode every possible odd source dimension.
  Evidence: this is an FFmpeg format constraint. Milestone 1 includes an odd-dimension fixture and makes the codec/pixel-format choice from measured, playable results instead of silently padding or resizing.

- Discovery: exact video-frame boundaries do not by themselves specify an audio interval. Audio must be cut against the original source presentation interval associated with the inclusive first and last canonical frames.
  Evidence: the spike separates canonical frame identity from playback/proxy time. Milestone 1 must prove and document the ordinal-to-original-time mapping and audio tolerance before production export is written.

- Discovery: FFmpeg rebases a large input start offset unless the original timestamp clock is explicitly preserved for audio trimming. The timestamp-repair fixture initially produced a video-only result when its 5.208-5.667 second source interval was applied after implicit rebasing.
  Evidence: adding `-copyts` before original-source audio decode made the repaired fixture produce the expected 22,032 samples, while the review derivative still used 0.208 seconds for the same canonical start ordinal.

- Discovery: the repository's old FFmpeg has the required `libx264rgb` encoder, while the spike's pinned FFmpeg 9.0 build has current AAC timestamp handling but no H.264 encoder. The old FFmpeg's AAC decode path reported 752 extra priming samples; FFmpeg 9.0 honored the MP4 skip/edit metadata and measured zero boundary difference.
  Evidence: Milestone 1 therefore uses a two-stage prototype and records the tool split in `docs/research/gif-extraction-original-source-proof.md`. Milestone 2 must make this reproducible rather than hiding a build inside startup.

- Discovery: Windows PowerShell 5.1's `ProcessStartInfo` does not provide `ArgumentList`.
  Evidence: the first fixture-generation run failed at that property. The proof harness now applies Windows CreateProcess quoting to an argument array, disables shell execution, captures both output streams, checks exit codes, and enforces bounded timeouts.

- Discovery: H.264 RGB plus AAC can retain a declared 321x181 source size and play in both current Windows playback paths.
  Evidence: Electron 37 reached `HAVE_ENOUGH_DATA`, played beyond 0.1 seconds, and reported 321x181; the LibVLC smoke gate completed and displayed a frame. LibVLC's callback buffer was internally aligned, but the file/display metadata remained 321x181.

- Discovery: a post-proof rerun of the complete Electron suite produced 16/17 passing tests because `tests/e2e/activity.spec.ts` read an empty system clipboard after clicking `Copy details`; the focused rerun failed identically. The captured pre-edit baseline had passed 17/17, and Milestone 1 changed no application source or clipboard behavior.
  Evidence: both post-proof failures timed out at the existing clipboard equality assertion on line 42, while the later final complete Electron run passed 17/17. The cause was not established. Record this as an intermittent clipboard-test observation with no demonstrated production consequence; do not label it an environmental cause, attribute it to the media prototype, or silently broaden MS1 into a clipboard fix.

- Discovery: the frame-review cache E2E's `Date.now() & 0xff` source color was not unique enough for a repeatable cold-cache precondition. A later run legitimately reused a validated persistent entry and made the test's first-open `cacheHit === false` assertion fail.
  Evidence: production returned `cacheHit === true` for the colliding content, which is the intended cache behavior. The E2E fixture now generates 120 random color bits; two consecutive focused runs each proved cold first open, warm same-process open, and warm post-restart open without deleting or weakening production caches.

- Discovery: the fullscreen identity E2E could read restored video metadata in the short interval after cards became visible but before Chromium had reselected their media resources.
  Evidence: one full-suite run saw all four cards visible while `currentSrc` and intrinsic metadata were temporarily empty; the focused retry recovered without intervention. The assertion now polls for the already-required source/metadata identity after exit instead of equating DOM visibility with media readiness. No persistent identity loss or MS4 screen regression was observed.

- Discovery: an already queued LibVLC playback-frame callback could arrive after a progress-bar scrub returned an exact BestSource frame, replacing the visible canonical identity with an older timestamp sample.
  Evidence: the first actual GIF Extraction E2E stayed on `Playback time` after selecting frame 8 even though the exact command completed without error. An explicit player exact-scrub mode now rejects late playback callbacks until playback is deliberately restarted; the focused regression and three consecutive real Electron capture runs pass.

- Discovery: LibVLC may initially report a zero playback duration while the validated prepared-review manifest already has the correct duration.
  Evidence: the first capture screenshot displayed a zero duration despite a three-second prepared fixture and working canonical frame count. The player now prefers a positive playback duration and otherwise uses the prepared-review duration, preserving accurate progress/time presentation without changing playback authority.

- Discovery: the pinned vcpkg FFmpeg port exposes `x264` only together with its `gpl` feature; enabling it produces one redistributable GPL-covered FFmpeg/FFprobe distribution with `libx264rgb` and built-in AAC. It does not require the nonfree FDK AAC feature.
  Evidence: the pinned port manifest and generated configure line show `--enable-gpl --enable-libx264`, while QSV/libvpl, CUDA/NVENC, AMF, OpenCL, Vulkan, FDK AAC, and other non-selected integrations are explicitly disabled.

- Discovery: Windows Ninja treats dependency-file entries such as `/usr/lib/gcc/...` from the Cygwin MinGW compiler as missing, so a nominally incremental Ninja graph recompiled every source on every invocation.
  Evidence: `ninja -d explain -n` marked the Cygwin system headers dirty. Using Cygwin CMake 3.28 with Unix Makefiles preserved the same compiler/runtime ABI and made the final repeat build compile zero sources (4.70 seconds including dependency/product verification).

- Discovery: vcpkg itself correctly reused the installed FFmpeg/x264 graph, but an unconditional Meson reconfigure rebuilt BestSource twice on each repeat bootstrap.
  Evidence: the production bootstrap now records a manifest-bound BestSource install stamp and validates the required installed outputs; the final measured repeat bootstrap reused LibVLC, all pinned sources, vcpkg packages, and BestSource in 3.48 seconds.

- Discovery: the signed Milestone 2 validation simultaneously said the native target was not wired into Electron and required ordinary app startup to fail if native products were missing. Those conditions cannot both be true in this milestone.
  Evidence: MS2 now supplies a tested standalone product verifier with the explicit `npm run frame-review:build` recovery command, while ordinary startup neither requires nor builds native products. The runtime startup invocation/fail-fast behavior remains an MS3 integration acceptance check.

- Discovery: the repository's existing Loopify path still resolves its legacy `@ffmpeg-installer/ffmpeg` executable independently of the new frame-review distribution.
  Evidence: MS2 removes the two-build split inside the GIF Extraction/native-frame workflow, but deliberately does not rewire an existing production edit path before runtime integration. The migration and legacy dependency removal are now explicit Milestone 7 work, where both extraction and Loopify can be verified against the same staged product.

- Discovery: renderer page-hide teardown destroyed the shared player and global controls before starting asynchronous GIF-session disposal. The trusted main process already prevented final quit until native review/extraction runtimes settled, but renderer ownership order was not explicit or directly tested.
  Evidence: the former `AppController` callback called `void gifExtractionSession?.dispose()` between synchronous control destroys. `ApplicationShutdownCoordinator` now stops new actions, starts and awaits workflow disposal, then destroys remaining controls; focused tests cover success, async deferral, failures, and repeated calls.

- Discovery: prepared-review phases and `cacheHit` already crossed the frame-review service boundary, but `GifExtractionSession` only copied the state message into its screen snapshot. Activity therefore did not receive phase transitions and reported warm readiness like a cold build.
  Evidence: a red-first session test observed no progress callbacks for `cache-validation` or `proxy-encoding`. The session now maps only phase changes to concise Activity messages, includes a real percentage when the backend supplies one, and announces validated cache reuse distinctly.

- Discovery: a real collection-publication failure can be exercised without a production-only test hook by occupying the intended `.txt` collection path with a directory.
  Evidence: the Windows Electron acceptance test let `Extract All` create both MP4s while both membership saves failed, removed only the injected collision, retried publication, and proved the collection referenced both existing outputs without creating `-003`.

## Decision Log

- Decision: use only the spike files selected by `spikes/native-frame-identity-playback/docs/frame-scrub-supporting-player-control-integration-handoof.md` plus their direct compile/test dependencies. Do not inventory, read, or port the spike wholesale.
  Rationale: the spike contains unrelated experiments; the handoff already identifies the proved implementation surface.
  Date/Author: 2026-09-13 / Codex

- Decision: preserve the spike's proved algorithms and tests, but adapt its product semantics where the signed specification differs. In production `A` locks or commits; it never toggles unlock, and the next `Q` begins a new capture.
  Rationale: the spike is implementation evidence, while the signed feature specification is the product authority.
  Date/Author: 2026-09-13 / Codex

- Decision: keep the reusable review backend in `src/frame-review/`, the player and screen controls in `src/ui/`, Electron adapters in `src/adapters/electron/`, and trusted process/runtime composition in `electron/` plus `src/frame-review/host/`.
  Rationale: this follows the repository's domain/application/UI/adapter boundaries and prevents Node, filesystem, FFmpeg, LibVLC, or BestSource access from leaking into renderer controls.
  Date/Author: 2026-09-13 / Codex

- Decision: native dependency bootstrap and native compilation are explicit setup/build operations, never part of normal `npm start` or application startup. Startup loads compatible existing products and fails quickly with a clear `npm run frame-review:build` instruction when they are absent or invalid.
  Rationale: the spike's always-build launch command was useful while proving native behavior but is inappropriate for the production application. Keeping native products outside the TypeScript `build/` directory lets ordinary app builds preserve them.
  Date/Author: 2026-09-13 / Codex

- Decision: add a generic listed-versus-contextual navigation declaration and generic shell-panel contributions to `IAppScreen`; do not branch on GIF screen ids in the shell. GIF Extraction is listed. Refine Gif is contextual, programmatically activated, and represented truthfully while active without being a permanently selectable destination that lacks an input range.
  Rationale: both are real registered screens, but Refine Gif is meaningful only with a selected inexact range. The shell should express that distinction as a reusable contract.
  Date/Author: 2026-09-13 / Codex

- Decision: one `GifExtractionSession` owns the opened source, source generation, prepared-review session, live range queue, destination context, and notifications shared by both screens. `RefineGifSession` owns only staged endpoint replacements for one range until `A` atomically commits them.
  Rationale: this supplies one source of truth, prevents cross-screen DOM mutation, and makes abandoning refinement safe.
  Date/Author: 2026-09-13 / Codex

- Decision: model endpoint kind, queue state, and extraction eligibility with discriminated immutable values rather than `isExact`, `isLocked`, `isExtracting`, and `isCreated` booleans.
  Rationale: a timestamp endpoint cannot accidentally enter the exact extraction API, and impossible state combinations are excluded by construction.
  Date/Author: 2026-09-13 / Codex

- Decision: opening a source computes and validates its source identity before consulting persistent caches. A valid prepared-review hit acquires a lease and performs no index or proxy rebuild. A stale, incomplete, incompatible, or identity-mismatched entry is rebuilt under one-writer coordination.
  Rationale: cache reuse is required, while filename equality alone is not safe proof that cached frame identity belongs to the selected bytes.
  Date/Author: 2026-09-13 / Codex

- Decision: keep persistent review assets under `<app-folder>/frame-index-cache` and `<app-folder>/proxy-cache`, and keep ephemeral thumbnails under Electron user data at `cache/thumbnails`. Clean only the ephemeral thumbnail cache on normal close and the next startup after an abnormal close.
  Rationale: these locations and lifetimes are signed requirements. Renderer code receives opaque identifiers rather than paths.
  Date/Author: 2026-09-13 / Codex

- Decision: resolve the `extraction-tmp` path from the trusted settings store, return an opaque destination handle, and maintain a separate destination `PipelineSession`. Do not switch or mutate the Collection screen's current loaded pipeline merely to publish extracted clips.
  Rationale: destination selection is fixed by the feature and is independent of the user's Collection workspace.
  Date/Author: 2026-09-13 / Codex

- Decision: make source-frame extraction a prototype gate before production integration. The chosen FFmpeg recipe must preserve inclusive first/last canonical frames, original dimensions, and audio from the original source for normal, VFR, timestamp-repaired, and odd-dimension fixtures.
  Rationale: proxy review correctness does not prove export correctness, and the current edit runtime is not a canonical-range exporter.
  Date/Author: 2026-09-13 / Codex

- Decision: use full original-source decode plus ordinal selection as the initial production correctness baseline. Defer coarse input seeking until it can prove the seek landing frame's canonical ordinal for VFR and repaired-timestamp sources.
  Rationale: a 60-second CFR benchmark showed coarse seek was faster in one observation (391 ms versus 622 ms total) and exact for that constructed case, but timestamp-only relative alignment is not a valid general canonical mapping.
  Date/Author: 2026-09-13 / Codex

- Decision: encode proof outputs as MP4 containing lossless H.264 RGB video and 192 kbit/s AAC audio, preserving original width/height and trimming audio on the original frame presentation interval `[PTS(start), PTS(end + 1))` with input timestamps preserved.
  Rationale: all four positive fixtures matched every requested decoded video frame, had zero audio-boundary sample difference, and played in Electron/LibVLC; the negative review-source substitution failed as required. The prototype's two-FFmpeg capability split is a Milestone 2 packaging concern, not application-startup work.
  Date/Author: 2026-09-13 / Codex

- Decision: allocate `<collection-name>-NNN.mp4` inside a serialized destination queue, encode to a unique temporary file, then publish with an exclusive no-overwrite filesystem operation. Keep successful items in a partial batch and leave failed items retryable.
  Rationale: scanning and then invoking FFmpeg with overwrite enabled has a race and violates the no-overwrite requirement.
  Date/Author: 2026-09-13 / Codex

- Decision: if media publication succeeds but collection persistence fails, report a typed publication failure with the retained created-file metadata, display it in Activity and Errors, and retry membership persistence without re-encoding. If the workflow is abandoned, attempt bounded cleanup and report any remaining orphan explicitly.
  Rationale: two independent filesystem publications cannot be assumed atomic. This design never reports half-published state as success and avoids duplicating expensive media work.
  Date/Author: 2026-09-13 / Codex

- Decision: do not introduce QSV, hardware detection, a database, a second editor timeline, a persistent capture queue, arbitrary destination selection, or a clean-movie-name parser in this implementation.
  Rationale: each is outside the signed first-stage scope.
  Date/Author: 2026-09-13 / Codex

- Decision: production uses one pinned vcpkg FFmpeg 9.0 distribution with `gpl` and `x264`, providing both `ffmpeg.exe` and `ffprobe.exe`, built-in AAC, native libraries, and `libx264rgb`.
  Rationale: this eliminates the MS1 prototype's split between an old H.264-capable executable and a current AAC/FFprobe build for the GIF Extraction workflow. Milestone 7 will migrate the existing Loopify runtime to the same staged bytes and remove its legacy package only after parity passes. The GPL consequence is explicit in the manifest and third-party notice; no nonfree or hardware dependency is enabled.
  Date/Author: 2026-09-14 / Codex

- Decision: consolidate Loopify onto the production frame-review FFmpeg distribution in Milestone 7, not during the Milestone 3 prepared-review host port.
  Rationale: Milestone 3 deliberately contains risk by leaving the current edit flow unchanged. Milestone 7 introduces the trusted extraction runtime and its FFmpeg execution boundary, so it is the first point where both callers can share one resolver and be tested together. Normal startup must still never download or compile native products; a missing product produces the explicit setup/build diagnostic.
  Date/Author: 2026-09-14 / Codex

- Decision: use the installed Cygwin CMake/CTest and Unix Makefiles for the production native graph, while vcpkg continues to own pinned dependency builds.
  Rationale: all selected helpers can use the same proved MinGW compiler and runtime. Unlike Windows Ninja with Cygwin dependency paths, this graph performs no source compilation on an unchanged repeat build.
  Date/Author: 2026-09-14 / Codex

- Decision: MS2 validates missing products through `frame-review:verify` and leaves ordinary app startup independent of native products; MS3 must call the verifier or equivalent runtime discovery and fail fast when its newly registered native surface is requested.
  Rationale: failing today’s unrelated Collection/Settings startup before the frame-review runtime is wired would contradict MS2 containment and create a product regression. The explicit build diagnostic is already tested and ready for the integration boundary.
  Date/Author: 2026-09-14 / Codex

- Decision: make renderer shutdown an ordered best-effort sequence owned by `ApplicationShutdownCoordinator`, while keeping Electron main-process `before-quit` disposal as the authoritative barrier for native review and extraction processes.
  Rationale: page hide cannot reliably delay process exit, but it can stop new UI actions and avoid destroying controls before session cleanup settles. The main process can and does hold final quit until abort/cleanup completes.
  Date/Author: 2026-09-20 / Codex

- Decision: publish preparation phase changes to Activity and show numeric progress only when supplied by the backend; do not synthesize percentages or emit per-frame updates. Report `preparedReview.cacheHit` as reuse.
  Rationale: phase names are truthful, actionable progress evidence already available at the session boundary. Invented percentages would misrepresent native work, while per-frame messages would drown the bounded history.
  Date/Author: 2026-09-20 / Codex

## Outcomes & Retrospective

Milestone 1 passed without production or spike source changes. Captured pre-edit baselines were green: root typecheck exited 0; the complete root Vitest run exited 0; Electron E2E passed 17/17; the spike Vitest suite passed 33 files and 126 tests; and the native CTest gate passed 1/1. Final root typecheck and Vitest also passed (50 files, 245 tests). A later full E2E rerun was 16/17 because the existing Activity clipboard assertion read an empty system clipboard, and its focused retry failed the same way; this is recorded above rather than reported as a green final rerun. Fixture generation and the four-case original-source verifier both exited 0, including shifted-range, missing-audio, and review-source-substitution negatives.

The result removes the primary export-feasibility risk: inclusive canonical ordinals can drive original-source MP4 extraction with unchanged dimensions and the corresponding audio interval, including when review timestamps differ from source timestamps. The chosen full-decode recipe favors correctness; a coarse-seek candidate remains a measured but unapproved optimization. The 321x181 output passed actual Electron and LibVLC playback gates.

Milestone 2 established the production native/media foundation without changing application behavior. A clean cache resolved the exact LibVLC, BestSource, vcpkg, FFmpeg 9.0, x264, dav1d, xxHash, libp2p, and nlohmann-json pins. Bootstrap enforces the recorded Node.js and CMake minimums; dependency verification rechecks cached Git revisions as well as the LibVLC archive hash and required artifacts. The final repeat bootstrap took 3.48 seconds without download or compilation; the final repeat native build took 4.70 seconds and compiled zero sources. Native tests cover identity/preview calculations, version/length/payload protocol bounds, exact access, a repeated-frame cache hit, invalid ordinal/command errors, and actual LibVLC playback-frame delivery. The corrupt-copy test reports the package, expected/actual SHA-512, and recovery command, while product verification launches the staged FFmpeg and FFprobe binaries rather than accepting file presence alone.

The single new GIF Extraction FFmpeg distribution reran the complete four-fixture original-source proof successfully and all four outputs played in Electron at source dimensions, including 321x181. The existing Loopify path still uses its legacy FFmpeg package; consolidating it was intentionally not bundled into MS2 and is now scheduled explicitly in Milestone 7. `npm run build` preserved native hashes and modification times. A bounded ordinary `npm start` session showed four Electron processes and zero compiler/CMake/CTest/Ninja/make/Meson/vcpkg processes; all checked native hashes and mtimes were unchanged after exit. The final complete Electron suite passed 17/17. The earlier isolated clipboard failure remains an intermittent test observation of unknown cause, with no demonstrated production consequence.

Milestone 3 wires the prepared-review backend without adding the MS4 player UI. Electron now creates one trusted `FrameReviewHost` per window, folder enumeration attaches opaque source handles, preload exposes only session commands/events, and the strict renderer adapter reconstructs bounded pixel payloads as Blobs. A real MP4-with-audio integration proves provisional LibVLC playback, software BestSource/GOP1 preparation, exact frame identity delivery, same-host reuse, new-host reuse, unchanged cache manifest mtimes, and clean shutdown/restart through the real preload and IPC boundary. Focused tests cover stale cache rebuild, source/protocol invalidation, one-writer coalescing with independent consumer cancellation, late-event suppression, held-arrow acceleration, malformed IPC, and idempotent close. The final gates passed strict typecheck, 59 Vitest files/268 tests, all production native tests, and 18 Electron tests. Later milestones must still implement the visible player/screens and prove extraction/refinement UX, original-source destination publication, partial-batch recovery, packaging, and physical Windows acceptance before the overall plan can complete.

Milestone 4 adds the production renderer surface without duplicating the prepared-review engine. The generic shell now distinguishes listed and contextual screens, mounts per-screen panel contributions by panel id, preserves fold state, consumes Refine Gif's expand request once, and calls deactivation/activation/focus in deterministic order. GIF Extraction and contextual Refine Gif each own local command/center roots but reparent one `FrameReviewPlayerControl`; the control has one progress bar, provisional playback/time seek, exact ordinal scrubbing, playback rate, synchronous displayed capture identity, preparation/error text, pointer and held-arrow stepping, and a play/pause glyph that matches its accessible name. `GifWorkflowKeyboardController` scopes Space/Left/Right/Q/W/A/E to active GIF screens and releases held input on keyup, screen exit, window blur, and teardown. Source selection and renderer-side `ElectronFrameReviewService.open(...)` remain lazy until Milestone 5 supplies the movie-choice/source-handle workflow; no source, cache, or playback engine is reconstructed by screen navigation. Final gates passed strict typecheck, 61 Vitest files/285 tests, and all 19 Electron scenarios. The MS4 Electron test directly inspected GIF Extraction and contextual Refine Gif at 1280x800 and GIF Extraction at 820x650 with a folded Clips panel, proving one physical player/progress bar, stable panel behavior, focus, native-caption clearance, and no horizontal overflow.

Milestone 5 delivered the complete source-bound capture surface. `Q` and `W` replace draft endpoints until `A` locks; the next `Q` starts a new draft. Exact progress-bar scrubbing records canonical identities, ordinary playback records timestamps without pausing, mixed ranges remain visibly inexact, and every draft/locked card retains its captured start image through the opaque ephemeral thumbnail cache. The actual Electron flow proved exact and uninterrupted inexact capture at 1280x800 and 900x680, with normal-close thumbnail removal and no path exposure.

Milestone 6 added local, discardable refinement over the same player and queue. The contextual screen enters paused exact mode, stages two current-generation exact endpoints, and commits one same-id replacement only on `A`; Back before commit preserves the original. The Electron scenario proved two inexact inputs, rollback, Q/W/A replacement, retained exact-card context, Next ordering, Back focus restoration, and narrow/desktop layouts. The independent finish review found no remaining P0-P2 issue after explicit endpoint labels and range context were added.

Milestone 7 made exact ranges productive. The trusted runtime resolves the original source, creates source-dimension H.264 RGB plus AAC MP4s, allocates exclusive numbered names, and lazily persists a separate `extraction-tmp` movie-stem collection without replacing the Collection screen's active pipeline. `E` and `Extract All` preserve successes, expose per-range recovery, and retry membership publication without re-encoding. Loopify and extraction now resolve the same staged FFmpeg product; the legacy installer dependency and fallback were removed. Four production-runtime fixtures and the real Electron two-output flow passed, followed by the independent completed-state visual review.

Milestone 8 closes the feature. Renderer cleanup is now explicitly ordered and failure-contained; main-process shutdown still guarantees native abort and temp cleanup. Activity shows preparation phases and warm-cache reuse, including reviews that are already ready before renderer subscription. Windows Electron tests close during cold preparation and active extraction without `Object has been destroyed`, stale temp workspaces, or broken collection references. A controlled publication collision proved that later batch media survive and retry writes membership without producing another encode. Final automated acceptance passed strict typecheck, 75 Vitest files/342 tests, dependency/native-product verification, production build, all four media-oracle fixtures, and 25/25 Electron scenarios. `git diff --check` reported no whitespace error; its output contained only expected Windows LF-to-CRLF conversion warnings. The repository contains no installed or source/test runtime reference to `@ffmpeg-installer/ffmpeg`.

Acceptance used the non-sensitive fixtures `cfr-audio`, `vfr-audio`, `timestamp-repair`, and `odd-dimensions-audio`, plus a generated MP4-with-audio for cold/warm/restart review. App proofs covered 1280x800, 900x700/680, 820x650, and the existing desktop-shell sizes. The source oracle produced 16, 13, 11, and 9 inclusive frames respectively; all outputs contained H.264 video and AAC audio at 320x180 except the intentionally odd 321x181 case, with zero observed audio-boundary sample difference and exact decoded frame hashes. The timestamp-repair case exported from original time 5.208 seconds while its review derivative began at 0.208 seconds, directly proving original-source rather than proxy input. The fixtures are deterministic synthetic media; automated stream/sample playback evidence replaces subjective speaker audibility, and no claim is made about codecs or platforms outside the signed Windows/software-only scope.

## Context and orientation

Clip Sandbox is a framework-free Electron desktop application. `electron/main.cjs` owns the trusted host and creates the window. `electron/preload.cjs` exposes narrow context-isolated APIs. `index.html` holds the renderer DOM and visual system. `src/app/app-controller.ts` is the composition root. TypeScript compiles to `build/src/...`, and `index.html` loads the emitted application controller.

`src/ui/application-shell-controller.ts` registers `IAppScreen` implementations declared by `src/ui/app-screen.ts`, swaps their command and center roots, manages the shell-owned Pipelines and Clips panels, and reports the active screen to the keyboard map. Production currently registers Collection and Settings. The Clips panel is an empty host that this feature will populate through a generic screen contribution.

`src/domain/pipeline.ts`, `src/domain/collection.ts`, and `src/app/pipeline-session.ts` own pipeline/collection data and active working state. `src/adapters/electron/electron-file-system-service.ts` is the renderer-side persistence adapter. GIF Extraction must reuse those owners for the destination model but use a second session so it does not replace the Collection screen's current pipeline.

The existing edited-clip route is useful only as a trust-boundary pattern: `src/business-logic/clip-editor.ts` calls `src/adapters/electron/electron-video-edit-service.ts`, which crosses `electron/preload.cjs` into `electron/video-edit-runtime.cjs`. The new extractor needs a separate typed request because canonical source-frame endpoints, audio bounds, no-overwrite allocation, and partial publication are new invariants.

The native-frame spike is not production code. `spikes/native-frame-identity-playback/docs/frame-scrub-supporting-player-control-integration-handoof.md` is the source map and `spikes/native-frame-identity-playback/docs/backend-design.md` is the responsibility design. Read only the handoff-selected files and any direct imports or tests necessary to compile and preserve them. The selected design uses LibVLC for playback/audio, BestSource for canonical frame identity, and a cached software-generated GOP1 review proxy. It carries display pixels and their frame identity together and uses bounded latest-frame delivery plus a separate adjacent-step scheduler.

Definitions used in this plan:

- A **canonical frame ordinal** is the zero-based stable position assigned by the BestSource index for the selected source video stream.
- An **exact endpoint** contains a canonical frame ordinal and the source identity/generation it belongs to.
- A **timestamp endpoint** records player review time while ordinary playback is active. It is deliberately inexact even if it visually lands on a decoded frame.
- A **prepared review** is the validated combination of source identity, frame index, canonical frame map, GOP1 proxy, and reader/playback metadata needed for exact scrubbing.
- A **lease** keeps a prepared review and its native resources alive for one owner and releases them idempotently.
- A **source generation** increments whenever a movie is replaced or invalidated. Late asynchronous results from older generations must be ignored and disposed.
- A **locked range** is a completed `Q`/`W` selection accepted with `A`. Only a locked range can become extraction-eligible.
- A **contextual screen** is a registered app screen that can be activated programmatically with valid input but is not a permanent top-level selector choice.
- **Exclusive publication** means finalizing a file only if the destination name does not already exist, including when another process creates that name after the initial directory scan.

The target data flow is:

    GIF Extraction / Refine Gif controls
      -> one GifExtractionSession and RangeCaptureModel
      -> renderer-safe IFrameReviewService / IClipExtractionService
      -> Electron adapters and preload validation
      -> trusted FrameReviewHost / ClipExtractionRuntime
      -> LibVLC, BestSource, FFmpeg, persistent review caches, and original source
      -> destination PipelineSession and Collection persistence

The renderer never receives the original source path, cache paths, destination root, executable paths, or raw process arguments. It receives opaque handles, safe display metadata, bounded image payloads, progress events, and typed success/failure results.

## Planned contracts and ownership

Finalize names only after the consumer sketches below exist as tests. Authored interfaces use `I` plus PascalCase.

`src/frame-review/frame-review-api.ts` will declare renderer-safe values and `IFrameReviewService`. `openMovie()` opens a native chooser, validates the chosen source media in the host, and returns either a cancelled result or an `IFrameReviewSession`. The session exposes display-state subscriptions, playback commands, progress-bar seeking, exact adjacent stepping, a synchronous snapshot of the currently displayed capture point, and idempotent disposal. It does not expose a path.

The player owns the most recently rendered pixels and their associated identity. Therefore `capturePoint()` is synchronous at keydown: in playback it returns a timestamp endpoint from the displayed playback sample; in exact scrub mode it returns the canonical identity carried with that displayed frame. It never asks another process for a later clock value that could disagree with the visible picture.

`src/domain/capture-endpoint.ts` will define the discriminated endpoint values. `src/domain/captured-range.ts` will define immutable draft/locked exact and inexact ranges. `src/domain/range-capture-model.ts` will be the only owner of `Q`/`W`/`A` transitions and range queue states. `A` never unlocks. While a draft is unlocked, a later `Q` or `W` replaces that endpoint. After lock, `W` does nothing except return an explanatory transition result; the next `Q` archives the locked capture if necessary and begins a fresh draft.

The queue will expose discriminated entries equivalent to `draft`, `needs-exact-frames`, `ready-to-extract`, `extracting`, `created`, `extraction-failed`, and `publication-failed`. Exact extraction accepts an `ExactCapturedRange`, not the broader captured-range union. Derived labels and enabled states come from these variants rather than independently mutable booleans.

`src/app/gif-extraction-session.ts` will own source attachment/invalidation, one `RangeCaptureModel`, one prepared-review lease, destination readiness, and session listeners. `src/app/refine-gif-session.ts` will stage one endpoint at a time for one inexact range and return an exact immutable replacement only when both endpoints belong to the current source generation and form a valid inclusive range. Cancelling or navigating back before `A` discards the staging object only.

`src/app/clip-extraction-workflow.ts` will coordinate typed exact ranges, the trusted extraction adapter, destination `PipelineSession`, collection serialization/persistence through an opaque destination handle, queue-state transitions, retries, and Activity callbacks. FFmpeg and filesystem code remain outside this class.

`src/ui/frame-review-player-control.ts` will own the player DOM, rendering, transport, mode/readiness display, single progress bar, Left/Right tap and accelerated hold behavior, and focus. One physical player-control instance is shared by both GIF screens and mounted into the active screen's player slot so playback/review state is not duplicated. `src/ui/gif-workflow-keyboard-controller.ts` will bind `Q`, `W`, `A`, and context-valid `E` to a supplied active command target and ignore editable controls/modifiers. `src/ui/gif-ranges-panel-control.ts` will render start-picture thumbnails and all status/action states from the shared session.

The three shell caller sketches that must become tests before the API is finalized are:

1. Collection and Settings register as listed screens with no Clips contribution and keep their existing focus/commands.
2. GIF Extraction registers as listed, contributes the shared ranges control to the Clips host, and preserves the user's current fold state on ordinary activation.
3. Refine Gif registers as contextual, contributes the same shared ranges control in needs-refinement mode, requests the Clips panel open on entry, and remains identified as the active screen without a permanent unusable selector option.

The three player/session caller sketches are:

1. Cold open reports preparation phases, then enables exact scrub only after proxy, frame map, and reader validation complete.
2. Warm open of unchanged source acquires the valid prepared review without invoking index or proxy builders.
3. Source replacement cancels the old generation, disposes its lease/session, clears its live capture state, and suppresses any later old-generation frame/progress event.

The extraction caller sketches are:

1. `Extract` accepts only the current locked exact refined range.
2. `Extract All` takes a snapshot of all and only `ready-to-extract` entries, keeps successful items, and leaves individual failures retryable.
3. A media-success/collection-save-failure result retries collection membership without rerunning FFmpeg and never appears as a created range until both publications succeed.

## Milestone 1 - Baselines and original-source extraction proof

### Scope

Capture the current passing baselines and remove the highest export uncertainty before changing production architecture. Build deterministic media fixtures and prove a concrete software FFmpeg recipe that maps inclusive canonical frame ordinals back to the original source, preserves source dimensions, and includes the corresponding original-source audio interval.

The hypothesis is that the existing BestSource index can expose enough original presentation metadata to select exact video frames from the original source and align audio without using proxy timestamps. The prototype passes only if decoded output proves the selected first and last frames and all signed media properties.

### Changes

- File: `docs/research/gif-extraction-original-source-proof.md`
  Edit: record fixture construction, candidate commands, chosen ordinal-to-source-time mapping, output codec/pixel-format policy, measured results, known limitations, and the final production recipe. Do not treat a visual spot check as proof.
- Directory: `tests/fixtures/gif-extraction/`
  Edit: add small reproducible fixture-generation inputs/scripts or checked-in metadata sufficient to generate: constant-frame-rate video with audio, variable-frame-rate video with audio, timestamp-repair input, no-audio input for negative validation, and an odd-dimension input. Avoid committing large generated binaries if the script can reproduce them.
- File: `tools/gif-extraction/create-fixtures.ps1`
  Edit: create fixtures with the repository FFmpeg, fail on any process error, write BOM-free machine-readable manifests, and record expected dimensions, streams, frame count, per-frame hashes, and presentation intervals.
- File: `tools/gif-extraction/verify-extraction.ps1`
  Edit: use `ffprobe` and decoded frame/audio evidence to assert output dimensions equal the original, output frame count is `end - start + 1`, first and last decoded frame hashes match the requested canonical source frames, an audio stream is present when the source has selected audio, and decoded audio boundaries are within one output audio sample plus unavoidable container timestamp rounding.
- File: `.gitignore`
  Edit: ignore only the generated GIF-extraction fixture, BestSource cache, proof-output, and temporary media subtree; keep the generator, manifest, verifier, and proof report reviewable.
- Spike files: only the handoff-selected frame-index/session code and direct dependencies.
  Edit: add the smallest temporary diagnostic or test hook needed to expose original-source ordinal/presentation metadata. Keep prototype changes inside the spike until the result proves the production contract.

The proof must compare at least two feasible recipes when needed: full source decode with an ordinal-selecting filter, and coarse source seek followed by decoded ordinal alignment. Select correctness first. Record latency on one representative longer MP4, but do not invent a performance pass threshold in this milestone.

If no MP4-compatible codec/pixel-format combination preserves the odd source dimensions with acceptable playback in the Electron/LibVLC stack, stop and record the exact limitation for a product decision. Do not resize or pad silently.

### Validation

- Command: `npm run typecheck`
  Expected: exits 0 before production edits.
- Command: `npm run unit`
  Expected: all existing Vitest tests pass before production edits.
- Command: `npx playwright test --reporter=line`
  Expected: all existing Electron scenarios pass with a complete summary and exit code 0.
- Command: `npm --prefix spikes/native-frame-identity-playback test`
  Expected: the handoff implementation's JavaScript/TypeScript regression suite passes before adaptation.
- Command: `npm --prefix spikes/native-frame-identity-playback run native:test`
  Expected: selected native frame identity, prepared review, playback, and cache tests pass on the configured Windows toolchain; if prerequisites are absent, record the exact missing prerequisite and use Milestone 2 to install only the pinned local dependencies.
- Command: `powershell -ExecutionPolicy Bypass -File tools/gif-extraction/create-fixtures.ps1`
  Expected: deterministic fixture manifest and media are produced without overwriting unrelated files.
- Command: `powershell -ExecutionPolicy Bypass -File tools/gif-extraction/verify-extraction.ps1 -All`
  Expected: all fixture cases pass first/last hash, inclusive count, dimensions, selected-stream, audio-bound, and no-proxy-input assertions. A deliberately shifted endpoint and a no-audio source fail with the expected typed/diagnostic reason.

### Rollback/Containment

Keep all prototype artifacts under `tests/fixtures/gif-extraction/generated/` and an ignored temporary output directory. If the proof fails, remove only those generated artifacts, retain the report and failing verification, and do not begin production export or claim the signed source-fidelity behavior is feasible.

## Milestone 2 - Reproducible software-only native toolchain

### Scope

Create a production-owned, pinned Windows native build for the exact-frame backend without pulling unrelated spike experiments into the app. Preserve the proved LibVLC + BestSource + software FFmpeg path and its native regression tests.

### Changes

- File: `tools/frame-review/dependency-manifest.json`
  Edit: copy and trim the spike's pinned manifest to the dependencies actually used by the selected software path. Retain versions, hashes, licenses/notices, and architecture.
- Files: `tools/frame-review/bootstrap-native.ps1`, `tools/frame-review/bootstrap-bestsource.ps1`, `tools/frame-review/build-native.ps1`, and `tools/frame-review/test-native.ps1`
  Edit: adapt only the handoff-required bootstrap/build/test logic. Make scripts idempotent, path-safe, non-interactive, and explicit about failed external processes. Store downloaded/build dependencies below an ignored `tools/frame-review/.deps/` and products below an ignored `native-build/frame-review/`. Compile each native target through an incremental build graph rather than the spike's unconditional sequence of direct compiler calls.
- Directory: `native/frame-review/`
  Edit: port the selected CMake target, protocol primitives, media-service entry point, LibVLC engine, BestSource prepared-video session, source scan/signature/index helpers, and direct compile dependencies. Preserve algorithms and regression fixtures unless a production boundary requires a documented adaptation.
- File: `.gitignore`
  Edit: ignore only generated frame-review dependency, native-build, fixture-output, proxy/index test-output, and transient log directories. Do not hide source, manifests, reports, or expected fixtures.
- File: `package.json`
  Edit: add explicit `frame-review:bootstrap`, `frame-review:build`, `frame-review:test`, and `frame-review:verify` commands. Neither `start` nor application runtime may invoke bootstrap or native compilation. Do not put native output under `build/`. Do not add hardware/QSV packages or bump Electron without separately proved necessity.
- File: `docs/third-party-notices.md` or the repository's existing equivalent
  Edit: add the runtime/build dependency notices and redistribution obligations actually introduced.

The native helper protocol remains versioned and length-bounded. Reject unknown message kinds, invalid dimensions/strides, oversized payloads, invalid frame ordinals, and unsupported protocol versions before allocation or decode.

### Validation

- Command: `npm run frame-review:bootstrap`
  Expected: a clean run resolves only pinned software dependencies; a second run reports reusable valid dependencies and performs no unnecessary rebuild/download.
- Command: `npm run frame-review:build`
  Expected: the native helper builds in `native-build/frame-review/`; a subsequent `npm run build` does not delete it.
- Command: `npm run frame-review:test`
  Expected: the ported handoff-selected native tests pass, including source identity, prepared review, canonical frame access, cache validation, playback, bounded protocol, and cancellation cases.
- Command: `npm run build`
  Expected: TypeScript production build passes and leaves the native output intact.
- Startup check: record native product hashes and modification times, launch and close the ordinary app once, then compare them.
  Expected: startup invokes no compiler, CMake, vcpkg, Meson, or bootstrap script; all native product hashes and modification times are unchanged. In MS2 the standalone product verifier fails quickly with the explicit build command when products are absent; once MS3 registers the native runtime, that same fail-fast behavior becomes part of runtime startup/discovery.
- Negative check: corrupt one copied dependency in an isolated test cache, then run the bootstrap verifier.
  Expected: hash validation fails before the dependency is used and reports the exact package, expected hash, and recovery action.

### Rollback/Containment

The native target is not wired into Electron in this milestone. If it fails, remove only `native-build/frame-review/` and `tools/frame-review/.deps/`; production app behavior remains unchanged. Keep source/test ports and evidence for repair.

## Milestone 3 - Prepared-review host, cache reuse, and renderer-safe service

### Scope

Turn the selected spike behavior into a production backend with explicit owners, persistent cache reuse, source generations, bounded frame delivery, and a narrow renderer-safe service. Opening a movie remains capture-disabled until the prepared review is ready; a valid warm cache hit skips index and proxy creation.

### Changes

- Files under `src/frame-review/model/`: `source-frame-identity.ts`, `frame-review-state.ts`, `prepared-review.ts`, and `backend-error.ts`
  Edit: define immutable source/session identifiers, canonical frame identities, prepared-review metadata, progress phases, and typed expected failures. Parse all wire values; never trust structural casts.
- File: `src/frame-review/frame-review-api.ts`
  Edit: declare `IFrameReviewService`, `IFrameReviewSession`, display-frame/capture-point events, playback/scrub commands, and idempotent disposal. Keep host-only fields out of renderer types.
- Files under `src/frame-review/`: `adjacent-step-scheduler.ts`, `progressive-frame-mailbox.ts`, `scrub-request-scheduler.ts`, and `binary-frame-protocol.ts`
  Edit: port the tested bounded scheduling and pixels-plus-identity delivery behavior. Long-held Left/Right uses the adjacent-step scheduler; progress-bar scrubbing uses the latest-request scheduler. These remain distinct workloads.
- Files under `src/frame-review/host/`: `frame-review-paths.ts`, `source-inspector.ts`, `source-normalizer.ts`, `bestsource-frame-indexer.ts`, `frame-index-cache.ts`, `ffmpeg-proxy-creator.ts`, `frame-map-validator.ts`, `prepared-review-cache.ts`, `review-preparation-service.ts`, `libvlc-playback-engine.ts`, `bestsource-frame-reader.ts`, `native-process-client.ts`, `review-session.ts`, and `frame-review-host.ts`
  Edit: implement the responsibility split in `backend-design.md`. `FrameReviewHost` owns per-window sessions and opaque source handles. `ReviewSession` owns its prepared-review lease, reader, playback engine, source generation, and idempotent shutdown. `PreparedReviewCache` is the physical prepared-asset owner and coordinates one writer per identity; `FrameIndexCache` remains its focused collaborator. Start provisional original-source playback as soon as inspection permits while preparation continues; keep capture disabled until exact-review readiness.
- File: `electron/frame-review-ipc.cjs`
  Edit: compose the built host for one `BrowserWindow`, validate every inbound payload, correlate operations with bounded ids, translate expected failures, and close handles on window/app teardown.
- Files: `electron/main.cjs` and `electron/preload.cjs`
  Edit: register/remove the frame-review IPC handlers and expose only the narrow review API under context isolation. Keep source and cache paths in main. Inject a semantic application-folder path into `FrameReviewPaths`: use the project application directory in development and the directory containing the installed executable in a packaged build. Resolve persistent caches as `<app-folder>/frame-index-cache` and `<app-folder>/proxy-cache`; create them when needed and surface permission failures. Do not mistake an `app.asar` archive path for a writable directory.
- File: `tsconfig.strict-src.json`
  Edit: include `src/frame-review/**/*.ts` in the strict production-source gate.
- File: `src/adapters/electron/electron-frame-review-service.ts`
  Edit: implement the renderer interface, validate the preload boundary, own subscription cleanup, reconstruct Blob/image payloads safely, and suppress events after disposal or generation replacement.
- Tests: focused new files under `tests/unit/frame-review/`, `tests/integration/frame-review/`, and Electron API fixtures.
  Edit: port relevant spike regressions and add consumer-first tests for the three session sketches, cache hits/misses/stale entries, one-writer behavior, failure/cancellation, malformed IPC, late events, and close ordering.

Cache entries must include source identity, selected stream identity, native/protocol/tool versions, index/map metadata, and proxy metadata. A cache hit is valid only when all invariants validate. Incomplete temporary entries are ignored and cleaned by the cache owner. Persistent proxy/index assets are never deleted by ordinary app shutdown.

### Validation

- Command: `npm run typecheck`
  Expected: strict TypeScript passes, including compile-time tests that timestamp endpoints and host-only path values cannot enter exact renderer APIs.
- Command: `npm run unit -- --run tests/unit/frame-review tests/integration/frame-review`
  Expected: focused review tests pass, including cold preparation, warm hit with zero builder calls, stale rebuild, cancellation, source generation, bounded mailboxes, accelerated hold, and idempotent disposal.
- Command: `npm run frame-review:verify`
  Expected: native protocol and media regression gates pass using the production-owned build.
- Electron integration check: open the same fixture twice in one run and after restart while recording phase events and cache mtimes.
  Expected: first open builds; second and post-restart opens validate/reuse; proxy/index builder counts remain unchanged and cache mtimes do not change on the valid hit.
- Negative checks: invalidate source bytes, cache metadata, protocol version, and cache writability one at a time.
  Expected: source/cache mismatches rebuild safely; incompatible protocol and unwritable mandated cache paths block readiness with actionable Activity details; no stale frame reaches the renderer.

### Rollback/Containment

Keep the new host behind an unregistered preload surface until this milestone passes. Existing Collection/Settings and edit flows remain unchanged. Failed cache entries use temporary names and may be removed without touching validated entries or user media.

## Milestone 4 - Reusable player and generic screen/panel integration

### Scope

Embed the tested player behavior in the existing Clip Sandbox visual system and extend the shell generically for listed/contextual screens and per-screen panel content. This milestone creates real screen shells and player behavior but not range capture or export.

### Changes

- File: `src/ui/app-screen.ts`
  Edit: add a small discriminated navigation declaration, optional generic panel contributions, and an activation/deactivation lifecycle needed by contextual screens, shared-control mounting, and shortcut scoping. Keep Collection and Settings call sites explicit.
- File: `src/ui/application-shell-controller.ts`
  Edit: implement listed/contextual selector behavior, mount/unmount panel contributions without screen-id checks, preserve per-panel fold state, honor a contribution's one-time `expand-on-entry` request, and invoke lifecycle callbacks in deterministic order. A contextual active screen gets a truthful temporary selector label and can be left for any listed screen.
- File: `src/ui/foldable-panel-controller.ts`
  Edit: add a semantic idempotent `expand()` operation used by generic contributions. Preserve focus transfer, transition reversal, reduced motion, and existing layout callbacks.
- Files: `src/ui/frame-review-player-control.ts` and `src/ui/gif-workflow-keyboard-controller.ts`
  Edit: adapt the spike's player/control and keyboard behavior to production DOM injection. Include playback/audio, pause, playback rate, one progress bar, exact mode, progress dragging, single-step arrows, held-arrow acceleration, synchronous displayed capture point, readiness/error presentation, focus, reparenting between the two screen slots, and teardown. Do not add a filmstrip or second timeline.
- Files: `src/ui/gif-extraction-screen.ts` and `src/ui/refine-gif-screen.ts`
  Edit: create registered screen owners with local command roots and activation behavior. Initially render honest empty/no-range states and the shared player surface; range-specific content arrives in later milestones.
- File: `index.html`
  Edit: add both center roots and command roots using existing tokens, spacing, hierarchy, native overlay safe area, panel geometry, responsive rules, and reduced-motion treatment. Replace the Clips placeholder with a generic contribution host. No framework or new component library is introduced.
- File: `src/app/app-controller.ts`
  Edit: compose the Electron review adapter, shared player dependencies, both screen objects, and shell registrations. Keep construction/wiring here; move workflow behavior into the new owners instead of growing new methods in this already large composition file.
- Tests: `tests/unit/application-shell-controller.spec.ts`, `tests/unit/foldable-panel-controller.spec.ts`, new player/keyboard tests, `tests/unit/app-dom.spec.ts`, and `tests/integration/app/app-controller.spec.ts`.
  Edit: add the three shell caller sketches before final signatures, plus player control and shortcut-scope behavior.

The player is one physical control and one review session shared across the two screen surfaces. Screen activation reparents its root without reconstructing the player, duplicating a playback engine, or rebuilding prepared assets. Native ownership remains leased and generation-checked.

### Validation

- Command: `npm run typecheck`
  Expected: strict TypeScript passes with no renderer import of `src/frame-review/host/`, Node, Electron, FFmpeg, LibVLC, or filesystem modules.
- Command: `npm run unit -- --run tests/unit/application-shell-controller.spec.ts tests/unit/foldable-panel-controller.spec.ts tests/unit/frame-review-player-control.spec.ts tests/unit/gif-workflow-keyboard-controller.spec.ts tests/unit/app-dom.spec.ts tests/integration/app/app-controller.spec.ts`
  Expected: all shell callers, activation ordering, panel contribution, exact/playback mode, progress bar, arrow tap/hold, shortcut scoping, focus, and teardown tests pass.
- Command: `npx playwright test --reporter=line -g "GIF Extraction|Refine Gif|screen navigation|side panels"`
  Expected: both screens render in the actual Electron window; GIF Extraction is a listed destination, Refine Gif is contextual, panel folding/reveal and resize remain stable, and there is exactly one movie progress bar and no secondary timeline.
- Manual visual check: inspect at the normal desktop target and the existing narrow supported size with both panels open and each folded.
  Expected: the player remains primary and usable; no overlap with native caption controls; focus indicators, disabled readiness, typography, density, and motion fit the existing visual system.

### Rollback/Containment

Land shell contract changes with passing legacy Collection/Settings tests before registering the new screens. If player integration fails, keep the screens hidden from production registration while retaining isolated tests; do not alter the existing Zoom/edit player path.

## Milestone 5 - Shared capture session, range cards, thumbnails, and GIF Extraction

### Scope

Deliver the complete capture-side workflow: open a movie, wait for exact preparation, capture timestamp or exact endpoints with `Q`/`W`, lock with `A`, continue playback for inexact captures, show the start-frame thumbnail and status in the Clips panel, and begin another capture with the next `Q`.

### Changes

- Files: `src/domain/capture-endpoint.ts`, `src/domain/captured-range.ts`, and `src/domain/range-capture-model.ts`
  Edit: implement immutable endpoint/range values and the explicit draft/locked queue state machine. Validate source generation, endpoint order, inclusive exact ranges, missing endpoints, replacement-before-lock, `A` lock-only semantics, and next-`Q` behavior.
- File: `src/app/gif-extraction-session.ts`
  Edit: own movie selection, review-session lease, source generation, range model, destination context placeholder, observable snapshots, and lifecycle. Clear source-bound ranges on confirmed source replacement; no capture queue is persisted across app restarts.
- Files: `electron/thumbnail-cache-runtime.cjs`, `electron/main.cjs`, and `electron/preload.cjs`
  Edit: own the ephemeral `app.getPath('userData')/cache/thumbnails` directory, accept validated bounded PNG bytes, return opaque thumbnail ids, load by id, and clean the directory at startup and after native handles close on normal shutdown. Never return thumbnail paths.
- File: `src/adapters/electron/electron-thumbnail-cache-service.ts`
  Edit: save/load/delete thumbnail payloads through the narrow preload API, bound byte sizes, construct/revoke renderer Blob URLs, and handle missing cache entries with a placeholder plus actionable retry state.
- File: `src/ui/gif-ranges-panel-control.ts`
  Edit: render the draft and locked queue from session snapshots. Each card shows the captured start picture, endpoint summary, exact or visually distinct `Needs exact frames` state, selection, available local actions, extraction state placeholders, and accessible labels. Inexact start thumbnails are valid timestamp-sampled pictures.
- Files: `src/ui/gif-extraction-screen.ts` and `src/ui/gif-workflow-keyboard-controller.ts`
  Edit: wire `Open movie...`, player readiness, `Q`, `W`, `A`, panel contribution, mode-sensitive endpoint capture, focus restoration, and source replacement. Playback `Q`/`W` does not pause or enter exact mode. Exact-scrub `Q`/`W` records canonical frame identity. Capture remains disabled until prepared review readiness.
- Files: `src/app/app-controller.ts` and `index.html`
  Edit: compose the session, thumbnail service, panel control, screen, Activity callbacks, and exact visual states without adding workflow logic to the composition root.
- Tests: new domain, session, thumbnail-runtime, panel, screen, and Electron capture-flow tests.
  Edit: cover exact, inexact, mixed endpoints, repeated marks, lock, next capture, thumbnail identity/lifecycle, source invalidation, preparation failure, keyboard focus/modifiers, and playback continuity.

Mode changes must be explicit player actions, not automatic consequences of `Q`, `W`, or `A`. Either timestamp endpoint makes the locked range inexact. A locked range cannot be edited in place on the capture screen; refinement is the next milestone.

### Validation

- Command: `npm run unit -- --run tests/unit/range-capture-model.spec.ts tests/unit/gif-extraction-session.spec.ts tests/unit/thumbnail-cache-runtime.spec.ts tests/integration/ui/gif-ranges-panel-control.spec.ts tests/integration/ui/gif-extraction-screen.spec.ts`
  Expected: the full Q/W/A state table passes, including mixed exactness and next-Q behavior; thumbnail and stale-generation cases pass.
- Command: `npx playwright test --reporter=line -g "capture ranges|GIF Extraction"`
  Expected: playback-mode marking keeps video/audio moving; exact-mode marking uses displayed canonical identities; `A` locks; the next `Q` begins a new capture; cards show the start picture and correct visual state.
- Cache lifecycle check: populate both prepared caches and the thumbnail cache, close normally, restart, and simulate an abnormal prior exit.
  Expected: prepared frame-index/proxy entries remain; ephemeral thumbnails are cleaned on normal close or next startup; no path is exposed to renderer state.
- Accessibility check: keyboard-only open, playback, progress scrub, capture, panel navigation, fold/reveal, and focus restoration.
  Expected: all controls are reachable and named; shortcuts do not fire in editable fields or inactive screens.

### Rollback/Containment

The queue is in memory and source-bound. On failure, dispose the session and clean only its ephemeral thumbnail ids. Never remove persistent valid review assets or modify a destination pipeline in this milestone.

## Milestone 6 - Refine Gif and atomic exact replacement

### Scope

Deliver the focused refinement mini-flow. Double-click or `Refine` opens one inexact range in Refine Gif, pauses in exact scrub mode near the relevant approximate endpoint, resolves Start and End one at a time, commits both with `A`, and immediately updates the shared panel. This milestone establishes that `E` is eligible only for the current locked exact range; Milestone 7 connects that command to real extraction.

### Changes

- File: `src/app/refine-gif-session.ts`
  Edit: implement one-range staging with original-value preservation, current endpoint focus, approximate seek input, exact endpoint replacement, validity checks, atomic commit, cancellation, removed-range/source-generation invalidation, next-inexact ordering, and notifications through `GifExtractionSession`.
- File: `src/app/gif-extraction-session.ts`
  Edit: add begin/commit/abandon refinement operations by opaque range id. Commit replaces exactly one immutable queue entry and leaves ordering, thumbnail, and unrelated extraction states intact.
- File: `src/ui/refine-gif-screen.ts`
  Edit: render the selected range, Start/End focus, approximate timestamp, current exact frame identity, `Set exact start`, `Set exact end`, `A`, `Extract`, `Next inexact clip`, and `Back to GIF Extraction`. Use the same player control behavior and one progress bar. On entry request exact mode and pause only after the target frame is displayed.
- File: `src/ui/gif-ranges-panel-control.ts`
  Edit: add needs-refinement filtering, selected-range state, double-click and `Refine` activation, `Extract All` placement, and the post-commit exception that keeps the just-refined now-exact item visible until the next/back continuation.
- File: `src/ui/gif-workflow-keyboard-controller.ts`
  Edit: scope `E` eligibility to a committed current exact refinement and route it through an injected extraction command that remains unavailable until Milestone 7. `Q`, `W`, `A`, arrows, and Space retain their shared meanings; no shortcut leaks to an inactive screen.
- Files: `src/app/app-controller.ts` and `index.html`
  Edit: compose contextual navigation/back/focus behavior and refine-specific layout/states without duplicating the queue or prepared-review owner.
- Tests: new refinement session, screen, panel, navigation, and Electron tests.
  Edit: cover both-timestamp, mixed endpoint, reversed endpoint, invalidated source, removed range, leave-before-A, immediate panel replacement, next ordering, back focus, and exact-only E eligibility.

### Validation

- Command: `npm run unit -- --run tests/unit/refine-gif-session.spec.ts tests/integration/ui/refine-gif-screen.spec.ts tests/integration/ui/gif-ranges-panel-control.spec.ts tests/unit/application-shell-controller.spec.ts`
  Expected: staging is isolated, `A` commits only two valid current-generation exact endpoints, cancellation preserves the original, and panel/navigation behavior is deterministic.
- Command: `npx playwright test --reporter=line -g "Refine Gif|refine inexact"`
  Expected: double-click and local action open the contextual screen with Clips expanded; the player is paused exact near the approximate endpoint; Start/End resolution, commit, immediate visual update, Next, Back, and focus restoration work in the real app.
- Negative manual check: leave Refine Gif after changing one staged endpoint but before `A`.
  Expected: returning to GIF Extraction shows the original inexact range unchanged and no extraction action enabled for it.

### Rollback/Containment

Refinement writes nothing until `A`; abandoning the screen discards only its staging object. If contextual navigation fails, disable the `Refine` entry points while retaining capture behavior and tests. Do not auto-snap timestamps or mutate the original queue as a fallback.

## Milestone 7 - Exact extraction, destination publication, batches, and shared FFmpeg

### Scope

Create real MP4 clips from the original source using only locked exact ranges. Resolve/create `extraction-tmp`, lazily create or reuse the movie-stem collection after the first successful media extraction, allocate `<collection-name>-NNN.mp4` without overwrite, preserve source dimensions/audio, and implement `Extract`, `E`, and `Extract All` with partial-success recovery. Migrate Loopify to the same pinned, staged FFmpeg executable and remove the legacy `@ffmpeg-installer/ffmpeg` distribution after both workflows pass parity checks.

### Changes

- File: `src/business-logic/clip-extractor.ts`
  Edit: validate an `ExactCapturedRange`, source handle/generation, destination handle, selected stream metadata, and collection/output name values before calling the injected service. Timestamp-bearing ranges cannot construct the request type.
- File: `src/app/clip-extraction-workflow.ts`
  Edit: own single and batch orchestration, eligible-range snapshotting, per-entry state transitions, destination/collection lazy creation, movie-stem naming, membership persistence, retry-without-reencode after publication failure, cancellation, continuation after individual failure, and Activity messages.
- File: `src/app/extraction-destination-session.ts`
  Edit: own the separate `PipelineSession`, fixed system-pipeline handle, current movie-stem collection, and lazy persistence. Reuse an existing same-stem collection. Keep same-stem/different-source collision detection deferred exactly as the spec states.
- File: `src/app/pipeline-session.ts`
  Edit: add the narrow cohesive operation needed to publish a created clip into a named collection and update pipeline clip metadata without replacing the active pipeline. Preserve current callers.
- Files: `src/domain/pipeline.ts` and `src/domain/collection.ts`
  Edit: only add validation or an atomic model mutation method if the new destination operation cannot be expressed through existing owners. Keep collection filename formatting and membership with `Collection`.
- File: `src/frame-review/clip-extraction-api.ts`
  Edit: declare renderer-safe opaque destination, destination-snapshot, exact extraction, collection-persistence, progress, cancellation, created-media, and typed publication result contracts. `openExtractionDestination()` resolves the fixed system pipeline and returns its opaque handle plus safe folder-entry metadata; `saveCollection()` accepts that handle, a validated top-level filename, and serialized collection text. No request or result contains an absolute path.
- File: `src/adapters/electron/electron-clip-extraction-service.ts`
  Edit: implement the renderer boundary and reject malformed preload results.
- File: `electron/clip-extraction-runtime.cjs`
  Edit: resolve `pipelinesRootPath` from the trusted `AppSettingsStore`, ensure the fixed `extraction-tmp` directory, issue/validate its opaque destination handle, return safe directory-entry snapshots, and persist validated top-level collection files through that handle. Validate the opaque source handle through `FrameReviewHost`, derive original-source frame/audio boundaries from the prepared metadata, serialize allocations per destination collection, scan suffixes from `001`, encode to a unique temporary file, verify it, and publish with an exclusive no-overwrite operation such as `fs.copyFile(..., COPYFILE_EXCL)`. Use the Milestone 1 recipe and source stream selection; never read the review proxy as export input.
- Files: `electron/ffmpeg-resolver.cjs`, `electron/video-edit-runtime.cjs`, and the shared native-product locator introduced by Milestone 3
  Edit: make extraction and Loopify resolve the same verified staged `ffmpeg.exe` bytes in development and packaged layouts. Preserve Loopify's existing arguments, output behavior, and injectable test seam. Missing products return the explicit `npm run frame-review:bootstrap` / `npm run frame-review:build` recovery diagnostic and never trigger either command from application startup or an edit request.
- Files: `package.json`, `package-lock.json`, `tools/ffmpeg/current-binary.json`, and `tools/ffmpeg/README.md`
  Edit: after shared-product parity passes, remove `@ffmpeg-installer/ffmpeg` and its platform packages plus the obsolete legacy manifest/documentation. Do not retain a silent fallback to the old executable or ship two production FFmpeg distributions.
- Files: `electron/main.cjs`, `electron/preload.cjs`, and `electron/app-settings-store.cjs` only if a narrow read operation is absent
  Edit: register the extraction/destination boundary, validate request sizes/enums/handles, manage cancellation and shutdown, and remove handlers deterministically. Do not accept a renderer-provided pipeline root or output path.
- Files: `src/ui/gif-ranges-panel-control.ts`, `src/ui/gif-extraction-screen.ts`, and `src/ui/refine-gif-screen.ts`
  Edit: enable `Extract All` and current-range `Extract`/`E` from typed eligibility, show per-range progress/success/failure/retry, preserve successful items, and keep actionable failures.
- Tests: business/domain/session/runtime/IPC/UI/E2E extraction tests, Loopify resolver/runtime regressions, `tests/e2e/fullscreen-identity.spec.ts`, and Milestone 1 media oracle reuse.
  Edit: cover first collection creation, existing collection reuse, sequence allocation/gaps, external collision, no overwrite, missing pipeline root, invalid handle/generation, source invalidation, FFmpeg failure, collection-save failure without re-encode, partial batch, cancellation, exact-only eligibility, both callers resolving the identical executable, existing Loopify output behavior, and removal of every runtime/test dependency on the legacy package.

Collection creation is lazy: do not create a collection file when the screen opens, the movie opens, a range locks, or an extraction fails before media success. The initial collection name is the filename stem. The clean-movie-name algorithm is deferred; when later introduced, it will replace both the collection name and the movie-name component of future naming rules.

### Validation

- Command: `npm run unit -- --run tests/unit/clip-extractor.spec.ts tests/unit/clip-extraction-workflow.spec.ts tests/unit/extraction-destination-session.spec.ts tests/unit/clip-extraction-runtime.spec.ts tests/integration/ui/gif-ranges-panel-control.spec.ts`
  Expected: all eligibility, naming, lazy creation, exclusive allocation, partial batch, publication recovery, and trust-boundary cases pass.
- Command: `powershell -ExecutionPolicy Bypass -File tools/gif-extraction/verify-extraction.ps1 -All -Runtime electron/clip-extraction-runtime.cjs`
  Expected: production runtime outputs pass original-input, inclusive-frame, first/last hash, dimensions, video/audio stream, audio-bound, and no-overwrite checks for all supported fixtures.
- Command: `npx playwright test --reporter=line -g "Extract All|extract current|extraction-tmp|partial batch"`
  Expected: GIF Extraction and Refine Gif actions publish real files, update range cards, reuse the collection, continue after one failure, and expose retry without duplicate encode or overwrite.
- Filesystem check: inspect the configured pipeline root after first success and after further successes.
  Expected: `<pipelines-root>/extraction-tmp/` is created when needed; one collection named from the source filename stem exists; output files are `<collection-name>-001.mp4`, `-002.mp4`, and so on with gaps permitted after failure; existing files are byte-for-byte unchanged.
- Negative check: attempt extraction with one timestamp endpoint, a stale source generation, an invalid opaque handle, and an externally occupied next suffix.
  Expected: timestamp/stale/invalid requests never launch FFmpeg; the collision advances safely; no existing file is overwritten.
- Shared-product check: run focused resolver/runtime tests and the existing Loopify Electron scenario, then inspect the installed dependency tree and runtime resolution paths.
  Expected: extraction and Loopify execute the identical staged FFmpeg bytes; Loopify still creates and inserts its playable derived clip; `npm ls @ffmpeg-installer/ffmpeg` reports no installed production dependency; no source, fixture generator, resolver, manifest, or packaged path references `@ffmpeg-installer`.

### Rollback/Containment

All encodes use a feature-owned temporary directory and exclusive final publication. On failure, delete only the operation's own temporary file. Keep successful final clips and collection membership. Preserve failed queue entries for retry. Never delete or overwrite pre-existing destination files. Report any cleanup or membership failure with the exact recoverable state. Keep the legacy Loopify package until the shared resolver and Loopify parity tests pass in the same change; if migration fails, retain the old resolver/dependency rather than leaving Loopify without an executable. Do not add runtime fallback selection between two FFmpeg distributions.

### Execution record

Milestone 7 was governed by `using-97`, `api-and-interface-design`, `domain-modeling`, `typescript-coding`, `writing-clean-code`, `testing-discipline`, `error-and-correctness-traps`, `security-and-trust-boundaries`, `observability`, `build-deploy-and-tooling`, `before-you-refactor`, `impeccable`, `doc-update`, `cost-aware-delegation`, `pre-commit-self-review`, and `coding-quality.md`. The staged FFmpeg/FFprobe processes require the locator-provided runtime-library environment, and the pinned FFmpeg build does not provide the synthetic `lavfi` input used by one old test fixture; the migrated fixture now supplies raw video frames while production extraction remains original-source-only.

## Milestone 8 - Lifecycle, documentation, full regression, and real-app acceptance

### Scope

Harden the complete flow, update canonical architecture knowledge, prove regression safety, and perform the actual Windows workflow with representative media. This is the only milestone that may close the feature.

### Changes

- File: `src/app/app-controller.ts`
  Edit: complete page-hide/window-close teardown ordering: stop new actions, cancel preparation/extraction, detach renderer subscriptions, dispose refinement and extraction sessions, release prepared-review leases/native processes, clean ephemeral thumbnails, then destroy shell/global controls. Keep destruction idempotent.
- Files: `src/ui/activity-indicator-control.ts` and callers only if existing APIs cannot express the required phases
  Edit: show preparation phase/progress, cache reuse, extraction progress, individual batch failures, publication repair, and actionable native/cache/process details without per-frame noise. Preserve bounded history and unresolved error behavior.
- File: `docs/agent-docs/agent-architecture-map.md`
  Edit: document the two new screens, contextual navigation/panel contribution contract, shared `GifExtractionSession`, prepared-review/native host, cache locations/lifetimes, opaque IPC handles, original-source extraction route, separate destination session, and lifecycle ownership. Use the `doc-update` workflow and point to current code rather than this historical plan.
- File: `docs/specs/gif-extraction-workflow-spec.md`
  Edit: only if implementation reveals an agreed specification correction. Record the reason in this plan's Decision Log; do not silently rewrite signed behavior.
- File: this ExecPlan
  Edit: update Progress, Skill Gates, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective with commands, counts, manual evidence, deviations, and remaining work.
- Tests: complete impacted unit/integration/E2E suites and stable fixture cleanup.
  Edit: add any missing app-close, process-crash, cache-corruption, retry, focus, source-switch, and regression cases discovered by real-app QA.

### Validation

- Command: `npm run typecheck`
  Expected: normal and strict TypeScript checks pass.
- Command: `npm run unit`
  Expected: the complete unit/integration suite passes with a final file/test count recorded in this plan.
- Command: `npm run frame-review:verify`
  Expected: the production native helper and selected regression suite pass from the pinned toolchain.
- Command: `npx playwright test --reporter=line`
  Expected: the complete Electron E2E suite finishes with a summary and exit code 0.
- Command: `npm run build`
  Expected: clean renderer/main build passes, native products remain present, and no generated cache/fixture/native output is accidentally tracked.
- Command: `git diff --check`
  Expected: no new whitespace errors. Any pre-existing unrelated issue is identified and left untouched.
- Command: `git status --short`
  Expected: only intended source, test, toolchain, documentation, and lock/manifest changes appear; no caches, native products, source movies, generated fixtures, or temporary outputs are tracked.

Perform one real Windows Electron acceptance session with a representative MP4 that has audio and another source that exercises VFR or timestamp repair:

1. Cold-open the movie and observe capture disabled during preparation, phase progress in the command bar/Activity, then exact-scrub readiness.
2. Close and reopen the same source and prove the valid index/proxy are reused without rebuild.
3. During audible playback mark `Q`, `W`, `A` repeatedly and prove playback continues; verify inexact cards and start-picture thumbnails.
4. Enter exact mode with the existing progress bar, step and hold Left/Right, capture/lock an exact range, and prove displayed identity follows the visible frame.
5. Refine an all-timestamp range and a mixed range. Leave once before `A` to prove rollback; then commit, observe the immediate exact visual change, use Next and Back, and verify focus.
6. Use `E` for the current refined range and `Extract All` from both screens. Inject one controlled failure and prove later items continue, successful items remain, and retry does not duplicate work.
7. Inspect outputs with the media verifier and play them with audio. Confirm source dimensions, requested first/last frames, inclusive count, and original-source input.
8. Confirm lazy `extraction-tmp`/collection creation, same-stem reuse, suffix allocation, no overwrite, and Collection-screen active-pipeline continuity.
9. Run Loopify and one extraction in the same packaged-layout session, verify both resolve the identical staged FFmpeg executable, and confirm the legacy installer package is absent.
10. Fold/reveal panels, resize, navigate among Collection, Settings, GIF Extraction, and Refine Gif, and verify keyboard scope, accessible names, focus indicators, no second timeline, and no visual regression.
11. Close during preparation and extraction in controlled runs, restart, and verify no orphan native process, no stale UI event, ephemeral thumbnail cleanup, persistent prepared-cache survival, and an honest recoverable destination state.

Record the movies' non-sensitive fixture identifiers, app dimensions, observable results, generated output metadata, and any limitation in this plan. Do not record user-private absolute paths in committed evidence.

### Rollback/Containment

If full acceptance fails, keep the failing milestone open and disable the narrow broken action or screen registration without removing successful user-created clips. Persistent prepared caches may be deleted only by explicit, validated entry in test/diagnostic tooling; thumbnail and operation-owned temporary files remain safe cleanup targets. Existing Collection, Settings, Zoom, and edit workflows must stay usable while repair continues.

## Final completion criteria

The plan is complete only when all Progress items are checked and the following are evidenced:

1. Both screens are production `IAppScreen` registrations with no shell id branch; Refine Gif has valid contextual entry/back behavior.
2. The existing player behavior is integrated, including preparation, playback/audio, single progress bar, exact scrubbing, and accelerated arrow hold.
3. Warm open reuses valid persistent proxy/index caches; invalid entries rebuild safely; thumbnail cleanup does not delete prepared assets.
4. `Q`/`W`/`A` behavior matches the signed exact/inexact and lock semantics, and every card shows its start picture.
5. Refinement stages locally, commits atomically, updates the shared panel immediately, and never exports timestamps.
6. `Extract`, `E`, and `Extract All` act only on eligible locked exact ranges and implement partial-success/retry behavior.
7. Created MP4s come from the original source, preserve source dimensions, contain the selected audio, and match inclusive canonical first/last frames.
8. `extraction-tmp`, collection naming/reuse, `<collection-name>-NNN.mp4`, lazy creation, and no-overwrite behavior are proven.
9. Loopify and GIF Extraction use the identical verified FFmpeg product, and no legacy `@ffmpeg-installer` production or test dependency remains.
10. Automated suites, native verification, media oracle, and real Windows Electron QA pass with complete output and exit codes.
11. Canonical agent documentation describes the durable architecture, and final self-review finds no unexplained deviation from `coding-quality.md` or the signed specification.
