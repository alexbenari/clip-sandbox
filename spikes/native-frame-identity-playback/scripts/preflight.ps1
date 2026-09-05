param(
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$spikeRoot = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content (Join-Path $spikeRoot 'dependency-manifest.json') -Raw | ConvertFrom-Json
$checks = [System.Collections.Generic.List[object]]::new()

function Add-Check {
    param(
        [string]$Name,
        [bool]$Required,
        [bool]$Available,
        [string]$Version,
        [string]$Path,
        [string]$Action
    )

    $checks.Add([pscustomobject]@{
        name = $Name
        required = $Required
        available = $Available
        version = $Version
        path = $Path
        action = $Action
    })
}

function Get-CommandVersion {
    param(
        [string]$Name,
        [string[]]$Arguments = @('--version')
    )

    $commands = @(Get-Command $Name -All -ErrorAction SilentlyContinue)
    foreach ($command in $commands) {
        try {
            $output = @(@(& $command.Source @Arguments 2>&1) |
                Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
            if ($LASTEXITCODE -eq 0 -and $output.Count -gt 0) {
                return [pscustomobject]@{ path = $command.Source; version = [string]($output[0]) }
            }
        } catch {
            continue
        }
    }
    return $null
}

if (-not [Environment]::Is64BitOperatingSystem) {
    Add-Check -Name 'Windows x64' -Required $true -Available $false -Version '' -Path '' `
        -Action 'Run this Windows x64 spike on a 64-bit Windows host.'
} else {
    Add-Check -Name 'Windows x64' -Required $true -Available $true `
        -Version ([Environment]::OSVersion.VersionString) -Path $env:SystemRoot -Action ''
}

$commands = @(
    @{ name = 'Node.js'; command = 'node'; args = @('--version'); required = $true; action = 'Install Node.js 22 or newer.' },
    @{ name = 'npm'; command = 'npm'; args = @('--version'); required = $true; action = 'Install npm with Node.js.' },
    @{ name = 'Git'; command = 'git'; args = @('--version'); required = $true; action = 'Install Git for Windows.' },
    @{ name = 'CMake'; command = 'cmake'; args = @('--version'); required = $true; action = 'Install CMake 3.25 or newer.' },
    @{ name = 'Ninja'; command = 'ninja'; args = @('--version'); required = $false; action = 'Install Ninja if a Ninja generator is selected.' },
    @{ name = 'FFmpeg'; command = 'ffmpeg'; args = @('-version'); required = $true; action = 'Install FFmpeg and add it to PATH.' },
    @{ name = 'FFprobe'; command = 'ffprobe'; args = @('-version'); required = $true; action = 'Install FFprobe and add it to PATH.' },
    @{ name = 'Meson'; command = 'meson'; args = @('--version'); required = $false; action = 'The BestSource bootstrap acquires pinned Meson when it is not on PATH.' },
    @{ name = 'MinGW x64 C++ for BestSource gate'; command = 'C:\cygwin64\bin\x86_64-w64-mingw32-g++.exe'; args = @('--version'); required = $true; action = 'Install the Cygwin MinGW x86_64 C++ compiler used by the pinned BestSource stack.' }
)

foreach ($item in $commands) {
    $found = Get-CommandVersion -Name $item.command -Arguments $item.args
    Add-Check -Name $item.name -Required $item.required -Available ($null -ne $found) `
        -Version $(if ($found) { $found.version } else { '' }) `
        -Path $(if ($found) { $found.path } else { '' }) `
        -Action $(if ($found) { '' } else { $item.action })
}

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$vsPath = $null
$vsVersion = $null
if (Test-Path $vswhere) {
    $vsPath = & $vswhere -latest -products * `
        -requires $manifest.toolchain.requiredComponent -property installationPath
    $vsVersion = & $vswhere -latest -products * `
        -requires $manifest.toolchain.requiredComponent -property catalog_productLineVersion
}

Add-Check -Name 'MSVC C++ x64 tools for LibVLC gate' -Required $true `
    -Available (-not [string]::IsNullOrWhiteSpace($vsPath)) `
    -Version $(if ($vsVersion) { [string]$vsVersion } else { '' }) `
    -Path $(if ($vsPath) { [string]$vsPath } else { '' }) `
    -Action $(if ($vsPath) { '' } else { 'Install Visual Studio C++ x64 build tools.' })

$failed = @($checks | Where-Object { $_.required -and -not $_.available })
$result = [pscustomobject]@{
    ready = $failed.Count -eq 0
    checkedAtUtc = [DateTime]::UtcNow.ToString('o')
    checks = $checks
}

if ($Json) {
    $result | ConvertTo-Json -Depth 5
} else {
    $checks | Format-Table -AutoSize name, required, available, version, path
    if ($failed.Count -eq 0) {
        Write-Output 'READY'
    } else {
        Write-Output ''
        Write-Output 'Required actions:'
        $failed | ForEach-Object { Write-Output "- $($_.name): $($_.action)" }
    }
}

if ($failed.Count -ne 0) {
    exit 1
}
