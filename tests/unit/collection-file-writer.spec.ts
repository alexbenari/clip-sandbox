import { describe, expect, it, vi } from 'vitest';

import { CollectionFileWriter } from '../../src/app/collection-file-writer.js';
import { Collection } from '../../src/domain/collection.js';

const openFolder = { currentFolderSession: { folderPath: 'C:/clips' } };

describe('CollectionFileWriter', () => {
  it('writes the collection as one clip name per line into the open folder', async () => {
    const saveTextFile = vi.fn(async () => ({ mode: 'saved' }));
    const writer = new CollectionFileWriter({ saveTextFile }, openFolder);
    const collection = Collection.fromFilename({ filename: 'subset.txt', orderedClipNames: ['bravo.mp4', 'alpha.mp4'] });

    await expect(writer.write(collection)).resolves.toEqual({ mode: 'saved' });

    expect(saveTextFile).toHaveBeenCalledWith({
      folderSession: openFolder.currentFolderSession,
      filename: 'subset.txt',
      text: 'bravo.mp4\nalpha.mp4\n',
    });
  });

  it('refuses a collection that has no file name', async () => {
    const saveTextFile = vi.fn();
    const writer = new CollectionFileWriter({ saveTextFile }, openFolder);

    await expect(writer.write(new Collection({ collectionName: 'unsaved' }))).rejects.toThrow('Collection filename is required.');
    expect(saveTextFile).not.toHaveBeenCalled();
  });

  it('passes a failed write on to the caller', async () => {
    const writer = new CollectionFileWriter({ saveTextFile: vi.fn(async () => { throw new Error('disk full'); }) }, openFolder);

    await expect(writer.write(Collection.fromFilename({ filename: 'subset.txt', orderedClipNames: ['alpha.mp4'] })))
      .rejects.toThrow('disk full');
  });
});
