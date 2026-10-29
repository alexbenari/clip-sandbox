// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { FRAME_US, checkValue, sourceMovie } from '../support/movie-window-fixtures.js';

const require = createRequire(import.meta.url);
const { AnchoredMovieWindow } = require('../../electron/anchored-movie-window.cjs');
const { SourceInfo } = require('../../electron/clip-provenance/source-info.cjs');

// The window's frame 0 is movie frame 1120, and window frame w is shown at w × 40 ms in the window.
const WINDOW_START = 1120;
const endReferences = [{ frameIndex: 3000, frameInfoHash: checkValue(3000) }, { frameIndex: 3050, frameInfoHash: checkValue(3050) }];
const timedRecord = SourceInfo.forMovieRange(sourceMovie, { start: 3000, end: 3050, startTimeUs: 120_000_000, endTimeUs: 122_000_000 }, endReferences);
const untimedRecord = SourceInfo.forMovieRange(sourceMovie, { start: 3000, end: 3050 }, endReferences);

function windowFrame(frameIndex: number) {
  return { frameIndex, pts: BigInt(frameIndex * 40), duration: 40n, timebaseNumerator: 1n, timebaseDenominator: 1000n,
    frameInfoHash: checkValue(WINDOW_START + frameIndex) };
}

// The movie's cached index, when the movie was prepared before, gives each movie frame its time.
const preparedMovie = { cachedFrameTimesUs: async (_moviePath: string, frames: number[]) => frames.map(frame => BigInt(frame * FRAME_US)) };
const neverPrepared = { cachedFrameTimesUs: async () => null };

function anchoredBy(referenceFrameIndex: number, { sourceInfo = timedRecord, host = neverPrepared as object } = {}) {
  return new AnchoredMovieWindow({
    clipPath: 'D:\\picks\\Feature-002.mp4', moviePath: 'D:\\movies\\Feature.mkv', sourceInfo, sourceHandle: 'source_window01',
    anchor: {
      offset: WINDOW_START, referenceFrameIndex, referenceWindowTimeUs: (referenceFrameIndex - WINDOW_START) * FRAME_US,
      clipStartFrame: 1880, earliestFrame: 380, latestFrame: 3430,
    },
    host,
  });
}

// Window frames 1870 and 1940 are movie frames 2990 and 3060, shown at 119.6 s and 122.4 s.
const cutRange = async (window: InstanceType<typeof AnchoredMovieWindow>) =>
  (await window.movieRecordOf(windowFrame(1870), windowFrame(1940))).toRecord().sourceFrameRange;
const exactlyTimed = { start: 2990, end: 3060, endInclusive: true, startTimeUs: 119_600_000, endTimeUs: 122_400_000 };
const untimed = { start: 2990, end: 3060, endInclusive: true };

describe('AnchoredMovieWindow', () => {
  it('records a range cut from the window in movie numbering, with its ends as reference frames', async () => {
    const record = await anchoredBy(3000).movieRecordOf(windowFrame(1870), windowFrame(1940));

    expect(record.toRecord()).toEqual({
      provenanceVersion: 2,
      sourceMovie,
      sourceFrameRange: exactlyTimed,
      referenceFrames: [{ frameIndex: 2990, frameInfoHash: checkValue(2990) }, { frameIndex: 3060, frameInfoHash: checkValue(3060) }],
    });
  });

  it.each([
    ['a range at both limits', 380, 3430, true],
    ['a range starting a frame before the earliest one', 379, 1900, false],
    ['a range ending a frame after the latest one', 1900, 3431, false],
  ])('answers whether %s is within the extension limit', (_case, startFrame, endFrame, allowed) => {
    expect(anchoredBy(3000).isWithinExtensionLimit(startFrame, endFrame)).toBe(allowed);
  });

  it('times the range by the stored time of a reference frame at the clip’s end', async () => {
    await expect(cutRange(anchoredBy(3050))).resolves.toEqual(exactlyTimed);
  });

  it('times the range by the movie’s cached index when the clip stores no times', async () => {
    await expect(cutRange(anchoredBy(3000, { sourceInfo: untimedRecord, host: preparedMovie }))).resolves.toEqual(exactlyTimed);
  });

  it('leaves the range untimed when the clip stores no times and the movie was never prepared', async () => {
    await expect(cutRange(anchoredBy(3000, { sourceInfo: untimedRecord }))).resolves.toEqual(untimed);
  });

  it('leaves the range untimed when the cached index cannot be read', async () => {
    const host = { cachedFrameTimesUs: vi.fn(async () => { throw new Error('The movie changed.'); }) };

    await expect(cutRange(anchoredBy(3000, { sourceInfo: untimedRecord, host }))).resolves.toEqual(untimed);
  });

  describe('for a clip trimmed to a single frame that is one of its reference frames', () => {
    // Trimmed to movie frame 3050 alone; its stored times still belong to frames 3000 and 3050.
    const singleFrame = timedRecord.trimmed(50, 0);

    it('leaves the range untimed by the stored times', async () => {
      await expect(cutRange(anchoredBy(3050, { sourceInfo: singleFrame }))).resolves.toEqual(untimed);
    });

    it('times the range by the movie’s cached index', async () => {
      await expect(cutRange(anchoredBy(3050, { sourceInfo: singleFrame, host: preparedMovie }))).resolves.toEqual(exactlyTimed);
    });
  });
});
