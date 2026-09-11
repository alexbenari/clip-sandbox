# Feature Spec: Application Shell and Global Surfaces

## 1. Summary

Introduce a shared application shell that clearly separates application-level navigation and utilities from commands owned by the active main screen.

The shell provides:

1. a persistent global app bar,
2. an optional, consistently positioned command bar owned by the active main screen,
3. shell-owned hosts for the foldable Pipelines and Clips side panels,
4. a read-only, context-sensitive keyboard map,
5. one combined Activity and Errors surface evolved from the existing activity-history control.
6. a Settings screen for the pipeline root folder and the default audio preference for single-clip playback.

This specification defines layout, ownership, interaction, and state boundaries and includes the first small Settings screen. It does not design the internals of the future movie editor control or implement the other planned screens.

## 2. User-Visible Goal

The user can move between the app's main screens, find commands relevant to the current screen, reveal either global side panel, consult applicable keyboard shortcuts, and inspect activity or errors without confusing application-level controls with screen-specific work.

## 3. Problem

The current application has one main working surface and one toolbar. Planned screens and global panels introduce several different command scopes:

1. application-level navigation and utilities,
2. commands belonging to one main screen,
3. actions local to a particular control or selected object,
4. controls belonging to a side panel.

Putting all of these into one toolbar would obscure ownership, make future screens harder to extend, and encourage unrelated controls to accumulate in a single row.

The current activity indicator already reports progress, success, errors, and recent history. A separate error system would duplicate that concept and split the place where the user looks for operational feedback.

## 4. Goals and Non-Goals

### 4.1 Goals

1. Establish an app-level bar containing only global navigation and utilities.
2. Establish a consistent optional slot for commands owned by the active main screen.
3. Keep object-local actions close to the object or control they affect.
4. Keep panel-owned controls in their corresponding panel headers.
5. Make the Pipelines and Clips panels potentially available from every main screen.
6. Provide a compact keyboard map whose screen-specific content follows the active screen.
7. Make the keyboard map unmistakably read-only.
8. Expand the current activity history into a combined Activity and Errors surface.
9. Support detailed, recoverable errors without creating a second global status system.
10. Preserve the framework-free renderer and existing application composition boundaries.
11. Provide a real Settings destination for the two settings the application already needs.

### 4.2 Non-Goals

1. This feature does not design or integrate the movie editor control.
2. This feature does not define final GIF Extraction shortcuts.
3. This feature does not allow users to edit or remap shortcuts.
4. This feature does not implement pipeline discovery, cross-pipeline file operations, or collection mutation.
5. This feature does not define the contents of future main screens beyond the shell contract they use.
6. This feature does not implement the First Startup flow; its approved comp remains an input to a later feature specification.
7. This feature does not add a second notification or error system alongside the existing activity model. The existing activity entry point is expanded instead.
8. This feature does not unmute the multi-clip grid, whose simultaneous autoplay remains silent.

## 5. Terminology and Ownership

### 5.1 Global App Bar

The persistent top-level surface spanning the application window. It owns navigation among main screens and access to application-wide utilities.

### 5.2 Main Screen

A primary workspace displayed in the center of the application, such as collection management, GIF Extraction, or Settings.

### 5.3 Screen Command Bar

An optional command surface supplied by the active main screen and rendered in a consistent slot at the top of the central workspace.

### 5.4 Local Action

An action that changes a particular object, selection, or control state. Local actions remain adjacent to the affected content rather than moving into either command bar merely because space is available.

### 5.5 Global Utility Surface

A temporary floating surface opened from the app bar. The keyboard map and Activity and Errors panel are global utility surfaces.

### 5.6 Side-Panel Host

The shell-owned left or right region that can display, fold, and reveal the Pipelines or Clips panel. The shell owns the region and fold mechanics; each panel owns its content and panel-specific controls.

## 6. Shell Layout

### 6.1 Global Row

The global app bar spans the full window width.

Its left-to-right information architecture is:

1. Clip Sandbox identity,
2. main-screen selector showing the active screen,
3. flexible space,
4. combined activity/status control,
5. a subtle visual separator,
6. adjacent keyboard-map and Settings controls,
7. a visual separator before native window controls.

The activity/status control must not sit between the keyboard-map and Settings controls. Keyboard help and Settings are adjacent application utilities; operational status is a separate conceptual group.

### 6.2 Workspace Row

Below the app bar, the shell has three regions:

1. left Pipelines panel host,
2. central main-screen workspace,
3. right Clips panel host.

When open, each side panel begins with its own header and fold control. The central workspace may begin with the active screen's command bar. These surfaces align as peers below the global app bar without merging their command ownership.

### 6.3 Folded Panels

Each side panel has independent open and folded states.

When folded:

1. its content is removed from the working width,
2. the central workspace expands into the recovered space,
3. a slim edge rail remains visible,
4. the rail names the hidden panel and provides a one-click reveal command,
5. the Clips rail may show a compact count badge when relevant.

First Startup is a blocking pre-shell flow and does not expose the side panels. Main screens, including Settings, keep both panels potentially available.

Persistence of fold state across application restarts is intentionally deferred to the execution plan unless an existing preference mechanism makes one behavior clearly cheaper and more consistent.

## 7. Command Placement Rules

### 7.1 App-Level Controls

The global app bar may contain:

1. main-screen selection,
2. Activity and Errors access,
3. keyboard-map access,
4. Settings access,
5. native window controls and application-level status.

It must not contain commands whose meaning depends on the active screen's content.

### 7.2 Screen-Level Commands

Each main screen may provide a screen command bar in the central workspace's standard command slot.

Examples include:

1. GIF Extraction: Open movie and movie-preparation status,
2. collection management: active pipeline or collection selection,
3. collection management: future grid-density or view controls.

A screen with no screen-wide commands does not render an empty command bar.

### 7.3 Local and Panel Commands

Examples of local actions that remain near their affected control include locking a range, extracting locked ranges, and manipulating selected clips.

Examples of panel-owned actions include searching the pipeline tree, clearing the locked-clips set, and folding the panel.

The implementation must not require the shell to know the internal command vocabulary of the movie editor or any future complex control.

## 8. App Screen Registration Contract

An **app screen** is one of the main destinations selected in the application, such as Collection Management, GIF Extraction, or Settings. Each app screen registers its identity, content, optional screen-level commands, shortcuts, and meaningful initial focus target with the shell. The execution plan may choose exact TypeScript names only after inspecting the code that will call this registration API.

The natural usage must support these three cases without boolean mode flags or screen-type branching inside the shell:

1. collection management supplies collection and grid commands,
2. GIF Extraction supplies Open movie and preparation status,
3. Settings supplies no command bar.

The shell renders the registered screen; it does not switch on a string screen name to manufacture screen-specific controls. App-screen lifecycle and disposal must remain testable without Electron APIs.

Each screen owns the choice of initial focus because only the screen knows whether its meaningful entry point is a heading, primary work region, contextual command, or another control. The shell owns invoking that declared focus behavior after the incoming screen is mounted. It must not guess by focusing the first focusable descendant.

These are behavioral registration sketches, not approved signatures:

```text
show(collectionScreen with collectionCommands and collectionInitialFocus)
show(gifExtractionScreen with extractionCommands and extractionInitialFocus)
show(settingsScreen with no screenCommands and settingsInitialFocus)
```

The execution plan must include caller-level tests proving that:

1. a screen can register no command bar without leaving an empty row,
2. switching screens removes the previous screen's commands,
3. the shell invokes the incoming screen's declared initial-focus behavior rather than choosing a target itself.

## 9. Settings Screen

Settings is a real app screen in this feature, not a placeholder utility. It is opened from the global app bar and supplies no screen command bar.

The first version exposes two durable settings:

1. **Pipelines top folder:** displays the configured path and provides a folder-picker command to replace it. The setting establishes the root beneath which pipelines are or will be discovered; this shell feature does not implement pipeline discovery itself.
2. **Clip audio by default:** an on/off preference for the initial muted state of single-clip playback surfaces, including Zoom and the future extraction player. `Off` is the existing default. The multi-clip grid remains muted so simultaneous autoplay does not produce overlapping audio or conflict with browser autoplay policy.

Changing either value persists it across application restarts. Changing the audio default affects subsequently opened single-clip playback; it does not unexpectedly change a clip already playing. Changing the pipeline root does not silently discard the currently loaded working session. If immediate reload behavior is later desired, it requires an explicit command and specification.

Settings initial focus follows the same app-screen registration rule as every other screen. The screen must provide clear labels, show the selected path without requiring horizontal page scrolling, and communicate save or folder-selection failures through the combined Activity and Errors surface.

## 10. Keyboard Map

### 10.1 Entry and Surface

The keyboard map opens from the app bar and may also have a global shortcut.

It is a compact floating surface rather than a full-screen modal. Opening it moves focus into the surface; closing it restores focus to the invoking control.

### 10.2 Content Structure

The surface presents:

1. a heading, `Keyboard shortcuts`,
2. the active screen name,
3. the note `Shortcuts below reflect the active screen.` adjacent to the active-screen context,
4. a section containing shortcuts for the active screen,
5. a section titled `Global` containing application-wide shortcuts.

The previous label `Application` is not used for the application-wide shortcut section.

### 10.3 Read-Only Affordance

Shortcut assignments are display-only.

1. keys render as compact semantic keycap tokens, not text fields,
2. the surface contains no edit, reset, record, capture, or customization control,
3. keycaps do not accept text focus or show a caret,
4. the copy does not imply that assignments can be changed,
5. shortcut remapping, if ever introduced, is a separate feature with its own specification.

The exact shortcut assignments in the approved comp are illustrative and must not be treated as product requirements.

## 11. Activity and Errors

### 11.1 Evolution of the Existing Surface

The existing activity indicator and recent-message history expand into one Activity and Errors surface.

The global control continues to communicate idle, progress, success, and error states. It opens one anchored floating panel containing operational history and detailed errors. There is no second error button or error sidebar.

### 11.2 Error Behavior

An error entry provides, when available:

1. a concise problem statement,
2. affected object or operation,
3. a recovery instruction,
4. an appropriate retry or recovery command,
5. an expandable technical-details region,
6. a command to copy technical details.

Unresolved errors remain visible until resolved or explicitly cleared. A bulk clear action must not silently remove unresolved errors. Successful and informational history entries remain visually quieter than current errors.

The existing behavior that automatically opens the activity surface for an error should be preserved unless implementation review identifies a concrete conflict with a blocking dialog or protected-focus flow.

### 11.3 Scrolling Without Scrollbar Chrome

The history region is internally scrollable but has no visible scrollbar and reserves no scrollbar gutter.

Supported input includes:

1. mouse-wheel and trackpad scrolling while the pointer is over the history region,
2. `ArrowUp` and `ArrowDown` navigation among history entries while the panel has focus,
3. `PageUp` and `PageDown` for larger movements,
4. `Home` and `End` for the beginning and end of history.

Keyboard movement scrolls the newly focused entry into view. Interactive controls inside an entry retain their expected keyboard behavior.

When more content exists outside the viewport, the panel uses a restrained edge fade or partially visible next entry as an overflow cue. It does not add scroll arrows, pagination, or a permanent scrollbar. The scroll region remains programmatically named and keyboard reachable.

### 11.4 History Scope

This specification does not set a persistence duration or maximum retained history. The execution plan must inspect the existing in-memory history behavior and choose the smallest change that supports detailed errors without prematurely introducing a durable notification store.

## 12. Transitions and Motion

Motion in the shell exists to preserve spatial continuity and explain ownership changes. It must not decorate routine operations or make the user wait for the interface.

### 12.1 Panel Folding and Workspace Resize

Folding or opening either side panel is one coordinated transition:

1. the panel enters or leaves along its attached window edge,
2. the reveal rail changes state as part of the same movement,
3. the central workspace expands or contracts continuously into the changing space,
4. the screen command bar and main-screen content remain aligned throughout,
5. the layout settles once without a second snap, delayed reflow, blank gutter, or visible intermediate state.

The shell must avoid repeatedly forcing expensive main-screen relayout during the transition. The future movie editor remains responsible for adapting to its final allocated bounds; this specification does not prescribe animation inside that control.

### 12.2 Global Utility Surfaces

The keyboard map and Activity and Errors panel open from their invoking app-bar controls with a short anchored reveal that preserves the visual relationship between trigger and surface. Closing is slightly faster than opening.

Opening one utility while another is open transitions directly between them without flashing the underlying workspace, briefly showing both surfaces, or moving keyboard focus through the background.

### 12.3 Main-Screen Changes

Changing main screens preserves the stable app bar and side-panel hosts. Only the registered central app screen changes.

The outgoing screen remains visually coherent until the incoming screen is ready to render. The transition must not expose a blank central canvas, briefly show commands belonging to the wrong screen, or resize the side-panel hosts unnecessarily. Focus moves through the incoming screen's declared initial-focus contract once that target exists.

### 12.4 Timing, Interruption, and Reduced Motion

Initial motion targets are:

1. `100–150 ms` for immediate control feedback,
2. `150–220 ms` for opening or closing a global utility surface,
3. `240–320 ms` for panel folding with central-workspace resize,
4. `180–260 ms` for a main-screen change.

These are tuning ranges, not reasons to delay content that is ready. Entrances use confident deceleration and exits complete slightly faster. Bounce and elastic easing are not used.

Transitions are interruptible. Reversing a panel while it is moving changes direction from its current visual position; repeated commands do not queue stale animations. Rapid main-screen changes settle on the final requested screen with the matching commands and focus target.

Reduced-motion mode removes or substantially shortens spatial movement while preserving state feedback, final layout, and focus behavior.

### 12.5 Verification Standard

Automated tests must verify final state, focus, command ownership, interruption, and reduced-motion behavior. Targeted manual QA in the actual Electron app must verify that panel resizing, utility surfaces, and screen changes feel continuous and do not visibly jump, flash, stutter, or produce a second layout correction on the primary Windows workflow.

## 13. Accessibility and Interaction

1. Every icon-only global control has an accessible name and tooltip.
2. Global utility surfaces close with `Escape` and restore focus to their invoking controls.
3. Only one global utility surface is open at a time.
4. Opening a second global utility surface closes the first and transfers focus predictably.
5. Panel fold and reveal controls expose expanded state and controlled-region relationships.
6. Screen changes invoke the incoming screen's declared initial-focus behavior; the shell does not choose the target from screen internals.
7. Screen-specific commands are removed from the tab order when their screen is inactive.
8. Error state is communicated through text and semantics, not red color alone.
9. Activity updates that do not require action must not repeatedly interrupt the user's current focus.

## 14. States to Cover

### 14.1 Shell

1. each side panel open or folded independently,
2. main screen with a screen command bar,
3. main screen without a screen command bar,
4. global utility surface closed,
5. keyboard map open,
6. Activity and Errors open,
7. panel transition interrupted and reversed,
8. main-screen transition superseded by another screen request,
9. reduced-motion mode.

### 14.2 Activity and Errors

1. idle with no history,
2. operation in progress,
3. recent success,
4. unresolved error,
5. expanded technical details,
6. history longer than the panel viewport,
7. retry in progress,
8. resolved error retained as quiet history.

### 14.3 Keyboard Map

1. active screen with shortcuts,
2. active screen with no screen-specific shortcuts,
3. long command labels,
4. multi-key chords,
5. keyboard-only open, traversal, and close.

## 15. Acceptance Criteria

1. The app bar contains no screen-specific command such as Open movie.
2. The activity/status control is visually separate from the adjacent keyboard-map and Settings controls.
3. Activating a screen with screen-level commands renders them only in the central screen command bar.
4. Activating a screen without screen-level commands removes that row rather than leaving an empty strip.
5. Both side panels can be folded and restored in one action from any main screen.
6. Folding a panel gives its width to the central workspace.
7. The keyboard map labels application-wide shortcuts as `Global`.
8. The keyboard map places its active-screen note beside the active-screen context.
9. Nothing in the keyboard map appears editable or suggests shortcut remapping.
10. Activity and errors share one global entry point and one history surface.
11. An error can expose human-readable recovery information and copyable technical details.
12. Long activity history can be navigated by mouse wheel or keyboard without a visible scrollbar or reserved scrollbar gutter.
13. Closing either global utility surface restores focus to its invoking control.
14. Existing progress, success, and error reporting remains available during migration.
15. Every app screen registration declares meaningful initial-focus behavior, and the shell invokes it after mounting that screen.
16. Folding or opening a panel moves the panel, reveal rail, and central-workspace resize as one continuous transition without a snap or second reflow.
17. Global utility surfaces open and close from their invoking controls without flashing, shifting the workspace, or briefly coexisting.
18. Main-screen changes keep the global shell stable, never expose a blank central canvas, and never show commands belonging to the wrong screen.
19. Interrupted or rapidly repeated transitions settle on the final requested state without queued animation or stale focus.
20. Reduced-motion mode preserves clear state changes and final layout while substantially reducing spatial movement.
21. Manual QA in the Electron app confirms that the primary shell transitions are smooth and visually continuous on the supported Windows workflow.
22. Settings allows the user to view, change, and persist the Pipelines top folder.
23. Settings allows the user to choose whether subsequently opened single-clip playback starts with audio on or off, while the multi-clip grid remains muted.
24. Settings has no empty screen command bar and changing its values does not silently replace the current working session.

## 16. Approved Visual References

The following comps establish the approved shell direction:

1. [shell-command-levels.png](../../.impeccable/mocks/shell-command-levels.png): app bar, screen command bar, and side-panel ownership,
2. [keyboard-map-open.png](../../.impeccable/mocks/keyboard-map-open.png): read-only contextual and Global shortcut sections,
3. [activity-errors-open.png](../../.impeccable/mocks/activity-errors-open.png): combined activity history and expanded error details,
4. [extraction-approved-folded.png](../../.impeccable/mocks/extraction-approved-folded.png): folded-panel rails and reclaimed workspace width.

The extraction-control internals, movie imagery, exact shortcuts, paths, counts, timings, and example errors shown in these comps are illustrative. They are not implementation specifications.

## 17. Architecture Constraints for the Future Plan

1. Keep the renderer framework-free.
2. Keep `src/app/app-controller.ts` as composition root rather than moving reusable UI behavior into it.
3. Put reusable, stateful renderer behavior in focused class-backed controllers under `src/ui/`.
4. Evolve `ActivityIndicatorControl` deliberately or replace it through a migration that preserves its current callers; do not introduce a parallel activity/error owner.
5. Keep app screen registrations independent of Electron and filesystem APIs.
6. Do not make the application shell depend on the internal API, readiness model, keyboard handling, or range model of the future movie editor control.
7. Treat the player-control handoff as the source for that control's future component specification, not as shell implementation instructions.
8. Research the available component-library landscape before choosing evaluation candidates, then evaluate at least two candidates against both the immediate controls and the likely future component inventory. The evaluation must cover library-wide quality, accessibility, reputation, maintenance activity, release health, breadth, theming coherence, and architectural fit—not only the Pipelines tree and Settings controls. Adoption is optional; the result may be one primary library, a deliberately small compatible set, or native/focused local components.
9. A standout component from another library may be adopted only when its user experience and maintainability clearly beat the primary approach and it can be normalized to the Clip Sandbox design system without visible design noise.
10. Keep durable settings behind a narrow application-facing settings service so app screens do not import Electron or Node APIs.

## 18. Deferred Decisions

The following decisions belong to the execution plan or later feature specifications:

1. exact TypeScript names and signatures for app screen registration,
2. whether panel fold state persists across restarts,
3. history retention and persistence policy,
4. final global and screen-specific shortcut assignments,
5. the final set and naming of main screens,
6. movie-editor control internals and extraction semantics.
