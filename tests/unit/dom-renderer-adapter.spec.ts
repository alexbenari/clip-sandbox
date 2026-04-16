// @ts-nocheck
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DomRendererAdapter } from '../../src/adapters/browser/dom-renderer-adapter.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('dom renderer adapter', () => {
  it('applies grid layout and clip count state', () => {
    const adapter = new DomRendererAdapter();
    const gridEl = document.createElement('div');
    const first = document.createElement('div');
    const second = document.createElement('div');
    gridEl.append(first, second);

    adapter.applyGridLayout(gridEl, 3, 120);

    expect(gridEl.style.gridTemplateColumns).toBe('repeat(3, 1fr)');
    expect(first.style.height).toBe('120px');
    expect(second.style.height).toBe('120px');
  });
});
