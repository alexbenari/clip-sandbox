const path = require('path');
const { NativeProductLocator } = require('./native-product-locator.cjs');

const TOOLS_ROOT = path.join(__dirname, '..', 'tools', 'frame-review', '.deps');
const MANIFEST_PATH = path.join(TOOLS_ROOT, 'resolved-dependencies.json');

function resolveFfmpegBinary(options = {}) {
  return (options.locator || new NativeProductLocator(options)).ffmpeg();
}

module.exports = {
  resolveFfmpegBinary,
  TOOLS_ROOT,
  MANIFEST_PATH,
};

