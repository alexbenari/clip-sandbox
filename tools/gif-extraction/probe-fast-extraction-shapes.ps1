[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'media-proof-common.ps1')

$tools = Resolve-GifExtractionMediaTools
$root = Assert-GifExtractionPathInside -Path (Join-Path $tools.RepoRoot 'tests\fixtures\gif-extraction\generated') -Root $tools.RepoRoot
$cases = @(
    @{ Name = 'cfr-audio'; Ranges = @(@{ Start = 8; End = 23 }, @{ Start = 0; End = 0 }, @{ Start = 71; End = 71 }) },
    @{ Name = 'vfr-audio'; Ranges = @(@{ Start = 7; End = 19 }, @{ Start = 71; End = 71 }) },
    @{ Name = 'no-audio'; Ranges = @(@{ Start = 4; End = 15 }) },
    @{ Name = 'timestamp-repair-source'; Ranges = @(@{ Start = 5; End = 15 }) }
)
$results = @()
foreach ($case in $cases) {
    $source = Assert-GifExtractionPathInside -Path (Join-Path $root "$($case.Name).mkv") -Root $root
    $description = Get-GifExtractionMediaDescription -Tools $tools -Path $source
    $sourceHashes = @(Get-GifExtractionFrameHashes -Tools $tools -Path $source)
    foreach ($range in $case.Ranges) {
        $start = [int]$range.Start
        $end = [int]$range.End
        $count = $end - $start + 1
        $startSeconds = [double]$description.VideoFrames[$start].best_effort_timestamp_time
        $endSeconds = if ($end + 1 -lt $description.VideoFrames.Count) {
            [double]$description.VideoFrames[$end + 1].best_effort_timestamp_time
        } else {
            [double]$description.VideoFrames[$end].best_effort_timestamp_time +
                ([double]$description.VideoFrames[$end].best_effort_timestamp_time - [double]$description.VideoFrames[$end - 1].best_effort_timestamp_time)
        }
        $seek = [Math]::Max(0, $startSeconds - 5)
        $readDuration = $endSeconds - $seek + 2
        $output = Assert-GifExtractionPathInside -Path (Join-Path $root "probe-$($case.Name)-$start-$end.mp4") -Root $root
        $startText = $startSeconds.ToString('0.#########', [Globalization.CultureInfo]::InvariantCulture)
        $endText = $endSeconds.ToString('0.#########', [Globalization.CultureInfo]::InvariantCulture)
        $seekText = $seek.ToString('0.######', [Globalization.CultureInfo]::InvariantCulture)
        $durationText = $readDuration.ToString('0.######', [Globalization.CultureInfo]::InvariantCulture)
        $result = Invoke-GifExtractionTool -Executable $tools.Ffmpeg -Environment $tools.Environment -Arguments @(
            '-hide_banner', '-nostdin', '-y', '-noautorotate',
            '-ss', $seekText, '-t', $durationText, '-copyts', '-i', $source,
            '-map', '0:v:0', '-an',
            '-vf', "select='gte(t,$startText)*lt(t,$endText)',showinfo,setpts=PTS-STARTPTS",
            '-frames:v', [string]$count, '-fps_mode', 'passthrough',
            '-c:v', 'libx264rgb', '-crf', '0', '-preset', 'ultrafast', '-pix_fmt', 'rgb24', $output
        )
        $hashes = @(Get-GifExtractionFrameHashes -Tools $tools -Path $output)
        $match = $hashes.Count -eq $count
        if ($match) {
            for ($i = 0; $i -lt $count; $i += 1) {
                if ($hashes[$i] -ne $sourceHashes[$start + $i]) { $match = $false; break }
            }
        }
        $selected = @([regex]::Matches($result.Stderr, 'Parsed_showinfo.*?\bn:\s*\d+\s+pts:\s*(-?\d+)'))
        $results += [pscustomobject]@{
            fixture = $case.Name
            startFrame = $start
            endFrame = $end
            outputFrames = $hashes.Count
            filterFrames = $selected.Count
            exactFrameHashMatch = $match
        }
    }
}
$evidencePath = Assert-GifExtractionPathInside -Path (Join-Path $root 'probe-fast-extraction-shapes-result.json') -Root $root
Write-GifExtractionJson -Path $evidencePath -Value $results
if (@($results | Where-Object { -not $_.exactFrameHashMatch }).Count -gt 0) {
    throw "One or more source shapes did not match; inspect $evidencePath"
}
Write-Output "Fast extraction shapes passed: $($results.Count) ranges. Evidence: $evidencePath"
