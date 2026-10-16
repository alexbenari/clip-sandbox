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
  private readonly win: Window;
  private readonly fileSystemAdapter: FileSystemAdapter;

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

  canMutateDisk(folderAccess: BrowserFolderSession): folderAccess is BrowserReadwriteSession {
    return !!(
      folderAccess?.accessMode === 'readwrite'
      && folderAccess?.directoryHandle?.kind === 'directory'
      && folderAccess?.directoryHandle?.getFileHandle
    );
  }

  async pickFolder({ onFileReadError }: {
    onFileReadError?: (info: FileReadErrorInfo, folderAccess: BrowserReadwriteSession) => void | Promise<void>;
  } = {}): Promise<{ folderAccess: BrowserReadwriteSession; files: FolderEntryFile[]; folderName: string }> {
    const directoryHandle = await this.fileSystemAdapter.pickDirectory();
    const folderAccess = this.createReadwriteSession(directoryHandle);
    const files = await this.fileSystemAdapter.readFilesFromDirectory(directoryHandle, {
      onFileReadError: (info) => onFileReadError?.(info, folderAccess),
    });
    return {
      folderAccess,
      files,
      folderName: directoryHandle?.name || '',
    };
  }

  selectionFromFileList(fileList: Iterable<FolderEntryFile>): { folderAccess: BrowserReadonlySession; files: FolderEntryFile[]; folderName: string } {
    const files = Array.from(fileList || []);
    return {
      folderAccess: this.createReadonlySession(),
      files,
      folderName: this.fileSystemAdapter.folderNameFromFiles(files),
    };
  }

  async saveTextFile({
    folderAccess = null,
    filename = 'default-collection.txt',
    text = '',
  }: { folderAccess?: BrowserFolderSession; filename?: string; text?: string } = {}): Promise<{ mode: 'saved' | 'downloaded' }> {
    if (this.canMutateDisk(folderAccess)) {
      try {
        await this.fileSystemAdapter.saveTextToDirectory(folderAccess.directoryHandle, filename, text);
        return { mode: 'saved' };
      } catch (error) {
        console.warn('Direct save failed, falling back to download.', error);
      }
    }
    this.fileSystemAdapter.downloadText(filename, text);
    return { mode: 'downloaded' };
  }

  async appendTextFile({
    folderAccess = null,
    filename = '',
    text = '',
  }: { folderAccess?: BrowserFolderSession; filename?: string; text?: string } = {}): Promise<{ mode: 'saved' | 'unavailable' }> {
    if (!this.canMutateDisk(folderAccess)) {
      return { mode: 'unavailable' };
    }
    await this.fileSystemAdapter.appendTextToDirectoryFile(folderAccess.directoryHandle, filename, text);
    return { mode: 'saved' };
  }

  async deleteFiles({
    folderAccess = null,
    filenames = [],
  }: { folderAccess?: BrowserFolderSession; filenames?: Iterable<string> } = {}): Promise<{
    ok: boolean;
    code: 'deleted' | 'partial' | 'unavailable';
    results: BrowserDeleteFileResult[];
  }> {
    if (!this.canMutateDisk(folderAccess)) {
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
        await this.fileSystemAdapter.deleteTopLevelEntry(folderAccess.directoryHandle, filename);
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
