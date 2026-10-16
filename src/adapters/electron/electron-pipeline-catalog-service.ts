import type {
  IPipelineCatalogCollection,
  IPipelineCatalogDetails,
  IPipelineCatalogEntry,
  PipelineCatalogResult,
} from '../../app/pipeline-catalog.js';
import type { FolderContents } from '../../app/folder-access.js';
import type { DesktopFolderResult, ElectronFolderService } from './electron-folder-service.js';

type ElectronPipelineCatalogApi = {
  listPipelineCatalog?: () => Promise<unknown>;
  describePipelineCatalogEntry?: (request: { pipelineId: string }) => Promise<unknown>;
  openPipelineCatalogEntry?: (request: { pipelineId: string }) => Promise<DesktopFolderResult | null | undefined>;
};

type ElectronPipelineCatalogWindow = Window & {
  clipSandboxDesktop?: ElectronPipelineCatalogApi;
};

export class ElectronPipelineCatalogService {
  constructor(
    private readonly api: ElectronPipelineCatalogApi | null | undefined,
    private readonly folders: Pick<ElectronFolderService, 'contentsOf'>,
  ) {}

  static fromWindow(win: Window, folders: Pick<ElectronFolderService, 'contentsOf'>): ElectronPipelineCatalogService {
    return new ElectronPipelineCatalogService((win as ElectronPipelineCatalogWindow).clipSandboxDesktop, folders);
  }

  async listPipelineCatalog(): Promise<PipelineCatalogResult> {
    const api = this.requireApi();
    if (!api.listPipelineCatalog) throw new Error('Pipeline catalog is unavailable.');
    const raw = await api.listPipelineCatalog();
    if (!ElectronPipelineCatalogService.isRecord(raw)) throw new Error('Invalid pipeline catalog response.');
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
    if (!ElectronPipelineCatalogService.isRecord(raw)
      || !Array.isArray(raw.clipNames) || !Array.isArray(raw.collections)) {
      throw new Error('Invalid pipeline details response.');
    }
    return {
      clipNames: this.parseCatalogNames(raw.clipNames),
      collections: raw.collections.map(collection => this.parsePipelineCatalogCollection(collection)),
    };
  }

  async openPipelineCatalogEntry(entry: IPipelineCatalogEntry): Promise<FolderContents> {
    const api = this.requireApi();
    if (!api.openPipelineCatalogEntry) throw new Error('Pipeline catalog is unavailable.');
    const result = await api.openPipelineCatalogEntry({ pipelineId: entry.id });
    if (!result || result.canceled) throw new Error('The selected pipeline could not be opened.');
    return this.folders.contentsOf(result);
  }

  private requireApi(): ElectronPipelineCatalogApi {
    if (!this.api) {
      throw new Error('Electron desktop API is unavailable.');
    }
    return this.api;
  }

  private parsePipelineCatalogEntry(value: unknown): IPipelineCatalogEntry {
    if (!ElectronPipelineCatalogService.isRecord(value)
      || typeof value.id !== 'string' || value.id.length === 0
      || typeof value.name !== 'string' || value.name.trim().length === 0) {
      throw new Error('Invalid pipeline catalog response.');
    }
    return Object.freeze({ id: value.id, name: value.name });
  }

  private parsePipelineCatalogCollection(value: unknown): IPipelineCatalogCollection {
    if (!ElectronPipelineCatalogService.isRecord(value)
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
}
