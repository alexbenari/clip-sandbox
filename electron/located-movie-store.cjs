const fsPromises = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const SCHEMA_VERSION = 1;
const MAX_FILE_BYTES = 64 * 1024;
const MAX_PATH_LENGTH = 4096;

// Where each movie was last found, by its fingerprint. The paths stay in the main process; a path that no
// longer holds the movie is skipped by the locator's checks.
class LocatedMovieStore {
  #file;
  #fs;
  #movies = null;
  #writing = Promise.resolve();

  static get capacity() {
    return 32;
  }

  constructor(userDataPath, fileSystem = fsPromises) {
    if (!path.isAbsolute(userDataPath)) throw new Error('Located movie store needs an absolute userData path.');
    this.#file = path.join(userDataPath, 'located-movies.json');
    this.#fs = fileSystem;
  }

  async pathOf(fingerprint) {
    return (await this.#loaded()).get(this.#keyOf(fingerprint)) ?? null;
  }

  async remember(fingerprint, moviePath) {
    if (!path.isAbsolute(moviePath) || moviePath.length > MAX_PATH_LENGTH) throw new Error('Located movie path is invalid.');
    const movies = await this.#loaded();
    const key = this.#keyOf(fingerprint);
    const latest = [...movies.keys()].at(-1);
    if (latest === key && movies.get(key) === moviePath) return;
    movies.delete(key);
    movies.set(key, moviePath);
    while (movies.size > LocatedMovieStore.capacity) movies.delete(movies.keys().next().value);
    const snapshot = [...movies].map(([movieKey, location]) => ({ movieKey, path: location }));
    this.#writing = this.#writing.then(() => this.#write(snapshot)).catch(error => {
      console.warn('[source-movie] located-movie-write-failed', { code: error?.code });
    });
    await this.#writing;
  }

  #keyOf(fingerprint) {
    const { fingerprintVersion, sourceSampleDigest, sourceBytes, sourceDurationUs, signatureProfileVersion,
      selectedStream, streamMetadataDigest } = fingerprint;
    return createHash('sha256').update(JSON.stringify([fingerprintVersion, sourceSampleDigest, sourceBytes, sourceDurationUs,
      signatureProfileVersion, selectedStream, streamMetadataDigest])).digest('hex');
  }

  #loaded() {
    this.#movies ??= this.#read();
    return this.#movies;
  }

  // An unreadable file only costs a lookup, so it is read as no remembered movies.
  async #read() {
    let text;
    try {
      text = await this.#fs.readFile(this.#file, 'utf8');
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn('[source-movie] located-movies-unreadable', { code: error?.code });
      return new Map();
    }
    try {
      if (Buffer.byteLength(text, 'utf8') > MAX_FILE_BYTES) throw new Error('Located movies exceed the size limit.');
      return new Map(this.#parsedMovies(JSON.parse(text.replace(/^\uFEFF/, ''))));
    } catch (error) {
      console.warn('[source-movie] located-movies-unreadable', { kind: error instanceof Error ? error.name : 'unknown' });
      return new Map();
    }
  }

  #parsedMovies(document) {
    if (document?.schemaVersion !== SCHEMA_VERSION || !Array.isArray(document.movies)) {
      throw new Error('Located movies schema is unsupported.');
    }
    return document.movies.map(movie => {
      if (typeof movie?.movieKey !== 'string' || !/^[a-f0-9]{64}$/.test(movie.movieKey)
        || typeof movie.path !== 'string' || movie.path.length > MAX_PATH_LENGTH || !path.isAbsolute(movie.path)) {
        throw new Error('Located movie entry is invalid.');
      }
      return [movie.movieKey, movie.path];
    });
  }

  async #write(movies) {
    const folder = path.dirname(this.#file);
    const temporary = path.join(folder, `.located-movies.${randomUUID()}.tmp`);
    await this.#fs.mkdir(folder, { recursive: true });
    try {
      await this.#fs.writeFile(temporary, `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, movies })}\n`, { encoding: 'utf8', flag: 'wx' });
      await this.#fs.rename(temporary, this.#file);
    } catch (error) {
      await this.#fs.rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}

module.exports = { LocatedMovieStore };
