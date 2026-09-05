# MS6: sustained Electron review

Status: **PASS**, fixed-build ten-minute verification completed 2026-08-30.

## Goal and workload

A user can review a prepared full movie with normal playback, scrub/jump, one-frame and held
navigation, and range capture, then reopen the movie on the same canonical pictures without a
crash, stale overwrite, runaway queue or sustained memory growth.

The Windows x64 Electron 37.10.3 control uses the pinned LibVLC 4 and BestSource/FFmpeg 9 stack
in [dependency-manifest.json](../dependency-manifest.json). The source is `media-035`,
`Point.Break.1991.2160p.UHD.BluRay.DTS-HD.MA.5.1.DoVi.HDR.x265-PTer.mkv`, 175,400 canonical
frames. Review uses its cached 960-pixel GOP1 MPEG-4 Part 2/AAC stereo proxy. This is a **warm
prepared-review soak**, not a cold proxy preparation or full-corpus playback benchmark.

Host: Windows 11 Pro `10.0.26100`, Intel Core i7-10700K, about 64 GiB RAM, Intel UHD 630
(driver `31.0.101.2141`). Dependency commits are linked above. No other benchmark or native build
ran concurrently with the soak.

The runner drives the actual Electron page and native services:

- Before and after reopen: five positions (5/25/50/75/95%) and two three-step ranges (15/65%).
  Canonical identities and SHA-256 of the displayed canvas pixels must match.
- Repeated mixed cycles: random landing, +1/-1 taps, held steps in both directions, eighteen rapid
  timeline inputs, final release into playback, 0.5/1/2x speed, and Space pause into exact review.
- Renderer label updates must remain adjacent during held stepping. A final scrub must not be
  overwritten by an old picture. The playback listener must receive new pictures during play.
- Main/native queues are sampled every 100 ms; Windows process memory and cumulative CPU are
  sampled roughly every two seconds. All logs remain under ignored `artifacts/`.

There is no new human listening measurement in this run. The user's earlier accepted audio and
enlarged-image review is retained as perception evidence. GPU utilization is **not measured**;
this run uses the accepted CPU RGBA callback/Canvas path, not a new GPU-texture recommendation.

## Regression found and corrected

The initial 15-second pilot reproduced forward steps taking up to **8,752 ms** despite fast random
proxy access. The following longer attempt failed its held-step progress assertion. The bug was
in our `PreparedVideoSession`, not proof of a BestSource decoder defect: a delivered-cache jump
changed the displayed frame without necessarily moving a native decoder. Forcing the next call
into linear-only decoding could then walk from a remote cursor or the beginning.

The fix uses BestSource's normal frame request. Upstream already chooses linear continuation when
a suitable nearby decoder exists; it can seek when the displayed cached picture is far from
every decoder. Our bounded delivered-frame cache remains in place. A tap still means exactly one
ordinal, and held stepping still uses the paced adjacent scheduler.

The fixed short replay reduced maximum forward-step latency to **33.5 ms** across five cycles.
The regression gate now rejects any prepared-proxy forward/reverse tap above 500 ms. This is a
loose stall-detection limit, not a promise that all hardware meets a new 500 ms product SLA.
The before/fixed pilot JSON and log artifacts are retained alongside the full-run evidence.

## Full-run results

The fixed run completed **600.195 seconds**, **199 mixed cycles**, **796 adjacent held-step
frames**, and **6,850 playback callback frames**. All five point identities/pixel hashes and both
range boundaries were identical after reopening. No player error, stale overwrite, adjacency
failure, native crash or queue overflow was observed.

| Operation | Samples | p50 ms | p95 ms | Maximum ms |
| --- | ---: | ---: | ---: | ---: |
| Initial five exact positions | 5 | 79.1 | 208.9 | 208.9 |
| Mixed-cycle random landing | 199 | 82.1 | 91.3 | 108.5 |
| Forward one-frame tap | 199 | 25.8 | 26.8 | 51.6 |
| Reverse one-frame tap | 199 | 25.8 | 26.9 | 52.6 |
| Held-step observation window | 199 | 916.8 | 928.6 | 931.6 |
| Eighteen-input scrub burst plus settlement | 199 | 502.0 | 518.8 | 566.5 |
| Release into playback | 199 | 26.2 | 30.8 | 543.5 |
| Space pause into exact review | 199 | 26.1 | 52.3 | 60.7 |

There were 266 resource samples during the mixed workload. Progressive request depth peaked at
**2** (one running and one newest pending); exact client requests peaked at **1**.

| Process | Peak working set MiB | Peak private MiB | Post-warm-up private delta MiB | Final-third delta MiB | CPU seconds |
| --- | ---: | ---: | ---: | ---: | ---: |
| BestSource helper | 706.4 | 706.8 | +16.0 | +0.46 | 149.7 |
| LibVLC helper | 100.3 | 84.1 | +3.8 | -0.52 | 51.3 |
| Electron main, PID 16188 | 174.6 | 144.2 | -2.92 | +17.72 | 69.8 |
| Electron child, PID 39184 | 127.4 | 80.9 | +7.45 | +4.10 | 49.5 |
| Electron child, PID 43336 | 47.6 | 13.3 | -0.14 | -0.08 | 0.02 |
| Electron child, PID 5796 | 180.1 | 121.2 | -17.05 | -18.73 | 101.4 |

All Electron processes, including the renderer, stayed below 181 MiB working set individually.
Child roles were not recorded, so this table does not assign an unverified renderer/GPU role to a
PID. CPU seconds are cumulative per-process work over the sampled interval, not peak CPU percent.
An incidental one-sample `pwsh.exe` entry is retained in raw process-tree evidence but excluded
from this application table. No sustained-growth heuristic fired; BestSource settled near its
two cache budgets plus decoder/index overhead, with only 0.46 MiB growth in the final third.

## Measurement limits

Operation timings include renderer polling (25 ms), IPC, decoding, and drawing. A scrub-burst
time includes all eighteen input events plus settlement; it is not a single-frame seek latency.
A held-step operation includes 650 ms of hold and 250 ms of release/settle observation; it is not
per-frame latency. Native stage-level decode/convert/transport measurements remain in the
[M4b report](electron-bridge-m4b-results.md) and [proxy report](all-intra-proxy-results.md).

Memory checks discard up to the first 30 samples (roughly one minute) and flag growth only when
private memory grows more than 128 MiB overall and more than 32 MiB in the final third. Inspecting
the recorded series is still required: a ten-minute bounded run cannot prove absence of every leak.
BestSource's decoded-frame cache and our delivered-frame cache each have a 256 MiB budget; these
are expected memory use, not a zero-growth requirement during initial filling.

Cold canonical indexing, proxy preparation and cache signature costs were measured separately;
see [final results](spike-results.md). No new cold full-movie encode was run during this soak.
Cross-platform and shipping costs are covered in [packaging](cross-platform-packaging.md).

## Reproduce

Build both helpers and the bridge, then run from the spike root in PowerShell:

```powershell
./scripts/run-soak.ps1 -Target media-035 -Seconds 600
npm run verify:reports
```

The JSON runner summary reports pass/fail, exact/reopen checks, operation percentiles, queue peaks,
and per-process resource measurements. `artifacts/control-soak-media-035.png` is the final rendered
page. [Closeout evidence](closeout-evidence.json) retains the compact results and raw-artifact
digests. Use the [README](../README.md) for fresh build and fixture prerequisites.
