import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  clearGridCards,
  createThumbCard,
  removeDragOverClasses,
  setCardDuration,
  updateCardLabel,
} from '../../../src/ui/dom-factory.js';

describe('ui dom factory', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id=\"grid\"></div>';
  });

  test('creates thumb card with safe text label and handlers', () => {
    const originalCreate = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:test');

    const onSelect = vi.fn();
    const card = createThumbCard({
      file: new File(['x'], '<img src=x>.mp4', { type: 'video/mp4' }),
      id: 'vid_1',
      formatLabel: (name) => `${name} (--:--:--)`,
      onSelect,
      onDragStart: vi.fn(),
      onDragEnd: vi.fn(),
      onDragOver: vi.fn(),
      onDragLeave: vi.fn(),
      onDrop: vi.fn(),
      onLoadedMetadata: vi.fn(),
    });
    document.getElementById('grid').appendChild(card);
    const label = card.querySelector('.filename');
    expect(label.textContent).toBe('<img src=x>.mp4 (--:--:--)');
    expect(label.querySelector('img')).toBeNull();
    card.click();
    expect(onSelect).toHaveBeenCalledOnce();

    URL.createObjectURL = originalCreate;
  });

  test('updates label and duration text', () => {
    const originalCreate = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:test');
    const card = createThumbCard({
      file: new File(['x'], 'clip.mp4', { type: 'video/mp4' }),
      id: 'vid_2',
      formatLabel: (name, seconds) => `${name} (${seconds ?? '--:--:--'})`,
      onSelect: vi.fn(),
      onDragStart: vi.fn(),
      onDragEnd: vi.fn(),
      onDragOver: vi.fn(),
      onDragLeave: vi.fn(),
      onDrop: vi.fn(),
      onLoadedMetadata: vi.fn(),
    });
    setCardDuration(card, 12.5, (name, seconds) => `${name} (${seconds?.toFixed(1) ?? '--'})`);
    updateCardLabel(card, (name, seconds) => `${name} (${seconds?.toFixed(1) ?? '--'})`);
    expect(card.querySelector('.filename').textContent).toBe('clip.mp4 (12.5)');
    URL.createObjectURL = originalCreate;
  });

  test('clears drag-over and grid object urls', () => {
    const grid = document.getElementById('grid');
    const a = document.createElement('div');
    a.className = 'thumb drag-over';
    a.dataset.objectUrl = 'blob:a';
    const b = document.createElement('div');
    b.className = 'thumb drag-over';
    b.dataset.objectUrl = 'blob:b';
    grid.appendChild(a);
    grid.appendChild(b);

    removeDragOverClasses(grid);
    expect(a.classList.contains('drag-over')).toBe(false);
    expect(b.classList.contains('drag-over')).toBe(false);

    const originalRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = vi.fn();
    clearGridCards(grid);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:b');
    expect(grid.children.length).toBe(0);
    URL.revokeObjectURL = originalRevoke;
  });
});
