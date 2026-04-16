// @ts-nocheck
import { FileSystemAdapter } from './file-system-adapter.js';

export class BrowserFileSystemService {
  constructor({
    win = window,
    fileSystemAdapter = new FileSystemAdapter({ win, doc: win?.document || document }),
  } = {}) {
    this.win = win;
    this.fileSystemAdapter = fileSystemAdapter;
  }

  createReadwriteSession(directoryHandle) {
    return {
      kind: 'browser-directory',
      accessMode: 'readwrite',
      directoryHandle,
    };
  }

  createReadonlySession() {
    return {
      kind: 'browser-file-list',
      accessMode: 'read-only',
    };
  }

  canUseDirectoryPicker() {
    return this.fileSystemAdapter.canUseDirectoryPicker();
  }

  canMutateDisk(folderSession) {
    return !!(
      folderSession?.accessMode === 'readwrite'
      && folderSession?.directoryHandle?.kind === 'directory'
      && folderSession?.directoryHandle?.getFileHandle
    );
  }

  async pickFolder({ onFileReadError } = {}) {
    const directoryHandle = await this.fileSystemAdapter.pickDirectory();
    const folderSession = this.createReadwriteSession(directoryHandle);
    const files = await this.fileSystemAdapter.readFilesFromDirectory(directoryHandle, {
      onFileReadError: (info) => onFileReadError?.(info, folderSession),
    });
    return {
      folderSession,
      files,
      folderName: directoryHandle?.name || '',
    };
  }

  selectionFromFileList(fileList) {
    const files = Array.from(fileList || []);
    return {
      folderSession: this.createReadonlySession(),
      files,
      folderName: this.fileSystemAdapter.folderNameFromFiles(files),
    };
  }

  async saveTextFile({
    folderSession = null,
    filename = 'default-collection.txt',
    text = '',
  } = {}) {
    if (this.canMutateDisk(folderSession)) {
      try {
        await this.fileSystemAdapter.saveTextToDirectory(folderSession.directoryHandle, filename, text);
        return { mode: 'saved' };
      } catch (error) {
        console.warn('Direct save failed, falling back to download.', error);
      }
    }
    this.fileSystemAdapter.downloadText(filename, text);
    return { mode: 'downloaded' };
  }

  async appendTextFile({
    folderSession = null,
    filename = '',
    text = '',
  } = {}) {
    if (!this.canMutateDisk(folderSession)) {
      return { mode: 'unavailable' };
    }
    await this.fileSystemAdapter.appendTextToDirectoryFile(folderSession.directoryHandle, filename, text);
    return { mode: 'saved' };
  }

  async deleteFiles({
    folderSession = null,
    filenames = [],
  } = {}) {
    if (!this.canMutateDisk(folderSession)) {
      return {
        ok: false,
        code: 'unavailable',
        results: Array.from(filenames || []).map((filename) => ({
          filename,
          ok: false,
          code: 'unavailable',
          error: new Error('Disk mutation is unavailable for the current folder session.'),
        })),
      };
    }

    const results = [];
    for (const filename of Array.from(filenames || [])) {
      try {
        await this.fileSystemAdapter.deleteTopLevelEntry(folderSession.directoryHandle, filename);
        results.push({ filename, ok: true });
      } catch (error) {
        results.push({
          filename,
          ok: false,
          code: 'delete-failed',
          error,
        });
      }
    }

    return {
      ok: results.every((result) => result.ok),
      code: results.every((result) => result.ok) ? 'deleted' : 'partial',
      results,
    };
  }
}
