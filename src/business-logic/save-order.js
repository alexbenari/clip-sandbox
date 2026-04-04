export async function persistTextFile({
  text = '',
  currentDirHandle,
  saveTextToDirectory,
  downloadText,
  filename = 'default-collection.txt',
}) {
  if (currentDirHandle && currentDirHandle.kind === 'directory' && currentDirHandle.getFileHandle) {
    try {
      await saveTextToDirectory(currentDirHandle, filename, text);
      return { mode: 'saved' };
    } catch (err) {
      console.warn('Direct save failed, falling back to download.', err);
    }
  }
  downloadText(filename, text);
  return { mode: 'downloaded' };
}

export async function persistCollectionContent({
  content,
  currentDirHandle,
  saveTextToDirectory,
  downloadText,
}) {
  return persistTextFile({
    text: content?.toText?.() || '',
    currentDirHandle,
    saveTextToDirectory,
    downloadText,
    filename: content?.filename || 'default-collection.txt',
  });
}

export async function runSaveOrder({
  names,
  currentDirHandle,
  saveTextToDirectory,
  downloadText,
  showStatus,
  filename = 'default-collection.txt',
  buildSavedStatus = (name) => `Saved ${name} to the selected folder.`,
  buildDownloadedStatus = (name) => `Downloaded ${name}.`,
}) {
  const { mode } = await persistTextFile({
    text: names.join('\n') + '\n',
    currentDirHandle,
    saveTextToDirectory,
    downloadText,
    filename,
  });
  if (mode === 'saved') {
    showStatus(buildSavedStatus(filename));
    return mode;
  }
  showStatus(buildDownloadedStatus(filename));
  return mode;
}
