const path = require('path');

const VIDEO_EXT_TO_MIME = new Map([
  ['.mp4', 'video/mp4'],
  ['.m4v', 'video/mp4'],
  ['.mov', 'video/quicktime'],
  ['.webm', 'video/webm'],
  ['.ogv', 'video/ogg'],
  ['.avi', 'video/x-msvideo'],
  ['.mkv', 'video/x-matroska'],
  ['.mpg', 'video/mpeg'],
  ['.mpeg', 'video/mpeg'],
]);

class VideoFilenames {
  isVideo(filename) {
    return VIDEO_EXT_TO_MIME.has(this.#extension(filename));
  }

  mimeType(filename) {
    return VIDEO_EXT_TO_MIME.get(this.#extension(filename)) || '';
  }

  #extension(filename) {
    return path.extname(filename).toLowerCase();
  }
}

module.exports = { VideoFilenames };
