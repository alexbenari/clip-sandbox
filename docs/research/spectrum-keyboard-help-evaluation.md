# Spectrum keyboard-help pilot

2026-09-07. **Spectrum Gen1 is a viable alternative, but this pilot does not establish a decisive advantage over Web Awesome.** Ordinary behavior passes with similarly small integration code. Spectrum has a different fast-keyboard limitation and a larger measured bundle. Its broader free catalog remains a reason to keep it available, not proof that untested components fit our application. Stop this comparison here; do not expand the candidate list or reopen the settled local-panel choice.

## Contract and scope

Goal: users can open readable keyboard help from the header, dismiss it by Escape, Close or outside click, regain invoking focus, and continue in an unchanged workspace; the surface stays anchored and within the viewport, respects reduced motion and works offline.

Reused the Web Awesome fixture's content, native buttons, content styles, navy colors, 16px corners, 18px padding and 190/150ms opening/closing durations. Spectrum uses `sp-overlay` and `sp-popover`, plus the standard dark/medium theme. Versions are pinned to the previously researched Gen1 1.12.2, not an assumption about the latest release. Only the sandbox manifest/lockfile gained dependencies. The installed overlay/popover packages declare Apache-2.0 and theme ISC; no paid components were installed.

The [Overlay API](https://opensource.adobe.com/spectrum-web-components/components/overlay/) documents declarative trigger binding, placement, offset, focus and dismissal. The [Popover API](https://opensource.adobe.com/spectrum-web-components/components/popover/) supplies the visual container. Matching the design used CSS modifier properties and host styling, without shadow-root mutation or a replacement positioning/animation engine.

## Comparison

| Evidence | Web Awesome 3.12.0 | Spectrum Gen1 1.12.2 |
|---|---|---|
| Enter/Space, Close autofocus, Escape/Close/outside dismissal, focus restoration | Pass in recorded pilot | Pass |
| Read-only content, trigger expanded state | Pass | Pass; named dialog also checked |
| Anchoring, 1440/420px containment, bottom-edge flip | Pass | Pass |
| Reduced motion; offline Electron runtime | Pass | Pass; computed transitions all zero under reduced motion |
| Rapid triple trigger click at 100/200/350ms settings, twice each | All six pass | All six pass |
| Escape, wait for returned focus, then Enter | 100ms setting fails twice; 200/350 pass | All six pass, but actual Escape-to-Enter gaps are longer; not equivalent timing evidence |
| Fixed Escape-to-Enter gap, without waiting for focus | Prior measured 107–116ms sequence leaves open/ARIA true while hidden | At measured 106–107ms Enter targets an unfocused element before trigger focus returns: help stays closed, open/ARIA false. At 213–216ms and 356–361ms, help reopens successfully, two trials each |
| Local TypeScript, nonblank including imports/bootstrap | 16 lines | 17 lines |
| Minified bundled JS, dependencies included, shared CSS excluded | 71,171 bytes | 455,953 bytes, including Spectrum dark/medium theme |

Bundle sizes describe these imports and this build, not a minimum achievable size or measured startup delay. No optimization investigation was added. The larger bundle is a cost to record, not by itself a demonstrated usability failure.

The initial Spectrum check exposed missing trigger `aria-expanded` synchronization with the chosen direct `sp-overlay` API. One `beforetoggle` handler supplies it. The other local event handler closes the overlay from the native Close button. Spectrum supplies focus return; Web Awesome's existing integration supplies an after-hide focus handler. Neither requires substantial local machinery for this surface.

The original control-input test waits for trigger focus before starting its interval. Spectrum's delayed focus return plus polling expanded the nominal 100ms case to about 500ms. We therefore ran the fixed-gap follow-up rather than claiming that Spectrum passed the same rapid reopening case. The follow-up measured trigger focus returning about 145–168ms after Escape. It establishes a reachable edge case, not its frequency or severity in normal use. No mitigation was added to either candidate.

## Verification and stopping point

Commands from repository root:

```powershell
npm --prefix sandbox/component-library-evaluation run test:spectrum
npm --prefix sandbox/component-library-evaluation run test:spectrum-timing
npm --prefix sandbox/component-library-evaluation run start:spectrum
```

`test:spectrum` passes the ordinary acceptance checks and all 12 focus-gated/triple-click trials. `test:spectrum-timing` is an observational diagnostic: exit zero means the six trials were captured, not that all reopened. Its two 100ms trials stay closed. Timing evidence and outcome are deliberately reported separately from test execution success.

Artifacts: [ordinary and input results](../../sandbox/component-library-evaluation/artifacts/spectrum/results.json), [fixed-timing evidence](../../sandbox/component-library-evaluation/artifacts/spectrum/timing-results.json), [wide screenshot](../../sandbox/component-library-evaluation/artifacts/spectrum/width-1440.png), [narrow screenshot](../../sandbox/component-library-evaluation/artifacts/spectrum/width-420.png). Artifacts are ignored generated files; scripts preserve reproducibility. [Fixture](../../sandbox/component-library-evaluation/spectrum.html), [integration](../../sandbox/component-library-evaluation/src/spectrum-popover.ts), [styles](../../sandbox/component-library-evaluation/spectrum.css).

Electron runs use the existing secure offline launcher. Automated mouse/keyboard events were trusted browser input. Rendered wide/narrow captures were visually inspected for readable content, clipping, placement and design consistency. This is not a human usability session, continuous-motion approval, assistive-technology audit or real-grid integration. The earlier WA-only direct-property diagnostic was not expanded into another Spectrum stress investigation; actual input supplies the decision-relevant evidence.

Recommendation: retain Spectrum as the strongest tested alternative; this popover alone does not justify replacing Web Awesome as the provisional next-prototype choice. Evaluate actual user experience in the integrated shell next, after reviewing this result. Free-only coverage must continue to exclude WA Pro components. Neither library is adopted as a production-wide system by this experiment.

Guidance: using-97, cost-aware-delegation, build-deploy-and-tooling, typescript-coding, writing-clean-code, testing-discipline, pre-commit-self-review, coding-quality.md and the AGENTS user-impact rule. Root retained this small coupled fixture/check task because delegation briefing and verification would duplicate most work. No production architecture changes; no new reusable abstraction needed. Adjacent issues: none found in touched files.
