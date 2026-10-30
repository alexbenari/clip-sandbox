// @ts-nocheck
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import { Clip } from '../../../src/domain/clip.js';
import { ClipSequence } from '../../../src/domain/clip-sequence.js';
import { SourceMovie } from '../../../src/domain/source-movie.js';
import { ClipCollectionGridControl } from '../../../src/ui/clip-collection-grid-control.js';
import { testClip, clipSource } from '../../support/clip-source-fixtures.js';

const createClipCollectionGridControl = options => new ClipCollectionGridControl(options);

describe('clip collection grid controller', () => {
  let originalPlay;
  let originalPause;

  beforeEach(() => {
    document.body.innerHTML = '<div id="gridWrap"><div id="grid"></div></div>';
    originalPlay = HTMLMediaElement.prototype.play;
    originalPause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.play = vi.fn(function playPreview() {
      Object.defineProperty(this, 'paused', { value: false, configurable: true });
      return Promise.resolve();
    });
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  afterEach(() => {
    HTMLMediaElement.prototype.play = originalPlay;
    HTMLMediaElement.prototype.pause = originalPause;
    vi.restoreAllMocks();
  });

  function makeCollection() {
    return new ClipSequence({
      name: 'demo',
      clips: [
        testClip('clip_1', 'alpha.mp4'),
        testClip('clip_2', 'bravo.webm'),
      ],
    });
  }

  test('prepares final card positions without replacing videos and reconciles settled bounds', () => {
    const grid = document.getElementById('grid');
    const root = document.getElementById('gridWrap');
    root.style.padding = '14px';
    Object.defineProperty(root, 'clientWidth', { configurable: true, value: 428 });
    const computeBestGrid = vi.fn(({ availW }) => ({ cols: availW >= 600 ? 2 : 1, cellH: 100 }));
    const controller = createClipCollectionGridControl({
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
        testClip('clip_1', 'alpha.mp4'),
        testClip('clip_2', 'bravo.webm'),
        testClip('clip_3', 'charlie.mp4'),
      ],
    });
  }

  test('fullscreen rotation preserves card identity and cancels on restoration', () => {
    const grid = document.getElementById('grid');
    const collection = makeThreeClipCollection();
    const opened = vi.fn();
    const controller = createClipCollectionGridControl({
      grid, isFullscreen: () => true,
      layoutRules: { computeFullscreenLayout: () => ({ cols: 2, cellH: 100, targetVisible: 2 }) },
    });
    controller.on('openClipRequested', opened);
    controller.renderCollection(collection);
    const cards = [...grid.children];
    const sources = cards.map(card => card.querySelector('video').src);
    vi.spyOn(Math, 'random').mockReturnValue(0);
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
    controller.dispose();
  });

  test('view replacement, restart and disposal cancel pending fullscreen rotation', () => {
    const grid = document.getElementById('grid');
    const controller = createClipCollectionGridControl({
      grid, isFullscreen: () => true,
      layoutRules: { computeFullscreenLayout: () => ({ cols: 2, cellH: 100, targetVisible: 2 }) },
    });
    vi.spyOn(Math, 'random').mockReturnValue(0);
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
    controller.dispose();
    finalVideo.dispatchEvent(new Event('ended'));
    expect(active.children).toHaveLength(0);
    expect(finalVideo.loop).toBe(true);
  });

  test('tracks single and modifier-based multi-selection by clip id', () => {
    const selectionChanges = [];
    const controller = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      recomputeLayout: vi.fn(),
    });
    controller.on('selectionChanged', ({ selectedClipId, selectedClipIds }) => selectionChanges.push({ clipId: selectedClipId, clipIds: selectedClipIds }));

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

  test('reorders a collection view without pulling cards from a cached view of the same clips', () => {
    const orders = [];
    const controller = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      recomputeLayout: vi.fn(),
    });
    controller.on('orderChanged', (ids) => orders.push(ids));
    const pipeline = makeThreeClipCollection();
    const [alpha, bravo, charlie] = pipeline.orderedClips();
    controller.renderCollection(pipeline, { cacheKey: 'pipeline' });
    const pipelineGrid = document.getElementById('grid');
    controller.renderCollection(new ClipSequence({ name: 'subset', clips: [charlie, alpha] }), { cacheKey: 'subset.txt' });
    const collectionGrid = document.getElementById('grid');
    expect(collectionGrid).not.toBe(pipelineGrid);
    const cards = [...collectionGrid.children];
    const dataTransfer = {
      effectAllowed: '',
      store: new Map(),
      setData(type, value) { this.store.set(type, value); },
      getData(type) { return this.store.get(type) || ''; },
    };

    const dragStartEvent = new Event('dragstart', { bubbles: true });
    Object.defineProperty(dragStartEvent, 'dataTransfer', { value: dataTransfer });
    cards[1].dispatchEvent(dragStartEvent);
    cards[0].getBoundingClientRect = () => ({ top: 0, height: 100 });
    const dropEvent = new Event('drop', { bubbles: true });
    Object.defineProperty(dropEvent, 'dataTransfer', { value: dataTransfer });
    Object.defineProperty(dropEvent, 'clientY', { value: 10 });
    cards[0].dispatchEvent(dropEvent);

    expect(orders.at(-1)).toEqual([alpha.id, charlie.id]);
    expect([...collectionGrid.children].map(card => card.dataset.clipId)).toEqual([alpha.id, charlie.id]);
    expect([...pipelineGrid.children].map(card => card.dataset.clipId)).toEqual([alpha.id, bravo.id, charlie.id]);
    expect(controller.getCardCount()).toBe(2);
  });

  test('emits full order after drag-drop reorder and provides clip media source', () => {
    const orders = [];
    const openRequests = [];
    const controller = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      recomputeLayout: vi.fn(),
    });
    controller.on('orderChanged', (ids) => orders.push(ids));
    controller.on('openClipRequested', (clipId) => openRequests.push(clipId));

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
    expect(controller.getClipMediaSource('clip_2')).toBe('file:///clips/bravo.webm');
    expect(controller.getClipById('clip_2')?.name).toBe('bravo.webm');
    expect(controller.getPrevClip('clip_2')).toBeNull();
    expect(controller.getNextClip('clip_2')?.id).toBe('clip_1');
    expect(controller.getPrevClip('clip_1')?.id).toBe('clip_2');
    expect(controller.getNextClip('clip_1')).toBeNull();
    expect(controller.getSelectedClipIds()).toEqual(['clip_2']);
  });

  test('renders safe filename labels and updates duration text', () => {
    const controller = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name, seconds) => `${name} (${seconds ?? '--:--:--'})`,
      recomputeLayout: vi.fn(),
    });

    controller.renderCollection(
      new ClipSequence({
        name: 'demo',
        clips: [testClip('clip_1', '<img src=x>.mp4')],
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

  test('waits for a card\'s metadata before starting its preview playback', () => {
    const controller = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      recomputeLayout: vi.fn(),
    });

    controller.renderCollection(makeCollection());

    const videos = Array.from(document.querySelectorAll('#grid video'));
    expect(videos).toHaveLength(2);
    expect(videos.every((video) => video.autoplay === false)).toBe(true);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();

    Object.defineProperty(videos[0], 'duration', { value: 1, configurable: true });
    Object.defineProperty(videos[0], 'videoWidth', { value: 640, configurable: true });
    Object.defineProperty(videos[0], 'videoHeight', { value: 360, configurable: true });
    videos[0].dispatchEvent(new Event('loadedmetadata'));

    expect(HTMLMediaElement.prototype.play.mock.instances).toEqual([videos[0]]);
  });

  test('reuses cached card videos and resumes their playback after switching back to an unchanged view', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    try {
      const controller = createClipCollectionGridControl({
        grid: document.getElementById('grid'),
        gridRoot: document.getElementById('gridWrap'),
        formatLabel: (name) => name,
        recomputeLayout: vi.fn(),
      });
      const pipeline = makeThreeClipCollection();
      const collection = new ClipSequence({ name: 'subset', clips: [pipeline.orderedClips()[0]] });
      controller.renderCollection(pipeline, { cacheKey: 'pipeline' });
      const pipelineGrid = document.getElementById('grid');
      const pipelineVideos = Array.from(pipelineGrid.querySelectorAll('video'));
      for (const video of pipelineVideos) Object.defineProperty(video, 'readyState', { value: 2, configurable: true });

      controller.renderCollection(collection, { cacheKey: 'collection:subset.txt' });
      const collectionGrid = document.getElementById('grid');
      expect(collectionGrid).not.toBe(pipelineGrid);
      expect(pipelineGrid.inert).toBe(true);
      expect(pipelineGrid.getAttribute('aria-hidden')).toBe('true');
      expect(document.querySelectorAll('#grid .thumb')).toHaveLength(1);
      expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();

      HTMLMediaElement.prototype.play.mockClear();
      for (const video of pipelineVideos) Object.defineProperty(video, 'paused', { value: true, configurable: true });
      controller.renderCollection(pipeline, { cacheKey: 'pipeline' });

      expect(document.getElementById('grid')).toBe(pipelineGrid);
      expect(Array.from(pipelineGrid.querySelectorAll('video'))).toEqual(pipelineVideos);
      expect(pipelineGrid.inert).toBe(false);
      expect(pipelineGrid.hasAttribute('aria-hidden')).toBe(false);
      expect(collectionGrid.inert).toBe(true);
      await vi.runAllTimersAsync();
      expect(new Set(HTMLMediaElement.prototype.play.mock.instances)).toEqual(new Set(pipelineVideos));
      expect(Array.from(document.querySelectorAll('#grid .thumb')).map((card) => card.dataset.clipId)).toEqual([
        'clip_1',
        'clip_2',
        'clip_3',
      ]);
      controller.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  test('invalidates cached card videos when a view sequence changes', () => {
    const controller = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
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
  });

  test('switches back to an unchanged cached view without rewriting its card layout', () => {
    const controller = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      layoutRules: { computeBestGrid: ({ count }) => ({ cols: count, cellH: count === 1 ? 240 : 120 }) },
    });
    const pipeline = makeThreeClipCollection();
    const collection = new ClipSequence({
      name: 'subset',
      clips: [pipeline.orderedClips()[0]],
    });
    controller.renderCollection(pipeline, { cacheKey: 'pipeline' });
    const pipelineCards = [...document.querySelectorAll('#grid .thumb')];
    controller.renderCollection(collection, { cacheKey: 'collection:subset.txt' });
    const cardStyleWrites = new MutationObserver(() => undefined);
    for (const card of pipelineCards) cardStyleWrites.observe(card, { attributes: true, attributeFilter: ['style'] });

    controller.renderCollection(pipeline, { cacheKey: 'pipeline' });

    expect(cardStyleWrites.takeRecords()).toEqual([]);
    expect(document.querySelector('#grid').style.gridTemplateColumns).toBe('repeat(3, 1fr)');
    cardStyleWrites.disconnect();
  });

  test('owns title visibility on the grid surface', () => {
    const controller = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
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

  describe('source movie glyph', () => {
    function gridWithClips() {
      const controller = createClipCollectionGridControl({
        grid: document.getElementById('grid'),
        gridRoot: document.getElementById('gridWrap'),
      });
      const sequence = makeThreeClipCollection();
      const [alpha, bravo] = sequence.orderedClips();
      return { controller, sequence, alpha, bravo };
    }

    const cardOf = clip => document.querySelector(`#grid .thumb[data-clip-id="${clip.id}"]`);
    const sampleFeature = () => SourceMovie.fromFileName('Sample Feature.2001.mkv');

    test('marks a clip that came from a movie with a glyph naming that movie', () => {
      const { controller, sequence, alpha } = gridWithClips();
      alpha.recordSourceMovie(sampleFeature());

      controller.renderCollection(sequence);

      expect(cardOf(alpha).querySelector('.source-glyph')?.title).toBe('From Sample Feature.2001');
      expect(cardOf(alpha).getAttribute('aria-description')).toBe('From Sample Feature.2001');
    });

    test('shows no glyph on a clip without a source movie', () => {
      const { controller, sequence, bravo } = gridWithClips();

      controller.renderCollection(sequence);

      expect(cardOf(bravo).querySelector('.source-glyph')).toBeNull();
      expect(cardOf(bravo).hasAttribute('aria-description')).toBe(false);
    });

    test('hides glyphs with the titles while keeping the card description', () => {
      const { controller, sequence, alpha } = gridWithClips();
      alpha.recordSourceMovie(sampleFeature());
      controller.renderCollection(sequence);

      controller.setTitlesHidden(true);

      expect(getComputedStyle(cardOf(alpha).querySelector('.source-glyph')).display).toBe('none');
      expect(cardOf(alpha).getAttribute('aria-description')).toBe('From Sample Feature.2001');
    });

    test('shows a glyph learned while its view was cached once that view is shown again', () => {
      const { controller, sequence, alpha } = gridWithClips();
      controller.renderCollection(sequence, { cacheKey: 'pipeline' });
      controller.renderCollection(new ClipSequence({ name: 'subset', clips: [sequence.orderedClips()[2]] }), { cacheKey: 'collection:subset.txt' });
      alpha.recordSourceMovie(sampleFeature());

      controller.refreshSourceMovieGlyphs();
      controller.renderCollection(sequence, { cacheKey: 'pipeline' });

      expect(cardOf(alpha).querySelector('.source-glyph')?.title).toBe('From Sample Feature.2001');
    });

    test('removes the glyph when the clip no longer has a source movie', () => {
      const { controller, sequence, alpha } = gridWithClips();
      alpha.recordSourceMovie(sampleFeature());
      controller.renderCollection(sequence);

      alpha.recordSourceMovie(null);
      controller.refreshSourceMovieGlyphs();

      expect(cardOf(alpha).querySelector('.source-glyph')).toBeNull();
      expect(cardOf(alpha).hasAttribute('aria-description')).toBe(false);
    });
  });

  test('lays out again when its root resizes, except during a workspace resize', () => {
    const observers = [];
    const originalResizeObserver = window.ResizeObserver;
    window.ResizeObserver = class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(element) { this.element = element; }
      disconnect() { this.disconnected = true; }
    };
    try {
      const gridRoot = document.getElementById('gridWrap');
      const computeBestGrid = vi.fn(() => ({ cols: 1, cellH: 100 }));
      const controller = createClipCollectionGridControl({
        grid: document.getElementById('grid'),
        gridRoot,
        coordinateWorkspaceLayout: true,
        getAvailableHeight: () => 400,
        layoutRules: { computeBestGrid },
        observeRootResize: true,
      });
      controller.renderCollection(makeCollection());
      const [observer] = observers;
      expect(observer.element).toBe(gridRoot);

      computeBestGrid.mockClear();
      observer.callback();
      expect(computeBestGrid).toHaveBeenCalled();

      controller.beginWorkspaceResize(800, 240);
      computeBestGrid.mockClear();
      observer.callback();
      expect(computeBestGrid).not.toHaveBeenCalled();

      controller.endWorkspaceResize();
      controller.clear();
      controller.renderCollection(makeCollection());
      computeBestGrid.mockClear();
      observer.callback();
      expect(observer.disconnected).toBeUndefined();
      expect(computeBestGrid).toHaveBeenCalled();

      controller.dispose();
      expect(observer.disconnected).toBe(true);
    } finally {
      window.ResizeObserver = originalResizeObserver;
    }
  });

  test('owns normal and fullscreen layout application for grid cards', () => {
    const grid = document.getElementById('grid');
    const gridRoot = document.getElementById('gridWrap');
    Object.defineProperty(gridRoot, 'clientWidth', { value: 900, configurable: true });
    let fullscreen = false;
    const controller = createClipCollectionGridControl({
      grid,
      gridRoot,
      formatLabel: (name) => name,
      layoutRules: {
        computeBestGrid: vi.fn(() => ({ cols: 2, cellH: 180 })),
        computeFullscreenLayout: vi.fn(() => ({ cols: 2, cellH: 220, targetVisible: 2 })),
      },
      isFullscreen: () => fullscreen,
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
    const controller = createClipCollectionGridControl({
      grid,
      gridRoot,
      formatLabel: (name) => name,
      layoutRules: { computeBestGrid },
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
    const controller = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      layoutRules: {
        computeBestGrid: vi.fn()
          .mockReturnValueOnce({ cols: 2, cellH: 100 })
          .mockReturnValueOnce({ cols: 2, cellH: 180 }),
      },
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
    const controller = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      layoutRules: {
        computeBestGrid: vi.fn()
          .mockReturnValueOnce({ cols: 1, cellH: 100 })
          .mockReturnValueOnce({ cols: 2, cellH: 180 }),
      },
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
    const controller = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      layoutRules: {
        computeBestGrid: vi.fn()
          .mockReturnValueOnce({ cols: 1, cellH: 100 })
          .mockReturnValueOnce({ cols: 2, cellH: 180 }),
      },
    });
    controller.on('metadataFailed', (failure) => metadataFailures.push(failure));

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

  test('clears drag-over state when rerendering or destroying', () => {
    const controller = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
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
    controller.setTitlesHidden(true);
    controller.dispose();
    expect(document.getElementById('grid').children).toHaveLength(0);
    expect(document.getElementById('gridWrap').classList.contains('titles-hidden')).toBe(false);
  });

  test('drops invalid selections on rerender and emits ordered selected ids for removal', () => {
    const removalRequests = [];
    const controller = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      recomputeLayout: vi.fn(),
    });
    controller.on('removeSelectedRequested', (clipIds) => removalRequests.push(clipIds));

    controller.renderCollection(
      new ClipSequence({
        name: 'demo',
        clips: [
          testClip('clip_1', 'alpha.mp4'),
          testClip('clip_2', 'bravo.webm'),
          testClip('clip_3', 'charlie.mp4'),
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
        clips: [testClip('clip_3', 'charlie.mp4')],
      })
    );
    expect(controller.getSelectedClipIds()).toEqual(['clip_3']);
    expect(controller.getSelectedClipId()).toBe('clip_3');
  });

  test('emits context-menu requests without changing the current selection', () => {
    const contextMenuRequests = [];
    const controller = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      recomputeLayout: vi.fn(),
    });
    controller.on('contextMenuRequested', (payload) => contextMenuRequests.push(payload));

    controller.renderCollection(
      new ClipSequence({
        name: 'demo',
        clips: [
          testClip('clip_1', 'alpha.mp4'),
          testClip('clip_2', 'bravo.webm'),
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

  function gridWithTwoClips() {
    const contextMenuRequests = [];
    const controller = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      recomputeLayout: vi.fn(),
    });
    controller.on('contextMenuRequested', (payload) => contextMenuRequests.push(payload));
    controller.renderCollection(new ClipSequence({
      name: 'demo',
      clips: [testClip('clip_1', 'alpha.mp4'), testClip('clip_2', 'bravo.webm')],
    }));
    const cards = document.querySelectorAll('#grid .thumb');
    const rightClick = (card) => card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
    return { controller, contextMenuRequests, cards, rightClick };
  }

  test('right-clicking a clip outside the selection makes it the only selected clip before the menu request', () => {
    const { controller, contextMenuRequests, cards, rightClick } = gridWithTwoClips();
    cards[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));

    rightClick(cards[1]);

    expect(controller.getSelectedClipIds()).toEqual(['clip_2']);
    expect(contextMenuRequests[0]).toMatchObject({ clipId: 'clip_2', selectedClipIds: ['clip_2'], fromKeyboard: false });
  });

  test('right-clicking a clip inside a multi-selection keeps the selection', () => {
    const { controller, cards, rightClick } = gridWithTwoClips();
    cards[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    cards[1].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));

    rightClick(cards[1]);

    expect(controller.getSelectedClipIds()).toEqual(['clip_1', 'clip_2']);
  });

  // Five cards laid out in two columns: rows [alpha, bravo], [charlie, delta], [echo].
  function keyboardGrid() {
    const requests = { orders: [], menus: [] };
    const controller = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      layoutRules: { computeBestGrid: () => ({ cols: 2, cellH: 100 }) },
    });
    controller.on('orderChanged', (ids) => requests.orders.push(ids));
    controller.on('contextMenuRequested', (payload) => requests.menus.push(payload));
    controller.renderCollection(new ClipSequence({
      name: 'demo',
      clips: ['alpha', 'bravo', 'charlie', 'delta', 'echo'].map((name, index) => testClip(`clip_${index + 1}`, `${name}.mp4`)),
    }));
    const card = (name) => document.querySelector(`#grid .thumb[data-name="${name}.mp4"]`);
    const focusedName = () => document.activeElement?.dataset.name?.replace('.mp4', '');
    const press = (key, modifiers = {}) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers });
      Object.defineProperty(event, 'target', { value: document.activeElement });
      controller.handleCardKey(event);
      return event;
    };
    return { controller, requests, card, focusedName, press };
  }

  test('arrow keys move focus to the neighbouring card and one row up or down', () => {
    const { card, focusedName, press } = keyboardGrid();
    card('alpha').focus();

    press('ArrowRight');
    expect(focusedName()).toBe('bravo');
    press('ArrowDown');
    expect(focusedName()).toBe('delta');
    press('ArrowDown');
    expect(focusedName()).toBe('echo');
    press('ArrowUp');
    expect(focusedName()).toBe('charlie');
    press('ArrowLeft');
    expect(focusedName()).toBe('bravo');
  });

  test('an arrow key at the edge of the grid keeps focus and does not scroll', () => {
    const { card, focusedName, press } = keyboardGrid();
    card('alpha').focus();

    const event = press('ArrowUp');

    expect(focusedName()).toBe('alpha');
    expect(event.defaultPrevented).toBe(true);
  });

  test('an arrow key selects only the card it moves to', () => {
    const { controller, card, press } = keyboardGrid();
    card('alpha').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    card('alpha').focus();

    press('ArrowDown');

    expect(controller.getSelectedClipIds()).toEqual(['clip_3']);
  });

  test('an arrow key at the edge of the grid keeps the selection', () => {
    const { controller, card, press } = keyboardGrid();
    card('alpha').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    card('alpha').focus();

    press('ArrowLeft');

    expect(controller.getSelectedClipIds()).toEqual(['clip_1']);
  });

  test('Ctrl+arrow moves focus and leaves the selection as it was', () => {
    const { controller, card, focusedName, press } = keyboardGrid();
    card('alpha').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    card('alpha').focus();

    press('ArrowRight', { ctrlKey: true });

    expect(focusedName()).toBe('bravo');
    expect(controller.getSelectedClipIds()).toEqual(['clip_1']);
  });

  test('Shift+arrow selects the clips from the one selected on its own to the focused one', () => {
    const { controller, card, focusedName, press } = keyboardGrid();
    card('bravo').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    card('bravo').focus();

    press('ArrowDown', { shiftKey: true });
    expect(controller.getSelectedClipIds()).toEqual(['clip_2', 'clip_3', 'clip_4']);
    press('ArrowLeft', { shiftKey: true });
    expect(controller.getSelectedClipIds()).toEqual(['clip_2', 'clip_3']);
    press('ArrowUp', { shiftKey: true });
    expect(focusedName()).toBe('alpha');
    expect(controller.getSelectedClipIds()).toEqual(['clip_1', 'clip_2']);
  });

  test('Shift+arrow extends from the clicked clip after Ctrl+arrow moved the focus away', () => {
    const { controller, card, press } = keyboardGrid();
    card('alpha').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    card('alpha').focus();
    press('ArrowRight', { ctrlKey: true });

    press('ArrowRight', { shiftKey: true });

    expect(controller.getSelectedClipIds()).toEqual(['clip_1', 'clip_2', 'clip_3']);
  });

  test('Shift+arrow with nothing selected selects from the card the key moved from', () => {
    const { controller, card, press } = keyboardGrid();
    card('charlie').focus();

    press('ArrowRight', { shiftKey: true });

    expect(controller.getSelectedClipIds()).toEqual(['clip_3', 'clip_4']);
  });

  test('only the focused card is a Tab stop, so Tab enters and leaves the grid once', () => {
    const { card, press } = keyboardGrid();
    const tabStops = () => [...document.querySelectorAll('#grid .thumb')].filter(el => el.tabIndex === 0).map(el => el.dataset.name);
    card('charlie').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(tabStops()).toEqual(['charlie.mp4']);

    card('charlie').focus();
    press('ArrowRight', { ctrlKey: true });

    expect(tabStops()).toEqual(['delta.mp4']);
  });

  test('Space selects only the focused card and Ctrl+Space adds or removes it', () => {
    const { controller, card, press } = keyboardGrid();
    card('alpha').focus();

    press(' ');
    press('ArrowRight', { ctrlKey: true });
    press(' ', { ctrlKey: true });
    expect(controller.getSelectedClipIds()).toEqual(['clip_1', 'clip_2']);
    press(' ', { ctrlKey: true });
    expect(controller.getSelectedClipIds()).toEqual(['clip_1']);
    press(' ');
    expect(controller.getSelectedClipIds()).toEqual(['clip_2']);
  });

  describe('renaming', () => {
    function renamingGrid({ listening = true } = {}) {
      const context = keyboardGrid();
      const renames = [];
      if (listening) context.controller.on('renameRequested', (request) => renames.push(request));
      const field = () => context.card('bravo').querySelector('input');
      const pressInField = (key) => field().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      return { ...context, renames, field, pressInField };
    }

    test('F2 on a focused card edits its name, and Enter asks to rename it keeping the extension', () => {
      const { card, press, field, pressInField, renames } = renamingGrid();
      card('bravo').focus();

      press('F2');
      field().value = 'sunset';
      pressInField('Enter');

      expect(renames).toEqual([{ clipId: 'clip_2', newFilename: 'sunset.mp4' }]);
    });

    test('F2 edits nothing when nothing renames clips', () => {
      const { card, press, field } = renamingGrid({ listening: false });
      card('bravo').focus();

      press('F2');

      expect(field()).toBeNull();
    });

    test('shows why a name was refused in the card being renamed', () => {
      const { controller, field, card } = renamingGrid();
      controller.beginRename('clip_2');

      controller.showRenameProblem('clip_2', 'name-taken');

      expect(card('bravo').querySelector('[role="alert"]').textContent).toBe('Another file in this folder already has this name.');
      expect(document.activeElement).toBe(field());
    });

    test('ending the rename removes the field and gives the focus back to the card', () => {
      const { controller, field, focusedName } = renamingGrid();
      controller.beginRename('clip_2');

      controller.endRename('clip_2');

      expect(field()).toBeNull();
      expect(focusedName()).toBe('bravo');
    });

    test('Escape in the field cancels the rename', () => {
      const { controller, field, pressInField, renames } = renamingGrid();
      controller.beginRename('clip_2');

      field().value = 'sunset';
      pressInField('Escape');

      expect(field()).toBeNull();
      expect(renames).toEqual([]);
    });  });

  test('Alt+Arrow moves the focused clip one place or one row and reports the new order', () => {
    const { card, focusedName, press, requests } = keyboardGrid();
    card('alpha').focus();

    press('ArrowRight', { altKey: true });
    press('ArrowDown', { altKey: true });

    expect(requests.orders).toEqual([
      ['clip_2', 'clip_1', 'clip_3', 'clip_4', 'clip_5'],
      ['clip_2', 'clip_3', 'clip_4', 'clip_1', 'clip_5'],
    ]);
    expect(focusedName()).toBe('alpha');
  });

  test.each([
    ['Shift+F10', 'F10', { shiftKey: true }],
    ['the Menu key', 'ContextMenu', {}],
  ])('%s requests the clip menu at the focused card and selects that card', (_name, key, modifiers) => {
    const { controller, card, press, requests } = keyboardGrid();
    card('alpha').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    vi.spyOn(card('delta'), 'getBoundingClientRect').mockReturnValue({ left: 200, top: 100, width: 300, height: 160 });
    card('delta').focus();

    press(key, modifiers);

    expect(controller.getSelectedClipIds()).toEqual(['clip_4']);
    expect(requests.menus).toEqual([{
      point: expect.anything(),
      selectedClipId: 'clip_4',
      selectedClipIds: ['clip_4'],
      clipId: 'clip_4',
      fromKeyboard: true,
    }]);
    const { x, y } = requests.menus[0].point;
    expect({ insideCardHorizontally: x > 200 && x < 500, insideCardVertically: y > 100 && y < 260 })
      .toEqual({ insideCardHorizontally: true, insideCardVertically: true });
  });

  test('the browser contextmenu event that follows the Menu key opens no second menu', () => {
    const { card, requests } = keyboardGrid();
    card('alpha').focus();

    card('alpha').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: -1 }));

    expect(requests.menus).toEqual([]);
  });

  test('injects default styles only once per document', () => {
    createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      recomputeLayout: vi.fn(),
    });

    const otherRoot = document.createElement('div');
    otherRoot.id = 'gridWrapTwo';
    const otherGrid = document.createElement('div');
    otherGrid.id = 'gridTwo';
    otherRoot.appendChild(otherGrid);
    document.body.appendChild(otherRoot);

    createClipCollectionGridControl({
      grid: otherGrid,
      gridRoot: otherRoot,
      recomputeLayout: vi.fn(),
    });

    expect(document.querySelectorAll('#clipCollectionGridStyles')).toHaveLength(1);
  });
});




test('focuses selected cards through the grid API without relying on selection CSS', () => {
  const root = document.createElement('div');
  const grid = document.createElement('div');
  root.append(grid); document.body.append(root);
  const controller = createClipCollectionGridControl({ grid, gridRoot: root });
  controller.renderCollection(new ClipSequence({ name: 'demo', clips: [testClip('other-clip', 'alpha.mp4'), testClip('selected-clip', 'bravo.mp4')] }));
  const card = grid.querySelector('[data-clip-id="selected-clip"]');
  expect(controller.focusSelectedClip()).toBe(false);
  controller.setSelectedClipId('selected-clip');
  card.classList.remove('selected');
  expect(controller.focusSelectedClip()).toBe(true);
  expect(document.activeElement).toBe(card);
  controller.dispose(); root.remove();
});

test('measures allocated grid height using its own current padding', () => {
  const root = document.createElement('div');
  const grid = document.createElement('div');
  root.append(grid); document.body.append(root);
  Object.defineProperty(root, 'clientHeight', { value: 480 });
  root.style.padding = '10px 14px 22px';
  const computeBestGrid = vi.fn(() => ({ cols: 1, cellH: 100 }));
  const controller = createClipCollectionGridControl({
    grid,
    gridRoot: root,
    coordinateWorkspaceLayout: true,
    layoutRules: { computeBestGrid },
  });
  controller.renderCollection(new ClipSequence({ clips: [new Clip({ id: 'a', source: clipSource('a.mp4', { mediaSource: 'file:///a.mp4' }) })] }));
  expect(computeBestGrid).toHaveBeenLastCalledWith(expect.objectContaining({ availH: 448 }));
  root.style.paddingBottom = '30px';
  controller.beginWorkspaceResize(800, 0);
  expect(computeBestGrid).toHaveBeenLastCalledWith(expect.objectContaining({ availH: 440 }));
  controller.dispose(); root.remove();
});
