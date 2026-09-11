# Encapsulation corrections and verification

Date: 2026-09-10. User approved the report and its suggested correction order. Work stayed on master under the earlier explicit instruction; existing unrelated changes were preserved. No commit was made and no UI coding guideline was added.

## Acceptance goal

Fullscreen review, selection and Zoom keep the same canonical clip/source/metadata identity; components own their DOM, presentation state and pending work, and exposed domain references cannot leave dirty state or source identity inconsistent.

## Changes in the report's order

1. **F1/F2:** FullscreenSession owns digit input and scheduling, passing slot values and rotation/cancellation requests. The grid owns visibility, pending ended listener cleanup, looping restoration and intact card rotation. CSS order preserves the outgoing visual slot without moving canonical DOM order or swapping sources. Exit, restore, view replacement/invalidation, restart and disposal cancel pending work. Restored hidden previews restart playback. Page teardown disposes the fullscreen scheduler and grid. No card/video handles or shared mutable state bag cross the fullscreen boundary.
2. **F3/F5:** Dirty state is derived from current names versus the saved collection/pipeline baseline on every read. A shared sequence can still be deliberately mutated, but it cannot leave a stale dirty flag. Canonical Clip objects remain shared. Clip and Pipeline take immutable File snapshots; extension fields are readonly/frozen, File/Blob bytes remain usable, and Clip's source is derived from the one snapshot rather than cached separately. Construction and replaceFile both enforce this boundary.
3. **F4:** Grid fields, selection/cache internals, metadata handlers, card lookup and rendering helpers are private. Context-menu callbacks carry semantic data without a card handle. Dialog/menu/metadata/Zoom fields and adapter dependencies are private; raw grid and Zoom video getters are gone. Zoom construction helpers and transport-handle helpers are private. Negative TypeScript consumer checks reject selection/cache writes, raw DOM getters, fullscreen/menu/tracker state writes and source metadata mutation. TypeScript privacy is an API boundary, not a security boundary against arbitrary JS reflection.
4. **F6:** Grid applies its own DOM layout. Removed the app layout closure and DomRendererAdapter, moving its geometry assertions into grid behavior tests. Pure calculation and explicit standalone height allocation remain injectable. The existing optional toolbar outer-surface measurement remains a deliberate standalone contract, not descendant access.

**C1 retained after reconsideration:** Desktop folder paths are an explicit public Windows-first edit/storage contract. There is no demonstrated private access or permission bypass to repair. A new source/destination capability would change several working APIs without a current alternate storage need; defer that representation change until such a need makes its benefit concrete. This follows the report's conditional recommendation, rather than claiming C1 was implemented.

## Evidence

- Baseline: `npm run unit`, 48 files / 229 tests passed before source edits.
- Reproduction: new source-alias test failed with B instead of A; escaped-sequence test failed with dirty=false after reorder. Both passed after correction.
- New grid capability test initially failed because rotation was not owned/exposed by the grid. It now checks source/id stability, metadata association, selection/Zoom request, visual-slot order and restoration. Separate lifecycle coverage checks old events after view replacement, restart and disposal. Earlier review probes independently established the old swap mismatch.
- `npm run unit`: 49 files / 234 tests passed. Subsequent localized cleanup was rechecked with affected domain/grid/Zoom suites (42 tests for source/layout cleanup, Zoom: 8 passed; the grid label fixture initially expected the default formatter instead of its injected formatter, was corrected, and all 22 grid tests then passed).
- `npm run typecheck` passed including strict source and negative consumer-access cases; `npm run build` passed.
- Existing Electron suite: 14 tests passed, covering panel allocation, native frames, resize, utilities, settings, collection changes, persistence/deletion and Loopify.
- New `tests/e2e/fullscreen-identity.spec.ts`: natural rotation with four generated real MP4s, colors orange/blue/green/red, durations 1/2/3/4 seconds and landscape/portrait/square dimensions. Uses normal fullscreen controls and waits for real media completion; no synthetic ended event or internal owner mutation. Verifies all cards' source/id/metadata before/after rotation and exit, selection, then Zoom source/duration/dimensions. Passed initially and again after final visual-slot correction (8.3-second scenario).
- Captured actual Electron fullscreen and Zoom images were visually inspected. Evidence paths: `test-results/encapsulation-fullscreen.png`, `test-results/encapsulation-zoom.png`. The browser-driven scenario is automated actual-app QA, not a claim of an independent human manual session or exhaustive playback soak.
- Focused diff/caller/design review completed. Scope-only diff whitespace check is clean; repository-wide check also reports pre-existing trailing whitespace in `docs/feature-requests.md:11`, left untouched.

## Design and remaining boundaries

The code follows coding-quality.md: state and behavior stay together, presentation layout remains in UI, orchestration uses capabilities, and no storage framework or new dependency was added. Three concrete capability call sites are entry/slot input, scheduled rotation and exit/disposal; the integration tests exercise the grid as a caller would. Governed by using-97, before-you-refactor, typescript-coding, API/interface design, bugfix-by-failing-test, testing-discipline, writing-clean-code, correctness/lifecycle guidance, doc-update, cost-aware-delegation and pre-commit-self-review.

This completes the report's six actionable corrections, not a proof of universal encapsulation or correctness across every runtime method. Existing preview playback remains best-effort with swallowed play rejections. The ZoomVideoEditWorkflow callback/finally hazard was subsequently fixed under explicit authorization; see [editing recovery and playback assessment](editing-recovery-and-playback-assessment.md). No video player control was implemented.

One Luna/medium packet tightened eight controllers. Root inspected its diffs, checked callers, added focused type rejection checks and retained acceptance. Small root additions, no interruption/restart, measured savings unknown. See [delegation ledger](encapsulation-fixes-delegation-log.md).
