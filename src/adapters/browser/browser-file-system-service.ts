import { FileSystemAdapter } from './file-system-adapter.js';
import type { FileReadErrorInfo, FileSystemDirectoryHandleLike, FolderEntryFile } from './file-system-adapter.js';

export type BrowserReadwriteSession = {
  kind: 'browser-directory';
  accessMode: 'readwrite';
  directoryHandle: FileSystemDirectoryHandleLike;
};

export type BrowserReadonlySession = {
  kind: 'browser-file-list';
  accessMode: 'read-only';
};

export type BrowserFolderSession = BrowserReadwriteSession | BrowserReadonlySession | null;

export type BrowserDeleteFileResult =
  | { filename: string; ok: true }
  | { filename: string; ok: false; code: 'unavailable' | 'delete-failed'; error: unknown };

type BrowserFileSystemServiceOptions = {
  win?: Window;
  fileSystemAdapter?: FileSystemAdapter;
};

export class BrowserFileSystemService {
  win: Window;
  fileSystemAdapter: FileSystemAdapter;

  constructor({
    win = window,
    fileSystemAdapter = new FileSystemAdapter({ win, doc: win?.document || document }),
  }: BrowserFileSystemServiceOptions = {}) {
    this.win = win;
    this.fileSystemAdapter = fileSystemAdapter;
  }

  createReadwriteSession(directoryHandle: FileSystemDirectoryHandleLike): BrowserReadwriteSession {
    return {
      kind: 'browser-directory',
      accessMode: 'readwrite',
      directoryHandle,
    };
  }

  createReadonlySession(): BrowserReadonlySession {
    return {
      kind: 'browser-file-list',
      accessMode: 'read-only',
    };
  }

  canUseDirectoryPicker(): boolean {
    return this.fileSystemAdapter.canUseDirectoryPicker();
  }

  canMutateDisk(folderSession: BrowserFolderSession): folderSession is BrowserReadwriteSession {
    return !!(
      folderSession?.accessMode === 'readwrite'
      && folderSession?.directoryHandle?.kind === 'directory'
      && folderSession?.directoryHandle?.getFileHandle
    );
  }

  async pickFolder({ onFileReadError }: {
    onFileReadError?: (info: FileReadErrorInfo, folderSession: BrowserReadwriteSession) => void | Promise<void>;
  } = {}): Promise<{ folderSession: BrowserReadwriteSession; files: FolderEntryFile[]; folderName: string }> {
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

  selectionFromFileList(fileList: Iterable<FolderEntryFile>): { folderSession: BrowserReadonlySession; files: FolderEntryFile[]; folderName: string } {
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
  }: { folderSession?: BrowserFolderSession; filename?: string; text?: string } = {}): Promise<{ mode: 'saved' | 'downloaded' }> {
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
  }: { folderSession?: BrowserFolderSession; filename?: string; text?: string } = {}): Promise<{ mode: 'saved' | 'unavailable' }> {
    if (!this.canMutateDisk(folderSession)) {
      return { mode: 'unavailable' };
    }
    await this.fileSystemAdapter.appendTextToDirectoryFile(folderSession.directoryHandle, filename, text);
    return { mode: 'saved' };
  }

  async deleteFiles({
    folderSession = null,
    filenames = [],
  }: { folderSession?: BrowserFolderSession; filenames?: Iterable<string> } = {}): Promise<{
    ok: boolean;
    code: 'deleted' | 'partial' | 'unavailable';
    results: BrowserDeleteFileResult[];
  }> {
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

    const results: BrowserDeleteFileResult[] = [];
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
