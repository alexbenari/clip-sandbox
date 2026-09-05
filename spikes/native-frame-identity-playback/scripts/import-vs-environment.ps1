param(
    [Parameter(Mandatory = $true)]
    [string]$VisualStudioRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$vcvars = Join-Path $VisualStudioRoot 'VC\Auxiliary\Build\vcvars64.bat'
if (-not (Test-Path $vcvars)) {
    throw "vcvars64.bat was not found at $vcvars"
}

# Batch files cannot modify their parent PowerShell process, so import the fixed toolchain's
# resulting environment. VisualStudioRoot comes from the trusted local vswhere result.
$environmentLines = & $env:ComSpec /d /s /c "`"$vcvars`" >nul && set"
if ($LASTEXITCODE -ne 0) {
    throw "vcvars64.bat exited with code $LASTEXITCODE."
}

foreach ($line in $environmentLines) {
    $separator = $line.IndexOf('=')
    if ($separator -le 0) { continue }
    $name = $line.Substring(0, $separator)
    $value = $line.Substring($separator + 1)
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
}

if (-not (Get-Command cl.exe -ErrorAction SilentlyContinue)) {
    throw 'vcvars64.bat completed without exposing cl.exe.'
}

