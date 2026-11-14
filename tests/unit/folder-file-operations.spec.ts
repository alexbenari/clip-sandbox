// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { WindowsFileNameValidity } from '../../src/domain/windows-file-name-validity.js';

const require = createRequire(import.meta.url);
const { FolderFileOperations } = require('../../electron/folder-file-operations.cjs');

const sender = { id: 7 };
const folderPath = 'D:\\clips';

function operations({ trashItem = vi.fn(async (_itemPath: string) => undefined) } = {}) {
  const fs = { writeFile: vi.fn(async () => undefined), appendFile: vi.fn(async () => undefined) };
  const folderAccess = {
    requireKnownPath: vi.fn((_sender: unknown, requested: string) => {
      if (requested !== folderPath) throw new Error('Folder access was not granted.');
      return requested;
    }),
  };
  const files = new FolderFileOperations({ folderAccess, fileNameValidity: new WindowsFileNameValidity(), trashItem, fs });
  return { files, fs, trashItem };
}

describe('FolderFileOperations', () => {
  it('saves text under the trimmed name in the window\'s folder', async () => {
    const { files, fs } = operations();

    const answer = await files.saveText(sender, { folderPath, filename: ' order.txt ', text: 'a.mp4' });

    expect(fs.writeFile.mock.calls).toEqual([['D:\\clips\\order.txt', 'a.mp4', 'utf8']]);
    expect(answer).toEqual({ mode: 'saved' });
  });

  it('appends text to the named file in the window\'s folder', async () => {
    const { files, fs } = operations();

    await files.appendText(sender, { folderPath, filename: 'log.txt', text: 'line' });

    expect(fs.appendFile.mock.calls).toEqual([['D:\\clips\\log.txt', 'line', 'utf8']]);
  });

  it('refuses to save under a name that leaves the folder', async () => {
    const { files, fs } = operations();

    await expect(files.saveText(sender, { folderPath, filename: '..\\outside.txt', text: 'x' }))
      .rejects.toThrow('Invalid top-level filename: ..\\outside.txt');
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('refuses a folder the window was not granted', async () => {
    const { files, fs } = operations();

    await expect(files.saveText(sender, { folderPath: 'D:\\elsewhere', filename: 'order.txt', text: 'x' }))
      .rejects.toThrow('Folder access was not granted.');
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('moves every named file to the Recycle Bin', async () => {
    const { files, trashItem } = operations();

    const answer = await files.trash(sender, { folderPath, filenames: ['a.mp4', 'b.mp4'] });

    expect(trashItem.mock.calls).toEqual([['D:\\clips\\a.mp4'], ['D:\\clips\\b.mp4']]);
    expect(answer).toEqual({ ok: true, code: 'trashed', results: [{ filename: 'a.mp4', ok: true }, { filename: 'b.mp4', ok: true }] });
  });

  it('moves nothing when any name is invalid', async () => {
    const { files, trashItem } = operations();

    const answer = await files.trash(sender, { folderPath, filenames: ['a.mp4', 'sub\\b.mp4'] });

    expect(trashItem).not.toHaveBeenCalled();
    expect(answer).toMatchObject({ ok: false, code: 'partial' });
  });

  it('reports a file that could not be moved and still moves the rest', async () => {
    const trashItem = vi.fn(async (itemPath: string) => {
      if (itemPath.endsWith('a.mp4')) throw new Error('The file is in use.');
    });
    const { files } = operations({ trashItem });

    const answer = await files.trash(sender, { folderPath, filenames: ['a.mp4', 'b.mp4'] });

    expect(answer).toEqual({ ok: false, code: 'partial', results: [
      { filename: 'a.mp4', ok: false, code: 'trash-failed', error: { message: 'The file is in use.' } },
      { filename: 'b.mp4', ok: true },
    ] });
  });
});
