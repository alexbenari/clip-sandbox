[CmdletBinding()]
param(
  [string]$InstallRoot = 'C:\installs\clip-sandbox',
  [switch]$Launch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

if ([string]::IsNullOrWhiteSpace($InstallRoot)) {
  throw 'InstallRoot must not be empty.'
}

$resolvedInstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
if ($resolvedInstallRoot.Length -lt 4) {
  throw "Refusing to deploy to suspiciously short path '$resolvedInstallRoot'."
}

function Copy-RepoItem {
  param(
    [string]$SourceRelativePath,
    [string]$DestinationRelativePath
  )

  $sourcePath = Join-Path $repoRoot $SourceRelativePath
  if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Required source path not found: $sourcePath"
  }

  $destinationPath = Join-Path $resolvedInstallRoot $DestinationRelativePath
  $destinationParent = Split-Path -Parent $destinationPath
  if ($destinationParent) {
    New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
  }

  if (Test-Path -LiteralPath $sourcePath -PathType Container) {
    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Recurse -Force
  } else {
    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
  }
}

Write-Host "Deploying Clip Sandbox to $resolvedInstallRoot"

if (Test-Path -LiteralPath $resolvedInstallRoot) {
  Write-Host "Removing existing install..."
  Remove-Item -LiteralPath $resolvedInstallRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $resolvedInstallRoot | Out-Null

$payload = @(
  @{ Source = 'index.html'; Destination = 'index.html' },
  @{ Source = 'app.js'; Destination = 'app.js' },
  @{ Source = 'src'; Destination = 'src' },
  @{ Source = 'deployment\launch.ps1'; Destination = 'launch.ps1' },
  @{ Source = 'deployment\miniserve-win.exe'; Destination = 'deployment\miniserve-win.exe' },
  @{ Source = 'deployment\miniserve-LICENSE.txt'; Destination = 'deployment\miniserve-LICENSE.txt' },
  @{ Source = 'docs\documentation\windows-deployment.md'; Destination = 'docs\documentation\windows-deployment.md' }
)

foreach ($item in $payload) {
  Copy-RepoItem -SourceRelativePath $item.Source -DestinationRelativePath $item.Destination
}

Write-Host 'Deployment completed.'
Write-Host "Installed files are available at $resolvedInstallRoot"

if ($Launch) {
  Write-Host 'Launching installed copy...'
  & (Join-Path $resolvedInstallRoot 'launch.ps1')
}
