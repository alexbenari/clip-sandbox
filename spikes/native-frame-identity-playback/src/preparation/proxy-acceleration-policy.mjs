import {
  buildProxyEncodingArgs,
} from './all-intra-proxy-preparation.mjs';
import { buildQsvDecodeProxyArgs } from './ffmpeg-hardware-diagnostic.mjs';
import {
  FallbackReviewProxyEncoder,
  FfmpegCliReviewProxyEncoder,
  PolicyReviewProxyEncoder,
} from './review-proxy-encoder.mjs';
import { executeStreaming } from '../tooling/process.mjs';

const QSV_BACKEND_ID = 'ffmpeg-qsv-large-hevc-v1';

export function chooseProxyAcceleration(source) {
  assertSource(source);
  const measuredClass = source.codec === 'hevc' && source.width >= 3000 && source.height >= 1400 &&
    ['yuv420p', 'yuv420p10le'].includes(source.pixelFormat);
  return Object.freeze(measuredClass
    ? { backend: 'qsv-decode-scale', reason: 'large-hevc' }
    : { backend: 'software', reason: 'qsv-not-beneficial-for-source-class' });
}

export function proxyTargetSize(source, maximumWidth) {
  if (!source || !Number.isSafeInteger(source.width) || source.width < 2 ||
      !Number.isSafeInteger(source.height) || source.height < 2 ||
      !Number.isSafeInteger(maximumWidth) || maximumWidth < 2) {
    throw new Error('Proxy acceleration source dimensions are invalid.');
  }
  const width = Math.min(maximumWidth, source.width);
  const evenWidth = Math.max(2, width - width % 2);
  const height = Math.max(2, Math.round(source.height * evenWidth / source.width / 2) * 2);
  return Object.freeze({ width: evenWidth, height });
}

export function createHardwareAwareReviewProxyEncoder(configuration) {
  assertConfiguration(configuration);
  const environment = Object.freeze({ ...(configuration.environment ?? process.env) });
  const software = new FfmpegCliReviewProxyEncoder({
    executable: configuration.softwareFfmpeg,
    environment,
    buildArguments: ({ source, destination, profile, audioStreamOrdinal }) =>
      buildProxyEncodingArgs(source, destination, profile, audioStreamOrdinal),
  });
  const accelerated = new FfmpegCliReviewProxyEncoder({
    id: QSV_BACKEND_ID,
    executable: configuration.acceleratedFfmpeg,
    environment,
    buildArguments: async ({ source, destination, profile, audioStreamOrdinal, accelerationContext, signal }) => {
      const metadata = accelerationContext ??
        await inspectSource(configuration.ffprobe, source, environment, signal);
      const target = proxyTargetSize(metadata, profile.maxWidth);
      return buildQsvDecodeProxyArgs(source, destination, profile, audioStreamOrdinal, {
        startSeconds: 0,
        durationSeconds: null,
        sourceCodec: metadata.codec,
        targetWidth: target.width,
        targetHeight: target.height,
      });
    },
  });
  const acceleratedWithFallback = new FallbackReviewProxyEncoder(accelerated, software);
  return new PolicyReviewProxyEncoder({
    software,
    accelerated: acceleratedWithFallback,
    select: async ({ source, signal }) => {
      const metadata = await inspectSource(configuration.ffprobe, source, environment, signal);
      const decision = chooseProxyAcceleration(metadata);
      return { accelerated: decision.backend === 'qsv-decode-scale', context: metadata };
    },
  });
}

async function inspectSource(ffprobe, source, environment, signal) {
  const { stdout } = await executeStreaming(ffprobe, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height,pix_fmt', '-of', 'json', source,
  ], { env: environment, signal, timeoutMs: 60_000, maxBuffer: 2 * 1024 * 1024 });
  const stream = JSON.parse(stdout.replace(/^\uFEFF/, '')).streams?.[0];
  return {
    codec: stream?.codec_name,
    width: Number(stream?.width),
    height: Number(stream?.height),
    pixelFormat: stream?.pix_fmt,
  };
}

function assertSource(value) {
  if (!value || typeof value.codec !== 'string' || !value.codec ||
      !Number.isSafeInteger(value.width) || value.width < 2 ||
      !Number.isSafeInteger(value.height) || value.height < 2 ||
      typeof value.pixelFormat !== 'string' || !value.pixelFormat) {
    throw new Error('Proxy acceleration source metadata is invalid.');
  }
}

function assertConfiguration(value) {
  if (!value || typeof value !== 'object') throw new Error('Proxy acceleration configuration is required.');
  for (const field of ['softwareFfmpeg', 'acceleratedFfmpeg', 'ffprobe']) {
    if (typeof value[field] !== 'string' || !value[field]) {
      throw new Error(`Proxy acceleration configuration is missing ${field}.`);
    }
  }
}
