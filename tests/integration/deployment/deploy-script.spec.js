import { afterEach, describe, expect, test } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '../../..');
const deployScriptPath = path.join(repoRoot, 'deployment', 'deploy.ps1');
const tempRoots = [];
const childProcesses = [];
const serverProcessIds = [];

function makeInstallRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'clip-sandbox-deploy-'));
  tempRoots.push(root);
  return root;
}

function runDeploy(installRoot) {
  return execFileSync(
    'powershell',
    ['-ExecutionPolicy', 'Bypass', '-File', deployScriptPath, '-InstallRoot', installRoot],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    }
  );
}

function runInstalledLaunch(installRoot) {
  return execFileSync(
    'powershell',
    ['-ExecutionPolicy', 'Bypass', '-File', path.join(installRoot, 'launch.ps1'), '-NoBrowser'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    }
  );
}

function parseLaunchOutput(launchOutput) {
  const urlMatch = launchOutput.match(/Clip Sandbox is running at (\S+)/);
  const pidMatch = launchOutput.match(/miniserve PID:\s+(\d+)/);
  const browserUrlMatch = launchOutput.match(/Browser URL:\s+(\S+)/);
  if (!urlMatch || !pidMatch) {
    throw new Error(`Unexpected launch output: ${launchOutput}`);
  }

  return {
    url: urlMatch[1],
    pid: Number(pidMatch[1]),
    browserUrl: browserUrlMatch ? browserUrlMatch[1] : null,
  };
}

function waitFor(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function requestHeaders(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      response.resume();
      response.on('end', () => resolve(response.headers));
    });
    request.on('error', reject);
  });
}

afterEach(async () => {
  for (const child of childProcesses.splice(0)) {
    if (!child.killed) {
      child.kill();
    }
  }

  await waitFor(50);

  const trackedServerProcessIds = serverProcessIds.splice(0);

  for (const pid of trackedServerProcessIds) {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {}
  }

  for (const pid of trackedServerProcessIds) {
    for (let attempt = 0; attempt < 20 && isProcessRunning(pid); attempt += 1) {
      await waitFor(100);
    }
  }

  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('deploy.ps1', () => {
  test('redeploys even when the install root directory itself is in use', async () => {
    if (process.platform !== 'win32') {
      return;
    }

    const installRoot = makeInstallRoot();
    const staleDir = path.join(installRoot, 'stale');
    mkdirSync(staleDir, { recursive: true });
    writeFileSync(path.join(staleDir, 'old.txt'), 'stale');

    const locker = spawn(
      'powershell',
      ['-NoProfile', '-Command', 'Start-Sleep -Seconds 30'],
      {
        cwd: installRoot,
        stdio: 'ignore',
        windowsHide: true,
      }
    );
    childProcesses.push(locker);
    await waitFor(250);

    expect(locker.exitCode).toBeNull();
    expect(() => runDeploy(installRoot)).not.toThrow();
    expect(existsSync(path.join(installRoot, 'index.html'))).toBe(true);
    expect(existsSync(path.join(installRoot, 'launch.ps1'))).toBe(true);
    expect(existsSync(path.join(installRoot, 'stale', 'old.txt'))).toBe(false);
  }, 15000);

  test('stops the installed miniserve process before redeploying', async () => {
    if (process.platform !== 'win32') {
      return;
    }

    const installRoot = makeInstallRoot();
    runDeploy(installRoot);

    const launchOutput = runInstalledLaunch(installRoot);
    const { pid: miniservePid } = parseLaunchOutput(launchOutput);
    serverProcessIds.push(miniservePid);

    expect(isProcessRunning(miniservePid)).toBe(true);
    expect(() => runDeploy(installRoot)).not.toThrow();

    for (let attempt = 0; attempt < 10 && isProcessRunning(miniservePid); attempt += 1) {
      await waitFor(100);
    }

    expect(isProcessRunning(miniservePid)).toBe(false);
    expect(existsSync(path.join(installRoot, 'deployment', 'miniserve-win.exe'))).toBe(true);
  }, 20000);

  test('launch serves cache-busting headers for app assets', async () => {
    if (process.platform !== 'win32') {
      return;
    }

    const installRoot = makeInstallRoot();
    runDeploy(installRoot);

    const launchOutput = runInstalledLaunch(installRoot);
    const { url, pid } = parseLaunchOutput(launchOutput);
    serverProcessIds.push(pid);

    const headers = await requestHeaders(url);
    expect(headers['cache-control']).toBe('no-store, no-cache, must-revalidate');
    expect(headers.pragma).toBe('no-cache');
    expect(headers.expires).toBe('0');
  }, 20000);

  test('launch reports a unique browser URL so reopen uses a fresh navigation target', () => {
    if (process.platform !== 'win32') {
      return;
    }

    const installRoot = makeInstallRoot();
    runDeploy(installRoot);

    const launchOutput = runInstalledLaunch(installRoot);
    const { pid, browserUrl } = parseLaunchOutput(launchOutput);
    serverProcessIds.push(pid);

    expect(browserUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?launch=/);
  }, 20000);
});
