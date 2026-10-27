import { ClipSourceMovieReport, type IClipSourceMovieService } from '../../app/clip-source-movie-service.js';
import type { FolderAccess } from '../../app/folder-access.js';
import { SourceMovie } from '../../domain/source-movie.js';

type ClipSourceMoviesApi = {
  read(request: Readonly<{ folderPath: string; filenames: readonly string[] }>): Promise<unknown>;
};

type ClipSourceMoviesWindow = Window & { clipSandboxDesktop?: { clipSourceMovies?: ClipSourceMoviesApi } };

export class ElectronClipSourceMovieService implements IClipSourceMovieService {
  private readonly api: ClipSourceMoviesApi;

  static tryCreate(win: ClipSourceMoviesWindow = window): ElectronClipSourceMovieService | null {
    return win.clipSandboxDesktop?.clipSourceMovies ? new ElectronClipSourceMovieService(win) : null;
  }

  constructor(win: ClipSourceMoviesWindow = window) {
    const api = win.clipSandboxDesktop?.clipSourceMovies;
    if (!api || typeof api.read !== 'function') throw new Error('Electron clip source movie API is unavailable.');
    this.api = api;
  }

  async readClips(folder: FolderAccess, clipNames: readonly string[]): Promise<ClipSourceMovieReport> {
    const answer = await this.api.read({ folderPath: folder.folderPath, filenames: [...clipNames] });
    const clips = this.answeredClips(answer);
    if (clips.length !== clipNames.length) throw this.invalidAnswer();
    const moviesByClipName = new Map<string, SourceMovie | null>();
    let unreadableCount = 0;
    clips.forEach((clip, index) => {
      if (clip.filename !== clipNames[index]) throw this.invalidAnswer();
      if (clip.kind === 'unreadable') unreadableCount += 1;
      moviesByClipName.set(clip.filename, this.movieFromAnswer(clip));
    });
    return new ClipSourceMovieReport(moviesByClipName, unreadableCount);
  }

  private answeredClips(answer: unknown): Record<string, unknown>[] {
    const clips = this.record(answer).clips;
    if (!Array.isArray(clips)) throw this.invalidAnswer();
    return clips.map(clip => this.record(clip));
  }

  private movieFromAnswer(clip: Record<string, unknown>): SourceMovie | null {
    if (clip.kind === 'none' || clip.kind === 'unreadable') return null;
    if (clip.kind !== 'movie' || typeof clip.movieFileName !== 'string') throw this.invalidAnswer();
    try {
      return SourceMovie.fromFileName(clip.movieFileName);
    } catch {
      throw this.invalidAnswer();
    }
  }

  private record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw this.invalidAnswer();
    return value as Record<string, unknown>;
  }

  private invalidAnswer(): Error {
    return new Error('Clip source movie answer is invalid.');
  }
}
