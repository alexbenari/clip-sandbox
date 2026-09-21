import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { _electron as electron } from '@playwright/test';

const candidate = process.argv[2];
if (!candidate) {
  throw new Error('Usage: node tools/gif-extraction/check-electron-playback.mjs <generated-mp4>');
}

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const moviePath = path.resolve(repoRoot, candidate);
const generatedRoot = `${path.resolve(repoRoot, 'tests', 'fixtures', 'gif-extraction', 'generated')}${path.sep}`;
if (!moviePath.startsWith(generatedRoot)) {
  throw new Error(`Playback proof accepts only generated GIF-extraction fixtures: ${moviePath}`);
}

const profile = await mkdtemp(path.join(os.tmpdir(), 'clip-sandbox-gif-proof-'));
const app = await electron.launch({
  args: ['.', `--user-data-dir=${profile}`],
  cwd: repoRoot,
  env: { ...process.env, CLIP_SANDBOX_DISABLE_GPU: '1' },
});

try {
  const page = await app.firstWindow();
  const result = await page.evaluate(async (source) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.src = source;
    video.style.position = 'fixed';
    video.style.left = '-10000px';
    document.body.append(video);

    try {
      await new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('loadeddata timed out')), 10_000);
        video.addEventListener('loadeddata', () => {
          window.clearTimeout(timer);
          resolve(undefined);
        }, { once: true });
        video.addEventListener('error', () => {
          window.clearTimeout(timer);
          reject(new Error(`media error ${video.error?.code ?? 'unknown'}: ${video.error?.message ?? ''}`));
        }, { once: true });
      });
      await video.play();
      await new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('playback did not advance')), 10_000);
        const observe = () => {
          if (video.currentTime >= 0.1) {
            window.clearTimeout(timer);
            resolve(undefined);
          } else {
            window.requestAnimationFrame(observe);
          }
        };
        observe();
      });
      video.pause();
      return {
        duration: video.duration,
        currentTime: video.currentTime,
        width: video.videoWidth,
        height: video.videoHeight,
        readyState: video.readyState,
      };
    } finally {
      video.remove();
    }
  }, pathToFileURL(moviePath).href);
  console.log(JSON.stringify({ result: 'completed', moviePath, ...result }, null, 2));
} finally {
  await app.close();
  await rm(profile, { recursive: true, force: true });
}
