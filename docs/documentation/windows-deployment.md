# Windows Deployment Guide

## Purpose

This document explains how to deploy Clip Sandbox into a self-contained Windows folder and how to assemble that same folder manually if the deployment script is unavailable.

Default install path:

- `C:\installs\clip-sandbox\`

Bundled static server:

- `miniserve` v`0.33.0`

## Scripted Deployment

Run the repo-side deployment script from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\deployment\deploy.ps1
```

What it does:

1. Fully removes the existing `C:\installs\clip-sandbox\` folder if it exists.
2. Recreates the install directory.
3. Copies the runtime payload into that folder.

To deploy and launch the installed copy immediately:

```powershell
powershell -ExecutionPolicy Bypass -File .\deployment\deploy.ps1 -Launch
```

To deploy to a different location:

```powershell
powershell -ExecutionPolicy Bypass -File .\deployment\deploy.ps1 -InstallRoot D:\apps\clip-sandbox
```

## Launching the Installed Copy

From the installed folder:

```powershell
powershell -ExecutionPolicy Bypass -File C:\installs\clip-sandbox\launch.ps1
```

Default launch behavior:

1. Finds a free localhost port starting at `8787`.
2. Starts bundled `miniserve`.
3. Opens the default browser to the local app URL.

Optional troubleshooting launch that skips opening the browser:

```powershell
powershell -ExecutionPolicy Bypass -File C:\installs\clip-sandbox\launch.ps1 -NoBrowser
```

## Manual Deployment

If you are not using `deployment\deploy.ps1`, create the installed folder yourself and copy the exact runtime payload listed below.

Target folder:

- `C:\installs\clip-sandbox\`

Create this folder structure:

```text
C:\installs\clip-sandbox\
  app.js
  index.html
  launch.ps1
  deployment\
    miniserve-win.exe
    miniserve-LICENSE.txt
  docs\
    documentation\
      windows-deployment.md
  src\
    ...
```

Copy these items exactly from the repository:

1. `index.html` -> `C:\installs\clip-sandbox\index.html`
2. `app.js` -> `C:\installs\clip-sandbox\app.js`
3. `src\` -> `C:\installs\clip-sandbox\src\`
4. `deployment\launch.ps1` -> `C:\installs\clip-sandbox\launch.ps1`
5. `deployment\miniserve-win.exe` -> `C:\installs\clip-sandbox\deployment\miniserve-win.exe`
6. `deployment\miniserve-LICENSE.txt` -> `C:\installs\clip-sandbox\deployment\miniserve-LICENSE.txt`
7. `docs\documentation\windows-deployment.md` -> `C:\installs\clip-sandbox\docs\documentation\windows-deployment.md`

After copying those files, run:

```powershell
powershell -ExecutionPolicy Bypass -File C:\installs\clip-sandbox\launch.ps1
```

## X-Copy Portability

The installed folder is designed to be x-copyable.

That means you can copy `C:\installs\clip-sandbox\` to another path and launch it from there without reinstalling or rerunning `npm install`.

Example:

```powershell
Copy-Item C:\installs\clip-sandbox D:\portable\clip-sandbox -Recurse
powershell -ExecutionPolicy Bypass -File D:\portable\clip-sandbox\launch.ps1
```

## Assumptions

This deployment flow assumes:

1. Windows with PowerShell available.
2. The browser can be opened with `Start-Process`.
3. Localhost networking is available.
4. The installed copy is allowed to start a local static server process.
