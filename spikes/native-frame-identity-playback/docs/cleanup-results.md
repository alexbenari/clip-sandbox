# POC closeout cleanup

Completed 2026-08-30 after the fixed ten-minute soak and clean build/tests. Only literal paths
inside this spike were removed; original media, source/index/proxy caches and production code were
not changed. The allowlist was dry-run first and each resolved path checked against the spike root.

## Removed

- Rejected `candidates/node-av`: package, node_modules, probe code and generated outputs.
- Stale vcpkg FFmpeg staging trees for `x64-mingw-dynamic` and `x64-windows`; the unused
  `xxhash:x64-mingw-dynamic` installation was removed through vcpkg to preserve its database.
- Obsolete DrMemory, upstream BestSource comparison bundles, and the diagnostic VapourSynth venv.
- Temporary prepared/remux/performance diagnostics and NASM wrapper test files.

The allowlisted directories/files contained **6,687 files and 11,787,669,898 bytes (10.98 GiB)**.
This is their pre-deletion logical size, not a measured physical free-space delta. The vcpkg-managed
installed xxHash removal is additional and not included in that count.

The rejected node-av logs were copied to `artifacts/rejected-node-av-*.log` before deletion.
The complete deletion inventory is `artifacts/cleanup-summary.json`.
The post-cleanup 4K Electron smoke passed with no player/helper error and a visible review proxy
(`artifacts/ms7-post-cleanup-smoke.log`).

## Deliberately retained

- `.deps/prepared-review-cache/`, including canonical and proxy indexes, normalized movies,
  mapped proxies and cache manifests; `.deps/indexes/` for regression reuse.
- `.deps/vcpkg-installed/x64-mingw-release/` **and** `.deps/phase3c-vcpkg-installed/`: the selected
  software and conditional QSV runtimes. They are both active, not stale duplicate distributions.
- LibVLC/plugins, BestSource runtime/source, pinned vcpkg source and host build helpers, VLC headers,
  and build scripts. These make the reference implementation rebuildable.
- Native identity/transport gates, diagnostic test code, and `.deps/remediation-media/` used by the
  retained remediation script. They explain past decisions and permit dependency-update regression
  testing; they are not alternative active playback controls and are not a production ship list.
- Small raw results, logs, screenshots and report-generation scripts supporting published claims.

The only interactive reference player is `electron/main.cjs` with the prepared-review C2 adapters.
Do not reintroduce node-av, a second candidate player, thumbnail controls, or a native-window path
when porting it to the product. Historical gate/benchmark code should remain outside the new
production component. See [integration handoff](frame-scrub-supporting-player-control-integration-handoof.md).

## Reproduce the cleanup

From the spike directory in PowerShell, with playback/builds stopped:

```powershell
./scripts/cleanup-rejected-candidates.ps1
./scripts/cleanup-rejected-candidates.ps1 -Apply
```

The first command is a dry run. The script never targets the active runtimes or review caches.
Removing all caches is a separate deliberate reset and is not required for ordinary cleanup.
