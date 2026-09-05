Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$spikeRoot = Split-Path -Parent $PSScriptRoot
$resolved = Get-Content (Join-Path $spikeRoot '.deps\resolved-dependencies.json') -Raw | ConvertFrom-Json

& (Join-Path $PSScriptRoot 'import-vs-environment.ps1') -VisualStudioRoot $resolved.visualStudio.root
Push-Location $spikeRoot
try {
    & $resolved.cmake.path --preset windows-x64
    if ($LASTEXITCODE -ne 0) { throw 'CMake configure failed.' }
    & $resolved.cmake.path --build --preset windows-x64-debug
    if ($LASTEXITCODE -ne 0) { throw 'Native build failed.' }
    & node .\scripts\run-libvlc-gate.mjs
    if ($LASTEXITCODE -ne 0) { throw 'LibVLC gate runner failed.' }
} finally {
    Pop-Location
}

