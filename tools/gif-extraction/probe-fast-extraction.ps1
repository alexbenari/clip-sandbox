[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'media-proof-common.ps1')

$tools = Resolve-GifExtractionMediaTools
$root = Assert-GifExtractionPathInside -Path (Join-Path $tools.RepoRoot 'tests\fixtures\gif-extraction\generated') -Root $tools.RepoRoot
$source = Assert-GifExtractionPathInside -Path (Join-Path $root 'benchmark-long-gop.mp4') -Root $root
if (-not (Test-Path -LiteralPath $source)) {
    throw 'Create the long-GOP benchmark fixture with benchmark-recipes.ps1 first.'
}

$output = Assert-GifExtractionPathInside -Path (Join-Path $root 'probe-fast-extraction-video.mp4') -Root $root
$startFrame = 1320
$endFrame = 1343
$expectedCount = $endFrame - $startFrame + 1
$timer = [Diagnostics.Stopwatch]::StartNew()
$result = Invoke-GifExtractionTool -Executable $tools.Ffmpeg -Environment $tools.Environment -TimeoutMs 300000 -Arguments @(
    '-hide_banner', '-nostdin', '-y', '-noautorotate',
    '-ss', '50', '-t', '8', '-copyts', '-i', $source, '-map', '0:v:0', '-an',
    '-vf', "select='gte(t,55)*lt(t,56)',showinfo,setpts=PTS-STARTPTS",
    '-frames:v', [string]$expectedCount, '-fps_mode', 'passthrough',
    '-c:v', 'libx264rgb', '-crf', '0', '-preset', 'ultrafast', '-pix_fmt', 'rgb24',
    $output
)
$timer.Stop()

$sourceHashes = @(Get-GifExtractionFrameHashes -Tools $tools -Path $source)
$outputHashes = @(Get-GifExtractionFrameHashes -Tools $tools -Path $output)
$reference = @($sourceHashes[$startFrame..$endFrame])
$matched = $outputHashes.Count -eq $expectedCount
if ($matched) {
    for ($i = 0; $i -lt $expectedCount; $i += 1) {
        if ($reference[$i] -ne $outputHashes[$i]) { $matched = $false; break }
    }
}
$selectedPts = @([regex]::Matches($result.Stderr, 'Parsed_showinfo.*?\bn:\s*\d+\s+pts:\s*(-?\d+)') |
    ForEach-Object { [string]$_.Groups[1].Value })
$baselineOutput = Assert-GifExtractionPathInside -Path (Join-Path $root 'probe-full-decode-video.mp4') -Root $root
$baselineTimer = [Diagnostics.Stopwatch]::StartNew()
[void](Invoke-GifExtractionTool -Executable $tools.Ffmpeg -Environment $tools.Environment -TimeoutMs 300000 -Arguments @(
    '-hide_banner', '-nostdin', '-y', '-noautorotate', '-i', $source, '-map', '0:v:0', '-an',
    '-vf', "select='between(n,$startFrame,$endFrame)',setpts=PTS-STARTPTS",
    '-fps_mode', 'passthrough', '-c:v', 'libx264rgb', '-crf', '0', '-preset', 'ultrafast', '-pix_fmt', 'rgb24',
    $baselineOutput
))
$baselineTimer.Stop()
$baselineHashes = @(Get-GifExtractionFrameHashes -Tools $tools -Path $baselineOutput)
$baselineMatched = $baselineHashes.Count -eq $expectedCount
if ($baselineMatched) {
    for ($i = 0; $i -lt $expectedCount; $i += 1) {
        if ($reference[$i] -ne $baselineHashes[$i]) { $baselineMatched = $false; break }
    }
}
$mediaOutput = Assert-GifExtractionPathInside -Path (Join-Path $root 'probe-fast-extraction-media.mp4') -Root $root
[void](Invoke-GifExtractionTool -Executable $tools.Ffmpeg -Environment $tools.Environment -TimeoutMs 300000 -Arguments @(
    '-hide_banner', '-nostdin', '-y', '-copyts', '-i', $output, '-ss', '50', '-i', $source,
    '-map', '0:v:0', '-map', '1:a:0', '-filter:a', 'atrim=start=55:end=56,asetpts=PTS-STARTPTS',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', $mediaOutput
))
$audioTools = [pscustomobject]@{ Ffmpeg = $tools.Ffmpeg; Environment = $tools.Environment }
$referenceAudio = Get-GifExtractionAudioFingerprint -Tools $audioTools -Path $source -ScratchPath (Join-Path $root 'probe-reference.pcm') -SampleRate 48000 -AudioFilter 'atrim=start=55:end=56,asetpts=PTS-STARTPTS' -PreserveInputTimestamps -IncludeSamples
$candidateAudio = Get-GifExtractionAudioFingerprint -Tools $audioTools -Path $mediaOutput -ScratchPath (Join-Path $root 'probe-candidate.pcm') -SampleRate 48000 -IncludeSamples
[double]$cross = 0
[double]$referenceEnergy = 0
[double]$candidateEnergy = 0
for ($i = 0; $i -lt [Math]::Min($referenceAudio.Samples.Count, $candidateAudio.Samples.Count); $i += 1) {
    [double]$a = $referenceAudio.Samples[$i]
    [double]$b = $candidateAudio.Samples[$i]
    $cross += $a * $b
    $referenceEnergy += $a * $a
    $candidateEnergy += $b * $b
}
$audioCorrelation = $cross / [Math]::Sqrt($referenceEnergy * $candidateEnergy)
$evidence = [ordered]@{
    fixture = 'benchmark-long-gop.mp4'
    startFrame = $startFrame
    endFrame = $endFrame
    selectedFrames = $outputHashes.Count
    exactFrameHashMatch = $matched
    baselineFrameHashMatch = $baselineMatched
    selectedPts = $selectedPts
    candidateElapsedMs = [math]::Round($timer.Elapsed.TotalMilliseconds, 1)
    baselineElapsedMs = [math]::Round($baselineTimer.Elapsed.TotalMilliseconds, 1)
    audioSamples = $candidateAudio.SampleCount
    audioReferenceSamples = $referenceAudio.SampleCount
    audioCorrelation = $audioCorrelation
}
$evidencePath = Assert-GifExtractionPathInside -Path (Join-Path $root 'probe-fast-extraction-result.json') -Root $root
Write-GifExtractionJson -Path $evidencePath -Value $evidence
if (-not $matched -or -not $baselineMatched -or $selectedPts.Count -lt $expectedCount -or
    $candidateAudio.SampleCount -ne $referenceAudio.SampleCount -or $audioCorrelation -lt 0.999) {
    throw "Fast extraction proof failed; inspect $evidencePath"
}
Write-Output "Fast extraction proof passed: $expectedCount frames, $($evidence.candidateElapsedMs) ms. Evidence: $evidencePath"
