# Refine mode for Collection clips

## Why this matters

Adjusting where a clip starts and ends is one of the most common edits in the user's collection, and today it is hard to do. Refine opens a separate screen, shows nothing until the whole source movie is prepared for exact frames (more than 25 minutes for a feature film the first time), and its keys silently do nothing while the movie plays (`test-evidence/collection-refine-keys/findings.md`). This feature replaces that screen with Refine mode: a local edit, like Loopify, that opens the clip in Zoom inside the Collection view and edits its start and end with the keyboard. Any clip can be trimmed; a clip with source info can also be extended by a few frames from its source movie.

## Terms

- **Zoom**: the overlay that shows one clip enlarged over the Collection grid (`ZoomOverlayControl`, `ZoomWorkflow`).
- **Refine mode**: a state of Zoom in which the zoomed clip is edited instead of only viewed.
- **Source info**: the `clip-sandbox.prov.v1` tag that names a clip's source movie and its exact frame range there (see `docs/specs/clip-source-movie-glyph-spec.md`).
- **Exact frame**: a frame identified by its position in the video, as GIF Extraction uses for capture; ordinary playback shows only an approximate time.
- **Prepared**: a video that the exact-frame player has indexed so it can show and identify exact frames. Preparation is cached, so it is slow only the first time for a given video.
- **Staged edit**: a start or end that the user has set but not yet saved.

## Decisions

| ID | Decision | Reason |
|---|---|---|
| D1 | Refine mode is entered from the clip's right-click menu (Refine) and from Zoom's edit menu, next to Loopify. Entering from the grid opens Zoom on that clip directly in Refine mode. Like Zoom, Refine mode is not available in Collection full screen. Sound follows the Zoom audio setting in effect on entry. | The user's choice; Refine joins Loopify as a local edit. |
| D2 | In Refine mode the zoomed clip is shown by the exact-frame player that GIF Extraction uses, inside the Zoom frame. There is no timeline and no buttons; one hint line under the picture lists the keys and states why a key cannot act right now. | The user wants minimal controls; edits outside the clip are a few frames, so stepping and jumping are enough. |
| D3 | Keys in Refine mode: Space plays or pauses; Left and Right step one frame; 1–5 jump by 1, 2, 5, 7 and 10 seconds as in GIF Extraction; Q and W set the start and the end at the displayed frame; A and S jump to the staged start and end; Z loops the staged range; X saves; Escape leaves. In Refine mode these keys replace Zoom's own meanings (A toggles audio and Left and Right browse clips in plain Zoom). | One familiar key set; the conflicts are resolved in favor of the mode the user is in. |
| D4 | Every key works whether the clip is playing or paused. Q, W, A and S during playback pause first and act on the exact frame shown after pausing; Z during playback starts the loop. When a key cannot act (for example W on a frame before the staged start, or X with nothing staged), nothing changes and the hint line says why. | Today's keys did nothing during playback without saying so. |
| D5 | Trimming works as soon as the clip itself is prepared, which for a short clip takes seconds. Moving before the clip's first frame or after its last frame is possible only for a clip with source info, once its source movie is found and prepared; until then the hint line says that extending is not yet available and why (finding the movie, preparing it, or not found). | Trimming never waits for the movie; extension needs frames only the movie has. |
| D6 | On entering Refine mode for a clip with source info, the app looks for the source movie as Refine does today: its remembered location, then the open and catalogued pipeline folders, then it asks the user to locate the movie. If the user cancels, the clip is edited as if it had no source info. | The user chose to be asked on entry. |
| D7 | Saving a clip with source info always cuts the new range from its source movie, so the saved clip has exact source info for its new range, whether it was trimmed or extended. If the movie is not yet prepared when the user saves, saving waits for it, with progress in the hint line, and Escape cancels the wait without losing the staged edit. Saving a clip without source info (or whose movie was not located or failed to prepare) cuts the range from the clip itself, and the saved clip has no source info. | A trimmed tagged clip keeps its source info (the user's choice), and only the movie can provide the exact frame identities that source info records. |
| D8 | X asks "Keep both" or "Replace" each time, with Cancel. Keep both writes `<name>-refined.mp4` (then `-refined-2`, `-refined-3`, as Loopify numbers its outputs) and adds it to the current view as Loopify does: in a saved collection's view right after the original, which makes that view unsaved; in the folder's full list at its place in name order. Replace writes the new clip under the original's file name and moves the original to the Recycle Bin, so collection files need no change. | The user's choices; Replace keeps every collection that lists the clip pointing at the refined version. |
| D9 | Replace never loses a clip: the new file is written under a temporary name first, the original is then moved to the Recycle Bin, and only then is the new file given the original's name. If the original cannot be moved (for example because another program has it open), the new clip is kept as `<name>-refined.mp4` as with Keep both, and Activity says so. After Replace, the grid, Zoom, the clip's duration, size and source info all show the new file. | Avoids a window in which neither version exists, and avoids stale pictures under an unchanged name. |
| D10 | After saving, Zoom leaves Refine mode and shows the saved clip in plain Zoom. Escape in Refine mode returns to plain Zoom on the same clip; a second Escape closes Zoom as usual. Leaving Refine mode with a staged edit, by Escape, closing Zoom, or switching screen or folder, first asks "Discard" or "Keep editing", as the Refine screen does today. | The user chose to be asked; returning to plain Zoom keeps the user's place. |
| D11 | Saved clips keep the audio of what they were cut from. | Today's extraction keeps source audio; a refined clip should not lose it. |
| D12 | The separate Collection Refine screen, its right-click entry and its supporting parts are removed. GIF Extraction's Refine screen for captured ranges is unchanged. | The user's choice; one way to refine a Collection clip. |

## Visible behavior

The user right-clicks a clip and chooses Refine, or chooses Refine from Zoom's edit menu. Zoom shows the clip with a hint line such as "Q start · W end · A/S jump · Z loop · X save · Esc leave". Within seconds the clip is ready and the user can step, jump, play and set the start and the end. For a clip from a movie, the hint line also reports the movie: "Finding the source movie…", then "Preparing the source movie to extend…", then nothing once extending works. If the movie cannot be found automatically, a file picker asks for it right after entering the mode; if the user cancels, the hint line says the clip can only be trimmed and its saved version will have no source info.

Stepping past the clip's first or last frame shows the movie's neighboring frames once extending works; before that, the step does nothing and the hint line explains why. Z loops the staged range so the user can judge it. X asks "Keep both" or "Replace". While saving, the hint line shows progress; when done, Zoom shows the saved clip, Activity reports the result, and for Keep both the new clip appears after the original in the grid.

## Scope

This feature covers D1–D12. It does not change GIF Extraction or its Refine screen, Loopify, saved captures, or how source info is written by ordinary extraction. Making GIF Extraction's own Refine keys work during playback, and source info for Loopify output, are separate later work.

## Acceptance behavior

1. From the right-click menu and from Zoom's edit menu, Refine opens the clip in Zoom in Refine mode with the hint line; keys act as in D3 both while playing and while paused, and a key that cannot act explains why in the hint line.
2. A clip without source info can be trimmed at both ends and saved; the saved clip plays exactly the staged frames, has its audio, and carries no source info. Stepping past its ends does nothing and the hint line explains why.
3. A clip with source info can be trimmed at once and, after its movie is prepared, extended by a few frames at both ends. The saved clip plays exactly the staged range of the movie, and its source info names that range. When the movie is not found automatically, the app asks for it on entry; cancelling leaves trimming only, and the saved clip has no source info.
4. Keep both adds `<name>-refined.mp4` right after the original in a saved collection's view and marks that view unsaved, or in name order in the folder's full list; a second Keep both of the same clip adds `-refined-2`.
5. Replace leaves one clip under the original name showing the new frames in the grid and Zoom, with the original in the Recycle Bin and every collection still listing the name. If the original is held open by another program, the new clip is kept as `-refined` and Activity explains.
6. Escape, closing Zoom, or changing screen or folder with a staged edit asks Discard or Keep editing; Keep editing returns to the same frame and staged edit.
7. The Collection Refine screen no longer exists; GIF Extraction's Refine screen still works as before.
8. Verified in the running app on the user's clips: one clip with source info (extend and Replace) and one without (trim and Keep both).

## Rejected alternatives

- R1: Keep the separate Collection Refine screen and only fix its keys - the user prefers a local edit; superseded by D1 and D12.
- R2: Show a timeline in Refine mode - edits beyond the clip are a few frames, so it adds clutter without value; superseded by D2.
- R3: Ask for the source movie only when the user first tries to extend - the user preferred to be asked on entry; superseded by D6.
- R4: Trim a tagged clip from the clip itself and adjust its source info by the trimmed frames - the source info records each endpoint's exact frame identity in the movie, which only the movie can provide; superseded by D7.
- R5: Name Keep-both output with the collection's numbering (`<collection>-NNN`) - the user preferred a Loopify-style suffix; superseded by D8.
