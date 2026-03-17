# Feature Spec: Windows Deployment Workflow

## 1. Summary

Add a Windows-only deployment workflow that installs the app into a default local path, makes the deployed copy self-contained, starts it on a local static server, and opens the app in the browser.

The workflow includes:
- a repo-side deployment script,
- a deployed launcher script,
- a bundled third-party static server shipped with the deployed app,
- a deployment document covering scripted deployment and manual deployment.

Default install path:
- `C:\installs\clip-sandbox\`

## 2. Problem

Today the app runs from the repo and from the test harness, but there is no supported way to create a clean local installation for day-to-day use outside the development workspace.

The user needs:
- a repeatable deployment command,
- a deployed copy that does not depend on the source repo,
- no homemade HTTP server implementation,
- a documented manual fallback path,
- a launcher that chooses an available localhost port automatically.

## 3. Goals and Non-Goals

### 3.1 Goals

1. Provide a single deployment script for Windows.
2. Deploy to `C:\installs\clip-sandbox\` by default.
3. Fully clear the target install directory before copying the new payload.
4. Make the deployed copy self-contained for runtime use.
5. Bundle `miniserve` with the deployment payload as the static-file server.
6. Launch the app on a free localhost port and open it in the user’s default browser.
7. Document both scripted deployment and manual deployment, including the exact runtime payload.

### 3.2 Non-Goals

1. No Linux or macOS deployment workflow.
2. No installer UI, MSI, registry integration, or Start Menu integration in this feature.
3. No auto-update mechanism.
4. No public-network hosting; the deployed server is for local machine use only.
5. No production bundling or transpilation pipeline unless later implementation work proves it necessary.

## 4. Users and Use Cases

### 4.1 Primary User

A developer or local power user who wants a stable installed copy of Clip Sandbox outside the repo.

### 4.2 Main Use Cases

1. Run one command from the repo to refresh the installed copy.
2. Double-click or run a launcher in the deployed folder to start the app later.
3. Rebuild the install cleanly without stale files surviving from older versions.
4. Manually deploy the app if the scripted path is unavailable.

## 5. Functional Requirements

### 5.1 Deployment Script

The repo must provide a Windows deployment script that:
1. deploys to `C:\installs\clip-sandbox\` by default,
2. removes the existing contents of that target directory before copying new files,
3. recreates the target directory if it does not exist,
4. copies the full runtime payload required to launch the app from the deployed location,
5. places the deployment document into the deployed output,
6. leaves the source repo untouched.

The script may allow optional overrides later, but the default path above is mandatory.

### 5.2 Self-Contained Deployed Runtime

The deployed app must be self-contained for runtime use.

Required meaning of self-contained:
- the deployed copy must not need the source repo,
- the deployed copy must not require `npm install` in the target directory,
- the deployed copy must include the static server binary or executable form it needs,
- the deployed copy must include a launcher script that starts the server and opens the app,
- the deployed copy folder must be x-copyable to any other location and still work from there in the same way.

This feature may rely on PowerShell being available on Windows.

### 5.3 Static Server Requirement

The deployed app must use bundled `miniserve` rather than a custom in-project server implementation.

Required `miniserve` behavior:
1. it must be shipped as part of the deployed payload,
2. it must be launched from the deployed folder by the PowerShell launcher,
3. it must be bound to localhost only,
4. it must serve the deployed app root with `index.html` as the entry point,
5. it must support launching on a free port selected at runtime.

### 5.4 Launcher Behavior

The deployed output must include a Windows launcher script that:
1. starts the bundled `miniserve` process from the deployed folder,
2. finds a free localhost port automatically,
3. serves the deployed app root so `index.html` is reachable,
4. opens the default browser to the correct local URL,
5. works without needing the source repo.

Expected URL shape:
- `http://127.0.0.1:<free-port>/`

If the preferred initial port is occupied, the launcher must try other free ports rather than fail immediately.

### 5.5 Replacement Semantics

Deployments are full replacements, not incremental syncs.

Required behavior:
1. if `C:\installs\clip-sandbox\` already exists, its contents are fully removed before the new deployment is copied,
2. the deployment must not leave stale files from previous versions behind,
3. unrelated content outside that install directory must never be touched.

### 5.6 Documentation Deliverable

This feature must ship with a deployment document.

That document must explain:
1. how to run the deployment script from the repo,
2. what default install path is used,
3. how to launch the deployed app,
4. how to deploy manually,
5. exactly which files and directories must be copied for manual deployment,
6. any assumptions required on the target Windows machine.

## 6. Runtime Payload Definition

The manual deployment documentation must enumerate the exact runtime payload.

At minimum, the deployed payload must include:
- `index.html`,
- `app.js`,
- the full `src/` tree,
- the launcher script,
- the bundled `miniserve` binary and any directly required companion files,
- the deployment document.

If implementation introduces any additional required runtime files, the manual deployment documentation must list them explicitly.

Files not required at runtime should not be copied unless they are intentionally included for support reasons.

## 7. UX and Operator Flow

### 7.1 Scripted Deployment Flow

1. User runs the deployment script from the repo.
2. The script clears `C:\installs\clip-sandbox\`.
3. The script copies the deployment payload into that directory.
4. The script finishes with a usable installed copy.
5. The user can then launch the deployed app from the installed location.

Optional but preferred:
- the deployment script may offer to launch the installed copy immediately after deployment.

### 7.2 Launch Flow from Installed Copy

1. User runs the launcher from `C:\installs\clip-sandbox\`.
2. The launcher starts the bundled static server on a free localhost port.
3. The launcher opens the browser to the app URL.
4. The app loads from the deployed directory, not from the repo.

### 7.3 Manual Deployment Flow

1. User creates or clears `C:\installs\clip-sandbox\`.
2. User copies the documented runtime payload into that directory.
3. User runs the deployed launcher.
4. The app starts successfully from the copied payload.

## 8. Failure Handling Expectations

1. If the deployment target cannot be cleared or written, the deployment script must fail with a clear error.
2. If the bundled server cannot start, the launcher must fail with a clear error.
3. If one localhost port is unavailable, the launcher must continue searching for a free port.
4. The workflow should avoid silent partial deployments.

## 9. Architecture Impact

This feature adds deployment tooling and documentation but should not materially change the app’s browser runtime architecture.

Expected implementation areas:
- `deployment/` for the repo-side deployment script, the launcher source, and the bundled `miniserve` asset,
- a deployed launcher script in the install payload,
- `docs/documentation/` for deployment documentation.

The feature should avoid coupling deployment concerns into the application runtime modules under `src/` unless a very small launch-path adjustment is required.

## 10. Verification Expectations

Implementation should include practical verification for:
1. clean deployment into an empty target folder,
2. redeployment over an existing install with stale files present,
3. launcher startup from the deployed folder,
4. browser open against a free localhost port,
5. app load from the installed copy,
6. documentation accuracy for the runtime payload.

## 11. Acceptance Criteria

The feature is complete when all of the following are true:

1. The repo contains a Windows deployment script for Clip Sandbox.
2. Running that script deploys the app to `C:\installs\clip-sandbox\` by default.
3. Existing contents of `C:\installs\clip-sandbox\` are fully cleared before deployment.
4. The deployed output is self-contained for runtime use and does not require the source repo.
5. The deployed output uses bundled `miniserve` rather than a custom in-repo server implementation.
6. The deployed launcher finds a free localhost port automatically.
7. The deployed launcher opens the app in the default browser.
8. The deployed copy serves and loads `index.html` correctly from the install directory.
9. A deployment document exists under `docs/documentation/` and explains both scripted and manual deployment.
10. The deployment document lists the exact files and directories required for manual deployment.
