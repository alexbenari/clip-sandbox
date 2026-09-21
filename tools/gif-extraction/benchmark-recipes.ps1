[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'media-proof-common.ps1')

$tools = Resolve-GifExtractionMediaTools
$fixtureRoot = Assert-GifExtractionPathInside -Path (Join-Path $tools.RepoRoot 'tests\fixtures\gif-extraction\generated') -Root $tools.RepoRoot
[void](New-Item -ItemType Directory -Force -Path $fixtureRoot)
$sourcePath = Assert-GifExtractionPathInside -Path (Join-Path $fixtureRoot 'benchmark-long-gop.mp4') -Root $fixtureRoot

[void](Invoke-GifExtractionTool -Executable $tools.Ffmpeg -Environment $tools.Environment -TimeoutMs 300000 -Arguments @(
    '-y', '-v', 'error',
    '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=24:duration=60',
    '-f', 'lavfi', '-i', 'sine=frequency=997:sample_rate=48000:duration=60',
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-g', '240', '-keyint_min', '240', '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', '192k', '-shortest',
    $sourcePath
))

$startFrame = 1320
$endFrame = 1343
$sourceStartTime = '55'
$sourceEndTime = '56'

function Invoke-BenchmarkRecipe {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$SeekArguments,
        [Parameter(Mandatory = $true)][int]$RelativeStartFrame,
        [Parameter(Mandatory = $true)][int]$RelativeEndFrame
    )

    $videoOnlyPath = Assert-GifExtractionPathInside -Path (Join-Path $fixtureRoot "benchmark-$Name-video-only.mp4") -Root $fixtureRoot
    $outputPath = Assert-GifExtractionPathInside -Path (Join-Path $fixtureRoot "benchmark-$Name.mp4") -Root $fixtureRoot
    $videoArguments = @('-y', '-v', 'error', '-noautorotate') + $SeekArguments + @(
        '-i', $sourcePath,
        '-map', '0:v:0', '-an',
        '-vf', "select='between(n\,$RelativeStartFrame\,$RelativeEndFrame)',setpts=PTS-STARTPTS",
        '-fps_mode', 'passthrough',
        '-c:v', 'libx264rgb', '-crf', '0', '-preset', 'ultrafast', '-pix_fmt', 'rgb24',
        $videoOnlyPath
    )

    $totalTimer = [Diagnostics.Stopwatch]::StartNew()
    $videoTimer = [Diagnostics.Stopwatch]::StartNew()
    try {
        [void](Invoke-GifExtractionTool -Executable $tools.Ffmpeg -Environment $tools.Environment -TimeoutMs 300000 -Arguments $videoArguments)
        $videoTimer.Stop()
        [void](Invoke-GifExtractionTool -Executable $tools.ModernFfmpeg -Environment $tools.Environment -TimeoutMs 300000 -Arguments @(
            '-y', '-v', 'error', '-copyts',
            '-i', $videoOnlyPath,
            '-i', $sourcePath,
            '-map', '0:v:0', '-map', '1:a:0',
            '-af', "atrim=start=$sourceStartTime`:end=$sourceEndTime,asetpts=PTS-STARTPTS",
            '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
            $outputPath
        ))
        $totalTimer.Stop()
    } finally {
        if ($videoTimer.IsRunning) { $videoTimer.Stop() }
        if ($totalTimer.IsRunning) { $totalTimer.Stop() }
        if (Test-Path -LiteralPath $videoOnlyPath) { Remove-Item -LiteralPath $videoOnlyPath -Force }
    }

    return [ordered]@{
        name = $Name
        videoStageMs = $videoTimer.ElapsedMilliseconds
        totalMs = $totalTimer.ElapsedMilliseconds
        outputPath = $outputPath
    }
}

$sourceDescription = Get-GifExtractionMediaDescription -Tools $tools -Path $sourcePath
if ($sourceDescription.VideoFrames.Count -ne 1440) {
    throw "Benchmark source frame count changed: $($sourceDescription.VideoFrames.Count)"
}
$sourceHashes = @(Get-GifExtractionFrameHashes -Tools $tools -Path $sourcePath)
$expectedHashes = @($sourceHashes[$startFrame..$endFrame])
$audioTools = [pscustomobject]@{ Ffmpeg = $tools.ModernFfmpeg; Environment = $tools.Environment }
$referenceAudio = Get-GifExtractionAudioFingerprint -Tools $audioTools -Path $sourcePath -ScratchPath (Join-Path $fixtureRoot 'benchmark-reference.pcm') -SampleRate 48000 -AudioFilter 'atrim=start=55:end=56,asetpts=PTS-STARTPTS' -PreserveInputTimestamps -IncludeSamples

$recipes = @(
    Invoke-BenchmarkRecipe -Name 'full-decode' -SeekArguments @() -RelativeStartFrame $startFrame -RelativeEndFrame $endFrame
    Invoke-BenchmarkRecipe -Name 'coarse-seek' -SeekArguments @('-ss', '50') -RelativeStartFrame 120 -RelativeEndFrame 143
)

foreach ($recipe in $recipes) {
    $actualHashes = @(Get-GifExtractionFrameHashes -Tools $tools -Path $recipe['outputPath'])
    $recipe['frameCount'] = $actualHashes.Count
    $recipe['exactVideo'] = ($actualHashes.Count -eq $expectedHashes.Count)
    if ($recipe['exactVideo']) {
        for ($index = 0; $index -lt $expectedHashes.Count; $index += 1) {
            if ($actualHashes[$index] -ne $expectedHashes[$index]) {
                $recipe['exactVideo'] = $false
                break
            }
        }
    }
    $audio = Get-GifExtractionAudioFingerprint -Tools $audioTools -Path $recipe['outputPath'] -ScratchPath (Join-Path $fixtureRoot "benchmark-$($recipe['name']).pcm") -SampleRate 48000 -IncludeSamples
    $recipe['audioSamples'] = $audio.SampleCount
    $recipe['audioBoundaryDifferenceSamples'] = [Math]::Abs($audio.SampleCount - $referenceAudio.SampleCount)
    [double]$referenceEnergy = 0
    [double]$actualEnergy = 0
    [double]$cross = 0
    $comparisonCount = [Math]::Min($referenceAudio.Samples.Count, $audio.Samples.Count)
    if ($comparisonCount -eq 0) { throw "Benchmark recipe $($recipe['name']) produced no comparable audio samples." }
    for ($index = 0; $index -lt $comparisonCount; $index += 1) {
        [double]$referenceSample = $referenceAudio.Samples[$index]
        [double]$actualSample = $audio.Samples[$index]
        $referenceEnergy += $referenceSample * $referenceSample
        $actualEnergy += $actualSample * $actualSample
        $cross += $referenceSample * $actualSample
    }
    $recipe['audioCorrelation'] = $cross / [Math]::Sqrt($referenceEnergy * $actualEnergy)
    $recipe['audioContentPass'] = ($recipe['audioBoundaryDifferenceSamples'] -le 1 -and $recipe['audioCorrelation'] -ge 0.999)
    $recipe.Remove('outputPath')
}

$result = [ordered]@{
    schemaVersion = 1
    source = [ordered]@{
        durationSeconds = 60
        width = 1280
        height = 720
        frameRate = 24
        frameCount = 1440
        gopFrames = 240
        startFrame = $startFrame
        endFrame = $endFrame
    }
    recipes = $recipes
}
$resultPath = Join-Path $fixtureRoot 'benchmark-results.json'
Write-GifExtractionJson -Path $resultPath -Value $result
$result | ConvertTo-Json -Depth 10
