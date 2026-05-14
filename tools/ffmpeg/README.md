# FFmpeg Tool Contract

V1 resolves the video-edit engine through `C:/dev/clip-sandbox/tools/ffmpeg/current-binary.json`.

Current assumption:

- platform: Windows x64
- binary source: the installed `@ffmpeg-installer/ffmpeg` package in `node_modules`
- runtime resolver: `C:/dev/clip-sandbox/electron/ffmpeg-resolver.cjs`

The app does not call `ffmpeg` from `PATH`. It resolves a platform-specific binary path through the manifest in this directory, so future packaging can replace the current dependency-backed path with a committed binary or another bundled layout without changing the renderer or IPC contract.

