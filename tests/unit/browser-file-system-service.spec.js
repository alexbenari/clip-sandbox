import { describe, expect, it, vi } from 'vitest';
import { createBrowserFileSystemService } from '../../src/adapters/browser/browser-file-system-service.js';

describe('browser file system service', () => {
  it('reports directory picker availability through the adapter capability check', () => {
    const service = createBrowserFileSystemService({
      win: { tag: 'window' },
      canUseDirectoryPickerImpl: vi.fn(() => true),
    });

    expect(service.canUseDirectoryPicker()).toBe(true);
  });

  it('builds a writable folder session from the directory picker path', async () => {
    const readFilesFromDirectoryImpl = vi.fn(async (_handle, { onFileReadError }) => {
      await onFileReadError?.({ filename: 'broken.txt', attempts: 3, error: new Error('busy') });
      return [{ name: 'alpha.mp4' }];
    });
    const onFileReadError = vi.fn();
    const service = createBrowserFileSystemService({
      pickDirectoryImpl: vi.fn(async () => ({ kind: 'directory', name: 'clips', getFileHandle: vi.fn() })),
      readFilesFromDirectoryImpl,
    });

    const result = await service.pickFolder({ onFileReadError });

    expect(result.folderName).toBe('clips');
    expect(result.files).toEqual([{ name: 'alpha.mp4' }]);
    expect(result.folderSession).toMatchObject({
      kind: 'browser-directory',
      accessMode: 'readwrite',
    });
    expect(onFileReadError).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'broken.txt', attempts: 3 }),
      expect.objectContaining({ accessMode: 'readwrite' }),
    );
  });

  it('builds a read-only session from the file input fallback', () => {
    const files = [{ name: 'alpha.mp4', webkitRelativePath: 'clips/alpha.mp4' }];
    const service = createBrowserFileSystemService();

    const result = service.selectionFromFileList(files);

    expect(result.folderName).toBe('clips');
    expect(result.files).toEqual(files);
    expect(result.folderSession).toEqual({
      kind: 'browser-file-list',
      accessMode: 'read-only',
    });
  });

  it('saves directly when the session can mutate disk', async () => {
    const saveTextToDirectoryImpl = vi.fn(async () => {});
    const downloadTextImpl = vi.fn();
    const service = createBrowserFileSystemService({
      saveTextToDirectoryImpl,
      downloadTextImpl,
    });
    const folderSession = {
      accessMode: 'readwrite',
      directoryHandle: { kind: 'directory', getFileHandle: vi.fn() },
    };

    const result = await service.saveTextFile({
      folderSession,
      filename: 'subset.txt',
      text: 'alpha.mp4\n',
    });

    expect(result).toEqual({ mode: 'saved' });
    expect(saveTextToDirectoryImpl).toHaveBeenCalledWith(folderSession.directoryHandle, 'subset.txt', 'alpha.mp4\n');
    expect(downloadTextImpl).not.toHaveBeenCalled();
  });

  it('falls back to download semantics when the session is read-only', async () => {
    const saveTextToDirectoryImpl = vi.fn(async () => {});
    const downloadTextImpl = vi.fn();
    const service = createBrowserFileSystemService({
      saveTextToDirectoryImpl,
      downloadTextImpl,
    });

    const result = await service.saveTextFile({
      folderSession: { accessMode: 'read-only' },
      filename: 'subset.txt',
      text: 'alpha.mp4\n',
    });

    expect(result).toEqual({ mode: 'downloaded' });
    expect(saveTextToDirectoryImpl).not.toHaveBeenCalled();
    expect(downloadTextImpl).toHaveBeenCalledWith('subset.txt', 'alpha.mp4\n');
  });

  it('does not append text when the session cannot mutate disk', async () => {
    const appendTextToDirectoryFileImpl = vi.fn(async () => {});
    const service = createBrowserFileSystemService({ appendTextToDirectoryFileImpl });

    const result = await service.appendTextFile({
      folderSession: { accessMode: 'read-only' },
      filename: 'err.log',
      text: 'problem',
    });

    expect(result).toEqual({ mode: 'unavailable' });
    expect(appendTextToDirectoryFileImpl).not.toHaveBeenCalled();
  });
});
