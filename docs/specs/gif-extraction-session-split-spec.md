# Feature Spec: Split GifExtractionSession by Responsibility

Status: signed off (2026-10-16)

## 1. Goal and scope

`GifExtractionSession` in `src/app/gif-extraction-session.ts` is the application-layer object behind the GIF Extraction screen, the Refine Gif screen and the Clips panel. At about 990 lines it owns six different jobs:

- the connection to the opened movie: choosing and opening it, its preparation progress, and replacing it when another movie opens;
- the capture queue: marking start and end, locking ranges, removing ranges and the draft, and checking saved frames against the movie;
- saving the queue for each movie and restoring it when that movie is opened again;
- the start thumbnail of each capture;
- refining one range against exact frames;
- extracting ranges into clips and reporting the result.

It also serves a second purpose. A second instance runs Collection Refine, which refines one clip of a saved collection from its original movie. That instance imports one range, never saves captures, and differs from the first only by a mode chosen at construction.

Because every job lives in one class, any change to one of them means reading and testing all of them. Two review findings also come from this shape:

- refining a clip from a collection builds a fake saved-capture record to create its one range;
- the check that saved frames still match the movie must be run by callers before locking a draft or refining a range. The GIF Extraction screen and the refine workflow each repeat it.

Goal: give each job its own class in `src/app/`, make Collection Refine its own small session class built from the same parts, and fix the two findings above.

This is a behavior-preserving refactor. Every user-visible behavior, message, Activity entry and file write stays the same.

Out of scope (separate tasks):

- renaming existing classes for one meaning of "Session" (review finding about vocabulary), apart from naming the new classes consistently (D9);
- the domain model's dependence on the browser `File` type;
- user-facing text that lives in domain classes (for example "Press Q to begin a new range.");
- the repeated branching on capture endpoint kinds;
- the GIF Extraction and Refine Gif screens' own behavior and layout.

## 2. Target structure

Each part below is a class in `src/app/`.

| Part | Responsibility | State it owns |
|---|---|---|
| `GifSessionStatus` | The short status line both GIF screens show, the preview revision (a counter the screens use to notice that the previewed range changed), and the single change notification that tells the owning session to publish a new snapshot. | message; preview revision |
| `CurrentMovie` | Choosing a movie or taking one chosen elsewhere, opening it for frame review, following its preparation, reporting preparation progress and readiness to Activity, and disposing the previous movie only after a replacement opens. It holds the movie currently open for review, including the states before one is open. | opened source; frame-review session; review state; source generation; lifecycle (empty, choosing, opening, open, failed, disposed) |
| `CaptureQueue` | The draft and the locked ranges of the current movie: mark start, mark end, lock, select, remove a range, discard the draft, and check saved frames against the movie before a saved draft is locked or a saved range is refined or extracted. Owns the start thumbnails through the existing `GifCaptureThumbnailSession`. | range capture model; selected range |
| Capture storage | Where the queue is kept between runs. Two implementations of one interface: saved storage (today's per-movie saved queue, restore on reopen, stale-movie detection) and unsaved storage (nothing is written). Answers whether captures can be removed. | saved queue binding and restore progress (saved storage only) |
| `RangeExtraction` | Extracting one range or all ready ranges, retrying a failed publication, cancelling, the destination, and the Activity reporting of a finished, cancelled or partly failed extraction, including each provenance warning once. Wraps the existing `ClipExtractionWorkflow`. | destination; warnings already reported |
| `RangeRefinement` | Starting, abandoning and committing the refinement of one range, and deciding whether a refinement may replace its range. Is the owner that `RefineGifSession` reports to. | active refinement; its last seen revision |
| `GifExtractionSession` | GIF Extraction: builds the parts above with the capture storage it is given (saved storage in the app), assembles the snapshot the screens and panel read, and offers the operations they call. | none beyond its parts |
| `CollectionClipRefinementSession` | Collection Refine: opens the original movie of a collection clip, imports that clip's range, and offers refinement and extraction of that one range. Built from the same parts with unsaved storage. | none beyond its parts |

## 3. Decisions

| ID | Decision | Rationale |
|---|---|---|
| D1 | Split into the parts in section 2. Each part receives its collaborators in its constructor. Parts call each other directly through narrow interfaces declared next to the part that uses them. | Each job can then be read, changed and tested on its own, following `coding-quality.md` and `ui-coding-quality.md`. |
| D2 | All parts write the status line and advance the preview revision through one shared `GifSessionStatus` object, created by the owning session and passed to each part. When anything changes, `GifSessionStatus` notifies the owning session, which publishes one new snapshot. No part publishes on its own. | Today many operations set the message and advance the revision; one shared owner keeps a single publisher and avoids every part calling back into the session. |
| D3 | The snapshot type the screens and panel read (`IGifExtractionSessionSnapshot`) keeps its shape and meaning. Both sessions produce it. | The screens, the Clips panel and their tests keep working unchanged; the refactor stays inside the application layer. |
| D4 | The screens and the Clips panel stop naming the concrete `GifExtractionSession` class. Each declares a narrow interface of the members it uses, and both sessions satisfy them. | A UI part can then serve either session without knowing which one it got. |
| D5 | Whether captures are saved is decided by which capture storage the composition root gives the session, not by checking for an optional store. The removal rule moves onto the storage: saved captures can be removed while their movie reference exists, even if the movie is unavailable; unsaved captures only while the movie is open. | Replaces the remaining checks on an optional dependency with one place that states the rule. |
| D6 | `CaptureQueue` checks saved frames itself. Locking a draft that has saved endpoints, and starting to refine a saved range, first check those frames against the movie, as extraction already does. Locking and starting a refinement therefore become asynchronous. The GIF Extraction screen and the GIF range refinement workflow stop running the check themselves. | A new caller can no longer forget the check and leave the user stuck with "Check the saved exact frames before locking this draft." Fixes the review finding about the saved-frame check. |
| D7 | The range capture model gets a domain factory that creates a model holding one exact range from two frame identities. Collection refinement uses it instead of building a fake saved-capture record. | Collection refinement then no longer depends on the saved-capture file format. Fixes the review finding about storage formats in refinement. |
| D8 | Collection Refine becomes `CollectionClipRefinementSession`. The two mode factories added on this branch (`GifExtractionSession.forMovieCapture` and `forCollectionRefinement`) are removed again; `GifExtractionSession` serves GIF Extraction only. | Each session class then has one purpose and no mode switch. |
| D9 | New class names follow one vocabulary. "Session" names an object that holds an opened movie (the two sessions). The other parts are named for what they hold or do. Existing classes keep their names in this refactor. | Applies the guideline's one-meaning-per-suffix rule to new code without widening the scope. |
| D10 | Before any part moves, unit tests record today's behavior where the existing tests do not reach it. The plan lists the cases. Among them is the end-to-end test "a saved capture can be removed when its source movie is unavailable". It has failed on every branch since before this work began. The cause is found and recorded first, so the refactor can be checked against that flow. | The refactor relies on tests to prove nothing changed, and the removal and restore paths are the ones this split moves. |
| D11 | Parts move one per commit, smallest dependency first. Every commit keeps the type checks and the unit and integration tests green. The GIF end-to-end specs and the checks in the running app run once at the end. | Each step stays small and revertible without repeating the slow checks. |

## 4. Ownership and constraints

- Parts depend on each other in one direction:
  - `GifSessionStatus` and `CurrentMovie` use no other part.
  - `RangeExtraction` uses those two and receives the ranges to extract from its caller.
  - `CaptureQueue` uses those two and its storage, and asks `RangeExtraction`, through a narrow query, which ranges are already extracted and which are held by a running extraction. It needs both answers to save the queue and to decide whether a range can be removed.
  - `RangeRefinement` uses all of the above.
  - Nothing depends on the two sessions except the UI and the workflows.
- The sessions coordinate steps that span parts, such as checking a saved range before extracting it. They also own the order of steps when a movie is replaced and when the session is disposed. Both orders stay exactly as today. For a replacement that is: save the old queue, cancel any extraction, invalidate the active refinement, clear thumbnails, switch to the new movie, then dispose the old one.
- No part imports from `src/ui/`.
- User-facing text stays exactly as it is today.
- `RefineGifSession`, `ClipExtractionWorkflow`, `SavedCaptureQueuePersistence` and `GifCaptureThumbnailSession` keep their current behavior; they are reused by the new parts.

## 5. Acceptance behavior

The refactor is complete when all of the following hold:

1. The existing unit and integration tests and the new tests from D10 pass. Existing tests change only for construction of the sessions, the asynchronous lock and refinement start (D6), and the narrow UI interfaces (D4).
2. These end-to-end specs pass: `collection-refine`, `gif-exact-preview`, `gif-extraction-output`, `gif-extraction-shell`, `gif-jump-by-seconds`, `gif-movie-fullscreen`, `gif-resume-after-capture` and `gif-startup-empty`. "A saved capture can be removed when its source movie is unavailable" either passes or has a recorded cause outside this refactor.
3. A check in the running app shows unchanged behavior for:
   - opening a movie and watching preparation reach exact capture;
   - marking, locking, refining and extracting a range;
   - extracting all ranges and cancelling an extraction;
   - restarting the app, reopening the movie and seeing the saved captures restored and positioned after the last one;
   - locking a restored draft and refining a restored range without any extra step;
   - removing a saved capture whose movie is unavailable;
   - refining a collection clip from its original movie and adding the new clip to that collection.
4. No class in the split is longer than about 350 lines, and neither session checks a mode or the presence of an optional dependency.
5. Collection refinement contains no code path for saved captures.
6. `docs/agent-docs/agent-architecture-map.md` describes the new parts, updated with the `doc-update` skill.

## Rejected alternatives

- R1: Keep one class and make only the mode explicit - rejected because it leaves six jobs in one class; superseded by D1 and D8.
- R2: Give each part its own published snapshot and let the screens combine them - rejected because it changes every screen and the panel for no user benefit; superseded by D3.
- R3: Keep collection refinement inside `GifExtractionSession` with saved storage switched off - rejected because the class would still carry both purposes; superseded by D8.
- R4: Rename `RefineGifSession`, `GifCaptureThumbnailSession` and the other existing "Session" classes in the same change - rejected to keep the refactor reviewable; superseded by D9.
- R5: Name the movie part `MovieReviewLease` - rejected because "lease" is a programmer's metaphor that covers only holding and releasing the movie, not choosing, opening and following it; superseded by D9.
