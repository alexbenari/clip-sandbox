# Feature Spec: Faster Exact Clip Extraction

## 1. Summary

Make extraction of short ranges from long movies practical while preserving the existing exact-output contract. A batch must show which clip and stage is active and offer a visible Cancel action. When the faster method cannot establish safe original-source boundaries, extraction automatically uses the existing exact method and explains that this clip may take longer.

This change applies to both `Extract All` in the Clips panel and extraction of one locked range from Refine Gif. It does not change how ranges are captured or refined.

## 2. User-visible goal

After selecting exact ranges throughout a long movie, the user can create the clips without repeatedly waiting for whole-movie scans or decoding from the beginning. During extraction, the user can see meaningful progress and stop the batch without losing clips already completed or the ranges still to do.

## 3. Current problem and evidence

The current extraction runtime reads every original-source frame timestamp for each range. It also begins video decoding at the start of the source when selecting frames by ordinal, and the audio pass reads the original source without a nearby input seek. For a short range near the end of a long movie, these costs depend heavily on the position in the movie rather than the length of the clip. In the observed three-hour movie, the frame-timing scan for the second range remained active for more than six minutes. The app's extraction workflow supports cancellation internally, but the extraction screen does not expose a Cancel control.

A limited local experiment on a 60-second test movie with long intervals between keyframes produced the same 24 decoded video frames after a nearby seek as full decoding, and a closely matching one-second audio segment. This is feasibility evidence only; it does not establish correctness for variable frame rate, unusual timestamp origins, repaired timestamps, or the user's long movie.

## 4. Confirmed decisions

| ID | Decision |
| --- | --- |
| D1 | Exact original-source frame boundaries, source video and audio, and existing output quality are mandatory. |
| D2 | Use nearby source work for ordinary clips and avoid repeated whole-movie scanning or decoding. |
| D3 | If the faster method cannot be verified for a clip, automatically continue with the existing exact method and tell the user it may take longer. If that method also cannot verify the source or boundaries, fail the clip without publishing it. |
| D4 | Show truthful current-clip and stage progress for one or many clips, without an invented percentage or ETA. |
| D5 | Expose Cancel from the extraction UI; keep completed publications and unfinished captures safe to retry. |
| D6 | Keep batch and media responsibilities at their existing application and trusted-process boundaries. |

## 5. Detailed behavior

An original-source frame ordinal is a picture's numbered position in the selected video stream. Pre-roll is the nearby video decoded before the selected first picture so extraction can start accurately. MP4 provenance is the embedded record of which source and exact frames produced a clip.

### 5.1 Exactness and source

1. Only locked ranges with two verified exact original-source frame endpoints are eligible, as today. The start and end original-source frame ordinals are inclusive.
2. Every output contains the selected first and last source pictures, exactly the selected number of video frames in their original order, source dimensions, and audio aligned to that source interval. Export uses the original movie and selected tracks, never the review proxy.
3. Repaired canonical timestamps and proxy playback timestamps must not be treated as original-container seek positions. A fast seek is allowed only when its mapping back to original-source ordinals and timing is trustworthy.
4. Under D3, a faster method must fail closed when source identity, stream selection, timing, seek mapping, or boundary verification is unavailable or inconsistent. Do not publish a clip with guessed boundaries.
5. Existing output quality settings, MP4 provenance, destination, filename allocation, collection membership, and no-overwrite behavior remain in force.

### 5.2 Speed

1. The ordinary fast path must not run a full-movie frame-timestamp scan for every range or decode video or audio from the beginning of the movie for a range near its end.
2. Source-bound timing or index work may be reused across ranges in one batch and later extractions only while the validated source identity and selected stream still match. Stale information must be invalidated when the source changes. Any persistent reuse must be bounded and safe to discard.
3. Work for an ordinary late range should depend mainly on its local seek/pre-roll region and clip length. The implementation plan will choose and measure the method against a baseline; this spec does not promise an unmeasured time or speedup factor.
4. The exact fallback may remain slow, but it must not be presented as a fast-path success.

### 5.3 Progress and cancellation

1. While one clip or a batch runs, show the active range's position, the number completed, and a truthful stage such as checking source boundaries, encoding video, adding audio, or saving the clip. Do not display a percentage or ETA unless it is based on real measured work.
2. A visible, keyboard-accessible `Cancel` control is available wherever the user started extraction. It requests cancellation of the active native work and prevents later ranges in that batch from starting.
3. Cancellation removes temporary media for the interrupted range. Completed and durably published clips remain in the collection. The interrupted and unstarted locked ranges remain available for explicit retry; the app does not restart them automatically.
4. If Cancel arrives while a clip is being published to the collection, the app finishes or resolves that publication safely before reporting the final outcome. It must not call a published clip cancelled or discard the range while collection membership is uncertain.
5. A failed range does not stop later ranges in `Extract All`. Failure, fallback, cancellation, and completed counts remain understandable in the Clips panel and Activity and Errors. Restart restores unfinished locked ranges under the existing capture-persistence rules; it does not resume an interrupted batch automatically.

## 6. Ownership and boundaries

- The extraction workflow owns batch order, current-range state, cancellation, and retry policy. The session exposes those actions to both screens.
- The trusted extraction runtime owns original-source timing, seek and encode decisions, temporary files, media verification, and atomic media publication. The renderer receives progress and outcomes, not source paths or command details.
- The Clips panel and Refine Gif screen present the shared batch state and Cancel action. They do not independently decide which ranges are exact, retryable, or safe to publish.
- Any source-bound timing/index reuse belongs to the trusted media side and is keyed to validated source identity and stream. It is not part of durable user capture data.

## 7. Acceptance and verification

1. On representative constant-frame-rate, variable-frame-rate, long-keyframe-interval, nonzero timestamp-origin, and timestamp-repaired sources, compare fast-path clips against an independent original-source reference: frame count, ordered first and last source pictures, intermediate frame sequence, dimensions, and audio interval/synchronization. Cover a one-frame range and a range at the source end.
2. Exercise a source that forces fallback and confirm that it still produces the exact expected clip while showing the slower-method status.
3. Measure stage durations for the current implementation and the new one on the same representative long source and late ranges. Report median or per-range measurements with the source, machine, and cache state stated. Confirm the ordinary fast path does not repeat a whole-source scan or decode-from-start for each clip.
4. In the actual app, run `Extract All`, inspect progress, cancel during active native work, then retry. Verify completed clips remain, interrupted/unstarted ranges remain available, temporary files are cleaned, and no output is duplicated or overwritten. Also verify cancellation during publication and app restart behavior.
5. Verify a full batch against the user's long movie in the actual app when the source is available. The manual check is required before claiming the user-visible performance and UX goal complete; automated tests alone are insufficient.

## 8. Scope limits

- No change to `Q`/`W` capture, exact frame navigation, looping, refinement, or player preview behavior.
- No new output format, bitrate/quality policy, audio-track selection, or collection naming scheme.
- No background extraction after app close, automatic restart of interrupted batches, or invented percentage/ETA.
