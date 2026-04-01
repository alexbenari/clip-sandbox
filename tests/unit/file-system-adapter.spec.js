import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFilesFromDirectory } from '../../src/adapters/browser/file-system-adapter.js';

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

describe('readFilesFromDirectory', () => {
  it('retries transient getFile failures so collection files are not dropped', async () => {
    const retryableFile = { name: 'minus-1.txt', type: 'text/plain' };
    let attempts = 0;

    const files = await readFilesFromDirectory(createDirectoryHandle([
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

    const files = await readFilesFromDirectory(
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
