import type { FolderAccess } from '../../app/folder-access.js';

type DesktopTrashResult = {
  filename: string;
  ok?: boolean;
  code?: string;
  error?: { message?: string } | string | null;
};

type ElectronFolderFileApi = {
  saveTextFile?: (request: { folderPath: string; filename: string; text: string }) => Promise<{ mode?: string }>;
  appendTextFile?: (request: { folderPath: string; filename: string; text: string }) => Promise<{ mode?: string }>;
  trashFiles?: (request: { folderPath: string; filenames: Iterable<string> }) => Promise<{
    ok?: boolean;
    code?: string;
    results?: DesktopTrashResult[];
  } | null | undefined>;
};

type ElectronFolderFileWindow = Window & {
  clipSandboxDesktop?: ElectronFolderFileApi;
};

export type DesktopTrashFileResult =
  | { filename: string; ok: true; error: null }
  | { filename: string; ok: false; code: string; error: Error };

const WINDOWS_INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000]/;
const WINDOWS_RESERVED_BASENAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

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
    folderAccess = null,
    filename = 'default-collection.txt',
    text = '',
  }: { folderAccess?: FolderAccess | null; filename?: string; text?: string } = {}): Promise<{ mode?: string }> {
    if (!folderAccess) {
      throw new Error('Disk changes are unavailable because no folder is open.');
    }
    const normalizedFilename = this.validateTopLevelFilename(filename);
    return this.requireApi().saveTextFile({
      folderPath: folderAccess.folderPath,
      filename: normalizedFilename,
      text,
    });
  }

  async appendTextFile({
    folderAccess = null,
    filename = '',
    text = '',
  }: { folderAccess?: FolderAccess | null; filename?: string; text?: string } = {}): Promise<{ mode?: string }> {
    if (!folderAccess) {
      return { mode: 'unavailable' };
    }
    const normalizedFilename = this.validateTopLevelFilename(filename);
    return this.requireApi().appendTextFile({
      folderPath: folderAccess.folderPath,
      filename: normalizedFilename,
      text,
    });
  }

  async trashFiles({
    folderAccess = null,
    filenames = [],
  }: { folderAccess?: FolderAccess | null; filenames?: Iterable<string> } = {}): Promise<{
    ok: boolean;
    code: string;
    results: DesktopTrashFileResult[];
  }> {
    const rawFilenames = Array.from(filenames || []).map((filename) => String(filename || '').trim());
    if (!folderAccess) {
      return {
        ok: false,
        code: 'unavailable',
        results: rawFilenames.map((filename) => ({
          filename,
          ok: false,
          code: 'unavailable',
          error: new Error('Disk changes are unavailable because no folder is open.'),
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
          code: 'trash-failed',
          error: error instanceof Error ? error : new Error(String(error || 'Invalid top-level filename')),
        })),
      };
    }

    const response = await this.requireApi().trashFiles({
      folderPath: folderAccess.folderPath,
      filenames: rawFilenames,
    });
    return {
      ok: !!response?.ok,
      code: response?.code || 'partial',
      results: Array.from(response?.results || []).map((result): DesktopTrashFileResult => {
        if (result?.ok) {
          return { filename: result.filename, ok: true, error: null };
        }
        const errorMessage = typeof result?.error === 'object' && result.error
          ? result.error.message || String(result.error)
          : result?.error || result?.code || 'trash-failed';
        return {
          filename: result?.filename || '',
          ok: false,
          code: result?.code || 'trash-failed',
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
