# Prepared-review C2 architecture

Verified against the isolated Windows x64 POC on 2026-08-30. This describes the selected
implementation, not an integrated product. Read [integration handoff](frame-scrub-supporting-player-control-integration-handoof.md)
for code ownership and [spike results](spike-results.md) for measured coverage and limitations.

Solid arrows show existing control/data flow. Dashed arrows show future extraction only.
Each node includes its role. The cache is a collection of generated assets, not another decoder.

```mermaid
flowchart TB
  subgraph presentation["Presentation layer: sandboxed Electron renderer"]
    control["Player control and keyboard<br/>Open, play, step, scrub, and mark with q/w/a"]
    canvas["Canvas 2D viewport<br/>Draw RGBA pictures and acknowledge playback delivery"]
    ranges["RangeCaptureModel<br/>Validate and lock canonical start/end identities"]
  end

  subgraph bridge["Trusted application layer: Electron boundary and orchestration"]
    preload["Restricted preload API<br/>Pass commands, frames, status, and preparation progress"]
    main["Electron main process<br/>Own source generation, readiness, and service lifetime"]
    hybrid["Hybrid playback adapter<br/>Switch playback/exact modes and map resume time"]
    transport["NativeProcessClient and binary protocol<br/>Supervise helpers; carry JSON metadata and RGBA bytes"]
  end

  subgraph preparation["Preparation layer: work on a cache miss"]
    prepare["Preparation controller<br/>Prepare canonical index, then validated review proxy"]
    inspect["Packet scan and sampled signature<br/>Choose normalization policy and validate cache identity"]
    normalize["FFmpeg timestamp normalization<br/>Stream-copy only when required; preserve frame content"]
    canonicalInput["Canonical media input<br/>Original movie, or its timestamp-normalized review copy"]
    canonicalBS["Canonical BestSource indexing<br/>Record presentation ordinals, timing, and frame hashes"]
    profile["Selected GOP1 proxy profile<br/>960px maximum width; source-relative time and AAC audio"]
    encode["FFmpeg proxy encoder<br/>Software, or eligible QSV decode/scale with fallback"]
    proxyBS["Proxy BestSource indexing<br/>Index encoded review pictures for fast exact access"]
    validate["Ordinal-map validation<br/>Require equal canonical, encoded, and indexed frame counts"]
  end

  subgraph storage["Media and generated cache layer"]
    original["Original movie<br/>Unmodified input retained for future full-quality extraction"]
    subgraph cache["Prepared review cache: manifests, media, and two distinct indexes"]
      manifest["Versioned cache manifests<br/>Record source signature, dependency pins, recipe, and paths"]
      canonicalIndex["Canonical BestSource index<br/>Authority for frame ordinal and canonical identity metadata"]
      proxy["Review proxy movie<br/>Same ordinal sequence; reduced pictures and preview audio"]
      proxyIndex["Proxy BestSource index<br/>Resolve proxy time and decode proxy ordinal N"]
      frameMap["Ordinal mapping manifest<br/>Declare proxy N equals canonical N; retain validation counts"]
    end
  end

  subgraph native["Native execution layer: separate helper processes"]
    vlc["LibVLC playback helper and plugins<br/>Play source before preparation, then proxy video and audio"]
    exact["BestSource exact helper<br/>Decode proxy N; attach identity from canonical index N"]
    audio["Native audio output<br/>Clocked playback audio; exact stepping is silent"]
  end

  subgraph future["Future product work: outside this POC"]
    extraction["Trusted exact-range extraction<br/>Resolve canonical ordinals against the original source"]
    pipeline["Pipeline workflow<br/>Create original-quality clips and insert them with progress"]
  end

  control <--> preload
  control --> ranges
  preload --> canvas
  canvas -->|playback acknowledgement| preload
  preload <--> main
  main <--> hybrid
  hybrid <--> transport
  transport <--> vlc
  transport <--> exact
  vlc --> audio

  main --> prepare
  original --> inspect
  prepare --> inspect
  inspect -->|signature and policy| prepare
  manifest -->|compatible cache hit| prepare
  prepare -->|normalization required| normalize
  original --> normalize
  original -->|healthy source| canonicalInput
  normalize --> canonicalInput
  prepare -->|index on cache miss| canonicalBS
  canonicalInput --> canonicalBS
  canonicalBS --> canonicalIndex
  prepare -->|canonical ready| encode
  canonicalInput --> encode
  profile --> encode
  encode --> proxy
  proxy --> proxyBS
  proxyBS --> proxyIndex
  encode -->|encoded count| validate
  canonicalIndex --> validate
  proxyIndex --> validate
  validate --> frameMap
  frameMap --> manifest
  inspect -->|source signature| manifest
  validate -->|publish ready assets| prepare
  prepare -->|prepared paths and progress| main

  original -->|provisional playback| vlc
  proxy -->|prepared playback| vlc
  proxy -->|review pixels| exact
  proxyIndex -->|proxy clock and ordinal| exact
  canonicalInput -->|open identity source| exact
  canonicalIndex -->|canonical metadata at ordinal N| exact
  frameMap -->|validated activation through main| hybrid

  original -.-> extraction
  ranges -.->|canonical boundaries and source association| extraction
  canonicalIndex -.->|ordinal identity contract| extraction
  extraction -.-> pipeline
```

## How to read the two clocks

1. Preparation builds the canonical index over the original or normalized input. A normalized
   input preserves frame content/ordinals, but its canonical PTS/timebase can differ from the
   original container's timestamps.
2. The selected proxy preserves source-relative presentation timing on a 60,000-tick clock,
   advancing duplicate/backward timestamps as needed. It is not the earlier constant ordinal-clock
   experiment. The proxy and canonical indexes remain distinct even when their times agree.
3. During prepared playback, LibVLC reports proxy time. The exact helper finds the proxy ordinal,
   decodes that picture, and attaches canonical index metadata for the same ordinal. Returning to
   playback seeks using `DisplayFrame.reviewTimeUs`, not canonical `identity.pts`.
4. Before preparation completes, the original movie can play, but exact controls and range capture
   stay disabled. A completed preparation switches playback to the mapped proxy.

The runtime's mapping validation checks complete frame counts, not pixel equality at every
ordinal. Synthetic fixture picture oracles and sampled real-media/timing checks provide the
additional measured evidence. Lossy proxy pixels are never original-quality export pixels.
The future extraction arrows require new implementation and tests; no clip files are created today.

## Code anchors

- Renderer: `src/ui/control-app.ts`, `src/ui/keyboard-controller.ts`,
  `src/model/range-capture-model.ts`, and `electron/control.html`.
- Boundary/orchestration: `electron/control-preload.cjs`, `electron/main.cjs`,
  `src/adapter/hybrid-frame-playback-adapter.ts`, `src/adapter/native-process-client.ts`,
  and `src/adapter/binary-frame-protocol.ts`.
- Preparation: `src/preparation/interactive-preparation.mjs`,
  `src/preparation/preparation-coordinator.mjs`, `src/preparation/all-intra-proxy-preparation.mjs`,
  `src/preparation/review-proxy-encoder.mjs`, and `src/preparation/proxy-acceleration-policy.mjs`.
- Native: `native/bestsource-gate/`, `native/media-service/bestsource_media_service.cpp`,
  `native/media-service/libvlc_media_service.cpp`, and `native/common/protocol.cpp`.
