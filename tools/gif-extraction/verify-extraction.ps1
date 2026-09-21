[CmdletBinding()]
param(
    [switch]$All,
    [string]$FixtureId = '',
    [string]$Runtime = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'media-proof-common.ps1')

function Assert-ProofEqual {
    param(
        [Parameter(Mandatory = $true)]$Actual,
        [Parameter(Mandatory = $true)]$Expected,
        [Parameter(Mandatory = $true)][string]$Message
    )

    if ($Actual -ne $Expected) {
        throw "$Message Expected '$Expected', got '$Actual'."
    }
}

function Assert-ProofSequenceEqual {
    param(
        [Parameter(Mandatory = $true)][object[]]$Actual,
        [Parameter(Mandatory = $true)][object[]]$Expected,
        [Parameter(Mandatory = $true)][string]$Message
    )

    Assert-ProofEqual -Actual $Actual.Count -Expected $Expected.Count -Message "$Message count differs."
    for ($index = 0; $index -lt $Expected.Count; $index += 1) {
        Assert-ProofEqual -Actual $Actual[$index] -Expected $Expected[$index] -Message "$Message at index $index differs."
    }
}

function Resolve-ProofFixturePath {
    param(
        [Parameter(Mandatory = $true)][string]$FixtureRoot,
        [Parameter(Mandatory = $true)][string]$RelativePath
    )

    if ([IO.Path]::IsPathRooted($RelativePath)) {
        throw "Fixture manifest paths must be relative: $RelativePath"
    }
    return Assert-GifExtractionPathInside -Path (Join-Path $FixtureRoot $RelativePath) -Root $FixtureRoot
}

function Get-ProofFrameTimestamp {
    param(
        [Parameter(Mandatory = $true)]$Frame,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $value = $Frame.best_effort_timestamp_time
    if ($null -eq $value -or [string]::IsNullOrWhiteSpace([string]$value)) {
        throw "$Label has no original presentation timestamp."
    }
    return Convert-GifExtractionSeconds -Value $value
}

function Assert-ProofBestSourceIdentity {
    param(
        [Parameter(Mandatory = $true)]$BestSourceFrames,
        [Parameter(Mandatory = $true)]$ReviewDescription,
        [Parameter(Mandatory = $true)][int[]]$Ordinals,
        [Parameter(Mandatory = $true)][string]$FixtureId
    )

    for ($index = 0; $index -lt $Ordinals.Count; $index += 1) {
        $ordinal = $Ordinals[$index]
        $bestSource = $BestSourceFrames[$index]
        $probeFrame = $ReviewDescription.VideoFrames[$ordinal]
        $probeTimebase = ([string]$ReviewDescription.VideoStream.time_base).Split('/')
        Assert-ProofEqual -Actual ([int]$bestSource.requestedFrame) -Expected $ordinal -Message "$FixtureId BestSource ordinal differs."
        Assert-ProofEqual -Actual ([string]$bestSource.pts) -Expected ([string]$probeFrame.best_effort_timestamp) -Message "$FixtureId BestSource PTS differs."
        Assert-ProofEqual -Actual ([int]$bestSource.timebase.numerator) -Expected ([int]$probeTimebase[0]) -Message "$FixtureId BestSource timebase numerator differs."
        Assert-ProofEqual -Actual ([int]$bestSource.timebase.denominator) -Expected ([int]$probeTimebase[1]) -Message "$FixtureId BestSource timebase denominator differs."
    }
}

function Assert-ProofOutputVideo {
    param(
        [Parameter(Mandatory = $true)]$Tools,
        [Parameter(Mandatory = $true)][string]$OutputPath,
        [Parameter(Mandatory = $true)]$SourceDescription,
        [Parameter(Mandatory = $true)][object[]]$ExpectedHashes,
        [Parameter(Mandatory = $true)][string]$FixtureId
    )

    $outputDescription = Get-GifExtractionMediaDescription -Tools $Tools -Path $OutputPath
    Assert-ProofEqual -Actual ([int]$outputDescription.VideoStream.width) -Expected ([int]$SourceDescription.VideoStream.width) -Message "$FixtureId output width differs."
    Assert-ProofEqual -Actual ([int]$outputDescription.VideoStream.height) -Expected ([int]$SourceDescription.VideoStream.height) -Message "$FixtureId output height differs."
    Assert-ProofEqual -Actual ([string]$outputDescription.VideoStream.codec_name) -Expected 'h264' -Message "$FixtureId output video codec differs."
    Assert-ProofEqual -Actual ([string]$outputDescription.AudioStream.codec_name) -Expected 'aac' -Message "$FixtureId output audio codec differs."

    $outputHashes = @(Get-GifExtractionFrameHashes -Tools $Tools -Path $OutputPath)
    Assert-ProofSequenceEqual -Actual $outputHashes -Expected $ExpectedHashes -Message "$FixtureId decoded frame identity"
    return $outputDescription
}

function Get-ProofAudioSimilarity {
    param(
        [Parameter(Mandatory = $true)][int16[]]$Reference,
        [Parameter(Mandatory = $true)][int16[]]$Actual
    )

    $count = [Math]::Min($Reference.Length, $Actual.Length)
    if ($count -eq 0) { throw 'Audio similarity requires decoded samples.' }
    [double]$referenceEnergy = 0
    [double]$actualEnergy = 0
    [double]$cross = 0
    [double]$differenceEnergy = 0
    for ($index = 0; $index -lt $count; $index += 1) {
        [double]$referenceSample = $Reference[$index]
        [double]$actualSample = $Actual[$index]
        $referenceEnergy += $referenceSample * $referenceSample
        $actualEnergy += $actualSample * $actualSample
        $cross += $referenceSample * $actualSample
        $difference = $referenceSample - $actualSample
        $differenceEnergy += $difference * $difference
    }
    if ($referenceEnergy -le 0 -or $actualEnergy -le 0) { throw 'Audio similarity cannot compare silent samples.' }

    return [pscustomobject]@{
        Correlation = $cross / [Math]::Sqrt($referenceEnergy * $actualEnergy)
        NormalizedRootMeanSquareError = [Math]::Sqrt($differenceEnergy / $referenceEnergy)
    }
}

function Invoke-ProofExtraction {
    param(
        [Parameter(Mandatory = $true)]$Tools,
        [Parameter(Mandatory = $true)][string]$SourcePath,
        [Parameter(Mandatory = $true)][string]$OutputPath,
        [Parameter(Mandatory = $true)][int]$StartFrame,
        [Parameter(Mandatory = $true)][int]$EndFrame,
        [Parameter(Mandatory = $true)][string]$SourceStartTime,
        [Parameter(Mandatory = $true)][string]$SourceEndTime,
        [string]$RuntimePath = '',
        [string]$CollectionName = ''
    )

    if (-not [string]::IsNullOrWhiteSpace($RuntimePath)) {
        $pipelinesRoot = Assert-GifExtractionPathInside -Path (Join-Path (Split-Path -Parent $OutputPath) 'production-runtime') -Root (Split-Path -Parent $OutputPath)
        [void](New-Item -ItemType Directory -Force -Path $pipelinesRoot)
        $runner = Join-Path $PSScriptRoot 'run-production-extraction.cjs'
        $result = Invoke-GifExtractionTool -Executable (Get-Command node).Source -TimeoutMs 180000 -Arguments @(
            $runner, $RuntimePath, $SourcePath, $pipelinesRoot, $CollectionName, [string]$StartFrame, [string]$EndFrame
        )
        $document = $result.Stdout | ConvertFrom-Json
        return Assert-GifExtractionPathInside -Path ([string]$document.outputPath) -Root $pipelinesRoot
    }

    $videoOnlyPath = Assert-GifExtractionPathInside -Path "$OutputPath.video-only.mp4" -Root (Split-Path -Parent $OutputPath)
    try {
        [void](Invoke-GifExtractionTool -Executable $Tools.Ffmpeg -Environment $Tools.Environment -TimeoutMs 180000 -Arguments @(
            '-y',
            '-v', 'error',
            '-noautorotate',
            '-i', $SourcePath,
            '-map', '0:v:0',
            '-an',
            '-vf', "select='between(n\,$StartFrame\,$EndFrame)',setpts=PTS-STARTPTS",
            '-fps_mode', 'passthrough',
            '-c:v', 'libx264rgb',
            '-crf', '0',
            '-preset', 'ultrafast',
            '-pix_fmt', 'rgb24',
            $videoOnlyPath
        ))

        [void](Invoke-GifExtractionTool -Executable $Tools.ModernFfmpeg -Environment $Tools.Environment -TimeoutMs 180000 -Arguments @(
            '-y',
            '-v', 'error',
            '-copyts',
            '-i', $videoOnlyPath,
            '-i', $SourcePath,
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-af', "atrim=start=$SourceStartTime`:end=$SourceEndTime,asetpts=PTS-STARTPTS",
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            $OutputPath
        ))
    } finally {
        if (Test-Path -LiteralPath $videoOnlyPath) {
            Remove-Item -LiteralPath $videoOnlyPath -Force
        }
    }
    return $OutputPath
}

function Test-ProofFixture {
    param(
        [Parameter(Mandatory = $true)]$Tools,
        [Parameter(Mandatory = $true)][string]$FixtureRoot,
        [Parameter(Mandatory = $true)][string]$OutputRoot,
        [Parameter(Mandatory = $true)]$Fixture,
        [string]$RuntimePath = ''
    )

    $fixtureId = [string]$Fixture.id
    $sourcePath = Resolve-ProofFixturePath -FixtureRoot $FixtureRoot -RelativePath ([string]$Fixture.source)
    $reviewPath = Resolve-ProofFixturePath -FixtureRoot $FixtureRoot -RelativePath ([string]$Fixture.reviewSource)
    $sourceDescription = Get-GifExtractionMediaDescription -Tools $Tools -Path $sourcePath
    $reviewDescription = Get-GifExtractionMediaDescription -Tools $Tools -Path $reviewPath
    $startFrame = [int]$Fixture.selectedRange.startFrame
    $endFrame = [int]$Fixture.selectedRange.endFrame
    if ($startFrame -lt 0 -or $endFrame -lt $startFrame -or $endFrame + 1 -ge $sourceDescription.VideoFrames.Count) {
        throw "$fixtureId selected range must have a following source frame for its end boundary."
    }
    Assert-ProofEqual -Actual $sourceDescription.VideoFrames.Count -Expected ([int]$Fixture.expected.sourceFrameCount) -Message "$fixtureId source frame count differs."
    Assert-ProofEqual -Actual $reviewDescription.VideoFrames.Count -Expected ([int]$Fixture.expected.reviewFrameCount) -Message "$fixtureId review frame count differs."
    Assert-ProofEqual -Actual ([int]$sourceDescription.VideoStream.width) -Expected ([int]$Fixture.expected.width) -Message "$fixtureId source width differs."
    Assert-ProofEqual -Actual ([int]$sourceDescription.VideoStream.height) -Expected ([int]$Fixture.expected.height) -Message "$fixtureId source height differs."

    $sourceHashes = @(Get-GifExtractionFrameHashes -Tools $Tools -Path $sourcePath)
    $reviewHashes = @(Get-GifExtractionFrameHashes -Tools $Tools -Path $reviewPath)
    Assert-ProofSequenceEqual -Actual $reviewHashes -Expected $sourceHashes -Message "$fixtureId source-to-review ordinal mapping"
    $expectedHashes = @($sourceHashes[$startFrame..$endFrame])
    Assert-ProofSequenceEqual -Actual $expectedHashes -Expected @($Fixture.expected.selectedFrameHashes) -Message "$fixtureId manifest frame identity"

    $cacheBase = Assert-GifExtractionPathInside -Path (Join-Path $OutputRoot "bestsource-cache\$fixtureId") -Root $OutputRoot
    $bestSourceFrames = @(Get-GifExtractionBestSourceFrames -Tools $Tools -Path $sourcePath -CacheBase $cacheBase -Ordinals @($startFrame, $endFrame))
    Assert-ProofBestSourceIdentity -BestSourceFrames $bestSourceFrames -ReviewDescription $sourceDescription -Ordinals @($startFrame, $endFrame) -FixtureId $fixtureId

    $sourceStartTime = Get-ProofFrameTimestamp -Frame $sourceDescription.VideoFrames[$startFrame] -Label "$fixtureId start frame"
    $sourceEndTime = Get-ProofFrameTimestamp -Frame $sourceDescription.VideoFrames[$endFrame + 1] -Label "$fixtureId following frame"
    Assert-ProofEqual -Actual $sourceStartTime -Expected ([string]$Fixture.expected.sourceStartTime) -Message "$fixtureId source start time differs."
    Assert-ProofEqual -Actual $sourceEndTime -Expected ([string]$Fixture.expected.sourceEndTime) -Message "$fixtureId source end time differs."

    $reviewStartTime = Get-ProofFrameTimestamp -Frame $reviewDescription.VideoFrames[$startFrame] -Label "$fixtureId review start frame"
    if ([bool]$Fixture.requiresTimestampRepair) {
        if ($reviewStartTime -eq $sourceStartTime) {
            throw "$fixtureId must prove that repaired review PTS differs from original-source PTS."
        }
    } else {
        Assert-ProofEqual -Actual $reviewStartTime -Expected $sourceStartTime -Message "$fixtureId unexpected review/source timing difference."
    }

    if ($null -eq $sourceDescription.AudioStream) {
        throw "$fixtureId source has no selected audio stream."
    }
    $sampleRate = [int]$sourceDescription.AudioStream.sample_rate
    Assert-ProofEqual -Actual $sampleRate -Expected ([int]$Fixture.expected.audioSampleRate) -Message "$fixtureId audio sample rate differs."

    $outputPath = Assert-GifExtractionPathInside -Path (Join-Path $OutputRoot "$fixtureId.mp4") -Root $OutputRoot
    $outputPath = Invoke-ProofExtraction -Tools $Tools -SourcePath $sourcePath -OutputPath $outputPath -StartFrame $startFrame -EndFrame $endFrame -SourceStartTime $sourceStartTime -SourceEndTime $sourceEndTime -RuntimePath $RuntimePath -CollectionName $fixtureId
    $outputDescription = Assert-ProofOutputVideo -Tools $Tools -OutputPath $outputPath -SourceDescription $sourceDescription -ExpectedHashes $expectedHashes -FixtureId $fixtureId

    $referencePcm = Assert-GifExtractionPathInside -Path (Join-Path $OutputRoot "$fixtureId-reference.pcm") -Root $OutputRoot
    $outputPcm = Assert-GifExtractionPathInside -Path (Join-Path $OutputRoot "$fixtureId-output.pcm") -Root $OutputRoot
    $audioTools = [pscustomobject]@{ Ffmpeg = $Tools.ModernFfmpeg; Environment = $Tools.Environment }
    $referenceAudio = Get-GifExtractionAudioFingerprint -Tools $audioTools -Path $sourcePath -ScratchPath $referencePcm -SampleRate $sampleRate -AudioFilter "atrim=start=$sourceStartTime`:end=$sourceEndTime,asetpts=PTS-STARTPTS" -PreserveInputTimestamps -IncludeSamples
    $outputAudio = Get-GifExtractionAudioFingerprint -Tools $audioTools -Path $outputPath -ScratchPath $outputPcm -SampleRate $sampleRate -IncludeSamples
    $sampleDifference = [Math]::Abs($outputAudio.SampleCount - $referenceAudio.SampleCount)
    if ($sampleDifference -gt 1) {
        throw "$fixtureId decoded audio boundary differs by $sampleDifference samples."
    }
    $similarity = Get-ProofAudioSimilarity -Reference $referenceAudio.Samples -Actual $outputAudio.Samples
    if ($similarity.Correlation -lt 0.995) {
        throw "$fixtureId decoded audio correlation $($similarity.Correlation) is below 0.995."
    }
    if ($similarity.NormalizedRootMeanSquareError -gt 0.08) {
        throw "$fixtureId decoded audio normalized error $($similarity.NormalizedRootMeanSquareError) exceeds 0.08."
    }

    return [ordered]@{
        id = $fixtureId
        source = [string]$Fixture.source
        reviewSource = [string]$Fixture.reviewSource
        startFrame = $startFrame
        endFrame = $endFrame
        outputFrameCount = $expectedHashes.Count
        width = [int]$outputDescription.VideoStream.width
        height = [int]$outputDescription.VideoStream.height
        sourceStartTime = $sourceStartTime
        sourceEndTime = $sourceEndTime
        reviewStartTime = $reviewStartTime
        audioSamples = $outputAudio.SampleCount
        videoCodec = [string]$outputDescription.VideoStream.codec_name
        audioCodec = [string]$outputDescription.AudioStream.codec_name
        audioSampleDifference = $sampleDifference
        audioCorrelation = $similarity.Correlation
        audioNormalizedRootMeanSquareError = $similarity.NormalizedRootMeanSquareError
        exactDecodedVideo = $true
        selectedDecodedAudio = $true
        audioBoundaryWithinOneSample = $true
    }
}

function Test-ProofNegativeOracles {
    param(
        [Parameter(Mandatory = $true)]$Tools,
        [Parameter(Mandatory = $true)][string]$FixtureRoot,
        [Parameter(Mandatory = $true)][string]$OutputRoot,
        [Parameter(Mandatory = $true)]$Manifest
    )

    $audioFixture = @($Manifest.fixtures | Where-Object { $_.expectedFailure -eq $null }) | Select-Object -First 1
    $audioSource = Resolve-ProofFixturePath -FixtureRoot $FixtureRoot -RelativePath ([string]$audioFixture.source)
    $audioHashes = @(Get-GifExtractionFrameHashes -Tools $Tools -Path $audioSource)
    $startFrame = [int]$audioFixture.selectedRange.startFrame
    $endFrame = [int]$audioFixture.selectedRange.endFrame
    $actual = @($audioHashes[$startFrame..$endFrame])
    $shifted = @($audioHashes[($startFrame + 1)..($endFrame + 1)])
    $shiftRejected = (($actual -join ',') -ne ($shifted -join ','))
    if (-not $shiftRejected) { throw 'The video identity oracle accepted a deliberately shifted range.' }

    $noAudioFixture = @($Manifest.fixtures | Where-Object { $_.expectedFailure -eq 'missing-audio' }) | Select-Object -First 1
    if ($null -eq $noAudioFixture) { throw 'The manifest has no missing-audio negative fixture.' }
    $noAudioPath = Resolve-ProofFixturePath -FixtureRoot $FixtureRoot -RelativePath ([string]$noAudioFixture.source)
    $noAudioDescription = Get-GifExtractionMediaDescription -Tools $Tools -Path $noAudioPath
    if ($null -ne $noAudioDescription.AudioStream) {
        throw 'The missing-audio negative fixture unexpectedly has an audio stream.'
    }

    $repairFixture = @($Manifest.fixtures | Where-Object { $_.requiresTimestampRepair }) | Select-Object -First 1
    if ($null -eq $repairFixture) { throw 'The manifest has no timestamp-repair fixture.' }
    $repairReviewPath = Resolve-ProofFixturePath -FixtureRoot $FixtureRoot -RelativePath ([string]$repairFixture.reviewSource)
    $repairDescription = Get-GifExtractionMediaDescription -Tools $Tools -Path $repairReviewPath
    $repairStart = [int]$repairFixture.selectedRange.startFrame
    $repairEnd = [int]$repairFixture.selectedRange.endFrame
    $repairOutput = Assert-GifExtractionPathInside -Path (Join-Path $OutputRoot 'review-source-substitution-negative.mp4') -Root $OutputRoot
    Invoke-ProofExtraction -Tools $Tools -SourcePath $repairReviewPath -OutputPath $repairOutput -StartFrame $repairStart -EndFrame $repairEnd -SourceStartTime ([string]$repairFixture.expected.sourceStartTime) -SourceEndTime ([string]$repairFixture.expected.sourceEndTime)
    $repairOutputDescription = Get-GifExtractionMediaDescription -Tools $Tools -Path $repairOutput
    $repairOutputHashes = @(Get-GifExtractionFrameHashes -Tools $Tools -Path $repairOutput)
    Assert-ProofSequenceEqual -Actual $repairOutputHashes -Expected @($repairFixture.expected.selectedFrameHashes) -Message 'Review-source substitution video control'
    $reviewSourceRejected = ($null -eq $repairOutputDescription.AudioStream)
    if (-not $reviewSourceRejected) {
        throw 'The original-source oracle accepted the timestamp-repaired review source as an extraction input.'
    }

    return [ordered]@{
        shiftedRangeRejected = $true
        missingAudioRejected = $true
        reviewSourceSubstitutionRejected = $true
    }
}

if (-not $All -and [string]::IsNullOrWhiteSpace($FixtureId)) {
    throw 'Specify -All or -FixtureId <id>.'
}

$tools = Resolve-GifExtractionMediaTools
$runtimePath = if ([string]::IsNullOrWhiteSpace($Runtime)) { '' } else {
    Assert-GifExtractionPathInside -Path (Join-Path $tools.RepoRoot $Runtime) -Root $tools.RepoRoot
}
$fixtureRoot = Join-Path $tools.RepoRoot 'tests\fixtures\gif-extraction'
$manifestPath = Join-Path $fixtureRoot 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Fixture manifest is missing. Run tools/gif-extraction/create-fixtures.ps1 first: $manifestPath"
}
$manifest = Read-GifExtractionJson -Path $manifestPath
Assert-ProofEqual -Actual ([int]$manifest.schemaVersion) -Expected 1 -Message 'Fixture manifest schema differs.'
$outputRoot = Assert-GifExtractionPathInside -Path (Join-Path $fixtureRoot 'generated\proof-output') -Root $fixtureRoot
[void](New-Item -ItemType Directory -Force -Path $outputRoot)

$fixtures = @(if ($All) {
    @($manifest.fixtures | Where-Object { $_.expectedFailure -eq $null })
} else {
    @($manifest.fixtures | Where-Object { $_.id -eq $FixtureId -and $_.expectedFailure -eq $null })
})
if ($fixtures.Count -eq 0) { throw "No runnable fixture matched '$FixtureId'." }

$results = @()
foreach ($fixture in $fixtures) {
    Write-Host "Verifying $($fixture.id)..."
    $results += Test-ProofFixture -Tools $tools -FixtureRoot $fixtureRoot -OutputRoot $outputRoot -Fixture $fixture -RuntimePath $runtimePath
}

$negative = if ($All) {
    Test-ProofNegativeOracles -Tools $tools -FixtureRoot $fixtureRoot -OutputRoot $outputRoot -Manifest $manifest
} else {
    $null
}
$proof = [ordered]@{
    schemaVersion = 1
    recipe = 'original decode select by ordinal; reset video PTS; trim audio on original frame presentation interval; lossless H.264 RGB plus AAC in MP4'
    results = $results
    negativeOracles = $negative
}
Write-GifExtractionJson -Path (Join-Path $outputRoot 'proof-results.json') -Value $proof
Write-Host "GIF_EXTRACTION_ORIGINAL_SOURCE_PROOF_READY ($($results.Count) fixture(s))"
