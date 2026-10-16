import type { CreatedVideoFile } from '../../business-logic/clip-editor.js';
import type { ClipFile } from '../../domain/clip.js';
import type { FolderAccess, FolderContents } from '../../app/folder-access.js';

type ElectronFolderEntry = {
  name?: string;
  relativePath?: string;
  path?: string;
  text?: string;
  type?: string;
  mediaSource?: string;
  lastModifiedMs?: number;
};

export type DesktopFolderResult = {
  canceled?: boolean;
  folderPath: string;
  folderName?: string;
  files?: ElectronFolderEntry[];
};

type ElectronFolderApi = {
  pickFolder?: () => Promise<DesktopFolderResult | null | undefined>;
  refreshFolder?: (request: { folderPath: string }) => Promise<DesktopFolderResult | null | undefined>;
};

type ElectronFolderWindow = Window & {
  clipSandboxDesktop?: ElectronFolderApi;
};

/** Opens and refreshes desktop folders, and turns what the desktop API lists into renderer files. */
export class ElectronFolderService {
  constructor(private readonly api: ElectronFolderApi | null | undefined) {}

  static fromWindow(win: Window): ElectronFolderService {
    return new ElectronFolderService((win as ElectronFolderWindow).clipSandboxDesktop);
  }

  async pickFolder(): Promise<FolderContents> {
    const result = await this.requireApi().pickFolder();
    if (!result || result.canceled) {
      throw new DOMException('The user aborted a request.', 'AbortError');
    }
    return this.contentsOf(result);
  }

  async refreshFolder(folderSession: FolderAccess): Promise<FolderContents> {
    const result = await this.requireApi().refreshFolder({ folderPath: folderSession.folderPath });
    if (!result || result.canceled) {
      throw new Error('The current folder could not be refreshed.');
    }
    return this.contentsOf(result);
  }

  isActiveFolder(folderSession: FolderAccess | null, folderPath: string): boolean {
    return !!folderSession
      && this.normalizedFolderPath(folderSession.folderPath) === this.normalizedFolderPath(folderPath);
  }

  // The desktop API is the only source of folder access, so its folder path is checked here, once.
  contentsOf(result: DesktopFolderResult): FolderContents {
    if (typeof result.folderPath !== 'string' || result.folderPath.length === 0) {
      throw new Error('The desktop API returned a folder without a path.');
    }
    return {
      folderSession: Object.freeze({ folderPath: result.folderPath }),
      files: Array.from(result.files || []).map((entry) => this.toRendererFile(entry)),
      folderName: result.folderName || '',
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

  private requireApi(): Required<ElectronFolderApi> {
    if (!this.api) {
      throw new Error('Electron desktop API is unavailable.');
    }
    return this.api as Required<ElectronFolderApi>;
  }

  private normalizedFolderPath(folderPath: string): string {
    return String(folderPath || '')
      .trim()
      .replace(/\//g, '\\')
      .replace(/\\+$/, '')
      .toLocaleLowerCase();
  }
}
