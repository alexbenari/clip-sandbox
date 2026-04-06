export function inTopLevelWindow(win = window) {
  try {
    return win.top === win.self;
  } catch {
    return false;
  }
}

export function canUseDirectoryPicker(win = window) {
  return !!(win.isSecureContext && inTopLevelWindow(win) && 'showDirectoryPicker' in win);
}

export async function pickDirectory(win = window) {
  return win.showDirectoryPicker({ mode: 'readwrite' });
}

export function folderNameFromFiles(fileList) {
  const firstFile = Array.from(fileList || [])[0];
  const relPath = firstFile?.webkitRelativePath || '';
  if (!relPath) return '';
  const parts = relPath.split(/[\\/]/).filter(Boolean);
  return parts.length > 1 ? parts[0] : '';
}

async function readFileEntryWithRetry(entry, { maxAttempts = 3 } = {}) {
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

export async function readFilesFromDirectory(directoryHandle, { onFileReadError } = {}) {
  const files = [];
  for await (const entry of directoryHandle.values()) {
    if (entry.kind !== 'file') continue;
    try {
      const { file } = await readFileEntryWithRetry(entry);
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

export async function saveTextToDirectory(directoryHandle, filename, text) {
  const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
}

export async function appendTextToDirectoryFile(directoryHandle, filename, text) {
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

export async function deleteTopLevelEntry(directoryHandle, filename) {
  await directoryHandle.removeEntry(filename);
}

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
