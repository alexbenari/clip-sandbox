[CmdletBinding()]
param(
  [int]$PreferredPort = 8787,
  [switch]$NoBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$installRoot = $PSScriptRoot
$miniservePath = Join-Path $installRoot 'deployment\miniserve-win.exe'
$siteDir = $installRoot

if (-not (Test-Path -LiteralPath $miniservePath -PathType Leaf)) {
  throw "Bundled miniserve binary not found at '$miniservePath'."
}

function Test-PortAvailable {
  param([int]$Port)

  $listeners = @()
  try {
    foreach ($address in @(
      [System.Net.IPAddress]::Parse('127.0.0.1'),
      [System.Net.IPAddress]::Parse('::1')
    )) {
      $listener = [System.Net.Sockets.TcpListener]::new($address, $Port)
      $listener.Start()
      $listeners += $listener
    }
    return $true
  } catch {
    return $false
  } finally {
    foreach ($listener in $listeners) {
      try { $listener.Stop() } catch {}
    }
  }
}

function Find-FreePort {
  param(
    [int]$StartPort,
    [int]$MaxAttempts = 200
  )

  for ($offset = 0; $offset -lt $MaxAttempts; $offset++) {
    $candidate = $StartPort + $offset
    if (Test-PortAvailable -Port $candidate) {
      return $candidate
    }
  }

  throw "Could not find a free localhost port after checking $MaxAttempts ports starting at $StartPort."
}

function Wait-ForServer {
  param(
    [string]$Url,
    [System.Diagnostics.Process]$Process,
    [int]$TimeoutSeconds = 10
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $Process.Refresh()
    if ($Process.HasExited) {
      throw "miniserve exited before the app became reachable."
    }

    try {
      $request = [System.Net.HttpWebRequest]::Create($Url)
      $request.Method = 'GET'
      $request.Timeout = 2000
      $request.AllowAutoRedirect = $true
      $response = $request.GetResponse()
      $response.Close()
      return
    } catch {
      Start-Sleep -Milliseconds 200
    }
  } while ((Get-Date) -lt $deadline)

  throw "Timed out waiting for Clip Sandbox to become reachable at $Url."
}

$port = Find-FreePort -StartPort $PreferredPort
$url = "http://127.0.0.1:$port/"
$arguments = @(
  '-i', '127.0.0.1',
  '-i', '::1',
  '-p', "$port",
  '--index', 'index.html',
  "`"$siteDir`""
) -join ' '

$process = Start-Process -FilePath $miniservePath `
  -ArgumentList $arguments `
  -WorkingDirectory $siteDir `
  -PassThru

try {
  Wait-ForServer -Url $url -Process $process
} catch {
  try {
    if (-not $process.HasExited) {
      Stop-Process -Id $process.Id -Force
    }
  } catch {}
  throw
}

if (-not $NoBrowser) {
  Start-Process $url | Out-Null
}

Write-Output "Clip Sandbox is running at $url"
Write-Output "miniserve PID: $($process.Id)"
