// @vitest-environment node
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createFolderEntry } = require('../../electron/folder-entry.cjs');
const { RefinedClipPlacement } = require('../../electron/refined-clip-placement.cjs');

let root: string;
let folder: string;
let recycleBin: string;
let media: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'refined-clip-placement-'));
  folder = path.join(root, 'picks');
  recycleBin = path.join(root, 'recycle-bin');
  mkdirSync(folder);
  mkdirSync(recycleBin);
  mkdirSync(path.join(root, 'workspace'));
  media = mediaFile('media.mp4', 'refined');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function mediaFile(name: string, content: string) {
  const mediaPath = path.join(root, 'workspace', name);
  writeFileSync(mediaPath, content);
  return mediaPath;
}

function clipNamed(filename: string, content = 'original') {
  writeFileSync(path.join(folder, filename), content);
  return { folder, filename, path: path.join(folder, filename) };
}

const toRecycleBin = async (itemPath: string) => fsPromises.rename(itemPath, path.join(recycleBin, path.basename(itemPath)));

function placementWith({ trashItem = toRecycleBin, fileSystem = fsPromises as object, randomId = () => 'a1b2c3' as string } = {}) {
  return new RefinedClipPlacement({ trashItem, fileSystem, randomId });
}

const folderFiles = () => readdirSync(folder).sort();
const contentOf = (filename: string) => readFileSync(path.join(folder, filename), 'utf8');
const failing = (code: string) => async () => { throw Object.assign(new Error(code), { code }); };

describe('RefinedClipPlacement', () => {
  describe('Keep both', () => {
    it('saves the refined clip as <name>-refined.mp4 beside the original', async () => {
      const clip = clipNamed('Feature-002.mp4');

      const saved = await placementWith().keepBoth(clip, media, '-refined');

      expect(saved).toMatchObject({
        filename: 'Feature-002-refined.mp4', outcome: 'kept-both',
        entry: { name: 'Feature-002-refined.mp4', type: 'video/mp4', size: 'refined'.length },
      });
      expect([folderFiles(), contentOf('Feature-002.mp4'), contentOf('Feature-002-refined.mp4')])
        .toEqual([['Feature-002-refined.mp4', 'Feature-002.mp4'], 'original', 'refined']);
    });

    it('numbers a second refined clip -refined-2 without touching the first', async () => {
      const clip = clipNamed('Feature-002.mp4');
      await placementWith().keepBoth(clip, media, '-refined');

      const saved = await placementWith().keepBoth(clip, mediaFile('second.mp4', 'refined again'), '-refined');

      expect(saved.filename).toBe('Feature-002-refined-2.mp4');
      expect([contentOf('Feature-002-refined.mp4'), contentOf('Feature-002-refined-2.mp4')]).toEqual(['refined', 'refined again']);
    });

    it('names the saved clip after every staged edit, numbering a second one after the suffix', async () => {
      const clip = clipNamed('Feature-002.mp4');
      const first = await placementWith().keepBoth(clip, media, '-refined-looped');

      const second = await placementWith().keepBoth(clip, mediaFile('second.mp4', 'looped again'), '-refined-looped');

      expect([first.filename, second.filename]).toEqual(['Feature-002-refined-looped.mp4', 'Feature-002-refined-looped-2.mp4']);
    });

    it.each([
      ['a folder', '-looped\\..\\x'],
      ['no leading hyphen', 'looped'],
      ['nothing', ''],
    ])('refuses a suffix with %s without writing anything', async (_case, suffix) => {
      const clip = clipNamed('Feature-002.mp4');

      expect(() => placementWith().keepBoth(clip, media, suffix)).toThrow('The saved clip name suffix is invalid.');
      expect(folderFiles()).toEqual(['Feature-002.mp4']);
    });

    it('removes its partly written copy when writing the refined clip fails', async () => {
      const clip = clipNamed('Feature-002.mp4');
      const partlyWritten = async (_from: string, to: string) => {
        await fsPromises.writeFile(to, 'partial', { flag: 'wx' });
        throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
      };
      const placement = placementWith({ fileSystem: { ...fsPromises, copyFile: partlyWritten } });

      await expect(placement.keepBoth(clip, media, '-refined')).rejects.toThrow('ENOSPC');
      expect(folderFiles()).toEqual(['Feature-002.mp4']);
    });

    it('fails without writing anything when every Keep both name is taken', async () => {
      const clip = clipNamed('Feature-002.mp4');
      const placement = placementWith({ fileSystem: { ...fsPromises, copyFile: failing('EEXIST') } });

      await expect(placement.keepBoth(clip, media, '-refined')).rejects.toThrow('No free name is left for the refined clip.');
      expect(folderFiles()).toEqual(['Feature-002.mp4']);
    });
  });

  describe('Replace', () => {
    it('writes the new clip under a temporary name and gives it the original’s name only after the original is in the Recycle Bin', async () => {
      const clip = clipNamed('Feature-002.mp4');
      let releaseTrash!: () => void;
      const trashStarted = vi.fn();
      const placement = placementWith({
        trashItem: async itemPath => {
          trashStarted();
          await new Promise<void>(resolve => { releaseTrash = resolve; });
          await toRecycleBin(itemPath);
        },
      });

      const replacing = placement.replace(clip, media, '-refined');
      await vi.waitFor(() => expect(trashStarted).toHaveBeenCalled());
      const whileTrashing = { files: folderFiles(), original: contentOf('Feature-002.mp4'), temporary: contentOf('Feature-002.a1b2c3.refining') };
      releaseTrash();
      const saved = await replacing;
      // The saved clip is addressed as a folder listing addresses the same file.
      const listed = await createFolderEntry(path.join(folder, 'Feature-002.mp4'));

      expect(whileTrashing).toEqual({ files: ['Feature-002.a1b2c3.refining', 'Feature-002.mp4'], original: 'original', temporary: 'refined' });
      expect(saved).toEqual({
        filename: 'Feature-002.mp4', outcome: 'replaced',
        entry: {
          name: 'Feature-002.mp4', path: path.join(folder, 'Feature-002.mp4'), mediaSource: listed.mediaSource,
          type: 'video/mp4', size: 'refined'.length, lastModifiedMs: expect.any(Number),
        },
      });
      expect([folderFiles(), contentOf('Feature-002.mp4'), readdirSync(recycleBin)]).toEqual([['Feature-002.mp4'], 'refined', ['Feature-002.mp4']]);
    });

    it('keeps the new clip under the Keep both name and leaves the original in place when the Recycle Bin refuses it', async () => {
      const clip = clipNamed('Feature-002.mp4');

      const saved = await placementWith({ trashItem: failing('EBUSY') }).replace(clip, media, '-refined');

      expect(saved).toMatchObject({ filename: 'Feature-002-refined.mp4', outcome: 'kept-both', notice: 'recycle-bin-refused' });
      expect(folderFiles()).toEqual(['Feature-002-refined.mp4', 'Feature-002.mp4']);
      expect([contentOf('Feature-002.mp4'), contentOf('Feature-002-refined.mp4')]).toEqual(['original', 'refined']);
    });

    it('keeps the new clip under the Keep both name of its staged edits when the Recycle Bin refuses the original', async () => {
      const clip = clipNamed('Feature-002.mp4');

      const saved = await placementWith({ trashItem: failing('EBUSY') }).replace(clip, media, '-looped');

      expect(saved).toMatchObject({ filename: 'Feature-002-looped.mp4', outcome: 'kept-both', notice: 'recycle-bin-refused' });
    });

    it('replaces a clip in another format with <name>.mp4 and names the file it replaced', async () => {
      const clip = clipNamed('Feature-002.webm');

      const saved = await placementWith().replace(clip, media, '-refined');

      expect(saved).toMatchObject({ filename: 'Feature-002.mp4', outcome: 'replaced', replacedFilename: 'Feature-002.webm' });
      expect([folderFiles(), readdirSync(recycleBin)]).toEqual([['Feature-002.mp4'], ['Feature-002.webm']]);
    });

    it('keeps the new clip under the Keep both name, without touching the original, when <name>.mp4 is taken by another file', async () => {
      const clip = clipNamed('Feature-002.webm');
      writeFileSync(path.join(folder, 'Feature-002.mp4'), 'another clip');

      const saved = await placementWith().replace(clip, media, '-refined');

      expect(saved).toMatchObject({ filename: 'Feature-002-refined.mp4', outcome: 'kept-both', notice: 'name-taken' });
      expect(folderFiles()).toEqual(['Feature-002-refined.mp4', 'Feature-002.mp4', 'Feature-002.webm']);
      expect([contentOf('Feature-002.mp4'), readdirSync(recycleBin)]).toEqual(['another clip', []]);
    });

    it('gives the new clip the Keep both name when the original’s name is taken again after the Recycle Bin step', async () => {
      const clip = clipNamed('Feature-002.mp4');
      const placement = placementWith({
        trashItem: async itemPath => {
          await toRecycleBin(itemPath);
          writeFileSync(itemPath, 'another clip');
        },
      });

      const saved = await placement.replace(clip, media, '-refined');

      expect(saved).toMatchObject({
        filename: 'Feature-002-refined.mp4', outcome: 'replaced', replacedFilename: 'Feature-002.mp4', notice: 'name-taken',
      });
      expect([folderFiles(), contentOf('Feature-002.mp4'), contentOf('Feature-002-refined.mp4')])
        .toEqual([['Feature-002-refined.mp4', 'Feature-002.mp4'], 'another clip', 'refined']);
    });

    it('keeps the new clip visibly under the Keep both name when it cannot take the original’s name', async () => {
      const clip = clipNamed('Feature-002.mp4');
      const placement = placementWith({ fileSystem: { ...fsPromises, rename: failing('EPERM') } });

      const saved = await placement.replace(clip, media, '-refined');

      expect(saved).toMatchObject({
        filename: 'Feature-002-refined.mp4', outcome: 'replaced', replacedFilename: 'Feature-002.mp4', notice: 'rename-failed',
      });
      expect([folderFiles(), contentOf('Feature-002-refined.mp4'), readdirSync(recycleBin)])
        .toEqual([['Feature-002-refined.mp4'], 'refined', ['Feature-002.mp4']]);
    });

    it('leaves the new clip under its temporary name, and says so, when neither name can be given', async () => {
      const clip = clipNamed('Feature-002.mp4');
      const copyFromTemporaryFails = async (from: string, to: string, mode: number) => {
        if (from.endsWith('.refining')) throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
        return fsPromises.copyFile(from, to, mode);
      };
      const placement = placementWith({ fileSystem: { ...fsPromises, rename: failing('EPERM'), copyFile: copyFromTemporaryFails } });

      await expect(placement.replace(clip, media, '-refined')).rejects
        .toMatchObject({ code: 'kept-under-temporary-name', message: 'The refined clip was kept under a temporary name in the folder.' });
      expect([folderFiles(), contentOf('Feature-002.a1b2c3.refining'), readdirSync(recycleBin)])
        .toEqual([['Feature-002.a1b2c3.refining'], 'refined', ['Feature-002.mp4']]);
    });

    it('picks another temporary name when its first one is taken by an earlier save, leaving that file intact', async () => {
      const clip = clipNamed('Feature-002.mp4');
      writeFileSync(path.join(folder, 'Feature-002.a1b2c3.refining'), 'earlier refined clip');
      const ids = ['a1b2c3', 'd4e5f6'];

      const saved = await placementWith({ randomId: () => ids.shift()! }).replace(clip, media, '-refined');

      expect(saved).toMatchObject({ filename: 'Feature-002.mp4', outcome: 'replaced' });
      expect([folderFiles(), contentOf('Feature-002.a1b2c3.refining'), contentOf('Feature-002.mp4')])
        .toEqual([['Feature-002.a1b2c3.refining', 'Feature-002.mp4'], 'earlier refined clip', 'refined']);
    });

    it('still answers the saved clip when the temporary file cannot be removed afterwards', async () => {
      const clip = clipNamed('Feature-002.mp4');
      const placement = placementWith({ trashItem: failing('EBUSY'), fileSystem: { ...fsPromises, rm: failing('EPERM') } });

      const saved = await placement.replace(clip, media, '-refined');

      expect(saved).toMatchObject({ filename: 'Feature-002-refined.mp4', outcome: 'kept-both', notice: 'recycle-bin-refused' });
      expect(contentOf('Feature-002-refined.mp4')).toBe('refined');
    });

    it('leaves temporary files from earlier saves alone', async () => {
      const clip = clipNamed('Feature-002.mp4');
      writeFileSync(path.join(folder, 'Feature-002.mp4.refining'), 'earlier refined clip');
      writeFileSync(path.join(folder, 'Feature-002.d4e5f6.refining'), 'another earlier refined clip');

      await placementWith().replace(clip, media, '-refined');

      expect(folderFiles()).toEqual(['Feature-002.d4e5f6.refining', 'Feature-002.mp4', 'Feature-002.mp4.refining']);
      expect(contentOf('Feature-002.mp4.refining')).toBe('earlier refined clip');
    });

    it('keeps both refined clips, and the original whose .mp4 name was taken first, when clips sharing a name are replaced at the same time', async () => {
      const webm = clipNamed('Feature.webm');
      const mkv = clipNamed('Feature.mkv');
      let ids = 0;
      const placement = placementWith({ randomId: () => `id${++ids}` });

      const saved = await Promise.all([
        placement.replace(webm, mediaFile('from-webm.mp4', 'refined webm'), '-refined'),
        placement.replace(mkv, mediaFile('from-mkv.mp4', 'refined mkv'), '-refined'),
      ]);

      const contents = saved.map(({ filename }) => contentOf(filename)).sort();
      expect([folderFiles(), contents, readdirSync(recycleBin)])
        .toEqual([['Feature-refined.mp4', 'Feature.mkv', 'Feature.mp4'], ['refined mkv', 'refined webm'], ['Feature.webm']]);
    });
  });
});
