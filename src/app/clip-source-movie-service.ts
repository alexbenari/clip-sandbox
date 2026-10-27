import type { SourceMovie } from '../domain/source-movie.js';
import type { FolderAccess } from './folder-access.js';

export interface IClipSourceMovieService {
  readClips(folder: FolderAccess, clipNames: readonly string[]): Promise<ClipSourceMovieReport>;
}

export class ClipSourceMovieReport {
  readonly #moviesByClipName: ReadonlyMap<string, SourceMovie | null>;

  constructor(moviesByClipName: ReadonlyMap<string, SourceMovie | null>, readonly unreadableCount: number) {
    this.#moviesByClipName = new Map(moviesByClipName);
    Object.freeze(this);
  }

  clipNames(): string[] {
    return [...this.#moviesByClipName.keys()];
  }

  sourceMovieOf(clipName: string): SourceMovie | null {
    return this.#moviesByClipName.get(clipName) ?? null;
  }
}
