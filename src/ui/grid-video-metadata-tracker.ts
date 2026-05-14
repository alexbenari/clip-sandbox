// @ts-nocheck
export class GridVideoMetadataTracker {
  constructor({
    onComplete = () => {},
    onFailure = () => {},
    setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = (timer) => clearTimeout(timer),
    debounceMs = 0,
  } = {}) {
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

  start(clips = []) {
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

  currentToken() {
    return this.sequenceToken;
  }

  reset() {
    this.sequenceToken += 1;
    if (this.completeTimer) {
      this.clearTimer(this.completeTimer);
      this.completeTimer = null;
    }
    this.statesByClipId = new Map();
    this.loggedFailures = new Set();
    this.complete = true;
  }

  isCurrent(token) {
    return token === this.sequenceToken;
  }

  markLoaded(token, clip) {
    if (!this.isCurrent(token) || !clip?.id || !this.statesByClipId.has(clip.id)) return false;
    this.statesByClipId.set(clip.id, 'loaded');
    this.checkComplete();
    return true;
  }

  markFailed(token, clip, error = null) {
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

  checkComplete() {
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

export function createGridVideoMetadataTracker(options) {
  return new GridVideoMetadataTracker(options);
}
