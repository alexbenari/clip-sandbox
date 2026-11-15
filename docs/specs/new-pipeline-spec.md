# New pipeline

## Why this matters

A pipeline is a folder of clips directly under the Pipelines top folder chosen in Settings. Today the only way to start a new one is to leave the app, make a folder in File Explorer, and put a video in it, because the Pipelines list shows only folders that already hold a video. This feature lets the user create an empty pipeline from the Pipelines panel and see it in the list at once. It is the groundwork for moving and copying clips between pipelines, which needs somewhere new to put them.

## Terms

- **Pipelines top folder**: the folder set in Settings ("Pipelines top folder", stored as `pipelinesRootPath`). Its immediate child folders are the candidate pipelines.
- **Pipelines list**: the disclosure tree in the left Pipelines panel (`PipelineCatalogControl` in `src/ui/pipeline-catalog-control.ts`), filled by the trusted process (`PipelineCatalogRuntime` in `electron/pipeline-catalog-runtime.cjs`).
- **Trusted process**: the Electron main process, which alone touches the disk; the app's window asks it through the preload API.
- **Name field**: the inline text field this feature adds at the top of the Pipelines list.

## Decisions

| ID | Decision | Reason |
|---|---|---|
| D1 | A "New pipeline" icon button (a plus in the app's 1.6px-stroke icon style) sits in the Pipelines panel header, left of the fold button. Its accessible name and tooltip are "New pipeline". It is not added to the Collection toolbar or any menu. | The new pipeline is not opened (D6), so the action belongs where pipelines are listed, not beside commands that act on the open pipeline. The header stays in view however long the list is. The user chose this placement. |
| D2 | The button works only when the Pipelines list last loaded successfully from a configured top folder, including a list with no pipelines. Otherwise it looks disabled (reduced opacity, same shape), stays focusable, does nothing when pressed, and its tooltip and accessible description say why: "Set a Pipelines top folder in Settings to create a pipeline." when none is set, "Pipelines could not be loaded." when loading the list itself failed (a pipeline whose contents could not be expanded does not count). While the list is loading it is disabled with no reason text. | The user chose "disabled with a hint". A focusable control can still tell keyboard and screen-reader users why it is unavailable. |
| D3 | Pressing the button opens the name field at the top of the list, scrolls the list to it, and focuses it; its placeholder and accessible name are "Pipeline name". Pressing the button while the field is open only focuses the field. Enter submits; while a submitted name waits for its answer the field is read-only and a second submit does nothing. Escape closes the field without creating anything, and goes no further (it does not also close another surface). Leaving the field submits a typed name, as renaming a clip does, and closes an empty field; leaving a name that was just refused closes the field. Folding the panel counts as leaving the field. A list refresh while the field is open (for example after an extraction publishes a clip) keeps the field and its text. | The user chose an inline row over a dialog. It follows the existing clip-rename pattern, and the field style matches the rename field on clip cards. |
| D4 | The name is trimmed and must be a folder name Windows can create, by the D10 rule. It must not match any existing file or folder in the top folder, ignoring case, including folders the list does not show. No name is reserved by the app. A refusal is shown above the field in the soft red used for validation text, the field stays open with the typed name, and typing hides the refusal: "Windows cannot use this name. Avoid \ / : * ? " < > \| and a dot or space at the end." or "A folder with this name already exists in the Pipelines top folder." | Same rules and wording style as clip rename; a hidden folder with that name would otherwise make creation fail with no visible cause. |
| D5 | The trusted process decides everything. The window sends only the typed name. The trusted process reads the top folder from the stored settings, applies D4, and creates exactly one folder directly inside the top folder, never creating missing parent folders. It answers created, or one refusal: invalid name, name taken, no top folder set, top folder missing, or failed. The Windows name check is the one shared rule of D10. | The window never supplies a path, keeping the desktop trust boundary as narrow as the existing catalog requests. |
| D10 | The app has one Windows name rule, used everywhere a new file or folder name is checked: collection names, collection and Recycle Bin file names (in both processes), clip rename, and this feature. It replaces the four copies the app has today. It refuses exactly what Windows refuses for a new name: an empty name, `.` or `..`, a space at either end, a dot at the end, any of `< > : " / \ | ? *` or a control character, and a reserved device name (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`, any case) before the first dot (ignoring spaces and dots just before it, so `con .txt` is refused). Today's copies disagree slightly, so two things change: control characters are now refused in collection and file names, as Windows does; and a space or dot just before an inner dot (`a .b.txt`, `clip .final.mp4`) is now allowed everywhere, as Windows allows. | The user asked for the copies to be merged. Matching Windows itself is the one rule all four callers can share. The operating system cannot be the check: it silently creates names with a trailing dot or space, device names, and hidden alternate streams for names with `:`, and the errors it does raise give no readable reason. |
| D6 | After a folder is created the field closes, the list reloads, focus moves to the new pipeline's entry, and Activity records a success: "Created pipeline <name>". Nothing else changes: the open pipeline, the active screen and the Collection view stay as they were. If the reload fails, the success is still recorded and the list shows its existing load error. | The user chose "only add it to the list". Moving focus to the entry shows where it landed in the name-sorted list. |
| D7 | The Pipelines list shows a child folder of the top folder when it holds at least one video file directly inside it, as today, or when it holds nothing at all. A folder that holds only other files (for example only collection `.txt` files) or only subfolders is still not shown. Sorting is unchanged: `extraction-tmp` first, then natural name order. | The user chose to widen the existing filter to empty folders rather than drop it. A brand-new pipeline is empty, and unrelated non-video folders stay hidden. |
| D8 | An empty pipeline behaves like any other in the list: expanding it shows "No saved collections." and "No clips.", and Load opens it in Collection with an empty grid. | Existing empty-state text covers it; no new empty state is designed here. |
| D9 | Refusals in D4, "no top folder set" and "top folder missing" appear only above the field. "Top folder missing" reads "The Pipelines top folder no longer exists. Choose it again in Settings." and "no top folder set" uses the D2 sentence. An unexpected failure reads "The pipeline could not be created. Check that the Pipelines top folder can be written to, then try again." above the field, and also records an Activity error with the technical details. | Refusals are about what the user typed or set and are fixed in place; an unexpected disk failure may need the details. |

## Visible behavior

With a top folder set, the Pipelines header shows a plus button beside the fold button. Clicking it opens an empty "Pipeline name" field at the top of the list. Typing "Heist films" and pressing Enter closes the field; the list reloads with "Heist films" in its sorted place, focused, and Activity says "Created pipeline Heist films". The Collection screen still shows whatever was open. Expanding "Heist films" shows no collections and no clips; Load opens it with an empty grid.

Typing "Noir" when a folder called "noir" exists keeps the field open with "A folder with this name already exists in the Pipelines top folder." above it. Typing "a:b" shows the Windows-name refusal. Escape closes the field and nothing is created.

With no top folder set, the plus button is dimmed; hovering or focusing it says to set a Pipelines top folder in Settings, and pressing it does nothing. Setting a top folder in Settings reloads the list and makes the button available.

## Ownership

The trusted process gains one request, "create a pipeline with this name", served beside `PipelineCatalogRuntime` in `electron/` and exposed through `electron/preload.cjs`. It reads the top folder the way the catalog does. The D10 rule is one domain class under `src/domain/`, which the window's code imports and the trusted process loads from the build output, as it already does for the Zoom edit rules. The catalog's listing filter changes for D7. In the window, a renderer adapter under `src/adapters/electron/` validates the answer. `PipelineCatalogControl` owns the plus button, the name field, its refusal text and focus, reports a creation request as a typed event, and is told the outcome; a new app-layer workflow under `src/app/` sends the request, reloads the list, and reports to Activity through `ActivityReporter`. The execution plan settles exact class, method and channel names.

## Scope

This feature covers D1–D10. It does not rename, delete or open pipelines, choose a different parent folder, create collections, or change Browse folder. Moving and copying clips between pipelines is a separate feature; if it needs to create a pipeline on the way, it reuses the D5 request.

Documentation that changes with this feature: the Pipelines catalog description in `docs/agent-docs/agent-architecture-map.md` (which folders are listed, the new request), the Pipelines panel header in `DESIGN.md`, and removal of "New Pipeline" from `docs/feature-requests.md`.

## Acceptance behavior

1. In the running app with a top folder set, the plus button creates a named empty folder directly in the top folder; it appears in the list, focused, in sorted order, and Activity shows the success. The open pipeline, active screen and Collection view are unchanged.
2. Each D4 refusal keeps the field open with the typed name and the stated sentence, creates nothing, and disappears when typing resumes. A name differing only in case from an existing folder, including one the list does not show, is refused as taken.
3. Escape and leaving an empty field create nothing; leaving the field with a valid name, including by folding the panel, creates it.
4. With no top folder set, the button is dimmed, focusable, says why, and creates nothing; after setting a top folder it works without a restart.
5. The list shows empty child folders and folders with videos, and hides folders holding only non-video files or only subfolders; an empty pipeline expands to "No saved collections." and "No clips." and loads into an empty Collection grid.
6. The trusted process never creates a folder outside the top folder or a missing parent, whatever name the window sends, including names with path separators or `..`.
7. Searching the source finds the reserved device names in one place only. Collection names, collection and Recycle Bin file names and clip rename refuse and allow names by D10.
8. Unit tests cover the listing filter, the name rule and the create request's answers, each first seen failing for the right reason. An end-to-end test drives creation through the plus button and the name field in the real app, reusing the Pipelines top folder setup that `tests/e2e/settings.spec.ts` already uses rather than a new launch fixture.

## Rejected alternatives

- R1: A "New pipeline" command on the Collection toolbar — it would sit among commands that act on the open pipeline and be missing on other screens; superseded by D1.
- R2: A "+ New pipeline" text row at the end of the list — scrolls away in a long list and sits apart from where the new entry lands; superseded by D1.
- R3: A compact naming dialog — modal for a one-field action and unlike the rename pattern; superseded by D3.
- R4: Open the new pipeline in Collection right after creating it — the user preferred to stay where they are; superseded by D6.
- R5: List every child folder of the top folder — would show unrelated non-video folders; superseded by D7.
- R6: Ask for a parent folder when no top folder is set — the user preferred a disabled button with a hint; superseded by D2.
- R7: Check the name in the window as the user types — not needed, since the trusted process answers at once; superseded by D5.
- R8: Close the field when the panel folds — the field loses focus before the fold, so the typed name is already submitted; superseded by D3.
- R9: Merge the copies but keep the strictest of today's checks — would refuse names Windows accepts; superseded by D10.
- R10: No name rule at all, relying on the operating system's errors — Windows accepts several broken names without error; superseded by D10.
