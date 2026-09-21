Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$toolRoot = $PSScriptRoot
$repositoryRoot = Split-Path -Parent (Split-Path -Parent $toolRoot)
$resolvedPath = Join-Path $toolRoot '.deps\resolved-dependencies.json'
if (-not (Test-Path -LiteralPath $resolvedPath)) {
    throw 'Resolved frame-review dependencies are missing. Run npm run frame-review:bootstrap first.'
}

node (Join-Path $toolRoot 'verify-dependencies.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Frame-review dependency verification failed.' }
$resolved = Get-Content -LiteralPath $resolvedPath -Raw | ConvertFrom-Json
$sourceRoot = Join-Path $repositoryRoot 'native\frame-review'
$buildRoot = Join-Path $repositoryRoot 'native-build\frame-review'
$sourceRootCygwin = (& $resolved.cmake.cygpathPath -u $sourceRoot).Trim()
$buildRootCygwin = (& $resolved.cmake.cygpathPath -u $buildRoot).Trim()
$depsRootCygwin = (& $resolved.cmake.cygpathPath -u (Join-Path $toolRoot '.deps')).Trim()

& $resolved.cmake.path -S $sourceRootCygwin -B $buildRootCygwin -G 'Unix Makefiles' `
    "-DCMAKE_BUILD_TYPE=Release" `
    '-DCMAKE_CXX_COMPILER=/usr/bin/x86_64-w64-mingw32-g++.exe' `
    "-DCMAKE_MAKE_PROGRAM=/usr/bin/make.exe" `
    "-DFRAME_REVIEW_DEPS_ROOT=$depsRootCygwin"
if ($LASTEXITCODE -ne 0) { throw 'Frame-review CMake configure failed.' }

& $resolved.cmake.path --build $buildRootCygwin --parallel 8
if ($LASTEXITCODE -ne 0) { throw 'Frame-review native build failed.' }

node (Join-Path $toolRoot 'verify-native-products.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Frame-review native product verification failed.' }
Write-Output "Frame-review native products are ready under $buildRoot."
