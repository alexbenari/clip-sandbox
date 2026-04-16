// @ts-nocheck
export class AppDiagnostics {
  constructor({
    fileSystem,
    validator,
    errorLogFilename = 'err.log',
    getCurrentFolderSession = () => null,
  } = {}) {
    this.fileSystem = fileSystem;
    this.validator = validator;
    this.errorLogFilename = errorLogFilename;
    this.getCurrentFolderSession = getCurrentFolderSession;
  }

  async appendErrorLog(text, folderSession = this.getCurrentFolderSession()) {
    if (!text) return false;
    try {
      const { mode } = await this.fileSystem.appendTextFile({
        folderSession,
        filename: this.errorLogFilename,
        text,
      });
      if (mode === 'saved') return true;
    } catch (err) {
      console.warn('Failed to append err.log in selected folder.', err);
    }
    console.warn(text.trim());
    return false;
  }

  async logInvalidDescription(result, folderSession) {
    await this.appendErrorLog(this.validator.formatLogEntry(result, 'Collection enumeration'), folderSession);
  }

  async logRuntimeError(problem, err, folderSession = this.getCurrentFolderSession()) {
    const detail = `Runtime error\nProblem: ${problem}\nDetails: ${err?.message || err}\n\n`;
    await this.appendErrorLog(detail, folderSession);
  }

  async logDirectoryReadError({ filename = '', attempts = 0, error } = {}, folderSession) {
    const problem = filename
      ? `Failed to read folder entry: ${filename}`
      : 'Failed to read folder entry';
    const detail = `Directory enumeration error\nProblem: ${problem}\nAttempts: ${attempts}\nDetails: ${error?.message || error}\n\n`;
    await this.appendErrorLog(detail, folderSession);
  }

  async logDeleteFailures(result, folderSession = this.getCurrentFolderSession()) {
    for (const failedDelete of Array.from(result?.failedDeletes || [])) {
      await this.appendErrorLog(
        `Disk delete error\nFile: ${failedDelete.filename}\nDetails: ${failedDelete.error?.message || failedDelete.error || failedDelete.code}\n\n`,
        folderSession,
      );
    }
    for (const failedRewrite of Array.from(result?.failedCollectionRewrites || [])) {
      await this.appendErrorLog(
        `Collection rewrite error\nFile: ${failedRewrite.filename}\nCollection: ${failedRewrite.collectionName}\nDetails: ${failedRewrite.error?.message || failedRewrite.error}\n\n`,
        folderSession,
      );
    }
  }
}

export function createAppDiagnostics(options) {
  return new AppDiagnostics(options);
}
