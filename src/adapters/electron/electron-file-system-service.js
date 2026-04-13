function createFolderSession(folderPath) {
  return {
    kind: 'desktop-directory',
    accessMode: 'readwrite',
    folderPath,
  };
}

function toRendererFile(entry) {
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

export function createElectronFileSystemService({
  win = window,
  api = win.clipSandboxDesktop,
} = {}) {
  function requireApi() {
    if (!api) {
      throw new Error('Electron desktop API is unavailable.');
    }
    return api;
  }

  function canMutateDisk(folderSession) {
    return !!(
      folderSession?.accessMode === 'readwrite'
      && typeof folderSession?.folderPath === 'string'
      && folderSession.folderPath.length > 0
    );
  }

  async function pickFolder() {
    const result = await requireApi().pickFolder();
    if (!result || result.canceled) {
      throw new DOMException('The user aborted a request.', 'AbortError');
    }

    return {
      folderSession: createFolderSession(result.folderPath),
      files: Array.from(result.files || []).map(toRendererFile),
      folderName: result.folderName || '',
    };
  }

  async function saveTextFile({
    folderSession = null,
    filename = 'default-collection.txt',
    text = '',
  } = {}) {
    if (!canMutateDisk(folderSession)) {
      throw new Error('Disk mutation is unavailable for the current folder session.');
    }
    return requireApi().saveTextFile({
      folderPath: folderSession.folderPath,
      filename,
      text,
    });
  }

  async function appendTextFile({
    folderSession = null,
    filename = '',
    text = '',
  } = {}) {
    if (!canMutateDisk(folderSession)) {
      return { mode: 'unavailable' };
    }
    return requireApi().appendTextFile({
      folderPath: folderSession.folderPath,
      filename,
      text,
    });
  }

  async function deleteFiles({
    folderSession = null,
    filenames = [],
  } = {}) {
    if (!canMutateDisk(folderSession)) {
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

    const response = await requireApi().deleteFiles({
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

  return {
    appendTextFile,
    canMutateDisk,
    deleteFiles,
    pickFolder,
    saveTextFile,
  };
}
