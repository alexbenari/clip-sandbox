export function createAppDiagnostics({
  fileSystem,
  validator,
  errorLogFilename = 'err.log',
  getCurrentFolderSession = () => null,
} = {}) {
  async function appendErrorLog(text, folderSession = getCurrentFolderSession()) {
    if (!text) return false;
    try {
      const { mode } = await fileSystem.appendTextFile({
        folderSession,
        filename: errorLogFilename,
        text,
      });
      if (mode === 'saved') return true;
    } catch (err) {
      console.warn('Failed to append err.log in selected folder.', err);
    }
    console.warn(text.trim());
    return false;
  }

  async function logInvalidDescription(result, folderSession) {
    await appendErrorLog(validator.formatLogEntry(result, 'Collection enumeration'), folderSession);
  }

  async function logRuntimeError(problem, err, folderSession = getCurrentFolderSession()) {
    const detail = `Runtime error\nProblem: ${problem}\nDetails: ${err?.message || err}\n\n`;
    await appendErrorLog(detail, folderSession);
  }

  async function logDirectoryReadError({ filename = '', attempts = 0, error } = {}, folderSession) {
    const problem = filename
      ? `Failed to read folder entry: ${filename}`
      : 'Failed to read folder entry';
    const detail = `Directory enumeration error\nProblem: ${problem}\nAttempts: ${attempts}\nDetails: ${error?.message || error}\n\n`;
    await appendErrorLog(detail, folderSession);
  }

  async function logDeleteFailures(result, folderSession = getCurrentFolderSession()) {
    for (const failedDelete of Array.from(result?.failedDeletes || [])) {
      await appendErrorLog(
        `Disk delete error\nFile: ${failedDelete.filename}\nDetails: ${failedDelete.error?.message || failedDelete.error || failedDelete.code}\n\n`,
        folderSession,
      );
    }
    for (const failedRewrite of Array.from(result?.failedCollectionRewrites || [])) {
      await appendErrorLog(
        `Collection rewrite error\nFile: ${failedRewrite.filename}\nCollection: ${failedRewrite.collectionName}\nDetails: ${failedRewrite.error?.message || failedRewrite.error}\n\n`,
        folderSession,
      );
    }
  }

  return {
    appendErrorLog,
    logInvalidDescription,
    logRuntimeError,
    logDirectoryReadError,
    logDeleteFailures,
  };
}
