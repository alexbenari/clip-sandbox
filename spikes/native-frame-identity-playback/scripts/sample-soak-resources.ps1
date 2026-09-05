param(
    [Parameter(Mandatory = $true)][int]$RootPid,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [Parameter(Mandatory = $true)][string]$StopPath
)
$ErrorActionPreference = 'Stop'
$known = [System.Collections.Generic.HashSet[int]]::new()
[void]$known.Add($RootPid)
$writer = [System.IO.StreamWriter]::new($OutputPath, $false, [System.Text.UTF8Encoding]::new($false))
try {
    while (-not (Test-Path -LiteralPath $StopPath)) {
        $all = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name)
        do {
            $added = $false
            foreach ($item in $all) {
                if ($known.Contains([int]$item.ParentProcessId) -and $known.Add([int]$item.ProcessId)) { $added = $true }
            }
        } while ($added)
        $samples = @()
        foreach ($item in $all) {
            if (-not $known.Contains([int]$item.ProcessId)) { continue }
            if ($item.Name -eq 'powershell.exe') { continue }
            $process = Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue
            if ($null -eq $process) { continue }
            $samples += @{ pid = [int]$item.ProcessId; name = $item.Name;
                workingSetBytes = $process.WorkingSet64; privateBytes = $process.PrivateMemorySize64;
                cpuSeconds = $process.CPU }
        }
        $writer.WriteLine((@{ at = [DateTime]::UtcNow.ToString('o'); processes = $samples } | ConvertTo-Json -Compress -Depth 5))
        $writer.Flush()
        if (-not (Get-Process -Id $RootPid -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Seconds 2
    }
} finally { $writer.Dispose() }
