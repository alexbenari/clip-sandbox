import { ZoomEditComposition, type ZoomEditName } from '../domain/zoom-edit-composition.js';
import type { IEditedClipSaveProgress, SavedEditedClip } from './edited-clip-save-service.js';
import type { ZoomEditPreviewState } from './zoom-edit-loop-preview.js';
import { ZOOM_EDIT_MODE_KEYS } from './zoom-edit-mode-keys.js';
import type { ZoomEditExtension, ZoomEditPictureReadiness, ZoomEditRefusal } from './zoom-edit-mode-session.js';

type ExtensionLimit = Exclude<ZoomEditExtension, 'ready'>;

const keys = ZOOM_EDIT_MODE_KEYS;

const WHY_NOT_EXTENDED: Readonly<Record<ExtensionLimit, string>> = Object.freeze({
  'none': 'This clip has no source movie info, so it can be trimmed but not extended.',
  'movie-only': 'This clip keeps only the name of its source movie, so it can be trimmed but not extended.',
  'finding-movie': 'Extending is not available yet: the source movie is still being found.',
  'preparing-window': 'Extending is not available yet: the movie around this clip is still being prepared.',
  'cancelled': 'No source movie was chosen, so this clip can be trimmed but not extended.',
  'not-found': 'This clip was not found in its source movie, so it can be trimmed but not extended.',
  'failed': 'The source movie could not be prepared, so this clip can be trimmed but not extended.',
});

const EXTENSION_STATUS: Readonly<Record<ZoomEditExtension, string | null>> = Object.freeze({
  'finding-movie': 'Finding the source movie…',
  'preparing-window': 'Preparing the movie around this clip…',
  'none': null,
  'movie-only': null,
  'ready': null,
  'cancelled': WHY_NOT_EXTENDED.cancelled,
  'not-found': WHY_NOT_EXTENDED['not-found'],
  'failed': WHY_NOT_EXTENDED.failed,
});

const REFUSALS: Readonly<Record<Exclude<ZoomEditRefusal['reason'], 'extension-unavailable'>, string>> = Object.freeze({
  'clip-preparing': 'The clip is still being prepared. Try again in a moment.',
  'source-failed': 'This clip could not be opened for editing. Press Esc to leave.',
  'start-after-end': `This frame is after the end, so it cannot be the start. Go back, or set a later end with ${keys.markEnd} first.`,
  'end-before-start': `This frame is before the start, so it cannot be the end. Go forward, or set an earlier start with ${keys.markStart} first.`,
  'beyond-extension': 'Extending stops one minute past the clip’s original start and end.',
  'loop-needs-two-frames': 'The start and the end are the same frame. Set a longer range to loop it.',
  'ended': 'Zoom edit mode has ended.',
});

const SAVE_STAGES: Readonly<Record<IEditedClipSaveProgress['stage'], string>> = Object.freeze({
  'checking-source': 'Saving: checking the frames…',
  'encoding-video': 'Saving: encoding the video…',
  'exact-fallback': 'Saving: encoding the exact frames…',
  'adding-backward-half': 'Saving: adding the backward half…',
  'adding-audio': 'Saving: adding the audio…',
  'saving-media': 'Saving: writing the file…',
});

export class ZoomEditModeText {
  keys(): string {
    return `${keys.markStart} start · ${keys.markEnd} end · ${keys.jumpToStart}/${keys.jumpToEnd} jump · ${keys.loop} loop`
      + ` · ${keys.loopify} loopify · ${keys.save} save · Esc leave`;
  }

  stagedEdits(edits: ZoomEditComposition): string | null {
    if (edits.isEmpty) return null;
    const staged = `${edits.labels.join(' + ')} staged`;
    return edits.keepsAudio ? staged : `${staged} · saved without sound`;
  }

  editLabel(edit: ZoomEditName): string {
    return ZoomEditComposition.labelOf(edit);
  }

  editedClip(edits: ZoomEditComposition): string {
    return `${edits.adjectives.join(' and ')} clip`;
  }

  saveLoss(edits: ZoomEditComposition): string | null {
    return edits.keepsAudio ? null : `The ${this.editedClip(edits)} is saved without sound.`;
  }

  previewStatus(preview: ZoomEditPreviewState): string | null {
    if (preview.kind === 'failed') return `The loop preview could not be made. Press ${keys.loop} to loop the range forward only.`;
    if (preview.kind !== 'rendering') return null;
    const { progress } = preview;
    if (!progress) return 'Making the loop preview…';
    return `Making the loop preview: ${progress.renderedFrames.toLocaleString()} of ${progress.totalFrames.toLocaleString()} frames…`;
  }

  savingKeys(): string {
    return 'Esc cancel saving';
  }

  pictureStatus(picture: ZoomEditPictureReadiness): string | null {
    if (picture === 'preparing') return 'Preparing the clip…';
    if (picture === 'failed') return REFUSALS['source-failed'];
    return null;
  }

  extensionStatus(extension: ZoomEditExtension): string | null {
    return EXTENSION_STATUS[extension];
  }

  refusal(refusal: ZoomEditRefusal): string {
    return refusal.reason === 'extension-unavailable' ? WHY_NOT_EXTENDED[refusal.extension] : REFUSALS[refusal.reason];
  }

  commandFailed(): string {
    return 'That key could not act. Try it again.';
  }

  nothingToSave(): string {
    return `Nothing to save yet. Set a new start with ${keys.markStart} or a new end with ${keys.markEnd}, or stage Loopify with ${keys.loopify}.`;
  }

  stillSaving(): string {
    return 'Saving is in progress. Press Esc to cancel it.';
  }

  waitingForMovie(): string {
    return 'Saving waits for the movie around this clip…';
  }

  saveProgress(progress: IEditedClipSaveProgress | null): string {
    if (!progress) return 'Saving…';
    const { stage, encodedFrames, totalFrames } = progress;
    if (stage === 'encoding-video' && encodedFrames !== undefined && totalFrames !== undefined) {
      return `Saving: encoded ${encodedFrames.toLocaleString()} of ${totalFrames.toLocaleString()} frames…`;
    }
    return SAVE_STAGES[stage];
  }

  saveCancelled(): string {
    return 'Saving was cancelled. Your staged edits are kept.';
  }

  saveFailedHint(): string {
    return `The clip could not be saved. Your staged edits are kept; press ${keys.save} to try again.`;
  }

  saveFailed(filename: string): string {
    return `Could not save the edits to ${filename}.`;
  }

  saved(originalFilename: string, saved: SavedEditedClip, edits: ZoomEditComposition): string {
    const clip = `the ${this.editedClip(edits)}`;
    if (saved.outcome === 'kept-both') {
      if (saved.notice === 'recycle-bin-refused') {
        return `Saved ${clip} as ${saved.filename}, because ${originalFilename} could not be moved to the Recycle Bin.`;
      }
      if (saved.notice === 'name-taken') {
        return `Saved ${clip} as ${saved.filename}, because the name it would replace is already taken.`;
      }
      return `Saved ${clip} as ${saved.filename}.`;
    }
    if (saved.notice) {
      return `Moved ${originalFilename} to the Recycle Bin and saved ${clip} as ${saved.filename}, `
        + 'because it could not take the original name.';
    }
    if (saved.filename !== originalFilename) return `Replaced ${originalFilename} with ${clip} ${saved.filename}.`;
    return `Replaced ${originalFilename} with ${clip}.`;
  }

  sourceInfoNotSaved(filename: string): string {
    return `The source movie info of ${filename} could not be saved or checked, so it may be missing.`;
  }

  savedClipNotShown(filename: string): string {
    return `Saved ${filename}, but the Collection view could not show it.`;
  }

  savedClipNotShownRecovery(): string {
    return 'Open the folder again to see the saved clip.';
  }

  collectionsNotRenamed(previousFilename: string, filename: string, collectionCount: number): string {
    const collections = collectionCount === 1 ? '1 collection' : `${collectionCount} collections`;
    return `Could not change ${previousFilename} to ${filename} in ${collections}.`;
  }

  collectionsNotRenamedRecovery(filename: string): string {
    return `Add ${filename} to those collections again.`;
  }
}
