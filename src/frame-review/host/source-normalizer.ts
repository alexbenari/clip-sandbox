import type { ISourceInspection } from './source-inspector.js';
import { NativeCommandProcess } from './native-process-client.js';

export class SourceNormalizer {
  constructor(
    private readonly ffmpegExecutable: string,
    private readonly process = new NativeCommandProcess(),
  ) {}

  async normalizeIfNeeded(
    inspection: ISourceInspection,
    destination: string,
    signal?: AbortSignal,
  ): Promise<Readonly<{ sourcePath: string; normalized: boolean }>> {
    if (!inspection.requiresTimestampNormalization) {
      return Object.freeze({ sourcePath: inspection.sourcePath, normalized: false });
    }
    await this.process.run(this.ffmpegExecutable, [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-fflags', '+genpts',
      '-i', inspection.sourcePath, '-map', '0:v:0', '-map', '0:a?', '-map_metadata', '0',
      '-c', 'copy', '-avoid_negative_ts', 'make_non_negative', destination,
    ], { signal, timeoutMs: 60 * 60_000 });
    return Object.freeze({ sourcePath: destination, normalized: true });
  }
}
