[CmdletBinding()]
param(
  [string]$InstallRoot = 'C:\installs\clip-sandbox',
  [int]$PreferredPort = 8787,
  [switch]$NoBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$deployScriptPath = Join-Path $PSScriptRoot 'deploy.ps1'

if (-not (Test-Path -LiteralPath $deployScriptPath -PathType Leaf)) {
  throw "Deploy script not found at '$deployScriptPath'."
}

& $deployScriptPath -InstallRoot $InstallRoot
& (Join-Path $InstallRoot 'launch.ps1') -PreferredPort $PreferredPort -NoBrowser:$NoBrowser
