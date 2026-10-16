import type { FolderAccess } from '../../app/folder-access.js';

type DesktopDeleteResult = {
  filename: string;
  ok?: boolean;
  code?: string;
  error?: { message?: string } | string | null;
};

type ElectronFolderFileApi = {
  saveTextFile?: (request: { folderPath: string; filename: string; text: string }) => Promise<{ mode?: string }>;
  appendTextFile?: (request: { folderPath: string; filename: string; text: string }) => Promise<{ mode?: string }>;
  deleteFiles?: (request: { folderPath: string; filenames: Iterable<string> }) => Promise<{
    ok?: boolean;
    code?: string;
    results?: DesktopDeleteResult[];
  } | null | undefined>;
};

type ElectronFolderFileWindow = Window & {
  clipSandboxDesktop?: ElectronFolderFileApi;
};

export type DesktopDeleteFileResult =
  | { filename: string; ok: true; error: null }
  | { filename: string; ok: false; code: string; error: Error };

const WINDOWS_INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000]/;
const WINDOWS_RESERVED_BASENAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Saves, appends to and deletes top-level files of the open folder, refusing names that would leave it. */
export class ElectronFolderFileService {
  constructor(private readonly api: ElectronFolderFileApi | null | undefined) {}

  static fromWindow(win: Window): ElectronFolderFileService {
    return new ElectronFolderFileService((win as ElectronFolderFileWindow).clipSandboxDesktop);
  }

  private validateTopLevelFilename(filename: string): string {
    const normalizedFilename = String(filename || '').trim();
    const basenamePrefix = normalizedFilename.split('.')[0] || '';
    if (
      !normalizedFilename
      || normalizedFilename === '.'
      || normalizedFilename === '..'
      || WINDOWS_INVALID_FILENAME_CHARS.test(normalizedFilename)
      || /[. ]$/.test(normalizedFilename)
      || /[. ]$/.test(basenamePrefix)
      || WINDOWS_RESERVED_BASENAME.test(basenamePrefix)
    ) {
      throw new Error(`Invalid top-level filename: ${filename}`);
    }
    return normalizedFilename;
  }

  async saveTextFile({
    folderSession = null,
    filename = 'default-collection.txt',
    text = '',
  }: { folderSession?: FolderAccess | null; filename?: string; text?: string } = {}): Promise<{ mode?: string }> {
    if (!folderSession) {
      throw new Error('Disk mutation is unavailable for the current folder session.');
    }
    const normalizedFilename = this.validateTopLevelFilename(filename);
    return this.requireApi().saveTextFile({
      folderPath: folderSession.folderPath,
      filename: normalizedFilename,
      text,
    });
  }

  async appendTextFile({
    folderSession = null,
    filename = '',
    text = '',
  }: { folderSession?: FolderAccess | null; filename?: string; text?: string } = {}): Promise<{ mode?: string }> {
    if (!folderSession) {
      return { mode: 'unavailable' };
    }
    const normalizedFilename = this.validateTopLevelFilename(filename);
    return this.requireApi().appendTextFile({
      folderPath: folderSession.folderPath,
      filename: normalizedFilename,
      text,
    });
  }

  async deleteFiles({
    folderSession = null,
    filenames = [],
  }: { folderSession?: FolderAccess | null; filenames?: Iterable<string> } = {}): Promise<{
    ok: boolean;
    code: string;
    results: DesktopDeleteFileResult[];
  }> {
    const rawFilenames = Array.from(filenames || []).map((filename) => String(filename || '').trim());
    if (!folderSession) {
      return {
        ok: false,
        code: 'unavailable',
        results: rawFilenames.map((filename) => ({
          filename,
          ok: false,
          code: 'unavailable',
          error: new Error('Disk mutation is unavailable for the current folder session.'),
        })),
      };
    }

    try {
      rawFilenames.forEach((filename) => this.validateTopLevelFilename(filename));
    } catch (error) {
      return {
        ok: false,
        code: 'partial',
        results: rawFilenames.map((filename) => ({
          filename,
          ok: false,
          code: 'delete-failed',
          error: error instanceof Error ? error : new Error(String(error || 'Invalid top-level filename')),
        })),
      };
    }

    const response = await this.requireApi().deleteFiles({
      folderPath: folderSession.folderPath,
      filenames: rawFilenames,
    });
    return {
      ok: !!response?.ok,
      code: response?.code || 'partial',
      results: Array.from(response?.results || []).map((result): DesktopDeleteFileResult => {
        if (result?.ok) {
          return { filename: result.filename, ok: true, error: null };
        }
        const errorMessage = typeof result?.error === 'object' && result.error
          ? result.error.message || String(result.error)
          : result?.error || result?.code || 'delete-failed';
        return {
          filename: result?.filename || '',
          ok: false,
          code: result?.code || 'delete-failed',
          error: new Error(String(errorMessage)),
        };
      }),
    };
  }

  private requireApi(): Required<ElectronFolderFileApi> {
    if (!this.api) {
      throw new Error('Electron desktop API is unavailable.');
    }
    return this.api as Required<ElectronFolderFileApi>;
  }
}
