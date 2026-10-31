# Windows Runtime Guide

Last verified: 2026-10-31 (doc-alignment pass: adapter sources named as `.ts`, the build step in `npm run start`, the native frame-review build, and Recycle Bin removal).

## Current supported runtime

Clip Sandbox now runs as a local Electron desktop app.

The supported local developer flow is:

```powershell
npm install
npm run start
```

That command compiles the TypeScript into `build/`, then launches the Electron main process from the repository and opens the app in a desktop window. The app no longer requires a localhost server or the default browser.

The app also needs the native frame-review tools, including the FFmpeg it uses, which are built separately with `npm run frame-review:bootstrap` and `npm run frame-review:build`. They are required: startup stops before the window opens when they are missing.

## What changed

The older browser-served runtime was replaced by Electron so the app can use desktop APIs directly for local filesystem work.

Current runtime entrypoints:

- Electron main process: `electron/main.cjs`
- Electron preload bridge: `electron/preload.cjs`
- Renderer shell: `index.html`

Current renderer-to-desktop boundary:

- the `src/adapters/electron/` services, chiefly `electron-folder-service.ts`, `electron-folder-file-service.ts` and `electron-pipeline-catalog-service.ts`

## Current scope

This migration milestone supports:

1. developer-runnable local execution from the repository,
2. direct folder browsing through Electron,
3. direct-write save flows and moving clips to the Recycle Bin through the desktop runtime.

This milestone does not yet provide:

1. an installer,
2. a packaged `.exe`,
3. code signing,
4. auto-update.

## Local run command

If you are orienting on the current architecture, start from:

```powershell
npm run start
```
