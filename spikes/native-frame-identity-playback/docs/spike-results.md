# Native frame-identity playback: final decision

Status: **POC complete**, 2026-08-30. The selected direction is prepared-review
C2. This is an isolated POC decision, not a production integration or release certification.

## Decision

Retain the working stack:

1. BestSource builds the canonical frame map for the original movie or a verified, timestamp-only
   normalized derivative. Every captured boundary belongs to this map.
2. FFmpeg creates a cached, at-most-960-pixel MPEG-4 Part 2 GOP1 review proxy with no B-frames,
   quantizer 5, YUV420P, and one normalized AAC stereo track. Its separate BestSource index maps
   proxy ordinal N to canonical ordinal N.
3. LibVLC 4 supplies normal playback and audio, using the proxy once ready. Exact scrubbing and
   stepping use BestSource proxy frames with canonical source metadata attached.
4. Native helpers send viewport-sized binary RGBA frames through the existing Electron bridge.
   Canvas 2D displays them. Scrub work is bounded and latest-wins; adjacent steps remain adjacent.

On normalized inputs, canonical PTS/timebase belong to the repaired derivative, not necessarily
the original container. Frame ordinals and validated hash order are preserved. Future extraction
must resolve the captured ordinal boundaries against the original movie, not copy repaired PTS
directly into an original-file seek. Proxy playback uses a separate source-relative monotonic clock.

The user accepted full-player scrubbing on the slowest source and subsequently accepted picture
and audio quality. Visible preparation and potentially multi-minute cold waits are accepted.
No additional architecture experiment is required to start planning product integration.

## Evidence and scope

| Gate | Result | Qualification |
| --- | --- | --- |
| C1: LibVLC alone supplies canonical identity | Failed | Relative stepping is insufficient; the public playback clock/display callbacks do not supply the required absolute identity contract |
| C2: native original-source access | 45/45 current representatives decoded and reopened with stable sampled identities | Three tested positions per source, not every frame and not 45 complete Electron journeys |
| Original immediate-readiness/performance contract | Failed | Two movies exceeded the ten-minute index deadline; seven had slow warm random access |
| Amended prepared-review gate | 16/16 selected targets completed | Six normalization cases, three diagnostic cases, six fixtures, and a healthy control; cancellation/cache/adjacent checks are in the linked report |
| Timestamp normalization | Six complete frame-hash sequences preserved | Automatic packed-B-frame unpacking was rejected: it changed frame counts on two sources |
| Full-player proxy dragging | About 7.5-7.9 displayed frames/s on measured journeys | Includes the full 4K Point Break source; not a 24/60 fps scrub claim |
| Proxy profile comparison | 27 bounded runs; GOP1 selected | GOP6/GOP12 did not justify changing the chosen profile; normalized proxy audio accepted by user |
| Phase 3C QSV preparation | 1.71x on a 60-second HEVC sample | Not a full-movie cold-ready measurement; common H.264 was slower and rejected for this lane |
| MS6 soak and reopen | Passed: 600.195 seconds, 199 cycles, five points/two ranges unchanged | No crash, stale overwrite, queue overflow or sustained memory-growth flag; see [stress results](bridge-results.md) |
| Other operating systems | Not tested | [Packaging assessment](cross-platform-packaging.md) describes required work |
| Clean build and regressions | Passed: native 1/1, six valid fixtures plus malformed handling, 126 tests/0 skipped, typecheck | VFR fixture and 4K Electron smoke pass; 4K smoke also passes after cleanup |

There is no currently selected readable signature with a remaining demonstrated native decode
failure. This does not establish universal media support: malformed/unreadable files remain
unsupported, and a signature is a representative sampling device, not a guarantee for every file.
The original LibVLC report includes an older 63-source inventory; use the current 45-source
coverage in [closeout evidence](closeout-evidence.json), not those historical counts.

Evidence caveat: the historical preparation record's initial one-frame reopen probe has
`identityPass=false` for media-005/018/019/020/023/026/035/036. It retained no frame event explaining
whether an ordinal differed or a hash field was absent. Later cache-reopen and three-point random
checks pass for all 16 targets, and the current full-movie control checks pass. These later results
support the selected warm-review path; they do not explain or relabel those initial flags. The
closeout snapshot preserves their IDs. Future production cold-open validation must check actual
boundary identities/pictures, not rely on the old aggregate preparation PASS label alone.

## Performance interpretation

Cold original indexing and proxy preparation are separate costs. Previously measured full-movie
proxy encoding plus proxy indexing took 2m01s, 8m36s, and 25m44s; those numbers exclude original
canonical indexing. Worst measured canonical indexing was about 21 minutes. These are accepted
preparation costs, not immediate-open promises. Reopening uses cached assets and the chosen
probabilistic sampled signature, avoiding the original exhaustive packet reread.

The initial 4K binary bridge was expensive. Native viewport fitting reduced measured bridge
overhead to roughly 29 ms p95. The mapped proxy then removed expensive source decode-forward from
normal review. These solve different bottlenecks; replacing Electron with a native window would
not itself eliminate long-GOP decoding cost.

Closeout found and fixed an application bug: a cached jump followed by a forced-linear forward
step could decode from a remote position. BestSource now chooses its normal adaptive path, which
still reuses a nearby decoder. The full fixed soak measured +1/-1 tap p95 below 27 ms and maximum
below 53 ms; random landing p95 was 91 ms. The earlier failing evidence is retained.

BestSource hardware indexing was rejected by the linked decoder configuration before indexing,
so it has no measured speedup here. `node-av` failed the tested integration/timestamp path; that is
not evidence that the library is intrinsically incapable. See the
[acceleration report](preparation-acceleration-results.md).

## Remaining product work

- Integration scope agreed 2026-08-31: use software preparation only. Exclude QSV code, selectors,
  accelerated packages and disabled feature flags from the first-stage control. Preserve Phase 3C
  as experimental evidence for separate qualification; see the
  [hardware decision](frame-scrub-supporting-player-control-integration-handoof.md#hardware-acceleration-bottom-line).
- Integrate the isolated control through the application's existing adapters and pipeline model.
- Implement actual exact-range extraction, including original-source audio, and sequential clip
  insertion/progress/error recovery. Locking a range currently stores boundaries only.
- Persist range sessions, cache policy, preparation cancellation/retry, and source-change handling
  as product behavior rather than spike-only controls.
- Package, license-review, update-test, and validate native runtimes per supported OS/architecture.
  No clean-machine installer or macOS/Linux run has been tested.
- Define visual policy for HDR, interlacing, rotation, and display-quality needs beyond the measured
  review profile. Proxy fidelity is not an original-quality export guarantee.

The [shared-pass preparation proposal](../../../docs/plans/shared-pass-review-preparation-exec-plan.md)
is deferred optimization: build the source index and proxy from one decode pass. It is not required
for this POC's accepted review experience. The cold original-to-proxy transition is also accepted
as non-blocking. Other optional work remains in [POC feature suggestions](poc-feature-suggestions.md).

## Reproduction and references

- [Architecture diagram](architecture-diagram.md) and [integration handoff](frame-scrub-supporting-player-control-integration-handoof.md):
  component/data flow and the next agent's starting point.
- [README](../README.md): setup, test sequence, interactive control, and cleanup.
- [Architecture options](playback-architecture-options.md): why C2 supersedes browser-only decode,
  and where native windows, shared memory, direct libav, and WASM would fit.
- [BestSource gate](bestsource-gate-results.md), [failure analysis](bestsource-failure-analysis.md),
  [prepared-review gate](bestsource-preparation-gate-results.md), and
  [cache signatures](cache-signature-results.md): canonical identity and preparation evidence.
- [M4b bridge](electron-bridge-m4b-results.md), [full-player proxy](all-intra-proxy-results.md),
  [proxy profile/audio](review-proxy-profile-results.md), and [stress results](bridge-results.md):
  measured Electron experience.

`npm run verify:reports` checks current local raw evidence, selected-source coverage, hashes/pins,
and final report links. `node ./scripts/verify-reports.mjs --archived` checks the retained summary only and deliberately reports
that weaker scope. Large raw logs/media/screenshots stay ignored; their digests are retained in
the closeout evidence snapshot. Re-running expensive historical gates is not required merely to
open the control.

The clean verification regenerated native executable outputs and every fixture on the current
developer machine. It reused pinned dependency downloads/toolchains and expensive source caches;
it was not a new-machine installation test. Logs are `artifacts/ms7-*.log`; fixture-tool versions
and hashes are in `artifacts/ms7-ffmpeg-path-evidence.json`. The
[cleanup](cleanup-results.md) removed rejected packages/intermediates while preserving the selected
runtime and regression harnesses. Production integration and actual clip generation are next,
under a separate spec/plan initiated by the user.
