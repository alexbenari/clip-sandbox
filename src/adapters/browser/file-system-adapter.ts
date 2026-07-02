export type FolderEntryFile = File & {
  webkitRelativePath?: string;
  relativePath?: string;
  path?: string;
  mediaSource?: string;
};

export type WritableFileLike = {
  write(text: string): void | Promise<void>;
  close(): void | Promise<void>;
};

export type FileSystemFileHandleLike = {
  kind: 'file';
  name: string;
  getFile(): Promise<FolderEntryFile>;
  createWritable?: () => Promise<WritableFileLike>;
};

export type FileSystemDirectoryHandleLike = {
  kind: 'directory';
  name?: string;
  values(): AsyncIterable<FileSystemFileHandleLike | { kind: string; name?: string }>;
  getFileHandle(filename: string, options?: { create?: boolean }): Promise<FileSystemFileHandleLike & { createWritable: () => Promise<WritableFileLike> }>;
  removeEntry(filename: string): Promise<void>;
};

export type FileReadErrorInfo = {
  filename: string;
  attempts: number;
  error: unknown;
};

type BrowserPickerWindow = Window & {
  URL?: typeof URL;
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandleLike>;
};

type FileSystemAdapterOptions = {
  win?: BrowserPickerWindow;
  doc?: Document;
};

export class FileSystemAdapter {
  win: BrowserPickerWindow;
  doc: Document;

  constructor({
    win = window,
    doc = win?.document || document,
  }: FileSystemAdapterOptions = {}) {
    this.win = win;
    this.doc = doc;
  }

  inTopLevelWindow(): boolean {
    try {
      return this.win.top === this.win.self;
    } catch {
      return false;
    }
  }

  canUseDirectoryPicker(): boolean {
    return !!(this.win.isSecureContext && this.inTopLevelWindow() && 'showDirectoryPicker' in this.win);
  }

  async pickDirectory(): Promise<FileSystemDirectoryHandleLike> {
    if (!this.win.showDirectoryPicker) {
      throw new Error('Directory picker is unavailable.');
    }
    return this.win.showDirectoryPicker({ mode: 'readwrite' });
  }

  folderNameFromFiles(fileList: Iterable<Partial<FolderEntryFile>>): string {
    const firstFile = Array.from(fileList || [])[0];
    const relPath = firstFile?.webkitRelativePath || '';
    if (!relPath) return '';
    const parts = relPath.split(/[\\/]/).filter(Boolean);
    return parts.length > 1 ? parts[0] : '';
  }

  isTopLevelFolderEntry(file: Partial<FolderEntryFile>): boolean {
    const relPath = String(file?.webkitRelativePath || '').trim();
    if (!relPath) return true;
    const parts = relPath.split(/[\\/]/).filter(Boolean);
    return parts.length <= 2;
  }

  topLevelFiles<T extends Partial<FolderEntryFile>>(files: Iterable<T>): T[] {
    return Array.from(files || []).filter((file) => this.isTopLevelFolderEntry(file));
  }

  async readFileEntryWithRetry(entry: FileSystemFileHandleLike, { maxAttempts = 3 }: { maxAttempts?: number } = {}): Promise<{ file: FolderEntryFile; attempts: number }> {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return {
          file: await entry.getFile(),
          attempts: attempt,
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw Object.assign(lastError instanceof Error ? lastError : new Error('Failed to read file entry.'), {
      attempts: maxAttempts,
    });
  }

  async readFilesFromDirectory(
    directoryHandle: FileSystemDirectoryHandleLike,
    { onFileReadError }: { onFileReadError?: (info: FileReadErrorInfo) => void | Promise<void> } = {},
  ): Promise<FolderEntryFile[]> {
    const files: FolderEntryFile[] = [];
    for await (const entry of directoryHandle.values()) {
      if (entry.kind !== 'file') continue;
      try {
        const { file } = await this.readFileEntryWithRetry(entry as FileSystemFileHandleLike);
        files.push(file);
      } catch (error) {
        const attempts = typeof error === 'object' && error !== null && 'attempts' in error
          ? Number(error.attempts) || 3
          : 3;
        await onFileReadError?.({
          filename: entry?.name || '',
          attempts,
          error,
        });
      }
    }
    return files;
  }

  async saveTextToDirectory(directoryHandle: FileSystemDirectoryHandleLike, filename: string, text: string): Promise<void> {
    const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(text);
    await writable.close();
  }

  async appendTextToDirectoryFile(directoryHandle: FileSystemDirectoryHandleLike, filename: string, text: string): Promise<void> {
    const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
    const existing = await fileHandle.getFile();
    const previous = await existing.text();
    const writable = await fileHandle.createWritable();
    await writable.write(`${previous}${text}`);
    await writable.close();
  }

  async deleteTopLevelEntry(directoryHandle: FileSystemDirectoryHandleLike, filename: string): Promise<void> {
    await directoryHandle.removeEntry(filename);
  }

  downloadText(filename: string, text: string): void {
    const blob = new Blob([text], { type: 'text/plain' });
    const urlApi = this.win.URL || URL;
    const a = this.doc.createElement('a');
    a.href = urlApi.createObjectURL(blob);
    a.download = filename;
    this.doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => urlApi.revokeObjectURL(a.href), 1000);
  }
}
