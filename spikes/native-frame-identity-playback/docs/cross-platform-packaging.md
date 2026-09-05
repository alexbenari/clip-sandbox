# Cross-platform packaging assessment

Status: Milestone 6 documentation spike, measured on Windows x64 only on 2026-08-30.
This is a packaging and engineering assessment, not a legal opinion. No macOS or Linux
build, package, plugin load, signing, notarization, or runtime test was performed.

## Current Windows evidence

The current spike is a Windows x64 package shape, not a portable native bundle:

| Tree or artifact | Inventory observed | Interpretation |
| --- | ---: | --- |
| `.deps/libvlc` | 626 files, 257,041,488 bytes (245.2 MiB) | LibVLC DLLs, the plugin tree, helper executables, and notices; largest cost |
| `.deps/libvlc.zip` | 104,881,782 bytes (100.0 MiB) | Verified download archive, not an installer-size forecast |
| `.deps/bestsource-install` | 8 files, 2,036,471 bytes (1.9 MiB) | Includes headers, import library, and `libbestsource.dll`; runtime DLL is 1,036,870 bytes |
| `.deps/vcpkg-installed/x64-mingw-release/bin` + `tools/ffmpeg` | 17 files, 27,237,866 bytes (25.98 MiB) | Current software runtime union: release DLLs plus `ffmpeg.exe`/`ffprobe.exe`; counted once |
| `.deps/phase3c-vcpkg-installed/x64-mingw-release/bin` + `tools/ffmpeg` | 21 files, 30,636,856 bytes (29.22 MiB) | Current accelerated runtime union, including the QSV/D3D lane; do not add to software size |
| `node_modules/electron/dist` | 75 files, 332,780,936 bytes (317.36 MiB) | Installed Windows Electron distribution; staging/pruning and compression still need a release measurement |
| `build/windows-x64` | 333 files, 56,254,684 bytes (53.6 MiB) | Debug/probe build output, including PDB/ILK files; do not ship as runtime payload |

These are filesystem measurements of the current ignored working tree. The two FFmpeg rows
are alternative runtime payloads, not additive dependencies. They are not a
compressed installer measurement and must not be used as a release-size promise. A release
packager should measure the exact staged runtime directory after pruning headers, import
libraries, debug files, build metadata, and unused plugins. The LibVLC plugin directories are
part of the runtime contract: the current probes set `VLC_PLUGIN_PATH` to `libvlc/plugins`.

The manifest pins LibVLC `4.0.0-dev-baad2c52` by the `nightly-win64` URL and SHA-512, and
records the full LibVLC source commit `baad2c523c1934470bb351105efc352e0678dd55`.
BestSource is pinned to `825af4e691524a3c98383d0cfe7d85b4142005cc`, vcpkg to
`aae277acf4e7de287ddb5e208b5316614de6aad7`, FFmpeg to `9.0`, and Electron to `37.10.3`.
The selected toolchain is `x86_64-w64-mingw32-g++ 11.4.0`, `x64-mingw-release`, and
Visual Studio component `VC.Tools.x86.x64` (see `dependency-manifest.json`).

## Boundary and platform matrix

| Concern | Windows status | macOS/Linux implication |
| --- | --- | --- |
| Electron shell | The current package shape is Windows x64; the native CMake preset is `windows-x64` (`CMakePresets.json`). | Electron's prebuilt distribution has OS-specific app layouts and executables; create separate macOS and Linux staging roots and packaging jobs. Do not copy the Windows tree. |
| LibVLC | A Windows nightly archive and Windows plugin folders are the only native playback payload measured. | Obtain and pin platform-specific LibVLC builds and plugin trees, then verify loader paths and callback behavior on each OS. Other OSes are not tested; current host/build glue is Windows-specific. |
| BestSource/FFmpeg | Built/packaged with the x64 MinGW triplet; Phase 3C also uses a Windows-specific QSV/D3D path. | Rebuild per OS and architecture. Hardware acceleration must be a capability-selected optional lane, not assumed portable behavior. |
| Callback/rendering path | The tested callback path is native Windows code feeding the existing bridge. | Treat window/texture or pixel-buffer integration as platform-specific until measured. Keep exact-frame identity in the canonical BestSource path rather than coupling it to a renderer callback. |
| Architectures | x64 only. No arm64 artifact or test exists. | Produce distinct x64 and arm64 dependency manifests or an equivalent matrix. Do not call a fat/universal package supported until both slices are built, signed, loaded, and tested. |

Electron's official distribution guidance describes separate macOS, Windows, and Linux
prebuilt layouts and says the resulting platform directory is what is delivered to users.
That supports separate staging and release artifacts, but does not establish that this
spike works on those platforms: [Electron application packaging](https://www.electronjs.org/docs/latest/tutorial/application-distribution).

## License and notice boundary

The manifest is an inventory of declared licenses, not a complete release notice. Keep the
application's own wrapper code, Electron package, and native payload records separate:

- **Wrapper and application:** the spike's C++/TypeScript/PowerShell code needs the
  repository's own release decision; this document assigns no license to it. Electron is
  recorded as MIT in the manifest (see `dependency-manifest.json`).
- **Native payload:** LibVLC is recorded as LGPL-2.1-or-later and ships a local
  `.deps/libvlc/COPYING.txt`; BestSource is MIT; FFmpeg is recorded as LGPL-2.1-or-later;
  dav1d is BSD-2-Clause AND ISC; xxHash is BSD-2-Clause; libp2p is WTFPL; vcpkg and
  nlohmann-json are MIT; Meson is Apache-2.0 (see `dependency-manifest.json`).
- **Transitive contents:** the LibVLC plugin tree and FFmpeg feature selection can bring
  additional notices, dependencies, or license conditions. Generate the release notice
  from the exact staged files and the pinned source trees, not from this short table.

Technical release recommendation: preserve upstream notices, ship or publish the exact
corresponding source and build instructions for copyleft payloads, retain the verified
archive hash, and prefer dynamic linking where the applicable upstream terms call for it.
FFmpeg's official guidance specifically discusses dynamic DLL linking, matching source to
the distributed binaries, and recording build changes: [FFmpeg legal considerations](https://ffmpeg.org/legal.html).
VideoLAN's official guidance says redistribution is governed by the relevant license and
points distributors to the product's `COPYING` file and corresponding source:
[VideoLAN legal information](https://www.videolan.org/legal.html).

Those are compliance tasks to hand to the release owner and counsel. They are not a
conclusion that the current manifest or a future bundle is legally compliant. Codec patent,
trademark, jurisdiction, and commercial-distribution questions remain outside this spike.

## Production release work

1. **Windows:** for a production release, stage the final executable, DLL, installer, and updater artifacts; sign the
   exact files that will be delivered; verify signatures and SmartScreen behavior on a clean
   Windows machine; then run the Windows smoke and exact-frame gates against that staged
   artifact. The current spike has no signing step.
2. **macOS (future production work):** use a macOS release host to code-sign the app and native binaries,
   package each architecture slice, notarize the final distribution, and verify Gatekeeper
   installation and first launch. Electron's official guidance describes signing followed by
   Apple notarization and notes that Xcode and Apple signing certificates require macOS:
   [Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing).
3. **Linux (future production work):** define the distribution format, loader/plugin path policy, and signing
   or repository-integrity mechanism separately; none is selected or tested here.
4. **Production upgrade ownership:** any Electron, LibVLC, FFmpeg, BestSource, plugin, compiler,
   architecture, or signing-tool change requires the release owner to refresh pins/hashes and
   notices, rebuild the affected platform matrix, remeasure staged size, and rerun the
   platform smoke, exact-identity, plugin-load, and update-install tests. A dependency update
   is not complete because the source compiles.

## Closeout and next gate

The bounded conclusion is: Windows x64 packaging is feasible in principle but carries a
large LibVLC/plugin payload and has not yet been reduced to a release staging directory.
The spike provides no evidence for macOS, Linux, arm64, signing, notarization, or upgrade
success. MS7 may record these as production-release follow-ups; signing, notarization,
clean-machine installation, and upgrade retests are not POC closeout blockers for this
assessment. This assessment does not introduce a production packaging implementation.

### Evidence consulted

- Local: `dependency-manifest.json`, `CMakePresets.json`, `CMakeLists.txt`,
  `scripts/bootstrap-native.ps1`, `scripts/bootstrap-bestsource.ps1`,
  `scripts/verify-libvlc-api.ps1`, `.deps/resolved-dependencies.json`, `.deps/libvlc`,
  `.deps/bestsource-install`, FFmpeg package tree, `build/windows-x64`, and the Phase 3C
  artifacts/logs.
- Plan: `docs/plans/native-frame-identity-playback-spike-exec-plan.md` (Milestones 6 and 7).
- Official primary sources: [Electron packaging](https://www.electronjs.org/docs/latest/tutorial/application-distribution),
  [Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing),
  [FFmpeg legal considerations](https://ffmpeg.org/legal.html), and
  [VideoLAN legal information](https://www.videolan.org/legal.html).
