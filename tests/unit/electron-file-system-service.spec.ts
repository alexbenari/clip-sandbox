// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { ElectronFileSystemService } from '../../src/adapters/electron/electron-file-system-service.js';

describe('electron file system service', () => {
  it('builds a writable folder session and renderer files from the desktop api', async () => {
    const api = {
      pickFolder: vi.fn(async () => ({
        canceled: false,
        folderPath: 'C:/clips',
        folderName: 'clips',
        files: [
          {
            name: 'alpha.txt',
            relativePath: 'alpha.txt',
            path: 'C:/clips/alpha.txt',
            text: 'hello',
            type: 'text/plain',
            mediaSource: 'file:///C:/clips/alpha.txt',
            lastModifiedMs: 123,
          },
        ],
      })),
    };
    const service = new ElectronFileSystemService({ api });

    const result = await service.pickFolder();

    expect(result.folderSession).toEqual({
      kind: 'desktop-directory',
      accessMode: 'readwrite',
      folderPath: 'C:/clips',
    });
    expect(result.folderName).toBe('clips');
    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe('alpha.txt');
    expect(result.files[0].webkitRelativePath).toBe('alpha.txt');
    expect(result.files[0].path).toBe('C:/clips/alpha.txt');
  });

  it('maps delete responses into renderer-facing errors', async () => {
    const api = {
      deleteFiles: vi.fn(async () => ({
        ok: false,
        code: 'partial',
        results: [
          { filename: 'alpha.mp4', ok: true },
          { filename: 'bravo.mp4', ok: false, code: 'delete-failed', error: { message: 'locked' } },
        ],
      })),
    };
    const service = new ElectronFileSystemService({ api });

    const result = await service.deleteFiles({
      folderSession: { accessMode: 'readwrite', folderPath: 'C:/clips' },
      filenames: ['alpha.mp4', 'bravo.mp4'],
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('partial');
    expect(result.results[0]).toMatchObject({ filename: 'alpha.mp4', ok: true });
    expect(result.results[0].error).toBeNull();
    expect(result.results[1]).toMatchObject({ filename: 'bravo.mp4', ok: false, code: 'delete-failed' });
    expect(result.results[1].error).toBeInstanceOf(Error);
    expect(result.results[1].error.message).toBe('locked');
  });
});
