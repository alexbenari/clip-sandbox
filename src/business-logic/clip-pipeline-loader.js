import { buildPipeline } from './load-collection-inventory.js';
import { materializeSource } from './load-collection.js';
import { Pipeline } from '../domain/pipeline.js';
import { normalizeSourceId } from '../domain/source-id.js';

export class ClipPipelineLoader {
  async loadPipeline({
    folderName = '',
    files = [],
    validator,
    logInvalidDescription,
    nextClipId,
  } = {}) {
    const buildResult = await buildPipeline({
      folderName,
      files,
      validator,
      logInvalidDescription,
    });
    const { pipeline } = buildResult;
    const initialSource = pipeline;

    return {
      ...buildResult,
      pipeline,
      initialSource,
      initialSourceId: Pipeline.sourceIdValue(),
      materialization: this.materializeSource({
        pipeline,
        source: initialSource,
        nextClipId,
      }),
    };
  }

  loadSourceById({
    pipeline,
    sourceId,
    nextClipId,
  } = {}) {
    const normalizedSourceId = normalizeSourceId(sourceId);
    if (!pipeline || !normalizedSourceId) return null;
    const source = pipeline.resolveSource(normalizedSourceId);
    if (!source) return null;
    return {
      source,
      materialization: this.materializeSource({
        pipeline,
        source,
        nextClipId,
      }),
    };
  }

  materializeSource({
    pipeline,
    source,
    nextClipId,
  } = {}) {
    return materializeSource({
      pipeline,
      source,
      nextClipId,
    });
  }
}
