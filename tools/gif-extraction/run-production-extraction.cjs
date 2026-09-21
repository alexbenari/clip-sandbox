const path = require('node:path');
const { createClipExtractionRuntime } = require('../../electron/clip-extraction-runtime.cjs');
const { NativeProductLocator } = require('../../electron/native-product-locator.cjs');

async function main() {
  const [runtimePath, sourcePath, pipelinesRoot, collectionName, startText, endText] = process.argv.slice(2);
  if (!runtimePath || !path.isAbsolute(sourcePath) || !path.isAbsolute(pipelinesRoot)) {
    throw new Error('Runtime oracle arguments are invalid.');
  }
  const runtimeModule = require(path.resolve(runtimePath));
  if (typeof runtimeModule.createClipExtractionRuntime !== 'function') {
    throw new Error('The selected runtime does not export createClipExtractionRuntime.');
  }
  const products = new NativeProductLocator({ projectFolder: path.resolve(__dirname, '..', '..'), packaged: false });
  const runtime = runtimeModule.createClipExtractionRuntime({
    getSettings: async () => ({ ok: true, settings: { pipelinesRootPath: pipelinesRoot } }),
    resolveFfmpeg: () => products.ffmpeg(),
    resolveFfprobe: () => products.ffprobe(),
    environment: products.environment(),
  });
  try {
    const destination = await runtime.openDestination(1);
    if (!destination.ok) throw new Error(destination.error?.message || destination.code);
    const result = await runtime.extract(1, {
      prepareExtractionSource: async () => ({ sourcePath, selectedStream: 0 }),
    }, {
      operationId: 'extract_oracle12345678',
      destinationHandle: destination.result.destinationHandle,
      sourceHandle: 'source_oracle12345678',
      sourceGeneration: 1,
      collectionName,
      startFrameIndex: Number(startText),
      endFrameIndex: Number(endText),
    });
    if (!result.ok) throw new Error(result.error?.message || result.code);
    process.stdout.write(JSON.stringify({
      filename: result.result.filename,
      outputPath: path.join(pipelinesRoot, 'extraction-tmp', result.result.filename),
    }));
  } finally {
    await runtime.dispose();
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
