import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, _electron as electron, type Page } from '@playwright/test';

const project = path.resolve('.');
const dependenciesPath = path.join(project, 'tools', 'frame-review', '.deps', 'resolved-dependencies.json');

test('top-row and visible jumps use elapsed seconds in playback and directional exact scrub', async () => {
  test.setTimeout(180_000);
  if (process.platform !== 'win32') throw new Error('The frame-review native runtime requires Windows.');
  const dependencies = JSON.parse((await fs.readFile(dependenciesPath, 'utf8')).replace(/^\uFEFF/, ''));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-jump-seconds-'));
  const evidenceDirectory = path.join(project, 'native-build', 'jump-by-seconds-evidence');
  await fs.mkdir(evidenceDirectory, { recursive: true });
  const movie = path.join(directory, 'jump-source.mkv');
  const rawVideo = path.join(directory, 'jump-source.rgb');
  const rawAudio = path.join(directory, 'jump-source.pcm');
  const toolEnv = {
    ...process.env,
    PATH: [dependencies.ffmpeg.runtimeDllRoot, dependencies.compiler.runtimeDllRoot, process.env.PATH ?? ''].join(path.delimiter),
  };
  try {
    const width = 160;
    const height = 90;
    const frames = 180;
    const pixels = Buffer.alloc(width * height * 3 * frames);
    for (let frame = 0; frame < frames; frame += 1) {
      const start = frame * width * height * 3;
      const end = start + width * height * 3;
      for (let offset = start; offset < end; offset += 3) {
        pixels[offset] = frame % 256;
        pixels[offset + 1] = (frame * 3) % 256;
        pixels[offset + 2] = (frame * 7) % 256;
      }
    }
    await Promise.all([
      fs.writeFile(rawVideo, pixels),
      fs.writeFile(rawAudio, Buffer.alloc(18 * 48_000 * 2 * 2)),
    ]);
    await run(dependencies.ffmpeg.path, [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', `${width}x${height}`,
      '-framerate', '10', '-i', rawVideo,
      '-f', 's16le', '-ar', '48000', '-ac', '2', '-i', rawAudio,
      '-c:v', 'mpeg4', '-q:v', '3', '-c:a', 'aac', '-shortest', movie,
    ], toolEnv);
    const duration = Number((await run(dependencies.ffprobe.path, [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', movie,
    ], toolEnv)).trim());
    expect(duration).toBeGreaterThanOrEqual(17.9);
    expect(duration).toBeLessThanOrEqual(18.1);

    const env: NodeJS.ProcessEnv = { ...process.env, CLIP_SANDBOX_E2E: '1' };
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await electron.launch({ args: ['.', `--user-data-dir=${path.join(directory, 'profile')}`], cwd: project, env });
    try {
      const page = await app.firstWindow();
      await page.evaluate(() => {
        const win = window as Window & {
          __jumpPaintedTimeUs?: number;
          __clipSandboxFrameReviewPaintProbe?: {
            painted(frame: { kind: string; playbackTimestampUs?: bigint }): void;
          };
        };
        win.__clipSandboxFrameReviewPaintProbe = {
          painted: frame => {
            if (frame.kind === 'playback-frame' && frame.playbackTimestampUs !== undefined) {
              win.__jumpPaintedTimeUs = Number(frame.playbackTimestampUs);
            }
          },
        };
      });
      await page.evaluate(sourcePath => (window as never as { clipSandboxDesktop: { __testSetNextMoviePath(path: string): Promise<void> } })
        .clipSandboxDesktop.__testSetNextMoviePath(sourcePath), movie);
      await page.getByRole('button', { name: 'Open movie...' }).click();
      await expect(page.locator('.frame-review-readiness')).toContainText('Exact review ready', { timeout: 90_000 });
      const selector = page.getByRole('combobox', { name: 'Jump by seconds' });
      const jump = page.locator('[data-command="jump-seconds"]');
      await expect(selector).toHaveValue('2');
      await expect(jump).toHaveText('Jump +2s');
      await expect(jump).toBeEnabled();
      await page.screenshot({ path: path.join(evidenceDirectory, 'gif-extraction-jump-controls.png') });

      await page.keyboard.press('1');
      await expectTimeNear(page, 1);
      await page.keyboard.press('Space');
      await expect(page.locator('[data-command="play-pause"]')).toHaveAttribute('data-playing', 'true');
      await expectPaintedNear(page, 1);
      for (const [key, seconds] of [['2', 2], ['3', 5], ['4', 7], ['5', 10]] as const) {
        await seekPlaybackToStart(page);
        await page.evaluate(() => { (window as Window & { __jumpPaintedTimeUs?: number }).__jumpPaintedTimeUs = undefined; });
        await page.keyboard.press(key);
        await expectTimeNear(page, seconds);
        await expectPaintedNear(page, seconds);
      }

      await page.keyboard.press('Space');
      await expect(page.locator('[data-command="play-pause"]')).toHaveAttribute('data-playing', 'false');
      await setExactFrame(page, 120);
      await page.keyboard.press('ArrowLeft');
      await expect(jump).toHaveText('Jump −2s');
      await page.keyboard.press('3');
      await expectTimeNear(page, 7);
      await selector.selectOption('2');
      await jump.click();
      await expectTimeNear(page, 5);
      await expect(page.locator('.frame-review-identity')).toContainText('Frame ');

      await page.keyboard.press('5');
      await page.keyboard.press('5');
      await page.keyboard.press('ArrowRight');
      await expect(jump).toHaveText('Jump +2s');
      await expect(page.locator('.frame-review-identity')).toContainText('Frame ');

      await setExactFrame(page, 20);
      await page.keyboard.press('q');
      await setExactFrame(page, 60);
      await page.keyboard.press('w');
      await page.keyboard.press('x');
      const captured = page.locator('[data-range-id="range-1"]');
      await expect(captured).toHaveCount(1);
      await captured.locator('[data-refine-range]').click();
      await expect(page.locator('#refineGifScreen')).toBeVisible();
      await expect(selector).toHaveValue('2');
      await expect(page.locator('.frame-review-identity')).toHaveText('Frame 20');
      await page.keyboard.press('2');
      await expectTimeNear(page, 4);
      await page.screenshot({ path: path.join(evidenceDirectory, 'refine-gif-jump-controls.png') });
    } finally {
      await app.close();
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('variable-frame-rate scrub jumps resolve by time and clamp to indexed endpoints', async () => {
  test.setTimeout(90_000);
  if (process.platform !== 'win32') throw new Error('The frame-review native runtime requires Windows.');
  const movie = path.join(project, 'tests', 'fixtures', 'gif-extraction', 'generated', 'vfr-audio.mkv');
  await fs.stat(movie);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-jump-vfr-'));
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, CLIP_SANDBOX_E2E: '1' };
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await electron.launch({ args: ['.', `--user-data-dir=${path.join(directory, 'profile')}`], cwd: project, env });
    try {
      const page = await app.firstWindow();
      await page.evaluate(sourcePath => (window as never as { clipSandboxDesktop: { __testSetNextMoviePath(path: string): Promise<void> } })
        .clipSandboxDesktop.__testSetNextMoviePath(sourcePath), movie);
      await page.getByRole('button', { name: 'Open movie...' }).click();
      await expect(page.locator('.frame-review-readiness')).toContainText(/Exact review ready|exact review unavailable/, { timeout: 60_000 });
      const readiness = await page.locator('.frame-review-readiness').textContent();
      if (!readiness?.includes('Exact review ready')) {
        throw new Error(`VFR exact preparation failed: ${await page.locator('.frame-review-error').textContent()}`);
      }

      await setExactFrame(page, 7);
      await page.getByRole('combobox', { name: 'Jump by seconds' }).selectOption('2');
      await page.locator('[data-command="jump-seconds"]').click();
      await expectTimeWithin(page, 2.375, 0.15);

      await page.keyboard.press('5');
      await expect(page.locator('.frame-review-identity')).toHaveText('Frame 71');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('5');
      await expect(page.locator('.frame-review-identity')).toHaveText('Frame 0');
    } finally {
      await app.close();
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

async function seekPlaybackToStart(page: Page): Promise<void> {
  await page.locator('.frame-review-progress-row input').evaluate(element => {
    const input = element as HTMLInputElement;
    input.value = '0';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expectTimeNear(page, 0);
}

async function setExactFrame(page: Page, index: number): Promise<void> {
  await page.locator('.frame-review-progress-row input').evaluate((element, frameIndex) => {
    const input = element as HTMLInputElement;
    input.value = String(frameIndex);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, index);
  await expect(page.locator('.frame-review-identity')).toHaveText(`Frame ${index}`);
}

async function expectTimeNear(page: Page, seconds: number): Promise<void> {
  await expectTimeWithin(page, seconds, 0.8);
}

async function expectTimeWithin(page: Page, seconds: number, tolerance: number): Promise<void> {
  await expect.poll(async () => {
    const text = await page.locator('[data-time="current"]').textContent();
    const fields = (text ?? '').split(':').map(Number);
    const current = fields.length === 3 ? fields[0] * 3600 + fields[1] * 60 + fields[2] : -1;
    return Math.abs(current - seconds);
  }, { timeout: 3_000 }).toBeLessThan(tolerance);
}

async function expectPaintedNear(page: Page, seconds: number): Promise<void> {
  await expect.poll(() => page.evaluate(targetSeconds => {
    const time = (window as Window & { __jumpPaintedTimeUs?: number }).__jumpPaintedTimeUs;
    return time === undefined ? Number.POSITIVE_INFINITY : Math.abs(time / 1_000_000 - targetSeconds);
  }, seconds), { timeout: 3_000 }).toBeLessThan(0.8);
}

function run(executable: string, args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, windowsHide: true, shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr)));
  });
}
