# Third-Party Notices

This repository's optional Windows x64 frame-review toolchain resolves the exact
versions recorded in `tools/frame-review/dependency-manifest.json`. The bootstrap
and build are explicit developer operations; application startup does not fetch
or compile these dependencies.

The staged frame-review runtime contains the following direct dependencies:

| Dependency | Version or revision | License | Purpose |
| --- | --- | --- | --- |
| FFmpeg | 9.0 | GPL-2.0-or-later in this x264-enabled build | Original-media inspection, proxy generation, and MP4 extraction |
| x264 | 0.164.3108#2 / `31e19f92f00c7003fa115047ce50978bc98c3a0d` | GPL-2.0-or-later | Lossless H.264 RGB encoding through FFmpeg |
| LibVLC | 4.0.0-dev-baad2c52 | LGPL-2.1-or-later | Clocked playback and audio |
| BestSource | `825af4e691524a3c98383d0cfe7d85b4142005cc` | MIT | Canonical decoded-frame identity and indexed frame access |
| dav1d | 1.5.4 | BSD-2-Clause AND ISC | AV1 decoding used by the FFmpeg/BestSource stack |
| xxHash | 0.8.3 | BSD-2-Clause | BestSource/index signature support |
| libp2p | `869fa993041f9f3af7d9ac8b10158920c6ddce66` | WTFPL | BestSource image processing dependency |
| JSON for Modern C++ | 3.12.0#2 | MIT | Bounded native helper protocol metadata |
| vcpkg | `aae277acf4e7de287ddb5e208b5316614de6aad7` | MIT | Reproducible dependency resolution at build time only |

The FFmpeg feature selection deliberately enables `gpl` and `x264`; therefore
the resulting FFmpeg libraries and executables are GPL-covered. It deliberately
does not enable nonfree codecs or any QSV, oneVPL, CUDA, NVENC, or AMF dependency.
Before distributing an application bundle containing these binaries, package the
corresponding license texts and satisfy the applicable source-offer/source-code
and relinking requirements. The cached vcpkg package directories contain the
dependency-specific copyright files used when assembling distributable notices.

This notice is a build and packaging inventory, not legal advice.
