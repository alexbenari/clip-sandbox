Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$spikeRoot = Split-Path -Parent $PSScriptRoot
$resolvedPath = Join-Path $spikeRoot '.deps\resolved-dependencies.json'
if (-not (Test-Path $resolvedPath)) {
    throw 'Resolved dependencies are missing. Run bootstrap-native.ps1 first.'
}

$resolved = Get-Content $resolvedPath -Raw | ConvertFrom-Json
$header = Join-Path $resolved.libvlc.include 'vlc\libvlc_media_player.h'
if (-not (Test-Path $header)) { throw "LibVLC media-player header not found at $header" }

$requiredSymbols = @(
    'libvlc_media_player_next_frame',
    'libvlc_media_player_previous_frame',
    'libvlc_video_set_callbacks',
    'libvlc_video_set_format_callbacks',
    'libvlc_video_get_size',
    'libvlc_video_set_output_callbacks'
)

$headerText = Get-Content $header -Raw
foreach ($symbol in $requiredSymbols) {
    if ($headerText -notmatch [regex]::Escape($symbol)) {
        throw "Pinned header does not declare $symbol"
    }
}

Push-Location $spikeRoot
try {
    & (Join-Path $PSScriptRoot 'import-vs-environment.ps1') `
        -VisualStudioRoot $resolved.visualStudio.root
    $buildRoot = [IO.Path]::GetFullPath((Join-Path $spikeRoot 'build\windows-x64'))
    $resolvedSpikeRoot = [IO.Path]::GetFullPath($spikeRoot).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $buildRoot.StartsWith($resolvedSpikeRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove build output outside the spike root: $buildRoot"
    }
    if (Test-Path $buildRoot) {
        Remove-Item -LiteralPath $buildRoot -Recurse -Force
    }
    $cmake = $resolved.cmake.path
    & $cmake --preset windows-x64
    if ($LASTEXITCODE -ne 0) { throw 'CMake configure failed.' }
    & $cmake --build --preset windows-x64-debug --target libvlc_api_probe
    if ($LASTEXITCODE -ne 0) { throw 'LibVLC API probe build failed.' }

    $probe = Join-Path $spikeRoot 'build\windows-x64\libvlc_api_probe.exe'
    $env:PATH = "$($resolved.libvlc.root);$env:PATH"
    $env:VLC_PLUGIN_PATH = $resolved.libvlc.plugins
    & $probe $resolved.libvlc.dll
    if ($LASTEXITCODE -ne 0) { throw 'LibVLC API probe execution failed.' }
} finally {
    Pop-Location
}

Write-Output 'LIBVLC_API_READY'
