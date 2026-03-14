# Feature Spec: Zoom Mode for Grid Clips

## 1. Summary

Add a `zoom mode` to the normal grid view so a user can inspect one clip at a larger size without leaving the current collection screen.

A user enters zoom mode by:
- double-clicking a clip in the grid, or
- selecting a clip and pressing `Z`.

In zoom mode:
- the chosen clip appears in a centered overlay above the grid,
- the overlay frame occupies about two thirds of the viewport,
- the clip starts playback from the beginning,
- the zoomed clip plays with audio,
- the grid remains visible behind the overlay and its clips keep playing,
- `Escape` or clicking outside the frame exits zoom mode.

## 2. Problem

Current behavior only shows clips at grid-tile size unless the user enters fullscreen mode. That is too small for inspection workflows where the user wants to quickly check one clip in more detail while keeping the current grid context.

The app already supports:
- grid clip playback,
- clip selection,
- keyboard shortcuts,
- fullscreen playback.

It does not yet support a larger in-place inspection view for an individual clip.

## 3. Goals and Non-Goals

### 3.1 Goals

1. Let users open a larger view of a single clip from the standard grid.
2. Support both mouse-first and keyboard-first entry into zoom mode.
3. Keep the grid context visible while zoom is open.
4. Start the zoomed clip from time `0` every time zoom opens.
5. Play the zoomed clip with audio while leaving background grid clips running.
6. Provide simple, reliable exit behavior through `Escape` and outside click.
7. Express zoom mode in code as a dedicated UI component rather than scattered overlay logic.

### 3.2 Non-Goals

1. No compare mode or side-by-side zoom in this feature.
2. No zoom mode inside fullscreen/present mode in this first pass.
3. No transport controls, scrubber, or timeline UI beyond native video behavior.
4. No dimmed backdrop effect.
5. No attempt to synchronize the zoomed clip with the matching grid tile's current playback position.

## 4. Core Concepts

### 4.1 Normal Grid View

The default browsing mode where clips are displayed as tiles in the main grid.

### 4.2 Selected Clip

The grid tile currently marked with the existing selected state. Keyboard zoom uses this clip.

### 4.3 Zoom Overlay Component

A UI component rendered above the grid for temporary enlarged playback of one clip.

The component includes:
- a full-viewport hit area used to detect outside clicks,
- a centered frame,
- one zoomed video element.

### 4.4 Zoom Session

The period from opening the overlay until it closes. Each new zoom session starts playback from the beginning of the chosen clip.

## 5. User Stories

1. As a user, I can double-click any grid clip to inspect it at a larger size.
2. As a user, I can select a clip and press `Z` to inspect it without using the mouse.
3. As a user, when zoom opens, the clip starts from the beginning so I can review it consistently.
4. As a user, I hear audio in zoom mode even though grid clips are muted.
5. As a user, I can dismiss zoom quickly with `Escape` or by clicking outside the zoom frame.
6. As a user, opening zoom by double-click also updates selection to that same clip.

## 6. UX Specification

### 6.1 Entry Points

Zoom mode opens only in the normal grid view.

Supported entry actions:
1. double-click a grid tile,
2. press `Z` or `z` while a grid tile is selected.

If no clip is selected, pressing `Z` does nothing.

### 6.2 Overlay Structure

When zoom opens:
1. the app renders the zoom overlay component above the grid,
2. the component spans the viewport so it can detect outside clicks,
3. the component contains a centered frame,
4. the frame contains only the chosen clip.

The overlay does not dim or blur the background grid.

### 6.3 Frame Size and Placement

The zoom frame should appear centered in the viewport and target roughly two thirds of the available viewport size.

Implementation may use responsive CSS such as:
- width near `66vw`,
- height near `66vh`,
- sensible max constraints for small screens,
- padding so the frame never touches the viewport edges.

Exact pixel-perfect size is not required as long as the result is visibly much larger than a grid tile and remains centered and usable on desktop and mobile-sized viewports.

### 6.4 Video Behavior in Zoom

When zoom opens:
1. the zoomed clip is created from the same underlying file/object URL as the grid tile,
2. the zoomed clip starts at `currentTime = 0`,
3. the zoomed clip begins playing automatically,
4. the zoomed clip is not muted,
5. the zoomed clip should use inline playback behavior where supported.

The grid tile videos behind the overlay remain present and continue their existing playback behavior.

### 6.5 Exit Behavior

Zoom closes when:
1. the user presses `Escape`, or
2. the user clicks or taps outside the zoom frame but inside the overlay hit area.

When zoom closes:
1. the overlay and zoomed video element are removed,
2. the grid remains in its prior state,
3. the current clip selection remains unchanged.

### 6.6 Selection Rules

Double-clicking a clip:
1. opens zoom for that clip,
2. also sets that clip as the selected clip if it was not already selected.

Keyboard zoom always targets the currently selected clip.

### 6.7 Interaction with Fullscreen

This first pass does not support zoom mode while fullscreen/present mode is active.

Required behavior:
- double-click and `Z` do not open zoom while fullscreen is active,
- if fullscreen is entered while zoom is open, the app closes zoom first and then proceeds into fullscreen.

## 7. Behavioral Rules

### 7.1 Open by Double-Click

Given a clip tile in normal grid view:
- double-clicking it opens zoom for that clip,
- that clip becomes selected,
- the zoomed playback starts from the beginning with audio.

### 7.2 Open by Keyboard

Given a selected clip in normal grid view:
- pressing `Z` or `z` opens zoom for that selected clip,
- the zoomed playback starts from the beginning with audio.

### 7.3 Reopen Behavior

If the same clip is opened in zoom again after being closed:
- it must restart from the beginning again,
- it must not resume from the previous zoom session,
- it must not inherit the current playback position of the grid tile.

### 7.4 Single Active Zoom

Only one zoom overlay may exist at a time.

If zoom is already open and the user opens another clip:
- the app should replace the existing zoomed clip with the newly requested clip,
- the newly requested clip starts from the beginning with audio.

## 8. Accessibility and Input Expectations

1. The overlay should be keyboard-dismissible with `Escape`.
2. The outside-click hit area must not prevent interaction with the zoom frame itself.
3. The zoom frame should expose enough semantics to be discoverable in tests, for example stable element IDs or `data-*` hooks.
4. Keyboard zoom shortcuts must not fire while the user is typing in an editable control.

## 9. Status and Messaging

This feature does not require a status toast for normal open/close actions.

Optional:
- if the team prefers feedback when `Z` is pressed with no selected clip, it may show a short status message, but silent no-op is acceptable for this first pass.

## 10. Code and Architecture Impact

The feature should fit the current browser-only architecture and be expressed as a dedicated UI component.

Recommended shape:

- `src/ui/zoom-overlay-controller.js`
  - a new UI module that owns the zoom overlay component lifecycle: create, open, replace clip, close, and destroy.
  - this module owns the overlay DOM structure, outside-click handling, and zoomed video element behavior.
- `index.html`
  - add only what is needed for the component to mount cleanly, such as CSS rules or an optional root mount point.
  - avoid spreading the full overlay structure directly into the page markup if the component can create it itself.
- `src/ui/dom-factory.js`
  - keep shared DOM helpers here only if they genuinely reduce duplication.
  - do not split ownership of the zoom component across multiple files without a clear benefit.
- `src/state/app-state.js`
  - keep app-level zoom state minimal.
  - only store zoom state here if another subsystem needs to query it. If zoom state is purely local to the overlay component, keep it inside the controller.
- `src/ui/events.js`
  - extend event binding if needed for zoom-specific interactions.
- `src/ui/drag-drop-controller.js`
  - preserve existing click-to-select behavior and support selecting the double-clicked tile before zooming.
- `src/app/bootstrap.js`
  - wire high-level app events into the zoom component and coordinate fullscreen interaction.
  - bootstrap should orchestrate the feature, not own the zoom overlay DOM directly.

The implementation should avoid coupling zoom mode to fullscreen logic except where fullscreen needs to suppress or close zoom.

## 11. Test Requirements

This feature must ship with regression coverage.

### 11.1 End-to-End Scenarios

Add E2E coverage for:
1. double-clicking a clip opens the zoom overlay,
2. pressing `Z` opens zoom for the selected clip,
3. pressing `Z` when no clip is selected does not do anything,
4. pressing `Escape` closes zoom,
5. clicking outside the zoom frame closes zoom,
6. double-clicking a clip also selects it,
7. the zoomed video starts playing from the beginning as defined in section 11.2,
8. the zoomed video is unmuted,
9. the background grid remains rendered while zoom is open.

### 11.2 Start-From-Beginning Regression

Add a specific automated test for the subtle playback reset rule:
1. load clips,
2. open zoom on a clip,
3. let the zoomed video advance beyond time `0`,
4. close zoom,
5. reopen zoom on the same clip,
6. assert the zoomed video starts again from the beginning rather than resuming.

This behavior is mandatory and should be treated as a protected regression case.

### 11.3 Lower-Level Coverage

Add unit or integration coverage where it improves confidence for:
- state transitions for open/close/replace zoom,
- keyboard gating so `Z` does not fire in editable inputs,
- fullscreen interaction if zoom is explicitly closed before fullscreen entry.

## 12. Acceptance Criteria

The feature is complete when all of the following are true:

1. In normal grid view, double-clicking a clip opens a centered zoom overlay for that clip.
2. In normal grid view, selecting a clip and pressing `Z` opens zoom for that clip.
3. Opening zoom by double-click also selects that clip.
4. The zoom overlay is displayed above the grid without a dimmed backdrop.
5. The zoom frame occupies about two thirds of the viewport and remains usable on smaller screens.
6. The zoomed clip starts from the beginning every time zoom opens.
7. The zoomed clip autoplays with audio.
8. Background grid clips remain visible and continue their normal playback behavior.
9. `Escape` closes zoom.
10. Clicking outside the zoom frame closes zoom.
11. Zoom does not open in fullscreen/present mode in this first pass.
12. If fullscreen is entered while zoom is open, zoom closes first.
13. Automated tests cover both the main interactions and the start-from-beginning regression.
