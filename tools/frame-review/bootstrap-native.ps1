param(
    [switch]$ForceDownload
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$toolRoot = $PSScriptRoot
$repositoryRoot = Split-Path -Parent (Split-Path -Parent $toolRoot)
$depsRoot = Join-Path $toolRoot '.deps'
$manifestPath = Join-Path $toolRoot 'dependency-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$resolvedDepsRoot = [IO.Path]::GetFullPath($depsRoot).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

if (-not [Environment]::Is64BitOperatingSystem -or $env:OS -ne 'Windows_NT') {
    throw 'The frame-review native toolchain supports Windows x64 only.'
}

function Assert-WithinDepsRoot([string]$Path) {
    $resolvedPath = [IO.Path]::GetFullPath($Path)
    if (-not $resolvedPath.StartsWith($resolvedDepsRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing filesystem mutation outside the frame-review dependency root: $resolvedPath"
    }
    return $resolvedPath
}

function Get-WorkingCommand([string]$Name, [string[]]$Arguments = @('--version')) {
    foreach ($candidate in @(Get-Command $Name -All -ErrorAction SilentlyContinue)) {
        try {
            $output = @(& $candidate.Source @Arguments 2>&1)
            if ($LASTEXITCODE -eq 0 -and $output.Count -gt 0) { return $candidate.Source }
        } catch { continue }
    }
    throw "Required tool '$Name' is missing or unusable. Install it, then rerun npm run frame-review:bootstrap."
}

function Assert-MinimumVersion([string]$Name, [string]$VersionText, [string]$Minimum) {
    if ($VersionText -notmatch '(\d+\.\d+\.\d+)') {
        throw "Could not determine the $Name version from: $VersionText"
    }
    $actual = [Version]$Matches[1]
    $required = [Version]$Minimum
    if ($actual -lt $required) {
        throw "$Name $actual is too old; frame-review requires $required or newer."
    }
}

function Get-FileDigest([string]$Path, [ValidateSet('SHA256', 'SHA512')][string]$Algorithm) {
    $hasher = [Security.Cryptography.HashAlgorithm]::Create($Algorithm)
    $stream = [IO.File]::OpenRead($Path)
    try {
        return ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    } finally {
        $stream.Dispose()
        $hasher.Dispose()
    }
}

function Sync-PinnedGitSource([object]$Pin, [string]$Destination, [string]$Name) {
    if (-not (Test-Path -LiteralPath (Join-Path $Destination '.git'))) {
        & git clone --filter=blob:none --no-checkout $Pin.url $Destination
        if ($LASTEXITCODE -ne 0) { throw "Failed to clone pinned dependency $Name." }
    }
    $actual = (& git -C $Destination rev-parse HEAD 2>$null)
    if ($LASTEXITCODE -eq 0 -and ([string]$actual).Trim() -eq $Pin.commit) {
        Write-Output "Reusing pinned $Name source at $($Pin.commit)."
        return
    }
    & git -C $Destination fetch --depth 1 origin $Pin.commit
    if ($LASTEXITCODE -ne 0) { throw "Failed to fetch pinned $Name commit $($Pin.commit)." }
    & git -C $Destination checkout --detach $Pin.commit
    if ($LASTEXITCODE -ne 0) { throw "Failed to check out pinned $Name commit $($Pin.commit)." }
    $actual = (& git -C $Destination rev-parse HEAD).Trim()
    if ($actual -ne $Pin.commit) { throw "$Name pin mismatch. Expected $($Pin.commit); got $actual." }
}

New-Item -ItemType Directory -Force -Path $depsRoot | Out-Null
[void](Get-WorkingCommand 'git')
$node = Get-WorkingCommand 'node' @('--version')
$nodeVersion = (& $node --version | Select-Object -First 1)
Assert-MinimumVersion 'Node.js' $nodeVersion $manifest.toolchain.nodeMinimum
$compiler = [IO.Path]::GetFullPath([string]$manifest.toolchain.compiler)
if (-not (Test-Path -LiteralPath $compiler)) {
    throw "Pinned MinGW compiler is missing at $compiler. Install the Cygwin x86_64-w64-mingw32 toolchain, then rerun."
}

$vlcPin = $manifest.dependencies.libvlc
$archivePath = Join-Path $depsRoot 'libvlc.zip'
$vlcRoot = Join-Path $depsRoot 'libvlc'
if ($ForceDownload -or -not (Test-Path -LiteralPath $archivePath)) {
    Write-Output "Downloading pinned LibVLC $($vlcPin.version)."
    Invoke-WebRequest -Uri $vlcPin.url -OutFile $archivePath -UseBasicParsing
}
$actualHash = Get-FileDigest $archivePath 'SHA512'
if ($actualHash -ne $vlcPin.sha512.ToLowerInvariant()) {
    throw "libvlc SHA-512 mismatch. Expected $($vlcPin.sha512); got $actualHash. Remove $archivePath or rerun npm run frame-review:bootstrap -- --ForceDownload."
}

$vlcMarker = Join-Path $vlcRoot '.clip-sandbox-pin'
$reuseLibVlc = (Test-Path -LiteralPath (Join-Path $vlcRoot 'libvlc.dll')) -and
    (Test-Path -LiteralPath $vlcMarker) -and
    ((Get-Content -LiteralPath $vlcMarker -Raw).Trim() -eq $actualHash)
if ($reuseLibVlc) {
    Write-Output "Reusing verified LibVLC $($vlcPin.version)."
} else {
    $extractRoot = Assert-WithinDepsRoot (Join-Path $depsRoot 'libvlc-extract')
    $vlcRoot = Assert-WithinDepsRoot $vlcRoot
    if (Test-Path -LiteralPath $extractRoot) { Remove-Item -LiteralPath $extractRoot -Recurse -Force }
    if (Test-Path -LiteralPath $vlcRoot) { Remove-Item -LiteralPath $vlcRoot -Recurse -Force }
    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractRoot
    $dll = Get-ChildItem -LiteralPath $extractRoot -Filter libvlc.dll -Recurse | Select-Object -First 1
    if (-not $dll) { throw 'The verified LibVLC archive did not contain libvlc.dll.' }
    Move-Item -LiteralPath $dll.Directory.FullName -Destination $vlcRoot
    Remove-Item -LiteralPath $extractRoot -Recurse -Force
    [IO.File]::WriteAllText($vlcMarker, $actualHash, [Text.UTF8Encoding]::new($false))
}

$vlcSourceRoot = Join-Path $depsRoot 'vlc-source'
$bestSourceRoot = Join-Path $depsRoot 'bestsource-source'
$vcpkgRoot = Join-Path $depsRoot 'vcpkg-source'
Sync-PinnedGitSource $manifest.dependencies.libvlcSource $vlcSourceRoot 'libvlcSource'
& git -C $vlcSourceRoot sparse-checkout init --cone
if ($LASTEXITCODE -ne 0) { throw 'Failed to initialize the pinned LibVLC sparse checkout.' }
& git -C $vlcSourceRoot sparse-checkout set include
if ($LASTEXITCODE -ne 0) { throw 'Failed to select pinned LibVLC headers.' }
Sync-PinnedGitSource $manifest.dependencies.bestsource $bestSourceRoot 'bestsource'
Sync-PinnedGitSource $manifest.dependencies.vcpkg $vcpkgRoot 'vcpkg'

& (Join-Path $toolRoot 'bootstrap-bestsource.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Pinned FFmpeg and BestSource bootstrap failed.' }

$installedRoot = Join-Path $depsRoot 'vcpkg-installed'
$vcpkgToolsRoot = Join-Path $vcpkgRoot 'downloads\tools'
$ninja = Get-ChildItem -LiteralPath $vcpkgToolsRoot -Recurse -Filter ninja.exe -File |
    Select-Object -First 1 -ExpandProperty FullName
$cmake = 'C:\cygwin64\bin\cmake.exe'
$ctest = 'C:\cygwin64\bin\ctest.exe'
$make = 'C:\cygwin64\bin\make.exe'
$cygpath = 'C:\cygwin64\bin\cygpath.exe'
$missingCygwinTools = @(@($cmake, $ctest, $make, $cygpath) | Where-Object {
    -not (Test-Path -LiteralPath $_)
})
if (-not $ninja -or $missingCygwinTools.Count -gt 0) {
    throw 'The Cygwin CMake, CTest, make, cygpath, and pinned vcpkg Ninja tools are required.'
}
$cmakeVersion = (& $cmake --version | Select-Object -First 1)
Assert-MinimumVersion 'CMake' $cmakeVersion $manifest.toolchain.cmakeMinimum
$tripletRoot = Join-Path $installedRoot $manifest.toolchain.triplet
$ffmpegRoot = Join-Path $tripletRoot 'tools\ffmpeg'
$bestSourceInstall = Join-Path $depsRoot 'bestsource-install'
$manifestHash = Get-FileDigest $manifestPath 'SHA256'
$resolved = [ordered]@{
    schemaVersion = 1
    manifestSha256 = $manifestHash
    generatedAtUtc = [DateTime]::UtcNow.ToString('o')
    sources = [ordered]@{
        libvlc = [ordered]@{ root = $vlcSourceRoot; commit = $manifest.dependencies.libvlcSource.commit }
        bestsource = [ordered]@{ root = $bestSourceRoot; commit = $manifest.dependencies.bestsource.commit }
        vcpkg = [ordered]@{ root = $vcpkgRoot; commit = $manifest.dependencies.vcpkg.commit }
        libp2p = [ordered]@{
            root = Join-Path $bestSourceRoot 'subprojects\libp2p'
            commit = $manifest.dependencies.libp2p.commit
        }
    }
    libvlc = [ordered]@{
        archive = $archivePath
        root = $vlcRoot
        dll = Join-Path $vlcRoot 'libvlc.dll'
        plugins = Join-Path $vlcRoot 'plugins'
        include = Join-Path $vlcSourceRoot 'include'
        version = $vlcPin.version
    }
    bestsource = [ordered]@{
        root = $bestSourceInstall
        include = Join-Path $bestSourceInstall 'include'
        library = Join-Path $bestSourceInstall 'lib\libbestsource.dll.a'
    }
    vcpkg = [ordered]@{ root = $vcpkgRoot; installed = $installedRoot; tripletRoot = $tripletRoot }
    ffmpeg = [ordered]@{
        path = Join-Path $ffmpegRoot 'ffmpeg.exe'
        root = $ffmpegRoot
        runtimeDllRoot = Join-Path $tripletRoot 'bin'
    }
    ffprobe = [ordered]@{
        path = Join-Path $ffmpegRoot 'ffprobe.exe'
        root = $ffmpegRoot
        runtimeDllRoot = Join-Path $tripletRoot 'bin'
    }
    cmake = [ordered]@{
        path = $cmake
        ctestPath = $ctest
        makePath = $make
        cygpathPath = $cygpath
        version = $cmakeVersion
    }
    ninja = [ordered]@{ path = $ninja; version = (& $ninja --version | Select-Object -First 1) }
    compiler = [ordered]@{
        path = $compiler
        version = (& $compiler --version | Select-Object -First 1)
        runtimeDllRoot = 'C:\cygwin64\usr\x86_64-w64-mingw32\sys-root\mingw\bin'
    }
    requiredArtifacts = [ordered]@{
        libvlc = Join-Path $vlcRoot 'libvlc.dll'
        bestsource = Join-Path $bestSourceInstall 'lib\libbestsource.dll.a'
        ffmpeg = Join-Path $ffmpegRoot 'ffmpeg.exe'
        ffprobe = Join-Path $ffmpegRoot 'ffprobe.exe'
        nlohmannJson = Join-Path $tripletRoot 'include\nlohmann\json.hpp'
        xxhash = Join-Path $tripletRoot 'lib\libxxhash.dll.a'
    }
}
$resolvedPath = Join-Path $depsRoot 'resolved-dependencies.json'
[IO.File]::WriteAllText($resolvedPath, ($resolved | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
& $node (Join-Path $toolRoot 'verify-dependencies.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Frame-review dependency verification failed.' }
Write-Output "Pinned frame-review dependencies are ready under $depsRoot."
