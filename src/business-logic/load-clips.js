export async function runLoadClips({
  fileList,
  filterAndSortFiles,
  addThumbForFile,
  updateCount,
  recomputeLayout,
  showStatus,
  delay,
  buildLoadedMessage,
}) {
  const arr = filterAndSortFiles(fileList);
  if (arr.length === 0) {
    updateCount();
    recomputeLayout();
    return 0;
  }
  for (const file of arr) addThumbForFile(file);
  updateCount();
  await delay(20);
  recomputeLayout();
  showStatus(buildLoadedMessage(arr.length));
  return arr.length;
}
