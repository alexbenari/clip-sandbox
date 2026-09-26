import { ElectronVideoEditService } from './electron-video-edit-service.js';
import type { ElectronVideoEditApi } from './electron-video-edit-service.js';
import type { CreatedVideoFile, RuntimeVideoEditResult, VideoEditRequest } from '../../business-logic/clip-editor.js';
import type { ClipFile } from '../../domain/clip.js';
import type {
  IPipelineCatalogCollection,
  IPipelineCatalogDetails,
  IPipelineCatalogEntry,
  PipelineCatalogResult,
} from '../../app/pipeline-catalog.js';

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
  refreshFolder?: (request: { folderPath: string }) => Promise<DesktopFolderResult | null | undefined>;
  listPipelineCatalog?: () => Promise<unknown>;
  describePipelineCatalogEntry?: (request: { pipelineId: string }) => Promise<unknown>;
  openPipelineCatalogEntry?: (request: { pipelineId: string }) => Promise<DesktopFolderResult | null | undefined>;
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
  private readonly win: ElectronFileSystemWindow;
  private readonly api?: ElectronDesktopApi | null;
  private readonly videoEditService: ElectronVideoEditService;

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
    this.videoEditService = videoEditService || new ElectronVideoEditService({ api });
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

  private requireApi(): Required<Pick<ElectronDesktopApi, 'pickFolder' | 'refreshFolder' | 'saveTextFile' | 'appendTextFile' | 'deleteFiles'>> & ElectronDesktopApi {
    if (!this.api) {
      throw new Error('Electron desktop API is unavailable.');
    }
    return this.api as Required<Pick<ElectronDesktopApi, 'pickFolder' | 'refreshFolder' | 'saveTextFile' | 'appendTextFile' | 'deleteFiles'>> & ElectronDesktopApi;
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

  isActiveFolder(folderSession: unknown, folderPath: string): boolean {
    return this.canMutateDisk(folderSession)
      && this.normalizedFolderPath(folderSession.folderPath) === this.normalizedFolderPath(folderPath);
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
    return this.folderSelection(result);
  }

  async refreshFolder(folderSession: unknown): Promise<{ folderSession: DesktopFolderSession; files: ClipFile[]; folderName: string }> {
    if (!this.canMutateDisk(folderSession)) {
      throw new Error('Folder refresh is unavailable for the current folder session.');
    }
    const result = await this.requireApi().refreshFolder({ folderPath: folderSession.folderPath });
    if (!result || result.canceled) {
      throw new Error('The current folder could not be refreshed.');
    }
    return this.folderSelection(result);
  }

  async listPipelineCatalog(): Promise<PipelineCatalogResult> {
    const api = this.requireApi();
    if (!api.listPipelineCatalog) throw new Error('Pipeline catalog is unavailable.');
    const raw = await api.listPipelineCatalog();
    if (!ElectronFileSystemService.isRecord(raw)) throw new Error('Invalid pipeline catalog response.');
    if (raw.kind === 'unconfigured') return { kind: 'unconfigured' };
    if (raw.kind !== 'available' || !Array.isArray(raw.entries)) throw new Error('Invalid pipeline catalog response.');
    const entries = raw.entries.map(entry => this.parsePipelineCatalogEntry(entry));
    if (new Set(entries.map(entry => entry.id)).size !== entries.length) {
      throw new Error('Invalid pipeline catalog response.');
    }
    return { kind: 'available', entries };
  }

  async describePipelineCatalogEntry(entry: IPipelineCatalogEntry): Promise<IPipelineCatalogDetails> {
    const api = this.requireApi();
    if (!api.describePipelineCatalogEntry) throw new Error('Pipeline catalog is unavailable.');
    const raw = await api.describePipelineCatalogEntry({ pipelineId: entry.id });
    if (!ElectronFileSystemService.isRecord(raw)
      || !Array.isArray(raw.clipNames) || !Array.isArray(raw.collections)) {
      throw new Error('Invalid pipeline details response.');
    }
    return {
      clipNames: this.parseCatalogNames(raw.clipNames),
      collections: raw.collections.map(collection => this.parsePipelineCatalogCollection(collection)),
    };
  }

  async openPipelineCatalogEntry(entry: IPipelineCatalogEntry): Promise<{ folderSession: DesktopFolderSession; files: ClipFile[]; folderName: string }> {
    const api = this.requireApi();
    if (!api.openPipelineCatalogEntry) throw new Error('Pipeline catalog is unavailable.');
    const result = await api.openPipelineCatalogEntry({ pipelineId: entry.id });
    if (!result || result.canceled) throw new Error('The selected pipeline could not be opened.');
    return this.folderSelection(result);
  }

  private folderSelection(result: DesktopFolderResult): { folderSession: DesktopFolderSession; files: ClipFile[]; folderName: string } {
    return {
      folderSession: this.createFolderSession(result.folderPath),
      files: Array.from(result.files || []).map((entry) => this.toRendererFile(entry)),
      folderName: result.folderName || '',
    };
  }

  private normalizedFolderPath(folderPath: string): string {
    return String(folderPath || '')
      .trim()
      .replace(/\//g, '\\')
      .replace(/\\+$/, '')
      .toLocaleLowerCase();
  }

  private parsePipelineCatalogEntry(value: unknown): IPipelineCatalogEntry {
    if (!ElectronFileSystemService.isRecord(value)
      || typeof value.id !== 'string' || value.id.length === 0
      || typeof value.name !== 'string' || value.name.trim().length === 0) {
      throw new Error('Invalid pipeline catalog response.');
    }
    return Object.freeze({ id: value.id, name: value.name });
  }

  private parsePipelineCatalogCollection(value: unknown): IPipelineCatalogCollection {
    if (!ElectronFileSystemService.isRecord(value)
      || typeof value.name !== 'string' || value.name.trim().length === 0
      || !Array.isArray(value.clipNames)) {
      throw new Error('Invalid pipeline details response.');
    }
    return Object.freeze({ name: value.name, clipNames: this.parseCatalogNames(value.clipNames) });
  }

  private parseCatalogNames(value: readonly unknown[]): readonly string[] {
    if (value.some(name => typeof name !== 'string' || name.length === 0)) {
      throw new Error('Invalid pipeline details response.');
    }
    return Object.freeze([...value] as string[]);
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
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
