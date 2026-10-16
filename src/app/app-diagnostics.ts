import type { InvalidCollectionDescription } from '../domain/collection-description-validator.js';
import type { FolderAccess } from './folder-access.js';

type ErrorLogFiles = {
  appendTextFile(request: { folderAccess: FolderAccess | null; filename: string; text: string }): Promise<{ mode?: string }>;
};

type DeleteFailureSummary = {
  failedDeletes?: Array<{ filename: string; error?: unknown; code?: string }>;
  failedCollectionRewrites?: Array<{ filename: string; collectionName: string; error?: unknown }>;
};

export class AppDiagnostics {
  folderFiles: ErrorLogFiles;
  errorLogFilename: string;
  getCurrentFolderAccess: () => FolderAccess | null;

  constructor({
    folderFiles,
    errorLogFilename = 'err.log',
    getCurrentFolderAccess = () => null,
  }: {
    folderFiles: ErrorLogFiles;
    errorLogFilename?: string;
    getCurrentFolderAccess?: () => FolderAccess | null;
  }) {
    this.folderFiles = folderFiles;
    this.errorLogFilename = errorLogFilename;
    this.getCurrentFolderAccess = getCurrentFolderAccess;
  }

  async appendErrorLog(text: string, folderAccess: FolderAccess | null = this.getCurrentFolderAccess()): Promise<boolean> {
    if (!text) return false;
    try {
      const { mode } = await this.folderFiles.appendTextFile({
        folderAccess,
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

  async logInvalidDescription(result: InvalidCollectionDescription, folderAccess: FolderAccess | null): Promise<void> {
    const file = result.filename ? `File: ${result.filename}\n` : '';
    await this.appendErrorLog(`Collection enumeration\n${file}Problem: ${result.code}\nDetails: ${result.message}\n\n`, folderAccess);
  }

  async logRuntimeError(problem: string, err: unknown, folderAccess: FolderAccess | null = this.getCurrentFolderAccess()): Promise<void> {
    const detail = `Runtime error\nProblem: ${problem}\nDetails: ${this.errorDetail(err)}\n\n`;
    await this.appendErrorLog(detail, folderAccess);
  }

  async logVideoMetadataFailure({ filename = '', error }: { filename?: string; error?: unknown } = {}, folderAccess: FolderAccess | null = this.getCurrentFolderAccess()): Promise<void> {
    const problem = filename
      ? `Failed to load video metadata: ${filename}`
      : 'Failed to load video metadata';
    const detail = `Video metadata error\nProblem: ${problem}\nDetails: ${this.errorDetail(error) || 'Unknown metadata load failure'}\nFallback: using default layout aspect ratio for this clip.\n\n`;
    await this.appendErrorLog(detail, folderAccess);
  }

  async logDeleteFailures(result: DeleteFailureSummary, folderAccess: FolderAccess | null = this.getCurrentFolderAccess()): Promise<void> {
    for (const failedDelete of Array.from(result?.failedDeletes || [])) {
      await this.appendErrorLog(
        `Disk delete error\nFile: ${failedDelete.filename}\nDetails: ${this.errorDetail(failedDelete.error) || failedDelete.code}\n\n`,
        folderAccess,
      );
    }
    for (const failedRewrite of Array.from(result?.failedCollectionRewrites || [])) {
      await this.appendErrorLog(
        `Collection rewrite error\nFile: ${failedRewrite.filename}\nCollection: ${failedRewrite.collectionName}\nDetails: ${this.errorDetail(failedRewrite.error)}\n\n`,
        folderAccess,
      );
    }
  }

  private errorDetail(error: unknown): string {
    return error instanceof Error ? error.message : String(error || '');
  }
}
