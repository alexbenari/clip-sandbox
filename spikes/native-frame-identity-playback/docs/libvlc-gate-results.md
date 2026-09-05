# LibVLC 4 Determinism Gate Results

Generated 2026-08-12T10:56:06.090Z with LibVLC `4.0.0-dev-baad2c52` / `baad2c523c1934470bb351105efc352e0678dd55`.

## Decision

**Path C1: FAIL**

- Relative fixture stepping: **6/6 pass**
- Repeat exact seek: **2/6 pass**
- Complete fixture operation scripts: **2/6 pass**
- Canonical absolute frame identity: **fail**
- Representative first-frame coverage: **63/63**
- Malformed source reported explicitly: **pass**
- D3D11 callback registration: **pass**
- D3D11 render target exercised: **no**; C1 already fails the identity gate, so a full GPU renderer is deferred.

LibVLC's public watch-time point carries `position`, `rate`, microsecond `ts_us`, length, and
system date. It does not carry a presentation-order frame index, source PTS ticks, source timebase,
or frame duration, and the time callback is not atomic with the decoded-memory display callback.
Operation tracking can count adjacent steps from a known anchor, but a random seek does not provide
that anchor. Converting the microsecond clock back through nominal FPS would violate the signed
absolute-identity requirement.

The gate therefore selects **Path C2 provisionally**. BestSource must pass its own exact-frame gate
before any Electron bridge work begins.

Paused seeks are materialized by a documented `next_frame()` request after LibVLC reports seek
completion. The report therefore tests the product-relevant seek-plus-step sequence rather than
assuming that the seek-completion callback itself means a new picture was displayed.

## Deterministic Fixtures

| Fixture | Relative stepping | Repeat exact seek | Full operation script | Canonical identity | warm adjacent p95 ms | Notes |
| --- | --- | --- | --- | --- | ---: | --- |
| cfr-ffv1 | pass | true | pass | no | 16.82 | none |
| bframes-long-gop | pass | false | fail | no | 4.15 | seek 0 expected 36/35, observed 34; seek 1 expected 36/35, observed 34; random seek expected 29/28, observed 26; final next expected 71, observed 70 |
| nonzero-start | pass | false | fail | no | 32.31 | seek 0 expected 36/35, observed 7 |
| rotated | pass | false | fail | no | 6.45 | seek 0 expected 36/35, observed 34; seek 1 expected 36/35, observed 34; random seek expected 29/28, observed 26; start seek expected one of 0/1, observed 27; near-end seek expected one of 68/69/70/71, observed 27; final next expected 71, observed 67 |
| interlaced | pass | false | fail | no | 11.65 | seek 0 expected 29/28, observed 7; seek 1 expected 29/28, observed 36; random seek expected 23/22, observed 24; near-end seek expected one of 68/69/70/71, observed 60; final next expected 71, observed 61 |
| vfr-ffv1 | pass | true | pass | no | 18.96 | none |
| malformed-truncated | n/a | n/a | pass | n/a | n/a | Malformed input failed explicitly as expected. |

The fixture code and FFmpeg-derived presentation sequence are test oracles only; they are not a
runtime identity mechanism. The VFR fixture deliberately contains duplicate visual content, which
also prevents content hashing from serving as identity.

## Media Coverage

- Signatures tested: **63**
- First-frame successes: **63**
- Failures: **0**
- First-frame p50/p95: **46.44 / 129.52 ms**

No representative failed first-frame decode.

The inventory's 72 FFprobe failures remain diagnostics in `media-inventory.json`; they are not
counted as valid required representatives.
One audio-only source with attached cover art was excluded from the video matrix.

## Callback Evidence

CPU-memory output decoded all fixture observations used above. D3D11 callback registration and
detachment both returned true. A real D3D11 device/render-target callback loop was intentionally not
built after the mandatory identity criterion had already failed; this is rendering feasibility debt,
not a route by which C1 could regain canonical frame identity.

Raw per-operation observations, callback timing, stderr, and per-signature results are in the
ignored local artifact `artifacts/libvlc-gate-raw.json`.
