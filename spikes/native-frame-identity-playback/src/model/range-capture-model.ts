import { capturedFrameRange, type CapturedFrameRange } from './captured-frame-range.js';
import type { SourceFrameIdentity } from './source-frame-identity.js';

export interface RangeDraft {
  readonly start: SourceFrameIdentity | null;
  readonly end: SourceFrameIdentity | null;
  readonly locked: boolean;
  readonly error: string | null;
}

export interface RangeCaptureSnapshot {
  readonly draft: RangeDraft;
  readonly ranges: readonly CapturedFrameRange[];
}

export class RangeCaptureModel {
  #start: SourceFrameIdentity | null = null;
  #end: SourceFrameIdentity | null = null;
  #locked = false;
  #error: string | null = null;
  readonly #ranges: CapturedFrameRange[] = [];

  markStart(frame: SourceFrameIdentity): void {
    this.#beginNextDraftIfLocked();
    this.#start = frame;
    this.#error = null;
  }

  markEnd(frame: SourceFrameIdentity): void {
    this.#beginNextDraftIfLocked();
    this.#end = frame;
    this.#error = null;
  }

  toggleLock(): { readonly locked: boolean; readonly error: string | null } {
    if (this.#locked) {
      this.#locked = false;
      return Object.freeze({ locked: false, error: null });
    }
    if (!this.#start) return this.#reject('Mark a start frame before locking.');
    if (!this.#end) return this.#reject('Mark an end frame before locking.');
    if (this.#end.frameIndex < this.#start.frameIndex) {
      return this.#reject('The end frame must not precede the start frame.');
    }
    this.#locked = true;
    this.#error = null;
    return Object.freeze({ locked: true, error: null });
  }

  clear(): void {
    this.#start = null;
    this.#end = null;
    this.#locked = false;
    this.#error = null;
    this.#ranges.splice(0);
  }

  exportableRanges(): readonly CapturedFrameRange[] {
    const ranges = [...this.#ranges];
    if (this.#locked && this.#start && this.#end) ranges.push(capturedFrameRange(this.#start, this.#end));
    return Object.freeze(ranges);
  }

  get snapshot(): RangeCaptureSnapshot {
    return Object.freeze({
      draft: Object.freeze({ start: this.#start, end: this.#end, locked: this.#locked, error: this.#error }),
      ranges: Object.freeze([...this.#ranges]),
    });
  }

  #beginNextDraftIfLocked(): void {
    if (!this.#locked || !this.#start || !this.#end) return;
    this.#ranges.push(capturedFrameRange(this.#start, this.#end));
    this.#start = null;
    this.#end = null;
    this.#locked = false;
  }

  #reject(error: string): { readonly locked: false; readonly error: string } {
    this.#error = error;
    return Object.freeze({ locked: false, error });
  }
}
