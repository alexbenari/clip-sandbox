import { ClipCollectionInventory } from '../domain/clip-collection-inventory.js';
import { getVideosAndCollectionFiles } from './load-clips.js';

export async function buildCollectionInventory({
  folderName = '',
  files = [],
  validator,
  logInvalidDescription,
} = {}) {
  const { videos, collectionFiles } = getVideosAndCollectionFiles(files);
  const validCollectionContents = [];
  const invalidDescriptions = [];

  for (const file of collectionFiles) {
    const result = await validator.parseFile(file);
    if (result.ok) {
      validCollectionContents.push(result.content);
      continue;
    }
    invalidDescriptions.push(result);
    await logInvalidDescription?.(result);
  }

  const inventory = new ClipCollectionInventory({
    folderName,
    videoFiles: videos,
    collectionContents: validCollectionContents,
  });

  return {
    inventory,
    videos,
    collectionFiles,
    validCollectionContents,
    invalidDescriptions,
  };
}
