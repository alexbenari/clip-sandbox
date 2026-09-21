[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'media-proof-common.ps1')

function Invoke-FixtureEncode {
    param(
        [Parameter(Mandatory = $true)]$Tools,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$OutputPath
    )

    Write-Host "Creating $(Split-Path -Leaf $OutputPath)..."
    $commandArguments = @('-y', '-v', 'error') + $Arguments + @($OutputPath)
    [void](Invoke-GifExtractionTool -Executable $Tools.Ffmpeg -Environment $Tools.Environment -TimeoutMs 180000 -Arguments $commandArguments)
}

function Get-FixtureFrameTimestamp {
    param(
        [Parameter(Mandatory = $true)]$Frame,
        [Parameter(Mandatory = $true)][string]$Label
    )

    if ($null -eq $Frame.best_effort_timestamp_time) {
        throw "$Label has no presentation timestamp."
    }
    return Convert-GifExtractionSeconds -Value $Frame.best_effort_timestamp_time
}

function New-FixtureManifestEntry {
    param(
        [Parameter(Mandatory = $true)]$Tools,
        [Parameter(Mandatory = $true)][string]$FixtureRoot,
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][string]$SourceRelativePath,
        [Parameter(Mandatory = $true)][string]$ReviewRelativePath,
        [Parameter(Mandatory = $true)][int]$StartFrame,
        [Parameter(Mandatory = $true)][int]$EndFrame,
        [bool]$RequiresTimestampRepair = $false
    )

    $sourcePath = Assert-GifExtractionPathInside -Path (Join-Path $FixtureRoot $SourceRelativePath) -Root $FixtureRoot
    $reviewPath = Assert-GifExtractionPathInside -Path (Join-Path $FixtureRoot $ReviewRelativePath) -Root $FixtureRoot
    $source = Get-GifExtractionMediaDescription -Tools $Tools -Path $sourcePath
    $review = Get-GifExtractionMediaDescription -Tools $Tools -Path $reviewPath
    if ($EndFrame + 1 -ge $source.VideoFrames.Count) {
        throw "$Id range needs a following frame to define the inclusive end boundary."
    }
    if ($null -eq $source.AudioStream) {
        throw "$Id must contain audio."
    }
    $sourceHashes = @(Get-GifExtractionFrameHashes -Tools $Tools -Path $sourcePath)
    $reviewHashes = @(Get-GifExtractionFrameHashes -Tools $Tools -Path $reviewPath)
    if (($sourceHashes -join ',') -ne ($reviewHashes -join ',')) {
        throw "$Id review derivative does not preserve source-frame ordinal identity."
    }

    $sourceStartTime = Get-FixtureFrameTimestamp -Frame $source.VideoFrames[$StartFrame] -Label "$Id start frame"
    $sourceEndTime = Get-FixtureFrameTimestamp -Frame $source.VideoFrames[$EndFrame + 1] -Label "$Id following frame"
    $reviewStartTime = Get-FixtureFrameTimestamp -Frame $review.VideoFrames[$StartFrame] -Label "$Id review start frame"
    if ($RequiresTimestampRepair -and $sourceStartTime -eq $reviewStartTime) {
        throw "$Id does not exhibit the required repaired/original timestamp difference."
    }

    return [ordered]@{
        id = $Id
        source = $SourceRelativePath.Replace('\', '/')
        reviewSource = $ReviewRelativePath.Replace('\', '/')
        requiresTimestampRepair = $RequiresTimestampRepair
        expectedFailure = $null
        selectedRange = [ordered]@{
            startFrame = $StartFrame
            endFrame = $EndFrame
        }
        expected = [ordered]@{
            width = [int]$source.VideoStream.width
            height = [int]$source.VideoStream.height
            sourceFrameCount = $source.VideoFrames.Count
            reviewFrameCount = $review.VideoFrames.Count
            sourceStartTime = $sourceStartTime
            sourceEndTime = $sourceEndTime
            reviewStartTime = $reviewStartTime
            audioSampleRate = [int]$source.AudioStream.sample_rate
            selectedFrameHashes = @($sourceHashes[$StartFrame..$EndFrame])
        }
    }
}

$tools = Resolve-GifExtractionMediaTools
$fixtureRoot = Join-Path $tools.RepoRoot 'tests\fixtures\gif-extraction'
$generatedRoot = Assert-GifExtractionPathInside -Path (Join-Path $fixtureRoot 'generated') -Root $fixtureRoot
[void](New-Item -ItemType Directory -Force -Path $generatedRoot)

$cfrSource = Join-Path $generatedRoot 'cfr-audio.mkv'
Invoke-FixtureEncode -Tools $tools -OutputPath $cfrSource -Arguments @(
    '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24:duration=3',
    '-f', 'lavfi', '-i', 'sine=frequency=997:sample_rate=48000:duration=3',
    '-map', '0:v:0', '-map', '1:a:0',
    '-frames:v', '72', '-c:v', 'ffv1', '-level', '3', '-pix_fmt', 'yuv444p',
    '-c:a', 'pcm_s16le', '-shortest'
)

$vfrSource = Join-Path $generatedRoot 'vfr-audio.mkv'
Invoke-FixtureEncode -Tools $tools -OutputPath $vfrSource -Arguments @(
    '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24:duration=3',
    '-f', 'lavfi', '-i', 'sine=frequency=733:sample_rate=48000:duration=5',
    '-map', '0:v:0', '-map', '1:a:0',
    '-frames:v', '72', '-vf', 'setpts=(N+floor(N/3))/(24*TB)',
    '-vsync', 'vfr', '-c:v', 'ffv1', '-level', '3', '-pix_fmt', 'yuv444p',
    '-c:a', 'pcm_s16le', '-shortest'
)

$timestampSource = Join-Path $generatedRoot 'timestamp-repair-source.mkv'
Invoke-FixtureEncode -Tools $tools -OutputPath $timestampSource -Arguments @(
    '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24:duration=3',
    '-f', 'lavfi', '-i', 'sine=frequency=587:sample_rate=48000:duration=3',
    '-map', '0:v:0', '-map', '1:a:0',
    '-frames:v', '72', '-output_ts_offset', '5',
    '-c:v', 'ffv1', '-level', '3', '-pix_fmt', 'yuv444p',
    '-c:a', 'pcm_s16le', '-shortest'
)

$timestampReview = Join-Path $generatedRoot 'timestamp-repair-normalized.mkv'
Invoke-FixtureEncode -Tools $tools -OutputPath $timestampReview -Arguments @(
    '-i', $timestampSource,
    '-map', '0:v:0', '-map', '0:a:0',
    '-vf', 'setpts=PTS-STARTPTS', '-af', 'asetpts=PTS-STARTPTS',
    '-c:v', 'ffv1', '-level', '3', '-pix_fmt', 'yuv444p',
    '-c:a', 'pcm_s16le'
)

$oddSource = Join-Path $generatedRoot 'odd-dimensions-audio.mkv'
Invoke-FixtureEncode -Tools $tools -OutputPath $oddSource -Arguments @(
    '-f', 'lavfi', '-i', 'testsrc=size=321x181:rate=24:duration=3',
    '-f', 'lavfi', '-i', 'sine=frequency=439:sample_rate=48000:duration=3',
    '-map', '0:v:0', '-map', '1:a:0',
    '-frames:v', '72', '-c:v', 'ffv1', '-level', '3', '-pix_fmt', 'yuv444p',
    '-c:a', 'pcm_s16le', '-shortest'
)

$noAudioSource = Join-Path $generatedRoot 'no-audio.mkv'
Invoke-FixtureEncode -Tools $tools -OutputPath $noAudioSource -Arguments @(
    '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24:duration=2',
    '-frames:v', '48', '-c:v', 'ffv1', '-level', '3', '-pix_fmt', 'yuv444p'
)

$entries = @(
    (New-FixtureManifestEntry -Tools $tools -FixtureRoot $fixtureRoot -Id 'cfr-audio' -SourceRelativePath 'generated/cfr-audio.mkv' -ReviewRelativePath 'generated/cfr-audio.mkv' -StartFrame 8 -EndFrame 23),
    (New-FixtureManifestEntry -Tools $tools -FixtureRoot $fixtureRoot -Id 'vfr-audio' -SourceRelativePath 'generated/vfr-audio.mkv' -ReviewRelativePath 'generated/vfr-audio.mkv' -StartFrame 7 -EndFrame 19),
    (New-FixtureManifestEntry -Tools $tools -FixtureRoot $fixtureRoot -Id 'timestamp-repair' -SourceRelativePath 'generated/timestamp-repair-source.mkv' -ReviewRelativePath 'generated/timestamp-repair-normalized.mkv' -StartFrame 5 -EndFrame 15 -RequiresTimestampRepair $true),
    (New-FixtureManifestEntry -Tools $tools -FixtureRoot $fixtureRoot -Id 'odd-dimensions-audio' -SourceRelativePath 'generated/odd-dimensions-audio.mkv' -ReviewRelativePath 'generated/odd-dimensions-audio.mkv' -StartFrame 3 -EndFrame 11),
    [ordered]@{
        id = 'no-audio'
        source = 'generated/no-audio.mkv'
        reviewSource = 'generated/no-audio.mkv'
        requiresTimestampRepair = $false
        expectedFailure = 'missing-audio'
        selectedRange = [ordered]@{ startFrame = 4; endFrame = 8 }
    }
)

$manifest = [ordered]@{
    schemaVersion = 1
    generator = 'tools/gif-extraction/create-fixtures.ps1'
    sourcePattern = 'deterministic FFmpeg testsrc video with synthetic sine audio'
    fixtures = $entries
}
$manifestPath = Join-Path $fixtureRoot 'manifest.json'
Write-GifExtractionJson -Path $manifestPath -Value $manifest
Write-Host "GIF_EXTRACTION_FIXTURES_READY ($($entries.Count) fixture(s))"
