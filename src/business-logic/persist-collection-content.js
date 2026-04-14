export async function persistCollectionContent({
  fileSystem,
  content,
  currentFolderSession = null,
  pipeline = null,
  requireDirectSave = false,
} = {}) {
  const { mode } = await fileSystem.saveTextFile({
    folderSession: currentFolderSession,
    filename: content.filename,
    text: content.toText(),
  });
  if (requireDirectSave && mode !== 'saved') {
    return {
      ok: false,
      mode,
      content,
    };
  }
  pipeline?.upsertCollection?.(content);
  return {
    ok: true,
    mode,
    content,
  };
}
