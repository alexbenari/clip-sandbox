import type { RangeCaptureRejection } from '../domain/range-capture-model.js';

// Words a refused mark or lock for the user. The composition root passes the key that starts a new
// range, taken from the keyboard bindings, so the advice always names the key that works.
export class CaptureRejectionText {
  constructor(private readonly markStartKey: string | null = null) {}

  textFor(reason: RangeCaptureRejection): string {
    switch (reason) {
      case 'locked-range-needs-new-start':
        return this.markStartKey ? `Press ${this.markStartKey} to begin a new range.` : 'Mark a new start to begin another range.';
      case 'range-already-locked': return 'The current range is already locked.';
      case 'endpoints-missing': return 'Mark a start and end before locking.';
      case 'saved-frames-unchecked': return 'Check the saved exact frames before locking this draft.';
      case 'end-before-start': return 'The end must not precede the start.';
      case 'mixed-source-generations': return 'The start and end belong to different movies. Mark them again.';
    }
  }
}
