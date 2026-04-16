// @ts-nocheck
export class ElectronFileSystemService {
  constructor({
    win = window,
    api = win.clipSandboxDesktop,
  } = {}) {
    this.win = win;
    this.api = api;
  }

  createFolderSession(folderPath) {
    return {
      kind: 'desktop-directory',
      accessMode: 'readwrite',
      folderPath,
    };
  }

  toRendererFile(entry) {
    const file = new File(
      [typeof entry?.text === 'string' ? entry.text : ''],
      entry?.name || '',
      {
        type: entry?.type || '',
        lastModified: Number.isFinite(entry?.lastModifiedMs) ? entry.lastModifiedMs : Date.now(),
      }
    );

    if (entry?.relativePath) {
      Object.defineProperty(file, 'webkitRelativePath', {
        configurable: true,
        value: entry.relativePath,
      });
    }
    if (entry?.path) {
      Object.defineProperty(file, 'path', {
        configurable: true,
        value: entry.path,
      });
    }
    if (entry?.mediaSource) {
      Object.defineProperty(file, 'mediaSource', {
        configurable: true,
        value: entry.mediaSource,
      });
    }

    return file;
  }

  requireApi() {
    if (!this.api) {
      throw new Error('Electron desktop API is unavailable.');
    }
    return this.api;
  }

  canMutateDisk(folderSession) {
    return !!(
      folderSession?.accessMode === 'readwrite'
      && typeof folderSession?.folderPath === 'string'
      && folderSession.folderPath.length > 0
    );
  }

  async pickFolder() {
    const result = await this.requireApi().pickFolder();
    if (!result || result.canceled) {
      throw new DOMException('The user aborted a request.', 'AbortError');
    }

    return {
      folderSession: this.createFolderSession(result.folderPath),
      files: Array.from(result.files || []).map((entry) => this.toRendererFile(entry)),
      folderName: result.folderName || '',
    };
  }

  async saveTextFile({
    folderSession = null,
    filename = 'default-collection.txt',
    text = '',
  } = {}) {
    if (!this.canMutateDisk(folderSession)) {
      throw new Error('Disk mutation is unavailable for the current folder session.');
    }
    return this.requireApi().saveTextFile({
      folderPath: folderSession.folderPath,
      filename,
      text,
    });
  }

  async appendTextFile({
    folderSession = null,
    filename = '',
    text = '',
  } = {}) {
    if (!this.canMutateDisk(folderSession)) {
      return { mode: 'unavailable' };
    }
    return this.requireApi().appendTextFile({
      folderPath: folderSession.folderPath,
      filename,
      text,
    });
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

    const response = await this.requireApi().deleteFiles({
      folderPath: folderSession.folderPath,
      filenames,
    });
    return {
      ok: !!response?.ok,
      code: response?.code || 'partial',
      results: Array.from(response?.results || []).map((result) => ({
        ...result,
        error: result?.error
          ? new Error(result.error.message || String(result.error))
          : result?.ok
            ? null
            : new Error(result?.code || 'delete-failed'),
      })),
    };
  }
}
