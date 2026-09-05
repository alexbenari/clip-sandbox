import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const spikeRoot = path.resolve(import.meta.dirname, '..');
const requestedTarget = valueAfter('--target') ?? 'fixture-cfr-ffv1';
const fixtureManifest = JSON.parse(await readFile(path.join(spikeRoot, 'fixtures', 'manifest.json'), 'utf8'));
const fixtureId = requestedTarget.replace(/^fixture-/, '');
const fixture = fixtureManifest.fixtures.find((candidate) => candidate.id === fixtureId);
let sourcePath = fixture?.path;
if (!sourcePath) {
  const prepared = JSON.parse(await readFile(
    path.join(spikeRoot, 'artifacts', 'bestsource-preparation-raw.json'), 'utf8'));
  sourcePath = prepared.results.find((candidate) => candidate.id === requestedTarget)?.sourcePath;
}
if (!sourcePath) throw new Error(`Smoke target is unavailable: ${requestedTarget}`);
const output = path.join(spikeRoot, 'artifacts', `control-smoke-${requestedTarget}.json`);
await rm(output, { force: true });
const electron = (await import('electron')).default;

await new Promise((resolve, reject) => {
  const child = spawn(electron, [path.join(spikeRoot, 'electron', 'main.cjs')], {
    cwd: spikeRoot,
    windowsHide: true,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      FRAME_CONTROL_AUTO_SOURCE: sourcePath,
      FRAME_CONTROL_SMOKE_OUTPUT: output,
    },
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.on('error', reject);
  child.on('close', (code) => {
    if (code === 0) resolve();
    else reject(new Error(`Control smoke exited with ${code}: ${stderr}`));
  });
});

const result = JSON.parse(await readFile(output, 'utf8'));
if (result.error || result.playerError || !result.canvas?.visible || result.capturedRangeCount !== 1 ||
    result.heldAdvance !== 3 || result.singleStepAdvance !== 1 ||
    result.playbackAssetKind !== 'review-proxy' ||
    result.proxyProfile?.id !== 'mpeg4-gop1-q5-960-source-clock-aac-v1' ||
    !result.fullPlayerScrub?.fullPlayerUpdated || result.fullPlayerScrub.displayedFrames < 2 ||
    result.proxyPreparation?.canonicalFrameCount !== result.proxyPreparation?.proxyFrameCount) {
  throw new Error(`Control smoke failed: ${JSON.stringify(result)}`);
}
console.log(JSON.stringify(result, null, 2));

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index < 0 ? null : process.argv[index + 1];
}
