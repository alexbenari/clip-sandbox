import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { BackendError } from '../model/backend-error.js';
import type { FrameReviewPaths } from './frame-review-paths.js';

export interface IExactReviewProxyIdentity {
  readonly schemaVersion: 1;
  readonly sourceSampleDigest: string;
  readonly sourceBytes: string;
  readonly sourceDurationUs: string;
  readonly signatureProfileVersion: string;
  readonly preparationContractVersion: 'prepared-review-v1';
  readonly selectedStream: number;
  readonly streamMetadataDigest: string;
  readonly nativeProtocolVersion: number;
  readonly bestSourceVersion: string;
  readonly ffmpegVersion: string;
  readonly proxyProfileId: string;
  readonly frameMapVersion: 'ordinal-identity-v1';
  readonly indexingOptions: Readonly<{
    decoderInstances: number;
    seekPreroll: number;
    maxCacheBytes: number;
  }>;
}

export interface IExactReviewProxyWorkspace {
  readonly cacheKey: string;
  readonly indexTemporaryDirectory: string;
  readonly proxyTemporaryDirectory: string;
  readonly canonicalIndexFile: string;
  readonly proxyFile: string;
  readonly proxyIndexFile: string;
  readonly frameMapFile: string;
  readonly normalizedSourceFile: string;
}

export interface IExactReviewProxyBuildResult {
  readonly workspace: IExactReviewProxyWorkspace;
  readonly frameCount: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly durationUs: string;
  readonly normalizedSource?: boolean;
}

export interface IExactReviewProxyEntry {
  readonly cacheKey: string;
  readonly cacheHit: boolean;
  readonly canonicalIndexPath: string;
  readonly proxyPath: string;
  readonly proxyIndexPath: string;
  readonly frameMapPath: string;
  readonly manifestPath: string;
  readonly frameCount: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly durationUs: string;
  readonly normalizedSourcePath: string | null;
}

interface IExactReviewProxyManifest {
  readonly schemaVersion: 1;
  readonly cacheKey: string;
  readonly identity: IExactReviewProxyIdentity;
  readonly canonicalIndex: string;
  readonly proxy: string;
  readonly proxyIndex: string;
  readonly frameMap: string;
  readonly frameCount: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly durationUs: string;
  readonly normalizedSource: string | null;
  readonly preparedAtUtc: string;
}

interface IActiveExactReviewProxyWriter {
  readonly controller: AbortController;
  promise: Promise<IExactReviewProxyEntry>;
  consumers: number;
  settled: boolean;
}

export class ExactReviewProxyCache {
  private readonly activeWriters = new Map<string, IActiveExactReviewProxyWriter>();

  constructor(private readonly paths: FrameReviewPaths) {}

  async getOrCreate(
    identity: IExactReviewProxyIdentity,
    build: (
      workspace: IExactReviewProxyWorkspace,
      writerSignal: AbortSignal,
    ) => Promise<IExactReviewProxyBuildResult>,
    consumerSignal?: AbortSignal,
  ): Promise<IExactReviewProxyEntry> {
    this.throwIfAborted(consumerSignal);
    const cacheKey = this.cacheKey(identity);
    const cached = await this.load(cacheKey, identity);
    this.throwIfAborted(consumerSignal);
    if (cached) return cached;
    let active = this.activeWriters.get(cacheKey);
    if (!active) {
      const controller = new AbortController();
      const promise = this.buildAndPublish(
        cacheKey,
        identity,
        (workspace) => build(workspace, controller.signal),
        controller.signal,
      ).finally(() => {
        const completed = this.activeWriters.get(cacheKey);
        if (completed) completed.settled = true;
        this.activeWriters.delete(cacheKey);
      });
      active = { controller, promise, consumers: 0, settled: false };
      this.activeWriters.set(cacheKey, active);
    }
    return this.joinWriter(active, consumerSignal);
  }

  find(identity: IExactReviewProxyIdentity): Promise<IExactReviewProxyEntry | null> {
    return this.load(this.cacheKey(identity), identity);
  }

  cacheKey(identity: IExactReviewProxyIdentity): string {
    this.assertIdentity(identity);
    return createHash('sha256').update(this.stableStringify(identity)).digest('hex');
  }

  private async buildAndPublish(
    cacheKey: string,
    identity: IExactReviewProxyIdentity,
    build: (workspace: IExactReviewProxyWorkspace) => Promise<IExactReviewProxyBuildResult>,
    writerSignal: AbortSignal,
  ): Promise<IExactReviewProxyEntry> {
    await this.removeInvalidEntry(cacheKey);
    const workspace = await this.createWorkspace(cacheKey);
    try {
      const result = await build(workspace);
      this.throwIfAborted(writerSignal);
      this.assertBuildResult(result, workspace);
      const manifest: IExactReviewProxyManifest = Object.freeze({
        schemaVersion: 1,
        cacheKey,
        identity,
        canonicalIndex: 'canonical-index',
        proxy: 'proxy.mkv',
        proxyIndex: 'proxy-index',
        frameMap: 'frame-map.json',
        frameCount: result.frameCount,
        sourceWidth: result.sourceWidth,
        sourceHeight: result.sourceHeight,
        durationUs: result.durationUs,
        normalizedSource: result.normalizedSource === true ? 'normalized.mkv' : null,
        preparedAtUtc: new Date().toISOString(),
      });
      await writeFile(path.join(workspace.proxyTemporaryDirectory, 'manifest.json'),
        `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      this.throwIfAborted(writerSignal);
      const indexFinal = this.entryPath(this.paths.frameIndexCache, cacheKey);
      const proxyFinal = this.entryPath(this.paths.exactReviewProxyCache, cacheKey);
      await rename(workspace.indexTemporaryDirectory, indexFinal);
      try {
        await rename(workspace.proxyTemporaryDirectory, proxyFinal);
      } catch (error) {
        await rm(indexFinal, { recursive: true, force: true });
        throw error;
      }
      const published = await this.load(cacheKey, identity);
      if (!published) throw new Error('Exact-review proxy publication did not validate.');
      return Object.freeze({ ...published, cacheHit: false });
    } catch (error) {
      await Promise.all([
        rm(workspace.indexTemporaryDirectory, { recursive: true, force: true }),
        rm(workspace.proxyTemporaryDirectory, { recursive: true, force: true }),
      ]);
      throw this.cacheError(error);
    }
  }

  private async createWorkspace(cacheKey: string): Promise<IExactReviewProxyWorkspace> {
    try {
      await Promise.all([
        mkdir(this.paths.frameIndexCache, { recursive: true }),
        mkdir(this.paths.exactReviewProxyCache, { recursive: true }),
      ]);
      await this.cleanIncompleteWorkspaces(cacheKey);
      const nonce = `${process.pid}-${randomUUID()}`;
      const indexTemporaryDirectory = path.join(this.paths.frameIndexCache, `.partial-${cacheKey}-${nonce}`);
      const proxyTemporaryDirectory = path.join(this.paths.exactReviewProxyCache, `.partial-${cacheKey}-${nonce}`);
      await Promise.all([mkdir(indexTemporaryDirectory), mkdir(proxyTemporaryDirectory)]);
      return Object.freeze({
        cacheKey,
        indexTemporaryDirectory,
        proxyTemporaryDirectory,
        canonicalIndexFile: path.join(indexTemporaryDirectory, 'canonical-index'),
        proxyFile: path.join(proxyTemporaryDirectory, 'proxy.mkv'),
        proxyIndexFile: path.join(proxyTemporaryDirectory, 'proxy-index'),
        frameMapFile: path.join(proxyTemporaryDirectory, 'frame-map.json'),
        normalizedSourceFile: path.join(proxyTemporaryDirectory, 'normalized.mkv'),
      });
    } catch (error) {
      throw this.cacheError(error);
    }
  }

  private async load(cacheKey: string, identity: IExactReviewProxyIdentity): Promise<IExactReviewProxyEntry | null> {
    const indexDirectory = this.entryPath(this.paths.frameIndexCache, cacheKey);
    const proxyDirectory = this.entryPath(this.paths.exactReviewProxyCache, cacheKey);
    const manifestPath = path.join(proxyDirectory, 'manifest.json');
    try {
      const parsed: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
      if (!this.isCompatibleManifest(parsed, cacheKey, identity)) return null;
      const manifest = parsed;
      const canonicalIndexPath = this.contained(indexDirectory, manifest.canonicalIndex);
      const proxyPath = this.contained(proxyDirectory, manifest.proxy);
      const proxyIndexPath = this.contained(proxyDirectory, manifest.proxyIndex);
      const frameMapPath = this.contained(proxyDirectory, manifest.frameMap);
      const requiredFiles = [
        access(`${canonicalIndexPath}.${identity.selectedStream}.bsindex`),
        access(proxyPath),
        access(`${proxyIndexPath}.0.bsindex`),
        access(frameMapPath),
      ];
      if (manifest.normalizedSource !== null) {
        requiredFiles.push(access(this.contained(proxyDirectory, manifest.normalizedSource)));
      }
      await Promise.all(requiredFiles);
      const frameMap = JSON.parse(await readFile(frameMapPath, 'utf8')) as Record<string, unknown>;
      if (frameMap.schemaVersion !== 1 || frameMap.mapping !== 'ordinal-identity'
        || frameMap.frameCount !== manifest.frameCount) return null;
      return Object.freeze({
        cacheKey,
        cacheHit: true,
        canonicalIndexPath,
        proxyPath,
        proxyIndexPath,
        frameMapPath,
        manifestPath,
        frameCount: manifest.frameCount,
        sourceWidth: manifest.sourceWidth,
        sourceHeight: manifest.sourceHeight,
        durationUs: manifest.durationUs,
        normalizedSourcePath: manifest.normalizedSource === null
          ? null : this.contained(proxyDirectory, manifest.normalizedSource),
      });
    } catch (error) {
      if (error instanceof SyntaxError || (error as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
      throw this.cacheError(error);
    }
  }

  private isCompatibleManifest(value: unknown, cacheKey: string, identity: IExactReviewProxyIdentity): value is IExactReviewProxyManifest {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const manifest = value as Partial<IExactReviewProxyManifest>;
    return manifest.schemaVersion === 1
      && manifest.cacheKey === cacheKey
      && this.stableStringify(manifest.identity) === this.stableStringify(identity)
      && typeof manifest.canonicalIndex === 'string'
      && typeof manifest.proxy === 'string'
      && typeof manifest.proxyIndex === 'string'
      && typeof manifest.frameMap === 'string'
      && (manifest.normalizedSource === null || typeof manifest.normalizedSource === 'string')
      && Number.isSafeInteger(manifest.frameCount) && Number(manifest.frameCount) > 0
      && Number.isSafeInteger(manifest.sourceWidth) && Number(manifest.sourceWidth) > 0
      && Number.isSafeInteger(manifest.sourceHeight) && Number(manifest.sourceHeight) > 0
      && typeof manifest.durationUs === 'string' && /^\d+$/.test(manifest.durationUs);
  }

  private entryPath(root: string, cacheKey: string): string {
    if (!/^[a-f0-9]{64}$/.test(cacheKey)) throw new Error('Exact-review proxy cache key is invalid.');
    return path.join(root, cacheKey);
  }

  private async removeInvalidEntry(cacheKey: string): Promise<void> {
    await Promise.all([
      rm(this.entryPath(this.paths.frameIndexCache, cacheKey), { recursive: true, force: true }),
      rm(this.entryPath(this.paths.exactReviewProxyCache, cacheKey), { recursive: true, force: true }),
    ]);
  }

  private async cleanIncompleteWorkspaces(cacheKey: string): Promise<void> {
    const prefix = `.partial-${cacheKey}-`;
    for (const root of [this.paths.frameIndexCache, this.paths.exactReviewProxyCache]) {
      const entries = await readdir(root, { withFileTypes: true });
      await Promise.all(entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
        .map((entry) => rm(path.join(root, entry.name), { recursive: true, force: true })));
    }
  }

  private contained(root: string, relative: string): string {
    if (path.isAbsolute(relative)) throw new Error('Exact-review proxy manifest contains an absolute path.');
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(resolvedRoot, relative);
    if (path.dirname(resolved) !== resolvedRoot) throw new Error('Exact-review proxy manifest escapes its cache entry.');
    return resolved;
  }

  private assertIdentity(identity: IExactReviewProxyIdentity): void {
    if (!identity || identity.schemaVersion !== 1 || !identity.sourceSampleDigest
      || !identity.sourceBytes || !identity.sourceDurationUs || !identity.streamMetadataDigest
      || !identity.signatureProfileVersion || identity.preparationContractVersion !== 'prepared-review-v1'
      || !identity.bestSourceVersion || !identity.ffmpegVersion || !identity.proxyProfileId
      || identity.frameMapVersion !== 'ordinal-identity-v1'
      || !Number.isSafeInteger(identity.selectedStream) || identity.selectedStream < 0
      || identity.nativeProtocolVersion !== 1) {
      throw new Error('Exact-review proxy identity is incomplete or invalid.');
    }
  }

  private assertBuildResult(result: IExactReviewProxyBuildResult, workspace: IExactReviewProxyWorkspace): void {
    if (result.workspace !== workspace || !Number.isSafeInteger(result.frameCount) || result.frameCount < 1
      || !Number.isSafeInteger(result.sourceWidth) || result.sourceWidth < 1
      || !Number.isSafeInteger(result.sourceHeight) || result.sourceHeight < 1
      || !/^\d+$/.test(result.durationUs)) {
      throw new Error('Exact-review proxy builder returned invalid metadata.');
    }
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value as object).sort().map((key) =>
        `${JSON.stringify(key)}:${this.stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  private cacheError(error: unknown): Error {
    if (error instanceof BackendError) return error;
    if ((error as { name?: unknown } | null)?.name === 'AbortError') {
      const cancelled = new Error(error instanceof Error ? error.message : 'Prepared review was cancelled.');
      cancelled.name = 'AbortError';
      return cancelled;
    }
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS' || code === 'ENOTDIR' || code === 'EEXIST') {
      return new BackendError('cache-unavailable',
        'Exact-review proxy cache under the application folder is not writable.', false);
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  private joinWriter(
    writer: IActiveExactReviewProxyWriter,
    consumerSignal?: AbortSignal,
  ): Promise<IExactReviewProxyEntry> {
    writer.consumers += 1;
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (settle: () => void): void => {
        if (finished) return;
        finished = true;
        consumerSignal?.removeEventListener('abort', onAbort);
        writer.consumers -= 1;
        if (writer.consumers === 0 && !writer.settled) writer.controller.abort();
        settle();
      };
      const onAbort = (): void => finish(() => reject(this.abortError()));
      consumerSignal?.addEventListener('abort', onAbort, { once: true });
      if (consumerSignal?.aborted) {
        onAbort();
        return;
      }
      writer.promise.then(
        (entry) => finish(() => resolve(entry)),
        (error: unknown) => finish(() => reject(error)),
      );
    });
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw this.abortError();
  }

  private abortError(): Error {
    const error = new Error('Prepared review was cancelled.');
    error.name = 'AbortError';
    return error;
  }
}
