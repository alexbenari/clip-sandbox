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

  test('tracks single and modifier-based multi-selection by clip id', () => {
    const selectionChanges = [];
    const controller = createClipCollectionGridController({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      updateCount: vi.fn(),
      recomputeLayout: vi.fn(),
      onSelectionChange: (clipId, clipIds) => selectionChanges.push({ clipId, clipIds }),
    });

    controller.renderCollection(makeCollection());
    const cards = document.querySelectorAll('#grid .thumb');
    expect(cards).toHaveLength(2);
    cards[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(controller.getSelectedClipId()).toBe('clip_1');
    expect(controller.getSelectedClipIds()).toEqual(['clip_1']);
    expect(selectionChanges.at(-1)).toEqual({ clipId: 'clip_1', clipIds: ['clip_1'] });
    expect(cards[0].classList.contains('selected')).toBe(true);

    cards[1].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    expect(controller.getSelectedClipId()).toBeNull();
    expect(controller.getSelectedClipIds()).toEqual(['clip_1', 'clip_2']);
    expect(cards[1].classList.contains('selected')).toBe(true);

    cards[0].dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true }));
    expect(controller.getSelectedClipId()).toBe('clip_2');
    expect(controller.getSelectedClipIds()).toEqual(['clip_2']);

    cards[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(controller.getSelectedClipId()).toBe('clip_1');
    expect(controller.getSelectedClipIds()).toEqual(['clip_1']);
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
    expect(controller.getClipById('clip_2')?.name).toBe('bravo.webm');
    expect(controller.getPrevClip('clip_2')).toBeNull();
    expect(controller.getNextClip('clip_2')?.id).toBe('clip_1');
    expect(controller.getPrevClip('clip_1')?.id).toBe('clip_2');
    expect(controller.getNextClip('clip_1')).toBeNull();
    expect(controller.getSelectedClipIds()).toEqual(['clip_2']);
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

  test('drops invalid selections on rerender and emits ordered selected ids for removal', () => {
    const removalRequests = [];
    const controller = createClipCollectionGridController({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      updateCount: vi.fn(),
      recomputeLayout: vi.fn(),
      onRemoveSelected: (clipIds) => removalRequests.push(clipIds),
    });

    controller.renderCollection(
      new ClipCollection({
        name: 'demo',
        clips: [
          new Clip({ id: 'clip_1', file: new File(['a'], 'alpha.mp4', { type: 'video/mp4' }) }),
          new Clip({ id: 'clip_2', file: new File(['b'], 'bravo.webm', { type: 'video/webm' }) }),
          new Clip({ id: 'clip_3', file: new File(['c'], 'charlie.mp4', { type: 'video/mp4' }) }),
        ],
      })
    );

    const cards = document.querySelectorAll('#grid .thumb');
    cards[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    cards[2].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    expect(controller.getSelectedClipIds()).toEqual(['clip_1', 'clip_3']);

    const handled = controller.handleKeyDown(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(handled).toBe(true);
    expect(removalRequests).toEqual([['clip_1', 'clip_3']]);

    const input = document.createElement('input');
    document.body.appendChild(input);
    const inputDelete = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true });
    Object.defineProperty(inputDelete, 'target', { value: input });
    expect(controller.handleKeyDown(inputDelete)).toBe(false);

    controller.renderCollection(
      new ClipCollection({
        name: 'subset',
        clips: [new Clip({ id: 'clip_3', file: new File(['c'], 'charlie.mp4', { type: 'video/mp4' }) })],
      })
    );
    expect(controller.getSelectedClipIds()).toEqual(['clip_3']);
    expect(controller.getSelectedClipId()).toBe('clip_3');
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

