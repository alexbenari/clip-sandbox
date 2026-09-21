import { NativeCommandProcess } from './native-process-client.js';

export interface IFrameIndexResult {
  readonly frameCount: number;
  readonly duration: string;
}

export class BestSourceFrameIndexer {
  constructor(
    private readonly executable: string,
    private readonly process = new NativeCommandProcess(),
  ) {}

  async index(sourcePath: string, indexPath: string, signal?: AbortSignal): Promise<IFrameIndexResult> {
    const events: Array<Record<string, unknown>> = [];
    await this.process.run(this.executable, ['probe', sourcePath, indexPath, '0'], {
      signal,
      timeoutMs: 3 * 60 * 60_000,
      onStdoutLine: (line) => events.push(JSON.parse(line) as Record<string, unknown>),
    });
    const source = events.find((event) => event.type === 'source');
    const frameCount = Number(source?.numFrames);
    if (!Number.isSafeInteger(frameCount) || frameCount < 1 || typeof source?.duration !== 'string') {
      throw new Error('BestSource produced no valid indexed source metadata.');
    }
    return Object.freeze({ frameCount, duration: source.duration });
  }
}
