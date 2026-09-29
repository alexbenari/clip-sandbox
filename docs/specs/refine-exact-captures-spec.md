# Feature Spec: Refine Exact Captures

Status: Signed off by the user (2026-09-26). The user waived execution-plan sign-off for this feature.

## 1. Goal and scope

Refine remains the focused GIF Extraction flow for changing the start and end of a captured range against exact frames of its already-open underlying movie. It must accept both ranges that need exact frames and ranges whose boundaries are already exact. A locked revision changes the capture used by a later extraction.

Editing an existing saved clip is a separate future **Edit** flow. This feature does not open an existing clip as a Refine source, trim a saved file, or establish source-movie provenance for saved clips.

This spec extends the shipped Refine Gif behavior described in `gif-extraction-workflow-spec.md`; its inexact-only entry restriction no longer applies.

## 2. User flow

1. In GIF Extraction, the Clips panel offers **Refine** on every locked captured range, whether either endpoint is a playback timestamp or both are exact frames. Double-clicking a captured range enters Refine for that range. Either action opens the existing contextual Refine Gif screen.
2. The screen keeps the same movie, player, progress bar, Clips panel, keyboard shortcuts, and Back action. It shows the selected range's current Start and End. A timestamp endpoint is labelled as needing an exact frame; an exact endpoint shows its current canonical frame and position.
3. For a range with a timestamp endpoint, focus begins on the first endpoint needing an exact frame, as today. For a range with two exact endpoints, focus begins on Start. The user can focus and replace either endpoint by displaying an exact frame and using the existing Set start/end actions (`Q`/`W`).
4. Changes remain staged until **Lock exact range** (`A`). Back before locking discards staged changes and leaves the captured range and its extraction state untouched.
5. Lock requires two exact endpoints from the current movie generation in inclusive frame order; equal Start and End is a valid one-frame range. Lock replaces the existing captured range in the Clips side panel, without adding a second entry or changing its queue position or identity. The displayed start thumbnail updates when Start was replaced.
6. On return, the Clips panel reflects the revised endpoints. The existing Next inexact range action continues to navigate only ranges still needing exact frames; an already exact range may be refined without changing that navigation rule.

The Refine screen's wording must describe both cases accurately. It must not tell a user with an exact range that the range is inexact or that exact frames are missing. The Clips panel continues to distinguish an exact, extractable range from one still needing exact frames.

## 3. Extraction behavior

- Refine never writes or replaces a media file. Extract remains a separate explicit action.
- If the range has not been extracted, a changed exact revision is eligible for extraction under the existing exact-only rules.
- If the range was already extracted, its saved clip and collection membership remain unchanged. Locking changed endpoints makes the revised range eligible for a **new, explicitly requested** extraction; that extraction creates a new output under the existing collision-safe naming and publication rules. The UI must make clear that the earlier output still exists.
- Locking an unchanged exact range does not create a new extraction opportunity or alter its current extraction outcome.
- An extraction in progress, a publication in progress, or a failed publication awaiting retry cannot be silently reinterpreted as a different range. Refine must prevent committing a changed revision while such work is unresolved and give a clear recovery path. A completed, failed, or cancelled extraction may be revised; a changed revision gets a fresh pending extraction state. Existing completed media remain on disk.
- Extract All includes only exact ranges currently eligible for extraction. It does not re-encode previously completed unchanged ranges.

## 4. Ownership and constraints

- `GifExtractionSession` continues to own the movie lease, capture queue, selected range, refinement lifetime, thumbnails, and extraction coordination. The domain range model owns replacement and frame-order invariants. `RefineGifSession` owns only staged endpoints and commit intent; the UI does not mutate queue or extraction state directly.
- A changed range revision must invalidate extraction status associated with its earlier boundaries without deleting or rewriting an already published clip. Publication retry must remain tied to the media that was actually encoded.
- Keep the existing framework-free screen, shared player, contextual workspace behavior, and keyboard/focus model. No second timeline, modal editor, background source lookup, or new native video backend is part of this feature.
- Update the Refine surface brief and agent architecture map when implementation changes their inexact-only descriptions. This draft does not change those current-state documents.

## 5. Acceptance behavior

1. An exact captured range exposes Refine; opening it shows its current canonical Start and End, and Back without Lock leaves both endpoints and extraction state unchanged.
2. Changing either or both exact endpoints and locking preserves the range id and queue position, validates frame order, updates the affected thumbnail, and leaves the range ready for an explicit extraction.
3. An inexact or mixed range retains its current refinement behavior, including failure when exact review is unavailable and rejection of reversed endpoints.
4. A previously extracted exact range can be refined without changing the saved output. After a changed lock, it can be extracted again on request; an unchanged lock does not make it eligible again.
5. Active extraction or unresolved publication cannot publish media against a revised range unnoticed; the user receives a clear blocked or recovery state.
6. The contextual screen, Clips panel, keyboard controls, focus return, and displayed frame identity remain coherent across entry, staging, Lock, and Back for both endpoint kinds.

Verification should include focused range/session and panel tests plus a real Electron Refine path for an exact capture. The Electron check must prove the visible result and the prior saved output's preservation where applicable.
