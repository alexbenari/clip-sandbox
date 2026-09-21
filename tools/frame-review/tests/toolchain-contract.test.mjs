import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

import {
  assertManifestContract,
  verifyPinnedFile,
} from '../verify-dependencies.mjs';

const toolRoot = path.resolve(import.meta.dirname, '..');
const repositoryRoot = path.resolve(toolRoot, '..', '..');

test('production manifest selects one software-only FFmpeg distribution', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(toolRoot, 'dependency-manifest.json'), 'utf8'),
  );

  assert.doesNotThrow(() => assertManifestContract(manifest));
  assert.deepEqual(manifest.dependencies.ffmpeg.features, [
    'core',
    'avcodec',
    'avfilter',
    'avformat',
    'dav1d',
    'ffmpeg',
    'ffprobe',
    'gpl',
    'swresample',
    'swscale',
    'x264',
  ]);
  assert.equal(JSON.stringify(manifest).includes('qsv'), false);
  assert.equal(JSON.stringify(manifest).includes('libvpl'), false);
});

test('corrupt dependency diagnostics name the package, hash, and recovery command', async () => {
  const isolatedCache = await mkdtemp(path.join(tmpdir(), 'clip-sandbox-frame-review-'));
  const artifact = path.join(isolatedCache, 'libvlc.zip');
  await writeFile(artifact, 'corrupt copy', 'utf8');

  const expected = createHash('sha512').update('verified bytes').digest('hex');
  await assert.rejects(
    verifyPinnedFile({
      dependencyName: 'libvlc',
      filePath: artifact,
      expectedSha512: expected,
      recoveryCommand: 'npm run frame-review:bootstrap -- --ForceDownload',
    }),
    (error) => {
      assert.match(error.message, /libvlc/);
      assert.match(error.message, /SHA-512/);
      assert.match(error.message, new RegExp(expected));
      assert.match(error.message, /ForceDownload/);
      return true;
    },
  );

  await rm(isolatedCache, { recursive: true, force: true });
});

test('ordinary application scripts never bootstrap or build the native toolchain', async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'),
  );

  for (const scriptName of ['start', 'build', 'e2e']) {
    const command = packageJson.scripts[scriptName];
    assert.equal(/frame-review:(bootstrap|build)/.test(command), false, scriptName);
  }
});

test('native product verification fails fast with the explicit build command', async () => {
  const isolatedBuild = await mkdtemp(path.join(tmpdir(), 'clip-sandbox-native-products-'));
  const result = spawnSync(process.execPath, [path.join(toolRoot, 'verify-native-products.mjs')], {
    encoding: 'utf8',
    env: { ...process.env, FRAME_REVIEW_BUILD_ROOT: isolatedBuild },
    windowsHide: true,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Required frame-review product is missing/);
  assert.match(result.stderr, /npm run frame-review:build/);
  assert.match(result.stderr, /startup will never build it for you/);
  await rm(isolatedBuild, { recursive: true, force: true });
});
