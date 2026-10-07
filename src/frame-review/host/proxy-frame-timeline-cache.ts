import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { IExactReviewProxyEntry } from './exact-review-proxy-cache.js';
import type { FrameIndexCache } from './frame-index-cache.js';

export interface IProxyFrameTimeline {
  readonly cacheKey: string;
  readonly pts: readonly bigint[];
  readonly timebaseNumerator: bigint;
  readonly timebaseDenominator: bigint;
  readonly durationPts: bigint | null;
}

export class ProxyFrameTimelineCache {
  constructor(private readonly frameIndexCache: FrameIndexCache) {}

  ensure(entry: IExactReviewProxyEntry, signal?: AbortSignal): Promise<IProxyFrameTimeline> {
    return this.loadOrCreate(entry, signal);
  }

  private async loadOrCreate(entry: IExactReviewProxyEntry, signal?: AbortSignal): Promise<IProxyFrameTimeline> {
    const timelinePath = path.join(path.dirname(entry.manifestPath), 'loop-timeline-v1.json');
    try {
      const cached: unknown = JSON.parse(await readFile(timelinePath, 'utf8'));
      return this.parse(cached, entry);
    } catch (error) {
      if (signal?.aborted) throw this.abortError();
      if (error instanceof Error && error.name === 'AbortError') throw error;
    }

    const indexed = await this.frameIndexCache.timeline(entry.proxyPath, entry.proxyIndexPath, signal);
    const durationPts = /^-?\d+$/.test(indexed.duration) && BigInt(indexed.duration) > BigInt(indexed.pts.at(-1) ?? '0')
      ? indexed.duration : null;
    const record = {
      schemaVersion: 1,
      cacheKey: entry.cacheKey,
      frameCount: indexed.frameCount,
      timebaseNumerator: indexed.timebaseNumerator,
      timebaseDenominator: indexed.timebaseDenominator,
      durationPts,
      pts: indexed.pts,
    };
    const timeline = this.parse(record, entry);
    const temporaryPath = path.join(path.dirname(timelinePath), `.loop-timeline-${randomUUID()}.tmp`);
    try {
      await writeFile(temporaryPath, `${JSON.stringify(record)}\n`, 'utf8');
      if (signal?.aborted) throw this.abortError();
      await rename(temporaryPath, timelinePath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
    return timeline;
  }

  private parse(value: unknown, entry: IExactReviewProxyEntry): IProxyFrameTimeline {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Proxy timeline is invalid.');
    const record = value as Record<string, unknown>;
    if (record.schemaVersion !== 1 || record.cacheKey !== entry.cacheKey || record.frameCount !== entry.frameCount
      || !Array.isArray(record.pts) || record.pts.length !== entry.frameCount) {
      throw new Error('Proxy timeline does not match the prepared proxy.');
    }
    const numerator = this.integer(record.timebaseNumerator);
    const denominator = this.integer(record.timebaseDenominator);
    if (numerator <= 0n || denominator <= 0n) throw new Error('Proxy timeline timebase is invalid.');
    let previous: bigint | null = null;
    const pts = record.pts.map((raw: unknown) => {
      const current = this.integer(raw);
      if (current === -(1n << 63n) || (previous !== null && current <= previous)) {
        throw new Error('Proxy timeline PTS is absent or unordered.');
      }
      previous = current;
      return current;
    });
    const durationPts = record.durationPts === null ? null : this.integer(record.durationPts);
    if (durationPts !== null && durationPts <= pts[pts.length - 1]) {
      throw new Error('Proxy timeline final duration is invalid.');
    }
    return Object.freeze({
      cacheKey: entry.cacheKey,
      pts: Object.freeze(pts),
      timebaseNumerator: numerator,
      timebaseDenominator: denominator,
      durationPts,
    });
  }

  private integer(value: unknown): bigint {
    if (typeof value !== 'string' || !/^-?\d+$/.test(value)) throw new Error('Proxy timeline integer is invalid.');
    const parsed = BigInt(value);
    if (parsed < -(1n << 63n) || parsed > (1n << 63n) - 1n) {
      throw new Error('Proxy timeline integer is outside signed 64-bit range.');
    }
    return parsed;
  }

  private abortError(): Error {
    const error = new Error('Proxy timeline preparation was cancelled.');
    error.name = 'AbortError';
    return error;
  }
}
