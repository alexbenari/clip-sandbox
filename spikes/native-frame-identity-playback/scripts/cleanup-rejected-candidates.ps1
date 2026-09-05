param([switch]$Apply)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$prefix = $root.TrimEnd('\') + '\'
$artifacts = Join-Path $root 'artifacts'
$targets = @(
    'candidates\node-av',
    '.deps\vcpkg-source\packages\ffmpeg_x64-mingw-dynamic',
    '.deps\vcpkg-source\packages\ffmpeg_x64-windows',
    '.deps\vcpkg-source\packages\xxhash_x64-mingw-dynamic',
    '.deps\drmemory', '.deps\drmemory-logs', '.deps\drmemory-logs-20434',
    '.deps\upstream-exact-825af4', '.deps\upstream-r20-diagnostics',
    '.deps\vapoursynth-diagnostics-venv', '.deps\prepared-diagnostics',
    '.deps\remux-diagnostics', '.deps\performance-diagnostics',
    '.deps\nasm-test.asm', '.deps\nasm-test.obj', '.deps\nasm-wrapper-test.sh'
)

# Literal allowlist only. Never infer cleanup targets from a package name or a glob.
$inventory = foreach ($relative in $targets) {
    $absolute = [IO.Path]::GetFullPath((Join-Path $root $relative))
    if (-not $absolute.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Cleanup target escaped the spike: $absolute"
    }
    if (-not (Test-Path -LiteralPath $absolute)) { continue }
    $item = Get-Item -LiteralPath $absolute -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw "Refusing a linked cleanup root: $absolute"
    }
    $files = @(if ($item.PSIsContainer) {
        Get-ChildItem -LiteralPath $absolute -File -Recurse -Force
    } else { $item })
    $bytes = if ($files.Count) { [long](($files | Measure-Object Length -Sum).Sum) } else { 0L }
    [pscustomobject]@{ relativePath = $relative; absolutePath = $absolute;
        fileCount = $files.Count; bytes = $bytes }
}

if ($Apply) {
    New-Item -ItemType Directory -Force -Path $artifacts | Out-Null
    foreach ($name in @('probe.log', 'pipeline-probe.log', 'transcode.log')) {
        $source = Join-Path $root "candidates\node-av\$name"
        if (Test-Path -LiteralPath $source) {
            Copy-Item -LiteralPath $source -Destination (Join-Path $artifacts "rejected-node-av-$name")
        }
    }
    # Keep vcpkg's installed database coherent; dry-run showed only this unused package installed.
    $vcpkg = Join-Path $root '.deps\vcpkg-source\vcpkg.exe'
    & $vcpkg remove 'xxhash:x64-mingw-dynamic' "--x-install-root=$(Join-Path $root '.deps\vcpkg-installed')"
    if ($LASTEXITCODE -ne 0) { throw 'Removal of the unused dynamic-triplet package failed.' }
    foreach ($target in $inventory) {
        # vcpkg may already have removed its package staging directory.
        if (Test-Path -LiteralPath $target.absolutePath) {
            Remove-Item -LiteralPath $target.absolutePath -Recurse -Force
        }
    }
    $report = [ordered]@{ completedAtUtc = [DateTime]::UtcNow.ToString('o'); removed = @($inventory);
        preserved = @('.deps/prepared-review-cache', '.deps/indexes', '.deps/remediation-media',
          '.deps/vcpkg-installed/x64-mingw-release', '.deps/phase3c-vcpkg-installed',
          '.deps/libvlc', '.deps/bestsource-install', 'artifacts', 'native', 'scripts') }
    [IO.File]::WriteAllText((Join-Path $artifacts 'cleanup-summary.json'),
        ($report | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
}
$inventory | Select-Object relativePath, fileCount, bytes | Format-Table -AutoSize
Write-Output $(if ($Apply) { 'Removed only the listed obsolete artifacts.' } else { 'Dry run only; use -Apply after stopping playback and native builds.' })
