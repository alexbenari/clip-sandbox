param(
    [string]$Triplet = 'x64-mingw-release',
    [string]$FfmpegRoot = '',
    [string]$XxhashRoot = ''
)

$ErrorActionPreference = 'Stop'
$spikeRoot = Split-Path -Parent $PSScriptRoot
$depsRoot = Join-Path $spikeRoot '.deps'
$bestSourceRoot = Join-Path $depsRoot 'bestsource-install'
$installedRoot = Join-Path $depsRoot 'vcpkg-installed'
$compiler = 'C:\cygwin64\bin\x86_64-w64-mingw32-g++.exe'
$outputRoot = Join-Path $spikeRoot 'build\bestsource-gate'

if (-not $FfmpegRoot) { $FfmpegRoot = Join-Path $installedRoot $Triplet }
if (-not $XxhashRoot) { $XxhashRoot = Join-Path $installedRoot $Triplet }

$required = @(
    $compiler,
    (Join-Path $bestSourceRoot 'include\bestsource\videosource.h'),
    (Join-Path $bestSourceRoot 'lib\libbestsource.dll.a'),
    (Join-Path $FfmpegRoot 'include\libavcodec\avcodec.h'),
    (Join-Path $FfmpegRoot 'lib\libavcodec.dll.a'),
    (Join-Path $XxhashRoot 'lib\libxxhash.dll.a')
)
foreach ($path in $required) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Required native input is missing: $path" }
}

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
$common = Join-Path $spikeRoot 'native\common\frame_code.cpp'
$gate = Join-Path $spikeRoot 'native\bestsource-gate\bestsource_gate.cpp'
$operationRunner = Join-Path $spikeRoot 'native\bestsource-gate\operation_runner.cpp'
$preparedSession = Join-Path $spikeRoot 'native\bestsource-gate\prepared_video_session.cpp'
$baseline = Join-Path $spikeRoot 'native\bestsource-gate\direct_libav_baseline.cpp'
$packetScan = Join-Path $spikeRoot 'native\bestsource-gate\media_packet_scan.cpp'
$sampleSignature = Join-Path $spikeRoot 'native\bestsource-gate\media_sample_signature.cpp'
$indexCompare = Join-Path $spikeRoot 'native\bestsource-gate\index_compare.cpp'
$protocol = Join-Path $spikeRoot 'native\common\protocol.cpp'
$protocolTests = Join-Path $spikeRoot 'native\common\protocol_tests.cpp'
$mediaService = Join-Path $spikeRoot 'native\media-service\bestsource_media_service.cpp'
$includes = @(
    "-I$(Join-Path $spikeRoot 'native\common')",
    "-I$(Join-Path $spikeRoot 'native\bestsource-gate')",
    "-I$(Join-Path $bestSourceRoot 'include')",
    "-I$(Join-Path $FfmpegRoot 'include')"
)
$libraryPaths = @(
    "-L$(Join-Path $bestSourceRoot 'lib')",
    "-L$(Join-Path $FfmpegRoot 'lib')",
    "-L$(Join-Path $XxhashRoot 'lib')"
)
$commonFlags = @('-std=c++17', '-O2', '-Wall', '-Wextra', '-municode')
$consoleFlags = @('-std=c++17', '-O2', '-Wall', '-Wextra')

& $compiler @commonFlags @includes $gate $operationRunner $preparedSession $common @libraryPaths `
    '-lbestsource' '-lswscale' '-lavformat' '-lavcodec' '-lavutil' '-lxxhash' '-lpsapi' `
    '-o' (Join-Path $outputRoot 'bestsource_gate.exe')
if ($LASTEXITCODE -ne 0) { throw 'Failed to compile bestsource_gate.exe' }

& $compiler @commonFlags @includes $baseline @libraryPaths `
    '-lavformat' '-lavcodec' '-lavutil' `
    '-o' (Join-Path $outputRoot 'direct_libav_baseline.exe')
if ($LASTEXITCODE -ne 0) { throw 'Failed to compile direct_libav_baseline.exe' }

& $compiler @commonFlags @includes $packetScan @libraryPaths `
    '-lavformat' '-lavcodec' '-lavutil' `
    '-o' (Join-Path $outputRoot 'media_packet_scan.exe')
if ($LASTEXITCODE -ne 0) { throw 'Failed to compile media_packet_scan.exe' }

& $compiler @commonFlags @includes $sampleSignature @libraryPaths `
    '-lavformat' '-lavcodec' '-lavutil' `
    '-o' (Join-Path $outputRoot 'media_sample_signature.exe')
if ($LASTEXITCODE -ne 0) { throw 'Failed to compile media_sample_signature.exe' }

& $compiler @commonFlags @includes $indexCompare @libraryPaths `
    '-lbestsource' '-lavformat' '-lavcodec' '-lavutil' '-lxxhash' `
    '-o' (Join-Path $outputRoot 'index_compare.exe')
if ($LASTEXITCODE -ne 0) { throw 'Failed to compile index_compare.exe' }

& $compiler @consoleFlags @includes $protocol $protocolTests `
    '-o' (Join-Path $outputRoot 'protocol_tests.exe')
if ($LASTEXITCODE -ne 0) { throw 'Failed to compile protocol_tests.exe' }

& $compiler @consoleFlags @includes $mediaService $preparedSession $protocol @libraryPaths `
    '-lbestsource' '-lswscale' '-lavformat' '-lavcodec' '-lavutil' '-lxxhash' `
    '-o' (Join-Path $outputRoot 'bestsource_media_service.exe')
if ($LASTEXITCODE -ne 0) { throw 'Failed to compile bestsource_media_service.exe' }

Write-Host "Built BestSource gate harnesses in $outputRoot"
