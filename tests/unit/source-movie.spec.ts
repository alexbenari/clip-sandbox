// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SourceMovie } from '../../src/domain/source-movie.js';

describe('SourceMovie', () => {
  it('names the movie by its file name without the final extension', () => {
    expect(SourceMovie.fromFileName('Sample Feature.2001.1080p.mkv').name).toBe('Sample Feature.2001.1080p');
  });

  it('drops spaces left before the extension from the movie name', () => {
    expect(SourceMovie.fromFileName('Sample Feature .mkv').name).toBe('Sample Feature');
  });

  it('keeps a file name that has no extension as the movie name', () => {
    expect(SourceMovie.fromFileName('Sample Feature').name).toBe('Sample Feature');
  });

  it('keeps a file name that is only an extension as the movie name', () => {
    expect(SourceMovie.fromFileName('.mkv').name).toBe('.mkv');
  });

  it('keeps the file name it was built from', () => {
    expect(SourceMovie.fromFileName('Sample Feature.mkv').fileName).toBe('Sample Feature.mkv');
  });

  it('refuses an empty file name or one that contains a folder', () => {
    expect(() => SourceMovie.fromFileName('')).toThrow('Source movie file name is invalid.');
    expect(() => SourceMovie.fromFileName('movies\\Sample Feature.mkv')).toThrow('Source movie file name is invalid.');
    expect(() => SourceMovie.fromFileName('movies/Sample Feature.mkv')).toThrow('Source movie file name is invalid.');
  });
});
