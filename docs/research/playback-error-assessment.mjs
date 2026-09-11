import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-playback-assessment-'));
const clips = path.join(directory, 'clips');
await fs.mkdir(clips);
await fs.writeFile(path.join(clips, 'damaged.mp4'), 'Invalid media fixture');
const env = { ...process.env, CLIP_SANDBOX_E2E: '1' };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.', `--user-data-dir=${path.join(directory, 'profile')}`], env });
try {
  const page = await app.firstWindow();
  await page.locator('#pickBtn').waitFor();
  await page.evaluate(folder => window.clipSandboxDesktop.__testSetNextFolderPath(folder), clips);
  await page.locator('#pickBtn').click();
  await page.waitForFunction(() => document.querySelector('#grid video')?.error);
  await page.locator('#grid .thumb').dblclick();
  await page.waitForFunction(() => document.querySelector('#zoomVideo')?.error);
  const evidence = await page.evaluate(() => {
    const video = document.querySelector('#zoomVideo');
    return { paused: video.paused, mediaErrorCode: video.error?.code,
      activityState: document.querySelector('#activityIndicatorBtn').dataset.state,
      activityText: document.querySelector('#activityIndicatorList').textContent };
  });
  evidence.metadataLogged = (await fs.readFile(path.join(clips, 'err.log'), 'utf8')).includes('Video metadata error');
  await fs.writeFile('docs/research/playback-error-assessment.json', JSON.stringify(evidence, null, 2));
  await page.screenshot({ path: 'docs/research/playback-error-assessment.png' });
  console.log(JSON.stringify(evidence));
} finally {
  await app.close();
  await fs.rm(directory, { recursive: true, force: true });
}
