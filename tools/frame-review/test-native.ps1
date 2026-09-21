Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$toolRoot = $PSScriptRoot
$repositoryRoot = Split-Path -Parent (Split-Path -Parent $toolRoot)
$resolvedPath = Join-Path $toolRoot '.deps\resolved-dependencies.json'
if (-not (Test-Path -LiteralPath $resolvedPath)) {
    throw 'Resolved frame-review dependencies are missing. Run npm run frame-review:bootstrap first.'
}
$resolved = Get-Content -LiteralPath $resolvedPath -Raw | ConvertFrom-Json
$buildRoot = Join-Path $repositoryRoot 'native-build\frame-review'
if (-not (Test-Path -LiteralPath (Join-Path $buildRoot 'CTestTestfile.cmake'))) {
    throw 'Frame-review native products are missing. Run npm run frame-review:build first.'
}

node --test (Join-Path $toolRoot 'tests\toolchain-contract.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Frame-review toolchain contract tests failed.' }
node (Join-Path $toolRoot 'verify-dependencies.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Frame-review dependency verification failed.' }
node (Join-Path $toolRoot 'verify-native-products.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Frame-review native product verification failed.' }

$ctest = $resolved.cmake.ctestPath
if (-not (Test-Path -LiteralPath $ctest)) { throw "CTest is missing at $ctest." }
$env:PATH = "$($resolved.compiler.runtimeDllRoot);$($resolved.ffmpeg.runtimeDllRoot);$($resolved.bestsource.root)\bin;$env:PATH"
$buildRootCygwin = (& $resolved.cmake.cygpathPath -u $buildRoot).Trim()
& $ctest --test-dir $buildRootCygwin --output-on-failure
if ($LASTEXITCODE -ne 0) { throw 'Frame-review native tests failed.' }
node --test (Join-Path $toolRoot 'tests\native-service-contract.test.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Frame-review native service contract tests failed.' }
