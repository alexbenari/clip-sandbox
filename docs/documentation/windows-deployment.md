# Windows Runtime Guide

## Current supported runtime

Clip Sandbox now runs as a local Electron desktop app.

The supported local developer flow is:

```powershell
npm install
npm run start
```

That command launches the Electron main process from the repository and opens the app in a desktop window. The app no longer requires a localhost server or the default browser.

## What changed

The older browser-served runtime was replaced by Electron so the app can use desktop APIs directly for local filesystem work.

Current runtime entrypoints:

- Electron main process: `electron/main.cjs`
- Electron preload bridge: `electron/preload.cjs`
- Renderer shell: `index.html`

Current renderer-to-desktop boundary:

- `src/adapters/electron/electron-file-system-service.js`

## Current scope

This migration milestone supports:

1. developer-runnable local execution from the repository,
2. direct folder browsing through Electron,
3. direct-write save and delete flows through the desktop runtime.

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
