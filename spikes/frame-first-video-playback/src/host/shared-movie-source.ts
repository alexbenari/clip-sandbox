import type { IFramePosition, ISharedMovieSource } from '../contracts/types';
import { buildMovieFrameIndex } from '../indexing/movie-frame-index';

export class SharedMovieSourceModel {
  private currentSource: ISharedMovieSource | null = null;

  private handoffPosition: IFramePosition | null = null;

  getSource(): ISharedMovieSource | null {
    return this.currentSource;
  }

  getHandoffPosition(): IFramePosition | null {
    return this.handoffPosition;
  }

  async setSource(file: File): Promise<ISharedMovieSource> {
    if (this.currentSource) {
      URL.revokeObjectURL(this.currentSource.objectUrl);
    }

    const frameIndex = await buildMovieFrameIndex(file);
    this.currentSource = {
      file,
      label: file.name,
      objectUrl: URL.createObjectURL(file),
      size: file.size,
      lastModified: file.lastModified,
      frameIndex,
    };
    this.handoffPosition = null;
    return this.currentSource;
  }

  setHandoffPosition(position: IFramePosition | null): void {
    this.handoffPosition = position
      ? {
          frameIndex: position.frameIndex,
          timestampMs: position.timestampMs,
          durationMs: position.durationMs,
          keyframe: position.keyframe,
        }
      : null;
  }

  dispose(): void {
    if (this.currentSource) {
      URL.revokeObjectURL(this.currentSource.objectUrl);
      this.currentSource = null;
    }
    this.handoffPosition = null;
  }
}
