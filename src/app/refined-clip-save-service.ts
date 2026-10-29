import type { FrameReviewSessionId } from '../frame-review/frame-review-api.js';
import type { FolderAccess } from './folder-access.js';

// Frame numbers count the frames of the source shown: the clip itself, or its anchored movie window.
export type RefinedClipSource = Readonly<{ kind: 'clip' }> | Readonly<{ kind: 'window'; windowId: string }>;

export type RefinedClipSaveOutcome = 'keep-both' | 'replace';

export interface IRefinedClipSaveRequest {
  readonly folder: FolderAccess;
  readonly filename: string;
  readonly source: RefinedClipSource;
  readonly sessionId: FrameReviewSessionId;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly outcome: RefinedClipSaveOutcome;
}

export type RefinedClipSaveStage = 'checking-source' | 'encoding-video' | 'exact-fallback' | 'adding-audio' | 'saving-media';

export interface IRefinedClipSaveProgress {
  readonly stage: RefinedClipSaveStage;
  readonly encodedFrames?: number;
  readonly totalFrames?: number;
}

export interface ISavedClipEntry {
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly lastModifiedMs: number;
}

// A notice says why the clip did not get the name asked for. A replaced clip with a notice is under the
// Keep both name, and its original is in the Recycle Bin.
export type ReplacedClipNotice = 'name-taken' | 'rename-failed';
export type KeptBothClipNotice = 'recycle-bin-refused' | 'name-taken';

export type SavedRefinedClip =
  | Readonly<{
    outcome: 'replaced';
    filename: string;
    entry: ISavedClipEntry;
    replacedFilename?: string;
    notice?: ReplacedClipNotice;
    warning?: string;
  }>
  | Readonly<{
    outcome: 'kept-both';
    filename: string;
    entry: ISavedClipEntry;
    notice?: KeptBothClipNotice;
    warning?: string;
  }>;

export interface IRefinedClipSaveService {
  save(request: IRefinedClipSaveRequest, onProgress?: (progress: IRefinedClipSaveProgress) => void): Promise<SavedRefinedClip>;
  cancelSave(): Promise<void>;
}
