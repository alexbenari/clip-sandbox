Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-GifExtractionRepoRoot {
    return [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
}

function Assert-GifExtractionPathInside {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Root
    )

    $resolvedPath = [IO.Path]::GetFullPath($Path)
    $resolvedRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    $rootPrefix = "$resolvedRoot$([IO.Path]::DirectorySeparatorChar)"
    if (-not $resolvedPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path must stay inside $resolvedRoot but resolved to $resolvedPath"
    }
    return $resolvedPath
}

function Read-GifExtractionJson {
    param([Parameter(Mandatory = $true)][string]$Path)

    $text = [IO.File]::ReadAllText($Path)
    return ($text.TrimStart([char]0xFEFF) | ConvertFrom-Json)
}

function Write-GifExtractionJson {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)]$Value
    )

    $json = $Value | ConvertTo-Json -Depth 20
    [IO.File]::WriteAllText($Path, "$json`n", [Text.UTF8Encoding]::new($false))
}

function Resolve-GifExtractionMediaTools {
    $repoRoot = Get-GifExtractionRepoRoot
    $resolvedPath = Join-Path $repoRoot 'tools\frame-review\.deps\resolved-dependencies.json'
    if (-not (Test-Path -LiteralPath $resolvedPath)) {
        throw 'Pinned frame-review media tools are missing. Run npm run frame-review:bootstrap first.'
    }
    $resolved = Read-GifExtractionJson -Path $resolvedPath
    $ffmpeg = [string]$resolved.ffmpeg.path
    $modernFfmpeg = $ffmpeg
    $ffprobe = [string]$resolved.ffprobe.path
    $bestSourceGate = Join-Path $repoRoot 'native-build\frame-review\bin\bestsource_gate.exe'
    $bestSourceBin = Join-Path ([string]$resolved.bestsource.root) 'bin'
    $releaseRoot = [string]$resolved.vcpkg.tripletRoot
    $mingwRuntime = [string]$resolved.compiler.runtimeDllRoot

    foreach ($required in @($ffmpeg, $modernFfmpeg, $ffprobe, $bestSourceGate, $bestSourceBin, $mingwRuntime)) {
        if (-not (Test-Path -LiteralPath $required)) {
            throw "Required GIF extraction proof tool is missing: $required"
        }
    }

    $toolPath = @(
        $bestSourceBin,
        (Join-Path $releaseRoot 'bin'),
        (Join-Path $releaseRoot 'tools\ffmpeg'),
        $mingwRuntime,
        $env:PATH
    ) -join ';'

    return [pscustomobject]@{
        RepoRoot = $repoRoot
        Ffmpeg = $ffmpeg
        ModernFfmpeg = $modernFfmpeg
        Ffprobe = $ffprobe
        BestSourceGate = $bestSourceGate
        Environment = @{ PATH = $toolPath }
    }
}

function ConvertTo-GifExtractionWindowsArgument {
    param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value)

    if ($Value.Length -gt 0 -and $Value -notmatch '[\s"]') {
        return $Value
    }

    $quoted = [Text.StringBuilder]::new()
    [void]$quoted.Append('"')
    $backslashes = 0
    foreach ($character in $Value.ToCharArray()) {
        if ($character -eq '\') {
            $backslashes += 1
            continue
        }
        if ($character -eq '"') {
            [void]$quoted.Append(('\' * (($backslashes * 2) + 1)))
            [void]$quoted.Append('"')
            $backslashes = 0
            continue
        }
        if ($backslashes -gt 0) {
            [void]$quoted.Append(('\' * $backslashes))
            $backslashes = 0
        }
        [void]$quoted.Append($character)
    }
    if ($backslashes -gt 0) {
        [void]$quoted.Append(('\' * ($backslashes * 2)))
    }
    [void]$quoted.Append('"')
    return $quoted.ToString()
}

function Invoke-GifExtractionTool {
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [hashtable]$Environment = @{},
        [int]$TimeoutMs = 120000
    )

    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $Executable
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.Arguments = ($Arguments | ForEach-Object {
        ConvertTo-GifExtractionWindowsArgument -Value $_
    }) -join ' '
    foreach ($entry in $Environment.GetEnumerator()) {
        $startInfo.Environment[[string]$entry.Key] = [string]$entry.Value
    }

    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
        throw "Failed to start media tool: $Executable"
    }

    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit($TimeoutMs)) {
        try { $process.Kill($true) } catch { Write-Verbose "Media tool already exited while timing out: $Executable" }
        throw "Media tool timed out after $TimeoutMs ms: $Executable"
    }

    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    $exitCode = $process.ExitCode
    $process.Dispose()
    if ($exitCode -ne 0) {
        $detail = if ([string]::IsNullOrWhiteSpace($stderr)) { $stdout.Trim() } else { $stderr.Trim() }
        throw "Media tool failed with exit code $exitCode`: $Executable`n$detail"
    }

    return [pscustomobject]@{
        Stdout = $stdout
        Stderr = $stderr
        ExitCode = $exitCode
    }
}

function Get-GifExtractionMediaDescription {
    param(
        [Parameter(Mandatory = $true)]$Tools,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $result = Invoke-GifExtractionTool -Executable $Tools.Ffprobe -Environment $Tools.Environment -Arguments @(
        '-v', 'error',
        '-show_streams',
        '-show_frames',
        '-show_entries',
        'stream=index,codec_type,codec_name,pix_fmt,width,height,time_base,start_time,duration,nb_frames,sample_rate,channels:frame=media_type,best_effort_timestamp,best_effort_timestamp_time,pkt_duration,pkt_duration_time',
        '-of', 'json',
        $Path
    )
    $probe = $result.Stdout | ConvertFrom-Json
    $videoStream = @($probe.streams | Where-Object { $_.codec_type -eq 'video' }) | Select-Object -First 1
    if ($null -eq $videoStream) {
        throw "No video stream found in $Path"
    }
    $videoFrames = @($probe.frames | Where-Object { $_.media_type -eq 'video' })
    if ($videoFrames.Count -eq 0) {
        throw "No decoded video-frame metadata found in $Path"
    }
    $audioStream = @($probe.streams | Where-Object { $_.codec_type -eq 'audio' }) | Select-Object -First 1

    return [pscustomobject]@{
        VideoStream = $videoStream
        VideoFrames = $videoFrames
        AudioStream = $audioStream
    }
}

function Get-GifExtractionFrameHashes {
    param(
        [Parameter(Mandatory = $true)]$Tools,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $result = Invoke-GifExtractionTool -Executable $Tools.Ffmpeg -Environment $Tools.Environment -Arguments @(
        '-v', 'error',
        '-noautorotate',
        '-i', $Path,
        '-map', '0:v:0',
        '-fps_mode', 'passthrough',
        '-c:v', 'rawvideo',
        '-pix_fmt', 'rgba',
        '-f', 'framemd5',
        '-'
    )
    $hashes = @()
    foreach ($line in ($result.Stdout -split "`r?`n")) {
        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) { continue }
        $parts = @($line.Split(',') | ForEach-Object { $_.Trim() })
        if ($parts.Count -lt 6) { throw "Unexpected framemd5 line: $line" }
        $hashes += $parts[-1]
    }
    if ($hashes.Count -eq 0) { throw "No frame hashes were emitted for $Path" }
    return $hashes
}

function Get-GifExtractionBestSourceFrames {
    param(
        [Parameter(Mandatory = $true)]$Tools,
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$CacheBase,
        [Parameter(Mandatory = $true)][int[]]$Ordinals
    )

    $cacheParent = Split-Path -Parent $CacheBase
    [void](New-Item -ItemType Directory -Force -Path $cacheParent)
    $frameList = ($Ordinals | ForEach-Object { [string]$_ }) -join ','
    $result = Invoke-GifExtractionTool -Executable $Tools.BestSourceGate -Environment $Tools.Environment -TimeoutMs 180000 -Arguments @(
        'probe', $Path, $CacheBase, $frameList
    )

    $frames = @()
    foreach ($line in ($result.Stdout -split "`r?`n")) {
        if (-not $line.StartsWith('{')) { continue }
        $record = $line | ConvertFrom-Json
        if ($record.type -eq 'frame') { $frames += $record }
    }
    if ($frames.Count -ne $Ordinals.Count) {
        throw "BestSource returned $($frames.Count) frames; expected $($Ordinals.Count)"
    }
    return $frames
}

function Get-GifExtractionAudioFingerprint {
    param(
        [Parameter(Mandatory = $true)]$Tools,
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$ScratchPath,
        [Parameter(Mandatory = $true)][int]$SampleRate,
        [string]$AudioFilter = '',
        [switch]$PreserveInputTimestamps,
        [switch]$IncludeSamples
    )

    $arguments = @('-y', '-v', 'error')
    if ($PreserveInputTimestamps) {
        $arguments += '-copyts'
    }
    $arguments += @('-i', $Path, '-map', '0:a:0')
    if (-not [string]::IsNullOrWhiteSpace($AudioFilter)) {
        $arguments += @('-af', $AudioFilter)
    }
    $arguments += @('-ac', '1', '-ar', [string]$SampleRate, '-c:a', 'pcm_s16le', '-f', 's16le', $ScratchPath)
    try {
        [void](Invoke-GifExtractionTool -Executable $Tools.Ffmpeg -Environment $Tools.Environment -Arguments $arguments)
        $file = Get-Item -LiteralPath $ScratchPath
        if ($file.Length % 2 -ne 0) {
            throw "Decoded PCM byte count is not aligned to signed 16-bit samples: $($file.Length)"
        }
        $fingerprint = [ordered]@{
            ByteCount = $file.Length
            SampleCount = [int64]($file.Length / 2)
            Sha256 = (Get-FileHash -LiteralPath $ScratchPath -Algorithm SHA256).Hash.ToLowerInvariant()
        }
        if ($IncludeSamples) {
            $bytes = [IO.File]::ReadAllBytes($ScratchPath)
            $samples = [int16[]]::new([int]($bytes.Length / 2))
            for ($index = 0; $index -lt $samples.Length; $index += 1) {
                $samples[$index] = [BitConverter]::ToInt16($bytes, $index * 2)
            }
            $fingerprint['Samples'] = $samples
        }
        return [pscustomobject]$fingerprint
    } finally {
        if (Test-Path -LiteralPath $ScratchPath) {
            Remove-Item -LiteralPath $ScratchPath -Force
        }
    }
}

function Convert-GifExtractionSeconds {
    param([Parameter(Mandatory = $true)]$Value)
    return ([double]::Parse([string]$Value, [Globalization.CultureInfo]::InvariantCulture)).ToString('0.#########', [Globalization.CultureInfo]::InvariantCulture)
}
