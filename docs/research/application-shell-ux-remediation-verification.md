# Application Shell UX Remediation Verification

Status: implementation verified; user accepted dragging and smoothness. Collection-command follow-up verified.

Date: 2026-09-09

## Changes

| Brief issue | Implementation |
|---|---|
| 4.1 Activity meaning and target | activity-indicator-control.ts owns labels, count, accessible name/title, error precedence and dot-only pulse; index.html supplies stable pill markup. |
| 4.2 Global order | index.html orders Activity, separator, keyboard/settings, caption separator. Desktop Electron tests assert visible DOM order and native clearance. |
| 4.3 Visual fidelity | index.html supplies local icons, handled panel/rail treatment, command hierarchy, wrapping icon-and-text commands, focus and surface tokens; settings-screen.ts contains preferences and LTR path; main-toolbar-control.ts preserves icon markup and toggled semantics; app-text.ts replaces old product copy. |
| 4.3 Utility dismissal | global-utility-coordinator.ts delegates both Close buttons through its existing close/focus path. |
| 4.4 Shortcut scanning | app-screen.ts, app-keydown-handler.ts, fullscreen-session.ts and keyboard-map-control.ts explicitly represent and render groups, alternative sequences and chords. |

## Verification

The user-visible goal is a readable, correctly grouped Clip Sandbox workbench whose visual refinement preserves existing collection, panel, utility and settings behavior.

- npm run typecheck: normal and strict authored-source checks passed.
- npm run test:all: clean build, 48 unit/integration files with 227 passing tests, all 14 Electron scenarios passed.
- After the final CSS centering adjustment: desktop overlay/fallback and panel Electron scenarios passed again (3/3), including new centered-selector and two-row height assertions.
- Direct Electron walkthrough used actual controls at 1440x900 and 800x650 content sizes with two real video fixtures. Independently folded/reopened panels and closely sequenced both panels; final screenshots retain populated central content. Narrow reduced-motion and mixed-state fullscreen restoration, utility transfer and visible Close-to-invoker focus passed. The panel scenario separately checks interrupted reversal and real column changes. This establishes bounded interaction/state evidence; the user subsequently confirmed that dragging looks good and smoothness is good.
- Final self-review against coding-quality.md found no important ownership deviation. Adjacent issues: none found in +/-20 lines of touched hunks.

## Fresh captures

All captures are from the production Electron app, not the sandbox. Test-pattern clips are test fixtures, not illustrative product content.

| Surface | 1440x900 | 800x650 |
|---|---|---|
| shell | [Desktop](../../.impeccable/verification/remediation/shell-1440.png) | [Narrow](../../.impeccable/verification/remediation/shell-800.png) |
| folded | [Desktop](../../.impeccable/verification/remediation/folded-1440.png) | [Narrow](../../.impeccable/verification/remediation/folded-800.png) |
| keyboard | [Desktop](../../.impeccable/verification/remediation/keyboard-1440.png) | [Narrow](../../.impeccable/verification/remediation/keyboard-800.png) |
| activity | [Desktop](../../.impeccable/verification/remediation/activity-1440.png) | [Narrow](../../.impeccable/verification/remediation/activity-800.png) |
| settings | [Desktop](../../.impeccable/verification/remediation/settings-1440.png) | [Narrow](../../.impeccable/verification/remediation/settings-800.png) |

Compared against all five approved references: global hierarchy and separators, labeled status, film mark, command priority, handled panels and rails, explicit utility headers, grouped non-editable keycaps and restrained Settings surface match their in-scope intent. The pinned palette and existing media treatment remain. At narrow size Keyboard help scrolls to Global; it is not truncated or made editable.

## Native and accessibility boundary

Current Windows UI automation: app-bar double-click maximized; native Restore returned to normal; Minimize reached minimized state; native Close removed the window. Drag probes from empty app-bar points at 800px and 1440px left overlay bounds unchanged. The independent default-frame title-bar drag also left bounds unchanged (800px content; outer 816x715). This does not discriminate an overlay defect from tool limitations. The user subsequently confirmed that dragging looks good; that closes the physical-drag concern for their reviewed workflow. The full physical interaction matrix for fallback/narrow mode is not claimed.

Keyboard Electron checks cover utility opening, heading focus, legitimate Close-button tab stop, close-to-invoker return, error-history navigation and panel/fullscreen restoration. Windows accessibility-tree inspection exposed named Activity Ready, keyboard/settings icons and fold controls. Unit checks cover state-specific error names; real Electron save failure under a protected dialog retains focus and shows two unresolved errors without moving neighbors. No NVDA session was running; screen-reader speech and physical-trackpad behavior remain unverified.

## Detector classification

Ran the requested detector once over index.html. Raw output: `.impeccable/verification/remediation/detector.json`. Findings are advisory and were classified by observable effect and the pinned design system. Token consolidation and the status/grouping changes address actual inconsistencies; no motion was removed to silence the detector.

| # | Finding | Classification |
|---|---|---|
| 1 | gray-on-color: text #e5e7eb on bg gradient(#2a4b9e, #1f2b6b) | Intentional: Screen Silver on the documented primary blue button family; readable foreground. |
| 2 | gray-on-color: text #e5e7eb on bg gradient(#2a4b9e, #1f2b6b) | Intentional: Screen Silver on the documented primary blue button family; readable foreground. |
| 3 | gray-on-color: text #e5e7eb on bg gradient(#2a4b9e, #1f2b6b) | Intentional: Screen Silver on the documented primary blue button family; readable foreground. |
| 4 | gray-on-color: text #e5e7eb on bg gradient(#2a4b9e, #1f2b6b) | Intentional: Screen Silver on the documented primary blue button family; readable foreground. |
| 5 | dark-glow: Zero-offset text-shadow glow (#7aa2f7) | Intentional: existing collection-selector glow explicitly documented in DESIGN.md. |
| 6 | layout-transition: transition: width | Intentional: required panel width/command coordination and existing Actions menu transition; reduced-motion coverage retained. |
| 7 | layout-transition: transition: max-height | Intentional: required panel width/command coordination and existing Actions menu transition; reduced-motion coverage retained. |
| 8 | layout-transition: transition: width | Intentional: required panel width/command coordination and existing Actions menu transition; reduced-motion coverage retained. |
| 9 | clipped-overflow-container: body clips a positioned child | False positive for this shell: viewport and panel clipping are intentional; interactive surfaces remain reachable in Electron checks. |
| 10 | clipped-overflow-container: div clips a positioned child | False positive for this shell: viewport and panel clipping are intentional; interactive surfaces remain reachable in Electron checks. |
| 11 | gpt-thin-border-wide-shadow: 1px border + 24px shadow blur | Intentional: ambient handled/floating surface vocabulary explicitly combines low-opacity border and soft shadow. |
| 12 | gpt-thin-border-wide-shadow: 1px border + 24px shadow blur | Intentional: ambient handled/floating surface vocabulary explicitly combines low-opacity border and soft shadow. |
| 13 | gpt-thin-border-wide-shadow: 1px border + 24px shadow blur | Intentional: ambient handled/floating surface vocabulary explicitly combines low-opacity border and soft shadow. |
| 14 | gpt-thin-border-wide-shadow: 1px border + 24px shadow blur | Intentional: ambient handled/floating surface vocabulary explicitly combines low-opacity border and soft shadow. |
| 15 | gpt-thin-border-wide-shadow: 1px border + 24px shadow blur | Intentional: ambient handled/floating surface vocabulary explicitly combines low-opacity border and soft shadow. |
| 16 | gpt-thin-border-wide-shadow: 1px border + 24px shadow blur | Intentional: ambient handled/floating surface vocabulary explicitly combines low-opacity border and soft shadow. |
| 17 | gpt-thin-border-wide-shadow: 1px border + 24px shadow blur | Intentional: ambient handled/floating surface vocabulary explicitly combines low-opacity border and soft shadow. |
| 18 | design-system-color: background rgb(20, 31, 48) on button is outside DESIGN.md colors | Intentional: documented tonal/status variants or existing dialog palette; newly introduced surface tones now documented. Static old keycap declaration is overridden by token-based production styling. |
| 19 | design-system-color: background rgba(2, 6, 23, 0.95) on div "Save Save as Collection Add Selected to " is outside DESIGN.md colors | Intentional: documented tonal/status variants or existing dialog palette; newly introduced surface tones now documented. Static old keycap declaration is overridden by token-based production styling. |
| 20 | design-system-color: text color rgb(219, 234, 254) on label "Destination" is outside DESIGN.md colors | Intentional: documented tonal/status variants or existing dialog palette; newly introduced surface tones now documented. Static old keycap declaration is overridden by token-based production styling. |
| 21 | design-system-font-size: font-size: 14px is off the DESIGN.md type ramp | Intentional: supporting labels 12-14px, collection context 15px, local Settings title 22px. Earlier Settings 24px declaration is overridden. |
| 22 | design-system-font-size: font-size: 15px is off the DESIGN.md type ramp | Intentional: supporting labels 12-14px, collection context 15px, local Settings title 22px. Earlier Settings 24px declaration is overridden. |
| 23 | design-system-color: Undocumented color #2a4b9e is outside DESIGN.md colors | Intentional: documented tonal/status variants or existing dialog palette; newly introduced surface tones now documented. Static old keycap declaration is overridden by token-based production styling. |
| 24 | design-system-color: Undocumented color #1f2b6b is outside DESIGN.md colors | Intentional: documented tonal/status variants or existing dialog palette; newly introduced surface tones now documented. Static old keycap declaration is overridden by token-based production styling. |
| 25 | design-system-color: Undocumented color rgba(69,10,10,.45) is outside DESIGN.md colors | Intentional: documented tonal/status variants or existing dialog palette; newly introduced surface tones now documented. Static old keycap declaration is overridden by token-based production styling. |
| 26 | design-system-color: Undocumented color #fecaca is outside DESIGN.md colors | Intentional: documented tonal/status variants or existing dialog palette; newly introduced surface tones now documented. Static old keycap declaration is overridden by token-based production styling. |
| 27 | design-system-font: font-family: Sfmono-Regular is not declared in DESIGN.md typography | Intentional: machine-detail font stack documented in DESIGN.md. |
| 28 | design-system-font-size: font-size: 12px is off the DESIGN.md type ramp | Intentional: supporting labels 12-14px, collection context 15px, local Settings title 22px. Earlier Settings 24px declaration is overridden. |
| 29 | design-system-color: Undocumented color #172238 is outside DESIGN.md colors | Intentional: documented tonal/status variants or existing dialog palette; newly introduced surface tones now documented. Static old keycap declaration is overridden by token-based production styling. |
| 30 | design-system-radius: border-radius: 5px is outside the DESIGN.md rounded scale | Intentional: small keycap radius 6px; earlier 5px declaration overridden. |
| 31 | design-system-font-size: font-size: 24px is off the DESIGN.md type ramp | Intentional: supporting labels 12-14px, collection context 15px, local Settings title 22px. Earlier Settings 24px declaration is overridden. |
| 32 | design-system-color: Undocumented color #64748b is outside DESIGN.md colors | Intentional: documented tonal/status variants or existing dialog palette; newly introduced surface tones now documented. Static old keycap declaration is overridden by token-based production styling. |
| 33 | design-system-radius: border-radius: 6px is outside the DESIGN.md rounded scale | Intentional: small keycap radius 6px; earlier 5px declaration overridden. |
| 34 | design-system-font-size: font-size: 22px is off the DESIGN.md type ramp | Intentional: supporting labels 12-14px, collection context 15px, local Settings title 22px. Earlier Settings 24px declaration is overridden. |
| 35 | dark-glow: Zero-offset text-shadow glow (#7aa2f7) | Intentional: existing collection-selector glow explicitly documented in DESIGN.md. |

## Decisions and scope

- Unresolved errors take precedence over Working. A failed operation ends progress; a later operation can run while errors remain. Success uses Ready, avoiding label jitter.
- All four Collection commands keep visible icons and text. The selector occupies a separate row in normal layout flow, centered at central widths of at least 850px; below that it shares the final row with the clip count. At 800px with both panels open, commands wrap to two rows above the selector. Panels remain 240px open and 36px folded, open by default.
- The native select remains native. No component/icon dependency, future discovery/tree/locked-clip content, startup flow, GIF Extraction, or player control was added.
- Two bounded Sol-medium delegations completed Activity semantics and shortcut grouping. Root independently inspected code and ran tests; root corrected status termination and refined group hierarchy. Verification was focused, rework small; delegation was useful for these bounded packets.
- Guidance: coding-quality.md, using-97, TypeScript, API/interface, clean-code, testing-discipline, before-you-refactor, Impeccable polish/craft-floor, cost-aware-delegation, doc-update and pre-commit-self-review. No new architecture exception.

## Collection-command follow-up (2026-09-09)

Goal: the collection selector never covers a command, and Browse, Actions, Titles and Full Screen retain consistent visible icons and labels, including after fullscreen.

The regression first failed because leaving fullscreen removed the Full Screen SVG (expected one, received zero). Fullscreen now updates only its label and accessible name; the selector uses normal layout flow and selective label hiding is removed. No player behavior changed.

Verification: clean build and normal/strict typecheck passed; all 227 unit/integration tests passed; desktop overlay, default-frame and panel Electron scenarios passed (3/3). The regression checks no selector/button intersection and visible labels at 800, 1000, 1200 and 1440px with both panels open and folded after fullscreen. The earlier two-row height limit is intentionally superseded by up to three rows at the narrowest expanded layout to keep all labels readable. A mistaken unit-test filename matched no files; the full unit/integration suite was then run successfully.

Actual Electron walkthrough loaded two clip fixtures, entered/exited fullscreen, and inspected expanded/folded layouts at desktop and narrow widths. Fresh captures: [open desktop](../../.impeccable/verification/remediation/collection-commands-open-1440.png), [open narrow](../../.impeccable/verification/remediation/collection-commands-open-800.png), [folded desktop](../../.impeccable/verification/remediation/collection-commands-1440.png), [folded narrow](../../.impeccable/verification/remediation/collection-commands-800.png). These supersede the earlier toolbar captures.

Guidance: bugfix-by-failing-test plus the implementation and self-review guidance above. No new delegation was needed for this narrow correction. Final coding-quality review found no new ownership exception; button rendering stays in the existing fullscreen UI owner. Adjacent issues: src/app/fullscreen-session.ts:257,259 already swallow playback/randomizer promise failures; these remain outside this toolbar fix.
