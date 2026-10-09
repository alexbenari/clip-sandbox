# Jump by seconds in movie review

## Why this matters

While reviewing a movie for GIF capture, the user can move by a useful amount without dragging the timeline or stepping through many frames. Playback jumps forward; frame-scrub jumps follow the user's last scrub direction. The same action works in GIF Extraction and Refine Gif.

## Decisions

| ID | Decision | Reason |
|---|---|---|
| D1 | The physical top number row uses `1` → 1 second, `2` → 2 seconds, `3` → 5 seconds, `4` → 7 seconds, and `5` → 10 seconds. The number pad is not part of this shortcut. | These are the requested durations and keyboard location. |
| D2 | The shared movie player shows a labeled **Jump by** duration selector with those five choices and a Jump button beside the transport controls. The initial selection is 2 seconds and remains selected while moving between the two GIF screens; it need not survive an app restart. The button shows the current direction and duration. | It gives pointer and keyboard users the same five actions without adding five permanent buttons. |
| D3 | During ordinary playback, jump forward from the player's current playback time and continue playing from the new position. During exact frame scrub, jump from the displayed exact frame's review time in the direction of the last manual scrub, remain paused in scrub, and display an exact frame near the target time. With no prior directional scrub in this movie, jump forward. A paused movie without exact review uses a forward playback seek and stays paused. | A jump follows the user's recent scrub intent while preserving the current review mode. |
| D4 | A jump during a running or paused range-loop preview ends that preview and disarms its loop. A running preview jumps forward from its current playback position and continues as ordinary playback. A paused preview jumps from its displayed exact frame in the last scrub direction and remains in exact scrub. The preview does not resume on the next Play or Space. | The user approved ending loop preview for a jump; the transport keeps its running or paused state. |
| D5 | Repeated accepted commands accumulate in order and in the direction that applied when each was pressed, until another action interrupts them. For example, two quick `3` presses request two 5-second jumps in that direction, even if the first seek has not finished. Key auto-repeat does not issue extra jumps. | The user approved cumulative rapid presses. |
| D6 | Clamp the target to the movie's start or available end. In exact scrub, show the first or final available frame when a target reaches or passes that boundary. Further jumps toward the same boundary remain there. | A jump never requests a position outside the movie. |
| D7 | A new user action that changes playback position or mode immediately drops all queued jumps and becomes the next transport action. Marking the currently displayed frame also drops queued jumps before capture. One already issued native seek may finish, but its result cannot override a completed later transport action. | The user's latest review intent must not wait behind the accumulated queue or be reversed by a stale result. |

## Visible interaction

The controls sit with the shared player, above either screen's capture or refinement controls:

`[frame back] [Play/Pause] [frame forward]   Jump by [2 seconds ▾] [Jump +2s]   [frame identity]`

The selector lists `1 second`, `2 seconds`, `5 seconds`, `7 seconds`, and `10 seconds`; it is a normal labeled select control. The button displays `Jump +2s` or `Jump −2s` for the selected duration and current direction, with an accessible name such as "Jump backward 2 seconds." The shortcut help on both screens lists all five key-to-duration mappings and explains that scrub jumps follow the last scrub direction. A person can use the pointer by selecting a duration and clicking Jump, or use the top-row key directly without first focusing the selector. A digit shortcut uses its mapped duration without changing the selector's current choice. The existing capture and refinement controls stay in their current workflows.

Plain top-row `1`–`5` key presses work only while a GIF screen is active. Modifier combinations, typing in an editable field or the duration selector, and key auto-repeat do not trigger a jump. The shortcut does not use number-pad keys. The digit shortcuts also work when the movie-position slider has focus, matching the existing GIF shortcut focus rule.

Jump is unavailable while no movie is open or a source is being replaced. It becomes available with ordinary playback, including while exact-frame preparation is still running or has failed. Exact scrub requires prepared exact frames, as it does today. The selector can keep its chosen value while Jump is unavailable, and disabled controls make the unavailable state clear. While jumps are pending, the slider, frame-step buttons, and Play/Pause remain usable so they can interrupt immediately.

## Time and mode behavior

The five values are elapsed seconds, including in exact scrub. They are not frame counts and do not depend on a nominal frame rate. In playback, the current player clock is the starting point, rather than the last painted frame, which can lag behind playback. In exact scrub, the currently displayed exact frame's review time is the starting point; add or subtract the selected seconds according to the last manual scrub direction. The exact-frame service chooses an available frame near the clamped target; the resulting frame identity and its actual review time appear in the player. The feature does not promise that a frame exists at the requested millisecond or that a playback seek paints the exact target frame.

The last manual scrub direction is set by the most recent forward or backward frame step through the arrow keys or frame-step buttons, or by moving the exact-position slider to a later or earlier frame. It is remembered for the current movie across playback and the two GIF screens, but playback jumps still go forward. A new movie starts with forward as its default. A jump, an endpoint jump using `A`/`S`, and entering scrub by pausing do not themselves change the remembered direction. Moving the slider without changing its frame leaves the direction unchanged.

Each accepted jump advances a pending destination by its signed duration before another pending jump is resolved. If uninterrupted, the result must reflect their sum, subject to the start and end clamps. An interrupting action drops undispatched jumps when the input is accepted; it does not wait for the queued sum. It starts the new mode or seek immediately from the user's perspective. One already issued native seek may need to finish before the requested frame can be shown, but no queued jump runs first. Its completion cannot repaint, seek, resume playback, or change the mode after the later transport action completes.

Interruption applies to a frame-step arrow key or button (including the action that enters scrub from playback), pressing Play/Pause or Space, beginning a movie-position slider drag or changing that slider by keyboard, jumping to Start or End with `A`/`S` or its visible control, choosing a Refine endpoint or another range that moves the playhead, and starting or restarting loop preview with `Z` or its button. Marking Start or End with `Q`/`W` or its button also drops queued jumps before reading the currently displayed frame; an already issued seek may still finish after that mark, without changing what was captured. Opening or replacing a movie, leaving or changing the GIF screen, and player disposal invalidate queued jumps. Releasing a held arrow, selecting a different Jump duration, selecting a capture card without moving the playhead, and extraction or lock actions that do not change transport leave queued jumps intact. If Lock stops an active preview, that stop is a mode change and interrupts jumps.

Leaving a running loop samples its current playback position near the command and jumps forward. Leaving a paused loop uses its displayed exact frame and the remembered scrub direction. In either case, the loop is fully disarmed before the jump is applied. Existing marked endpoints, staged refinement, and captured ranges are unchanged. Failure to disarm safely prevents the new seek, reports a recoverable player error, and preserves the capture data. A failed jump reports an error and leaves the player usable at its last confirmed position; it must not falsely show the requested time as completed.

## Ownership and scope

`FrameReviewPlayerControl` owns the selector, button, current review mode, last manual scrub direction for its movie, accepted-jump ordering, and visible result. The active GIF screen supplies source-replacement availability to the shared control. `GifWorkflowKeyboardController` maps physical top-row keys to the same player command and keeps the current editable-target and active-screen guards. The trusted review session performs the mode-appropriate seek and exact time-to-frame lookup; it remains the authority for the actual playback clock and exact frame identity. The existing GIF capture and refinement models are unchanged by a jump. Implementation may extend the narrow frame-review session contract to expose a time-based exact scrub command or an equivalent trusted operation; it must not infer an exact frame from average frame rate or a proportional slider position.

This feature adds forward jumps during playback and direction-aware jumps during exact scrub. It does not change extraction, saved captures, movie files, the range endpoint shortcuts `A`/`S`, or range-loop boundary semantics apart from ending a preview when Jump is used.

## Acceptance behavior

1. In both GIF screens, each top-row key and the matching selector/button choice moves forward by its mapped duration during ordinary playback, and playback continues. Number-pad keys and modified or typed digits do not trigger a jump.
2. In exact scrub, each choice moves by elapsed seconds in the last manual scrub direction, shows an exact frame near the requested time, and leaves the player in scrub mode with the displayed frame's identity and time available for capture or refinement. Before any directional scrub in a movie, the direction is forward.
3. Frame-step keys and buttons and a changed exact-position slider update the scrub direction. Playback jumps, number-key or button jumps, endpoint jumps, and entering scrub by pausing do not update it; playback jumps always move forward.
4. Two quick jumps accumulate until interrupted. An arrow-key step or slider drag drops their queued remainder at input and begins the requested scrub without waiting through it; an old jump completion cannot undo the resulting frame or mode. Play/Pause, endpoint navigation, loop preview, and screen or movie changes also interrupt. Current-frame marking drops queued jumps before capture; an issued seek may finish afterward without changing the marked frame.
5. A jump during running or paused loop preview ends the loop and proceeds from its current position, continuing as ordinary playback or exact scrub respectively; the loop does not silently restart.
6. A jump at or beyond either movie boundary lands on the first or final available position or exact frame. No movie, source replacement, and recoverable seek or loop-stop failures have clear unavailable or error behavior without changing captured ranges.
7. The pointer controls, keycaps or shortcut help, keyboard behavior, focus handling, direction shown on the button, and displayed time agree. Verify the interaction in the running Electron app as well as with focused automated tests.

## Rejected alternatives

- R1: Five separate permanent jump buttons — rejected because they would crowd the shared transport; superseded by D2.
- R2: Translate scrub seconds to frame counts using a nominal frame rate — rejected because variable frame timing makes that inaccurate; superseded by D3.
