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
});
