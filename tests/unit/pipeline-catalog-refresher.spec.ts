import { describe, expect, it, vi } from 'vitest';

import { EventSource } from '../../src/app/event-source.js';
import { PipelineCatalogRefresher } from '../../src/app/pipeline-catalog-refresher.js';

function refresher() {
  const gifExtraction = new EventSource<{ clipsPublished: void }>();
  const catalog = { load: vi.fn(async () => undefined) };
  const component = new PipelineCatalogRefresher({ publisher: gifExtraction, catalog });
  return { component, gifExtraction, catalog };
}

describe('PipelineCatalogRefresher', () => {
  it('reloads the Pipelines catalog after GIF Extraction publishes clips', () => {
    const { gifExtraction, catalog } = refresher();

    gifExtraction.emit('clipsPublished');

    expect(catalog.load).toHaveBeenCalledOnce();
  });

  it('no longer reloads the catalog once disposed', () => {
    const { component, gifExtraction, catalog } = refresher();

    component.dispose();
    gifExtraction.emit('clipsPublished');

    expect(catalog.load).not.toHaveBeenCalled();
  });
});
