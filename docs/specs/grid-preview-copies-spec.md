# Small preview copies for big Collection views

## Why this matters

The Collection grid plays every card's clip at once, and each card decodes its clip at full size even though it is drawn small. The user's extraction clips are 1800×1080 H.264 at 24 frames a second and 9–28 Mb/s. Measured on the user's machine, the video decoder keeps up with about 24 such clips at once; with the 59 clips of `extraction-tmp` every clip drops frames (6–19 of 24 frames a second, 11–42% dropped), so the grid stutters. The same 59 clips copied at 480 px wide played smoothly (24.5 frames a second, 3% dropped), and making the copies took 8.6 s (`test-evidence/playback-smoothness/capacity-results.json`). This feature lets big views play small copies of their clips, sized to their cards, while small views and Zoom keep playing the originals.

Already done separately, and assumed here: only the cards the shown view displays play, and the grid pauses while Zoom or another screen is shown (commit `c4a3516`).

## Terms

- **Grid**: the Collection view's grid of clip cards (`ClipCollectionGridControl`). A **view** is what the grid shows: the folder's full list or one saved collection. Collection full screen shows a view's cards in a fixed number of larger slots.
- **Original**: the clip's own file.
- **Preview copy**: a small, silent copy of a clip, made by the app for playing on grid cards. It has the clip's frames, frame rate and length, scaled down.
- **Size step**: one of the fixed copy heights 270, 360, 540 and 720 pixels.
- **Decode capacity**: how much video this machine's decoder plays smoothly at once, as pixels per second (width × height × frames per second, summed over the clips playing).
- **View load**: the decode capacity a view would need to play all its displayed cards from their originals.

## Decisions

| ID | Decision | Reason |
|---|---|---|
| D1 | A view whose load exceeds the machine's decode capacity plays preview copies on all its displayed cards; any other view plays the originals. The rule is applied again when the view, its displayed cards or the decode capacity change. Collection full screen applies the same rule to the cards it shows. | The user's choice: small views keep sharp originals, which play smoothly there anyway; one rule per view keeps every card in a view equally sharp. |
| D2 | Zoom and Zoom edit mode always play the original. | They show one clip large; the decoder handles it. |
| D3 | The decode capacity is measured once, at the first start of the app and again after a change of graphics device, graphics driver or the app's video playback (its Electron version). The measurement runs in the background after startup, takes about 10 s, plays a full-HD test clip the app makes for it several times at once, increasing the number until frames drop, and stores the largest smooth load. It does not block the user. Until it has finished, every view plays its originals. | The user's choice: a known limit from the first folder on, at the cost of a short background test once. |
| D4 | A view's load is the sum, over its displayed cards, of each original's width × height × frames per second, which the main process reads from the file once (with FFprobe) and keeps in the preview copy cache's index under the same key as the clip's copies (D8). A clip whose size or frame rate cannot be read counts as 1920×1080 at 30 frames a second, so it errs toward copies. | Clips differ in size and frame rate; counting clips would misjudge a view of small or slow clips. |
| D5 | A preview copy is as tall as the view's displayed card height times the screen's pixel density, rounded up to the next size step (720 when it is taller than that), and never larger than the original. One copy serves every view and window size that needs the same step. While the step a card needs is not ready, the card plays a larger step's copy if one is ready, else the original. | The user's choice: sharp enough for the card, and few copies per clip. |
| D6 | A preview copy keeps the clip's frame rate and length exactly and has no sound (grid cards are muted). It is H.264, encoded by the app's own FFmpeg in the main process. | It must loop as the original does; H.264 decodes in hardware. |
| D7 | Copies are made only for views that need them (D1), so none before the decode capacity is known (D3). They are made in the background, one at a time, starting with the shown view's cards in their order. While a card's copy is not ready, the card plays its original; when the copy is ready, the card switches to it. | The user's choice: everything keeps moving on the first visit, accepting that a big folder stutters until its copies are ready (about 0.15 s per clip). |
| D8 | Preview copies are kept in a cache in the app's profile folder, keyed by the original's path, size and modification time and by the size step, so a changed, replaced or renamed clip gets a new copy. The cache holds at most 200 MB: after each new copy, the least recently used copies are removed in the background, never a copy the shown view uses. If the shown view's copies alone exceed 200 MB, the cache stays over the limit until another view is shown. A removed copy is made again when needed, and the original plays until then. Copies survive restarts. | The user's choice: removal never interrupts what is on screen. |
| D9 | If a copy cannot be made, the card plays its original, and Activity's history notes it once per clip without counting it as an error. | A missing copy costs smoothness, not data. |
| D10 | The main process makes copies only of clips in folders the renderer was granted, named by folder and file name as every clip request is (`GrantedClipResolver`), and answers a media address, never a path the renderer supplies. | The existing rule for every clip request. |

## Visible behavior

On a big view, such as `extraction-tmp`, all cards play smoothly once their copies are ready. On the first visit the cards play their originals, stuttering, and turn smooth one by one within seconds. Later visits are smooth at once. Cards look as sharp as their size needs; Zoom shows the original. A small view looks and plays as today. The first start, and the first after a change that D3 names, spends about 10 s measuring in the background, with no visible change.

## Scope

In: the decode capacity measurement and its stored result; reading each clip's load; making, caching and removing preview copies; choosing originals or copies per view, including Collection full screen; switching cards to copies when ready.

Out: GIF Extraction and Refine Gif (they play one movie); playing fewer cards at once; a setting to turn copies off or to re-measure (the measurement repeats on its own per D3).

## Acceptance behavior

| ID | Behavior |
|---|---|
| A1 | With copies ready, the 59 clips of a copy of `extraction-tmp` play in the grid with at most 5% of frames dropped over 10 s, measured as in `test-evidence/playback-smoothness/perf-check.cjs` (today 11–42%). |
| A2 | A view whose load is within the decode capacity plays every card from its original. |
| A3 | On the first visit to a big view, cards play their originals at once and switch to copies as each is made; no card stays blank or stopped. |
| A4 | Zoom and Zoom edit mode play the original of a clip whose card plays a copy. |
| A5 | A clip replaced, renamed or edited gets a new copy; its old copy is never shown for it. |
| A6 | With the cache full, opening another big view removes the least recently used copies of other views and never a copy the shown view plays; the cards on screen keep playing throughout. |
| A7 | The first start measures the decode capacity in the background and stores it; a second start does not measure again; until the result exists, views play originals. On the user's machine the stored capacity lies between the load of 16 and of 32 full-HD clips at 24 frames a second, where the manual measurement found the limit. |
| A8 | A copy that cannot be made leaves the card playing its original and adds one note to Activity's history. |

## Rejected alternatives

- Copies on every view, always: small views would lose sharpness for no gain (D1).
- A still first frame on cards whose copy is not ready: the user prefers everything moving (D7).
- Learning the capacity from dropped frames during use: the first big folder would stutter before the limit is known; the user chose a startup measurement (D3).
- Copies at each view's exact card size: every window size and view would need its own copies (D5).
- A hard 200 MB limit that leaves part of a view on originals: removal must never change what is on screen (D8).
- Playing at most a fixed number of cards at once: in `extraction-tmp` all 59 cards are on screen, so most would stand still.
- One fixed copy size of 480 px: soft on large cards and wasteful on small ones (D5).
