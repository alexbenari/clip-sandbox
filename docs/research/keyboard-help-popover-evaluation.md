# Keyboard-help popover pilot

2026-09-07. **Retain Web Awesome Popover 3.12.0 as a candidate with a confirmed fast-keyboard edge case; adoption is unresolved.** The initial categorical rejection was too broad given the user's successful manual experience. Ordinary behavior and rapid pointer clicks pass. The follow-up below establishes a specific user-reachable failure, without claiming that it occurs frequently. The settled local-panel choice is unaffected.

## Follow-up: actual control input

User reported no usability issue and authorized testing realistic control paths before deciding whether the programmatic race warrants rejection. A separate check sends browser mouse/keyboard input, with no assignments to component state. Recorded events all have isTrusted=true. This is automated input through the real controls, not a human-observed incidence study.

| Flow | Requested gap | Trials | Result |
|---|---|---|---|
| Three trigger clicks: open/close/open | 100 ms | 2 | Pass; actual click gaps 109–116 ms |
| Three trigger clicks | 200 ms | 2 | Pass; actual gaps 212–219 ms |
| Three trigger clicks | 350 ms | 2 | Pass; actual gaps 355–371 ms |
| Open fully, Escape, then Enter on returned trigger | 100 ms | 2 | **Fail**; actual Escape-to-Enter gaps 107 and 116 ms |
| Open fully, Escape, then Enter | 200 ms | 2 | Pass; actual gaps 212 and 219 ms |
| Open fully, Escape, then Enter | 350 ms | 2 | Pass; actual gaps 356 and 370 ms |

Each trial begins with a reload and checks state, visibility, trigger ARIA and focus after 700 ms. Both failures leave open=true, aria-expanded=true, a closed internal dialog and focus outside the help control. The 150 ms closing animation is the relevant integration window; this sampling does not establish an exact safe threshold or failure probability.

Conclusion: the user's ordinary-use experience is consistent with the evidence. The race is not merely a direct-property stress artifact, but neither does it justify calling the entire control unusable. Keep the candidate and the defect visible; resolve or explicitly accept this edge-case constraint before production adoption. Do not automatically start a local replacement or another broad comparison.

Reproduce from repository root: `npm --prefix sandbox/component-library-evaluation run test:popover-input`. It currently exits nonzero for the two fast-keyboard failures. [Input evidence](../../sandbox/component-library-evaluation/artifacts/popover/input-results.json) records timing and targets; [failure screenshot](../../sandbox/component-library-evaluation/artifacts/popover/escape-then-enter-100-failure.png) and [check source](../../sandbox/component-library-evaluation/check-popover-input.mjs) preserve the reproduction. No runtime implementation changed in this follow-up. Adjacent issues: none found in touched files.

## Contract and scope

The user approved one keyboard-help surface, using existing styling and representative content, to test anchoring/collision, outside-click/Escape dismissal, keyboard access, focus return and reduced motion. Spec sections 10, 12.2, 12.4 and 13 supply the behavior. One interrupted open/close/open check applies the existing latest-request-wins requirement; it is not a second component pilot.

The fixture contains Collection context, its adjacent note, a Global section, illustrative semantic keycaps, and one Close button. No shortcut dispatch, remapping, production screen registration, Activity model, second utility, alternative library, or production dependency was added.

## Ownership and evidence

The [official Popover API](https://webawesome.com/docs/components/popover) documents anchor binding, autofocus, positioning, dismissal, lifecycle events, durations and styling parts. The pinned installed package is the same 3.12.0 used in previous pilots. The pilot imports only Popover and its dependencies, with locally served assets and network blocked.

| Responsibility | Owner |
|---|---|
| Anchor click binding, open state, positioning and viewport collision adjustment | Web Awesome |
| Escape/outside-click and declarative Close-button dismissal | Web Awesome |
| Initial autofocus and built-in reveal/hide animation | Web Awesome |
| Trigger aria-expanded, focus restoration after every ordinary close path | Local event handlers |
| Read-only help content, screen context and visual tokens | Local HTML/CSS |

The local TypeScript file has 16 nonblank lines, including import, fixture validation and initialization. No custom position calculation, private mutation or replacement animation engine is used. Styling sets public tokens, two duration properties (190 ms opening/150 ms closing), a body part and ordinary content CSS. Minified popover JS including dependencies and local integration is 71,171 bytes before compression; shared styles are excluded. This is a component-pilot measurement, not the whole library's size.

The first test ran with only the component import and failed because the trigger stayed aria-expanded=false after opening. Public show/hide events supply the small missing integration. A later outside-click test initially targeted a button covered by the popover; it was corrected to an actual outside point, without forcing a click through the surface. Screenshots wait for settled opacity rather than capturing mid-reveal.

## Results

| Check | Result |
|---|---|
| U1 keyboard and read-only content | Pass: Enter/Space open, Close autofocus, Escape/Close return invoking focus, ARIA reflects state, keycaps are not inputs or tab stops. |
| U2 outside dismissal | Pass: click outside dismisses and restores invoking focus, matching the current spec; workspace geometry is unchanged. |
| U3 anchoring/collision | Pass: normal body begins 10 pixels below trigger; stays within 1440/420-pixel windows; bottom-edge trigger causes flip above. |
| U4 reduced motion | Pass: public show/hide durations are 0 ms, same open/close/focus outcomes. |
| U5 runtime | Pass: strict local TypeScript build, no captured renderer/load errors with networking blocked. |
| U6 interrupted transition | **Fail:** open, wait 45 ms, close, wait 45 ms, open; after 500 ms `open=true` but internal dialog is closed. Both integrated and bare components fail. |

Static screenshots were inspected. Perceived continuous motion, screen-reader naming/announcements, utility-to-utility transfer and long Activity content are not certified. The ordinary keyboard tests are not a complete accessibility audit.

## Failure mechanism and stopping decision

Reviewed installed `dist/chunks/chunk.G6CPCG3F.js`, containing Popover.handleOpenChange. The hide branch awaits its animation, then deactivates the popup and closes the dialog without checking whether a later open request superseded it. The helper `animateWithClass` in `chunk.L6CIKOFQ.js` does not provide a request-generation guard for that caller. This explains the observed stale close. No patch or workaround was added.

Public event wiring cannot prevent an already-running hide branch from later closing the internal dialog. Adding a queue would conflict with the required interruption behavior. The initial pilot stopped rather than replacing the component's animation/state handling. The subsequent control-input check above narrows the adoption concern; no correction, alternative primitive or replacement is selected by this report.

## Reproduce

From repository root with the existing sandbox dependencies installed:

```powershell
npm --prefix sandbox/component-library-evaluation run test:popover
$env:PILOT_SURFACE = 'popover'
& .\node_modules\.bin\electron.cmd .\sandbox\component-library-evaluation\launch.cjs --user-data-dir=sandbox/component-library-evaluation/artifacts/popover/review-profile
Remove-Item Env:PILOT_SURFACE
```

The check intentionally exits nonzero at U6. Generated evidence: [results](../../sandbox/component-library-evaluation/artifacts/popover/results.json), [wide screenshot](../../sandbox/component-library-evaluation/artifacts/popover/width-1440.png), [narrow screenshot](../../sandbox/component-library-evaluation/artifacts/popover/width-420.png), [edge flip](../../sandbox/component-library-evaluation/artifacts/popover/bottom-edge.png). Sources: [controller](../../sandbox/component-library-evaluation/src/popover-pilot.ts), [shared check and bare reproduction](../../sandbox/component-library-evaluation/check-popover.mjs), [fixture](../../sandbox/component-library-evaluation/popover.html). Generated evidence is ignored and reproducible.

Final review against coding-quality.md: one focused presentation class; document-lifetime listeners are deliberate for this fixture. Existing using-97, TypeScript, clean-code, testing, correctness, tooling and Impeccable guidance governed the work; pre-commit-self-review governed the closeout. No delegation was warranted for this small coupled task. Adjacent issues: none found in authored/touched files. Production files and root manifests remain unchanged; no unrelated application tests were run.
