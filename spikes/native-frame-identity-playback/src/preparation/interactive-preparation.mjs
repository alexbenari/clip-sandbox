import { access, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  buildPreparationCacheKey,
  createPreparationWorkspace,
  loadPreparationEntry,
  publishPreparationWorkspace,
} from './preparation-cache.mjs';
import { PreparationCoordinator } from './preparation-coordinator.mjs';
import { PreparationProgressTracker } from './preparation-progress.mjs';
import {
  buildSampledPreparationIdentity,
  sampledContentSignaturesMatch,
} from './sampled-content-signature.mjs';
import { executeStreaming } from '../tooling/process.mjs';

const INDEX_OPTIONS = Object.freeze({ decoderInstances: 2, seekPreroll: 20, maxCacheBytes: 268_435_456 });

export class InteractivePreparationService {
  #activeController = null;

  constructor(configuration) {
    this.configuration = assertConfiguration(configuration);
  }

  cancel() {
    this.#activeController?.abort();
  }

  async prepare(sourcePath, emit = () => {}) {
    this.cancel();
    const controller = new AbortController();
    this.#activeController = controller;
    try {
      const source = await validateSourceFile(sourcePath);
      emit({ type: 'preparation-phase', phase: 'cache-validation', message: 'Checking prepared review cache' });
      const signature = await this.#sampleSource(source, controller.signal);
      const identity = buildSampledPreparationIdentity(signature, {
        bestSourceVersion: this.configuration.bestSourceVersion,
        ffmpegVersion: this.configuration.ffmpegVersion,
        indexingOptions: INDEX_OPTIONS,
      });
      let prepared = await loadPreparationEntry(this.configuration.cacheRoot, identity);
      if (prepared && !sampledContentSignaturesMatch(prepared.manifest.sourceSignature, signature)) {
        prepared = null;
      }
      if (prepared) {
        const result = this.#result(source, prepared, true);
        emit({ type: 'preparation-ready', cacheHit: true, reviewAssetKind: result.reviewAssetKind });
        return result;
      }
      prepared = await this.#loadLegacyPrepared(source, signature, identity);
      if (prepared) {
        const result = this.#result(source, prepared, true);
        emit({ type: 'preparation-ready', cacheHit: true, legacyCacheMigrated: true,
          reviewAssetKind: result.reviewAssetKind });
        return result;
      }

      const cacheKey = buildPreparationCacheKey(identity);
      const workspace = await createPreparationWorkspace(this.configuration.cacheRoot, cacheKey);
      const evidence = { sourceScan: null, reviewScan: null, policy: null };
      let reviewFilename = 'review.mkv';
      try {
        const coordinator = new PreparationCoordinator({
          scan: async (movie, { signal } = {}) => {
            const phase = movie === source ? 'preflight' : 'review-preflight';
            const scan = await this.#scan(movie, phase, emit, signal);
            if (movie === source) evidence.sourceScan = scan;
            else evidence.reviewScan = scan;
            return scan;
          },
          normalize: async (movie, { signal, policy } = {}) => {
            reviewFilename = policy.normalizationContainer === 'nut' ? 'review.nut' : 'review.mkv';
            const reviewAsset = path.join(workspace.temporaryPath, reviewFilename);
            await this.#normalize(movie, reviewAsset, signature.durationUs, emit, signal);
            return { reviewAsset };
          },
          index: async (movie, { signal, policy } = {}) => {
            evidence.policy = policy;
            const indexed = await this.#index(movie, workspace.index, emit, signal);
            return { index: workspace.index, numFrames: indexed.numFrames };
          },
          publish: async (candidate) => publishPreparationWorkspace(workspace, {
            schemaVersion: 2,
            cacheKey,
            identity,
            sourceSignature: signature,
            sourceScan: evidence.sourceScan,
            policy: evidence.policy,
            sourcePath: source,
            reviewAssetKind: evidence.policy.action === 'normalize-timestamps' ? 'normalized-copy' : 'source',
            reviewAsset: reviewFilename,
            reviewPacketPayloadDigest: evidence.reviewScan?.packetPayloadDigest ?? evidence.sourceScan.packetPayloadDigest,
            index: 'index',
            indexTrack: evidence.reviewScan?.streamIndex ?? evidence.sourceScan.streamIndex,
            preparedAtUtc: new Date().toISOString(),
            numFrames: candidate.numFrames,
          }),
          cleanup: async () => rm(workspace.temporaryPath, { recursive: true, force: true }),
        }, (event) => {
          if (event.type === 'preparation-policy') evidence.policy = event;
        });
        prepared = await coordinator.prepare({ source, signal: controller.signal });
        const result = this.#result(source, prepared, false);
        emit({ type: 'preparation-ready', cacheHit: false, reviewAssetKind: result.reviewAssetKind });
        return result;
      } catch (error) {
        await rm(workspace.temporaryPath, { recursive: true, force: true });
        throw error;
      }
    } finally {
      if (this.#activeController === controller) this.#activeController = null;
    }
  }

  async #sampleSource(source, signal) {
    const events = [];
    await executeStreaming(this.configuration.sampleSignature, [source, '--compact'], {
      env: this.configuration.environment,
      signal,
      timeoutMs: 10 * 60_000,
      maxBuffer: 4 * 1024 * 1024,
      onStdoutLine: (line) => events.push(parseJsonLine(line)),
    });
    const signature = events.find((event) => event.type === 'sampled-packet-signature');
    if (!signature) throw new Error('Sample signature tool produced no result.');
    return signature;
  }

  async #loadLegacyPrepared(source, signature, identity) {
    const candidate = this.configuration.legacyPrepared.find((entry) =>
      path.resolve(entry.sourcePath ?? '') === source && entry.status === 'complete');
    if (!candidate || !candidate.sourceScan || candidate.sourceScan.sourceBytes !== signature.sourceBytes ||
        candidate.sourceScan.streamIndex !== signature.streamIndex || candidate.sourceScan.codec !== signature.codec) {
      return null;
    }
    const indexPath = path.resolve(candidate.index ?? '');
    const entryPath = path.dirname(indexPath);
    const relative = path.relative(path.resolve(this.configuration.cacheRoot), entryPath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
    try {
      const legacyManifest = JSON.parse(await readFile(path.join(entryPath, 'manifest.json'), 'utf8'));
      const legacyIdentity = legacyManifest.identity ?? {};
      if (legacyIdentity.bestSourceVersion !== identity.bestSourceVersion ||
          legacyIdentity.ffmpegVersion !== identity.ffmpegVersion ||
          JSON.stringify(legacyIdentity.indexingOptions) !== JSON.stringify(identity.indexingOptions)) return null;
      await access(`${indexPath}.${candidate.sourceScan.streamIndex}.bsindex`);
      await access(candidate.reviewAsset);
      const sidecarPath = path.join(entryPath, 'sampled-signature-v1.json');
      let sidecar = null;
      try {
        sidecar = JSON.parse(await readFile(sidecarPath, 'utf8'));
      } catch (error) {
        if (!isOptionalLegacyCacheMiss(error)) throw error;
      }
      if (sidecar && (!sampledContentSignaturesMatch(sidecar.sourceSignature, signature) ||
          JSON.stringify(sidecar.identity) !== JSON.stringify(identity))) return null;
      if (!sidecar) {
        await writeFile(sidecarPath, `${JSON.stringify({ schemaVersion: 1, sourceSignature: signature, identity }, null, 2)}\n`, 'utf8');
      }
      return {
        cacheKey: candidate.cacheKey,
        entryPath,
        reviewAsset: path.resolve(candidate.reviewAsset),
        index: indexPath,
        manifest: {
          sourceSignature: signature,
          policy: candidate.policy,
          reviewAssetKind: candidate.reviewAssetKind,
          numFrames: candidate.numFrames,
        },
      };
    } catch (error) {
      if (isOptionalLegacyCacheMiss(error)) return null;
      throw error;
    }
  }

  async #scan(source, phase, emit, signal) {
    const events = [];
    const tracker = progressTracker(phase, emit);
    await executeStreaming(this.configuration.packetScanner, [source, '--progress'], {
      env: this.configuration.environment,
      signal,
      timeoutMs: 30 * 60_000,
      maxBuffer: 64 * 1024 * 1024,
      onStdoutLine: (line) => {
        const event = parseJsonLine(line);
        events.push(event);
        if (event.type === 'packet-scan-progress') tracker.update(event.currentBytes, event.totalBytes);
      },
    });
    tracker.complete();
    const scan = events.find((event) => event.type === 'packet-scan');
    if (!scan) throw new Error('Packet scanner produced no result.');
    return scan;
  }

  async #normalize(source, destination, durationUs, emit, signal) {
    const tracker = progressTracker('normalization', emit);
    await executeStreaming(this.configuration.ffmpeg, [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-fflags', '+genpts', '-i', source,
      '-map', '0:v:0', '-map', '0:a?', '-map_metadata', '0', '-c', 'copy',
      '-avoid_negative_ts', 'make_non_negative', '-progress', 'pipe:1', '-nostats', destination,
    ], {
      env: this.configuration.environment,
      signal,
      timeoutMs: 60 * 60_000,
      maxBuffer: 64 * 1024 * 1024,
      onStdoutLine: (line) => {
        const [key, value] = splitKeyValue(line);
        if (key === 'out_time_us') tracker.update(Number(value), Math.max(1, durationUs));
      },
    });
    tracker.complete();
  }

  async #index(source, index, emit, signal) {
    const tracker = progressTracker('indexing', emit);
    const events = [];
    await executeStreaming(this.configuration.bestSourceHarness, ['probe', source, index, '0'], {
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
      throw new Error('BestSource produced no valid indexed source metadata.');
    }
    return { numFrames: sourceEvent.numFrames };
  }

  #result(source, prepared, cacheHit) {
    return Object.freeze({
      cacheKey: prepared.cacheKey,
      sourcePath: source,
      reviewAssetPath: prepared.reviewAsset,
      indexPath: prepared.index,
      cacheHit,
      reviewAssetKind: prepared.manifest.reviewAssetKind,
      policy: prepared.manifest.policy,
      numFrames: prepared.manifest.numFrames ?? null,
      durationUs: prepared.manifest.sourceSignature?.durationUs ?? null,
    });
  }
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

async function validateSourceFile(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new Error('Selected movie path is invalid.');
  const resolved = path.resolve(value);
  const details = await stat(resolved);
  if (!details.isFile()) throw new Error('Selected movie is not a file.');
  return resolved;
}

function assertConfiguration(value) {
  if (!value || typeof value !== 'object') throw new Error('Preparation configuration is required.');
  for (const field of ['cacheRoot', 'sampleSignature', 'packetScanner', 'ffmpeg', 'bestSourceHarness',
    'bestSourceVersion', 'ffmpegVersion']) {
    if (typeof value[field] !== 'string' || !value[field]) {
      throw new Error(`Preparation configuration is missing ${field}.`);
    }
  }
  return Object.freeze({
    ...value,
    legacyPrepared: Object.freeze([...(value.legacyPrepared ?? [])]),
    environment: Object.freeze({ ...(value.environment ?? process.env) }),
  });
}

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    throw new Error(`Native preparation tool emitted invalid JSON: ${line.slice(0, 160)}`);
  }
}

function isOptionalLegacyCacheMiss(error) {
  return error instanceof SyntaxError || error?.code === 'ENOENT' || error?.code === 'ENOTDIR';
}

function splitKeyValue(line) {
  const separator = line.indexOf('=');
  return separator < 0 ? [line, ''] : [line.slice(0, separator), line.slice(separator + 1)];
}
