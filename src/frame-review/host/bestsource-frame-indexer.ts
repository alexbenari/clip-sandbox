import { NativeCommandProcess } from './native-process-client.js';

export interface IFrameIndexResult {
  readonly frameCount: number;
  readonly duration: string;
}

export interface IFrameTimelineIndexResult extends IFrameIndexResult {
  readonly timebaseNumerator: string;
  readonly timebaseDenominator: string;
  readonly pts: readonly string[];
}

export interface IIndexedFrameTime {
  readonly pts: bigint;
  readonly timebaseNumerator: bigint;
  readonly timebaseDenominator: bigint;
}

export class BestSourceFrameIndexer {
  constructor(
    private readonly executable: string,
    private readonly process = new NativeCommandProcess(),
  ) {}

  async index(
    sourcePath: string,
    indexPath: string,
    signal?: AbortSignal,
    onProgress?: (percent: number) => void,
  ): Promise<IFrameIndexResult> {
    const events: Array<Record<string, unknown>> = [];
    await this.process.run(this.executable, ['probe', sourcePath, indexPath, '0'], {
      signal,
      timeoutMs: 3 * 60 * 60_000,
      onStdoutLine: (line) => {
        const event = JSON.parse(line) as Record<string, unknown>;
        events.push(event);
        if (event.type === 'index-progress') {
          const current = Number(event.current);
          const total = Number(event.total);
          if (Number.isFinite(current) && Number.isFinite(total) && total > 0) {
            onProgress?.(Math.max(0, Math.min(100, current * 100 / total)));
          }
        }
      },
    });
    const source = events.find((event) => event.type === 'source');
    const frameCount = Number(source?.numFrames);
    if (!Number.isSafeInteger(frameCount) || frameCount < 1 || typeof source?.duration !== 'string') {
      throw new Error('BestSource produced no valid indexed source metadata.');
    }
    return Object.freeze({ frameCount, duration: source.duration });
  }

  // Never builds an index: the tool is stopped as soon as it starts indexing.
  async frameTimesFromExistingIndex(
    sourcePath: string,
    indexPath: string,
    frameIndexes: readonly number[],
    signal?: AbortSignal,
  ): Promise<readonly IIndexedFrameTime[] | null> {
    const stop = new AbortController();
    const abortWithCaller = () => stop.abort();
    signal?.addEventListener('abort', abortWithCaller, { once: true });
    let timebase: Readonly<{ numerator: bigint; denominator: bigint }> | null = null;
    const found = new Map<number, IIndexedFrameTime>();
    const wanted = new Set(frameIndexes);
    try {
      await this.process.run(this.executable, ['timeline', sourcePath, indexPath], {
        signal: stop.signal,
        timeoutMs: 60_000,
        captureStdout: false,
        onStdoutLine: (line) => {
          const event = JSON.parse(line) as Record<string, unknown>;
          if (event.type === 'index-progress') stop.abort();
          if (event.type === 'source') timebase = this.timebaseOf(event.timebase);
          if (event.type === 'frame-time' && wanted.has(event.frameIndex as number) && timebase && typeof event.pts === 'string') {
            found.set(event.frameIndex as number, Object.freeze({
              pts: BigInt(event.pts), timebaseNumerator: timebase.numerator, timebaseDenominator: timebase.denominator }));
            if (found.size === wanted.size) stop.abort();
          }
        },
      });
    } catch (error) {
      if (!stop.signal.aborted || signal?.aborted) throw error;
    } finally {
      signal?.removeEventListener('abort', abortWithCaller);
    }
    return found.size === wanted.size ? Object.freeze(frameIndexes.map(frameIndex => found.get(frameIndex)!)) : null;
  }

  async timeline(sourcePath: string, indexPath: string, signal?: AbortSignal): Promise<IFrameTimelineIndexResult> {
    const result: { source: Record<string, unknown> | null; complete: boolean } = { source: null, complete: false };
    const pts: string[] = [];
    await this.process.run(this.executable, ['timeline', sourcePath, indexPath], {
      signal,
      timeoutMs: 3 * 60 * 60_000,
      captureStdout: false,
      onStdoutLine: (line) => {
        const event = JSON.parse(line) as Record<string, unknown>;
        if (event.type === 'source') result.source = event;
        if (event.type === 'frame-time') {
          if (event.frameIndex !== pts.length || typeof event.pts !== 'string') {
            throw new Error('BestSource timeline ordinals are invalid.');
          }
          pts.push(event.pts);
        }
        if (event.type === 'complete') result.complete = true;
      },
    });
    const metadata = result.source;
    const timebase = metadata?.timebase;
    if (!result.complete || !Number.isSafeInteger(metadata?.numFrames) || metadata?.numFrames !== pts.length
      || typeof metadata?.duration !== 'string' || !timebase || typeof timebase !== 'object'
      || Array.isArray(timebase)) {
      throw new Error('BestSource returned an incomplete proxy timeline.');
    }
    const rational = timebase as Record<string, unknown>;
    if (!Number.isSafeInteger(rational.numerator) || !Number.isSafeInteger(rational.denominator)) {
      throw new Error('BestSource returned an invalid proxy timebase.');
    }
    return Object.freeze({
      frameCount: metadata.numFrames as number,
      duration: metadata.duration,
      timebaseNumerator: String(rational.numerator),
      timebaseDenominator: String(rational.denominator),
      pts: Object.freeze(pts),
    });
  }

  private timebaseOf(value: unknown): Readonly<{ numerator: bigint; denominator: bigint }> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const { numerator, denominator } = value as Record<string, unknown>;
    if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)
      || (numerator as number) <= 0 || (denominator as number) <= 0) return null;
    return Object.freeze({ numerator: BigInt(numerator as number), denominator: BigInt(denominator as number) });
  }
}
