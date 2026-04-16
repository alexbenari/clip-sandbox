// @ts-nocheck
import { describe, expect, it, vi, afterEach } from 'vitest';
import { FileSystemAdapter } from '../../src/adapters/browser/file-system-adapter.js';

function createDirectoryHandle(entries) {
  return {
    async *values() {
      for (const entry of entries) yield entry;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

function createAdapter() {
  return new FileSystemAdapter({
    win: {
      isSecureContext: true,
      top: {},
      self: {},
      URL,
    },
    doc: document,
  });
}

describe('readFilesFromDirectory', () => {
  it('retries transient getFile failures so collection files are not dropped', async () => {
    const retryableFile = { name: 'minus-1.txt', type: 'text/plain' };
    let attempts = 0;
    const adapter = createAdapter();

    const files = await adapter.readFilesFromDirectory(createDirectoryHandle([
      {
        kind: 'file',
        name: 'minus-1.txt',
        async getFile() {
          attempts += 1;
          if (attempts === 1) throw new Error('The cloud file provider is busy.');
          return retryableFile;
        },
      },
    ]));

    expect(attempts).toBe(2);
    expect(files).toEqual([retryableFile]);
  });

  it('reports persistent getFile failures and continues enumerating other files', async () => {
    const onFileReadError = vi.fn();
    const goodFile = { name: 'minus-2.txt', type: 'text/plain' };
    const adapter = createAdapter();

    const files = await adapter.readFilesFromDirectory(
      createDirectoryHandle([
        {
          kind: 'file',
          name: 'broken.txt',
          async getFile() {
            throw new Error('Permission revoked.');
          },
        },
        {
          kind: 'file',
          name: 'minus-2.txt',
          async getFile() {
            return goodFile;
          },
        },
      ]),
      { onFileReadError }
    );

    expect(files).toEqual([goodFile]);
    expect(onFileReadError).toHaveBeenCalledTimes(1);
    expect(onFileReadError).toHaveBeenCalledWith(expect.objectContaining({
      filename: 'broken.txt',
      attempts: 3,
      error: expect.any(Error),
    }));
  });
});

describe('folderNameFromFiles', () => {
  it('extracts the folder name from webkitRelativePath', () => {
    const adapter = createAdapter();
    const folderName = adapter.folderNameFromFiles([
      { webkitRelativePath: 'my-folder/subdir/clip-01.mp4' },
      { webkitRelativePath: 'my-folder/clip-02.mp4' },
    ]);

    expect(folderName).toBe('my-folder');
  });

  it('returns an empty string when files do not include a relative path', () => {
    const adapter = createAdapter();
    expect(adapter.folderNameFromFiles([{ name: 'clip-01.mp4' }])).toBe('');
    expect(adapter.folderNameFromFiles([])).toBe('');
  });
});

describe('top-level folder entry helpers', () => {
  it('detects top-level folder entries from webkitRelativePath', () => {
    const adapter = createAdapter();
    expect(adapter.isTopLevelFolderEntry({ webkitRelativePath: 'clips/one.mp4' })).toBe(true);
    expect(adapter.isTopLevelFolderEntry({ webkitRelativePath: 'clips/sub/one.mp4' })).toBe(false);
  });

  it('filters nested files out of a folder selection', () => {
    const adapter = createAdapter();
    const files = adapter.topLevelFiles([
      { name: 'one.mp4', webkitRelativePath: 'clips/one.mp4' },
      { name: 'two.mp4', webkitRelativePath: 'clips/sub/two.mp4' },
      { name: 'subset.txt', webkitRelativePath: 'clips/subset.txt' },
    ]);

    expect(files.map((file) => file.name)).toEqual(['one.mp4', 'subset.txt']);
  });
});

