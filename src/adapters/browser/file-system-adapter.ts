// @ts-nocheck
export class FileSystemAdapter {
  constructor({
    win = window,
    doc = win?.document || document,
  } = {}) {
    this.win = win;
    this.doc = doc;
  }

  inTopLevelWindow() {
    try {
      return this.win.top === this.win.self;
    } catch {
      return false;
    }
  }

  canUseDirectoryPicker() {
    return !!(this.win.isSecureContext && this.inTopLevelWindow() && 'showDirectoryPicker' in this.win);
  }

  async pickDirectory() {
    return this.win.showDirectoryPicker({ mode: 'readwrite' });
  }

  folderNameFromFiles(fileList) {
    const firstFile = Array.from(fileList || [])[0];
    const relPath = firstFile?.webkitRelativePath || '';
    if (!relPath) return '';
    const parts = relPath.split(/[\\/]/).filter(Boolean);
    return parts.length > 1 ? parts[0] : '';
  }

  isTopLevelFolderEntry(file) {
    const relPath = String(file?.webkitRelativePath || '').trim();
    if (!relPath) return true;
    const parts = relPath.split(/[\\/]/).filter(Boolean);
    return parts.length <= 2;
  }

  topLevelFiles(files) {
    return Array.from(files || []).filter((file) => this.isTopLevelFolderEntry(file));
  }

  async readFileEntryWithRetry(entry, { maxAttempts = 3 } = {}) {
    let lastError = null;
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
    throw Object.assign(lastError || new Error('Failed to read file entry.'), {
      attempts: maxAttempts,
    });
  }

  async readFilesFromDirectory(directoryHandle, { onFileReadError } = {}) {
    const files = [];
    for await (const entry of directoryHandle.values()) {
      if (entry.kind !== 'file') continue;
      try {
        const { file } = await this.readFileEntryWithRetry(entry);
        files.push(file);
      } catch (error) {
        await onFileReadError?.({
          filename: entry?.name || '',
          attempts: error?.attempts || 3,
          error,
        });
      }
    }
    return files;
  }

  async saveTextToDirectory(directoryHandle, filename, text) {
    const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(text);
    await writable.close();
  }

  async appendTextToDirectoryFile(directoryHandle, filename, text) {
    const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
    let previous = '';
    try {
      const existing = await fileHandle.getFile();
      previous = await existing.text();
    } catch {}
    const writable = await fileHandle.createWritable();
    await writable.write(`${previous}${text}`);
    await writable.close();
  }

  async deleteTopLevelEntry(directoryHandle, filename) {
    await directoryHandle.removeEntry(filename);
  }

  downloadText(filename, text) {
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
