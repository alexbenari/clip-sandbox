import {
  appendTextToDirectoryFile,
  canUseDirectoryPicker as canUseDirectoryPickerAdapter,
  downloadText,
  folderNameFromFiles,
  pickDirectory,
  readFilesFromDirectory,
  saveTextToDirectory,
} from './file-system-adapter.js';

function createReadwriteSession(directoryHandle) {
  return {
    kind: 'browser-directory',
    accessMode: 'readwrite',
    directoryHandle,
  };
}

function createReadonlySession() {
  return {
    kind: 'browser-file-list',
    accessMode: 'read-only',
  };
}

export function createBrowserFileSystemService({
  win = window,
  appendTextToDirectoryFileImpl = appendTextToDirectoryFile,
  canUseDirectoryPickerImpl = canUseDirectoryPickerAdapter,
  downloadTextImpl = downloadText,
  folderNameFromFilesImpl = folderNameFromFiles,
  pickDirectoryImpl = pickDirectory,
  readFilesFromDirectoryImpl = readFilesFromDirectory,
  saveTextToDirectoryImpl = saveTextToDirectory,
} = {}) {
  function canUseDirectoryPicker() {
    return canUseDirectoryPickerImpl(win);
  }

  function canMutateDisk(folderSession) {
    return !!(
      folderSession?.accessMode === 'readwrite'
      && folderSession?.directoryHandle?.kind === 'directory'
      && folderSession?.directoryHandle?.getFileHandle
    );
  }

  async function pickFolder({ onFileReadError } = {}) {
    const directoryHandle = await pickDirectoryImpl(win);
    const folderSession = createReadwriteSession(directoryHandle);
    const files = await readFilesFromDirectoryImpl(directoryHandle, {
      onFileReadError: (info) => onFileReadError?.(info, folderSession),
    });
    return {
      folderSession,
      files,
      folderName: directoryHandle?.name || '',
    };
  }

  function selectionFromFileList(fileList) {
    const files = Array.from(fileList || []);
    return {
      folderSession: createReadonlySession(),
      files,
      folderName: folderNameFromFilesImpl(files),
    };
  }

  async function saveTextFile({
    folderSession = null,
    filename = 'default-collection.txt',
    text = '',
  } = {}) {
    if (canMutateDisk(folderSession)) {
      try {
        await saveTextToDirectoryImpl(folderSession.directoryHandle, filename, text);
        return { mode: 'saved' };
      } catch (error) {
        console.warn('Direct save failed, falling back to download.', error);
      }
    }
    downloadTextImpl(filename, text);
    return { mode: 'downloaded' };
  }

  async function appendTextFile({
    folderSession = null,
    filename = '',
    text = '',
  } = {}) {
    if (!canMutateDisk(folderSession)) {
      return { mode: 'unavailable' };
    }
    await appendTextToDirectoryFileImpl(folderSession.directoryHandle, filename, text);
    return { mode: 'saved' };
  }

  return {
    appendTextFile,
    canMutateDisk,
    canUseDirectoryPicker,
    pickFolder,
    saveTextFile,
    selectionFromFileList,
  };
}
