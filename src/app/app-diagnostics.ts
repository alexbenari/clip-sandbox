type ErrorLogFileSystem = {
  appendTextFile(request: { folderSession?: unknown; filename: string; text: string }): Promise<{ mode?: string }>;
};

type ErrorLogValidator = {
  formatLogEntry(result: unknown, context?: string): string;
};

type DeleteFailureSummary = {
  failedDeletes?: Array<{ filename: string; error?: unknown; code?: string }>;
  failedCollectionRewrites?: Array<{ filename: string; collectionName: string; error?: unknown }>;
};

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '');
}

export class AppDiagnostics {
  fileSystem: ErrorLogFileSystem;
  validator: ErrorLogValidator;
  errorLogFilename: string;
  getCurrentFolderSession: () => unknown;

  constructor({
    fileSystem,
    validator,
    errorLogFilename = 'err.log',
    getCurrentFolderSession = () => null,
  }: {
    fileSystem: ErrorLogFileSystem;
    validator: ErrorLogValidator;
    errorLogFilename?: string;
    getCurrentFolderSession?: () => unknown;
  }) {
    this.fileSystem = fileSystem;
    this.validator = validator;
    this.errorLogFilename = errorLogFilename;
    this.getCurrentFolderSession = getCurrentFolderSession;
  }

  async appendErrorLog(text: string, folderSession: unknown = this.getCurrentFolderSession()): Promise<boolean> {
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

  async logInvalidDescription(result: unknown, folderSession: unknown): Promise<void> {
    await this.appendErrorLog(this.validator.formatLogEntry(result, 'Collection enumeration'), folderSession);
  }

  async logRuntimeError(problem: string, err: unknown, folderSession: unknown = this.getCurrentFolderSession()): Promise<void> {
    const detail = `Runtime error\nProblem: ${problem}\nDetails: ${errorDetail(err)}\n\n`;
    await this.appendErrorLog(detail, folderSession);
  }

  async logDirectoryReadError({ filename = '', attempts = 0, error }: { filename?: string; attempts?: number; error?: unknown } = {}, folderSession: unknown): Promise<void> {
    const problem = filename
      ? `Failed to read folder entry: ${filename}`
      : 'Failed to read folder entry';
    const detail = `Directory enumeration error\nProblem: ${problem}\nAttempts: ${attempts}\nDetails: ${errorDetail(error)}\n\n`;
    await this.appendErrorLog(detail, folderSession);
  }

  async logVideoMetadataFailure({ filename = '', error }: { filename?: string; error?: unknown } = {}, folderSession: unknown = this.getCurrentFolderSession()): Promise<void> {
    const problem = filename
      ? `Failed to load video metadata: ${filename}`
      : 'Failed to load video metadata';
    const detail = `Video metadata error\nProblem: ${problem}\nDetails: ${errorDetail(error) || 'Unknown metadata load failure'}\nFallback: using default layout aspect ratio for this clip.\n\n`;
    await this.appendErrorLog(detail, folderSession);
  }

  async logDeleteFailures(result: DeleteFailureSummary, folderSession: unknown = this.getCurrentFolderSession()): Promise<void> {
    for (const failedDelete of Array.from(result?.failedDeletes || [])) {
      await this.appendErrorLog(
        `Disk delete error\nFile: ${failedDelete.filename}\nDetails: ${errorDetail(failedDelete.error) || failedDelete.code}\n\n`,
        folderSession,
      );
    }
    for (const failedRewrite of Array.from(result?.failedCollectionRewrites || [])) {
      await this.appendErrorLog(
        `Collection rewrite error\nFile: ${failedRewrite.filename}\nCollection: ${failedRewrite.collectionName}\nDetails: ${errorDetail(failedRewrite.error)}\n\n`,
        folderSession,
      );
    }
  }
}

export function createAppDiagnostics(options: ConstructorParameters<typeof AppDiagnostics>[0]): AppDiagnostics {
  return new AppDiagnostics(options);
}
