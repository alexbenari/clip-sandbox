const path = require('node:path');
const { Mp4Provenance } = require('./clip-provenance/mp4-provenance.cjs');
const { isVideoFilename } = require('./folder-entry.cjs');

const MAX_CLIPS_PER_REQUEST = 20_000;
const CONCURRENT_READS = 4;

class ClipSourceMovieRuntime {
  constructor({ folderAccess, provenance = new Mp4Provenance() }) {
    this.folderAccess = folderAccess;
    this.provenance = provenance;
  }

  async read(event, request) {
    const folder = this.folderAccess.requireKnownPath(event.sender, request?.folderPath);
    const filenames = this.validFilenames(request?.filenames);
    const clips = await this.readClipsInOrder(folder, filenames);
    const unreadable = clips.filter(clip => clip.kind === 'unreadable').length;
    if (unreadable > 0) console.warn('[clip-source-movies] unreadable', { count: unreadable });
    return { clips };
  }

  async readClipsInOrder(folder, filenames) {
    const clips = new Array(filenames.length);
    let next = 0;
    const readNext = async () => {
      while (next < filenames.length) {
        const index = next++;
        clips[index] = await this.clipSourceMovie(folder, filenames[index]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENT_READS, filenames.length) }, readNext));
    return clips;
  }

  async clipSourceMovie(folder, filename) {
    if (!this.provenance.canBeTagged(filename)) return { filename, kind: 'none' };
    try {
      const record = await this.provenance.read(path.join(folder, filename));
      return record
        ? { filename, kind: 'movie', movieFileName: record.sourceMovie.displayName }
        : { filename, kind: 'none' };
    } catch {
      return { filename, kind: 'unreadable' };
    }
  }

  validFilenames(filenames) {
    if (!Array.isArray(filenames) || filenames.length > MAX_CLIPS_PER_REQUEST
      || !filenames.every(filename => this.isPlainVideoFilename(filename))) {
      throw new Error('Clip source movie request is invalid.');
    }
    return filenames;
  }

  isPlainVideoFilename(filename) {
    return typeof filename === 'string' && path.basename(filename) === filename
      && filename !== '.' && filename !== '..' && isVideoFilename(filename);
  }
}

module.exports = { ClipSourceMovieRuntime };
