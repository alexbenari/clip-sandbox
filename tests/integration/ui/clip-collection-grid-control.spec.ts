// @ts-nocheck
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import { Clip } from '../../../src/domain/clip.js';
import { ClipSequence } from '../../../src/domain/clip-sequence.js';
import { SourceMovie } from '../../../src/domain/source-movie.js';
import { ClipCollectionGridControl } from '../../../src/ui/clip-collection-grid-control.js';
import { testClip, clipSource } from '../../support/clip-source-fixtures.js';

const createClipCollectionGridControl = options => new ClipCollectionGridControl(options);

describe('clip collection grid control', () => {
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
    const control = createClipCollectionGridControl({
      grid,
      gridRoot: root,
      coordinateWorkspaceLayout: true,
      getAvailableHeight: () => 400,
      layoutRules: { computeBestGrid },
    });
    control.renderCollection(makeCollection());
    const videos = [...grid.querySelectorAll('video')];
    control.beginWorkspaceResize(828, 240);
    expect(grid.dataset.layoutCols).toBe('2');
    expect(grid.children[1].style.top).toBe('0px');
    expect(grid.children[1].style.left).toBe('400px');
    expect([...grid.querySelectorAll('video')]).toEqual(videos);
    Object.defineProperty(root, 'clientWidth', { configurable: true, value: 828 });
    const target = grid.children[1].style.cssText;
    control.endWorkspaceResize();
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
    const control = createClipCollectionGridControl({
      grid, isFullscreen: () => true,
      layoutRules: { computeFullscreenLayout: () => ({ cols: 2, cellH: 100, targetVisible: 2 }) },
    });
    control.on('openClipRequested', opened);
    control.renderCollection(collection);
    const cards = [...grid.children];
    const sources = cards.map(card => card.querySelector('video').src);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    control.rotateVisibleClip();
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
    control.rotateVisibleClip();
    control.fsRestore();
    cards.forEach(card => card.querySelector('video').dispatchEvent(new Event('ended')));
    expect(cards.every(card => card.style.display === '' && card.style.order === '')).toBe(true);
    expect(cards.every(card => card.querySelector('video').loop)).toBe(true);
    control.dispose();
  });

  function fullScreenWithHiddenCard() {
    const grid = document.getElementById('grid');
    const control = createClipCollectionGridControl({
      grid, isFullscreen: () => true,
      layoutRules: { computeFullscreenLayout: () => ({ cols: 2, cellH: 100, targetVisible: 2 }) },
    });
    control.renderCollection(makeThreeClipCollection());
    control.fsApplySlots(2);
    const hiddenVideo = [...grid.children].find(card => card.style.display === 'none').querySelector('video');
    return { control, hiddenVideo };
  }

  test('full screen pauses the clips it hides', () => {
    const { control, hiddenVideo } = fullScreenWithHiddenCard();

    expect(new Set(HTMLMediaElement.prototype.pause.mock.instances)).toEqual(new Set([hiddenVideo]));
    control.dispose();
  });

  test('restoring the grid after full screen plays the clips full screen hid', () => {
    const { control, hiddenVideo } = fullScreenWithHiddenCard();
    HTMLMediaElement.prototype.play.mockClear();

    control.fsRestore();

    expect(HTMLMediaElement.prototype.play.mock.instances).toEqual([hiddenVideo]);
    control.dispose();
  });

  test('full screen starts no clip it hides when that clip becomes ready', () => {
    const { control, hiddenVideo } = fullScreenWithHiddenCard();
    HTMLMediaElement.prototype.play.mockClear();

    hiddenVideo.dispatchEvent(new Event('canplay'));

    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    control.dispose();
  });

  test('view replacement, restart and disposal cancel pending fullscreen rotation', () => {
    const grid = document.getElementById('grid');
    const control = createClipCollectionGridControl({
      grid, isFullscreen: () => true,
      layoutRules: { computeFullscreenLayout: () => ({ cols: 2, cellH: 100, targetVisible: 2 }) },
    });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    control.renderCollection(makeThreeClipCollection(), { cacheKey: 'first' });
    const oldVideo = grid.children[1].querySelector('video');
    control.rotateVisibleClip();
    control.renderCollection(makeThreeClipCollection(), { cacheKey: 'second' });
    const active = document.getElementById('grid');
    const before = [...active.children].map(card => card.style.display);
    oldVideo.dispatchEvent(new Event('ended'));
    expect([...active.children].map(card => card.style.display)).toEqual(before);
    expect(oldVideo.loop).toBe(true);
    const currentVideo = active.children[1].querySelector('video');
    control.rotateVisibleClip();
    control.cancelRotation();
    control.rotateVisibleClip();
    currentVideo.dispatchEvent(new Event('ended'));
    expect(active.children[0].style.display).toBe('');
    expect(active.children[1].style.display).toBe('none');
    control.rotateVisibleClip();
    const finalVideo = active.children[0].querySelector('video');
    control.dispose();
    finalVideo.dispatchEvent(new Event('ended'));
    expect(active.children).toHaveLength(0);
    expect(finalVideo.loop).toBe(true);
  });

  test('tracks single and modifier-based multi-selection by clip id', () => {
    const selectionChanges = [];
    const control = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      recomputeLayout: vi.fn(),
    });
    control.on('selectionChanged', ({ selectedClipId, selectedClipIds }) => selectionChanges.push({ clipId: selectedClipId, clipIds: selectedClipIds }));

    control.renderCollection(makeCollection());
    const cards = document.querySelectorAll('#grid .thumb');
    expect(cards).toHaveLength(2);
    expect([...document.querySelectorAll('#grid video')].every(video => video.muted)).toBe(true);
    cards[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(control.getSelectedClipId()).toBe('clip_1');
    expect(control.getSelectedClipIds()).toEqual(['clip_1']);
    expect(selectionChanges.at(-1)).toEqual({ clipId: 'clip_1', clipIds: ['clip_1'] });
    expect(cards[0].classList.contains('selected')).toBe(true);

    cards[1].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    expect(control.getSelectedClipId()).toBeNull();
    expect(control.getSelectedClipIds()).toEqual(['clip_1', 'clip_2']);
    expect(cards[1].classList.contains('selected')).toBe(true);

    cards[0].dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true }));
    expect(control.getSelectedClipId()).toBe('clip_2');
    expect(control.getSelectedClipIds()).toEqual(['clip_2']);

    cards[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(control.getSelectedClipId()).toBe('clip_1');
    expect(control.getSelectedClipIds()).toEqual(['clip_1']);
  });

  test('reorders a collection view without pulling cards from a cached view of the same clips', () => {
    const orders = [];
    const control = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      recomputeLayout: vi.fn(),
    });
    control.on('orderChanged', (ids) => orders.push(ids));
    const pipeline = makeThreeClipCollection();
    const [alpha, bravo, charlie] = pipeline.orderedClips();
    control.renderCollection(pipeline, { cacheKey: 'pipeline' });
    const pipelineGrid = document.getElementById('grid');
    control.renderCollection(new ClipSequence({ name: 'subset', clips: [charlie, alpha] }), { cacheKey: 'subset.txt' });
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
    expect(control.getCardCount()).toBe(2);
  });

  test('emits full order after drag-drop reorder and provides clip media source', () => {
    const orders = [];
    const openRequests = [];
    const control = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      recomputeLayout: vi.fn(),
    });
    control.on('orderChanged', (ids) => orders.push(ids));
    control.on('openClipRequested', (clipId) => openRequests.push(clipId));

    control.renderCollection(makeCollection());
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
    expect(control.getClipMediaSource('clip_2')).toBe('file:///clips/bravo.webm');
    expect(control.getClipById('clip_2')?.name).toBe('bravo.webm');
    expect(control.getPrevClip('clip_2')).toBeNull();
    expect(control.getNextClip('clip_2')?.id).toBe('clip_1');
    expect(control.getPrevClip('clip_1')?.id).toBe('clip_2');
    expect(control.getNextClip('clip_1')).toBeNull();
    expect(control.getSelectedClipIds()).toEqual(['clip_2']);
  });

  test('renders safe filename labels and updates duration text', () => {
    const control = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name, seconds) => `${name} (${seconds ?? '--:--:--'})`,
      recomputeLayout: vi.fn(),
    });

    control.renderCollection(
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
    const control = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      recomputeLayout: vi.fn(),
    });

    control.renderCollection(makeCollection());

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

  test('pauses the previews of a view it leaves', () => {
    const control = createClipCollectionGridControl({
      grid: document.getElementById('grid'), gridRoot: document.getElementById('gridWrap'), formatLabel: (name) => name,
    });
    const pipeline = makeThreeClipCollection();
    control.renderCollection(pipeline, { cacheKey: 'pipeline' });
    const pipelineVideos = Array.from(document.querySelectorAll('#grid video'));
    for (const video of pipelineVideos) Object.defineProperty(video, 'paused', { value: false, configurable: true });

    control.renderCollection(new ClipSequence({ name: 'subset', clips: [pipeline.orderedClips()[0]] }), { cacheKey: 'collection:subset.txt' });

    expect(new Set(HTMLMediaElement.prototype.pause.mock.instances)).toEqual(new Set(pipelineVideos));
    control.dispose();
  });

  test('starts no preview of a view it left when that preview becomes ready', () => {
    const control = createClipCollectionGridControl({
      grid: document.getElementById('grid'), gridRoot: document.getElementById('gridWrap'), formatLabel: (name) => name,
    });
    const pipeline = makeThreeClipCollection();
    control.renderCollection(pipeline, { cacheKey: 'pipeline' });
    const pipelineVideo = document.querySelector('#grid video');
    control.renderCollection(new ClipSequence({ name: 'subset', clips: [pipeline.orderedClips()[0]] }), { cacheKey: 'collection:subset.txt' });

    pipelineVideo.dispatchEvent(new Event('canplay'));

    expect(HTMLMediaElement.prototype.play.mock.instances).not.toContain(pipelineVideo);
    control.dispose();
  });

  describe('holding previews', () => {
    function gridWithReadyVideos({ playing = false } = {}) {
      const control = createClipCollectionGridControl({
        grid: document.getElementById('grid'), gridRoot: document.getElementById('gridWrap'), formatLabel: (name) => name,
      });
      control.renderCollection(makeThreeClipCollection(), { cacheKey: 'pipeline' });
      const videos = Array.from(document.querySelectorAll('#grid video'));
      for (const video of videos) {
        Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
        Object.defineProperty(video, 'paused', { value: !playing, configurable: true });
      }
      return { control, videos };
    }

    test('pauses every playing preview', () => {
      const { control, videos } = gridWithReadyVideos({ playing: true });

      control.holdPreviews();

      expect(new Set(HTMLMediaElement.prototype.pause.mock.instances)).toEqual(new Set(videos));
      control.dispose();
    });

    test('starts no preview that becomes ready while held', () => {
      const { control, videos } = gridWithReadyVideos();
      control.holdPreviews();

      videos[0].dispatchEvent(new Event('canplay'));

      expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
      control.dispose();
    });

    test('plays the previews again once every hold is released', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
      try {
        const { control, videos } = gridWithReadyVideos();
        const releaseZoom = control.holdPreviews();
        const releaseScreen = control.holdPreviews();

        releaseZoom();
        await vi.runAllTimersAsync();
        expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
        releaseScreen();
        await vi.runAllTimersAsync();

        expect(new Set(HTMLMediaElement.prototype.play.mock.instances)).toEqual(new Set(videos));
        control.dispose();
      } finally {
        vi.useRealTimers();
      }
    });

    test('a release called twice does not release another hold', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
      try {
        const { control } = gridWithReadyVideos();
        const release = control.holdPreviews();
        control.holdPreviews();

        release();
        release();
        await vi.runAllTimersAsync();

        expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
        control.dispose();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  test('reuses cached card videos and resumes their playback after switching back to an unchanged view', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    try {
      const control = createClipCollectionGridControl({
        grid: document.getElementById('grid'),
        gridRoot: document.getElementById('gridWrap'),
        formatLabel: (name) => name,
        recomputeLayout: vi.fn(),
      });
      const pipeline = makeThreeClipCollection();
      const collection = new ClipSequence({ name: 'subset', clips: [pipeline.orderedClips()[0]] });
      control.renderCollection(pipeline, { cacheKey: 'pipeline' });
      const pipelineGrid = document.getElementById('grid');
      const pipelineVideos = Array.from(pipelineGrid.querySelectorAll('video'));
      for (const video of pipelineVideos) Object.defineProperty(video, 'readyState', { value: 2, configurable: true });

      control.renderCollection(collection, { cacheKey: 'collection:subset.txt' });
      const collectionGrid = document.getElementById('grid');
      expect(collectionGrid).not.toBe(pipelineGrid);
      expect(pipelineGrid.inert).toBe(true);
      expect(pipelineGrid.getAttribute('aria-hidden')).toBe('true');
      expect(document.querySelectorAll('#grid .thumb')).toHaveLength(1);

      HTMLMediaElement.prototype.play.mockClear();
      for (const video of pipelineVideos) Object.defineProperty(video, 'paused', { value: true, configurable: true });
      control.renderCollection(pipeline, { cacheKey: 'pipeline' });

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
      control.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  test('invalidates cached card videos when a view sequence changes', () => {
    const control = createClipCollectionGridControl({
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

    control.renderCollection(pipeline, { cacheKey: 'pipeline' });
    const firstPipelineVideo = document.querySelector('#grid video');
    control.renderCollection(collection, { cacheKey: 'collection:subset.txt' });
    control.invalidateView('pipeline');
    control.renderCollection(new ClipSequence({
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
    const control = createClipCollectionGridControl({
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
    control.renderCollection(pipeline, { cacheKey: 'pipeline' });
    const pipelineCards = [...document.querySelectorAll('#grid .thumb')];
    control.renderCollection(collection, { cacheKey: 'collection:subset.txt' });
    const cardStyleWrites = new MutationObserver(() => undefined);
    for (const card of pipelineCards) cardStyleWrites.observe(card, { attributes: true, attributeFilter: ['style'] });

    control.renderCollection(pipeline, { cacheKey: 'pipeline' });

    expect(cardStyleWrites.takeRecords()).toEqual([]);
    expect(document.querySelector('#grid').style.gridTemplateColumns).toBe('repeat(3, 1fr)');
    cardStyleWrites.disconnect();
  });

  test('owns title visibility on the grid surface', () => {
    const control = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      recomputeLayout: vi.fn(),
    });

    expect(control.areTitlesHidden()).toBe(false);
    expect(document.getElementById('clipCollectionGridStyles')).not.toBeNull();
    expect(document.getElementById('gridWrap').classList.contains('clip-collection-grid-root')).toBe(true);
    expect(document.getElementById('grid').classList.contains('clip-collection-grid')).toBe(true);
    control.setTitlesHidden(true);
    expect(control.areTitlesHidden()).toBe(true);
    expect(document.getElementById('gridWrap').classList.contains('titles-hidden')).toBe(true);
  });

  describe('source movie glyph', () => {
    function gridWithClips() {
      const control = createClipCollectionGridControl({
        grid: document.getElementById('grid'),
        gridRoot: document.getElementById('gridWrap'),
      });
      const sequence = makeThreeClipCollection();
      const [alpha, bravo] = sequence.orderedClips();
      return { control, sequence, alpha, bravo };
    }

    const cardOf = clip => document.querySelector(`#grid .thumb[data-clip-id="${clip.id}"]`);
    const sampleFeature = () => SourceMovie.fromFileName('Sample Feature.2001.mkv');

    test('marks a clip that came from a movie with a glyph naming that movie', () => {
      const { control, sequence, alpha } = gridWithClips();
      alpha.recordSourceMovie(sampleFeature());

      control.renderCollection(sequence);

      expect(cardOf(alpha).querySelector('.source-glyph')?.title).toBe('From Sample Feature.2001');
      expect(cardOf(alpha).getAttribute('aria-description')).toBe('From Sample Feature.2001');
    });

    test('shows no glyph on a clip without a source movie', () => {
      const { control, sequence, bravo } = gridWithClips();

      control.renderCollection(sequence);

      expect(cardOf(bravo).querySelector('.source-glyph')).toBeNull();
      expect(cardOf(bravo).hasAttribute('aria-description')).toBe(false);
    });

    test('hides glyphs with the titles while keeping the card description', () => {
      const { control, sequence, alpha } = gridWithClips();
      alpha.recordSourceMovie(sampleFeature());
      control.renderCollection(sequence);

      control.setTitlesHidden(true);

      expect(getComputedStyle(cardOf(alpha).querySelector('.source-glyph')).display).toBe('none');
      expect(cardOf(alpha).getAttribute('aria-description')).toBe('From Sample Feature.2001');
    });

    test('shows a glyph learned while its view was cached once that view is shown again', () => {
      const { control, sequence, alpha } = gridWithClips();
      control.renderCollection(sequence, { cacheKey: 'pipeline' });
      control.renderCollection(new ClipSequence({ name: 'subset', clips: [sequence.orderedClips()[2]] }), { cacheKey: 'collection:subset.txt' });
      alpha.recordSourceMovie(sampleFeature());

      control.refreshSourceMovieGlyphs();
      control.renderCollection(sequence, { cacheKey: 'pipeline' });

      expect(cardOf(alpha).querySelector('.source-glyph')?.title).toBe('From Sample Feature.2001');
    });

    test('removes the glyph when the clip no longer has a source movie', () => {
      const { control, sequence, alpha } = gridWithClips();
      alpha.recordSourceMovie(sampleFeature());
      control.renderCollection(sequence);

      alpha.recordSourceMovie(null);
      control.refreshSourceMovieGlyphs();

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
      const control = createClipCollectionGridControl({
        grid: document.getElementById('grid'),
        gridRoot,
        coordinateWorkspaceLayout: true,
        getAvailableHeight: () => 400,
        layoutRules: { computeBestGrid },
        observeRootResize: true,
      });
      control.renderCollection(makeCollection());
      const [observer] = observers;
      expect(observer.element).toBe(gridRoot);

      computeBestGrid.mockClear();
      observer.callback();
      expect(computeBestGrid).toHaveBeenCalled();

      control.beginWorkspaceResize(800, 240);
      computeBestGrid.mockClear();
      observer.callback();
      expect(computeBestGrid).not.toHaveBeenCalled();

      control.endWorkspaceResize();
      control.clear();
      control.renderCollection(makeCollection());
      computeBestGrid.mockClear();
      observer.callback();
      expect(observer.disconnected).toBeUndefined();
      expect(computeBestGrid).toHaveBeenCalled();

      control.dispose();
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
    const control = createClipCollectionGridControl({
      grid,
      gridRoot,
      formatLabel: (name) => name,
      layoutRules: {
        computeBestGrid: vi.fn(() => ({ cols: 2, cellH: 180 })),
        computeFullscreenLayout: vi.fn(() => ({ cols: 2, cellH: 220, targetVisible: 2 })),
      },
      isFullscreen: () => fullscreen,
    });

    control.renderCollection(makeThreeClipCollection());
    expect(document.querySelector('#grid').style.gridTemplateColumns).toBe('repeat(2, 1fr)');
    expect(document.querySelector('#grid .thumb').style.height).toBe('180px');

    fullscreen = true;
    control.recomputeLayout();
    expect(document.querySelector('#grid').style.gridTemplateColumns).toBe('repeat(2, 1fr)');
    expect(document.querySelector('#grid .thumb').style.height).toBe('220px');

    const cards = Array.from(document.querySelectorAll('#grid .thumb'));
    expect(cards.filter((card) => card.style.display === 'none')).toHaveLength(1);

    control.fsRestore();
    expect(cards.every((card) => card.style.display === '')).toBe(true);
  });

  test('stores card video metadata on clips and relayouts once when columns change', async () => {
    const grid = document.getElementById('grid');
    const gridRoot = document.getElementById('gridWrap');
    Object.defineProperty(gridRoot, 'clientWidth', { value: 900, configurable: true });
    const computeBestGrid = vi.fn()
      .mockReturnValueOnce({ cols: 1, cellH: 100 })
      .mockReturnValueOnce({ cols: 2, cellH: 180 });
    const control = createClipCollectionGridControl({
      grid,
      gridRoot,
      formatLabel: (name) => name,
      layoutRules: { computeBestGrid },
    });
    const collection = makeCollection();

    control.renderCollection(collection);
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
    const control = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      layoutRules: {
        computeBestGrid: vi.fn()
          .mockReturnValueOnce({ cols: 2, cellH: 100 })
          .mockReturnValueOnce({ cols: 2, cellH: 180 }),
      },
    });

    control.renderCollection(makeCollection());
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
    const control = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      layoutRules: {
        computeBestGrid: vi.fn()
          .mockReturnValueOnce({ cols: 1, cellH: 100 })
          .mockReturnValueOnce({ cols: 2, cellH: 180 }),
      },
    });

    control.renderCollection(makeCollection());
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
    const control = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      layoutRules: {
        computeBestGrid: vi.fn()
          .mockReturnValueOnce({ cols: 1, cellH: 100 })
          .mockReturnValueOnce({ cols: 2, cellH: 180 }),
      },
    });
    control.on('metadataFailed', (failure) => metadataFailures.push(failure));

    control.renderCollection(makeCollection());
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
    expect(control.getClipById('clip_2').metadataFailed).toBe(true);
    expect(document.querySelector('#grid').style.gridTemplateColumns).toBe('repeat(2, 1fr)');
    expect(document.querySelector('#grid .thumb').style.height).toBe('180px');
  });

  test('clears drag-over state when rerendering or disposing', () => {
    const control = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      recomputeLayout: vi.fn(),
    });

    control.renderCollection(makeCollection());
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

    control.renderCollection(makeCollection());
    control.setTitlesHidden(true);
    control.dispose();
    expect(document.getElementById('grid').children).toHaveLength(0);
    expect(document.getElementById('gridWrap').classList.contains('titles-hidden')).toBe(false);
  });

  test('drops invalid selections on rerender and emits ordered selected ids for removal', () => {
    const removalRequests = [];
    const control = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      recomputeLayout: vi.fn(),
    });
    control.on('removeSelectedRequested', (clipIds) => removalRequests.push(clipIds));

    control.renderCollection(
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
    expect(control.getSelectedClipIds()).toEqual(['clip_1', 'clip_3']);

    const handled = control.handleKeyDown(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(handled).toBe(true);
    expect(removalRequests).toEqual([['clip_1', 'clip_3']]);

    const input = document.createElement('input');
    document.body.appendChild(input);
    const inputDelete = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true });
    Object.defineProperty(inputDelete, 'target', { value: input });
    expect(control.handleKeyDown(inputDelete)).toBe(false);

    control.renderCollection(
      new ClipSequence({
        name: 'subset',
        clips: [testClip('clip_3', 'charlie.mp4')],
      })
    );
    expect(control.getSelectedClipIds()).toEqual(['clip_3']);
    expect(control.getSelectedClipId()).toBe('clip_3');
  });

  test('emits context-menu requests without changing the current selection', () => {
    const contextMenuRequests = [];
    const control = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      recomputeLayout: vi.fn(),
    });
    control.on('contextMenuRequested', (payload) => contextMenuRequests.push(payload));

    control.renderCollection(
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
    expect(control.getSelectedClipIds()).toEqual(['clip_1', 'clip_2']);

    document.getElementById('gridWrap').dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      clientX: 180,
      clientY: 220,
    }));

    expect(contextMenuRequests).toHaveLength(1);
    expect(contextMenuRequests[0].selectedClipIds).toEqual(['clip_1', 'clip_2']);
    expect(contextMenuRequests[0].clipId).toBeNull();
    expect(control.getSelectedClipIds()).toEqual(['clip_1', 'clip_2']);
  });

  function gridWithTwoClips() {
    const contextMenuRequests = [];
    const control = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      recomputeLayout: vi.fn(),
    });
    control.on('contextMenuRequested', (payload) => contextMenuRequests.push(payload));
    control.renderCollection(new ClipSequence({
      name: 'demo',
      clips: [testClip('clip_1', 'alpha.mp4'), testClip('clip_2', 'bravo.webm')],
    }));
    const cards = document.querySelectorAll('#grid .thumb');
    const rightClick = (card) => card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
    return { control, contextMenuRequests, cards, rightClick };
  }

  test('right-clicking a clip outside the selection makes it the only selected clip before the menu request', () => {
    const { control, contextMenuRequests, cards, rightClick } = gridWithTwoClips();
    cards[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));

    rightClick(cards[1]);

    expect(control.getSelectedClipIds()).toEqual(['clip_2']);
    expect(contextMenuRequests[0]).toMatchObject({ clipId: 'clip_2', selectedClipIds: ['clip_2'], fromKeyboard: false });
  });

  test('right-clicking a clip inside a multi-selection keeps the selection', () => {
    const { control, cards, rightClick } = gridWithTwoClips();
    cards[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    cards[1].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));

    rightClick(cards[1]);

    expect(control.getSelectedClipIds()).toEqual(['clip_1', 'clip_2']);
  });

  // Five cards laid out in two columns: rows [alpha, bravo], [charlie, delta], [echo].
  function keyboardGrid() {
    const requests = { orders: [], menus: [] };
    const control = createClipCollectionGridControl({
      grid: document.getElementById('grid'),
      gridRoot: document.getElementById('gridWrap'),
      formatLabel: (name) => name,
      layoutRules: { computeBestGrid: () => ({ cols: 2, cellH: 100 }) },
    });
    control.on('orderChanged', (ids) => requests.orders.push(ids));
    control.on('contextMenuRequested', (payload) => requests.menus.push(payload));
    control.renderCollection(new ClipSequence({
      name: 'demo',
      clips: ['alpha', 'bravo', 'charlie', 'delta', 'echo'].map((name, index) => testClip(`clip_${index + 1}`, `${name}.mp4`)),
    }));
    const card = (name) => document.querySelector(`#grid .thumb[data-name="${name}.mp4"]`);
    const focusedName = () => document.activeElement?.dataset.name?.replace('.mp4', '');
    const press = (key, modifiers = {}) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers });
      Object.defineProperty(event, 'target', { value: document.activeElement });
      control.handleCardKey(event);
      return event;
    };
    return { control, requests, card, focusedName, press };
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
    const { control, card, press } = keyboardGrid();
    card('alpha').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    card('alpha').focus();

    press('ArrowDown');

    expect(control.getSelectedClipIds()).toEqual(['clip_3']);
  });

  test('an arrow key at the edge of the grid keeps the selection', () => {
    const { control, card, press } = keyboardGrid();
    card('alpha').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    card('alpha').focus();

    press('ArrowLeft');

    expect(control.getSelectedClipIds()).toEqual(['clip_1']);
  });

  test('Ctrl+arrow moves focus and leaves the selection as it was', () => {
    const { control, card, focusedName, press } = keyboardGrid();
    card('alpha').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    card('alpha').focus();

    press('ArrowRight', { ctrlKey: true });

    expect(focusedName()).toBe('bravo');
    expect(control.getSelectedClipIds()).toEqual(['clip_1']);
  });

  test('Shift+arrow selects the clips from the one selected on its own to the focused one', () => {
    const { control, card, focusedName, press } = keyboardGrid();
    card('bravo').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    card('bravo').focus();

    press('ArrowDown', { shiftKey: true });
    expect(control.getSelectedClipIds()).toEqual(['clip_2', 'clip_3', 'clip_4']);
    press('ArrowLeft', { shiftKey: true });
    expect(control.getSelectedClipIds()).toEqual(['clip_2', 'clip_3']);
    press('ArrowUp', { shiftKey: true });
    expect(focusedName()).toBe('alpha');
    expect(control.getSelectedClipIds()).toEqual(['clip_1', 'clip_2']);
  });

  test('Shift+arrow extends from the clicked clip after Ctrl+arrow moved the focus away', () => {
    const { control, card, press } = keyboardGrid();
    card('alpha').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    card('alpha').focus();
    press('ArrowRight', { ctrlKey: true });

    press('ArrowRight', { shiftKey: true });

    expect(control.getSelectedClipIds()).toEqual(['clip_1', 'clip_2', 'clip_3']);
  });

  test('Shift+arrow with nothing selected selects from the card the key moved from', () => {
    const { control, card, press } = keyboardGrid();
    card('charlie').focus();

    press('ArrowRight', { shiftKey: true });

    expect(control.getSelectedClipIds()).toEqual(['clip_3', 'clip_4']);
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
    const { control, card, press } = keyboardGrid();
    card('alpha').focus();

    press(' ');
    press('ArrowRight', { ctrlKey: true });
    press(' ', { ctrlKey: true });
    expect(control.getSelectedClipIds()).toEqual(['clip_1', 'clip_2']);
    press(' ', { ctrlKey: true });
    expect(control.getSelectedClipIds()).toEqual(['clip_1']);
    press(' ');
    expect(control.getSelectedClipIds()).toEqual(['clip_2']);
  });

  describe('renaming', () => {
    function renamingGrid({ listening = true } = {}) {
      const context = keyboardGrid();
      const renames = [];
      if (listening) context.control.on('renameRequested', (request) => renames.push(request));
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
      const { control, field, card } = renamingGrid();
      control.beginRename('clip_2');

      control.showRenameProblem('clip_2', 'name-taken');

      expect(card('bravo').querySelector('[role="alert"]').textContent).toBe('Another file in this folder already has this name.');
      expect(document.activeElement).toBe(field());
    });

    test('ending the rename removes the field and gives the focus back to the card', () => {
      const { control, field, focusedName } = renamingGrid();
      control.beginRename('clip_2');

      control.endRename('clip_2');

      expect(field()).toBeNull();
      expect(focusedName()).toBe('bravo');
    });

    test('Escape in the field cancels the rename', () => {
      const { control, field, pressInField, renames } = renamingGrid();
      control.beginRename('clip_2');

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
    const { control, card, press, requests } = keyboardGrid();
    card('alpha').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    vi.spyOn(card('delta'), 'getBoundingClientRect').mockReturnValue({ left: 200, top: 100, width: 300, height: 160 });
    card('delta').focus();

    press(key, modifiers);

    expect(control.getSelectedClipIds()).toEqual(['clip_4']);
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
  const control = createClipCollectionGridControl({ grid, gridRoot: root });
  control.renderCollection(new ClipSequence({ name: 'demo', clips: [testClip('other-clip', 'alpha.mp4'), testClip('selected-clip', 'bravo.mp4')] }));
  const card = grid.querySelector('[data-clip-id="selected-clip"]');
  expect(control.focusSelectedClip()).toBe(false);
  control.setSelectedClipId('selected-clip');
  card.classList.remove('selected');
  expect(control.focusSelectedClip()).toBe(true);
  expect(document.activeElement).toBe(card);
  control.dispose(); root.remove();
});

test('measures allocated grid height using its own current padding', () => {
  const root = document.createElement('div');
  const grid = document.createElement('div');
  root.append(grid); document.body.append(root);
  Object.defineProperty(root, 'clientHeight', { value: 480 });
  root.style.padding = '10px 14px 22px';
  const computeBestGrid = vi.fn(() => ({ cols: 1, cellH: 100 }));
  const control = createClipCollectionGridControl({
    grid,
    gridRoot: root,
    coordinateWorkspaceLayout: true,
    layoutRules: { computeBestGrid },
  });
  control.renderCollection(new ClipSequence({ clips: [new Clip({ id: 'a', source: clipSource('a.mp4', { mediaSource: 'file:///a.mp4' }) })] }));
  expect(computeBestGrid).toHaveBeenLastCalledWith(expect.objectContaining({ availH: 448 }));
  root.style.paddingBottom = '30px';
  control.beginWorkspaceResize(800, 0);
  expect(computeBestGrid).toHaveBeenLastCalledWith(expect.objectContaining({ availH: 440 }));
  control.dispose(); root.remove();
});
