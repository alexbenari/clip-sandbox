import { Pipeline } from '../domain/pipeline.js';
import { getVideosAndCollectionFiles } from './load-clips.js';

export async function buildPipeline({
  folderName = '',
  files = [],
  validator,
  logInvalidDescription,
} = {}) {
  const { videos, collectionFiles } = getVideosAndCollectionFiles(files);
  const validCollections = [];
  const invalidDescriptions = [];

  for (const file of collectionFiles) {
    const result = await validator.parseFile(file);
    if (result.ok) {
      validCollections.push(result.content);
      continue;
    }
    invalidDescriptions.push(result);
    await logInvalidDescription?.(result);
  }

  const pipeline = new Pipeline({
    folderName,
    videoFiles: videos,
    collections: validCollections,
  });

  return {
    pipeline,
    videos,
    collectionFiles,
    validCollections,
    invalidDescriptions,
  };
}
