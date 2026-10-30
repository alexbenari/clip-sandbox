// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const { TestRecycleBin } = createRequire(import.meta.url)('../../electron/test-recycle-bin.cjs');

describe('TestRecycleBin', () => {
  let root: string;

  beforeEach(() => { root = mkdtempSync(path.join(os.tmpdir(), 'clip-test-recycle-bin-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('moves files out of their folder into its own, keeping every file of the same name', async () => {
    const folder = path.join(root, 'clips');
    mkdirSync(folder);
    const bin = new TestRecycleBin(path.join(root, 'profile', 'test-recycle-bin'));
    writeFileSync(path.join(folder, 'alpha.mp4'), 'first');
    await bin.trashItem(path.join(folder, 'alpha.mp4'));
    writeFileSync(path.join(folder, 'alpha.mp4'), 'second');

    await bin.trashItem(path.join(folder, 'alpha.mp4'));

    const binFolder = path.join(root, 'profile', 'test-recycle-bin');
    const kept = readdirSync(binFolder).map(item => readFileSync(path.join(binFolder, item, 'alpha.mp4'), 'utf8')).sort();
    expect([existsSync(path.join(folder, 'alpha.mp4')), kept]).toEqual([false, ['first', 'second']]);
  });
});
