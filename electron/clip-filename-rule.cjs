const path = require('node:path');
const { VideoFilenames } = require('./video-filenames.cjs');

class ClipFilenameRule {
  #videoFilenames = new VideoFilenames();

  isPlainVideoFilename(filename) {
    return typeof filename === 'string' && path.basename(filename) === filename && this.#videoFilenames.isVideo(filename);
  }
}

module.exports = { ClipFilenameRule };
