# Source movie glyph on Collection clips

## Why this matters

Clips extracted by Clip Sandbox record which movie they came from, but nothing in the Collection grid shows it. The user cannot tell at a glance which clips can be refined from their movie, and a clip refined into a saved collection is named after that collection (for example `favorites-007.mp4`), so its file name no longer reveals the movie either. This feature marks those clips on their grid cards and names the movie in the clip's right-click menu. It is the first part of a larger direction in which clips that know their source movie can start movie work from the grid; later parts are listed under Scope.

## Terms

- **Source info**: the `clip-sandbox.prov.v1` metadata tag that GIF Extraction and Collection Refine write into each new MP4 clip. It holds the source movie's fingerprint, the movie's file name at extraction time, and the clip's inclusive frame range in that movie. The tag is written and validated by `Mp4Provenance` in `electron/clip-provenance/mp4-provenance.cjs`.
- **Movie name**: the movie's file name from the source info without its final extension; for example `Heat.1995.1080p.mkv` is shown as `Heat.1995.1080p`.
- **Source glyph**: the small film icon this feature adds to a grid card.
- **Trusted process**: the Electron main process, which alone reads files on disk; the renderer (the app's window) asks it through the preload API.
- **Re-listing**: the app reading an open folder's file list again without the user reopening it, for example after an extraction publishes a new clip into that folder.

## Decisions

| ID | Decision | Reason |
|---|---|---|
| D1 | A clip has source info only when it is an MP4 with a valid source-info tag, by the same validation as today. Every other clip shows no glyph and no movie name; the absence of the glyph is the only signal. | Today only clips extracted by the app carry the tag; Loopify outputs and older or external clips do not, and marking them would add noise. |
| D2 | The trusted process reads the tag by walking the MP4 file's metadata boxes directly (`moov`, `udta`, `meta`, `keys`, `ilst`), with no FFprobe process. It reads box headers, seeks past media data, and refuses a metadata box larger than a fixed bound. This one reader replaces FFprobe for every source-info read: Refine availability, Refine source lookup, the folder read in D4, and the read-back check after extraction. | Measured on the user's real clips (127 MP4s, 52 tagged): about 2–7 ms per clip on first read and under 1 ms when the file is already in memory, against 45–72 ms per clip for FFprobe, with identical results for all 127 files, including one whose metadata sits at the end of the file. |
| D3 | Source info is not cached anywhere. It is read again whenever a folder's clip list is loaded or re-listed. | At the D2 cost a full re-read is cheap, the tag travels inside the file, and clips moved between pipelines, replaced on disk, or created by an edit need no cache maintenance. |
| D4 | Every time the Collection grid shows a newly loaded or re-listed folder, the app asks the trusted process, in one request, for the source info of every clip in that folder. The trusted process reads the clips a few at a time and answers with each clip's movie name or "none"; a clip that is not an MP4 file is answered "none" without being opened, and a clip whose metadata cannot be read is answered "none". Switching between the folder's full clip list and its saved collections asks nothing new, because the answer stays on the clips (D6). A clip added to the open folder's list without re-listing (Loopify output) is read on its own when it is added. The grid does not wait: glyphs appear when the answer arrives. An answer for a folder that is no longer open, or for a clip no longer listed, is dropped. | A slow drive must never delay opening a folder. Reading a header downloads nothing the grid's own video preview does not already read, including for OneDrive online-only files. |
| D5 | Only the movie name and whether the clip has source info reach the renderer from the folder read. The fingerprint and frame range stay in the trusted process, where Refine already uses them. | The glyph needs nothing more, and the renderer contract stays narrow. Grouping by movie may later need a movie identity; that part of the work will extend the contract. |
| D6 | The movie name is a fact about the clip file, so the renderer keeps it on the clip's runtime `Clip` object (`src/domain/clip.ts`) next to the other facts read from the file, such as duration and video size. It is cleared when the clip's file is replaced. | The grid already renders from `Clip`, and the value has the same lifetime as the clip's other file metadata. |
| D7 | A card whose clip has source info shows a source glyph in its top-left corner: a 16px film icon in the app's 1.6px-stroke style, in Quiet Slate on a small translucent Booth Black backing so it reads over bright video. Hovering it shows the tooltip "From <movie name>". The glyph follows the title visibility rule exactly: hiding titles hides it, and it never shows in Collection full screen. It does not move, resize, or cover the file name overlay, and clicking or dragging on it acts on the card as anywhere else on the card. | The user chose a corner glyph over a second text line, a hover chip, or a conditional line, to keep the media-first grid quiet. |
| D8 | When the right-clicked or keyboard-targeted clip has source info, its context menu starts with a non-interactive line "From <movie name>" in small Quiet Slate text (the design system's Supporting Label style). The line always describes the clip under the pointer or keyboard focus, even when several clips are selected; a right-click on empty grid space shows no line. Arrow keys skip it, opening the menu from the keyboard still focuses the first actionable item, and the line is part of the menu's accessible name. A clip without source info gets no such line, and Refine keeps its current disabled reasons ("No source movie info", or that the info could not be read). | Keyboard and screen-reader users get the movie name without hovering a tooltip, and it sits next to the actions that will use the movie. |
| D9 | The context menu reads the clicked clip's source info when it opens, with the D2 reader, rather than using the result of the folder read. That read now also returns the movie name for D8. | The folder read may not have finished when the user right-clicks; an on-open read of one header costs a few milliseconds. |

## Visible behavior

Opening a folder shows the grid as it does today. Shortly afterwards (within about a second for a few hundred clips on a local drive), cards whose clips came from a movie through Clip Sandbox show the film glyph in their top-left corner; other cards stay unchanged. Hovering the glyph shows "From Heat.1995.1080p". Right-clicking such a clip shows "From Heat.1995.1080p" as the first line of the menu, above the existing items; Refine is available as today. Hide titles removes the glyphs together with the file names, and Collection full screen shows neither.

Moving a clip into another pipeline folder outside the app and then loading that folder shows the glyph there, without any stored app data. Replacing a clip's file on disk and reloading the folder shows the glyph according to the new file.

A clip whose metadata cannot be read shows no glyph; its menu explains why Refine is unavailable, as today. A failed folder read leaves every card without a glyph and does not report an error to Activity; Refine still works through its own read (D9).

## Ownership

The direct reader belongs to the trusted Electron process beside `Mp4Provenance` in `electron/clip-provenance/`, which keeps validating the tag's contents. `CollectionClipRefinement` in `electron/collection-clip-refinement.cjs` uses it for Refine availability and source lookup, and the extraction runtime uses it for its read-back check. The folder read is a new request through the preload API. It accepts only a folder the user has opened in this window (a current folder grant) and plain file names inside it, the same rules Refine applies today, and is served by a trusted-process owner separate from Refine. In the renderer, a new app-layer workflow under `src/app/` starts the folder read after a load or re-listing, applies the answer to the matching `Clip` objects, and asks the grid to show the glyphs. `ClipCollectionGridControl` in `src/ui/clip-collection-grid-control.ts` draws and hides the glyph. `GridContextMenuWorkflow` passes the movie name to `GridContextMenuControl`, which draws the menu line. User-facing text comes from `AppText`. The execution plan settles exact class, method, and channel names.

## Scope

This feature covers D1–D9. Later parts of the same direction, each needing its own spec:

- "Extract more from this scene": opening the source movie in GIF Extraction at the clip's range from the card, including remembering where a source movie was found after any successful lookup.
- Filtering or grouping the Collection grid by source movie.

This feature does not change how extraction writes the tag, how Refine finds or opens the source movie, Loopify output, or collection files. It adds no stored data.

## Acceptance behavior

1. In the running app, opening the user's `extraction-tmp` pipeline shows the glyph on every tagged clip and on no untagged clip, within about a second of the grid appearing. The tooltip names the movie without its extension.
2. Hide titles hides every glyph and showing titles restores them. Collection full screen shows no glyphs, and they return after leaving it.
3. Right-clicking a tagged clip shows the "From <movie name>" line first and Refine enabled. Right-clicking an untagged clip shows no such line and the existing disabled Refine reason. Shift+F10 on a focused tagged card opens the same menu with focus on the first actionable item, and arrow keys never land on the movie line.
4. A tagged clip copied into another pipeline folder outside the app shows its glyph when that folder is loaded. A Loopify output added to the open folder shows no glyph.
5. Opening another folder before the first folder's read has answered never puts glyphs on the second folder's cards from the first folder's answer.
6. No FFprobe process is started for any source-info read; FFprobe and FFmpeg remain in use for extraction and Loopify.
7. Reader tests use real MP4 fixtures and cover: a tagged clip; an untagged clip; metadata at the end of the file; a file with no `udta` or `meta` box; a different metadata key only; a truncated file; an oversized metadata box; and a tag whose content fails validation. Each test is first seen failing for the right reason. The reader returns the same value as FFprobe for the tagged and untagged fixtures. The fixtures are small MP4 files made once with FFmpeg's metadata options, committed, and shared by all reader tests, rather than produced by running an extraction in each test.

## Rejected alternatives

- R1: Persist source info in an app-data JSON file keyed by path, size, and modification time — hard to keep right when clips move between pipelines, and unnecessary at the cost measured in D2; superseded by D3.
- R2: Cache source info in memory for the session — unnecessary at the cost measured in D2; superseded by D3.
- R3: Store source info in a hidden file inside each clip folder — adds non-clip files to the user's media folders; superseded by D3.
- R4: Keep FFprobe for source-info reads — about 50 ms of process start-up per clip makes a folder-wide read slow; superseded by D2.
- R5: Show the movie as a second line under the file name, as a hover chip, or only when the file name lacks it — the user preferred a quieter corner glyph; superseded by D7.
- R6: Skip OneDrive online-only files to avoid downloads — the grid already reads every clip to preview it, and Node cannot read Windows file attributes without extra native code; superseded by D4.
- R7: Let the context menu use the folder-read result — it may not have arrived when the user right-clicks; superseded by D9.
