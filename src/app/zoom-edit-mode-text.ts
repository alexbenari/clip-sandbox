import type { IRefinedClipSaveProgress, SavedRefinedClip } from './refined-clip-save-service.js';
import { ZOOM_EDIT_MODE_KEYS } from './zoom-edit-mode-keys.js';
import type { ZoomEditExtension, ZoomEditPictureReadiness, ZoomEditRefusal } from './zoom-edit-mode-session.js';

type ExtensionLimit = Exclude<ZoomEditExtension, 'ready'>;

const keys = ZOOM_EDIT_MODE_KEYS;

const WHY_NOT_EXTENDED: Readonly<Record<ExtensionLimit, string>> = Object.freeze({
  'none': 'This clip has no source movie info, so it can be trimmed but not extended.',
  'finding-movie': 'Extending is not available yet: the source movie is still being found.',
  'preparing-window': 'Extending is not available yet: the movie around this clip is still being prepared.',
  'cancelled': 'No source movie was chosen, so this clip can be trimmed but not extended.',
  'not-found': 'This clip was not found in its source movie, so it can be trimmed but not extended.',
  'failed': 'The source movie could not be prepared, so this clip can be trimmed but not extended.',
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

const SAVE_STAGES: Readonly<Record<IRefinedClipSaveProgress['stage'], string>> = Object.freeze({
  'checking-source': 'Saving: checking the frames…',
  'encoding-video': 'Saving: encoding the video…',
  'exact-fallback': 'Saving: encoding the exact frames…',
  'adding-audio': 'Saving: adding the audio…',
  'saving-media': 'Saving: writing the file…',
});

export class ZoomEditModeText {
  keys(): string {
    return `${keys.markStart} start · ${keys.markEnd} end · ${keys.jumpToStart}/${keys.jumpToEnd} jump · ${keys.loop} loop`
      + ` · ${keys.save} save · Esc leave`;
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
    if (extension === 'finding-movie') return 'Finding the source movie…';
    if (extension === 'preparing-window') return 'Preparing the movie around this clip…';
    if (extension === 'none' || extension === 'ready') return null;
    return WHY_NOT_EXTENDED[extension];
  }

  refusal(refusal: ZoomEditRefusal): string {
    return refusal.reason === 'extension-unavailable' ? WHY_NOT_EXTENDED[refusal.extension] : REFUSALS[refusal.reason];
  }

  commandFailed(): string {
    return 'That key could not act. Try it again.';
  }

  nothingToSave(): string {
    return `Nothing to save yet. Set a new start with ${keys.markStart} or a new end with ${keys.markEnd}.`;
  }

  stillSaving(): string {
    return 'Saving is in progress. Press Esc to cancel it.';
  }

  waitingForMovie(): string {
    return 'Saving waits for the movie around this clip…';
  }

  saveProgress(progress: IRefinedClipSaveProgress | null): string {
    if (!progress) return 'Saving…';
    const { stage, encodedFrames, totalFrames } = progress;
    if (stage === 'encoding-video' && encodedFrames !== undefined && totalFrames !== undefined) {
      return `Saving: encoded ${encodedFrames.toLocaleString()} of ${totalFrames.toLocaleString()} frames…`;
    }
    return SAVE_STAGES[stage];
  }

  saveCancelled(): string {
    return 'Saving was cancelled. Your new start and end are kept.';
  }

  saveFailedHint(): string {
    return `The clip could not be saved. Your new start and end are kept; press ${keys.save} to try again.`;
  }

  saveFailed(filename: string): string {
    return `Could not save the refined ${filename}.`;
  }

  saved(originalFilename: string, saved: SavedRefinedClip): string {
    if (saved.outcome === 'kept-both') {
      if (saved.notice === 'recycle-bin-refused') {
        return `Saved the refined clip as ${saved.filename}, because ${originalFilename} could not be moved to the Recycle Bin.`;
      }
      if (saved.notice === 'name-taken') {
        return `Saved the refined clip as ${saved.filename}, because the name it would replace is already taken.`;
      }
      return `Saved the refined clip as ${saved.filename}.`;
    }
    if (saved.notice) {
      return `Moved ${originalFilename} to the Recycle Bin and saved the refined clip as ${saved.filename}, `
        + 'because it could not take the original name.';
    }
    if (saved.filename !== originalFilename) return `Replaced ${originalFilename} with the refined clip ${saved.filename}.`;
    return `Replaced ${originalFilename} with the refined clip.`;
  }
}
