const path = require('node:path');
const { isVideoFilename } = require('./folder-entry.cjs');

const WINDOWS_INVALID_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f]/;
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

class ClipFilenameRule {
  isPlainVideoFilename(filename) {
    return typeof filename === 'string' && path.basename(filename) === filename && isVideoFilename(filename);
  }

  isCreatableVideoFilename(filename) {
    if (!this.isPlainVideoFilename(filename)) return false;
    const stem = path.basename(filename, path.extname(filename));
    return this.#hasNoOuterSpaces(filename) && !WINDOWS_INVALID_CHARACTERS.test(filename)
      && !this.#endsInDotOrSpace(stem) && !this.#isReservedDeviceName(stem);
  }

  #hasNoOuterSpaces(filename) {
    return filename.trim() === filename;
  }

  #endsInDotOrSpace(stem) {
    return /[. ]$/.test(stem);
  }

  // Windows treats con.mp4 and con.final.mp4 alike as the device.
  #isReservedDeviceName(stem) {
    return WINDOWS_RESERVED_NAME.test(stem.split('.')[0]);
  }
}

module.exports = { ClipFilenameRule };
