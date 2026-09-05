param([string]$Target = 'media-035', [ValidateRange(10, 3600)][int]$Seconds = 600)
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    node ./scripts/run-control-soak.mjs --target $Target --seconds $Seconds
    if ($LASTEXITCODE -ne 0) { throw "Electron soak failed with exit code $LASTEXITCODE" }
} finally { Pop-Location }
