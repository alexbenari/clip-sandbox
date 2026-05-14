const fs = require('fs/promises');
const path = require('path');
const { pathToFileURL } = require('url');

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

function isTopLevelFile(dirent) {
  return dirent?.isFile?.() === true;
}

async function createFolderEntry(absolutePath) {
  const stat = await fs.stat(absolutePath);
  const name = path.basename(absolutePath);
  const ext = path.extname(name).toLowerCase();
  const entry = {
    name,
    path: absolutePath,
    relativePath: name,
    mediaSource: pathToFileURL(absolutePath).href,
    type: ext === '.txt' ? 'text/plain' : (VIDEO_EXT_TO_MIME.get(ext) || ''),
    lastModifiedMs: stat.mtimeMs,
    size: stat.size,
  };

  if (ext === '.txt') {
    entry.text = await fs.readFile(absolutePath, 'utf8');
  }

  return entry;
}

async function readFolderEntries(folderPath) {
  const dirents = await fs.readdir(folderPath, { withFileTypes: true });
  const fileEntries = dirents.filter(isTopLevelFile);
  const files = [];

  for (const dirent of fileEntries) {
    files.push(await createFolderEntry(path.join(folderPath, dirent.name)));
  }

  return files;
}

module.exports = {
  createFolderEntry,
  readFolderEntries,
};

