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

export async function readFilesFromDirectory(directoryHandle) {
  const files = [];
  for await (const entry of directoryHandle.values()) {
    if (entry.kind !== 'file') continue;
    try {
      files.push(await entry.getFile());
    } catch {}
  }
  return files;
}

export async function saveTextToDirectory(directoryHandle, filename, text) {
  const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
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
