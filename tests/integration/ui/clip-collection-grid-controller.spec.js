import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import { Clip } from '../../../src/domain/clip.js';
import { ClipCollection } from '../../../src/domain/clip-collection.js';
import { createClipCollectionGridController, updateCardLabel } from '../../../src/ui/clip-collection-grid-controller.js';

describe('clip collection grid controller', () => {
  let originalCreate;
  let originalRevoke;
  let originalPlay;

  beforeEach(() => {
    document.body.innerHTML = '<div id="gridWrap"><div id="grid"></div></div>';
    originalCreate = URL.createObjectURL;
    originalRevoke = URL.revokeObjectURL;
    originalPlay = HTMLMediaElement.prototype.play;
    URL.createObjectURL = vi.fn((file) => `blob:${file.name}`);
    URL.revokeObjectURL = vi.fn();
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  });

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    HTMLMediaElement.prototype.play = originalPlay;
  });

  function makeCollection() {
    return new ClipCollection({
      name: 'demo',
      clips: [
        new Clip({ id: 'clip_1', file: new File(['a'], 'alpha.mp4', { type: 'video/mp4' }) }),
        new Clip({ id: 'clip_2', file: new File(['b'], 'bravo.webm', { type: 'video/webm' }) }),
      ],
    });
  }

  test('renders collection cards and tracks selection by clip id', () => {
    const selectionChanges = [];
    const controller = createClipCollectionGridController({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      updateCount: vi.fn(),
      recomputeLayout: vi.fn(),
      onSelectionChange: (clipId) => selectionChanges.push(clipId),
    });

    controller.renderCollection(makeCollection());
    const cards = document.querySelectorAll('#grid .thumb');
    expect(cards).toHaveLength(2);
    cards[0].click();
    expect(controller.getSelectedClipId()).toBe('clip_1');
    expect(selectionChanges.at(-1)).toBe('clip_1');
    expect(cards[0].classList.contains('selected')).toBe(true);
  });

  test('emits full order after drag-drop reorder and provides clip media source', () => {
    const orders = [];
    const openRequests = [];
    const controller = createClipCollectionGridController({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      updateCount: vi.fn(),
      recomputeLayout: vi.fn(),
      onOrderChange: (ids) => orders.push(ids),
      onOpenClip: (clipId) => openRequests.push(clipId),
    });

    controller.renderCollection(makeCollection());
    const cards = document.querySelectorAll('#grid .thumb');
    const dataTransfer = {
      effectAllowed: '',
      store: new Map(),
      setData(type, value) { this.store.set(type, value); },
      getData(type) { return this.store.get(type) || ''; },
    };

    const dragStartEvent = new Event('dragstart', { bubbles: true });
    Object.defineProperty(dragStartEvent, 'dataTransfer', { value: dataTransfer });
    cards[0].dispatchEvent(dragStartEvent);

    cards[1].getBoundingClientRect = () => ({ top: 0, height: 100 });
    const dropEvent = new Event('drop', { bubbles: true });
    Object.defineProperty(dropEvent, 'dataTransfer', { value: dataTransfer });
    Object.defineProperty(dropEvent, 'clientY', { value: 80 });
    cards[1].dispatchEvent(dropEvent);

    expect(orders.at(-1)).toEqual(['clip_2', 'clip_1']);
    document.querySelectorAll('#grid .thumb')[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(openRequests).toEqual(['clip_2']);
    expect(controller.getClipMediaSource('clip_2')).toBe('blob:bravo.webm');
  });

  test('renders safe filename labels and updates duration text', () => {
    const controller = createClipCollectionGridController({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name, seconds) => `${name} (${seconds ?? '--:--:--'})`,
      updateCount: vi.fn(),
      recomputeLayout: vi.fn(),
    });

    controller.renderCollection(
      new ClipCollection({
        name: 'demo',
        clips: [new Clip({ id: 'clip_1', file: new File(['a'], '<img src=x>.mp4', { type: 'video/mp4' }) })],
      })
    );

    const card = document.querySelector('#grid .thumb');
    const label = card.querySelector('.filename');
    expect(label.textContent).toBe('<img src=x>.mp4 (--:--:--)');
    expect(label.querySelector('img')).toBeNull();

    card.dataset.durationSeconds = '12.5';
    updateCardLabel(card, (name, seconds) => `${name} (${seconds?.toFixed(1) ?? '--'})`);
    expect(card.querySelector('.filename').textContent).toBe('<img src=x>.mp4 (12.5)');
  });

  test('owns title visibility on the grid surface', () => {
    const controller = createClipCollectionGridController({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      updateCount: vi.fn(),
      recomputeLayout: vi.fn(),
    });

    expect(controller.areTitlesHidden()).toBe(false);
    expect(document.getElementById('clipCollectionGridStyles')).not.toBeNull();
    expect(document.getElementById('gridWrap').classList.contains('clip-collection-grid-root')).toBe(true);
    expect(document.getElementById('grid').classList.contains('clip-collection-grid')).toBe(true);
    controller.setTitlesHidden(true);
    expect(controller.areTitlesHidden()).toBe(true);
    expect(document.getElementById('gridWrap').classList.contains('titles-hidden')).toBe(true);
  });

  test('revokes object urls and clears drag-over state when rerendering or destroying', () => {
    const controller = createClipCollectionGridController({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      updateCount: vi.fn(),
      recomputeLayout: vi.fn(),
    });

    controller.renderCollection(makeCollection());
    const cards = document.querySelectorAll('#grid .thumb');
    cards[0].classList.add('drag-over');
    cards[1].classList.add('drag-over');

    const dataTransfer = {
      effectAllowed: '',
      store: new Map(),
      setData(type, value) { this.store.set(type, value); },
      getData(type) { return this.store.get(type) || ''; },
    };
    const dragStartEvent = new Event('dragstart', { bubbles: true });
    Object.defineProperty(dragStartEvent, 'dataTransfer', { value: dataTransfer });
    cards[0].dispatchEvent(dragStartEvent);
    cards[0].dispatchEvent(new Event('dragend', { bubbles: true }));
    expect(cards[0].classList.contains('drag-over')).toBe(false);
    expect(cards[1].classList.contains('drag-over')).toBe(false);

    controller.renderCollection(makeCollection());
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    controller.setTitlesHidden(true);
    controller.destroy();
    expect(document.getElementById('grid').children).toHaveLength(0);
    expect(document.getElementById('gridWrap').classList.contains('titles-hidden')).toBe(false);
  });

  test('injects default styles only once per document', () => {
    createClipCollectionGridController({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      updateCount: vi.fn(),
      recomputeLayout: vi.fn(),
    });

    const otherRoot = document.createElement('div');
    otherRoot.id = 'gridWrapTwo';
    const otherGrid = document.createElement('div');
    otherGrid.id = 'gridTwo';
    otherRoot.appendChild(otherGrid);
    document.body.appendChild(otherRoot);

    createClipCollectionGridController({
      grid: otherGrid,
      gridRoot: otherRoot,
      updateCount: vi.fn(),
      recomputeLayout: vi.fn(),
    });

    expect(document.querySelectorAll('#clipCollectionGridStyles')).toHaveLength(1);
  });
});

