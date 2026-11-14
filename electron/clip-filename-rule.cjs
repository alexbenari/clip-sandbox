const path = require('node:path');
const { isVideoFilename } = require('./folder-entry.cjs');

class ClipFilenameRule {
  isPlainVideoFilename(filename) {
    return typeof filename === 'string' && path.basename(filename) === filename && isVideoFilename(filename);
  }
}

module.exports = { ClipFilenameRule };
