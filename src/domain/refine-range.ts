export type RefineRangeRefusal = 'start-after-end' | 'end-before-start' | 'outside-clip' | 'beyond-extension';

export type RefineRangeChange =
  | Readonly<{ kind: 'changed'; range: RefineRange }>
  | Readonly<{ kind: 'refused'; reason: RefineRangeRefusal }>;

export type RefineRangeEndChange = Readonly<{ endpoint: 'start' | 'end'; frameIndex: number }>;

type ExtensionLimits = Readonly<{ earliest: number; latest: number }>;

// A staged start and end in clip-relative frame numbers: frame 0 is the clip's first frame, and numbers
// below 0 or past its last frame are frames of the source movie around it.
export class RefineRange {
  private constructor(
    readonly start: number,
    readonly end: number,
    private readonly clipFrameCount: number,
    private readonly extension: ExtensionLimits | null,
  ) {
    Object.freeze(this);
  }

  static ofClip(clipFrameCount: number): RefineRange {
    if (!Number.isSafeInteger(clipFrameCount) || clipFrameCount < 1) throw new Error('A clip has at least one frame.');
    return new RefineRange(0, clipFrameCount - 1, clipFrameCount, null);
  }

  get lastClipFrame(): number {
    return this.clipFrameCount - 1;
  }

  get isChanged(): boolean {
    return this.start !== 0 || this.end !== this.lastClipFrame;
  }

  changedEnds(): readonly RefineRangeEndChange[] {
    const changes: RefineRangeEndChange[] = [];
    if (this.start !== 0) changes.push(Object.freeze({ endpoint: 'start', frameIndex: this.start }));
    if (this.end !== this.lastClipFrame) changes.push(Object.freeze({ endpoint: 'end', frameIndex: this.end }));
    return Object.freeze(changes);
  }

  get extendsClip(): boolean {
    return this.start < 0 || this.end > this.lastClipFrame;
  }

  withExtension(earliest: number, latest: number): RefineRange {
    if (!Number.isSafeInteger(earliest) || !Number.isSafeInteger(latest) || earliest > 0 || latest < this.lastClipFrame
      || this.start < earliest || this.end > latest) {
      throw new Error('Extension limits must include the clip and the staged range.');
    }
    return new RefineRange(this.start, this.end, this.clipFrameCount, Object.freeze({ earliest, latest }));
  }

  unreachableReason(frame: number): RefineRangeRefusal | null {
    if (frame >= this.earliestReachable && frame <= this.latestReachable) return null;
    return this.extension ? 'beyond-extension' : 'outside-clip';
  }

  nearestReachable(frame: number): number {
    return Math.min(this.latestReachable, Math.max(this.earliestReachable, frame));
  }

  private get earliestReachable(): number {
    return this.extension?.earliest ?? 0;
  }

  private get latestReachable(): number {
    return this.extension?.latest ?? this.lastClipFrame;
  }

  withStart(frame: number): RefineRangeChange {
    const unreachable = this.unreachableReason(frame);
    if (unreachable) return RefineRange.refused(unreachable);
    if (frame > this.end) return RefineRange.refused('start-after-end');
    return Object.freeze({ kind: 'changed', range: new RefineRange(frame, this.end, this.clipFrameCount, this.extension) });
  }

  withEnd(frame: number): RefineRangeChange {
    const unreachable = this.unreachableReason(frame);
    if (unreachable) return RefineRange.refused(unreachable);
    if (frame < this.start) return RefineRange.refused('end-before-start');
    return Object.freeze({ kind: 'changed', range: new RefineRange(this.start, frame, this.clipFrameCount, this.extension) });
  }

  private static refused(reason: RefineRangeRefusal): RefineRangeChange {
    return Object.freeze({ kind: 'refused', reason });
  }
}
