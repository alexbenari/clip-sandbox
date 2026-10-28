# Zoom edit mode, starting with Refine

## Why this matters

Adjusting where a clip starts and ends is one of the most common edits in the user's collection, and today it is hard to do. Refine opens a separate screen, shows nothing until the whole source movie is prepared for exact frames (more than 25 minutes for a feature film the first time), and its keys silently do nothing while the movie plays (`test-evidence/collection-refine-keys/findings.md`). This feature replaces that screen with Zoom edit mode: a state the zoomed clip enters to be edited in place inside the Collection view. Its first edit is Refine, which changes the clip's start and end with the keyboard. Any clip can be trimmed; a clip with source info can also be extended by a few frames from its source movie. Later edits, such as playback speed, will join the same mode.

## Terms

- **Zoom**: the overlay that shows one clip enlarged over the Collection grid, with Left and Right moving to the neighboring clips of the collection (`ZoomOverlayControl`, `ZoomWorkflow`). Zoom only displays and navigates.
- **Zoom edit mode**: a state a zoomed clip can enter to be edited. It holds the clip's staged edits until they are saved or discarded. While it is active, Zoom's own navigation is suspended.
- **Refine**: the first edit of Zoom edit mode; it sets the clip's start and end.
- **Source info**: the `clip-sandbox.prov.v1` tag that names a clip's source movie and its frame range there (see `docs/specs/clip-source-movie-glyph-spec.md`).
- **Exact frame**: a frame identified by its position in the video, as GIF Extraction uses for capture; ordinary playback shows only an approximate time.
- **Frame check value**: the short value source info stores for each end of the range so the app can confirm, with the movie open, that a frame number still points at the same picture.
- **Prepared**: a video that the exact-frame player has indexed so it can show and identify exact frames. Preparation is cached, so it is slow only the first time for a given video.
- **Staged edit**: a change, such as a start or an end, that the user has set but not yet saved.

## Decisions

| ID | Decision | Reason |
|---|---|---|
| D13 | Zoom and Zoom edit mode are separate concepts, and separate in the code. Zoom keeps showing one clip and moving through the collection. Zoom edit mode is entered from a zoomed clip, owns that clip's staged edits, its keys and its hint line, and returns the clip to Zoom when it ends. Refine is the first edit the mode offers; later edits add their own keys and staged values to the mode without changing Zoom. | The user's model: viewing and navigating are one thing, editing is another, and more edits will follow. |
| D1 | Zoom edit mode with Refine is entered from the clip's right-click menu (Refine) and from Zoom's edit menu, next to Loopify. Entering from the grid opens Zoom on that clip and enters Zoom edit mode at once. Like Zoom, it is not available in Collection full screen. Sound follows the Zoom audio setting in effect on entry. | The user's choice; Refine joins Loopify as a local edit. |
| D2 | In Zoom edit mode the clip is shown by the exact-frame player that GIF Extraction uses, inside the Zoom frame. There is no timeline and no buttons; one hint line under the picture lists the keys and states why a key cannot act right now. | The user wants minimal controls; edits outside the clip are a few frames, so stepping and jumping are enough. |
| D3 | Keys in Zoom edit mode: Space plays or pauses; Left and Right step one frame; 1–5 jump by 1, 2, 5, 7 and 10 seconds as in GIF Extraction; Q and W set the start and the end at the displayed frame; A and S jump to the staged start and end; Z loops the staged range; X saves; Escape leaves the mode. These replace Zoom's own meanings while the mode is active (in Zoom, A toggles audio and Left and Right move to the neighboring clips). | One familiar key set; the mode the user is in decides what a key means. |
| D4 | Every key works whether the clip is playing or paused. Q, W, A and S during playback pause first and act on the exact frame shown after pausing; Z during playback starts the loop. When a key cannot act (for example W on a frame before the staged start, or X with nothing staged), nothing changes and the hint line says why. | Today's keys did nothing during playback without saying so. |
| D5 | Trimming works as soon as the clip itself is prepared, which for a short clip takes seconds. Moving before the clip's first frame or after its last frame is possible only for a clip with source info, once its source movie is found and prepared; until then the hint line says that extending is not yet available and why (finding the movie, preparing it, or not found). | Trimming never waits for the movie; extension needs frames only the movie has. |
| D6 | On entering Zoom edit mode for a clip with source info, the app looks for the source movie as Refine does today: its remembered location, then the open and catalogued pipeline folders, then it asks the user to locate the movie. If the user cancels, or the movie fails to prepare, the clip can be trimmed but not extended. | The user chose to be asked on entry. |
| D7 | A saved clip that came from a tagged clip always keeps its source info. When the movie is located and prepared, the new range is cut from the movie and the source info is complete. When the movie was not located, the user cancelled, or it failed to prepare, the range is cut from the clip itself and the source info keeps the movie's name and identity with the frame range shifted by the trimmed frames, but without the frame check values, which only the movie can supply. A later save with the movie located restores them. If the movie is found but still preparing when the user saves, saving waits for it, with progress in the hint line, and Escape cancels the wait without losing the staged edit. A clip without source info is cut from itself and stays without source info. | The user wants the movie kept even when it cannot be located; frame numbers shift exactly with a trim, while the check values need the movie. |
| D14 | Source info accepts a range whose frame check values are missing. Such a clip still counts as having source info: it shows the source glyph, its movie is looked up on entering Zoom edit mode, and it can be extended once the movie is prepared. Clips written before this change read as before. | Needed for D7; reading stays backward compatible. |
| D8 | X asks "Keep both" or "Replace" each time, with Cancel. Keep both writes `<name>-refined.mp4` (then `-refined-2`, `-refined-3`, as Loopify numbers its outputs) and adds it to the current view as Loopify does: in a saved collection's view right after the original, which makes that view unsaved; in the folder's full list at its place in name order. Replace writes the new clip under the original's file name and moves the original to the Recycle Bin, so collection files need no change. | The user's choices; Replace keeps every collection that lists the clip pointing at the refined version. |
| D9 | Replace never loses a clip: the new file is written under a temporary name first, the original is then moved to the Recycle Bin, and only then is the new file given the original's name. If the original cannot be moved (for example because another program has it open), the new clip is kept as `<name>-refined.mp4` as with Keep both, and Activity says so. After Replace, the grid, Zoom, the clip's duration, size and source info all show the new file. | Avoids a window in which neither version exists, and avoids stale pictures under an unchanged name. |
| D10 | After saving, Zoom edit mode ends and Zoom shows the saved clip. Escape in Zoom edit mode returns to Zoom on the same clip; a second Escape closes Zoom as usual. Leaving Zoom edit mode with a staged edit, by Escape, closing Zoom, or switching screen or folder, first asks "Discard" or "Keep editing", as the Refine screen does today. | The user chose to be asked; returning to Zoom keeps the user's place. |
| D11 | Saved clips keep the audio of what they were cut from. | Today's extraction keeps source audio; a refined clip should not lose it. |
| D12 | The separate Collection Refine screen, its right-click entry and its supporting parts are removed. GIF Extraction's Refine screen for captured ranges is unchanged. | The user's choice; one way to refine a Collection clip. |

## Visible behavior

The user right-clicks a clip and chooses Refine, or chooses Refine from Zoom's edit menu. Zoom enters Zoom edit mode and shows a hint line such as "Q start · W end · A/S jump · Z loop · X save · Esc leave". Within seconds the clip is ready and the user can step, jump, play and set the start and the end. For a clip from a movie, the hint line also reports the movie: "Finding the source movie…", then "Preparing the source movie to extend…", then nothing once extending works. If the movie cannot be found automatically, a file picker asks for it right after entering the mode; if the user cancels, the hint line says the clip can be trimmed but not extended.

Stepping past the clip's first or last frame shows the movie's neighboring frames once extending works; before that, the step does nothing and the hint line explains why. Z loops the staged range so the user can judge it. X asks "Keep both" or "Replace". While saving, the hint line shows progress; when done, Zoom shows the saved clip, Activity reports the result, and for Keep both the new clip appears in the grid.

## Scope

This feature covers D1–D14. It does not change GIF Extraction or its Refine screen, Loopify, saved captures, or how source info is written by ordinary extraction. Further edits in Zoom edit mode, making GIF Extraction's own Refine keys work during playback, and source info for Loopify output are separate later work.

## Acceptance behavior

1. From the right-click menu and from Zoom's edit menu, Refine opens the clip in Zoom edit mode with the hint line; keys act as in D3 both while playing and while paused, and a key that cannot act explains why in the hint line. In Zoom outside the mode, Left, Right and A keep their Zoom meanings.
2. A clip without source info can be trimmed at both ends and saved; the saved clip plays exactly the staged frames, has its audio, and carries no source info. Stepping past its ends does nothing and the hint line explains why.
3. A clip with source info can be trimmed at once and, after its movie is prepared, extended by a few frames at both ends. The saved clip plays exactly the staged range of the movie, and its source info names that range with its frame check values.
4. When the movie of a clip with source info is not located (cancelled), the clip can still be trimmed; the saved clip shows the source glyph naming the same movie, its range is the original range shifted by the trimmed frames, and its frame check values are absent. Opening that saved clip in Zoom edit mode later with the movie located allows extending and, on saving, restores the check values.
5. Keep both adds `<name>-refined.mp4` right after the original in a saved collection's view and marks that view unsaved, or in name order in the folder's full list; a second Keep both of the same clip adds `-refined-2`.
6. Replace leaves one clip under the original name showing the new frames in the grid and Zoom, with the original in the Recycle Bin and every collection still listing the name. If the original is held open by another program, the new clip is kept as `-refined` and Activity explains.
7. Escape, closing Zoom, or changing screen or folder with a staged edit asks Discard or Keep editing; Keep editing returns to the same frame and staged edit.
8. Clips with source info written before this change still show their glyph and can be refined.
9. The Collection Refine screen no longer exists; GIF Extraction's Refine screen still works as before.
10. Verified in the running app on the user's clips: one clip with source info (extend and Replace), one with source info whose movie lookup is cancelled (trim, source info kept), and one without (trim and Keep both).

## Rejected alternatives

- R1: Keep the separate Collection Refine screen and only fix its keys - the user prefers a local edit; superseded by D1 and D12.
- R2: Show a timeline in Zoom edit mode - edits beyond the clip are a few frames, so it adds clutter without value; superseded by D2.
- R3: Ask for the source movie only when the user first tries to extend - the user preferred to be asked on entry; superseded by D6.
- R4: Drop source info from a tagged clip trimmed without its movie - the user wants the movie kept; superseded by D7 and D14.
- R5: Name Keep-both output with the collection's numbering (`<collection>-NNN`) - the user preferred a Loopify-style suffix; superseded by D8.
- R6: Make editing a variant of Zoom with shared keys and state - the user wants viewing and editing kept apart so further edits can join the mode; superseded by D13.
