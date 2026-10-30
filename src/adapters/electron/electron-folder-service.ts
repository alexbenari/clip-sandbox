import type { FolderEntry } from '../../business-logic/folder-entry.js';
import { ClipSource } from '../../domain/clip-source.js';
import type { FolderAccess, FolderContents } from '../../app/folder-access.js';
import type { ISavedClipEntry } from '../../app/edited-clip-save-service.js';

type ElectronFolderEntry = {
  name?: string;
  path?: string;
  text?: string;
  type?: string;
  mediaSource?: string;
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

  async refreshFolder(folderAccess: FolderAccess): Promise<FolderContents> {
    const result = await this.requireApi().refreshFolder({ folderPath: folderAccess.folderPath });
    if (!result || result.canceled) {
      throw new Error('The current folder could not be refreshed.');
    }
    return this.contentsOf(result);
  }

  isActiveFolder(folderAccess: FolderAccess | null, folderPath: string): boolean {
    return !!folderAccess
      && this.normalizedFolderPath(folderAccess.folderPath) === this.normalizedFolderPath(folderPath);
  }

  // The desktop API is the only source of folder access, so its folder path is checked here, once.
  contentsOf(result: DesktopFolderResult): FolderContents {
    if (typeof result.folderPath !== 'string' || result.folderPath.length === 0) {
      throw new Error('The desktop API returned a folder without a path.');
    }
    return {
      folderAccess: Object.freeze({ folderPath: result.folderPath }),
      files: Array.from(result.files || []).map((entry) => this.folderEntryOf(entry)),
      folderName: result.folderName || '',
    };
  }

  clipSourceOf(saved: Pick<ISavedClipEntry, 'name' | 'mediaSource' | 'path'>): ClipSource {
    return ClipSource.create({ name: saved.name, mediaSource: saved.mediaSource, desktopPath: saved.path });
  }

  private folderEntryOf(entry: ElectronFolderEntry): FolderEntry {
    return Object.freeze({
      name: entry.name || '',
      type: entry.type || '',
      mediaSource: entry.mediaSource || '',
      desktopPath: entry.path || null,
      ...(typeof entry.text === 'string' ? { text: entry.text } : {}),
    });
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
