import type { IEventSource } from './event-source.js';
import type { IPipelineCatalogReload } from './settings-workflow.js';

type PipelineCatalogRefresherOptions = Readonly<{
  publisher: IEventSource<{ clipsPublished: void }> | null;
  catalog: IPipelineCatalogReload | null;
}>;

// Extraction can create a pipeline folder such as extraction-tmp, so the catalog is read again after it publishes.
export class PipelineCatalogRefresher {
  private unsubscribe: (() => void) | null;

  constructor({ publisher, catalog }: PipelineCatalogRefresherOptions) {
    this.unsubscribe = publisher?.on('clipsPublished', () => { void catalog?.load(); }) ?? null;
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
