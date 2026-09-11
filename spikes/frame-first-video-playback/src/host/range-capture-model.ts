import type {
  CandidateId,
  ICapturedFrameRange,
  IFramePosition,
  IRangeDraft,
} from '../contracts/types';

export interface IRangeCaptureSnapshot {
  readonly draft: IRangeDraft;
  readonly ranges: readonly ICapturedFrameRange[];
}

type RangeListener = (snapshot: IRangeCaptureSnapshot) => void;

function clonePosition(position: IFramePosition): IFramePosition {
  return {
    frameIndex: position.frameIndex,
    timestampMs: position.timestampMs,
    durationMs: position.durationMs,
    keyframe: position.keyframe,
  };
}

export class RangeCaptureModel {
  private draft: IRangeDraft = {
    start: null,
    end: null,
    error: null,
    lastLockedRangeId: null,
  };

  private readonly ranges: ICapturedFrameRange[] = [];

  private nextId = 1;

  private readonly listeners = new Set<RangeListener>();

  getSnapshot(): IRangeCaptureSnapshot {
    return {
      draft: this.draft,
      ranges: this.ranges.slice(),
    };
  }

  subscribe(listener: RangeListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  markStart(position: IFramePosition): void {
    this.draft = {
      start: clonePosition(position),
      end: this.draft.end,
      error: null,
      lastLockedRangeId: null,
    };
    this.emit();
  }

  markEnd(position: IFramePosition): void {
    this.draft = {
      start: this.draft.start,
      end: clonePosition(position),
      error: null,
      lastLockedRangeId: null,
    };
    this.emit();
  }

  lockRange(candidateId: CandidateId): ICapturedFrameRange | null {
    const validationError = this.validateDraft();
    if (validationError) {
      this.draft = {
        ...this.draft,
        error: validationError,
      };
      this.emit();
      return null;
    }

    const start = clonePosition(this.draft.start!);
    const end = clonePosition(this.draft.end!);
    const label = `${formatTimestampMs(start.timestampMs)}-${formatTimestampMs(end.timestampMs)}`;
    const range: ICapturedFrameRange = {
      id: `range-${this.nextId++}`,
      candidateId,
      start,
      end,
      label,
    };

    this.ranges.push(range);
    this.draft = {
      start: null,
      end: null,
      error: null,
      lastLockedRangeId: range.id,
    };
    this.emit();
    return range;
  }

  clearError(): void {
    if (!this.draft.error) {
      return;
    }

    this.draft = {
      ...this.draft,
      error: null,
    };
    this.emit();
  }

  private validateDraft(): string | null {
    if (!this.draft.start) {
      return 'Start frame is not set.';
    }

    if (!this.draft.end) {
      return 'End frame is not set.';
    }

    if (this.draft.end.frameIndex < this.draft.start.frameIndex) {
      return 'End frame must be at or after start frame.';
    }

    return null;
  }
  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

export function formatTimestampMs(timestampMs: number): string {
  const totalMilliseconds = Math.max(0, Math.round(timestampMs));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1_000);
  const milliseconds = totalMilliseconds % 1_000;
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds
    .toString()
    .padStart(3, '0')}`;
}
