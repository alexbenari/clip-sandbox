param(
    [string]$InstallRoot,
    [string]$Triplet = 'x64-mingw-release',
    [switch]$ForceRebuild
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$spikeRoot = Split-Path -Parent $PSScriptRoot
$vcpkgRoot = Join-Path $spikeRoot '.deps\vcpkg-source'
$vcpkg = Join-Path $vcpkgRoot 'vcpkg.exe'
$tripletDirectory = Join-Path $PSScriptRoot 'toolchains'
if (-not $InstallRoot) {
    $InstallRoot = Join-Path $spikeRoot '.deps\phase3c-vcpkg-installed'
}
$InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
$expectedParent = [IO.Path]::GetFullPath((Join-Path $spikeRoot '.deps'))
if ($InstallRoot -ne $expectedParent -and
    -not $InstallRoot.StartsWith("$expectedParent$([IO.Path]::DirectorySeparatorChar)",
        [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The accelerated FFmpeg install root must remain below the spike .deps directory.'
}
if (-not (Test-Path -LiteralPath $vcpkg)) {
    throw "Pinned vcpkg is missing: $vcpkg"
}

$ffmpegPort = Join-Path $vcpkgRoot 'ports\ffmpeg\portfile.cmake'
$portText = [IO.File]::ReadAllText($ffmpegPort)
$qsvNeedle = '--enable-libvpl --enable-encoder=h264_qsv --enable-decoder=h264_qsv'
$qsvReplacement = "$qsvNeedle --enable-decoder=hevc_qsv"
if ($portText.Contains($qsvNeedle) -and -not $portText.Contains($qsvReplacement)) {
    $portText = $portText.Replace($qsvNeedle, $qsvReplacement)
} elseif (-not $portText.Contains($qsvReplacement)) {
    throw 'Pinned vcpkg FFmpeg QSV options no longer match the expected port structure.'
}
$mingwTargetNeedle = 'string(APPEND OPTIONS " --target-os=mingw64")'
$mingwTargetReplacement = 'string(APPEND OPTIONS " --target-os=mingw64 --enable-w32threads --enable-d3d11va --enable-dxva2 --enable-mediafoundation")'
if ($portText.Contains($mingwTargetNeedle) -and -not $portText.Contains($mingwTargetReplacement)) {
    $portText = $portText.Replace($mingwTargetNeedle, $mingwTargetReplacement)
} elseif (-not $portText.Contains($mingwTargetReplacement)) {
    throw 'Pinned vcpkg FFmpeg MinGW target options no longer match the expected port structure.'
}
$mingwReleaseNeedle = 'set(OPTIONS_RELEASE "${OPTIONS_RELEASE} --extra-ldflags=-L\"${CURRENT_INSTALLED_DIR}/lib\"")'
$mingwReleaseReplacement = 'set(OPTIONS_RELEASE "${OPTIONS_RELEASE} --extra-ldflags=-L\"${CURRENT_INSTALLED_DIR}/lib\" --extra-ldflags=-static-libgcc")'
if ($portText.Contains($mingwReleaseNeedle) -and -not $portText.Contains($mingwReleaseReplacement)) {
    $portText = $portText.Replace($mingwReleaseNeedle, $mingwReleaseReplacement)
} elseif (-not $portText.Contains($mingwReleaseReplacement)) {
    throw 'Pinned vcpkg FFmpeg MinGW release options no longer match the expected port structure.'
}
[IO.File]::WriteAllText($ffmpegPort, $portText, [Text.UTF8Encoding]::new($false))

Write-Output 'Installing the pinned FFmpeg host helper into the isolated Phase 3C root.'
& $vcpkg install 'ffmpeg-bin2c:x64-windows' `
    "--x-install-root=$InstallRoot" '--disable-metrics'
if ($LASTEXITCODE -ne 0) { throw 'Failed to install the FFmpeg host helper.' }

$bin2c = Join-Path $InstallRoot 'x64-windows\manual-tools\ffmpeg-bin2c'
$env:PATH = "$bin2c;$env:PATH"
$features = 'core,avcodec,avfilter,avformat,dav1d,ffmpeg,ffprobe,qsv,swresample,swscale'
if ($ForceRebuild) {
    Write-Output 'Removing only the isolated accelerated FFmpeg packages before rebuilding.'
    & $vcpkg remove "ffmpeg:$Triplet" "libvpl:$Triplet" `
        "--x-install-root=$InstallRoot" '--disable-metrics' '--recurse'
    if ($LASTEXITCODE -ne 0) { throw 'Failed to clear the isolated accelerated FFmpeg packages.' }
}
Write-Output 'Installing pinned FFmpeg 9 with Intel QSV into the isolated Phase 3C root.'
& $vcpkg install "ffmpeg[$features]:$Triplet" `
    "--overlay-triplets=$tripletDirectory" `
    "--x-install-root=$InstallRoot" '--clean-after-build' '--disable-metrics' '--recurse'
if ($LASTEXITCODE -ne 0) { throw 'Failed to install the QSV-enabled FFmpeg build.' }

$ffmpeg = Join-Path $InstallRoot "$Triplet\tools\ffmpeg\ffmpeg.exe"
if (-not (Test-Path -LiteralPath $ffmpeg)) {
    throw "The accelerated FFmpeg executable was not published: $ffmpeg"
}
if ($Triplet -like '*mingw*') {
    $compiler = (Get-Command 'x86_64-w64-mingw32-gcc.exe' -ErrorAction Stop).Source
    $cygpath = Join-Path (Split-Path -Parent $compiler) 'cygpath.exe'
    $sysroot = & $compiler -print-sysroot
    if ($LASTEXITCODE -ne 0 -or -not $sysroot -or -not (Test-Path -LiteralPath $cygpath)) {
        throw 'Unable to locate the MinGW runtime used by the accelerated FFmpeg build.'
    }
    $runtimeBin = Join-Path (& $cygpath -w $sysroot) 'mingw\bin'
    foreach ($runtime in @('libgcc_s_seh-1.dll', 'libstdc++-6.dll', 'libwinpthread-1.dll')) {
        $runtimeSource = Join-Path $runtimeBin $runtime
        if (-not (Test-Path -LiteralPath $runtimeSource)) {
            throw "The MinGW runtime dependency is missing: $runtimeSource"
        }
        Copy-Item -LiteralPath $runtimeSource -Destination (Split-Path -Parent $ffmpeg) -Force
    }
}
$hardware = & $ffmpeg -hide_banner -hwaccels 2>$null
if ($LASTEXITCODE -ne 0 -or $hardware -notcontains 'qsv') {
    throw 'The accelerated FFmpeg build does not report QSV support.'
}
$decoders = & $ffmpeg -hide_banner -decoders 2>&1
if ($LASTEXITCODE -ne 0 -or ($decoders -join "`n") -notmatch 'hevc_qsv') {
    throw 'The accelerated FFmpeg build does not provide the required HEVC QSV decoder.'
}
Write-Output "Accelerated FFmpeg ready: $ffmpeg"
