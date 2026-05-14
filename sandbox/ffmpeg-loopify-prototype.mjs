import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createVideoEdit } = require('../electron/video-edit-runtime.cjs');

const sourcePath = process.argv[2];
if (!sourcePath) {
  throw new Error('Usage: node sandbox/ffmpeg-loopify-prototype.mjs <source-clip-path>');
}

const parsed = path.parse(sourcePath);
const result = await createVideoEdit({
  editId: 'loopify',
  outputFolderPath: parsed.dir,
  preferredOutputFilename: `${parsed.name}-looped-prototype.mp4`,
  sourcePath,
});

console.log(JSON.stringify(result, null, 2));

