// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { ElectronClipSourceMovieService } from '../../src/adapters/electron/electron-clip-source-movie-service.js';

const folder = Object.freeze({ folderPath: 'D:\\clips' });

function serviceAnswering(answer: unknown) {
  const read = vi.fn(async () => answer);
  const win = { clipSandboxDesktop: { clipSourceMovies: { read } } } as unknown as Window;
  return { read, service: new ElectronClipSourceMovieService(win) };
}

describe('ElectronClipSourceMovieService', () => {
  it('asks for the named clips of the open folder', async () => {
    const { read, service } = serviceAnswering({ clips: [{ filename: 'a.mp4', kind: 'none' }] });

    await service.readClips(folder, ['a.mp4']);

    expect(read).toHaveBeenCalledWith({ folderPath: 'D:\\clips', filenames: ['a.mp4'] });
  });

  it('reports each clip\'s source movie and how many clips were unreadable', async () => {
    const { service } = serviceAnswering({ clips: [
      { filename: 'a.mp4', kind: 'movie', movieFileName: 'Sample Feature.mkv' },
      { filename: 'b.mp4', kind: 'none' },
      { filename: 'c.mp4', kind: 'unreadable' },
    ] });

    const report = await service.readClips(folder, ['a.mp4', 'b.mp4', 'c.mp4']);

    expect(report.clipNames()).toEqual(['a.mp4', 'b.mp4', 'c.mp4']);
    expect(report.sourceMovieOf('a.mp4')?.name).toBe('Sample Feature');
    expect(report.sourceMovieOf('b.mp4')).toBeNull();
    expect(report.sourceMovieOf('c.mp4')).toBeNull();
    expect(report.unreadableCount).toBe(1);
  });

  it.each([
    ['no clip list', {}],
    ['a missing clip', { clips: [] }],
    ['a clip answered under another name', { clips: [{ filename: 'other.mp4', kind: 'none' }] }],
    ['an unknown kind', { clips: [{ filename: 'a.mp4', kind: 'maybe' }] }],
    ['a movie without a file name', { clips: [{ filename: 'a.mp4', kind: 'movie', movieFileName: 7 }] }],
    ['a movie file name that contains a folder', { clips: [{ filename: 'a.mp4', kind: 'movie', movieFileName: 'movies\\Sample Feature.mkv' }] }],
  ])('rejects an answer with %s', async (_scenario, answer) => {
    const { service } = serviceAnswering(answer);

    await expect(service.readClips(folder, ['a.mp4'])).rejects.toThrow('Clip source movie answer is invalid.');
  });
});
