# Side-panel evaluation

## Current choice — local panel host, 2026-09-07

User confirmed this choice as settled. The panel-library comparison is closed. Remaining visual polish and production-integration checks below remain required; the confirmation does not turn unverified behavior into a pass. Web Awesome remains a separate option for other controls.

**The comparison supports building the narrow panel host locally.** The user authorized verifying this alternative against the same pilot. A local CSS Grid implementation passes the existing F1-F8 checks, the previously failing untouched-panel motion assertion, and the same real-grid continuity check. The Web Awesome implementation remains reproducible and still fails that motion assertion after the harness changes.

| Evidence | Web Awesome integration | Local host |
|---|---|---|
| Untouched right width during left fold | 240 -> 260.53 -> 240 pixels | Exactly 240 throughout sampled frames |
| Endpoint, reversal, keyboard/focus, reduced motion | Pass | Pass |
| Settled resizing at 800/1100/1440 pixels | Pass | Pass |
| Eight grid cards/videos retained; one video's playback continues | Pass | Pass |
| Grid card-height drift after 500 ms | 0 pixels | 0 pixels |
| Panel TypeScript, nonblank lines including fixture initialization | 35 | 32 |
| Minified panel JS, excluding shared grid bundle/styles | 38,756 bytes | 957 bytes |

The local host uses two nested ordinary grids with explicit pixel tracks and flexible workspace tracks. Five local CSS rules supply layout/transition behavior, alongside the unchanged shared theme/content-motion CSS. It reuses the focus/ARIA logic already owned by the application. There is no percentage conversion, panel ResizeObserver, external panel runtime, custom animation loop or dependency patch. The separate real-grid fixture still uses its documented ResizeObserver bridge in both versions.

The comparison preserves the Web Awesome source and derives local.html from the same HTML fixture at build time, changing the host tags, controller and layout stylesheet. Tests differ only in launch choice, readiness and artifact destinations; the width/focus/geometry assertions are shared. The upstream orientation probe is skipped for the local version because it tests a splitter API this host does not expose. Its absence is not counted as a local pass. No acceptance threshold was weakened.

Reproduce from the repository root:

```powershell
$env:PANEL_IMPL = 'local'
npm --prefix sandbox/component-library-evaluation run test:panel
npm --prefix sandbox/component-library-evaluation run test:motion
npm --prefix sandbox/component-library-evaluation run test:grid
& .\node_modules\.bin\electron.cmd .\sandbox\component-library-evaluation\launch.cjs --grid --user-data-dir=sandbox/component-library-evaluation/artifacts/local/review-profile
Remove-Item Env:PANEL_IMPL
```

With PANEL_IMPL unset, the commands run Web Awesome; its test:motion remains an expected failure. Local evidence: [checks](../../sandbox/component-library-evaluation/artifacts/local/results.json), [motion](../../sandbox/component-library-evaluation/artifacts/local/source-probes.json), [real grid](../../sandbox/component-library-evaluation/artifacts/local/grid-results.json), [screenshot](../../sandbox/component-library-evaluation/artifacts/local/two-panels.png). Generated artifacts and local.html are ignored.

Static appearance was inspected. Continuous-motion appearance still needs direct user review; column-count changes, shadow-DOM focus and production lifecycle integration remain unverified, as in the preceding comparison. This establishes the implementation direction, not completion of the production shell. Stop the panel-library comparison here; Web Awesome may still be evaluated for other controls whose behavior it actually supplies.

Final code review: the local class owns only fold presentation, preserves the shared focus rules, and adds no generalized component framework. Fixture dimensions and document-lifetime listeners remain deliberate pilot limitations. Adjacent issues: none found in touched files. No new delegation was warranted for this small coupled change; production files and root dependencies remain unchanged.

## Previous Web Awesome result — 2026-09-07

**Not accepted yet: transient two-panel motion failure.** Following user review of the first pass, the fixture now has left and right panels. Endpoint, keyboard/focus, rapid-reversal and reduced-motion checks pass. Resizing to 800, 1100 and 1440 pixels preserves settled dimensions and adjacent edges. However, folding only the left makes the untouched right panel briefly grow from 240 to 260.53 pixels, then return. The new continuous-width assertion fails. This supersedes the initial promising verdict below.

The real-grid fixture imports the existing ClipCollectionGridController, Clip/ClipSequence, computeBestGrid and DomRendererAdapter without modifying production code. Eight actual card/video elements remain identical during simultaneous folding; one muted looping test video keeps playing without pause, emptied or loadstart events. Edges remain adjacent, and card height does not drift after 500 ms. This fixture stayed at three columns: column-count changes and their settlement behavior are **not proven**. It uses a sandbox ResizeObserver bridge, not a production shell integration. Performance and perceived smoothness are not certified by these assertions.

The extended static test caught a CSS specificity error in my right-side reduced-motion rules; it failed before correction and passed afterwards. No library patch or nested-motion workaround was attempted. The motion failure triggers the agreed stopping rule; no fallback candidate was installed.

Current commands from the repository root:

```powershell
npm --prefix sandbox/component-library-evaluation run test:panel
npm --prefix sandbox/component-library-evaluation run test:grid
npm --prefix sandbox/component-library-evaluation run test:motion
npm --prefix sandbox/component-library-evaluation start -- --grid
```

`test:panel` and `test:grid` pass. `test:motion` retains the failing untouched-panel-width assertion. Builds typecheck the local TypeScript adapter; the JavaScript grid fixture bundles existing production modules without changing their compiler policy. Generated evidence: [two panels](../../sandbox/component-library-evaluation/artifacts/two-panels.png), [grid screenshot](../../sandbox/component-library-evaluation/artifacts/real-grid.png), [grid measurements](../../sandbox/component-library-evaluation/artifacts/grid-results.json), [motion/source probes](../../sandbox/component-library-evaluation/artifacts/source-probes.json). These ignored files are reproduced by the commands.

The [panel code-quality assessment](web-awesome-panel-code-review.md) records the integration blocker, a reproduced upstream orientation defect and qualified robustness concerns. The [17-row coverage inventory](web-awesome-coverage-evidence.md) shows broad Core coverage, a paid stable Combobox, and local ownership of drag/drop and specialized media behavior. Catalog breadth does not waive panel acceptance.

Root review found no adjacent unsafe-code issues in the authored sandbox files or touched document sections. Root manifests and production files remain unchanged. One coverage delegation wrote a partial artifact before a usage-limit failure; root source checks corrected three status/version claims. Outcome: partial, moderate verification/rework, savings inconclusive. No further agents were launched.

## Historical first pass — 2026-09-06

2026-09-06. **Promising; further evaluation only.** Web Awesome passes the small automated pilot with modest integration. Static appearance was inspected. Perceived continuous motion remains unverified, so this is not panel acceptance or a production-library selection.

The user-visible goal is to fold/reveal one docked panel while the workspace receives its width, keyboard focus remains reachable, and reduced motion is respected. The approved contract and stopping rules are in [MS2](../plans/application-shell-and-global-surfaces-exec-plan.md#milestone-2---small-side-panel-first-pass).

## Candidate and ownership

Tested `@awesome.me/webawesome` **3.12.0**, exact version in the isolated sandbox lockfile. Split Panel is a free MIT component. Its [official documentation](https://webawesome.com/docs/components/split-panel) supplies start/end slots, `positionInPixels`, `primary`, `disabled`, and public divider CSS properties. These support a docked, width-sharing fixture. Built-in collapse is not required by the revised contract.

| Responsibility | Owner in this pilot |
|---|---|
| Adjacent panel/workspace sizing | Web Awesome Split Panel, through public pixel position |
| Fold state, reveal rail, ARIA and focus transfer | Local TypeScript and HTML |
| Width transition, content translation, reduced motion | Ordinary local CSS |
| Colors, spacing and static workspace | Local CSS/HTML using DESIGN.md |

The adapter contains 32 nonblank TypeScript lines. The stylesheet has 24 nonblank lines, including the entire fixture theme; this count is not a maintenance-cost verdict. No library patch, private selector, frame loop, animation queue or replacement animation engine is used. Drag resizing is disabled and untested. Host grid-track interpolation works in the pinned version, but its continued animatability is an upgrade assumption to recheck.

This proves inexpensive adaptation is possible here. It does **not** establish that the library saves more code than a native layout: most folding behavior remains ours. That is a concrete remaining selection question, not grounds for an automatic broader comparison.

The broader inventory and paid/experimental gaps remain in the [MS1 research](component-library-candidates.md). Spectrum Gen1 Split View remains the fallback only if a named concern warrants another pilot. Zag's local DOM/behavior burden remains a concern. No second candidate or other control was implemented.

## Verification evidence

All checks ran in real Electron 37.10.3, at 1440 x 900 CSS pixels, device scale 1, with networking blocked and renderer Node access disabled.

| Check | Result |
|---|---|
| F1 width | Pass: 240 -> 36 -> 240; workspace gains 204 pixels and returns; adjacent edges within 1 pixel. Open/folded screenshots inspected. |
| F2 reversal | Automated portion passes: reversal at 141.39 pixels stayed at 141.39 immediately, then moved toward open; settled at 240 with no later stale close. Continuous-motion appearance **unverified**. |
| F3 keyboard/focus | Pass: Enter folds, Space reveals; ARIA reflects state; Tab skips hidden content; disappearing content transfers focus; unrelated workspace focus remains. |
| F4 reduced motion | Pass: both spatial transitions compute to 0 seconds; bounds and focus remain correct. |
| F5 runtime/adaptation | Pass: strict TypeScript, no renderer/load errors with network blocked, no privileged renderer access, public integration reviewed. Static styling inspected. |

Before adding the adapter, the same fold-width assertion failed: the panel remained approximately 240 pixels instead of 36. This established that the check detects missing behavior. The initial successful run was followed by one run adding the contract's explicit edge-adjacency assertion; both successful runs passed. No unrelated application suite was run.

Generated evidence: [results](../../sandbox/component-library-evaluation/artifacts/results.json), [open screenshot](../../sandbox/component-library-evaluation/artifacts/open.png), [folded screenshot](../../sandbox/component-library-evaluation/artifacts/folded.png). Artifacts are ignored and regenerated by the command below. The executable fixture is retained for interactive motion replay; there is no recorded-video verdict.

## Reproduce and review

From the repository root, with its normal development dependencies already installed:

```powershell
npm ci --prefix sandbox/component-library-evaluation --ignore-scripts --no-audit --no-fund
npm --prefix sandbox/component-library-evaluation run test:panel
npm --prefix sandbox/component-library-evaluation start
```

In the window, use Fold and the vertical Pipelines button, including reversing a fold before it finishes. Inspect coordinated edges and content movement continuously. Tab/Enter/Space exercise the same controls. Close the window to end the launcher.

The sandbox reuses root Electron, Playwright, TypeScript and the existing transitive esbuild 0.21.5. Bundling resolves the component's bare Lit imports; only Split Panel is imported. The resulting minified JS is 38,645 bytes, including local code and dependency runtime, before compression. This is a pilot artifact measurement, not whole-library cost. The isolated install added 35 packages and reported the transitive `node-domexception@1.0.0` deprecation; builds produced no warnings. Root manifests and production code remain unchanged.

## Decision and stop

Stop after this first candidate's small pass. Review motion and the ownership split before deciding whether to extend it. Opposite-side independence, narrow/resize behavior, rapid sequences, settlement behavior, and the winner-only real-grid check remain deferred. No claim is made about those behaviors or the rest of the catalog.

The final review against coding-quality.md found no material architecture deviation: one local presentation class, with no generic candidate abstraction. Its listeners live for the fixture document lifetime; reusable production lifecycle handling is outside this pilot. Adjacent issues: none found in the new authored files or the touched plan sections. No new delegation was used; this bounded integration and its acceptance decision stayed with the root under the cost-aware-delegation gate.
