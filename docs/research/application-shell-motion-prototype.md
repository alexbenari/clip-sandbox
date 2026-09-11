# Integrated application-shell motion prototype

2026-09-07. **User approved the integrated prototype with "Looks good!"; MS3's review gate is cleared.** Automated evidence and the limits below remain unchanged. MS4 production migration is next.

Goal: the local panels, real clip grid, two central screens and global utilities remain coherent during folding, reversal and switching, preserving video elements, usable focus and an uninterrupted workspace.

## What is running

The prototype reuses `sandbox/component-library-evaluation/` rather than creating a second build/dependency sandbox at the originally proposed `sandbox/application-shell-demo.html`. `build.mjs` generates ignored `shell.html` from the existing local-panel fixture and keyboard-help content. Reproduce with:

```powershell
npm --prefix sandbox/component-library-evaluation run start:shell
npm --prefix sandbox/component-library-evaluation run start:shell-overlay
```

The first command keeps the default native frame. The second enables Electron's hidden title bar plus native title-bar overlay in the sandbox only. Both use the existing offline, sandboxed Electron launcher. The final review window was opened with an isolated user-data directory under `artifacts/shell/review-profile`.

Two fake screens demonstrate central command ownership: Collection has a command row and the real clip grid; Settings has a read-only fixture field and no command row. Panels/history/settings content remains representative. There is no settings persistence, retry execution, production Activity migration, or reusable app-screen registration API yet. The workspace button remains a focus-test placeholder. Hovering a sample clip exercises the existing grid's preview interaction.

## Motion and integration choices

- Local CSS panel columns retain the selected 240px open/36px folded widths and 240/280ms closing/opening durations.
- For the grid, calculate the destination layout once from the final allocated width with the existing `computeBestGrid` function. Animate the existing cards' local positions and dimensions with matching CSS timing. A settled measurement reconciles window-size changes; intermediate ResizeObserver callbacks do not repeatedly recompute layout. No snapshots or replacement videos are created.
- The prototype positions cards absolutely to make a two-to-three-column transition interpolable. This is **not** a drop-in production grid adapter: the production controller's metric/current-column bookkeeping and layout callback must be reconciled through a narrow allocated-bounds contract before promotion. The sandbox deliberately overrides only rendering, preserves real card/video creation and leaves production unchanged.
- Screen switching synchronously swaps the central view and its commands, transfers focus to its declared fixture target and applies a 200ms opacity reveal. Cancelling the previous animation prevents stale completion callbacks; reduced motion skips it.
- Keyboard help and Activity share one Web Awesome Popover host. Swapping content while open avoids two overlapping utility surfaces. The stable anchor is the utility-button group; the public `skidding` offset aligns the surface to the invoking button. A ResizeObserver updates that offset when the group changes size.
- A requested reopen during closing waits for `wa-after-hide`, then opens the latest requested content. This prevents the previously recorded stale-close sequence in the tested integration. Public reposition/show events finish a pending focus transfer; no private library state is mutated.

The utility coordinator is more local code than the isolated 16-line help example because it now owns mutual exclusion, latest requested utility, focus transfer, trigger ARIA and anchoring offsets. That is application coordination, but it is real maintenance cost. Do not generalize the small isolated-pilot count to the whole shell.

An initial anchor-changing approach left focus on the Activity trigger. The focused check failed; source inspection showed that changing the underlying popup anchor hides it before rebinding. The final stable-anchor approach avoids that hide and passes focus plus frame-visibility checks. This is recorded as an integration correction, not evidence that ordinary Web Awesome use is generally broken.

## Verification

Production baseline, before any production source edits:

| Command | Observed result |
|---|---|
| `npm run typecheck` | Pass, including strict source check |
| `npm run unit` | 39 files, 169 tests passed |
| `npm run e2e` | 7 Electron scenarios passed |

The E2E runner emitted the existing `NO_COLOR`/`FORCE_COLOR` conflict warning. [Baseline logs](../../sandbox/component-library-evaluation/artifacts/baseline/) preserve outputs. A Luna agent ran these bounded checks; root independently read their counts and diagnostics. Delegation outcome: one successful packet, no rework, cheap independent verification, useful substitution of cheaper execution.

Prototype commands:

```powershell
npm --prefix sandbox/component-library-evaluation run test:shell
npm --prefix sandbox/component-library-evaluation run test:shell-overlay
```

Both pass, including the strict sandbox build. The checks establish:

- At 1100×900, folding both panels changes the real grid from two to three columns; the same eight cards and eight video objects survive. One muted looping video advances without pause, emptied or loadstart events.
- Sampled panel/workspace edges remain within one pixel with no blank gutter. Card x/y/width/height drift after 260ms is at most one pixel. This includes the settled measurement after the 240ms fold. Per-frame data is evidence of continuity, not human approval of perceived smoothness.
- Interrupted reveal returns to folded width. Screen requests settle on the last requested screen, commands hide with the inactive screen, and focus reaches the active screen's target.
- Utility switching shows exactly one content section in each sampled frame while the body remains visible. Activity receives focus; its technical-details disclosure works. Escape returns invoking focus. Rapid utility requests and a 50ms Escape/Enter reopening sequence settle visibly with usable focus.
- Reduced motion removes panel transitions and screen animation. Screenshots were inspected at 1440px, 800px and 1800px; the column-change case uses 1100px.
- The native-overlay API reports an available title-bar area and the rightmost utility lies inside it. Programmatic maximize/unmaximize succeeds. This does **not** prove physical title-button hit testing, drag, double-click maximize, snapping, or perceived animation quality.

[Default-frame results](../../sandbox/component-library-evaluation/artifacts/shell/results.json), [overlay results](../../sandbox/component-library-evaluation/artifacts/shell/overlay-results.json), [expanded capture](../../sandbox/component-library-evaluation/artifacts/shell/expanded-1440.png), [Activity capture](../../sandbox/component-library-evaluation/artifacts/shell/activity.png). Artifacts are ignored and regenerated by the scripts. Screenshot names are shared across frame-mode runs; the last run was overlay mode.

## Review boundary and next step

Try folding/revealing both panels while hovering a playing clip, reverse a fold, switch Collection/Settings rapidly, switch Keyboard shortcuts/Activity and press Escape. In the overlay window, also drag the header and try the native maximize/restore controls. The manual decision is whether these transitions look continuous and the window behaves normally.

The user accepted the prototype as presented. MS4 can begin with the narrow screen-registration/shell contract; production grid coordination needs the explicit boundary described above. Native overlay integration belongs to MS9. The approval does not enumerate individual physical-window interactions, so retain their final Windows QA checklist. If a visible late correction or discontinuity emerges during integration, revise the coordination rather than masking it with delays.

Guidance: coding-quality.md, using-97, cost-aware-delegation, TypeScript, clean-code, testing, tooling, correctness, security, Impeccable's established visual guidance, and pre-commit self-review. The agreed sandbox supplies isolation. Explicit classes own shell controls; the standalone grid experiment uses module-local state as prototype glue, not a new production convention. No production architecture changed, so the canonical architecture map needs no update yet. Adjacent issues: none found in touched code. Full production behavior beyond the captured baseline is not claimed by the prototype.
