import type { IEventSource } from './event-source.js';
import type { IPipelineCatalogReload } from './settings-workflow.js';

type PipelineCatalogRefresherOptions = Readonly<{
  publishers: readonly (IEventSource<{ clipsPublished: void }> | null)[];
  catalog: IPipelineCatalogReload | null;
}>;

// Extraction can create a pipeline folder such as extraction-tmp, so the catalog is read again after it publishes.
export class PipelineCatalogRefresher {
  private readonly unsubscribes: (() => void)[];

  constructor(options: PipelineCatalogRefresherOptions) {
    this.unsubscribes = options.publishers.flatMap(publisher => publisher
      ? [publisher.on('clipsPublished', () => { void options.catalog?.load(); })]
      : []);
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
  }
}
