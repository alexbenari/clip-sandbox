const fs = require('fs');
const path = require('path');

const TOOLS_ROOT = path.join(__dirname, '..', 'tools', 'ffmpeg');
const MANIFEST_PATH = path.join(TOOLS_ROOT, 'current-binary.json');

function platformKey() {
  return `${process.platform}-${process.arch}`;
}

function resolveFfmpegBinary() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const relativePath = manifest?.platforms?.[platformKey()];
  if (!relativePath) {
    const error = new Error(`No ffmpeg binary is configured for ${platformKey()}.`);
    error.code = 'missing-binary';
    throw error;
  }

  const absolutePath = path.resolve(TOOLS_ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    const error = new Error(`Configured ffmpeg binary was not found at ${absolutePath}.`);
    error.code = 'missing-binary';
    throw error;
  }
  return absolutePath;
}

module.exports = {
  resolveFfmpegBinary,
  TOOLS_ROOT,
  MANIFEST_PATH,
};

