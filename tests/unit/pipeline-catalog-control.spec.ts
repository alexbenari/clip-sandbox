import { afterEach, describe, expect, it, vi } from 'vitest';
import { PipelineCatalogControl } from '../../src/ui/pipeline-catalog-control.js';

afterEach(() => { document.body.innerHTML = ''; });

describe('PipelineCatalogControl', () => {
  it('expands pipeline and collection disclosures separately while Load remains an explicit action', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const catalog = {
      listPipelineCatalog: vi.fn(async () => ({ kind: 'available' as const, entries: [{ id: 'pipeline_1', name: 'Sample' }] })),
      describePipelineCatalogEntry: vi.fn(async () => ({
        clipNames: ['sample-01.mp4', 'sample-02.mp4'],
        collections: [{ name: 'Review', clipNames: ['sample-02.mp4'] }],
      })),
    };
    const onLoadPipeline = vi.fn(async () => undefined);
    const control = new PipelineCatalogControl({ host, catalog, onLoadPipeline, onError: vi.fn() });

    await control.load();
    const expandPipeline = host.querySelector<HTMLButtonElement>('[aria-label="Expand Sample"]')!;
    expect(host.querySelector('[aria-label="Load Sample"]')).not.toBeNull();

    expandPipeline.click();
    await vi.waitFor(() => expect(host.textContent).toContain('Review'));
    expect(host.textContent).toContain('sample-01.mp4');
    expect(host.querySelector('[aria-label="Expand collection Review"]')).not.toBeNull();
    expect(host.querySelector<HTMLUListElement>('.pipeline-tree-collections .pipeline-tree-clip-list')!.hidden).toBe(true);

    host.querySelector<HTMLButtonElement>('[aria-label="Expand collection Review"]')!.click();
    expect(host.querySelector('.pipeline-tree-collections .pipeline-tree-clip-list')?.textContent).toContain('sample-02.mp4');

    host.querySelector<HTMLButtonElement>('[aria-label="Load Sample"]')!.click();
    await vi.waitFor(() => expect(onLoadPipeline).toHaveBeenCalledWith({ id: 'pipeline_1', name: 'Sample' }));
  });
});
