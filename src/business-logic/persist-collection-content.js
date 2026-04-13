export async function persistCollectionContent({
  fileSystem,
  content,
  currentFolderSession = null,
  inventory = null,
  makeActive = false,
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
  inventory?.upsertCollectionContent(content, { makeActive });
  return {
    ok: true,
    mode,
    content,
  };
}
