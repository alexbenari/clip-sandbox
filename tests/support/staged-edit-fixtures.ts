import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { vi } from 'vitest';

import { ZoomEditComposition } from '../../src/domain/zoom-edit-composition.js';
import { FRAME_US, checkValue, sourceMovie } from './movie-window-fixtures.js';

const require = createRequire(import.meta.url);
const { AnchoredMovieWindow } = require('../../electron/anchored-movie-window.cjs');
const { Mp4Provenance } = require('../../electron/clip-provenance/mp4-provenance.cjs');
const { SourceInfo } = require('../../electron/clip-provenance/source-info.cjs');
const { StagedEditResolver } = require('../../electron/staged-edit-resolver.cjs');

export const event = { sender: { id: 7 } };
export const MOVIE_PATH = 'D:\\movies\\Feature.mkv';
export const WINDOW_PATH = 'D:\\app\\movie-window-cache\\key\\window.mkv';
export const WINDOW_ID = 'window_opaque0001';
export const CLIP_SESSION = 'session_clip0001';
export const WINDOW_SESSION = 'session_window01';

// Movie frames 3000-3050 (120.00 s to 122.00 s), both ends as reference frames.
const timedRange = { start: 3000, end: 3050, startTimeUs: 120_000_000, endTimeUs: 122_000_000 };
export const endReferences = [{ frameIndex: 3000, frameInfoHash: checkValue(3000) }, { frameIndex: 3050, frameInfoHash: checkValue(3050) }];
export const clipRecord = (range: object = timedRange) => SourceInfo.forMovieRange(sourceMovie, range, endReferences);

// Frames 40 ms apart, so frame n is shown at n × 40 ms.
function frame(frameIndex: number, frameInfoHash: string) {
  return { frameIndex, pts: BigInt(frameIndex * 40), duration: 40n, timebaseNumerator: 1n, timebaseDenominator: 1000n, frameInfoHash };
}

// The clip shows movie frames 3000-3050 as its frames 0-50.
const clipReader = { frameCount: 51, frameIdentity: async (index: number) => frame(index, checkValue(3000 + index)) };
// The window's frame 0 is movie frame 1120, so the clip is window frames 1880-1930, starting at 75.2 s in the window.
const windowReader = { frameCount: 3805, frameIdentity: async (index: number) => frame(index, checkValue(1120 + index)) };
const anchor = { offset: 1120, referenceFrameIndex: 3000, referenceWindowTimeUs: 1880 * FRAME_US, clipStartFrame: 1880, earliestFrame: 380, latestFrame: 3430 };

export const windowRequest = { source: { kind: 'window', windowId: WINDOW_ID }, sessionId: WINDOW_SESSION };

// A granted folder holding one clip, shown in a clip session and, anchored, in its movie window's session.
export function stagedEditsIn(folder: string, { clipName = 'Feature-002.mp4', sourceInfo = clipRecord() as unknown,
  windowRecord = {} as object, moviePrepared = false } = {}) {
  const clipPath = path.join(folder, clipName);
  writeFileSync(clipPath, 'original');
  const sourcePaths = new Map<string, string>([['source_window01', WINDOW_PATH]]);
  const shownBySession = new Map([[CLIP_SESSION, clipPath], [WINDOW_SESSION, WINDOW_PATH]]);
  let handles = 0;
  const host = {
    registerSource: vi.fn((sourcePath: string) => {
      const handle = `source_clip${String(++handles).padStart(4, '0')}`;
      sourcePaths.set(handle, sourcePath);
      return handle;
    }),
    exactFrameReader: (sessionId: string, handle: string) => {
      const shown = shownBySession.get(sessionId);
      if (!shown || shown !== sourcePaths.get(handle)) throw new Error('Review session does not show this source.');
      return shown === WINDOW_PATH ? windowReader : clipReader;
    },
    prepareExtractionSource: vi.fn(async (handle: string) => ({
      sourcePath: sourcePaths.get(handle), canonicalSourcePath: sourcePaths.get(handle), selectedStream: 0,
    })),
    cachedFrameTimesUs: async (moviePath: string, frames: number[]) =>
      (moviePrepared && moviePath === MOVIE_PATH ? frames.map(movieFrame => BigInt(movieFrame * FRAME_US)) : null),
  };
  const sources = {
    anchoredWindow: (requestEvent: typeof event, windowId: string) => {
      if (windowId !== WINDOW_ID || requestEvent.sender.id !== event.sender.id) throw new Error('Movie window is unknown.');
      return new AnchoredMovieWindow({
        clipPath, moviePath: MOVIE_PATH, sourceInfo: clipRecord(), sourceHandle: 'source_window01', anchor, host, ...windowRecord,
      });
    },
  };
  const folderAccess = {
    requireKnownPath: (_sender: unknown, folderPath: unknown) => {
      if (folderPath !== folder) throw new Error('Folder access is unavailable for this folder session.');
      return folder;
    },
  };
  const tags = new Map<string, string>(sourceInfo ? [[clipPath, new Mp4Provenance().tagValueOf(sourceInfo)]] : []);
  const provenance = new Mp4Provenance({ tagReader: { read: async (filePath: string) => tags.get(filePath) } });
  const stagedEdits = new StagedEditResolver({ folderAccess, hostForEvent: () => host, sources, editComposition: ZoomEditComposition, provenance });
  return { stagedEdits, host, clipPath, provenance };
}
