// @ts-nocheck
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import { Clip } from '../../../src/domain/clip.js';
import { ClipSequence } from '../../../src/domain/clip-sequence.js';
import { ClipCollectionGridController } from '../../../src/ui/clip-collection-grid-controller.js';

const createClipCollectionGridController = options => new ClipCollectionGridController(options);

describe('clip collection grid controller', () => {
  let originalCreate;
  let originalRevoke;
  let originalPlay;
  let originalPause;

  beforeEach(() => {
    document.body.innerHTML = '<div id="gridWrap"><div id="grid"></div></div>';
    originalCreate = URL.createObjectURL;
    originalRevoke = URL.revokeObjectURL;
    originalPlay = HTMLMediaElement.prototype.play;
    originalPause = HTMLMediaElement.prototype.pause;
    URL.createObjectURL = vi.fn((file) => `blob:${file.name}`);
    URL.revokeObjectURL = vi.fn();
    HTMLMediaElement.prototype.play = vi.fn(function playPreview() {
      Object.defineProperty(this, 'paused', { value: false, configurable: true });
      return Promise.resolve();
    });
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    HTMLMediaElement.prototype.play = originalPlay;
    HTMLMediaElement.prototype.pause = originalPause;
  });

  function makeCollection() {
    return new ClipSequence({
      name: 'demo',
      clips: [
        new Clip({ id: 'clip_1', file: new File(['a'], 'alpha.mp4', { type: 'video/mp4' }) }),
        new Clip({ id: 'clip_2', file: new File(['b'], 'bravo.webm', { type: 'video/webm' }) }),
      ],
    });
  }

  test('prepares final card positions without replacing videos and reconciles settled bounds', () => {
    const grid = document.getElementById('grid');
    const root = document.getElementById('gridWrap');
    root.style.padding = '14px';
    Object.defineProperty(root, 'clientWidth', { configurable: true, value: 428 });
    const computeBestGrid = vi.fn(({ availW }) => ({ cols: availW >= 600 ? 2 : 1, cellH: 100 }));
    const controller = createClipCollectionGridController({
      grid,
      gridRoot: root,
      coordinateWorkspaceLayout: true,
      getAvailableHeight: () => 400,
      layoutRules: { computeBestGrid },
    });
    controller.renderCollection(makeCollection());
    const videos = [...grid.querySelectorAll('video')];
    controller.beginWorkspaceResize(828, 240);
    expect(grid.dataset.layoutCols).toBe('2');
    expect(grid.children[1].style.top).toBe('0px');
    expect(grid.children[1].style.left).toBe('400px');
    expect([...grid.querySelectorAll('video')]).toEqual(videos);
    Object.defineProperty(root, 'clientWidth', { configurable: true, value: 828 });
    const target = grid.children[1].style.cssText;
    controller.endWorkspaceResize();
    expect(grid.children[1].style.cssText).toBe(target);
    expect(computeBestGrid).toHaveBeenLastCalledWith(expect.objectContaining({ availW: 800 }));
  });

  function makeThreeClipCollection() {
    return new ClipSequence({
      name: 'demo',
      clips: [
        new Clip({ id: 'clip_1', file: new File(['a'], 'alpha.mp4', { type: 'video/mp4' }) }),
        new Clip({ id: 'clip_2', file: new File(['b'], 'bravo.webm', { type: 'video/webm' }) }),
        new Clip({ id: 'clip_3', file: new File(['c'], 'charlie.mp4', { type: 'video/mp4' }) }),
      ],
    });
  }

  test('fullscreen rotation preserves card identity and cancels on restoration', () => {
    const grid = document.getElementById('grid');
    const collection = makeThreeClipCollection();
    const opened = vi.fn();
    const controller = createClipCollectionGridController({
      grid, isFullscreen: () => true, onOpenClip: opened,
      layoutRules: { computeFullscreenLayout: () => ({ cols: 2, cellH: 100, targetVisible: 2 }) },
    });
    controller.renderCollection(collection);
    const cards = [...grid.children];
    const sources = cards.map(card => card.querySelector('video').src);
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    controller.rotateVisibleClip();
    cards[1].querySelector('video').dispatchEvent(new Event('ended'));
    expect(cards[0].style.display).toBe('');
    expect(cards[1].style.display).toBe('none');
    expect(cards[0].style.order).toBe('1');
    expect(cards[2].style.order).toBe('2');
    cards.forEach((card, index) => {
      expect(card.dataset.clipId).toBe(`clip_${index + 1}`);
      expect(card.querySelector('video').src).toBe(sources[index]);
    });
    const video = cards[0].querySelector('video');
    Object.defineProperties(video, { duration: { value: 7 }, videoWidth: { value: 320 }, videoHeight: { value: 180 } });
    video.dispatchEvent(new Event('loadedmetadata'));
    expect(collection.getClip('clip_1').durationSec).toBe(7);
    expect(collection.getClip('clip_2').durationSec).toBeNull();
    cards[0].dispatchEvent(new MouseEvent('dblclick'));
    expect(opened).toHaveBeenCalledWith('clip_1');
    controller.rotateVisibleClip();
    controller.fsRestore();
    cards.forEach(card => card.querySelector('video').dispatchEvent(new Event('ended')));
    expect(cards.every(card => card.style.display === '' && card.style.order === '')).toBe(true);
    expect(cards.every(card => card.querySelector('video').loop)).toBe(true);
    random.mockRestore();
    controller.destroy();
  });

  test('view replacement, restart and disposal cancel pending fullscreen rotation', () => {
    const grid = document.getElementById('grid');
    const controller = createClipCollectionGridController({
      grid, isFullscreen: () => true,
      layoutRules: { computeFullscreenLayout: () => ({ cols: 2, cellH: 100, targetVisible: 2 }) },
    });
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    controller.renderCollection(makeThreeClipCollection(), { cacheKey: 'first' });
    const oldVideo = grid.children[1].querySelector('video');
    controller.rotateVisibleClip();
    controller.renderCollection(makeThreeClipCollection(), { cacheKey: 'second' });
    const active = document.getElementById('grid');
    const before = [...active.children].map(card => card.style.display);
    oldVideo.dispatchEvent(new Event('ended'));
    expect([...active.children].map(card => card.style.display)).toEqual(before);
    expect(oldVideo.loop).toBe(true);
    const currentVideo = active.children[1].querySelector('video');
    controller.rotateVisibleClip();
    controller.cancelRotation();
    controller.rotateVisibleClip();
    currentVideo.dispatchEvent(new Event('ended'));
    expect(active.children[0].style.display).toBe('');
    expect(active.children[1].style.display).toBe('none');
    controller.rotateVisibleClip();
    const finalVideo = active.children[0].querySelector('video');
    controller.destroy();
    finalVideo.dispatchEvent(new Event('ended'));
    expect(active.children).toHaveLength(0);
    expect(finalVideo.loop).toBe(true);
    random.mockRestore();
  });

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
    expect([...document.querySelectorAll('#grid video')].every(video => video.muted)).toBe(true);
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
      new ClipSequence({
        name: 'demo',
        clips: [new Clip({ id: 'clip_1', file: new File(['a'], '<img src=x>.mp4', { type: 'video/mp4' }) })],
      })
    );

    const card = document.querySelector('#grid .thumb');
    const label = card.querySelector('.filename');
    expect(label.textContent).toBe('<img src=x>.mp4 (--:--:--)');
    expect(label.querySelector('img')).toBeNull();

    const video = card.querySelector('video');
    Object.defineProperty(video, 'duration', { value: 12.5 });
    video.dispatchEvent(new Event('loadedmetadata'));
    expect(card.querySelector('.filename').textContent).toBe('<img src=x>.mp4 (12.5)');
  });

  test('batches initial card insertion and waits for metadata before starting preview playback', () => {
    const grid = document.getElementById('grid');
    const appendChildSpy = vi.spyOn(grid, 'appendChild');
    const controller = createClipCollectionGridController({
      grid,
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      updateCount: vi.fn(),
      recomputeLayout: vi.fn(),
    });

    controller.renderCollection(makeCollection());

    const videos = Array.from(document.querySelectorAll('#grid video'));
    expect(appendChildSpy).toHaveBeenCalledTimes(1);
    expect(videos).toHaveLength(2);
    expect(videos.every((video) => video.autoplay === false)).toBe(true);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();

    Object.defineProperty(videos[0], 'duration', { value: 1, configurable: true });
    Object.defineProperty(videos[0], 'videoWidth', { value: 640, configurable: true });
    Object.defineProperty(videos[0], 'videoHeight', { value: 360, configurable: true });
    videos[0].dispatchEvent(new Event('loadedmetadata'));

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  });

  test('reuses cached card videos and resumes playback after switching back to an unchanged view', async () => {
    const controller = createClipCollectionGridController({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      updateCount: vi.fn(),
      recomputeLayout: vi.fn(),
    });
    const pipeline = makeThreeClipCollection();
    const collection = new ClipSequence({
      name: 'subset',
      clips: [pipeline.orderedClips()[0]],
    });

    controller.renderCollection(pipeline, { cacheKey: 'pipeline' });
    const pipelineGrid = document.getElementById('grid');
    expect(document.querySelectorAll('.clip-collection-grid')).toHaveLength(1);
    const firstPipelineVideo = document.querySelector('#grid video');
    for (const video of Array.from(document.querySelectorAll('#grid video'))) {
      Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
    }
    controller.renderCollection(collection, { cacheKey: 'collection:subset.txt' });
    const collectionGrid = document.getElementById('grid');
    expect(document.querySelectorAll('.clip-collection-grid')).toHaveLength(2);
    expect(collectionGrid).not.toBe(pipelineGrid);
    expect(pipelineGrid.id).toBe('');
    expect(pipelineGrid.style.opacity).toBe('0');
    expect(pipelineGrid.style.position).toBe('absolute');
    expect(pipelineGrid.inert).toBe(true);
    expect(pipelineGrid.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelectorAll('#grid .thumb')).toHaveLength(1);
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();

    HTMLMediaElement.prototype.play.mockClear();
    for (const video of Array.from(pipelineGrid.querySelectorAll('video'))) {
      Object.defineProperty(video, 'paused', { value: true, configurable: true });
    }
    controller.renderCollection(pipeline, { cacheKey: 'pipeline' });

    expect(document.querySelectorAll('.clip-collection-grid')).toHaveLength(2);
    expect(document.getElementById('grid')).toBe(pipelineGrid);
    expect(pipelineGrid.style.opacity).toBe('');
    expect(pipelineGrid.style.position).toBe('');
    expect(pipelineGrid.inert).toBe(false);
    expect(pipelineGrid.hasAttribute('aria-hidden')).toBe(false);
    expect(collectionGrid.id).toBe('');
    expect(collectionGrid.style.opacity).toBe('0');
    expect(document.querySelector('#grid video')).toBe(firstPipelineVideo);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(HTMLMediaElement.prototype.play.mock.calls.length).toBeGreaterThan(0);
    expect(HTMLMediaElement.prototype.play.mock.calls.length).toBeLessThanOrEqual(3);
    expect(Array.from(document.querySelectorAll('#grid .thumb')).map((card) => card.dataset.clipId)).toEqual([
      'clip_1',
      'clip_2',
      'clip_3',
    ]);
    controller.destroy();
  });

  test('invalidates cached card videos when a view sequence changes', () => {
    const controller = createClipCollectionGridController({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      updateCount: vi.fn(),
      recomputeLayout: vi.fn(),
    });
    const pipeline = makeThreeClipCollection();
    const collection = new ClipSequence({
      name: 'subset',
      clips: [pipeline.orderedClips()[0]],
    });

    controller.renderCollection(pipeline, { cacheKey: 'pipeline' });
    const firstPipelineVideo = document.querySelector('#grid video');
    controller.renderCollection(collection, { cacheKey: 'collection:subset.txt' });
    controller.invalidateView('pipeline');
    controller.renderCollection(new ClipSequence({
      name: 'changed',
      clips: pipeline.orderedClips().slice(0, 2),
    }), { cacheKey: 'pipeline' });

    expect(document.querySelector('#grid video')).not.toBe(firstPipelineVideo);
    expect(Array.from(document.querySelectorAll('#grid .thumb')).map((card) => card.dataset.clipId)).toEqual([
      'clip_1',
      'clip_2',
    ]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:alpha.mp4');
  });

  test('does not reapply an unchanged cached grid layout when switching back', () => {
    const controller = createClipCollectionGridController({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      updateCount: vi.fn(),
      layoutRules: { computeBestGrid: ({ count }) => ({ cols: count, cellH: count === 1 ? 240 : 120 }) },
    });
    const pipeline = makeThreeClipCollection();
    const collection = new ClipSequence({
      name: 'subset',
      clips: [pipeline.orderedClips()[0]],
    });

    controller.renderCollection(pipeline, { cacheKey: 'pipeline' });

    controller.renderCollection(collection, { cacheKey: 'collection:subset.txt' });

    controller.renderCollection(pipeline, { cacheKey: 'pipeline' });
    expect(document.querySelector('#grid').style.gridTemplateColumns).toBe('repeat(3, 1fr)');
    expect(document.querySelector('#grid .thumb').style.height).toBe('120px');
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

  test('owns normal and fullscreen layout application for grid cards', () => {
    const grid = document.getElementById('grid');
    const gridRoot = document.getElementById('gridWrap');
    const toolbar = document.createElement('div');
    document.body.appendChild(toolbar);
    Object.defineProperty(gridRoot, 'clientWidth', { value: 900, configurable: true });
    toolbar.getBoundingClientRect = () => ({ height: 48 });
    let fullscreen = false;
    const controller = createClipCollectionGridController({
      grid,
      gridRoot,
      toolbar,
      formatLabel: (name) => name,
      layoutRules: {
        computeBestGrid: vi.fn(() => ({ cols: 2, cellH: 180 })),
        computeFullscreenLayout: vi.fn(() => ({ cols: 2, cellH: 220, targetVisible: 2 })),
      },
      isFullscreen: () => fullscreen,
      updateCount: vi.fn(),
    });

    controller.renderCollection(makeThreeClipCollection());
    expect(document.querySelector('#grid').style.gridTemplateColumns).toBe('repeat(2, 1fr)');
    expect(document.querySelector('#grid .thumb').style.height).toBe('180px');

    fullscreen = true;
    controller.recomputeLayout();
    expect(document.querySelector('#grid').style.gridTemplateColumns).toBe('repeat(2, 1fr)');
    expect(document.querySelector('#grid .thumb').style.height).toBe('220px');

    const cards = Array.from(document.querySelectorAll('#grid .thumb'));
    expect(cards.filter((card) => card.style.display === 'none')).toHaveLength(1);

    controller.fsRestore();
    expect(cards.every((card) => card.style.display === '')).toBe(true);
  });

  test('stores card video metadata on clips and relayouts once when columns change', async () => {
    const grid = document.getElementById('grid');
    const gridRoot = document.getElementById('gridWrap');
    Object.defineProperty(gridRoot, 'clientWidth', { value: 900, configurable: true });
    const computeBestGrid = vi.fn()
      .mockReturnValueOnce({ cols: 1, cellH: 100 })
      .mockReturnValueOnce({ cols: 2, cellH: 180 });
    const controller = createClipCollectionGridController({
      grid,
      gridRoot,
      formatLabel: (name) => name,
      layoutRules: { computeBestGrid },
      updateCount: vi.fn(),
    });
    const collection = makeCollection();

    controller.renderCollection(collection);
    const videos = Array.from(document.querySelectorAll('#grid video'));
    for (const video of videos) {
      Object.defineProperty(video, 'duration', { value: 2.5, configurable: true });
      Object.defineProperty(video, 'videoWidth', { value: 720, configurable: true });
      Object.defineProperty(video, 'videoHeight', { value: 390, configurable: true });
      video.dispatchEvent(new Event('loadedmetadata'));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(collection.orderedClips()[0].videoWidth).toBe(720);
    expect(collection.orderedClips()[0].videoHeight).toBe(390);
    expect(collection.orderedClips()[0].durationSec).toBe(2.5);
    expect(document.querySelector('#grid').style.gridTemplateColumns).toBe('repeat(2, 1fr)');
    expect(document.querySelector('#grid .thumb').style.height).toBe('180px');
  });

  test('skips metadata-complete relayout when the column count is unchanged', async () => {
    const controller = createClipCollectionGridController({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      layoutRules: {
        computeBestGrid: vi.fn()
          .mockReturnValueOnce({ cols: 2, cellH: 100 })
          .mockReturnValueOnce({ cols: 2, cellH: 180 }),
      },
      updateCount: vi.fn(),
    });

    controller.renderCollection(makeCollection());
    for (const video of Array.from(document.querySelectorAll('#grid video'))) {
      Object.defineProperty(video, 'duration', { value: 1, configurable: true });
      Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
      Object.defineProperty(video, 'videoHeight', { value: 360, configurable: true });
      video.dispatchEvent(new Event('loadedmetadata'));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.querySelector('#grid').style.gridTemplateColumns).toBe('repeat(2, 1fr)');
    expect(document.querySelector('#grid .thumb').style.height).toBe('100px');
  });

  test('defers metadata-complete relayout while dragging', async () => {
    const controller = createClipCollectionGridController({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      layoutRules: {
        computeBestGrid: vi.fn()
          .mockReturnValueOnce({ cols: 1, cellH: 100 })
          .mockReturnValueOnce({ cols: 2, cellH: 180 }),
      },
      updateCount: vi.fn(),
    });

    controller.renderCollection(makeCollection());
    const cards = document.querySelectorAll('#grid .thumb');
    const dragStartEvent = new Event('dragstart', { bubbles: true });
    Object.defineProperty(dragStartEvent, 'dataTransfer', {
      value: {
        effectAllowed: '',
        setData: vi.fn(),
      },
    });
    cards[0].dispatchEvent(dragStartEvent);

    for (const video of Array.from(document.querySelectorAll('#grid video'))) {
      Object.defineProperty(video, 'duration', { value: 1, configurable: true });
      Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
      Object.defineProperty(video, 'videoHeight', { value: 360, configurable: true });
      video.dispatchEvent(new Event('loadedmetadata'));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    cards[0].dispatchEvent(new Event('dragend', { bubbles: true }));
    expect(document.querySelector('#grid').style.gridTemplateColumns).toBe('repeat(2, 1fr)');
    expect(document.querySelector('#grid .thumb').style.height).toBe('180px');
  });

  test('reports metadata failure once and still completes relayout', async () => {
    const metadataFailures = [];
    const controller = createClipCollectionGridController({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      layoutRules: {
        computeBestGrid: vi.fn()
          .mockReturnValueOnce({ cols: 1, cellH: 100 })
          .mockReturnValueOnce({ cols: 2, cellH: 180 }),
      },
      updateCount: vi.fn(),
      onMetadataFailure: (failure) => metadataFailures.push(failure),
    });

    controller.renderCollection(makeCollection());
    const videos = Array.from(document.querySelectorAll('#grid video'));
    Object.defineProperty(videos[0], 'duration', { value: 1, configurable: true });
    Object.defineProperty(videos[0], 'videoWidth', { value: 640, configurable: true });
    Object.defineProperty(videos[0], 'videoHeight', { value: 360, configurable: true });
    videos[0].dispatchEvent(new Event('loadedmetadata'));
    videos[1].dispatchEvent(new Event('error'));
    videos[1].dispatchEvent(new Event('error'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(metadataFailures).toHaveLength(1);
    expect(metadataFailures[0].clip.name).toBe('bravo.webm');
    expect(controller.getClipById('clip_2').metadataFailed).toBe(true);
    expect(document.querySelector('#grid').style.gridTemplateColumns).toBe('repeat(2, 1fr)');
    expect(document.querySelector('#grid .thumb').style.height).toBe('180px');
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
      new ClipSequence({
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
      new ClipSequence({
        name: 'subset',
        clips: [new Clip({ id: 'clip_3', file: new File(['c'], 'charlie.mp4', { type: 'video/mp4' }) })],
      })
    );
    expect(controller.getSelectedClipIds()).toEqual(['clip_3']);
    expect(controller.getSelectedClipId()).toBe('clip_3');
  });

  test('emits context-menu requests without changing the current selection', () => {
    const contextMenuRequests = [];
    const controller = createClipCollectionGridController({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      updateCount: vi.fn(),
      recomputeLayout: vi.fn(),
      onContextMenu: (payload) => contextMenuRequests.push(payload),
    });

    controller.renderCollection(
      new ClipSequence({
        name: 'demo',
        clips: [
          new Clip({ id: 'clip_1', file: new File(['a'], 'alpha.mp4', { type: 'video/mp4' }) }),
          new Clip({ id: 'clip_2', file: new File(['b'], 'bravo.webm', { type: 'video/webm' }) }),
        ],
      })
    );

    const cards = document.querySelectorAll('#grid .thumb');
    cards[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    cards[1].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    expect(controller.getSelectedClipIds()).toEqual(['clip_1', 'clip_2']);

    document.getElementById('gridWrap').dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      clientX: 180,
      clientY: 220,
    }));

    expect(contextMenuRequests).toHaveLength(1);
    expect(contextMenuRequests[0].selectedClipIds).toEqual(['clip_1', 'clip_2']);
    expect(contextMenuRequests[0].clipId).toBeNull();
    expect(controller.getSelectedClipIds()).toEqual(['clip_1', 'clip_2']);
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




test('focuses selected cards through the grid API without relying on selection CSS', () => {
  const root = document.createElement('div');
  const grid = document.createElement('div');
  const card = document.createElement('article');
  card.className = 'thumb';
  card.dataset.clipId = 'selected-clip';
  grid.append(card); root.append(grid); document.body.append(root);
  const controller = createClipCollectionGridController({ grid, gridRoot: root });
  expect(controller.focusSelectedClip()).toBe(false);
  controller.setSelectedClipId('selected-clip');
  card.classList.remove('selected');
  expect(controller.focusSelectedClip()).toBe(true);
  expect(document.activeElement).toBe(card);
  controller.destroy(); root.remove();
});

test('measures allocated grid height using its own current padding', () => {
  const root = document.createElement('div');
  const grid = document.createElement('div');
  root.append(grid); document.body.append(root);
  Object.defineProperty(root, 'clientHeight', { value: 480 });
  root.style.padding = '10px 14px 22px';
  const computeBestGrid = vi.fn(() => ({ cols: 1, cellH: 100 }));
  const controller = createClipCollectionGridController({
    grid,
    gridRoot: root,
    coordinateWorkspaceLayout: true,
    layoutRules: { computeBestGrid },
  });
  controller.renderCollection(new ClipSequence({ clips: [new Clip({ id: 'a', file: new File(['a'], 'a.mp4'), mediaSource: 'file:///a.mp4' })] }));
  expect(computeBestGrid).toHaveBeenLastCalledWith(expect.objectContaining({ availH: 448 }));
  root.style.paddingBottom = '30px';
  controller.beginWorkspaceResize(800, 0);
  expect(computeBestGrid).toHaveBeenLastCalledWith(expect.objectContaining({ availH: 440 }));
  controller.destroy(); root.remove();
});
