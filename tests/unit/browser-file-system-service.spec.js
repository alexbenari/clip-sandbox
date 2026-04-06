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

  it('deletes files in order when the session can mutate disk', async () => {
    const deleteTopLevelEntryImpl = vi.fn(async () => {});
    const service = createBrowserFileSystemService({ deleteTopLevelEntryImpl });
    const folderSession = {
      accessMode: 'readwrite',
      directoryHandle: { kind: 'directory', getFileHandle: vi.fn() },
    };

    const result = await service.deleteFiles({
      folderSession,
      filenames: ['alpha.mp4', 'bravo.webm'],
    });

    expect(result).toEqual({
      ok: true,
      code: 'deleted',
      results: [
        { filename: 'alpha.mp4', ok: true },
        { filename: 'bravo.webm', ok: true },
      ],
    });
    expect(deleteTopLevelEntryImpl.mock.calls).toEqual([
      [folderSession.directoryHandle, 'alpha.mp4'],
      [folderSession.directoryHandle, 'bravo.webm'],
    ]);
  });

  it('returns unavailable results without attempting deletion for read-only sessions', async () => {
    const deleteTopLevelEntryImpl = vi.fn(async () => {});
    const service = createBrowserFileSystemService({ deleteTopLevelEntryImpl });

    const result = await service.deleteFiles({
      folderSession: { accessMode: 'read-only' },
      filenames: ['alpha.mp4'],
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('unavailable');
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      filename: 'alpha.mp4',
      ok: false,
      code: 'unavailable',
    });
    expect(result.results[0].error).toBeInstanceOf(Error);
    expect(deleteTopLevelEntryImpl).not.toHaveBeenCalled();
  });

  it('keeps ordered mixed outcomes for partial delete results', async () => {
    const deleteTopLevelEntryImpl = vi.fn(async (_handle, filename) => {
      if (filename === 'bravo.webm') throw new Error('locked');
    });
    const service = createBrowserFileSystemService({ deleteTopLevelEntryImpl });
    const folderSession = {
      accessMode: 'readwrite',
      directoryHandle: { kind: 'directory', getFileHandle: vi.fn() },
    };

    const result = await service.deleteFiles({
      folderSession,
      filenames: ['alpha.mp4', 'bravo.webm', 'charlie.mp4'],
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('partial');
    expect(result.results).toHaveLength(3);
    expect(result.results[0]).toEqual({ filename: 'alpha.mp4', ok: true });
    expect(result.results[1]).toMatchObject({
      filename: 'bravo.webm',
      ok: false,
      code: 'delete-failed',
    });
    expect(result.results[1].error).toBeInstanceOf(Error);
    expect(result.results[2]).toEqual({ filename: 'charlie.mp4', ok: true });
  });
});
