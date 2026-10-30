import type { ZoomEditName } from '../domain/zoom-edit-composition.js';
import type { FrameReviewSessionId } from '../frame-review/frame-review-api.js';
import type { FolderAccess } from './folder-access.js';

// Frame numbers count the frames of the source shown: the clip itself, or its anchored movie window.
export type EditedClipSource = Readonly<{ kind: 'clip' }> | Readonly<{ kind: 'window'; windowId: string }>;

export type EditedClipSaveOutcome = 'keep-both' | 'replace';

export interface IEditedClipSaveRequest {
  readonly folder: FolderAccess;
  readonly filename: string;
  readonly source: EditedClipSource;
  readonly sessionId: FrameReviewSessionId;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly edits: readonly ZoomEditName[];
  readonly outcome: EditedClipSaveOutcome;
}

export type EditedClipSaveStage =
  | 'checking-source' | 'encoding-video' | 'exact-fallback' | 'adding-backward-half' | 'adding-audio' | 'saving-media';

export interface IEditedClipSaveProgress {
  readonly stage: EditedClipSaveStage;
  readonly encodedFrames?: number;
  readonly totalFrames?: number;
}

export interface ISavedClipEntry {
  readonly name: string;
  readonly path: string;
  readonly mediaSource: string;
  readonly type: string;
  readonly size: number;
  readonly lastModifiedMs: number;
}

// A notice says why the clip did not get the name asked for. A replaced clip with a notice is under the
// Keep both name, and its original is in the Recycle Bin.
export type ReplacedClipNotice = 'name-taken' | 'rename-failed';
export type KeptBothClipNotice = 'recycle-bin-refused' | 'name-taken';

export type SavedEditedClip =
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

export interface IEditedClipSaveService {
  save(request: IEditedClipSaveRequest, onProgress?: (progress: IEditedClipSaveProgress) => void): Promise<SavedEditedClip>;
  cancelSave(): Promise<void>;
}
