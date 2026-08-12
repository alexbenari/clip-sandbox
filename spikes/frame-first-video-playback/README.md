# Frame-First Video Playback Spike

This spike is an isolated nested project for comparing two frame-first playback controls inside a small Electron host.

## What it contains

- one shared movie source picker owned by the host,
- two isolated candidate controls,
- one shared range capture panel for `q`, `w`, and `a`,
- local source-mirror tooling for candidate repositories,
- spike-only documentation and results notes.

## Run

```bash
npm install
npm run fetch:candidate-sources
npm start
```

The Electron app opens a comparison page from the built static assets under `dist/`.

## Check

```bash
npm run typecheck
npm test
```

## Notes

- This spike intentionally does not import production app modules from `src/`.
- The Electron host loads the static Vite build from `dist/`.
- Candidate implementation results are recorded in [`docs/spike-results.md`](./docs/spike-results.md).
- Architecture tradeoffs are recorded in [`docs/playback-architecture-options.md`](./docs/playback-architecture-options.md).
- `candidates-source-code/` stays git-ignored; use `npm run fetch:candidate-sources` to refresh the pinned mirrors from [`candidate-sources.json`](./candidate-sources.json).

## Current outcome

- Candidate A (`webcodecs-examples`) loads, renders, plays, steps, scrubs, and provides preview audio in Electron.
- Candidate B (custom Mediabunny + `CanvasSink`) loads, renders, plays, steps, scrubs, and supports playback-rate control in Electron.
- Shared `q/w/a` range capture follows the active candidate and preserves frame plus timestamp values.
- The current recommendation is to continue from Candidate B for production follow-up, while treating Candidate A as the reference for "audio preview already solved."
