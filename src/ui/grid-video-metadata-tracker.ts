import type { Clip } from '../domain/clip.js';

type MetadataStatus = 'pending' | 'loaded' | 'failed';
type TimerId = ReturnType<typeof setTimeout>;

type GridVideoMetadataTrackerOptions = {
  onComplete?: (event: { token: number }) => void;
  onFailure?: (event: { clip: Clip; error: unknown }) => void;
  setTimer?: (callback: () => void, delay: number) => TimerId;
  clearTimer?: (timer: TimerId) => void;
  debounceMs?: number;
};

export class GridVideoMetadataTracker {
  onComplete: (event: { token: number }) => void;
  onFailure: (event: { clip: Clip; error: unknown }) => void;
  setTimer: (callback: () => void, delay: number) => TimerId;
  clearTimer: (timer: TimerId) => void;
  debounceMs: number;
  sequenceToken: number;
  statesByClipId: Map<string, MetadataStatus>;
  loggedFailures: Set<string>;
  complete: boolean;
  completeTimer: TimerId | null;

  constructor({
    onComplete = () => {},
    onFailure = () => {},
    setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = (timer) => clearTimeout(timer),
    debounceMs = 0,
  }: GridVideoMetadataTrackerOptions = {}) {
    this.onComplete = onComplete;
    this.onFailure = onFailure;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.debounceMs = debounceMs;
    this.sequenceToken = 0;
    this.statesByClipId = new Map();
    this.loggedFailures = new Set();
    this.complete = false;
    this.completeTimer = null;
  }

  start(clips: Iterable<Clip> = []): number {
    this.sequenceToken += 1;
    if (this.completeTimer) {
      this.clearTimer(this.completeTimer);
      this.completeTimer = null;
    }
    this.statesByClipId = new Map();
    this.loggedFailures = new Set();
    this.complete = false;

    for (const clip of Array.from(clips || [])) {
      if (!clip?.id) continue;
      const status = clip.metadataFailed
        ? 'failed'
        : clip.hasUsableDimensions?.()
          ? 'loaded'
          : 'pending';
      this.statesByClipId.set(clip.id, status);
    }

    this.checkComplete();
    return this.sequenceToken;
  }

  currentToken(): number {
    return this.sequenceToken;
  }

  reset(): void {
    this.sequenceToken += 1;
    if (this.completeTimer) {
      this.clearTimer(this.completeTimer);
      this.completeTimer = null;
    }
    this.statesByClipId = new Map();
    this.loggedFailures = new Set();
    this.complete = true;
  }

  isCurrent(token: number): boolean {
    return token === this.sequenceToken;
  }

  markLoaded(token: number, clip: Clip | null | undefined): boolean {
    if (!this.isCurrent(token) || !clip?.id || !this.statesByClipId.has(clip.id)) return false;
    this.statesByClipId.set(clip.id, 'loaded');
    this.checkComplete();
    return true;
  }

  markFailed(token: number, clip: Clip | null | undefined, error: unknown = null): boolean {
    if (!this.isCurrent(token) || !clip?.id || !this.statesByClipId.has(clip.id)) return false;
    this.statesByClipId.set(clip.id, 'failed');
    clip.markMetadataFailed?.();
    if (!this.loggedFailures.has(clip.id)) {
      this.loggedFailures.add(clip.id);
      this.onFailure({ clip, error });
    }
    this.checkComplete();
    return true;
  }

  checkComplete(): void {
    if (this.complete) return;
    const hasPending = Array.from(this.statesByClipId.values()).some((status) => status === 'pending');
    if (hasPending) return;
    this.complete = true;
    this.completeTimer = this.setTimer(() => {
      this.completeTimer = null;
      this.onComplete({ token: this.sequenceToken });
    }, this.debounceMs);
  }
}

export function createGridVideoMetadataTracker(options?: GridVideoMetadataTrackerOptions): GridVideoMetadataTracker {
  return new GridVideoMetadataTracker(options);
}
