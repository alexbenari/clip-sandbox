// @vitest-environment node
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { checkValue, sourceMovie } from '../support/movie-window-fixtures.js';

const require = createRequire(import.meta.url);
const { ZoomEditSources } = require('../../electron/zoom-edit-sources.cjs');
const { SourceInfo } = require('../../electron/clip-provenance/source-info.cjs');
const { MovieWindowPlacement } = require('../../electron/movie-window-placement.cjs');

const folder = path.resolve('pipelines', 'picks');
const clipRequest = { folderPath: folder, filename: 'Feature-002.mp4' };
const event = { sender: { id: 7 } };

// Clip frames 3000-3050 (120.00 s to 122.00 s) with both ends as reference frames.
function storedTimesInfo() {
  return SourceInfo.forMovieRange(sourceMovie, { start: 3000, end: 3050, startTimeUs: 120_000_000, endTimeUs: 122_000_000 },
    [{ frameIndex: 3000, frameInfoHash: checkValue(3000) }, { frameIndex: 3050, frameInfoHash: checkValue(3050) }]);
}

function untimedInfo() {
  return SourceInfo.forMovieRange(sourceMovie, { start: 3000, end: 3050 },
    [{ frameIndex: 3000, frameInfoHash: checkValue(3000) }, { frameIndex: 3050, frameInfoHash: checkValue(3050) }]);
}

// A window whose frame 0 is movie frame `firstMovieFrame`, holding `frameCount` frames.
function windowFrames(firstMovieFrame: number, frameCount: number) {
  const read: number[] = [];
  const reader = {
    frameCount,
    frameIdentity: vi.fn(async (frameIndex: number) => {
      read.push(frameIndex);
      return { frameIndex, pts: BigInt(frameIndex * 40), duration: 40n, timebaseNumerator: 1n, timebaseDenominator: 1000n,
        frameInfoHash: checkValue(firstMovieFrame + frameIndex) };
    }),
  };
  return { reader, read };
}

function sources({ sourceInfo = storedTimesInfo() as unknown, located = { kind: 'located', moviePath: 'D:\\movies\\Feature.mkv' } as unknown,
  cachedTimes = new Map<number, bigint>(), framesPerSecond = 25, window = windowFrames(1120, 3805) } = {}) {
  let handles = 0;
  const host = {
    registerSource: vi.fn(() => `source_handle${String(++handles).padStart(4, '0')}`),
    cachedFrameTimesUs: vi.fn(async (moviePath: string, frameIndexes: number[]) =>
      moviePath === 'D:\\movies\\Feature.mkv' && frameIndexes.every(frameIndex => cachedTimes.has(frameIndex))
        ? frameIndexes.map(frameIndex => cachedTimes.get(frameIndex)!) : null),
    exactFrameReader: vi.fn(() => window.reader),
    findFrameByCheckValue: vi.fn(async (_session: string, _handle: string, hash: string, order: Iterable<number>) => {
      for (const frameIndex of order) {
        if (frameIndex < 0 || frameIndex >= window.reader.frameCount) continue;
        if ((await window.reader.frameIdentity(frameIndex)).frameInfoHash === hash) return frameIndex;
      }
      return null;
    }),
  };
  const folderAccess = {
    requireKnownPath: vi.fn((_sender: unknown, folderPath: unknown) => {
      if (folderPath !== folder) throw new Error('Folder access is unavailable for this folder session.');
      return folder;
    }),
  };
  const locator = { locate: vi.fn(async () => located) };
  const windowCache = { window: vi.fn(async (_placement: Record<string, unknown>) => ({ windowPath: 'D:\\app\\movie-window-cache\\key\\window.mkv', cacheHit: false })) };
  const probeFrameRate = vi.fn(async () => framesPerSecond);
  const provenance = { canBeTagged: (name: string) => name.endsWith('.mp4'), read: vi.fn(async () => sourceInfo) };
  let ids = 0;
  const fileSystem = { stat: async () => ({ isFile: () => true }) };
  const zoomEditSources = new ZoomEditSources({
    folderAccess, hostForEvent: () => host, locator, windowCache, placement: new MovieWindowPlacement({ probeFrameRate }), provenance,
    fileSystem,
    randomId: () => `opaque${String(++ids).padStart(4, '0')}`,
  });
  return { zoomEditSources, host, locator, windowCache, probeFrameRate, window };
}

const placementOf = (windowCache: { window: ReturnType<typeof vi.fn> }, call = 0) => {
  const { startUs, durationUs } = windowCache.window.mock.calls[call][0];
  return { startUs, durationUs };
};

describe('ZoomEditSources', () => {
  describe('opening a clip', () => {
    it('registers a clip of a granted folder with the window’s frame review and answers its handle', async () => {
      const { zoomEditSources, host } = sources();

      await expect(zoomEditSources.openClip(event, clipRequest)).resolves.toEqual({ sourceHandle: 'source_handle0001' });
      expect(host.registerSource).toHaveBeenCalledWith(path.join(folder, 'Feature-002.mp4'));
    });

    it.each([
      ['a folder that was not opened in this window', { folderPath: path.resolve('elsewhere'), filename: 'Feature-002.mp4' }, 'Folder access is unavailable for this folder session.'],
      ['a name that contains a folder', { folderPath: folder, filename: '..\\Feature-002.mp4' }, 'Clip filename is invalid.'],
      ['a name that is not a video', { folderPath: folder, filename: 'notes.txt' }, 'Clip filename is invalid.'],
    ])('refuses %s without registering anything', async (_case, request, message) => {
      const { zoomEditSources, host } = sources();

      await expect(zoomEditSources.openClip(event, request)).rejects.toThrow(message);
      expect(host.registerSource).not.toHaveBeenCalled();
    });
  });

  describe('opening a movie window', () => {
    it('places the window a minute and a quarter around the clip’s stored times and answers its handle and id', async () => {
      // A different cached index and frame rate show that the stored times placed the window.
      const cachedTimes = new Map([[3000, 100_000_000n], [3050, 102_000_000n]]);
      const { zoomEditSources, windowCache } = sources({ framesPerSecond: 24, cachedTimes });

      const answer = await zoomEditSources.openWindow(event, { ...clipRequest, widen: 0 });

      expect(answer).toEqual({ kind: 'ready', sourceHandle: 'source_handle0001', windowId: 'window_opaque0001' });
      expect(placementOf(windowCache)).toEqual({ startUs: 45_000_000, durationUs: 152_000_000 });
      expect(windowCache.window.mock.calls[0][0]).toMatchObject({ moviePath: 'D:\\movies\\Feature.mkv', sourceMovie });
    });

    it('places a clip without stored times by the movie’s cached index', async () => {
      const cachedTimes = new Map([[3000, 120_000_000n], [3050, 122_000_000n]]);
      const { zoomEditSources, windowCache, probeFrameRate } = sources({ sourceInfo: untimedInfo(), cachedTimes });

      await zoomEditSources.openWindow(event, { ...clipRequest, widen: 0 });

      expect(placementOf(windowCache)).toEqual({ startUs: 45_000_000, durationUs: 152_000_000 });
      expect(probeFrameRate).not.toHaveBeenCalled();
    });

    it('estimates the place of a clip in whole microseconds from the movie’s frame rate when the movie was never prepared', async () => {
      const { zoomEditSources, windowCache } = sources({ sourceInfo: untimedInfo(), framesPerSecond: 24_000 / 1001 });

      await zoomEditSources.openWindow(event, { ...clipRequest, widen: 0 });

      // Frame 3000 at 23.976 frames per second is shown at 125.125 s, frame 3050 at 127.210417 s.
      expect(placementOf(windowCache)).toEqual({ startUs: 50_125_000, durationUs: 152_085_417 });
    });

    it('doubles the margin for each widening', async () => {
      const { zoomEditSources, windowCache } = sources();

      const first = await zoomEditSources.openWindow(event, { ...clipRequest, widen: 0 });
      const wider = await zoomEditSources.openWindow(event, { ...clipRequest, widen: 1, previousWindowId: first.windowId });
      await zoomEditSources.openWindow(event, { ...clipRequest, widen: 2, previousWindowId: wider.windowId });

      expect([placementOf(windowCache, 1), placementOf(windowCache, 2)]).toEqual([
        { startUs: 0, durationUs: 272_000_000 },
        { startUs: 0, durationUs: 422_000_000 },
      ]);
    });

    it('refuses a widening beyond two steps', async () => {
      const { zoomEditSources } = sources();

      await expect(zoomEditSources.openWindow(event, { ...clipRequest, widen: 3 })).rejects.toThrow('Movie window request is invalid.');
    });

    it.each([
      ['without the window it widens', undefined],
      ['from an unknown window', 'window_opaque0099'],
    ])('refuses a widening %s', async (_case, previousWindowId) => {
      const { zoomEditSources } = sources();
      await zoomEditSources.openWindow(event, { ...clipRequest, widen: 0 });

      await expect(zoomEditSources.openWindow(event, { ...clipRequest, widen: 1, previousWindowId }))
        .rejects.toThrow('Movie window is unknown.');
    });

    it('refuses to widen the window of another clip', async () => {
      const { zoomEditSources } = sources();
      const other = await zoomEditSources.openWindow(event, { folderPath: folder, filename: 'Feature-003.mp4', widen: 0 });

      await expect(zoomEditSources.openWindow(event, { ...clipRequest, widen: 1, previousWindowId: other.windowId }))
        .rejects.toThrow('Movie window request is invalid.');
    });

    it('refuses to widen a window by two steps at once', async () => {
      const { zoomEditSources } = sources();
      const first = await zoomEditSources.openWindow(event, { ...clipRequest, widen: 0 });

      await expect(zoomEditSources.openWindow(event, { ...clipRequest, widen: 2, previousWindowId: first.windowId }))
        .rejects.toThrow('Movie window request is invalid.');
    });

    it('refuses a clip whose stored times span more than ten minutes', async () => {
      const longInfo = SourceInfo.forMovieRange(sourceMovie, { start: 3000, end: 3050, startTimeUs: 120_000_000, endTimeUs: 721_000_000 },
        [{ frameIndex: 3000, frameInfoHash: checkValue(3000) }]);
      const { zoomEditSources, windowCache } = sources({ sourceInfo: longInfo });

      await expect(zoomEditSources.openWindow(event, { ...clipRequest, widen: 0 })).rejects.toThrow('The clip is too long for a movie window.');
      expect(windowCache.window).not.toHaveBeenCalled();
    });

    it('answers that an untagged clip has no source info, without looking for a movie', async () => {
      const { zoomEditSources, locator } = sources({ sourceInfo: null });

      await expect(zoomEditSources.openWindow(event, { ...clipRequest, widen: 0 })).resolves.toEqual({ kind: 'no-source-info' });
      expect(locator.locate).not.toHaveBeenCalled();
    });

    it('answers that a clip keeping only its movie has no range to extend, without looking for the movie', async () => {
      const { zoomEditSources, locator } = sources({ sourceInfo: storedTimesInfo().limitedTo('movie-only') });

      await expect(zoomEditSources.openWindow(event, { ...clipRequest, widen: 0 })).resolves.toEqual({ kind: 'movie-only' });
      expect(locator.locate).not.toHaveBeenCalled();
    });

    it('answers cancelled and cuts nothing when the user cancels the movie lookup', async () => {
      const { zoomEditSources, windowCache } = sources({ located: { kind: 'cancelled' } });

      await expect(zoomEditSources.openWindow(event, { ...clipRequest, widen: 0 })).resolves.toEqual({ kind: 'cancelled' });
      expect(windowCache.window).not.toHaveBeenCalled();
    });

    it('passes on the refusal of a chosen movie that does not match the clip’s source', async () => {
      const { zoomEditSources, locator } = sources();
      locator.locate.mockRejectedValueOnce(new Error('The selected movie does not match this clip’s original source.'));

      await expect(zoomEditSources.openWindow(event, { ...clipRequest, widen: 0 }))
        .rejects.toThrow('The selected movie does not match this clip’s original source.');
    });

    it('forgets the windows of an app window that closed', async () => {
      const { zoomEditSources } = sources();
      const { windowId } = await zoomEditSources.openWindow(event, { ...clipRequest, widen: 0 });

      zoomEditSources.forgetAppWindow(event.sender.id);

      await expect(zoomEditSources.anchorWindow(event, { windowId, sessionId: 'session_window01' })).rejects.toThrow('Movie window is unknown.');
    });
  });

  describe('anchoring a movie window', () => {
    async function openedWindow(options: Parameters<typeof sources>[0] = {}) {
      const fixture = sources(options);
      const { windowId } = await fixture.zoomEditSources.openWindow(event, { ...clipRequest, widen: 0 });
      return { ...fixture, windowId };
    }

    it('numbers the window by its reference frame and allows a minute beyond each end of the clip', async () => {
      const { zoomEditSources, windowId } = await openedWindow();

      await expect(zoomEditSources.anchorWindow(event, { windowId, sessionId: 'session_window01' })).resolves.toEqual({
        kind: 'anchored', clipStartFrame: 1880, earliestFrame: 380, latestFrame: 3430,
      });
    });

    it('stops the allowed extension at the edges of the window', async () => {
      const { zoomEditSources, windowId } = await openedWindow({ window: windowFrames(2500, 1000) });

      await expect(zoomEditSources.anchorWindow(event, { windowId, sessionId: 'session_window01' })).resolves.toEqual({
        kind: 'anchored', clipStartFrame: 500, earliestFrame: 0, latestFrame: 999,
      });
    });

    it('tries the next reference frame when the first is not in the window', async () => {
      const references = SourceInfo.forMovieRange(sourceMovie, { start: 3000, end: 3050, startTimeUs: 120_000_000, endTimeUs: 122_000_000 },
        [{ frameIndex: 2900, frameInfoHash: 'ffffffffffffffff' }, { frameIndex: 3050, frameInfoHash: checkValue(3050) }]);
      const { zoomEditSources, windowId } = await openedWindow({ sourceInfo: references });

      await expect(zoomEditSources.anchorWindow(event, { windowId, sessionId: 'session_window01' }))
        .resolves.toMatchObject({ kind: 'anchored', clipStartFrame: 1880 });
    });

    it('answers not found when no reference frame is in the window', async () => {
      const { zoomEditSources, windowId } = await openedWindow({ window: windowFrames(5000, 3805) });

      await expect(zoomEditSources.anchorWindow(event, { windowId, sessionId: 'session_window01' })).resolves.toEqual({ kind: 'not-found' });
    });

    it('answers not found when the window holds a reference frame but not the whole clip', async () => {
      const { zoomEditSources, windowId } = await openedWindow({ window: windowFrames(2000, 1020) });

      await expect(zoomEditSources.anchorWindow(event, { windowId, sessionId: 'session_window01' })).resolves.toEqual({ kind: 'not-found' });
    });

    it('in a widened window finds a reference in an added stretch before reading any frame the previous window held', async () => {
      // The widened window starts at 0 s, so the previous one (45 s to 197 s) held its frames 1125 to 4925.
      // Its content starts 100 s later than placed, which puts the clip's first frame at window frame 500.
      const window = windowFrames(2500, 6800);
      const fixture = sources({ window });
      const first = await fixture.zoomEditSources.openWindow(event, { ...clipRequest, widen: 0 });
      const { windowId } = await fixture.zoomEditSources.openWindow(event, { ...clipRequest, widen: 1, previousWindowId: first.windowId });

      const answer = await fixture.zoomEditSources.anchorWindow(event, { windowId, sessionId: 'session_window01' });

      expect(answer).toMatchObject({ kind: 'anchored', clipStartFrame: 500 });
      const readBeforeMatch = window.read.slice(0, window.read.indexOf(500));
      expect(readBeforeMatch.filter(frameIndex => frameIndex >= 1125 && frameIndex <= 4925)).toEqual([]);
    });

    it('refuses a window opened by another app window', async () => {
      const { zoomEditSources, windowId } = await openedWindow();

      await expect(zoomEditSources.anchorWindow({ sender: { id: 8 } }, { windowId, sessionId: 'session_window01' }))
        .rejects.toThrow('Movie window is unknown.');
    });
  });

  describe('looking up an anchored window for saving', () => {
    async function openedWindow(options: Parameters<typeof sources>[0] = {}) {
      const fixture = sources(options);
      const { windowId } = await fixture.zoomEditSources.openWindow(event, { ...clipRequest, widen: 0 });
      return { ...fixture, windowId };
    }

    it('gives the window the clip’s record, the window source and the anchor', async () => {
      const { zoomEditSources, windowId, window: frames } = await openedWindow();
      await zoomEditSources.anchorWindow(event, { windowId, sessionId: 'session_window01' });

      const window = zoomEditSources.anchoredWindow(event, windowId);
      const clipAgain = await window.movieRecordOf(await frames.reader.frameIdentity(1880), await frames.reader.frameIdentity(1930));

      expect([window.clipPath, window.sourceHandle, clipAgain.toRecord()]).toEqual([
        path.join(folder, 'Feature-002.mp4'), 'source_handle0001', storedTimesInfo().toRecord(),
      ]);
    });

    it('anchors the window by the reference frame that was found when the first one is not in the window', async () => {
      // The references are not the clip's ends, so the movie's cached index times the reference frame.
      const references = SourceInfo.forMovieRange(sourceMovie, { start: 3000, end: 3050, startTimeUs: 120_000_000, endTimeUs: 122_000_000 },
        [{ frameIndex: 2900, frameInfoHash: 'ffffffffffffffff' }, { frameIndex: 3050, frameInfoHash: checkValue(3050) }]);
      const cachedTimes = new Map([[2900, 116_000_000n], [3050, 122_000_000n]]);
      const { zoomEditSources, windowId, window: frames } = await openedWindow({ sourceInfo: references, cachedTimes });
      await zoomEditSources.anchorWindow(event, { windowId, sessionId: 'session_window01' });

      const clipStart = await frames.reader.frameIdentity(1880);
      const record = await zoomEditSources.anchoredWindow(event, windowId).movieRecordOf(clipStart, clipStart);

      expect(record.range).toEqual({ start: 3000, end: 3000, startTimeUs: 120_000_000, endTimeUs: 120_000_000 });
    });

    it('refuses a window that was never anchored', async () => {
      const { zoomEditSources, windowId } = await openedWindow();

      expect(() => zoomEditSources.anchoredWindow(event, windowId)).toThrow('Movie window is not anchored.');
    });

    it('refuses a window in which no reference frame was found', async () => {
      const { zoomEditSources, windowId } = await openedWindow({ window: windowFrames(5000, 3805) });
      await zoomEditSources.anchorWindow(event, { windowId, sessionId: 'session_window01' });

      expect(() => zoomEditSources.anchoredWindow(event, windowId)).toThrow('Movie window is not anchored.');
    });

    it('refuses an anchored window of another app window', async () => {
      const { zoomEditSources, windowId } = await openedWindow();
      await zoomEditSources.anchorWindow(event, { windowId, sessionId: 'session_window01' });

      expect(() => zoomEditSources.anchoredWindow({ sender: { id: 8 } }, windowId)).toThrow('Movie window is unknown.');
    });
  });
});
