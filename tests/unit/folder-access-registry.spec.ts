import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { FolderAccessRegistry } = require('../../electron/folder-access-registry.cjs');

describe('FolderAccessRegistry', () => {
  it('authorizes only a folder selected by the same renderer', () => {
    const registry = new FolderAccessRegistry();
    const renderer = { id: 7, once: vi.fn() };
    const folderPath = path.resolve('C:/clips');

    registry.remember(renderer, folderPath);

    expect(registry.requireKnownPath(renderer, folderPath)).toBe(folderPath);
    expect(() => registry.requireKnownPath(renderer, path.resolve('C:/other-clips')))
      .toThrow('Folder access is unavailable');
  });

  it('does not share a selected folder between renderers', () => {
    const registry = new FolderAccessRegistry();
    const selectingRenderer = { id: 7, once: vi.fn() };
    const otherRenderer = { id: 8, once: vi.fn() };
    const folderPath = path.resolve('C:/clips');

    registry.remember(selectingRenderer, folderPath);

    expect(() => registry.requireKnownPath(otherRenderer, folderPath))
      .toThrow('Folder access is unavailable');
  });

  it('authorizes catalog entries only for the renderer whose catalog listed them', () => {
    const registry = new FolderAccessRegistry();
    const listingRenderer = { id: 7, once: vi.fn() };
    const otherRenderer = { id: 8, once: vi.fn() };
    const [entry] = registry.replaceCatalogPipelines(listingRenderer, [{
      folderPath: path.resolve('C:/pipelines/Example'),
      name: 'Example',
    }]);

    expect(registry.requireKnownCatalogPipeline(listingRenderer, entry.id))
      .toBe(path.resolve('C:/pipelines/Example'));
    expect(() => registry.requireKnownCatalogPipeline(otherRenderer, entry.id))
      .toThrow('Pipeline access is unavailable');
  });

  it('clears catalog-only access when the renderer is destroyed', () => {
    const registry = new FolderAccessRegistry();
    const renderer = { id: 7, once: vi.fn() };
    const [entry] = registry.replaceCatalogPipelines(renderer, [{
      folderPath: path.resolve('C:/pipelines/Example'),
      name: 'Example',
    }]);

    expect(renderer.once).toHaveBeenCalledWith('destroyed', expect.any(Function));
    const onDestroyed = renderer.once.mock.calls[0][1];
    onDestroyed();
    expect(() => registry.requireKnownCatalogPipeline(renderer, entry.id))
      .toThrow('Pipeline access is unavailable');
  });
});
