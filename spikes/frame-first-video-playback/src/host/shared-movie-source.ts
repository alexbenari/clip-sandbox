import type { FramePosition, SharedMovieSource } from '../contracts/types';
import { buildMovieFrameIndex } from '../indexing/movie-frame-index';

export class SharedMovieSourceModel {
  private currentSource: SharedMovieSource | null = null;

  private handoffPosition: FramePosition | null = null;

  getSource(): SharedMovieSource | null {
    return this.currentSource;
  }

  getHandoffPosition(): FramePosition | null {
    return this.handoffPosition;
  }

  async setSource(file: File): Promise<SharedMovieSource> {
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

  setHandoffPosition(position: FramePosition | null): void {
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
