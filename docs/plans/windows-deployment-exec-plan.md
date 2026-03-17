# Implement a Self-Contained Windows Deployment Workflow

## Why this matters

Users need a supported way to run Clip Sandbox outside the development repo. The shipped deployment flow must produce a clean install at `C:\installs\clip-sandbox\`, fully replace older installs, carry its own static server, and let the installed copy launch itself on a free localhost port without depending on the source tree.

This plan implements the approved deployment spec in [windows-deployment-spec.md](/C:/dev/clip-sandbox/docs/specs/windows-deployment-spec.md). The outcome is not just build tooling: it is an observable installed app plus deployment documentation that a user can follow manually if the script is unavailable.

## Progress

- [x] (2026-03-16 22:50Z) Approved deployment spec recorded in `docs/specs/windows-deployment-spec.md`.
- [x] (2026-03-17 01:05Z) Repository layout direction updated: repo-root `deployment/` will hold bundled `miniserve` plus deployment scripts, and `docs/documentation/` will hold the deployment guide.
- [x] (2026-03-17 01:08Z) Bundled `miniserve` v`0.33.0` into `deployment/miniserve-win.exe` with a local license file.
- [x] (2026-03-17 01:09Z) Added repo-side deployment automation under `deployment/deploy.ps1`.
- [x] (2026-03-17 01:10Z) Added an installed launcher in `deployment/launch.ps1` that finds a free port, starts `miniserve`, and opens the app.
- [x] (2026-03-17 01:09Z) Added deployment documentation under `docs/documentation/` and wired it into the deployed payload.
- [x] (2026-03-17 01:20Z) Verified clean deploy, redeploy cleanup, launcher startup under `powershell.exe`, free-port fallback, and x-copy portability.

## Surprises & Discoveries

- Discovery: the repo currently has no `deployment/` directory.
  Evidence: the current repo root listing contains no deployment-specific top-level directory; the new layout will need to be created during implementation.

- Discovery: the repo currently has no `docs/documentation/` directory.
  Evidence: `Get-ChildItem docs -Force` listed only `docs/plans` and `docs/specs` plus top-level guide files.

- Discovery: current project tooling depends on Node for development and test execution, but the deployed runtime must not.
  Evidence: `package.json` only defines `npm`-based dev/test scripts; the approved spec requires a self-contained installed copy with bundled `miniserve`.

- Discovery: `http-server` exists only as a dev dependency and should not be reused as the deployed runtime server.
  Evidence: `package.json` lists `"http-server": "^14.1.1"` under `devDependencies`, while the approved spec now explicitly locks `miniserve`.

- Discovery: the bundled Windows `miniserve` asset for the current implementation is `v0.33.0`, and a single renamed binary path keeps both scripts and docs simpler.
  Evidence: GitHub release metadata for `svenstaro/miniserve` listed `miniserve-0.33.0-x86_64-pc-windows-msvc.exe`; the implementation bundles it as `deployment/miniserve-win.exe`.

- Discovery: Windows PowerShell compatibility was blocked by the launcher's readiness probe, not by `miniserve` itself.
  Evidence: direct execution of the copied `miniserve` binary served the app successfully, while `powershell.exe -File launch.ps1` timed out until the probe moved from `Invoke-WebRequest` to a plain .NET `HttpWebRequest`.

## Decision Log

- Decision: the execution will create `deployment/` at repo root and `docs/documentation/` under `docs/`.
  Rationale: the user refined the repository layout so the deployment binary and scripts live together, while documentation uses a reusable `docs/documentation/` area for future docs beyond deployment.
  Date/Author: 2026-03-17 / Codex

- Decision: the deployed runtime will be driven by a PowerShell launcher plus a bundled `miniserve` binary, not by Node or an in-repo custom server.
  Rationale: this directly satisfies the approved spec, preserves x-copy portability, and avoids dependence on a dev toolchain at the install location.
  Date/Author: 2026-03-17 / Codex

- Decision: deployment verification will be manual-but-repeatable rather than automated.
  Rationale: the user explicitly removed the need for automated deployment testing in the approved spec, while still requiring practical verification of real installed behavior.
  Date/Author: 2026-03-17 / Codex

- Decision: bundle the current Windows binary as `deployment/miniserve-win.exe` plus `deployment/miniserve-LICENSE.txt`.
  Rationale: a stable in-repo file name keeps `deploy.ps1`, `launch.ps1`, and the manual deployment guide deterministic while still preserving the third-party license.
  Date/Author: 2026-03-17 / Codex

- Decision: keep the launcher compatible with both `pwsh` and `powershell.exe` by using a plain .NET HTTP readiness check.
  Rationale: the installed copy should not depend on PowerShell 7-specific behavior when a Windows machine may invoke `.ps1` files through Windows PowerShell.
  Date/Author: 2026-03-17 / Codex

## Outcomes & Retrospective

Shipped outcomes:
- A repo-side deployment script creates a full install at `C:\installs\clip-sandbox\`.
- Redeploying removes stale files instead of incrementally merging with older installs.
- The installed folder can be copied elsewhere and still launched successfully.
- The installed launcher picks a free localhost port, starts bundled `miniserve`, and opens the browser.
- Deployment documentation exists both in the repo under `docs/documentation/` and inside the deployed payload.

Validation evidence collected:
- `powershell -ExecutionPolicy Bypass -File .\deployment\deploy.ps1` produced `C:\installs\clip-sandbox\` with `index.html`, `app.js`, `src\`, `launch.ps1`, `deployment\miniserve-win.exe`, `deployment\miniserve-LICENSE.txt`, and `docs\documentation\windows-deployment.md`.
- Adding `C:\installs\clip-sandbox\stale-marker.txt` and rerunning `deploy.ps1` removed the marker, proving full replacement semantics.
- `powershell -ExecutionPolicy Bypass -File C:\installs\clip-sandbox\launch.ps1 -NoBrowser` launched successfully and served `http://127.0.0.1:8787/`.
- Forcing port `8787` busy with a listener caused the launcher to move to `http://127.0.0.1:8788/`.
- `robocopy C:\installs\clip-sandbox C:\installs\clip-sandbox-portable3 /E` followed by `powershell -ExecutionPolicy Bypass -File C:\installs\clip-sandbox-portable3\launch.ps1 -NoBrowser` launched the x-copied install successfully.

Residual risks to watch:
- future `miniserve` version bumps will require refreshing the bundled binary and reviewing the manual deployment guide for any path or flag changes,
- the installed launcher intentionally spawns a new `miniserve` process each time it runs; if reuse of an existing server becomes important, that should be handled as a separate product decision,
- the deployment guide must stay aligned if additional runtime files are introduced later.

## Context and orientation

This repository is a browser-native static app:

- `index.html`: HTML shell and CSS for the app.
- `app.js`: compatibility entrypoint that re-exports `initApp`.
- `src/`: ES-module application runtime code loaded directly by the browser.
- `docs/specs/windows-deployment-spec.md`: approved feature spec for deployment.
- `docs/specs/static-server.md`: explicit recommendation to use `miniserve` as the bundled static server.
- `package.json`: development-only scripts and dependencies; these are not acceptable runtime dependencies for the installed copy.

Current relevant constraints:
1. The app must be served over HTTP because it uses browser module imports and local file APIs that are not reliable from `file://`.
2. The deployed runtime must not depend on the repo or on `npm install`.
3. The install directory is `C:\installs\clip-sandbox\` by default and must be fully cleared on redeploy.
4. The installed folder must remain functional if copied to another path.
5. Deployment docs must live under `docs/documentation/`, and the deployed payload must also include those docs.

Terms used in this plan:
- “x-copy” means a plain file/folder copy operation, for example Windows Explorer copy-paste or `Copy-Item`, with no installer-specific registration steps.
- “launcher” means the PowerShell script inside the deployed folder that starts the local server and opens the browser.
- “runtime payload” means the exact files that must exist in the deployed folder for Clip Sandbox to launch correctly.

## Milestone 1 - Establish the bundled server asset and deployment layout

### Scope

Define and create the repository locations needed for deployment: the bundled `miniserve` asset location, the repo-side deployment directory, and the documentation directory. This milestone reduces ambiguity before any deployment logic is written.

### Changes

- File: `deployment/`
  Edit: add the Windows `miniserve` binary and any directly required companion files, with a naming convention that the launcher can reference deterministically.

- File: `deployment/`
  Edit: create the directory that will hold the repo-side deployment script and launcher source.

- File: `docs/documentation/`
  Edit: create the directory that will hold deployment documentation intended for both repo readers and the deployed payload.

- File: `docs/plans/windows-deployment-exec-plan.md`
  Edit: record the exact asset path and file naming once the `miniserve` packaging shape is fixed.

### Validation

- Command: `Get-ChildItem deployment -Recurse`
  Expected: the chosen bundled `miniserve` asset path exists and is readable.

- Command: `Get-ChildItem deployment`
  Expected: the `deployment/` directory exists and contains the expected deployment assets.

- Command: `Get-ChildItem docs\\documentation`
  Expected: the `docs/documentation/` directory exists.

### Rollback/Containment

If the chosen binary packaging is wrong, do not continue into launcher or deploy-script work. Replace the asset location and update this plan before any code begins to depend on the incorrect path.

## Milestone 2 - Add the repo-side deployment script

### Scope

Create a PowerShell deployment script that builds the deployed folder in `C:\installs\clip-sandbox\` by fully removing old contents and copying only the intended runtime payload.

### Changes

- File: `deployment/deploy.ps1`
  Edit: create the deployment entrypoint. It must:
  - target `C:\installs\clip-sandbox\` by default,
  - fully clear that directory if it exists,
  - recreate the target directory,
  - copy the runtime app files (`index.html`, `app.js`, `src/`),
  - copy the bundled `miniserve` asset,
  - copy the deployed launcher,
  - copy the deployment documentation from `docs/documentation/`.

- File: `deployment/deploy.ps1`
  Edit: keep the copy list explicit so the manual deployment doc can mirror it exactly.

- File: `docs/plans/windows-deployment-exec-plan.md`
  Edit: record any runtime payload additions discovered while implementing the copy list.

### Validation

- Command: `powershell -ExecutionPolicy Bypass -File .\deployment\deploy.ps1`
  Expected: `C:\installs\clip-sandbox\` is recreated and contains the expected runtime payload.

- Command: `Get-ChildItem C:\installs\clip-sandbox -Force`
  Expected: only the intended deployed files/directories are present; stale files from previous installs are absent.

- Command: add a temporary marker file under `C:\installs\clip-sandbox\`, rerun the deploy script, then list the directory
  Expected: the marker file is gone after redeploy, proving full replacement semantics.

### Rollback/Containment

If the deployment script removes too much or copies the wrong payload, stop immediately and fix the path handling before continuing. Do not add launcher logic on top of an unsafe deploy script.

## Milestone 3 - Add the installed launcher and free-port startup behavior

### Scope

Create the PowerShell launcher that runs from the deployed folder, finds a free localhost port, starts `miniserve`, and opens the app in the browser.

### Changes

- File: `deployment/launch.ps1` or another source location inside `deployment/` that the deployment script copies into the installed root as `launch.ps1`
  Edit: implement the launcher. It must:
  - resolve paths relative to its own file location so the install remains x-copyable,
  - locate the bundled `miniserve` binary inside the installed folder,
  - find a free localhost port,
  - launch `miniserve` bound to localhost only with `index.html` as the entry point,
  - open the browser to `http://127.0.0.1:<port>/`,
  - fail clearly if the binary is missing or the server cannot start.

- File: `docs/plans/windows-deployment-exec-plan.md`
  Edit: record the final `miniserve` command line once implemented, especially any flags required for localhost binding and index behavior.

### Validation

- Command: `powershell -ExecutionPolicy Bypass -File C:\installs\clip-sandbox\launch.ps1`
  Expected: a `miniserve` process starts, the browser opens to the installed app, and the app loads successfully.

- Command: start a dummy listener on the preferred first port, then run `launch.ps1`
  Expected: the launcher selects a different free port and still opens the app successfully.

- Command: `Copy-Item C:\installs\clip-sandbox C:\installs\clip-sandbox-copy -Recurse`
  Expected: the copied folder exists and is structurally identical enough to run.

- Command: `powershell -ExecutionPolicy Bypass -File C:\installs\clip-sandbox-copy\launch.ps1`
  Expected: the x-copied install also launches correctly without repo access.

### Rollback/Containment

If the launcher only works from the original install path, stop and fix all path resolution to be relative to the launcher location. X-copy portability is a required behavior, not a stretch goal.

## Milestone 4 - Write deployment documentation and align it with reality

### Scope

Create the deployment documentation under `docs/documentation/` and ensure the deployment script copies it into the installed output.

### Changes

- File: `docs/documentation/windows-deployment.md`
  Edit: document:
  - how to run the repo deployment script,
  - the default install path,
  - how to launch the installed copy,
  - how to redeploy,
  - how to deploy manually,
  - the exact runtime payload to copy for manual deployment,
  - any assumptions about PowerShell and Windows.

- File: `deployment/deploy.ps1`
  Edit: ensure the deployment document is copied into the installed folder in a stable location.

- File: `docs/plans/windows-deployment-exec-plan.md`
  Edit: record the final doc path and any last-minute payload changes.

### Validation

- Command: `Get-Content docs\documentation\windows-deployment.md`
  Expected: the repo contains a complete deployment guide.

- Command: `Get-Content C:\installs\clip-sandbox\docs\documentation\windows-deployment.md`
  Expected: the deployed output also contains the same guide or an intentionally equivalent copy.

- Command: perform a manual deployment using only the documentation
  Expected: the manually assembled folder launches successfully and matches the documented payload.

### Rollback/Containment

If the documentation and actual runtime payload diverge, update the docs before declaring the feature complete. The manual deployment instructions are part of the deliverable, not optional polish.

## Milestone 5 - Final verification and cleanup

### Scope

Confirm the complete workflow from repo deploy to installed launch to x-copy portability, and remove any unnecessary leftovers that are not part of the intended runtime payload.

### Changes

- File: `deployment/deploy.ps1`
  Edit: tighten any final path handling, output messages, or payload filtering discovered during verification.

- File: `deployment/launch.ps1` or deployed `launch.ps1`
  Edit: tighten any final startup robustness issues discovered during verification.

- File: `docs/documentation/windows-deployment.md`
  Edit: update verification-dependent details such as final payload tree or launcher usage text.

- File: `docs/plans/windows-deployment-exec-plan.md`
  Edit: update `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` with actual execution results.

### Validation

- Command: `powershell -ExecutionPolicy Bypass -File .\deployment\deploy.ps1`
  Expected: a fresh install is produced with no errors.

- Command: `powershell -ExecutionPolicy Bypass -File C:\installs\clip-sandbox\launch.ps1`
  Expected: the installed app launches successfully.

- Command: manual x-copy and relaunch from a different path
  Expected: the copied install also launches successfully.

- Command: manual review of `C:\installs\clip-sandbox\docs\documentation\windows-deployment.md`
  Expected: the final docs match the shipped payload and launch behavior.

### Rollback/Containment

If final verification reveals that the install works only in one narrow path or only after undeclared setup steps, the feature is not complete. Fix the deployment or documentation before closing the work.
