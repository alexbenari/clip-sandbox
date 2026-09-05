import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { PreparationProgressTracker } from './preparation-progress.mjs';
import { executeStreaming } from '../tooling/process.mjs';
import {
  FfmpegCliReviewProxyEncoder,
  SOFTWARE_FFMPEG_BACKEND_ID,
  assertReviewProxyEncoder,
} from './review-proxy-encoder.mjs';

const MAPPING_VERSION = 'review-proxy-ordinal-v2';

const BASE_REVIEW_PROXY_PROFILE = Object.freeze({
  container: 'matroska',
  videoCodec: 'mpeg4',
  maxWidth: 960,
  quantizer: 5,
  bFrames: 0,
  pixelFormat: 'yuv420p',
  clockTicksPerSecond: 60_000,
  audio: Object.freeze({
    codec: 'aac',
    bitrate: 192_000,
    channels: 2,
    sampleRate: 48_000,
    selection: 'main-stereo-preferred-v1',
  }),
  timing: 'source-relative-monotonic',
});

function reviewProxyProfile(gopSize) {
  return Object.freeze({
    ...BASE_REVIEW_PROXY_PROFILE,
    id: `mpeg4-gop${gopSize}-q5-960-source-clock-aac-v1`,
    gopSize,
  });
}

export const REVIEW_PROXY_PROFILE_GOP_1 = reviewProxyProfile(1);
export const REVIEW_PROXY_PROFILE_GOP_6 = reviewProxyProfile(6);
export const REVIEW_PROXY_PROFILE_GOP_12 = reviewProxyProfile(12);
export const REVIEW_PROXY_PROFILES = Object.freeze([
  REVIEW_PROXY_PROFILE_GOP_1,
  REVIEW_PROXY_PROFILE_GOP_6,
  REVIEW_PROXY_PROFILE_GOP_12,
]);
export const ALL_INTRA_PROXY_PROFILE = REVIEW_PROXY_PROFILE_GOP_1;

export function buildProxyEncodingArgs(
  input,
  output,
  profile = ALL_INTRA_PROXY_PROFILE,
  audioStreamOrdinal = 0,
) {
  if (typeof input !== 'string' || !input || typeof output !== 'string' || !output) {
    throw new Error('Proxy encoding requires input and output paths.');
  }
  const selected = assertProfile(profile);
  if (audioStreamOrdinal !== null &&
      (!Number.isSafeInteger(audioStreamOrdinal) || audioStreamOrdinal < 0 || audioStreamOrdinal > 1024)) {
    throw new Error('Proxy audio stream ordinal must be null or an integer between 0 and 1024.');
  }
  const audio = audioStreamOrdinal === null ? [] : [
    '-map', `0:a:${audioStreamOrdinal}?`,
    '-c:a', selected.audio.codec,
    '-b:a', `${Math.round(selected.audio.bitrate / 1000)}k`,
    '-ac', String(selected.audio.channels),
    '-ar', String(selected.audio.sampleRate),
    '-af', `aresample=${selected.audio.sampleRate}:async=1:first_pts=0,asetpts=PTS-STARTPTS`,
  ];
  return [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-fflags', '+genpts',
    '-i', input,
    '-map', '0:v:0', ...audio, '-map_metadata', '-1', '-sn', '-dn',
    '-vf', `scale=w='min(${selected.maxWidth},iw)':h=-2,settb=1/${selected.clockTicksPerSecond},` +
      "setpts='if(isnan(PREV_OUTPTS),0,max(PTS-STARTPTS,PREV_OUTPTS+1))'",
    '-c:v', selected.videoCodec,
    '-q:v', String(selected.quantizer),
    '-g', String(selected.gopSize),
    '-bf', String(selected.bFrames),
    '-pix_fmt', selected.pixelFormat,
    '-fps_mode', 'passthrough', '-enc_time_base:v', 'filter',
    '-avoid_negative_ts', 'make_non_negative',
    '-progress', 'pipe:1', '-nostats', output,
  ];
}

export function buildProxyPreparationIdentity(canonical, profile, compatibility) {
  assertCanonicalIdentity(canonical);
  const normalizedProfile = assertProfile(profile);
  for (const field of ['bestSourceVersion', 'ffmpegVersion']) {
    if (typeof compatibility?.[field] !== 'string' || !compatibility[field]) {
      throw new Error(`Proxy compatibility is missing ${field}.`);
    }
  }
  return Object.freeze({
    contractVersion: 'review-proxy-preparation-v2',
    canonicalCacheKey: canonical.cacheKey,
    canonicalFrameCount: canonical.numFrames,
    mappingVersion: MAPPING_VERSION,
    profile: normalizedProfile,
    bestSourceVersion: compatibility.bestSourceVersion,
    ffmpegVersion: compatibility.ffmpegVersion,
  });
}

export function selectPreviewAudioStream(streams) {
  if (!Array.isArray(streams)) throw new Error('Audio stream metadata must be an array.');
  const candidates = streams.map((stream, audioOrdinal) => {
    if (!stream || typeof stream !== 'object' || !Number.isSafeInteger(stream.index) || stream.index < 0) {
      throw new Error('Audio stream metadata contains an invalid stream index.');
    }
    const channels = Number.isSafeInteger(stream.channels) && stream.channels > 0 ? stream.channels : 99;
    const title = String(stream.tags?.title ?? '').toLowerCase();
    const disposition = stream.disposition ?? {};
    const secondary = disposition.comment === 1 || disposition.visual_impaired === 1 ||
      disposition.descriptions === 1 || /commentary|description/.test(title);
    const codecRank = ['aac', 'ac3', 'eac3', 'mp3', 'opus', 'vorbis'].indexOf(String(stream.codec_name));
    return {
      audioOrdinal,
      streamIndex: stream.index,
      codec: String(stream.codec_name ?? 'unknown'),
      channels,
      language: String(stream.tags?.language ?? 'und'),
      secondary,
      score: [
        secondary ? 1 : 0,
        channels === 2 ? 0 : channels === 1 ? 1 : 2,
        codecRank < 0 ? 99 : codecRank,
        disposition.default === 1 ? 0 : 1,
        audioOrdinal,
      ],
    };
  });
  candidates.sort((left, right) => compareTuple(left.score, right.score));
  if (candidates.length === 0) return null;
  const { score: _score, ...selected } = candidates[0];
  return Object.freeze(selected);
}

export class AllIntraProxyPreparationService {
  #activeController = null;

  constructor(configuration) {
    this.configuration = assertConfiguration(configuration);
  }

  cancel() {
    this.#activeController?.abort();
  }

  async prepare(canonical, emit = () => {}) {
    this.cancel();
    assertCanonical(canonical);
    const controller = new AbortController();
    this.#activeController = controller;
    const started = performance.now();
    try {
      const identity = buildProxyPreparationIdentity(canonical, this.configuration.profile, {
        bestSourceVersion: this.configuration.bestSourceVersion,
        ffmpegVersion: this.configuration.ffmpegVersion,
      });
      const cacheKey = hashIdentity(identity);
      emit({ type: 'preparation-phase', phase: 'proxy-cache-validation', message: 'Checking review proxy cache' });
      const cached = await loadEntry(this.configuration.cacheRoot, cacheKey, identity);
      if (cached) return result(canonical, cached, true, performance.now() - started);

      const workspace = await createWorkspace(this.configuration.cacheRoot, cacheKey);
      try {
        const selectedAudio = await this.#selectAudio(canonical.reviewAssetPath, controller.signal);
        const encoded = await this.#encode(canonical, workspace.proxyAsset,
          selectedAudio?.audioOrdinal ?? null, emit, controller.signal);
        const indexed = await this.#index(workspace.proxyAsset, workspace.proxyIndex, emit, controller.signal);
        const canonicalTimeline = await this.#probeTimeline(
          canonical.reviewAssetPath, canonical.indexPath, controller.signal);
        const mapping = validateCompleteOrdinalMap(
          canonical.numFrames,
          encoded.frameCount,
          indexed.numFrames,
          canonicalTimeline,
          indexed.timeline,
        );
        emit({
          type: 'preparation-progress',
          phase: 'proxy-validation',
          percent: 100,
          elapsedMs: 0,
          etaMs: 0,
        });
        await writeFile(workspace.frameMap, `${JSON.stringify(mapping, null, 2)}\n`, 'utf8');
        const proxyFile = await stat(workspace.proxyAsset);
        const manifest = {
          schemaVersion: 2,
          cacheKey,
          identity,
          proxyAsset: 'proxy.mkv',
          proxyIndex: 'proxy-index',
          proxyIndexTrack: 0,
          frameMap: 'frame-map.json',
          mapping,
          profile: this.configuration.profile,
          selectedAudio,
          canonicalCacheKey: canonical.cacheKey,
          canonicalFrameCount: canonical.numFrames,
          proxyFrameCount: indexed.numFrames,
          proxyBytes: proxyFile.size,
          encodeMs: encoded.elapsedMs,
          encodingBackendId: encoded.backendId,
          encodingFallbackUsed: encoded.fallbackUsed,
          indexMs: indexed.elapsedMs,
          preparedAtUtc: new Date().toISOString(),
        };
        const entry = await publishWorkspace(workspace, manifest);
        return result(canonical, entry, false, performance.now() - started);
      } catch (error) {
        await rm(workspace.temporaryPath, { recursive: true, force: true });
        throw error;
      }
    } finally {
      if (this.#activeController === controller) this.#activeController = null;
    }
  }

  async #selectAudio(source, signal) {
    const { stdout } = await executeStreaming(this.configuration.ffprobe, [
      '-v', 'error', '-select_streams', 'a',
      '-show_entries',
      'stream=index,codec_name,channels:stream_disposition=default,comment,visual_impaired,descriptions:' +
        'stream_tags=language,title',
      '-of', 'json', source,
    ], {
      env: this.configuration.environment,
      signal,
      timeoutMs: 60_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return selectPreviewAudioStream(JSON.parse(stdout.replace(/^\uFEFF/, '')).streams ?? []);
  }

  async #encode(canonical, destination, audioStreamOrdinal, emit, signal) {
    const tracker = progressTracker('proxy-encoding', emit);
    const encoded = await this.configuration.encodingBackend.encode({
      source: canonical.reviewAssetPath,
      destination,
      profile: this.configuration.profile,
      audioStreamOrdinal,
      durationUs: canonical.durationUs,
      canonicalFrameCount: canonical.numFrames,
      signal,
      onProgress: ({ outTimeUs }) => {
        tracker.update(outTimeUs, Math.max(1, canonical.durationUs ?? 1));
      },
      onAttempt: (attempt) => emit({ type: 'proxy-encoding-attempt', ...attempt }),
    });
    tracker.complete();
    return encoded;
  }

  async #index(source, indexPath, emit, signal) {
    const started = performance.now();
    const tracker = progressTracker('proxy-indexing', emit);
    const events = [];
    await executeStreaming(this.configuration.bestSourceHarness, ['probe', source, indexPath, '0'], {
      env: this.configuration.environment,
      signal,
      timeoutMs: 3 * 60 * 60_000,
      maxBuffer: 128 * 1024 * 1024,
      onStdoutLine: (line) => {
        const event = parseJsonLine(line);
        events.push(event);
        if (event.type === 'index-progress') tracker.update(event.percent, 100);
      },
    });
    tracker.complete();
    const sourceEvent = events.find((event) => event.type === 'source');
    if (!sourceEvent || !Number.isSafeInteger(sourceEvent.numFrames) || sourceEvent.numFrames < 1) {
      throw new Error('BestSource produced no valid proxy metadata.');
    }
    return {
      numFrames: sourceEvent.numFrames,
      elapsedMs: performance.now() - started,
      timeline: timelineFromEvents(sourceEvent, events),
    };
  }

  async #probeTimeline(source, indexPath, signal) {
    const events = [];
    await executeStreaming(this.configuration.bestSourceHarness, ['probe', source, indexPath, '0'], {
      env: this.configuration.environment,
      signal,
      timeoutMs: 60_000,
      maxBuffer: 4 * 1024 * 1024,
      onStdoutLine: (line) => events.push(parseJsonLine(line)),
    });
    const sourceEvent = events.find((event) => event.type === 'source');
    if (!sourceEvent) throw new Error('BestSource produced no canonical timeline metadata.');
    return timelineFromEvents(sourceEvent, events);
  }
}

function validateCompleteOrdinalMap(
  canonicalFrames,
  encodedFrames,
  proxyFrames,
  canonicalTimeline,
  proxyTimeline,
) {
  if (![canonicalFrames, encodedFrames, proxyFrames].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new Error('Proxy mapping requires positive canonical, encoded, and indexed frame counts.');
  }
  if (canonicalFrames !== encodedFrames || canonicalFrames !== proxyFrames) {
    throw new Error(
      `Proxy frame mapping is incomplete: canonical=${canonicalFrames}, encoded=${encodedFrames}, indexed=${proxyFrames}.`);
  }
  return Object.freeze({
    version: MAPPING_VERSION,
    rule: 'proxy-frame-index-equals-canonical-frame-index',
    canonicalFrameCount: canonicalFrames,
    encodedFrameCount: encodedFrames,
    proxyFrameCount: proxyFrames,
    timeLookup: 'proxy-bestsource-time-to-proxy-ordinal',
    identityLookup: 'proxy-ordinal-to-canonical-ordinal',
    canonicalTimeline,
    proxyTimeline,
    complete: true,
  });
}

function result(canonical, entry, cacheHit, totalMs) {
  return Object.freeze({
    cacheKey: entry.manifest.cacheKey,
    cacheHit,
    proxyAssetPath: entry.proxyAsset,
    proxyIndexPath: entry.proxyIndex,
    frameMapPath: entry.frameMap,
    identitySourcePath: canonical.reviewAssetPath,
    identityIndexPath: canonical.indexPath,
    numFrames: entry.manifest.proxyFrameCount,
    profile: assertProfile(entry.manifest.profile),
    mapping: Object.freeze({ ...entry.manifest.mapping }),
    selectedAudio: entry.manifest.selectedAudio ? Object.freeze({ ...entry.manifest.selectedAudio }) : null,
    metrics: Object.freeze({
      cacheHit,
      encodeMs: entry.manifest.encodeMs ?? 0,
      indexMs: entry.manifest.indexMs ?? 0,
      totalMs,
      proxyBytes: entry.manifest.proxyBytes ?? 0,
      canonicalFrameCount: entry.manifest.canonicalFrameCount,
      proxyFrameCount: entry.manifest.proxyFrameCount,
      encodingBackendId: entry.manifest.encodingBackendId ?? SOFTWARE_FFMPEG_BACKEND_ID,
      encodingFallbackUsed: entry.manifest.encodingFallbackUsed ?? false,
    }),
  });
}

async function createWorkspace(cacheRoot, cacheKey) {
  const finalPath = entryPath(cacheRoot, cacheKey);
  await mkdir(path.dirname(finalPath), { recursive: true });
  const temporaryPath = path.join(path.dirname(finalPath), `.partial-${cacheKey}-${process.pid}-${Date.now()}`);
  await mkdir(temporaryPath, { recursive: false });
  return {
    cacheKey,
    temporaryPath,
    finalPath,
    proxyAsset: path.join(temporaryPath, 'proxy.mkv'),
    proxyIndex: path.join(temporaryPath, 'proxy-index'),
    frameMap: path.join(temporaryPath, 'frame-map.json'),
  };
}

async function publishWorkspace(workspace, manifest) {
  await writeFile(path.join(workspace.temporaryPath, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await renameWithRetry(workspace.temporaryPath, workspace.finalPath);
  return resolveEntry(workspace.finalPath, manifest);
}

async function loadEntry(cacheRoot, cacheKey, identity) {
  const location = entryPath(cacheRoot, cacheKey);
  let manifestLoaded = false;
  try {
    const manifest = JSON.parse(await readFile(path.join(location, 'manifest.json'), 'utf8'));
    manifestLoaded = true;
    if (manifest.cacheKey !== cacheKey || stableStringify(manifest.identity) !== stableStringify(identity) ||
        manifest.mapping?.complete !== true) {
      throw new Error('Review proxy cache manifest does not match the requested preparation contract.');
    }
    const entry = resolveEntry(location, manifest);
    await Promise.all([
      access(entry.proxyAsset),
      access(`${entry.proxyIndex}.${manifest.proxyIndexTrack}.bsindex`),
      access(entry.frameMap),
    ]);
    return entry;
  } catch (error) {
    if (!manifestLoaded && error?.code === 'ENOENT') return null;
    throw new Error(`Review proxy cache entry ${cacheKey} is unreadable or incomplete.`, { cause: error });
  }
}

function resolveEntry(location, manifest) {
  return {
    manifest,
    proxyAsset: contained(location, manifest.proxyAsset, 'proxy asset'),
    proxyIndex: contained(location, manifest.proxyIndex, 'proxy index'),
    frameMap: contained(location, manifest.frameMap, 'frame map'),
  };
}

function entryPath(cacheRoot, cacheKey) {
  if (!/^[a-f0-9]{64}$/.test(cacheKey)) throw new Error('Proxy cache key is invalid.');
  const root = path.resolve(cacheRoot);
  const entry = path.resolve(root, cacheKey);
  if (path.dirname(entry) !== root) throw new Error('Proxy cache path escapes its root.');
  return entry;
}

function contained(entry, relative, label) {
  if (typeof relative !== 'string' || path.isAbsolute(relative)) {
    throw new Error(`Proxy ${label} must be relative to its cache entry.`);
  }
  const root = path.resolve(entry);
  const resolved = path.resolve(root, relative);
  if (path.dirname(resolved) !== root) throw new Error(`Proxy ${label} escapes its cache entry.`);
  return resolved;
}

async function renameWithRetry(source, destination) {
  for (let attempt = 0; ; ++attempt) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      if (!['EPERM', 'EACCES'].includes(error?.code) || attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
    }
  }
}

function hashIdentity(identity) {
  return createHash('sha256').update(stableStringify(identity)).digest('hex');
}

function progressTracker(phase, emit) {
  let lastPercent = -1;
  let lastEmittedAt = 0;
  const tracker = new PreparationProgressTracker((event) => {
    const now = Date.now();
    if (event.percent === 0 || event.percent === 100 || event.percent > lastPercent && now - lastEmittedAt >= 200) {
      lastPercent = event.percent;
      lastEmittedAt = now;
      emit(event);
    }
  });
  tracker.begin(phase);
  return tracker;
}

function assertCanonical(value) {
  assertCanonicalIdentity(value);
  if (
      typeof value.reviewAssetPath !== 'string' || !path.isAbsolute(value.reviewAssetPath) ||
      typeof value.indexPath !== 'string' || !path.isAbsolute(value.indexPath)) {
    throw new Error('Canonical prepared review input is invalid.');
  }
}

function assertCanonicalIdentity(value) {
  if (!value || typeof value !== 'object' || !/^[a-f0-9]{64}$/.test(value.cacheKey) ||
      !Number.isSafeInteger(value.numFrames) || value.numFrames < 1) {
    throw new Error('Canonical prepared review identity is invalid.');
  }
}

function assertProfile(value) {
  if (!value || typeof value !== 'object') throw new Error('Proxy profile is required.');
  for (const field of ['id', 'container', 'videoCodec', 'pixelFormat', 'timing']) {
    if (typeof value[field] !== 'string' || !value[field]) throw new Error(`Proxy profile is missing ${field}.`);
  }
  if (!value.audio || typeof value.audio !== 'object') throw new Error('Proxy profile is missing audio.');
  for (const field of ['codec', 'selection']) {
    if (typeof value.audio[field] !== 'string' || !value.audio[field]) {
      throw new Error(`Proxy audio profile is missing ${field}.`);
    }
  }
  for (const field of ['bitrate', 'channels', 'sampleRate']) {
    if (!Number.isSafeInteger(value.audio[field]) || value.audio[field] < 1) {
      throw new Error(`Proxy audio profile has invalid ${field}.`);
    }
  }
  for (const field of ['maxWidth', 'quantizer', 'gopSize', 'bFrames', 'clockTicksPerSecond']) {
    if (!Number.isSafeInteger(value[field]) || value[field] < (field === 'bFrames' ? 0 : 1)) {
      throw new Error(`Proxy profile has invalid ${field}.`);
    }
  }
  if (value.maxWidth > 8192) throw new Error('Proxy profile maximum width exceeds 8192 pixels.');
  if (value.quantizer > 31) throw new Error('Proxy profile quantizer exceeds 31.');
  if (value.clockTicksPerSecond > 65_535) {
    throw new Error('Proxy profile clock exceeds the MPEG-4 Part 2 timebase limit.');
  }
  if (![1, 6, 12].includes(value.gopSize)) throw new Error('Proxy profile has an unsupported GOP size.');
  if (value.bFrames !== 0) {
    throw new Error('Proxy profile must disable B-frames.');
  }
  if (value.timing !== 'source-relative-monotonic') {
    throw new Error('Proxy profile violates the source-relative timing contract.');
  }
  return Object.freeze({ ...value, audio: Object.freeze({ ...value.audio }) });
}

function assertConfiguration(value) {
  if (!value || typeof value !== 'object') throw new Error('Proxy preparation configuration is required.');
  for (const field of ['cacheRoot', 'ffmpeg', 'ffprobe', 'bestSourceHarness',
    'bestSourceVersion', 'ffmpegVersion']) {
    if (typeof value[field] !== 'string' || !value[field]) {
      throw new Error(`Proxy preparation configuration is missing ${field}.`);
    }
  }
  const environment = Object.freeze({ ...(value.environment ?? process.env) });
  const encodingBackend = value.encodingBackend ?? new FfmpegCliReviewProxyEncoder({
    executable: value.ffmpeg,
    environment,
    buildArguments: ({ source, destination, profile, audioStreamOrdinal }) =>
      buildProxyEncodingArgs(source, destination, profile, audioStreamOrdinal),
  });
  return Object.freeze({
    ...value,
    profile: assertProfile(value.profile ?? ALL_INTRA_PROXY_PROFILE),
    environment,
    encodingBackend: assertReviewProxyEncoder(encodingBackend),
  });
}

function timelineFromEvents(sourceEvent, events) {
  const frame = events.find((event) => event.type === 'frame' && event.requestedFrame === 0);
  const timebase = sourceEvent?.timebase;
  if (!frame || !timebase || !Number.isSafeInteger(timebase.numerator) ||
      !Number.isSafeInteger(timebase.denominator) || timebase.numerator <= 0 || timebase.denominator <= 0 ||
      !/^-?\d+$/.test(String(sourceEvent.duration)) || !/^-?\d+$/.test(String(frame.pts))) {
    throw new Error('BestSource produced invalid timeline metadata.');
  }
  return Object.freeze({
    duration: String(sourceEvent.duration),
    timebase: Object.freeze({ numerator: timebase.numerator, denominator: timebase.denominator }),
    firstFramePts: String(frame.pts),
  });
}

function compareTuple(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); ++index) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    throw new Error(`Native proxy tool emitted invalid JSON: ${line.slice(0, 160)}`);
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
