import { createElectronVideoEditService } from './electron-video-edit-service.js';
import type { ElectronVideoEditApi, ElectronVideoEditService } from './electron-video-edit-service.js';
import type { CreatedVideoFile, RuntimeVideoEditResult, VideoEditRequest } from '../../business-logic/clip-editor.js';
import type { ClipFile } from '../../domain/clip.js';

type ElectronFolderEntry = {
  name?: string;
  relativePath?: string;
  path?: string;
  text?: string;
  type?: string;
  mediaSource?: string;
  lastModifiedMs?: number;
};

type DesktopFolderResult = {
  canceled?: boolean;
  folderPath: string;
  folderName?: string;
  files?: ElectronFolderEntry[];
};

type DesktopDeleteResult = {
  filename: string;
  ok?: boolean;
  code?: string;
  error?: { message?: string } | string | null;
};

type ElectronDesktopApi = ElectronVideoEditApi & {
  pickFolder?: () => Promise<DesktopFolderResult | null | undefined>;
  saveTextFile?: (request: { folderPath: string; filename: string; text: string }) => Promise<{ mode?: string }>;
  appendTextFile?: (request: { folderPath: string; filename: string; text: string }) => Promise<{ mode?: string }>;
  deleteFiles?: (request: { folderPath: string; filenames: Iterable<string> }) => Promise<{
    ok?: boolean;
    code?: string;
    results?: DesktopDeleteResult[];
  } | null | undefined>;
};

type ElectronFileSystemWindow = Window & {
  clipSandboxDesktop?: ElectronDesktopApi;
};

const WINDOWS_INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000]/;
const WINDOWS_RESERVED_BASENAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export type DesktopFolderSession = {
  kind: 'desktop-directory';
  accessMode: 'readwrite';
  folderPath: string;
};

export type DesktopDeleteFileResult =
  | { filename: string; ok: true; error: null }
  | { filename: string; ok: false; code: string; error: Error };

export class ElectronFileSystemService {
  win: ElectronFileSystemWindow;
  api?: ElectronDesktopApi | null;
  videoEditService: ElectronVideoEditService;

  constructor({
    win = window,
    api = (win as ElectronFileSystemWindow).clipSandboxDesktop,
    videoEditService = null,
  }: {
    win?: ElectronFileSystemWindow;
    api?: ElectronDesktopApi | null;
    videoEditService?: ElectronVideoEditService | null;
  } = {}) {
    this.win = win as ElectronFileSystemWindow;
    this.api = api;
    this.videoEditService = videoEditService || createElectronVideoEditService({ api });
  }

  createFolderSession(folderPath: string): DesktopFolderSession {
    return {
      kind: 'desktop-directory',
      accessMode: 'readwrite',
      folderPath,
    };
  }

  toRendererFile(entry: ElectronFolderEntry | CreatedVideoFile): ClipFile {
    const lastModifiedMs = 'lastModifiedMs' in entry ? entry.lastModifiedMs : undefined;
    const file = new File(
      [typeof entry?.text === 'string' ? entry.text : ''],
      entry?.name || '',
      {
        type: entry?.type || '',
        lastModified: Number.isFinite(lastModifiedMs) ? lastModifiedMs : Date.now(),
      }
    );

    if ('relativePath' in entry && entry.relativePath) {
      Object.defineProperty(file, 'webkitRelativePath', {
        configurable: true,
        value: entry.relativePath,
      });
    }
    if (entry?.path) {
      Object.defineProperty(file, 'path', {
        configurable: true,
        value: entry.path,
      });
    }
    if (entry?.mediaSource) {
      Object.defineProperty(file, 'mediaSource', {
        configurable: true,
        value: entry.mediaSource,
      });
    }

    return file as ClipFile;
  }

  requireApi(): Required<Pick<ElectronDesktopApi, 'pickFolder' | 'saveTextFile' | 'appendTextFile' | 'deleteFiles'>> & ElectronDesktopApi {
    if (!this.api) {
      throw new Error('Electron desktop API is unavailable.');
    }
    return this.api as Required<Pick<ElectronDesktopApi, 'pickFolder' | 'saveTextFile' | 'appendTextFile' | 'deleteFiles'>> & ElectronDesktopApi;
  }

  canMutateDisk(folderSession: unknown): folderSession is DesktopFolderSession {
    const session = folderSession as Partial<DesktopFolderSession> | null;
    return !!(
      typeof folderSession === 'object'
      && folderSession !== null
      && session?.accessMode === 'readwrite'
      && typeof session.folderPath === 'string'
      && session.folderPath.length > 0
    );
  }

  validateTopLevelFilename(filename: string): string {
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

  async pickFolder(_options: { onFileReadError?: (info: unknown, folderSession: DesktopFolderSession) => void } = {}): Promise<{ folderSession: DesktopFolderSession; files: ClipFile[]; folderName: string }> {
    const result = await this.requireApi().pickFolder();
    if (!result || result.canceled) {
      throw new DOMException('The user aborted a request.', 'AbortError');
    }

    return {
      folderSession: this.createFolderSession(result.folderPath),
      files: Array.from(result.files || []).map((entry) => this.toRendererFile(entry)),
      folderName: result.folderName || '',
    };
  }

  async saveTextFile({
    folderSession = null,
    filename = 'default-collection.txt',
    text = '',
  }: { folderSession?: unknown; filename?: string; text?: string } = {}): Promise<{ mode?: string }> {
    if (!this.canMutateDisk(folderSession)) {
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
  }: { folderSession?: unknown; filename?: string; text?: string } = {}): Promise<{ mode?: string }> {
    if (!this.canMutateDisk(folderSession)) {
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
  }: { folderSession?: unknown; filenames?: Iterable<string> } = {}): Promise<{
    ok: boolean;
    code: string;
    results: DesktopDeleteFileResult[];
  }> {
    const rawFilenames = Array.from(filenames || []).map((filename) => String(filename || '').trim());
    if (!this.canMutateDisk(folderSession)) {
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

  async createVideoEdit(request: VideoEditRequest): Promise<RuntimeVideoEditResult> {
    return this.videoEditService.createVideoEdit(request);
  }
}
