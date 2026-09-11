# Application Shell UX Remediation Brief

Status: implemented; see [verification and remaining manual checks](application-shell-ux-remediation-verification.md).

Date: 2026-09-08

## 1. Purpose

This document translates the independent post-implementation UX acceptance review into an implementation-ready remediation brief. The application-shell feature is functionally complete, but the production UI does not yet fully express the signed information architecture and approved visual direction.

The implementation agent should correct every acceptance gap and polish item below while preserving the behaviors already proven by the completed execution plan.

Primary sources of truth, in descending order:

1. `docs/specs/application-shell-and-global-surfaces-spec.md`
2. the user's explicit feedback recorded in that specification and the completed execution plan
3. the approved visual references named by specification section 16
4. `DESIGN.md`
5. the current implementation and test suite

The approved comps establish hierarchy, grouping, surface character, control treatment, and motion intent. Their illustrative movie content, exact data, paths, counts, and future GIF Extraction internals are not implementation requirements.

## 2. User-Visible Goal

The shell should retain its verified behavior while looking and communicating like the approved Clip Sandbox workbench: operational status is immediately understandable, global command grouping is correct, utilities are polished and easy to scan, and the visual treatment feels deliberately authored for this product rather than like generic dark desktop scaffolding.

## 3. Current Evidence Baseline

The acceptance review established the following baseline:

- `npm run typecheck` passed both normal and strict authored-source checks.
- `npm run unit` passed 48 files and 222 tests.
- `npm run e2e` passed all 14 Electron scenarios.
- An independent rerun of the five shell-focused files passed 7 of 7 Electron tests.
- Panel width reclamation, transition reversal, rapid screen switching, reduced-motion final state, Settings persistence, utility exclusivity, focus restoration, Activity overflow navigation, and fullscreen restoration have automated coverage.
- Current captures are under `test-results/`, including `desktop-overlay-1440.png`, `desktop-overlay-800.png`, `panels-open.png`, `panels-folded.png`, `keyboard-map-collection.png`, `keyboard-map-settings.png`, `activity-error.png`, `activity-overflow.png`, `settings-desktop.png`, and `settings-narrow.png`.

Do not weaken these behaviors to simplify the visual work.

## 4. Scope and Priorities

### 4.1 P1 - Make Activity status visible, meaningful, and semantic

#### Problem

The current global Activity trigger is an empty 18 by 18 pixel button whose state is conveyed visually by slate, green, or red. Its accessible name and tooltip remain `Activity and Errors` regardless of whether the app is idle, working, successful, or has unresolved errors.

This has three user-facing consequences:

1. a sighted user must learn the color code before the control communicates anything;
2. the target is unnecessarily small for pointer and motor access;
3. when error auto-opening is suppressed to protect a dialog, Zoom, fullscreen, or another focus-sensitive surface, the closed trigger does not communicate the error through visible text or state-specific semantics.

This conflicts with specification section 13 item 8 and falls short of the labeled status control shown in `shell-command-levels.png` and `activity-errors-open.png`.

#### Required result

Replace the empty dot button with a compact status pill that contains a semantic status dot and visible state text.

Required resting presentations:

| Internal condition | Visible text | Accessible name |
|---|---|---|
| no active operation and no unresolved errors | `Ready` | `Activity and Errors: Ready` |
| operation in progress | `Working…` | `Activity and Errors: Working` |
| transient success before the existing timeout settles | `Ready` or a concise success state if it does not cause layout jitter | state-specific name matching the visible state |
| one unresolved error | `1 error` | `Activity and Errors: 1 unresolved error` |
| multiple unresolved errors | `<n> errors` | `Activity and Errors: <n> unresolved errors` |

The unresolved count, not total historical errors, drives the error label. Resolving or explicitly clearing an error must update it immediately. Bulk history clearing must continue to retain unresolved errors.

The pill must:

- retain the existing trigger id, `aria-controls`, `aria-expanded`, and coordinator ownership;
- remain a single tab stop;
- have a comfortably clickable height and horizontal padding consistent with the approved app-bar controls;
- use text plus semantic color, never color alone;
- preserve the existing progress pulse only on the dot, not on the entire pill or its label;
- avoid width changes large enough to shove Keyboard shortcuts, Settings, or native caption space during normal state changes;
- keep non-actionable status updates from repeatedly moving focus or creating intrusive announcements.

#### Implementation surfaces

- `index.html`
  - Add stable child elements for the dot, visible label, and optional count badge inside `#activityIndicatorBtn`.
  - Replace the narrow-screen rule that forces zero padding on the Activity trigger.
  - Style the trigger as the approved compact pill rather than relying on an empty circular button.
- `src/ui/activity-indicator-control.ts`
  - Extend the state-rendering path so it updates visible text, `aria-label`, and `title` together with `data-state`.
  - Derive the unresolved-error count from the owned entry model after add, resolve, retry success, clear, and trimming operations.
  - Keep the semantic update inside `ActivityIndicatorControl`; do not make `app-controller.ts` calculate UI state.
- Tests
  - Add focused unit assertions for visible labels and accessible names for idle, progress, success, one error, multiple errors, resolution, explicit clear, and protected-focus error recording.
  - Extend Electron coverage to confirm that an error recorded while auto-open is protected still leaves a visible and semantically named error pill.

#### Acceptance checks

- The trigger always communicates its current state without relying on color.
- Its pointer target is materially larger than 18 by 18 pixels.
- Error counts remain correct after retry, resolution, explicit clear, and bulk clear.
- The pill does not shift the utility group noticeably as status changes.
- Keyboard focus and utility opening behavior remain unchanged.

### 4.2 P2 - Restore the signed global-bar order

#### Problem

The current DOM order is:

`Keyboard shortcuts -> Settings -> separator -> Activity`

Specification section 6.1 requires:

`Activity -> separator -> Keyboard shortcuts -> Settings -> separator/native caption area`

The current implementation keeps Keyboard shortcuts and Settings adjacent, but places operational status after them. This is the reverse of the user's explicit conceptual grouping.

#### Required result

Reorder the global controls to:

1. Clip Sandbox identity;
2. app-screen selector;
3. flexible space;
4. Activity status pill;
5. subtle separator;
6. adjacent Keyboard shortcuts and Settings controls;
7. visual separation before the native caption area.

#### Implementation surfaces

- `index.html`
  - Move `#activityIndicatorRoot` before `.utility-separator` and `.global-utilities`.
  - Keep `#keyboardMapBtn` and `#settingsBtn` inside one adjacent utility group.
  - Preserve `-webkit-app-region: no-drag` on every interactive control.
  - Ensure the reserved title-bar overlay area and final separator do not overlap native caption buttons at 800px and 1440px.
- `src/ui/global-utility-coordinator.ts`
  - No behavioral change should be necessary. Confirm that trigger-relative positioning remains correct after DOM reordering.
- Tests
  - Add a DOM-order assertion instead of only checking that Activity belongs to `#globalAppBar`.
  - Retain the overlay caption-clearance scenarios at both widths.

#### Acceptance checks

- Visual order matches specification section 6.1 exactly.
- Activity remains conceptually separate from the adjacent Keyboard/Settings pair.
- Both global utilities still anchor beneath their own invokers and transfer focus correctly.
- Native caption buttons remain clear and operable.

### 4.3 P2 - Bring the production shell to the approved visual-fidelity level

#### Problem

The production shell captures the comps' layout structure but not their level of authored visual character. Current controls are predominantly small text buttons on a flat navy surface. Panels read as large plain columns, utility surfaces resemble diagnostic output, and the global state control is visually underweighted. Without clip imagery, little besides the product name distinguishes the UI from a generic dark desktop utility.

This is a system-level polish gap, not a request for pixel parity or for implementing illustrative GIF Extraction content.

#### Required visual language

Use the existing screening-room system consistently:

- booth-black media canvas;
- rail-navy handled surfaces with restrained tonal layering;
- screen-silver primary text and quiet-slate supporting text;
- Projector Blue only for active context, focus, primary action, or direct manipulation;
- semantic green/red only for status;
- compact 8 to 18 pixel spacing and the recorded radius scale;
- low-opacity borders and ambient rather than conspicuous shadows;
- local inline SVG icons using `currentColor`, consistent stroke weight, and no new icon dependency unless separately justified.

Do not solve this by adding decorative gradients, glossy highlights, oversized headings, unrelated accent colors, or a component-library dependency.

#### A. Global app bar

Current gaps:

- product identity has no film mark or equivalent visual anchor;
- the native-looking app-screen select and text-heavy utilities do not match the approved compact command language;
- every control has similar visual weight;
- the status indicator is underweighted despite carrying exceptional state.

Implementation direction:

- Add a restrained film/clip mark beside `Clip Sandbox`, using local inline SVG and the Projector Blue accent.
- Keep the app-screen selector semantically a select unless a custom control earns its complexity. It may use a local background/icon treatment, stronger active-screen text, and a deliberate chevron while preserving native keyboard behavior.
- Convert Keyboard shortcuts and Settings to compact icon-led controls consistent with the approved comps. At minimum, use recognizable keyboard and gear icons with `aria-label` and `title`; visible text may remain at narrow-risk-free widths if testing shows it improves discoverability.
- Make hover, pressed, and focus states consistent across the app bar. Focus must use Projector Blue, not the browser's unrelated default accent.
- Preserve title-bar dragging and no-drag regions.

#### B. Screen command bar

Current gaps:

- the row works structurally but reads as a line of similarly weighted generic buttons;
- `Local Video Grid Reviewer` survives as an old product identity inside the collection selector;
- at 800px, commands break into three bands with weak grouping.

Implementation direction:

- Keep Browse Folder as the sole primary action and make its folder icon and label visually clear.
- Treat Actions, Hide Titles, and Full Screen as secondary controls with consistent icon/label alignment and pressed/toggled feedback where applicable.
- Replace the empty-state `Local Video Grid Reviewer` option with honest Clip Sandbox language such as `No pipeline loaded`; loaded states continue to display the active pipeline or collection name.
- Preserve independent centering of the active collection selector at wide widths.
- At narrow width, group commands intentionally rather than letting wrapping appear accidental. A two-row command layout is preferable to three loosely related bands if it can be achieved without shrinking targets or truncating the active collection.
- Do not move any screen command back into the global bar.

#### C. Open side panels and folded rails

Current gaps:

- open empty panels read as flat placeholder columns rather than handled workbench surfaces;
- fold controls are small single glyphs;
- folded rails use text/glyph treatment that is functional but less deliberate than the approved icon, label, count, and double-chevron language.

Implementation direction:

- Preserve both panels open by default. This is a signed decision.
- Preserve the honest empty states. Do not implement pipeline discovery, a tree, locked clips, or drag/drop in this remediation.
- Strengthen panel separation with the documented rail-navy layering, restrained border, header rhythm, and supporting-copy hierarchy.
- Replace raw `‹` and `›` text with local inline double-chevron icons. Keep the accessible names and `aria-expanded`/`aria-controls` contracts.
- Give fold and reveal controls a larger, consistent pointer target without increasing the 36px folded rail width unless measurement shows it is necessary.
- In the folded rail, separate icon, vertical panel name, optional Clips count, and reveal affordance so the rail reads intentionally rather than as rotated text.
- Preserve the existing 240px open width, 36px folded width, transition ownership, reversal behavior, and central-grid coordination unless a visual requirement demonstrably needs a measured change.

#### D. Global utility surfaces

Current gaps:

- surfaces lack the clear header/action structure shown in the comps;
- mouse dismissal depends on clicking the trigger again or clicking outside;
- typography is dense, particularly in Activity errors;
- the surfaces feel like raw diagnostic panels rather than polished global utilities.

Implementation direction:

- Add a consistent utility header row containing the surface title and a visible close button.
- The close button must have a clear accessible name and must call the existing coordinator close path so focus returns to the invoker.
- Keep the surfaces anchored and non-modal. They must never shift the workspace.
- Use the approved floating-utility border, radius, depth, internal dividers, and spacing.
- Preserve the no-visible-scrollbar treatment and overflow fades.
- Keep Activity technical details progressively disclosed. Improve whitespace and label hierarchy without removing affected operation, recovery, retry, copy, resolution, or clear behavior.
- Do not add editable affordances to Keyboard shortcuts. Update the existing test that currently forbids every button so it permits only the clearly labeled Close button while continuing to reject inputs, contenteditable nodes, remapping buttons, or recording controls.

#### E. Settings screen

Current gaps:

- the two settings float in a largely empty central canvas;
- saved/error feedback has little structural relationship to the setting group;
- long Windows paths containing mixed-direction text can render awkwardly.

Implementation direction:

- Place the two implemented preferences in one restrained, width-constrained settings surface or section that uses the same panel/radius/border vocabulary as the rest of the shell.
- Preserve the exact implemented scope: Pipelines top folder and Clip audio by default. Do not add index-cache controls from an earlier illustrative comp.
- Keep the explanation that changing the configured root does not replace the loaded session.
- Keep save status visually associated with the settings surface and ensure success/error copy remains concise.
- Render Windows filesystem paths in a stable left-to-right path context, including paths containing Hebrew or other right-to-left folder names. Prefer a path-specific `dir="ltr"`/Unicode-bidi treatment rather than applying direction globally. Preserve copying and native selection behavior.
- At narrow widths, keep the folder field and Choose folder action readable without horizontal page overflow.

#### F. Typography and state consistency

Implementation direction:

- Remove remaining `Local Video Grid Reviewer` product copy from user-visible empty states and the document title if still present.
- Use the recorded title, body, control-label, supporting-label, and machine-detail hierarchy consistently.
- Normalize focus treatments to Projector Blue. The programmatically focused Keyboard shortcuts heading must not look like an editable input, but focus location must remain perceivable.
- Use semantic status colors only for status and error meaning.
- Consolidate newly touched raw colors, radii, and shadow values into the existing CSS custom-property vocabulary where this improves consistency. Do not mechanically change intentional values merely to silence the detector.

#### Visual acceptance checks

Compare fresh production captures directly with:

- `.impeccable/mocks/shell-command-levels.png`
- `.impeccable/mocks/keyboard-map-open.png`
- `.impeccable/mocks/activity-errors-open.png`
- `.impeccable/mocks/extraction-approved-folded.png`
- `.impeccable/mocks/settings.png` for the visual treatment of the two in-scope Settings controls only

The comparison must establish:

- correct global hierarchy and grouping;
- a readable, labeled Activity state;
- authored Clip Sandbox identity beyond the product-name string;
- deliberate command hierarchy rather than uniform button weight;
- handled open-panel surfaces and polished folded rails;
- clear utility headers, dismissal, grouping, and depth;
- calmer Settings composition;
- consistency with `DESIGN.md` without reproducing future content.

### 4.4 P2 - Make the Keyboard shortcuts surface easier to scan

#### Problem

The Collection screen currently renders nine screen-level rows under one repeated `Collection` heading. Grid, Zoom, and Fullscreen commands are mixed together. Delete and Backspace occupy separate rows even though they invoke the same action. The structure is correct but requires more reading than a power-user reference should.

#### Required result

Within the active-screen section, group shortcuts by operating context:

- Grid
  - Open selected clip in Zoom: `Z`
  - Remove selection: `Delete` or `Backspace`
- Zoom
  - Toggle audio: `A`
  - Previous clip: `Left`
  - Next clip: `Right`
  - Close Zoom: `Escape`
- Fullscreen
  - Toggle fullscreen review: `F`
  - Set visible clip count: `0-9`
- Global
  - Close the open app-bar utility: `Escape`

Use language that makes the context explicit without repeating `(Zoom)` or `(fullscreen)` on every row once a group heading already supplies it.

Do not add shortcuts for opening help, Settings, or panels in this remediation. Display only combinations the current handlers actually implement.

#### Preferred contract adjustment

The current `ShortcutDescriptor.keys` array represents a chord, so it cannot correctly model alternative complete key sequences without pretending they are simultaneous keys. Prefer a small explicit descriptor contract, for example:

```ts
export interface ShortcutDescriptor {
  readonly description: string;
  readonly group?: string;
  readonly sequences: readonly (readonly string[])[];
}
```

Examples:

```ts
{ description: 'Remove selection', group: 'Grid', sequences: [['Delete'], ['Backspace']] }
{ description: 'Close the open app-bar utility', sequences: [['Escape']] }
{ description: 'Example chord', sequences: [['Ctrl', 'Enter']] }
```

`KeyboardMapControl` should render keys within one sequence joined by `+`, and alternative sequences separated by the word `or` or an equally clear non-editable separator. If an even smaller contract represents groups and alternatives cleanly, the implementation agent may use it, but must not infer grouping from description strings.

#### Implementation surfaces

- `src/ui/app-screen.ts`
  - Extend the immutable descriptor contract to represent optional group and alternative sequences.
- `src/app/app-keydown-handler.ts`
  - Co-locate the consolidated descriptors with the existing handlers; keep Delete and Backspace tied to their shared rule.
- `src/app/fullscreen-session.ts`
  - Preserve fullscreen descriptors beside the handlers.
- `src/ui/keyboard-map-control.ts`
  - Render group headings and alternative sequences semantically.
  - Keep `<kbd>` elements non-focusable and non-editable.
  - Preserve the active-screen note beside its context and retain the separate `Global` section.
- Tests
  - Cover groups, alternatives, chords, long labels, empty screen shortcuts, and safe literal rendering.
  - Assert that shortcut controls remain non-editable even after adding a legitimate Close button to the surface.

#### Acceptance checks

- A user can locate Grid, Zoom, Fullscreen, and Global commands without reading every row.
- Delete and Backspace appear as alternatives for one action, not as different commands.
- Chords remain visually distinct from alternatives.
- The map continues to reflect the active screen and never suggests remapping.
- Initial focus remains visible but does not resemble an editable field.

## 5. Remaining Verification Work

### 5.1 Perceived transition quality

Automated tests prove final geometry, reversal, stale-request rejection, focus, and reduced-motion state. They do not by themselves prove that motion feels smooth.

After visual changes, perform manual QA in the actual Electron app at 1440 by 900 and 800 by 650 content sizes:

1. fold and reopen each panel independently;
2. start opening a panel and reverse it before completion;
3. fold or open both panels close together while clips are visible;
4. alternate Collection and Settings rapidly;
5. open Keyboard shortcuts, transfer directly to Activity, close, and reopen;
6. enter and exit fullscreen with panels in mixed states;
7. repeat with Windows reduced motion enabled or through the established emulation path.

Observe the panel edge, folded rail, command row, card geometry, and utility surface together. There must be no flash, blank central canvas, stale command row, second corrective reflow, or queued animation.

Do not classify uneven synthetic sample deltas alone as a defect. Record an issue only when a user-perceivable discontinuity can be reproduced or when an explicit correctness/accessibility contract fails.

### 5.2 Native title-bar behavior

The independent review could not physically retest native title-bar dragging. This remains an evidence gap rather than a confirmed bug.

On Windows, verify both overlay and `--native-frame` fallback:

- drag the window from at least two empty points in the app bar;
- double-click the drag region to maximize/restore;
- use native minimize, maximize/restore, and close controls;
- confirm every app-bar control remains clickable and does not initiate a drag;
- repeat at the narrow supported size;
- confirm utilities never overlap or sit under caption buttons.

Record the exact observed result. Do not infer physical drag success from CSS `app-region` declarations or Playwright geometry alone.

### 5.3 Accessibility spot check

In addition to automated DOM assertions:

- traverse the shell, panels, command bar, Settings, and utilities using keyboard only;
- confirm every interactive element has a visible Projector Blue focus state;
- inspect accessible names for Activity in every state and for all icon-only controls;
- confirm the visible Close buttons return focus through the coordinator;
- confirm panel expanded/collapsed state is announced;
- confirm error state is discoverable while error auto-open is suppressed;
- perform at least one NVDA pass if available, or explicitly record that screen-reader behavior remains unverified.

## 6. Mechanical Detector Guidance

The acceptance review's Impeccable scan reported 34 findings in `index.html`. Most were false positives against deliberate values already documented in `DESIGN.md`, including gray-on-blue controls, the collection-selector glow, ambient border/shadow combinations, and intentional layout transitions.

Potentially useful advisory locations were the Activity error colors, keycap background/radius, Settings switch border, and some one-off surface values. Treat them as prompts to check token consistency, not as mandatory replacements.

After implementation, run the detector once over the changed markup:

```powershell
& '.agents\skills\impeccable\scripts\impeccable.cmd' detect --json index.html
```

Classify every remaining finding by user-facing effect and `DESIGN.md` intent. Do not distort the design or remove required motion merely to reach zero findings.

## 7. Required Automated Verification

At minimum:

```powershell
npm run typecheck
npm run unit
npm run e2e
```

Focused development checks should include:

```powershell
npm run unit -- --run tests/unit/activity-indicator-control.spec.ts tests/unit/app-dom.spec.ts tests/unit/keyboard-map-control.spec.ts tests/unit/global-utility-coordinator.spec.ts
npx playwright test tests/e2e/desktop-shell.spec.ts tests/e2e/panels.spec.ts tests/e2e/utilities.spec.ts tests/e2e/activity.spec.ts tests/e2e/settings.spec.ts
```

Tests must assert observable outcomes rather than CSS implementation details where possible. Screenshot evidence supplements behavioral assertions; it does not replace them.

## 8. Explicit Non-Goals and Guardrails

This remediation must not:

- implement the GIF Extraction screen or player internals;
- implement pipeline discovery, the pipeline tree, locked-clip content, or clip drag/drop;
- add index-cache settings or a first-startup flow;
- add shortcut remapping or display shortcuts that have no handler;
- reopen the settled local panel implementation without a new concrete failure;
- adopt Web Awesome, Spectrum, or another production component dependency merely for visual polish;
- change the two approved Settings semantics;
- change panels to folded-by-default;
- remove Activity recovery/detail behavior;
- introduce delayed state changes to disguise layout corrections;
- weaken reduced-motion, focus restoration, utility exclusivity, fullscreen, or existing Collection behavior;
- claim cross-platform qualification beyond the current Windows-first scope.

## 9. Completion Report Expected from the Implementing Agent

The final handoff should contain:

1. a concise mapping from each section 4 issue to the files changed;
2. fresh desktop and narrow captures for shell, folded panels, Keyboard shortcuts, Activity error, and Settings;
3. exact typecheck, unit, and Electron test results;
4. the manual motion observations and tested window sizes;
5. the native-title-bar results, including physical drag;
6. accessibility checks performed and any unverified boundary;
7. detector findings classified as fixed, intentional, false positive, or deferred;
8. any deliberate deviation from this brief, with its user-facing rationale;
9. confirmation that no future panel, discovery, or GIF Extraction functionality was implemented.

The feature is ready to close when the explicit global-order and Activity-semantics gaps are fixed, the production shell visibly reaches the approved level of hierarchy and craft, shortcut scanning is improved, all existing behavior remains green, and current Windows manual QA establishes smooth motion and native window interaction.
