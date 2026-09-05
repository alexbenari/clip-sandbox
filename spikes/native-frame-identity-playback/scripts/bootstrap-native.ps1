param(
    [switch]$InstallMissing,
    [switch]$ForceDownload
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$spikeRoot = Split-Path -Parent $PSScriptRoot
$depsRoot = Join-Path $spikeRoot '.deps'
$manifestPath = Join-Path $spikeRoot 'dependency-manifest.json'
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'

New-Item -ItemType Directory -Force -Path $depsRoot | Out-Null
$resolvedDepsRoot = [IO.Path]::GetFullPath($depsRoot).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

function Assert-WithinDepsRoot {
    param([string]$Path)
    $resolvedPath = [IO.Path]::GetFullPath($Path)
    if (-not $resolvedPath.StartsWith($resolvedDepsRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing filesystem mutation outside the spike dependency root: $resolvedPath"
    }
    return $resolvedPath
}

function Get-WorkingCommand {
    param([string]$Name, [string[]]$Arguments = @('--version'))
    foreach ($candidate in @(Get-Command $Name -All -ErrorAction SilentlyContinue)) {
        try {
            $output = @(@(& $candidate.Source @Arguments 2>&1) |
                Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
            if ($LASTEXITCODE -eq 0 -and $output.Count -gt 0) { return $candidate }
        } catch {
            continue
        }
    }
    return $null
}

function Get-VsCppInstallation {
    if (-not (Test-Path $vswhere)) {
        return $null
    }
    $path = & $vswhere -latest -products * `
        -requires $manifest.toolchain.requiredComponent -property installationPath
    if ([string]::IsNullOrWhiteSpace($path)) { return $null }
    $installationVersion = & $vswhere -latest -products * `
        -requires $manifest.toolchain.requiredComponent -property installationVersion
    $lineVersion = [int]([string]$installationVersion).Split('.')[0]
    $year = & $vswhere -latest -products * `
        -requires $manifest.toolchain.requiredComponent -property catalog_productLineVersion
    return [pscustomobject]@{
        path = [string]$path
        productLineVersion = $lineVersion
        generator = "Visual Studio $lineVersion $year"
    }
}

function Install-VsCppWorkload {
    $vsInstallPath = & $vswhere -latest -products * -version '[17.0,18.0)' -property installationPath
    if ([string]::IsNullOrWhiteSpace($vsInstallPath)) {
        throw 'Visual Studio 2022 is not installed. Install VS 2022 Build Tools with the Desktop development with C++ workload.'
    }

    $setup = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\setup.exe'
    if (-not (Test-Path $setup)) {
        throw "Visual Studio Installer was not found at $setup"
    }

    Write-Output 'Adding the Visual Studio 2022 C++ workload. This can take several minutes.'
    $arguments = @(
        'modify', '--installPath', [string]$vsInstallPath,
        '--add', 'Microsoft.VisualStudio.Workload.NativeDesktop',
        '--includeRecommended', '--passive', '--norestart'
    )
    $process = Start-Process -FilePath $setup -ArgumentList $arguments -Wait -PassThru
    if ($process.ExitCode -notin @(0, 3010)) {
        throw "Visual Studio Installer exited with code $($process.ExitCode)."
    }
}

$vsCpp = Get-VsCppInstallation
if (-not $vsCpp) {
    if (-not $InstallMissing) {
        throw 'Visual Studio 2022 C++ tools are missing. Re-run with -InstallMissing.'
    }
    Install-VsCppWorkload
    $vsCpp = Get-VsCppInstallation
    if (-not $vsCpp) {
        throw 'Visual Studio C++ tools are still unavailable after installation.'
    }
}

$meson = Get-Command meson -ErrorAction SilentlyContinue
if (-not $meson) {
    if (-not $InstallMissing) {
        throw 'Meson is missing. Re-run with -InstallMissing.'
    }
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) {
        throw 'Python is required to install the pinned Meson version.'
    }
    & $python.Source -m pip install --user "meson==$($manifest.dependencies.meson.version)"
    if ($LASTEXITCODE -ne 0) { throw 'Pinned Meson installation failed.' }
    $userBase = & $python.Source -c 'import site; print(site.USER_BASE)'
    $userScripts = Join-Path $userBase 'Scripts'
    if (Test-Path $userScripts) { $env:Path = "$userScripts;$env:Path" }
    $meson = Get-Command meson -ErrorAction SilentlyContinue
}

$vlcPin = $manifest.dependencies.libvlc
$archivePath = Join-Path $depsRoot 'libvlc.zip'
$vlcRoot = Join-Path $depsRoot 'libvlc'
if ($ForceDownload -or -not (Test-Path $archivePath)) {
    Write-Output "Downloading pinned LibVLC from $($vlcPin.url)"
    Invoke-WebRequest -Uri $vlcPin.url -OutFile $archivePath -UseBasicParsing
}

$actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA512).Hash.ToLowerInvariant()
if ($actualHash -ne $vlcPin.sha512.ToLowerInvariant()) {
    Remove-Item -LiteralPath $archivePath -Force
    throw "LibVLC SHA-512 mismatch. Expected $($vlcPin.sha512), got $actualHash."
}

if (-not (Test-Path (Join-Path $vlcRoot 'libvlc.dll'))) {
    $extractRoot = Join-Path $depsRoot 'libvlc-extract'
    $extractRoot = Assert-WithinDepsRoot $extractRoot
    $vlcRoot = Assert-WithinDepsRoot $vlcRoot
    if (Test-Path $extractRoot) { Remove-Item -LiteralPath $extractRoot -Recurse -Force }
    if (Test-Path $vlcRoot) { Remove-Item -LiteralPath $vlcRoot -Recurse -Force }
    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractRoot
    $dll = Get-ChildItem -LiteralPath $extractRoot -Filter libvlc.dll -Recurse | Select-Object -First 1
    if (-not $dll) { throw 'The verified VLC archive did not contain libvlc.dll.' }
    $runtimeRoot = Assert-WithinDepsRoot $dll.Directory.FullName
    Move-Item -LiteralPath $runtimeRoot -Destination $vlcRoot
    Remove-Item -LiteralPath $extractRoot -Recurse -Force
}

$vlcSourcePin = $manifest.dependencies.libvlcSource
$vlcSourceRoot = Join-Path $depsRoot 'vlc-source'
if (-not (Test-Path (Join-Path $vlcSourceRoot '.git'))) {
    & git clone --filter=blob:none --no-checkout $vlcSourcePin.url $vlcSourceRoot
    if ($LASTEXITCODE -ne 0) { throw 'Failed to clone the pinned VLC source repository.' }
}
& git -C $vlcSourceRoot sparse-checkout init --cone
& git -C $vlcSourceRoot sparse-checkout set include
& git -C $vlcSourceRoot checkout --detach $vlcSourcePin.commit
if ($LASTEXITCODE -ne 0) { throw 'Failed to check out the pinned VLC source commit.' }

foreach ($pinName in @('bestsource', 'vcpkg')) {
    $pin = $manifest.dependencies.$pinName
    $target = Join-Path $depsRoot "$pinName-source"
    if (-not (Test-Path (Join-Path $target '.git'))) {
        & git clone --filter=blob:none --no-checkout $pin.url $target
        if ($LASTEXITCODE -ne 0) { throw "Failed to clone $pinName." }
    }
    & git -C $target fetch --depth 1 origin $pin.commit
    if ($LASTEXITCODE -ne 0) { throw "Failed to fetch pinned $pinName commit." }
    & git -C $target checkout --detach $pin.commit
    if ($LASTEXITCODE -ne 0) { throw "Failed to check out pinned $pinName commit." }
}

$resolved = [ordered]@{
    schemaVersion = 1
    generatedAtUtc = [DateTime]::UtcNow.ToString('o')
    libvlc = [ordered]@{
        root = $vlcRoot
        dll = Join-Path $vlcRoot 'libvlc.dll'
        plugins = Join-Path $vlcRoot 'plugins'
        include = Join-Path $vlcSourceRoot 'include'
        sourceRoot = $vlcSourceRoot
        sourceCommit = $vlcSourcePin.commit
        version = $vlcPin.version
        sha512 = $actualHash
    }
    visualStudio = [ordered]@{
        root = $vsCpp.path
        productLineVersion = $vsCpp.productLineVersion
        generator = $vsCpp.generator
    }
    cmake = [ordered]@{
        path = (Get-WorkingCommand -Name 'cmake').Source
        version = (& (Get-WorkingCommand -Name 'cmake').Source --version | Select-Object -First 1)
    }
    meson = [ordered]@{
        path = $(if ($meson) { $meson.Source } else { '' })
        version = $(if ($meson) { (& $meson.Source --version | Select-Object -First 1) } else { '' })
    }
    bestsource = [ordered]@{ root = Join-Path $depsRoot 'bestsource-source'; commit = $manifest.dependencies.bestsource.commit }
    vcpkg = [ordered]@{ root = Join-Path $depsRoot 'vcpkg-source'; commit = $manifest.dependencies.vcpkg.commit }
    ffmpeg = [ordered]@{
        path = (Get-Command ffmpeg).Source
        version = (& ffmpeg -version | Select-Object -First 1)
    }
    ffprobe = [ordered]@{
        path = (Get-Command ffprobe).Source
        version = (& ffprobe -version | Select-Object -First 1)
    }
}

$resolvedPath = Join-Path $depsRoot 'resolved-dependencies.json'
$resolvedJson = $resolved | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText($resolvedPath, $resolvedJson, [Text.UTF8Encoding]::new($false))
Write-Output "Resolved dependencies written to $resolvedPath"
