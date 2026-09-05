$ErrorActionPreference = 'Stop'

$spikeRoot = Split-Path -Parent $PSScriptRoot
$depsRoot = Join-Path $spikeRoot '.deps'
$manifest = Get-Content -LiteralPath (Join-Path $spikeRoot 'dependency-manifest.json') -Raw | ConvertFrom-Json
$vcpkgSource = Join-Path $depsRoot 'vcpkg-source'
$bestSourceSource = Join-Path $depsRoot 'bestsource-source'
$bestSourceBuild = Join-Path $depsRoot 'bestsource-build'
$bestSourceInstall = Join-Path $depsRoot 'bestsource-install'
$installedRoot = Join-Path $depsRoot 'vcpkg-installed'
$triplet = 'x64-mingw-release'
$tripletDirectory = Join-Path $PSScriptRoot 'toolchains'
$mingwBin = 'C:\cygwin64\bin'

if (-not (Test-Path -LiteralPath (Join-Path $mingwBin 'x86_64-w64-mingw32-g++.exe'))) {
    throw 'The x86_64 MinGW compiler is missing from C:\cygwin64\bin.'
}
New-Item -ItemType Directory -Force -Path $depsRoot | Out-Null

function Sync-PinnedGitSource([object]$pin, [string]$destination) {
    if (-not (Test-Path -LiteralPath (Join-Path $destination '.git'))) {
        git clone --filter=blob:none $pin.url $destination
        if ($LASTEXITCODE -ne 0) { throw "Failed to clone $($pin.url)" }
    }
    git -C $destination fetch --depth 1 origin $pin.commit
    if ($LASTEXITCODE -ne 0) { throw "Failed to fetch $($pin.commit)" }
    git -C $destination checkout --detach $pin.commit
    if ($LASTEXITCODE -ne 0) { throw "Failed to check out $($pin.commit)" }
    $actual = (git -C $destination rev-parse HEAD).Trim()
    if ($actual -ne $pin.commit) { throw "Pin mismatch at ${destination}: $actual" }
}

function Write-Utf8NoBom([string]$path, [string]$content) {
    [System.IO.File]::WriteAllText($path, $content, [System.Text.UTF8Encoding]::new($false))
}

Sync-PinnedGitSource $manifest.dependencies.vcpkg $vcpkgSource
Sync-PinnedGitSource $manifest.dependencies.bestsource $bestSourceSource

$vcpkgExe = Join-Path $vcpkgSource 'vcpkg.exe'
if (-not (Test-Path -LiteralPath $vcpkgExe)) {
    & (Join-Path $vcpkgSource 'bootstrap-vcpkg.bat') -disableMetrics
    if ($LASTEXITCODE -ne 0) { throw 'Failed to bootstrap vcpkg.' }
}

# vcpkg's Windows NASM receives Cygwin paths under this MinGW installation.
# Route it through an MSYS shell wrapper which translates only those path arguments.
$portFile = Join-Path $vcpkgSource 'ports\ffmpeg\portfile.cmake'
$buildTemplate = Join-Path $vcpkgSource 'ports\ffmpeg\build.sh.in'
$mesonHelperPort = Join-Path $vcpkgSource 'ports\vcpkg-tool-meson\vcpkg_configure_meson.cmake'
git -C $vcpkgSource restore --source $manifest.dependencies.vcpkg.commit -- `
    'ports/ffmpeg/portfile.cmake' 'ports/ffmpeg/build.sh.in' 'ports/ffmpeg/0045-use-prebuilt-bin2c.patch' `
    'ports/vcpkg-tool-meson/vcpkg_configure_meson.cmake'
if ($LASTEXITCODE -ne 0) { throw 'Failed to restore the pinned FFmpeg port before applying the local wrapper.' }
$portText = Get-Content -LiteralPath $portFile -Raw
$toolWrapperHook = @'
    set(NATIVE_NASM "${NASM}")
    set(NATIVE_SOURCE_PATH "${SOURCE_PATH}")
    set(NASM_WRAPPER "${CURRENT_BUILDTREES_DIR}/nasm-msys-wrapper.sh")
    configure_file("__WRAPPER_TEMPLATE__" "${NASM_WRAPPER}" @ONLY NEWLINE_STYLE UNIX)
    set(NATIVE_BIN2C "${CURRENT_HOST_INSTALLED_DIR}/manual-tools/ffmpeg-bin2c/bin2c.exe")
    set(BIN2C_WRAPPER "${CURRENT_BUILDTREES_DIR}/bin2c-msys-wrapper.sh")
    configure_file("__BIN2C_WRAPPER_TEMPLATE__" "${BIN2C_WRAPPER}" @ONLY NEWLINE_STYLE UNIX)
    string(APPEND OPTIONS " --x86asmexe=${NASM_WRAPPER}")
'@
$toolWrapperHook = $toolWrapperHook.Replace('__WRAPPER_TEMPLATE__', (Join-Path $PSScriptRoot 'toolchains\nasm-msys-wrapper.sh.in').Replace('\', '/'))
$toolWrapperHook = $toolWrapperHook.Replace('__BIN2C_WRAPPER_TEMPLATE__', (Join-Path $PSScriptRoot 'toolchains\bin2c-msys-wrapper.sh.in').Replace('\', '/'))
$needle = 'if(VCPKG_TARGET_IS_MINGW)'
$hookPosition = $portText.IndexOf($needle, [StringComparison]::Ordinal)
if ($hookPosition -lt 0) { throw 'Pinned FFmpeg port no longer has the expected MinGW branch.' }
$insertPosition = $hookPosition + $needle.Length
$portText = $portText.Insert($insertPosition, "`r`n$toolWrapperHook")
Write-Utf8NoBom $portFile $portText

# vcpkg adds the host bin2c directory to the Windows PATH, but that entry is lost
# when its FFmpeg port enters the MSYS build shell. Use a wrapper that translates
# MSYS input paths before invoking the native host tool.
$buildText = Get-Content -LiteralPath $buildTemplate -Raw
$buildPathNeedle = 'PATH_TO_PACKAGE_DIR="@INST_PREFIX@"'
$bin2cHook = @'
BIN2C_WRAPPER="@BIN2C_WRAPPER@"
'@
if (-not $buildText.Contains($buildPathNeedle)) {
    throw 'Pinned FFmpeg build template no longer has the expected package-directory line.'
}
$buildText = $buildText.Replace($buildPathNeedle, "$buildPathNeedle`r`n$bin2cHook")
$makeNeedle = '$MAKE_BINARY -j${JOBS} V=1'
if (-not $buildText.Contains($makeNeedle)) {
    throw 'Pinned FFmpeg build template no longer has the expected make invocation.'
}
$buildText = $buildText.Replace($makeNeedle, '$MAKE_BINARY -j${JOBS} V=1 BIN2C="$BIN2C_WRAPPER"')
Write-Utf8NoBom $buildTemplate $buildText

# The pinned Meson helper emits an unescaped Windows Ninja path into a Python-style
# Meson native file. Normalize it before template expansion so paths containing
# sequences such as "\t" are not interpreted as control characters.
$mesonHelperText = Get-Content -LiteralPath $mesonHelperPort -Raw
$mesonNinjaNeedle = '    vcpkg_find_acquire_program(NINJA)'
$mesonNinjaReplacement = @'
    vcpkg_find_acquire_program(NINJA)
    string(REPLACE "\\" "/" NINJA "${NINJA}")
    set(ENV{NINJA} "${NINJA}")
'@
if (-not $mesonHelperText.Contains($mesonNinjaNeedle)) {
    throw 'Pinned vcpkg Meson helper no longer has the expected Ninja acquisition line.'
}
$mesonHelperText = $mesonHelperText.Replace($mesonNinjaNeedle, $mesonNinjaReplacement)
Write-Utf8NoBom $mesonHelperPort $mesonHelperText

$installedMesonHelper = Join-Path $installedRoot 'x64-windows\share\vcpkg-tool-meson\vcpkg_configure_meson.cmake'
if (Test-Path -LiteralPath $installedMesonHelper) {
    Copy-Item -LiteralPath $mesonHelperPort -Destination $installedMesonHelper -Force
}

& $vcpkgExe install 'ffmpeg-bin2c:x64-windows' `
    "--x-install-root=$installedRoot" '--disable-metrics'
if ($LASTEXITCODE -ne 0) { throw 'Failed to install FFmpeg host bin2c.' }
$hostBin2cDirectory = Join-Path $installedRoot 'x64-windows\manual-tools\ffmpeg-bin2c'
if (-not (Test-Path -LiteralPath (Join-Path $hostBin2cDirectory 'bin2c.exe'))) {
    throw 'vcpkg did not provide the host bin2c tool required by the FFmpeg programs.'
}
$env:PATH = "$hostBin2cDirectory;$mingwBin;$env:PATH"
& $vcpkgExe install `
    "ffmpeg[core,avcodec,avfilter,avformat,dav1d,ffmpeg,ffprobe,swresample,swscale]:$triplet" `
    "xxhash:$triplet" `
    "--overlay-triplets=$tripletDirectory" `
    "--x-install-root=$installedRoot" `
    '--clean-after-build' '--disable-metrics' '--recurse'
if ($LASTEXITCODE -ne 0) { throw 'Failed to install the pinned FFmpeg, dav1d, and xxHash packages.' }

$libp2pPin = $manifest.dependencies.libp2p
$libp2pSource = Join-Path $bestSourceSource 'subprojects\libp2p'
Sync-PinnedGitSource $libp2pPin $libp2pSource
Copy-Item -LiteralPath (Join-Path $bestSourceSource 'subprojects\packagefiles\libp2p\meson.build') `
    -Destination (Join-Path $libp2pSource 'meson.build') -Force

$meson = Get-ChildItem (Join-Path $vcpkgSource 'downloads\tools') -Recurse -Filter meson.py -File |
    Select-Object -First 1 -ExpandProperty FullName
$ninja = Get-ChildItem (Join-Path $vcpkgSource 'downloads\tools') -Recurse -Filter ninja.exe -File |
    Select-Object -First 1 -ExpandProperty FullName
$pkgConfig = Get-ChildItem (Join-Path $vcpkgSource 'downloads\tools\msys2') -Recurse -Filter pkg-config.exe -File |
    Where-Object FullName -Like '*mingw64*' | Select-Object -First 1 -ExpandProperty FullName
if (-not $meson -or -not $ninja -or -not $pkgConfig) {
    throw 'vcpkg did not provide Meson, Ninja, and MinGW pkg-config.'
}

function Posix([string]$path) { return $path.Replace('\', '/') }
$nativeFile = Join-Path $depsRoot 'meson-mingw.ini'
$dependencyRoot = Join-Path $installedRoot $triplet
$machine = @"
[binaries]
c = 'C:/cygwin64/bin/x86_64-w64-mingw32-gcc.exe'
cpp = 'C:/cygwin64/bin/x86_64-w64-mingw32-g++.exe'
ar = 'C:/cygwin64/bin/x86_64-w64-mingw32-ar.exe'
strip = 'C:/cygwin64/bin/x86_64-w64-mingw32-strip.exe'
windres = 'C:/cygwin64/bin/x86_64-w64-mingw32-windres.exe'
pkg-config = '$(Posix $pkgConfig)'

[host_machine]
system = 'windows'
cpu_family = 'x86_64'
cpu = 'x86_64'
endian = 'little'

[built-in options]
buildtype = 'release'
prefix = '$(Posix $bestSourceInstall)'
pkg_config_path = ['$(Posix (Join-Path $dependencyRoot 'lib\pkgconfig'))']
"@
Write-Utf8NoBom $nativeFile $machine

$env:PATH = "$(Split-Path -Parent $ninja);$mingwBin;$env:PATH"
python $meson setup $bestSourceBuild $bestSourceSource --native-file $nativeFile -Denable_plugin=false --wipe
if ($LASTEXITCODE -ne 0) { throw 'Failed to configure BestSource.' }
python $meson install -C $bestSourceBuild
if ($LASTEXITCODE -ne 0) { throw 'Failed to build and install BestSource.' }

& (Join-Path $PSScriptRoot 'build-bestsource-gate.ps1') -Triplet $triplet
Write-Host 'Pinned BestSource stack and native gate are ready.'
