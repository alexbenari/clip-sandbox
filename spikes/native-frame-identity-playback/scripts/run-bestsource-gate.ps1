$ErrorActionPreference = 'Stop'
$spikeRoot = Split-Path -Parent $PSScriptRoot
Push-Location $spikeRoot
try {
    node .\scripts\run-bestsource-gate.mjs @args
    if ($LASTEXITCODE -ne 0) { throw "BestSource gate exited with code $LASTEXITCODE" }
} finally {
    Pop-Location
}
