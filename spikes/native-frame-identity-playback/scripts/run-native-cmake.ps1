param(
    [ValidateSet('configure', 'build', 'test')]
    [string]$Action = 'build',
    [switch]$CleanFirst
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$spikeRoot = Split-Path -Parent $PSScriptRoot
$resolvedPath = Join-Path $spikeRoot '.deps\resolved-dependencies.json'
if (-not (Test-Path -LiteralPath $resolvedPath)) {
    throw 'Resolved dependencies are missing. Run bootstrap-native.ps1 first.'
}

$resolved = Get-Content -LiteralPath $resolvedPath -Raw | ConvertFrom-Json
& (Join-Path $PSScriptRoot 'import-vs-environment.ps1') `
    -VisualStudioRoot $resolved.visualStudio.root

$cmake = [string]$resolved.cmake.path
$ctest = Join-Path (Split-Path -Parent $cmake) 'ctest.exe'
if (-not (Test-Path -LiteralPath $cmake) -or -not (Test-Path -LiteralPath $ctest)) {
    throw 'The resolved CMake toolchain is no longer available.'
}

Push-Location $spikeRoot
try {
    & $cmake --preset windows-x64
    if ($LASTEXITCODE -ne 0) { throw 'CMake configure failed.' }

    if ($Action -in @('build', 'test')) {
        $buildArguments = @('--build', '--preset', 'windows-x64-debug')
        if ($CleanFirst) { $buildArguments += '--clean-first' }
        & $cmake @buildArguments
        if ($LASTEXITCODE -ne 0) { throw 'Native build failed.' }
    }

    if ($Action -eq 'test') {
        & $ctest --preset native-tests --output-on-failure
        if ($LASTEXITCODE -ne 0) { throw 'Native tests failed.' }
    }
} finally {
    Pop-Location
}
