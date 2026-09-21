import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { BackendError } from '../model/backend-error.js';
import type { IExactReviewProxyIdentity } from './exact-review-proxy-cache.js';
import type { FrameReviewPaths } from './frame-review-paths.js';

export interface IPlaybackProxyWorkspace {
  readonly cacheKey: string;
  readonly temporaryDirectory: string;
  readonly proxyFile: string;
  readonly normalizedSourceFile: string;
}

export interface IPlaybackProxyBuildResult {
  readonly workspace: IPlaybackProxyWorkspace;
  readonly normalizedSource: boolean;
}

export interface IPlaybackProxyEntry {
  readonly cacheKey: string;
  readonly cacheHit: boolean;
  readonly proxyPath: string;
  readonly normalizedSourcePath: string | null;
}

interface IPlaybackProxyManifest {
  readonly schemaVersion: 1;
  readonly cacheKey: string;
  readonly identity: IExactReviewProxyIdentity;
  readonly proxy: string;
  readonly normalizedSource: string | null;
}

interface IActivePlaybackProxyWriter {
  readonly controller: AbortController;
  readonly promise: Promise<IPlaybackProxyEntry>;
  consumers: number;
  settled: boolean;
}

export class PlaybackProxyCache {
  private readonly activeWriters = new Map<string, IActivePlaybackProxyWriter>();

  constructor(private readonly paths: FrameReviewPaths) {}

  async getOrCreate(
    identity: IExactReviewProxyIdentity,
    cacheKey: string,
    build: (workspace: IPlaybackProxyWorkspace, writerSignal: AbortSignal) => Promise<IPlaybackProxyBuildResult>,
    consumerSignal?: AbortSignal,
  ): Promise<IPlaybackProxyEntry> {
    this.throwIfAborted(consumerSignal);
    const cached = await this.load(identity, cacheKey);
    this.throwIfAborted(consumerSignal);
    if (cached) return cached;
    let active = this.activeWriters.get(cacheKey);
    if (!active) {
      const controller = new AbortController();
      const promise = this.buildAndPublish(identity, cacheKey, workspace => build(workspace, controller.signal), controller.signal)
        .finally(() => {
          const completed = this.activeWriters.get(cacheKey);
          if (completed) completed.settled = true;
          this.activeWriters.delete(cacheKey);
        });
      active = { controller, promise, consumers: 0, settled: false };
      this.activeWriters.set(cacheKey, active);
    }
    return this.joinWriter(active, consumerSignal);
  }

  private async buildAndPublish(
    identity: IExactReviewProxyIdentity,
    cacheKey: string,
    build: (workspace: IPlaybackProxyWorkspace) => Promise<IPlaybackProxyBuildResult>,
    signal: AbortSignal,
  ): Promise<IPlaybackProxyEntry> {
    await rm(this.entryPath(cacheKey), { recursive: true, force: true });
    const workspace = await this.createWorkspace(cacheKey);
    try {
      const result = await build(workspace);
      this.throwIfAborted(signal);
      if (result.workspace !== workspace) throw new Error('Playback-proxy builder returned an unexpected workspace.');
      const manifest: IPlaybackProxyManifest = Object.freeze({
        schemaVersion: 1,
        cacheKey,
        identity,
        proxy: 'proxy.mkv',
        normalizedSource: result.normalizedSource ? 'normalized.mkv' : null,
      });
      await writeFile(path.join(workspace.temporaryDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      this.throwIfAborted(signal);
      await rename(workspace.temporaryDirectory, this.entryPath(cacheKey));
      const published = await this.load(identity, cacheKey);
      if (!published) throw new Error('Playback-proxy publication did not validate.');
      return Object.freeze({ ...published, cacheHit: false });
    } catch (error) {
      await rm(workspace.temporaryDirectory, { recursive: true, force: true });
      throw this.cacheError(error);
    }
  }

  private async createWorkspace(cacheKey: string): Promise<IPlaybackProxyWorkspace> {
    try {
      await mkdir(this.paths.playbackProxyCache, { recursive: true });
      const prefix = `.partial-${cacheKey}-`;
      const entries = await readdir(this.paths.playbackProxyCache, { withFileTypes: true });
      await Promise.all(entries.filter(entry => entry.isDirectory() && entry.name.startsWith(prefix))
        .map(entry => rm(path.join(this.paths.playbackProxyCache, entry.name), { recursive: true, force: true })));
      const temporaryDirectory = path.join(this.paths.playbackProxyCache, `${prefix}${process.pid}-${randomUUID()}`);
      await mkdir(temporaryDirectory);
      return Object.freeze({
        cacheKey,
        temporaryDirectory,
        proxyFile: path.join(temporaryDirectory, 'proxy.mkv'),
        normalizedSourceFile: path.join(temporaryDirectory, 'normalized.mkv'),
      });
    } catch (error) {
      throw this.cacheError(error);
    }
  }

  private async load(identity: IExactReviewProxyIdentity, cacheKey: string): Promise<IPlaybackProxyEntry | null> {
    const directory = this.entryPath(cacheKey);
    try {
      const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')) as Partial<IPlaybackProxyManifest>;
      if (manifest.schemaVersion !== 1 || manifest.cacheKey !== cacheKey
        || this.stableStringify(manifest.identity) !== this.stableStringify(identity)
        || manifest.proxy !== 'proxy.mkv' || (manifest.normalizedSource !== null && manifest.normalizedSource !== 'normalized.mkv')) return null;
      const proxyPath = path.join(directory, manifest.proxy);
      const normalizedSourcePath = manifest.normalizedSource === null ? null : path.join(directory, manifest.normalizedSource);
      await Promise.all([access(proxyPath), ...(normalizedSourcePath ? [access(normalizedSourcePath)] : [])]);
      return Object.freeze({ cacheKey, cacheHit: true, proxyPath, normalizedSourcePath });
    } catch (error) {
      if (error instanceof SyntaxError || (error as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
      throw this.cacheError(error);
    }
  }

  private entryPath(cacheKey: string): string {
    if (!/^[a-f0-9]{64}$/.test(cacheKey)) throw new Error('Playback-proxy cache key is invalid.');
    return path.join(this.paths.playbackProxyCache, cacheKey);
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(item => this.stableStringify(item)).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value as object).sort().map(key =>
      `${JSON.stringify(key)}:${this.stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
    return JSON.stringify(value);
  }

  private joinWriter(writer: IActivePlaybackProxyWriter, signal?: AbortSignal): Promise<IPlaybackProxyEntry> {
    writer.consumers += 1;
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (settle: () => void): void => {
        if (finished) return;
        finished = true;
        signal?.removeEventListener('abort', onAbort);
        writer.consumers -= 1;
        if (writer.consumers === 0 && !writer.settled) writer.controller.abort();
        settle();
      };
      const onAbort = (): void => finish(() => reject(this.abortError()));
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) { onAbort(); return; }
      writer.promise.then(entry => finish(() => resolve(entry)), (error: unknown) => finish(() => reject(error)));
    });
  }

  private throwIfAborted(signal?: AbortSignal): void { if (signal?.aborted) throw this.abortError(); }

  private abortError(): Error {
    const error = new Error('Playback proxy preparation was cancelled.');
    error.name = 'AbortError';
    return error;
  }

  private cacheError(error: unknown): Error {
    if (error instanceof BackendError) return error;
    if ((error as { name?: unknown } | null)?.name === 'AbortError') return this.abortError();
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS' || code === 'ENOTDIR' || code === 'EEXIST') {
      return new BackendError('cache-unavailable', 'Playback-proxy cache under the application folder is not writable.', false);
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}
