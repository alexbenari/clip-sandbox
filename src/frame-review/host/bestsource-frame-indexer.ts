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
}
