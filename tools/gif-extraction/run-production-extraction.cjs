const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { NativeProductLocator } = require('../../electron/native-product-locator.cjs');

async function main() {
  const [runtimePath, sourcePath, pipelinesRoot, collectionName, startText, endText] = process.argv.slice(2);
  if (!runtimePath || !path.isAbsolute(sourcePath) || !path.isAbsolute(pipelinesRoot)) {
    throw new Error('Runtime oracle arguments are invalid.');
  }
  const runtimeFile = path.resolve(runtimePath);
  const { ClipExtractionRuntime } = require(runtimeFile);
  const { ExactRangeEncoder } = require(path.join(path.dirname(runtimeFile), 'exact-range-encoder.cjs'));
  if (typeof ClipExtractionRuntime !== 'function' || typeof ExactRangeEncoder !== 'function') {
    throw new Error('The selected runtime does not export ClipExtractionRuntime next to ExactRangeEncoder.');
  }
  const projectFolder = path.resolve(__dirname, '..', '..');
  const validityModule = path.join(projectFolder, 'build', 'src', 'domain', 'windows-file-name-validity.js');
  const { WindowsFileNameValidity } = await import(pathToFileURL(validityModule).href);
  const products = new NativeProductLocator({ projectFolder, packaged: false });
  const runtime = new ClipExtractionRuntime({
    getSettings: async () => ({ ok: true, settings: { pipelinesRootPath: pipelinesRoot } }),
    encoder: new ExactRangeEncoder({
      resolveFfmpeg: () => products.ffmpeg(),
      resolveFfprobe: () => products.ffprobe(),
      environment: products.environment(),
    }),
    fileNameValidity: new WindowsFileNameValidity(),
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
