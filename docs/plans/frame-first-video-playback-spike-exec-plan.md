# Build and Evaluate a Frame-First Video Playback Spike

## Why this matters

The planned movie-to-pipeline workflow needs a review surface where a user can play a full movie, seek and scrub by frame, and capture frame ranges with keyboard shortcuts. Plain HTML `<video>` can mark timestamps but does not expose exact next-frame, previous-frame, or seek-to-frame APIs. Future analysis workflows may return objects or labels per frame, so the app needs to know whether a frame-first playback control is a practical foundation before committing the production architecture.

This plan implements the approved spike spec in `docs/specs/frame-first-video-playback-spike-spec.md`. The deliverable is not the production movie pipeline. It is an isolated spike folder containing two isolated frame-first playback controls, a small Electron comparison host that owns one shared movie source, a shared range-capture panel, measurement notes, and a Markdown architecture-options reference.

## Progress

- [x] (2026-07-04 17:53+03:00) Approved spec recorded in `docs/specs/frame-first-video-playback-spike-spec.md`.
- [x] (2026-07-04 17:53+03:00) Execution-plan direction fixed: isolated spike folder, two frame-first candidate controls, shared Electron comparison host with one shared movie source, shared range panel, and architecture-options document.
- [x] (2026-07-05 12:52+03:00) Created isolated spike package, nested Electron host, and spike-local source-fetch tooling under `spikes/frame-first-video-playback/`.
- [x] (2026-07-05 12:59+03:00) Implemented Candidate A as a `webcodecs-examples` wrapper with shared frame-index adaptation for step and scrub.
- [x] (2026-07-05 13:00+03:00) Implemented Candidate B as a custom Mediabunny / `CanvasSink` frame-first control with app-owned play clock.
- [x] (2026-07-05 13:05+03:00) Wired shared host behavior: one shared movie source, active-candidate switching, handoff seek, and shared `q/w/a` capture.
- [x] (2026-07-05 13:05+03:00) Collected Electron smoke-test findings and wrote architecture/results docs.
- [x] (2026-07-05 13:05+03:00) Ran targeted validation through Electron automation and unit tests.

## Skill Gates

Planning-time gates:

- `working-with-users-and-team`: used to translate the user's feature intent into spike acceptance behavior, distinguish prototype deliverables from the production movie-to-pipeline feature, and keep the side-by-side comparison focused on user-visible review feel.
- `build-deploy-and-tooling`: applies because the spike evaluates new dependencies and creates an isolated runnable package/host.
- `api-and-interface-design`: applies because each candidate control needs a small embedding contract and the shared host must not depend on candidate internals.
- `domain-modeling`: applies because the plan names new concepts such as `FramePosition`, `CapturedFrameRange`, active candidate, and frame index.
- `testing-discipline`: applies because the spike needs both automated smoke checks and manual Electron QA for media playback behavior.
- Repository guidance in `coding-quality.md`: applies to boundary placement, state ownership, and avoiding production coupling.
- `PLANS.md`: used as the source of truth for this execution plan format.

Execution-time gates:

- `build-deploy-and-tooling`: use before adding or changing the nested spike `package.json`, lockfile, scripts, Electron config, or dependencies.
- `api-and-interface-design`: use before finalizing the candidate-control interface and host-to-control event contract.
- `domain-modeling`: use before implementing frame/range types and the shared range-capture model.
- `testing-discipline`: use before adding smoke tests, sample fixtures, or Playwright/Electron checks.
- `error-and-correctness-traps`: use when adding async decode cancellation, stale-result suppression, frame-cache eviction, or error handling around media parse/decode failures.
- `security-and-trust-boundaries`: use if the spike exposes filesystem access beyond a browser file picker or adds Electron IPC. Prefer avoiding IPC in the spike by using file inputs.
- `pre-commit-self-review`: use before reporting the plan execution complete.

Unavailable skills or fallbacks:

- None known. If a listed skill is unavailable during execution, use the corresponding repository guidance in `coding-quality.md`, `AGENTS.md`, and `PLANS.md`, and record the fallback in this section.

## Surprises & Discoveries

- Discovery: WebCodecs is a low-level browser API for encoded/decoded audio and video frames, not a container reader.
  Evidence: MDN describes `VideoDecoder`, `VideoFrame`, `EncodedVideoChunk`, `AudioDecoder`, and related primitives, while container demuxing remains a separate concern: https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API.

- Discovery: W3C WebCodecs samples include both a simple video decode/display sample and an audio/video player sample, but they are samples rather than a production control.
  Evidence: W3C sample index lists "Video Decoding and Display" and "Audio And Video Player": https://w3c.github.io/webcodecs/samples/.

- Discovery: `webcodecs-examples` is a promising existing-player candidate because it advertises a `WebCodecsPlayer` with play/pause/seek, Web Audio sync, worker-based video decoding, WebGPU rendering, and MP4Box demuxing.
  Evidence: project README/search result: https://github.com/sb2702/webcodecs-examples.

- Discovery: Mediabunny is a strong toolkit candidate because it is a zero-dependency TypeScript media toolkit for browser-side reading, writing, converting, metadata, and raw/decoded media access.
  Evidence: Mediabunny introduction and docs: https://mediabunny.dev/guide/introduction.

- Discovery: Remotion Media Parser/WebCodecs should be evaluated in the architecture document but should not be the primary implementation path for new work unless the spike proves otherwise, because Remotion's own docs now recommend migrating new work toward Mediabunny and describe Media Parser as deprecated.
  Evidence: Remotion Mediabunny docs: https://www.remotion.dev/docs/mediabunny/.

- Discovery: Vite's default absolute asset paths produce a blank Electron `file://` window when the host loads the static build directly from disk.
  Evidence: Electron automation showed a blank page whose HTML referenced `/assets/...`; adding `base: './'` in `vite.config.ts` fixed startup immediately.

- Discovery: `webcodecs-examples` gives us play/pause/seek and preview audio quickly, but its public API does not expose playback-rate control.
  Evidence: source inspection of `src/player/player.ts` plus runtime behavior in the spike wrapper.

## Decision Log

- Decision: keep the spike in `spikes/frame-first-video-playback/` as an isolated nested project.
  Rationale: the user explicitly wants a standalone control isolated from production repo dependencies, plus an Electron proof host. A nested project keeps candidate dependencies and prototype code out of `src/`, `electron/`, and the production app build.
  Date/Author: 2026-07-04 / Codex

- Decision: compare two frame-first candidates, not a plain HTML `<video>` baseline.
  Rationale: the user has accepted that timestamp-based `<video>` does not provide the exact frame-first behavior the spike needs to evaluate.
  Date/Author: 2026-07-04 / Codex

- Decision: initial Candidate A is an existing frame-first/WebCodecs player wrapper, starting with `webcodecs-examples` if it can be installed and run in Electron.
  Rationale: this tests whether an existing player-like implementation can satisfy playback, seek, and audio-preview needs quickly.
  Date/Author: 2026-07-04 / Codex

- Decision: initial Candidate B is a custom Mediabunny/WebCodecs/Canvas control.
  Rationale: this tests whether a toolkit-first implementation gives enough control over frame indexing, frame stepping, scrubbing, and cache behavior without adopting a full third-party player.
  Date/Author: 2026-07-04 / Codex

- Decision: the shared range-capture panel belongs to the Electron comparison host, not to each candidate control.
  Rationale: the candidates are playback controls. Range capture is product workflow behavior and should read from whichever candidate is currently active.
  Date/Author: 2026-07-04 / Codex

- Decision: audible preview is preferred but not required if it requires building full frame-first audio scheduling.
  Rationale: future extracted clips must preserve audio through ffmpeg, but the spike's core risk is frame-first navigation. Audio preview should be measured as a candidate capability, not allowed to derail the frame-control comparison.
  Date/Author: 2026-07-04 / Codex

- Decision: use one shared host-owned frame index for both candidates.
  Rationale: the candidates must compare different playback/rendering stacks against the same frame map and the same source file, while avoiding duplicated ownership of frame identity semantics.
  Date/Author: 2026-07-05 / Codex

- Decision: recommend Candidate B as the production starting point, while preserving Candidate A as the preview-audio and assembled-stack benchmark.
  Rationale: Candidate B already demonstrates the desired ownership model and playback-rate control inside Electron; Candidate A is useful but more opaque and misses a key control requirement.
  Date/Author: 2026-07-05 / Codex

## Outcomes & Retrospective

Implemented result:

1. Both candidates load and render a real local MP4 inside Electron.
2. Candidate A plays, steps, scrubs, and provides preview audio; Candidate B plays, steps, scrubs, and provides playback-rate control.
3. Shared `q/w/a` capture follows the active candidate and stores frame plus timestamp values.
4. Measured smoke-test timings on `sandbox/hand-closes-curtain.mp4` were roughly:
   - Candidate A ready/first frame: 304 ms
   - Candidate B ready/first frame: 308 ms
   - Candidate A step `+1`: 194 ms
   - Candidate B step `+1`: 31 ms
   - Candidate B mid-scrub jump: 524 ms
5. Candidate A audio preview works because the package already owns the audio path. Candidate B currently has no audible preview.
6. Recommendation: continue from Candidate B for production follow-up.
7. Follow-up risk remains around long-movie memory behavior and adding preview audio without bloating the custom path.

## Context and orientation

Clip Sandbox is currently a framework-free Electron/TypeScript app. The production app lives under `src/`, with Electron shell code under `electron/`. The approved spike must not import from production app modules such as `src/app/`, `src/domain/`, `src/ui/`, or production adapters. The spike should live in its own folder and prove Electron compatibility through a small comparison host.

Important existing files:

- `docs/specs/frame-first-video-playback-spike-spec.md`: approved product and architecture spec for this spike.
- `package.json`: production app scripts and dependencies. Avoid adding spike dependencies here unless the user approves a production dependency change.
- `electron/main.cjs`: production Electron main process. Do not modify for this spike unless choosing the dev-only existing-app page route, which is not the preferred path.
- `src/`: production app source. The spike must not import from these modules.
- `PLANS.md`: execution-plan requirements.

Definitions for this plan:

- Frame-first playback control: a control whose public navigation model is frames, such as seek-to-frame and next/previous frame. Internally it still uses presentation timestamps for playback timing.
- Candidate control: one isolated implementation option in the side-by-side comparison.
- Active candidate: the candidate currently selected by the user as the source for playback work, shared keyboard shortcuts, and range capture.
- Shared movie source: the single `File`, file handle, object URL, or equivalent source reference owned by the host. The source is made available to candidates without duplicating the movie file. Candidates must not assume they own the source permanently.
- Frame index: a lookup of frame number to presentation timestamp, duration, and keyframe/sample metadata when available.
- Scrubbing: dragging a timeline to navigate to a target frame.
- Stale decode result: a decoded frame that arrives after the user has already requested a newer target frame. The host/control must not display stale results as current.

The user-visible goal for verification is: a user can choose one shared movie source inside Electron, switch between two isolated frame-first controls that operate on that source one at a time, compare playback/stepping/scrubbing, select the active candidate, and capture frame ranges from the active candidate with `q`, `w`, and `a`.

## Proposed spike folder

Create the isolated project under:

- `spikes/frame-first-video-playback/`

Proposed structure:

- `spikes/frame-first-video-playback/package.json`: nested scripts and dependencies for the spike only.
- `spikes/frame-first-video-playback/package-lock.json`: nested lockfile after dependency install.
- `spikes/frame-first-video-playback/README.md`: how to run the spike, what it proves, and known limits.
- `spikes/frame-first-video-playback/electron/main.cjs`: small Electron host main process.
- `spikes/frame-first-video-playback/electron/preload.cjs`: only if needed; prefer no privileged APIs.
- `spikes/frame-first-video-playback/index.html`: comparison host page.
- `spikes/frame-first-video-playback/src/host/`: shared comparison host, shared movie source ownership, active-candidate selection, shared range capture.
- `spikes/frame-first-video-playback/src/contracts/`: candidate-control TypeScript interfaces and shared value types.
- `spikes/frame-first-video-playback/src/candidates/webcodecs-examples/`: Candidate A wrapper.
- `spikes/frame-first-video-playback/src/candidates/mediabunny/`: Candidate B implementation.
- `spikes/frame-first-video-playback/src/styles/`: host and shared control CSS.
- `spikes/frame-first-video-playback/docs/playback-architecture-options.md`: required architecture-options reference.
- `spikes/frame-first-video-playback/docs/spike-results.md`: measurements and recommendation.
- `spikes/frame-first-video-playback/tests/`: smoke tests when feasible.
- `spikes/frame-first-video-playback/candidate-sources.json`: pinned source-browsing manifest for external candidate repos.
- `spikes/frame-first-video-playback/scripts/fetch-candidate-sources.mjs`: helper that clones candidate source repos into the local source mirror.
- `spikes/frame-first-video-playback/candidates-source-code/`: local read-only source mirrors for browsing candidate code. This folder should be ignored by git unless the user explicitly decides to vendor or fork a candidate.

Do not import production `src/**` files into this folder.

## Candidate selection policy

Start with these two candidates:

1. Candidate A: existing-player wrapper around `webcodecs-examples` or the smallest viable code extracted/adapted from it.
2. Candidate B: custom Mediabunny/WebCodecs frame-first control rendered with Canvas 2D or `bitmaprenderer`.

These candidates are not meant to compare WebCodecs against a non-WebCodecs architecture. Both candidates are in the same broad frame-first browser architecture family:

- local media file,
- demux encoded samples from the container,
- decode video frames with WebCodecs,
- render decoded frames,
- expose frame-oriented navigation to the user.

The comparison is about the ownership boundary:

- Candidate A tests the "adopt or fork an assembled player stack" path. The candidate may already own demuxing, decoding, playback scheduling, rendering, audio preview, worker orchestration, and some seek behavior. The spike asks whether that larger existing player can be wrapped cleanly, behaves well in Electron, and exposes enough frame-level state for Clip Sandbox.
- Candidate B tests the "compose a purpose-built control from toolkit primitives" path. Mediabunny supplies media parsing/demuxing and WebCodecs supplies decoding, while Clip Sandbox-owned spike code owns frame indexing, stale-result cancellation, cache policy, rendering choice, playback scheduling, and product controls.

The important component differences to observe are:

1. demuxer/container layer, such as MP4Box.js in an existing player versus Mediabunny in the custom control,
2. renderer layer, such as WebGPU/WebGL/Canvas depending on the candidate,
3. playback clock and scheduling ownership,
4. frame-index and frame-cache ownership,
5. whether audio preview is already solved or would become our responsibility,
6. how much candidate internals leak through the wrapper.

If Candidate A cannot be installed, bundled, or run inside Electron after a focused attempt, replace it with another existing frame-first candidate such as `webcodecs-scroll-sync` or the W3C audio/video sample adapted into an isolated wrapper. Record the replacement in `Decision Log`.

If Candidate B cannot achieve frame stepping/scrubbing with Mediabunny in the time box, keep it as a documented failed candidate only if Candidate A works. Otherwise replace Candidate B with the most direct WebCodecs sample-based control that can prove frame stepping. Record the replacement in `Decision Log`.

Remotion Media Parser/WebCodecs must be covered in `docs/playback-architecture-options.md`. It does not need to be one of the two implemented candidates unless Candidate A or B fails and Remotion is the best replacement.

## Candidate source browsing policy

The user wants to browse the source code of candidate components when it is available. Support this with a local source mirror under:

- `spikes/frame-first-video-playback/candidates-source-code/`

Do not commit whole external repositories into the Clip Sandbox repo by default. Instead:

1. Commit a small manifest at `spikes/frame-first-video-playback/candidate-sources.json`.
2. For each source candidate, record:
   - name,
   - repository URL,
   - pinned commit or tag,
   - license when known,
   - local target folder,
   - why the source is relevant to the spike.
3. Commit a helper script at `spikes/frame-first-video-playback/scripts/fetch-candidate-sources.mjs` that clones or updates those repos into `candidates-source-code/`.
4. Add a spike-local `.gitignore` entry so `candidates-source-code/` does not become part of the repo accidentally.
5. Treat mirrored source as read-only reference material. Candidate wrappers may copy or adapt small pieces only with license review and a note in `docs/spike-results.md`.

This approach keeps source browsing easy on the local machine while avoiding vendoring large external histories or introducing submodule friction. If a candidate is selected for production and we decide to fork or vendor it, make that a separate explicit decision after the spike.

## Milestone 1 - Create the isolated spike package and Electron comparison shell

### Scope

Create a nested project that runs independently from the production app, opens an Electron window, and displays two empty candidate panels plus a shared range panel. This milestone proves the spike packaging and isolation before media complexity is introduced.

### Changes

- File: `spikes/frame-first-video-playback/package.json`
  Edit: create a nested package with scripts such as `start`, `typecheck`, and `test` if tests are added. Dependencies should be local to this nested project. Start with only the minimum host dependencies, then add candidate dependencies in later milestones.

- File: `spikes/frame-first-video-playback/tsconfig.json`
  Edit: create TypeScript config for the spike source only.

- File: `spikes/frame-first-video-playback/electron/main.cjs`
  Edit: create a minimal Electron main process that loads the spike `index.html` or a local dev-server URL. Do not import production `electron/main.cjs`.

- File: `spikes/frame-first-video-playback/index.html`
  Edit: create the comparison page shell with:
  - one file picker for the shared movie source,
  - two candidate panel containers,
  - an active-candidate selector,
  - one shared range-capture panel,
  - one keyboard legend.

- File: `spikes/frame-first-video-playback/src/contracts/frame-playback-control.ts`
  Edit: define the candidate-control embedding contract. It should expose methods/events for load, play, pause, stop, set rate, seek/step frame, scrub, current frame position, and dispose.

- File: `spikes/frame-first-video-playback/src/host/comparison-host.ts`
  Edit: wire empty candidate placeholders to the shared host model. Implement active-candidate selection and keyboard gating so `q`, `w`, and `a` target the active candidate position.

- File: `spikes/frame-first-video-playback/src/host/range-capture-model.ts`
  Edit: implement pure range capture rules: mark start, mark end, lock valid range, reject invalid range with error state, and store captured frame/time values.

- File: `spikes/frame-first-video-playback/README.md`
  Edit: document how to install and run the nested spike, and state that it is intentionally isolated from the production app.

- File: `spikes/frame-first-video-playback/.gitignore`
  Edit: ignore `node_modules/`, build outputs, and `candidates-source-code/`.

- File: `spikes/frame-first-video-playback/candidate-sources.json`
  Edit: create the source-browsing manifest with initial entries for the candidate repos selected at plan execution time. Include pinned commits/tags once discovered.

- File: `spikes/frame-first-video-playback/scripts/fetch-candidate-sources.mjs`
  Edit: add a helper that reads `candidate-sources.json` and clones/fetches each repo into `candidates-source-code/<candidate-name>/` for local browsing.

### Validation

- Command: `cd spikes/frame-first-video-playback; npm install`
  Expected: nested dependencies install and create/update only the nested `package-lock.json`.

- Command: `cd spikes/frame-first-video-playback; npm run fetch:candidate-sources`
  Expected: candidate source repos are cloned under `candidates-source-code/`, and those folders remain untracked by git.

- Command: `cd spikes/frame-first-video-playback; npm run start`
  Expected: Electron opens a single comparison page with two candidate panels, a file picker, active-candidate selector, shared range panel, and keyboard legend.

- Command: `cd spikes/frame-first-video-playback; npm run typecheck`
  Expected: TypeScript passes for the spike source.

### Rollback/Containment

If nested packaging fights the repo setup, keep all changes under `spikes/frame-first-video-playback/` and remove that folder to return to the pre-spike state. Do not modify production `package.json`, root `tsconfig`, or production Electron files as a workaround without user approval.

## Milestone 2 - Implement Candidate A as an existing frame-first player wrapper

### Scope

Wrap a player-like WebCodecs implementation as one isolated candidate control. The preferred starting point is `webcodecs-examples` because it advertises play/pause/seek, worker video decoding, Web Audio sync, WebGPU rendering, and MP4Box demuxing.

### Changes

- File: `spikes/frame-first-video-playback/package.json`
  Edit: add Candidate A dependencies after verifying package availability and license. Record package versions in `docs/spike-results.md`.

- File: `spikes/frame-first-video-playback/src/candidates/webcodecs-examples/webcodecs-examples-control.ts`
  Edit: implement the `FramePlaybackControl` contract by wrapping the existing player or adapted code. Candidate A must expose frame-addressable navigation through its wrapper. If the existing player only exposes time-based seek and cannot be adapted to seek and step by frame identity without invasive or brittle changes, mark Candidate A failed and replace it with another frame-first candidate.

- File: `spikes/frame-first-video-playback/src/candidates/webcodecs-examples/webcodecs-examples-panel.ts`
  Edit: render Candidate A panel-local controls and status:
  - viewport,
  - play/pause/stop,
  - speed selection,
  - step/jump buttons,
  - scrubber,
  - current frame/timestamp,
  - load/error status.

- File: `spikes/frame-first-video-playback/src/host/comparison-host.ts`
  Edit: mount Candidate A into the left or first candidate panel and wire its events into active-candidate state.

- File: `spikes/frame-first-video-playback/docs/spike-results.md`
  Edit: begin Candidate A notes: dependency version, setup friction, WebGPU/WebCodecs requirements, whether audio preview works, and known API mismatches.

- File: `spikes/frame-first-video-playback/candidate-sources.json`
  Edit: pin Candidate A's source repository URL and commit/tag for browsing.

### Validation

- Command: `cd spikes/frame-first-video-playback; npm run typecheck`
  Expected: Candidate A wrapper compiles.

- Command: `cd spikes/frame-first-video-playback; npm run start`
  Expected: Candidate A can load a real movie file in Electron, render first frame, and respond to at least play/pause plus one seek or step operation.

- Manual QA:
  Expected: record first-frame time, whether playback starts, whether audio preview exists, whether WebGPU/WebCodecs errors appear in devtools, and whether candidate controls remain isolated from the empty Candidate B panel.

- Source browsing check:
  Expected: Candidate A source is browsable under `spikes/frame-first-video-playback/candidates-source-code/` after running `npm run fetch:candidate-sources`.

### Rollback/Containment

If `webcodecs-examples` cannot be installed or run in Electron after a focused attempt, remove the dependency and wrapper, record the failure in `Surprises & Discoveries`, and replace Candidate A with `webcodecs-scroll-sync` or an adapted W3C sample. Keep the `FramePlaybackControl` contract stable so the host does not need to know the replacement internals.

The same replacement rule applies if Candidate A can play video but cannot provide real frame-based seek and stepping. A time-seek-only player is not a valid passing candidate for this spike.

## Milestone 3 - Implement Candidate B as a Mediabunny/WebCodecs frame control

### Scope

Build a custom frame-first candidate around Mediabunny and WebCodecs. This candidate tests the toolkit-first path: can the app own frame indexing, stepping, stale-result cancellation, cache behavior, and rendering without adopting a full third-party player?

### Changes

- File: `spikes/frame-first-video-playback/package.json`
  Edit: add Mediabunny as a nested spike dependency. Add only rendering/build helper dependencies that are required for the spike.

- File: `spikes/frame-first-video-playback/src/candidates/mediabunny/mediabunny-frame-index.ts`
  Edit: implement metadata/frame-index loading from the selected file. Prefer exact frame timestamp/index data when available. Record any fallback behavior.

- File: `spikes/frame-first-video-playback/src/candidates/mediabunny/mediabunny-decoder.ts`
  Edit: implement decode requests for target frame positions. Include a monotonically increasing request token or abort strategy so stale decode results cannot become current.

- File: `spikes/frame-first-video-playback/src/candidates/mediabunny/frame-cache.ts`
  Edit: implement a small frame cache around the current frame. Ensure old `VideoFrame` objects are closed/released when evicted.

- File: `spikes/frame-first-video-playback/src/candidates/mediabunny/canvas-frame-renderer.ts`
  Edit: render `VideoFrame` to Canvas 2D or `bitmaprenderer`. Start simple; do not add WebGL/WebGPU unless Canvas cannot prove the spike behavior.

- File: `spikes/frame-first-video-playback/src/candidates/mediabunny/mediabunny-control.ts`
  Edit: implement the `FramePlaybackControl` contract for load, play, pause, stop, speed, step, jump, scrub, current position, and dispose.

- File: `spikes/frame-first-video-playback/src/candidates/mediabunny/mediabunny-panel.ts`
  Edit: render Candidate B panel-local controls and status matching Candidate A's product behaviors.

- File: `spikes/frame-first-video-playback/src/host/comparison-host.ts`
  Edit: mount Candidate B into the second candidate panel and wire its events into active-candidate state.

- File: `spikes/frame-first-video-playback/docs/spike-results.md`
  Edit: begin Candidate B notes: frame-index time, first-frame time, seek strategy, cache behavior, stale-result handling, and audio-preview status.

- File: `spikes/frame-first-video-playback/candidate-sources.json`
  Edit: pin Mediabunny or any other Candidate B source repository URL and commit/tag for browsing when source is available.

### Validation

- Command: `cd spikes/frame-first-video-playback; npm run typecheck`
  Expected: Candidate B compiles.

- Command: `cd spikes/frame-first-video-playback; npm run start`
  Expected: Candidate B can load the same movie file in Electron, render first frame, step forward/backward by frame, perform frame jumps, scrub without stale visible frames, and play at `1x` well enough to evaluate.

- Manual QA:
  Expected: record first-frame time, frame-index readiness time, step latency, jump latency, scrub feel, memory growth observations, and any frame/timestamp drift.

- Source browsing check:
  Expected: Candidate B source is browsable under `spikes/frame-first-video-playback/candidates-source-code/` after running `npm run fetch:candidate-sources`, unless the candidate source is unavailable; if unavailable, record that in `docs/spike-results.md`.

### Rollback/Containment

If Mediabunny cannot produce enough frame-level data or decoded frames for the target movie, record the limitation and either adjust Candidate B to use a lower-level WebCodecs sample/demuxer or replace Candidate B with another frame-first implementation. Do not change the production app to accommodate the candidate.

## Milestone 4 - Build shared source ownership, active-candidate UX, and frame-range capture

### Scope

Turn the two isolated controls into a useful comparison surface: one movie source owned by the host, one active candidate selected by the user, shared keyboard shortcuts, and one shared range-capture panel reading from the active candidate. The active candidate should be the only candidate doing expensive decode/playback/scrub work at a given time.

### Changes

- File: `spikes/frame-first-video-playback/src/host/comparison-host.ts`
  Edit: implement shared movie source ownership. One selected file/source reference is held by the host and made available to candidates as they become active. Show per-candidate load/error state without duplicating the source file.

- File: `spikes/frame-first-video-playback/src/host/shared-movie-source.ts`
  Edit: add a small host-owned source model that stores the selected source reference and current desired frame/time position for candidate handoff.

- File: `spikes/frame-first-video-playback/src/host/active-candidate-control.ts`
  Edit: implement UI for selecting the active candidate. Use a clear segmented control, radio group, or panel header buttons. The active candidate must be visually obvious. On switch, pause/idle the previous candidate and initialize or resume the newly active candidate against the shared movie source.

- File: `spikes/frame-first-video-playback/src/host/range-capture-panel.ts`
  Edit: render shared current draft, locked ranges, and invalid-range errors. Include both frame and timestamp values.

- File: `spikes/frame-first-video-playback/src/host/keyboard-shortcuts.ts`
  Edit: implement shortcut routing with editable-control gating:
  - `q` marks start from the active candidate's current frame,
  - `w` marks end from the active candidate's current frame,
  - `a` locks the shared range if valid,
  - stepping/jump shortcuts may route to the active candidate if implemented.

- File: `spikes/frame-first-video-playback/src/styles/host.css`
  Edit: make the side-by-side layout stable and readable. Keep it functional rather than polished.

- File: `spikes/frame-first-video-playback/docs/spike-results.md`
  Edit: add comparison notes for active-candidate switching and shared range capture.

### Validation

- Command: `cd spikes/frame-first-video-playback; npm run typecheck`
  Expected: host and shared range code compile.

- Command: `cd spikes/frame-first-video-playback; npm run start`
  Expected:
  - selecting one movie stores one shared source in the host,
  - selecting active Candidate A makes `q/w/a` capture Candidate A's frame,
  - switching to Candidate B makes later `q/w/a` capture Candidate B's frame,
  - the previously active candidate pauses or idles expensive decode/playback work,
  - locked ranges always show frame and timestamp values,
  - invalid `a` attempts show an error and do not create a range.

- Optional command if tests are added: `cd spikes/frame-first-video-playback; npm test`
  Expected: pure tests pass for range-capture validation and active-candidate shortcut routing.

### Rollback/Containment

If shared keyboard routing creates confusion, keep mouse-driven active-candidate selection mandatory and show an active label in the range panel. Do not duplicate the full range panel per candidate; that would obscure the comparison goal.

## Milestone 5 - Measure, compare, and write the architecture-options document

### Scope

Convert the spike from a demo into a decision artifact. Measure both candidates, document architecture options discussed during planning, and recommend the next production direction.

### Changes

- File: `spikes/frame-first-video-playback/docs/spike-results.md`
  Edit: record measurements for each candidate:
  - package/dependency versions,
  - supported target file(s),
  - metadata/frame-index readiness time,
  - first-frame time,
  - next/previous frame latency,
  - larger jump latency,
  - scrub responsiveness,
  - playback feel at `0.25x`, `0.5x`, `1x`, and `2x`,
  - stale-result behavior,
  - memory/cache observations,
  - audible preview status,
  - Electron-specific issues,
  - maintainability notes.

- File: `spikes/frame-first-video-playback/docs/playback-architecture-options.md`
  Edit: write the required reference document. It must cover:
  - plain HTML `<video>` playback and timestamp-based seeking,
  - hybrid HTML `<video>` playback plus WebCodecs frame mode,
  - full frame-first WebCodecs playback,
  - LibVLC native-surface playback,
  - LibVLC canvas/WebGL/WebGPU rendering,
  - roughcut/VideoContext-style WebGL composition,
  - native helper approaches such as a C# process/library using LibVLCSharp, FFmpeg bindings, or platform media APIs,
  - stack options for demuxing, decoding, rendering, audio preview, and playback control,
  - frame-based seek versus regular `<video>` timestamp playback,
  - why the selected path is recommended or why no path is ready.

- File: `spikes/frame-first-video-playback/README.md`
  Edit: add a short "Results" section that points to `docs/spike-results.md` and `docs/playback-architecture-options.md`.

- File: `docs/plans/frame-first-video-playback-spike-exec-plan.md`
  Edit: update `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` with the actual results.

### Validation

- Command: `cd spikes/frame-first-video-playback; npm run typecheck`
  Expected: spike code still compiles after any measurement instrumentation or documentation-linked constants.

- Command: `cd spikes/frame-first-video-playback; npm run start`
  Expected: final manual comparison can be repeated from README instructions.

- Manual QA:
  Expected: run the acceptance behavior on the real target movie and record observed results in `docs/spike-results.md`.

### Rollback/Containment

If neither candidate is viable, do not force a recommendation. Record "no frame-first candidate is production-ready yet" with evidence, and recommend the next targeted spike, such as WebGPU rendering, alternate demuxer, or LibVLC revisit.

## Milestone 6 - Final verification and handoff

### Scope

Make the spike reproducible and safe to hand off. The final state should let the user or a future agent run the comparison host and read the decision documents without hidden context.

### Changes

- File: `spikes/frame-first-video-playback/README.md`
  Edit: ensure setup/run instructions are complete from a clean checkout:
  - install command,
  - start command,
  - sample movie expectations,
  - how to choose active candidate,
  - keyboard shortcuts,
  - where to read results.

- File: `spikes/frame-first-video-playback/package.json`
  Edit: ensure scripts are named clearly and do not mutate production app files.

- File: `docs/plans/frame-first-video-playback-spike-exec-plan.md`
  Edit: mark completed milestones, record final outcomes, and name follow-up work.

### Validation

- Command: `cd spikes/frame-first-video-playback; npm install`
  Expected: dependencies install from the nested lockfile.

- Command: `cd spikes/frame-first-video-playback; npm run typecheck`
  Expected: no TypeScript errors.

- Command: `cd spikes/frame-first-video-playback; npm run start`
  Expected: Electron host opens and the user can exercise both candidate controls.

- Manual QA expected outcome:
  - one shared movie source is selected and can be used by either candidate,
  - active candidate selection is obvious,
  - switching active candidate changes where `q/w/a` read the current frame,
  - only the active candidate performs playback/scrub/step work,
  - shared range panel captures valid ranges and rejects invalid ones,
  - measured findings are present in `docs/spike-results.md`,
  - architecture-options document exists and explains frame-based seek versus HTML `<video>` timestamp seeking.

### Rollback/Containment

Because the spike is isolated under `spikes/frame-first-video-playback/`, rollback is removing that folder plus the spike plan/spec changes if the user decides not to keep the artifact. Do not alter production app behavior as part of rollback.

## Definition of done

The spike is done when all of the following are true:

1. `spikes/frame-first-video-playback/` contains a standalone nested spike project.
2. Two isolated frame-first candidate controls are embedded in a small Electron comparison host.
3. The host owns one shared movie source that can be used by either candidate without duplicating the movie file.
4. The host provides a clear active-candidate selection UX.
5. Only the active candidate performs playback, scrub, step, and expensive decode/cache work.
6. The shared range panel captures `q/w/a` ranges from the active candidate and shows frame plus timestamp values.
7. Each candidate supports, or explicitly documents why it cannot support, play, pause, stop, speed changes, frame stepping, frame jumps, and scrub seeking.
8. Scrubbing suppresses stale decode results.
9. The spike records measured findings for both candidates.
10. `spikes/frame-first-video-playback/docs/playback-architecture-options.md` explains all architecture options listed in the approved spec, including frame-based seek versus regular HTML `<video>` timestamp playback.
11. `spikes/frame-first-video-playback/candidate-sources.json` and `scripts/fetch-candidate-sources.mjs` let the user fetch and browse available candidate source code locally.
12. The plan's living sections are updated with actual discoveries and outcomes.
13. The user can run the spike from README instructions.
