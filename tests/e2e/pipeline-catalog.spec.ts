import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('the configured root populates an expandable pipeline catalog at startup', async () => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-pipeline-catalog-e2e-'));
  const profile = path.join(temporaryRoot, 'profile');
  const pipelinesRoot = path.join(temporaryRoot, 'pipelines');
  const videoFixture = 'tests/e2e/fixtures/video-edit/clips/source.mp4';
  await fs.mkdir(pipelinesRoot);
  await writePipeline(pipelinesRoot, 'Film Alpha', videoFixture, { 'Review.txt': 'alpha-01.mp4\n' });
  await writePipeline(pipelinesRoot, 'extraction-tmp', videoFixture);
  await fs.mkdir(path.join(pipelinesRoot, 'Empty'));
  await fs.mkdir(profile);
  await fs.writeFile(path.join(profile, 'app-settings.json'), JSON.stringify({
    pipelinesRootPath: pipelinesRoot,
    singleClipAudioDefault: false,
    startupScreenId: 'gif-extraction',
  }));

  const environment: NodeJS.ProcessEnv = { ...process.env, CLIP_SANDBOX_E2E: '1' };
  delete environment.ELECTRON_RUN_AS_NODE;
  const launch = () => electron.launch({ args: ['.', `--user-data-dir=${profile}`], cwd: process.cwd(), env: environment });
  let app = await launch();
  try {
    const page = await app.firstWindow();
    await expect(page.locator('[aria-label="Expand extraction-tmp"]')).toBeVisible();
    await expect(page.locator('[aria-label="Expand Film Alpha"]')).toBeVisible();
    await expect(page.locator('[aria-label="Expand Empty"]')).toHaveCount(0);
    expect(await page.locator('.pipeline-tree-expand .pipeline-tree-name').allTextContents())
      .toEqual(['extraction-tmp', 'Film Alpha']);

    await page.locator('[aria-label="Expand Film Alpha"]').click();
    await expect(page.locator('[aria-label="Expand collection Review"]')).toBeVisible();
    await expect(page.locator('.pipeline-tree-clips')).toContainText('alpha-01.mp4');
    await page.locator('[aria-label="Expand collection Review"]').click();
    await expect(page.locator('.pipeline-tree-collections .pipeline-tree-clip-list')).toContainText('alpha-01.mp4');

    await page.locator('[aria-label="Load Film Alpha"]').click();
    await expect(page.locator('#appScreenSelector')).toHaveValue('collection');
    await expect(page.locator('#collectionScreen')).toBeVisible();
    await expect(page.locator('#grid .thumb')).toHaveCount(1);
    await expect(page.locator('#grid')).toContainText('alpha-01.mp4');
    await expect(page.locator('[aria-label="Collapse Film Alpha"]')).toBeVisible();
    await expect(page.locator('[aria-label="Collapse collection Review"]')).toBeVisible();
  } finally {
    await app.close();
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

async function writePipeline(root: string, name: string, videoFixture: string, collections: Record<string, string> = {}): Promise<void> {
  const pipelinePath = path.join(root, name);
  await fs.mkdir(pipelinePath);
  const clipName = name === 'Film Alpha' ? 'alpha-01.mp4' : 'extracted-01.mp4';
  await fs.copyFile(videoFixture, path.join(pipelinePath, clipName));
  await Promise.all(Object.entries(collections).map(([filename, content]) => fs.writeFile(path.join(pipelinePath, filename), content)));
}
