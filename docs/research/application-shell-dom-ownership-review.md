# Application shell DOM ownership review

Goal: preserve selected-clip/Browse focus, panel motion, utility dismissal and fullscreen restoration while making child controls own their private DOM and presentation details.

## Corrected boundaries

| Caller | Former dependency | Current contract |
|---|---|---|
| CollectionScreen | Grid card classes, selected marker and tabIndex | Grid focusSelectedClip() returns whether it focused a selected card |
| CollectionScreen | Toolbar pickBtn id | Toolbar focusBrowse() |
| CollectionScreen | gridWrap id and fixed 28px padding subtraction | Grid measures its own allocated container and current vertical padding |
| ApplicationShellController | Panel folded class and sizing custom properties | Panel targetWidth measurement |
| GlobalUtilityCoordinator | Descendant data-utility-close buttons | Child controls bind their own buttons and invoke injected close requests |
| FullscreenSession | Toolbar label span and button accessible name | Toolbar setFullscreenButtonState callback |
| Activity auto-open composition | Private Zoom, Save and Conflict selectors | Existing controller isOpen()/isVisible() capabilities |

The remaining generic dialog[open] query checks the browser's dialog surface. Settings and Keyboard selectors stay within markup those controls own. Screen roots/commands and utility panels/triggers are explicit outer-surface mounting, visibility and focus contracts; shell/coordinator operations on these are intentional, not descendant access.

## Verification

- Baseline: 227 unit/integration tests passed before refactoring.
- Final: normal and strict typecheck, 229 unit/integration tests, clean build and all 14 Electron scenarios passed.
- CollectionScreen's test uses child capabilities without constructing child markup. Grid tests establish selected focus independent of the selected CSS marker and allocated-height changes when padding changes. Toolbar tests cover Browse focus and icon-preserving fullscreen labels.
- Utility integration checks real child Close requests and focus restoration. A previous test asserted the removed internal data attribute; it now asserts readonly content, a single named Close button and actual dismissal. Protected-Zoom coverage now opens the real control instead of manufacturing a lookalike overlay.
- Separate actual Electron walkthrough loaded two clips, selected one, switched Settings/Collection, checked returned card focus, clicked both utility Close buttons, and entered/exited fullscreen. Desktop and narrow screenshots were inspected: [1440](../../.impeccable/verification/ownership/shell-1440.png), [800](../../.impeccable/verification/ownership/shell-800.png). Both show expanded panels. A subsequent automation attempt incorrectly targeted a hidden Reveal button and timed out; it supplies no additional motion evidence. The passing panel E2E scenario covers folding, reversal and preserved grid state.

## Review boundary

This review covers the added shell/screen/panel/utility code and its integration seams. It does not certify encapsulation across the entire pre-existing application. Legacy FullscreenSession card/video DOM manipulation remains outside the shell correction and would require a separate media ownership review; no video-player behavior was rewritten. Existing standalone grid layout still accepts an outer toolbar measurement for legacy callers.

Guidance: coding-quality.md, before-you-refactor, TypeScript, API/interface, clean-code, testing-discipline, doc-update and pre-commit-self-review. Work stayed on master as requested. No delegation: the unresolved cross-component boundaries and integration judgment belonged with the root. No new UI coding guideline was added; that discussion is deferred as requested.

Adjacent issues: pre-existing swallowed playback/randomizer failures at src/app/fullscreen-session.ts:251,253 remain unchanged. No new architecture exception or component framework was introduced.
