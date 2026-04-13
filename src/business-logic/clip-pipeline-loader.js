import { buildCollectionInventory } from './load-collection-inventory.js';
import { materializeCollectionContent } from './load-collection.js';

export class ClipPipelineLoader {
  async loadPipeline({
    folderName = '',
    files = [],
    validator,
    logInvalidDescription,
    nextClipId,
  } = {}) {
    const buildResult = await buildCollectionInventory({
      folderName,
      files,
      validator,
      logInvalidDescription,
    });
    const { inventory } = buildResult;
    const initialCollectionContent = inventory.defaultCollection();
    inventory.setActiveCollection(initialCollectionContent);

    return {
      ...buildResult,
      inventory,
      initialCollectionContent,
      materialization: this.materializeCollectionContent({
        inventory,
        collectionContent: initialCollectionContent,
        nextClipId,
      }),
    };
  }

  loadCollectionByRef({
    inventory,
    collectionRef,
    nextClipId,
  } = {}) {
    if (!inventory || !collectionRef) return null;
    const collectionContent = inventory.getCollectionByRef(collectionRef);
    if (!collectionContent) return null;
    return {
      collectionContent,
      materialization: this.materializeCollectionContent({
        inventory,
        collectionContent,
        nextClipId,
      }),
    };
  }

  materializeCollectionContent({
    inventory,
    collectionContent,
    nextClipId,
  } = {}) {
    if (!inventory || !collectionContent || !nextClipId) return null;
    return materializeCollectionContent({
      content: collectionContent,
      availableVideoFiles: inventory.videoFiles(),
      nextClipId,
    });
  }
}
