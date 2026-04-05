export async function persistTextFile({
  text = '',
  folderSession,
  fileSystem,
  filename = 'default-collection.txt',
}) {
  return fileSystem.saveTextFile({
    folderSession,
    filename,
    text,
  });
}

export async function persistCollectionContent({
  content,
  folderSession,
  fileSystem,
}) {
  return persistTextFile({
    text: content?.toText?.() || '',
    folderSession,
    fileSystem,
    filename: content?.filename || 'default-collection.txt',
  });
}

export async function runSaveOrder({
  names,
  folderSession,
  fileSystem,
  showStatus,
  filename = 'default-collection.txt',
  buildSavedStatus = (name) => `Saved ${name} to the selected folder.`,
  buildDownloadedStatus = (name) => `Downloaded ${name}.`,
}) {
  const { mode } = await persistTextFile({
    text: names.join('\n') + '\n',
    folderSession,
    fileSystem,
    filename,
  });
  if (mode === 'saved') {
    showStatus(buildSavedStatus(filename));
    return mode;
  }
  showStatus(buildDownloadedStatus(filename));
  return mode;
}
