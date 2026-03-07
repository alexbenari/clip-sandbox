export async function runSaveOrder({
  names,
  currentDirHandle,
  saveTextToDirectory,
  downloadText,
  showStatus,
}) {
  const text = names.join('\n') + '\n';
  if (currentDirHandle && currentDirHandle.kind === 'directory' && currentDirHandle.getFileHandle) {
    try {
      await saveTextToDirectory(currentDirHandle, 'clip-order.txt', text);
      showStatus('Saved clip-order.txt to the selected folder.');
      return 'saved';
    } catch (err) {
      console.warn('Direct save failed, falling back to download.', err);
    }
  }
  downloadText('clip-order.txt', text);
  showStatus('Downloaded clip-order.txt.');
  return 'downloaded';
}
