const fs = require('node:fs/promises');
const path = require('node:path');

class TestRecycleBin {
  #folder;

  constructor(folder) {
    if (typeof folder !== 'string' || !path.isAbsolute(folder)) throw new Error('The test Recycle Bin needs an absolute folder.');
    this.#folder = folder;
  }

  // Each item gets its own folder, so items with the same name are all kept.
  async trashItem(itemPath) {
    await fs.mkdir(this.#folder, { recursive: true });
    const itemFolder = await fs.mkdtemp(path.join(this.#folder, 'item-'));
    await fs.rename(itemPath, path.join(itemFolder, path.basename(itemPath)));
  }
}

module.exports = { TestRecycleBin };
