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
  const text = names.join('\n') + '\n';
  if (currentDirHandle && currentDirHandle.kind === 'directory' && currentDirHandle.getFileHandle) {
    try {
      await saveTextToDirectory(currentDirHandle, filename, text);
      showStatus(buildSavedStatus(filename));
      return 'saved';
    } catch (err) {
      console.warn('Direct save failed, falling back to download.', err);
    }
  }
  downloadText(filename, text);
  showStatus(buildDownloadedStatus(filename));
  return 'downloaded';
}
