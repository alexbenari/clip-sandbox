export interface IPreparedReviewMetadata {
  readonly cacheKey: string;
  readonly cacheHit: boolean;
  readonly frameCount: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly durationUs: bigint;
}

export class PreparedReviewMetadata {
  static fromWire(value: unknown): IPreparedReviewMetadata {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Prepared review metadata must be an object.');
    }
    const record = value as Record<string, unknown>;
    if (typeof record.cacheKey !== 'string' || !/^[a-f0-9]{64}$/.test(record.cacheKey)) {
      throw new Error('Prepared review cache key is invalid.');
    }
    if (typeof record.cacheHit !== 'boolean') throw new Error('Prepared review cacheHit must be boolean.');
    const frameCount = Number(record.frameCount);
    const sourceWidth = Number(record.sourceWidth);
    const sourceHeight = Number(record.sourceHeight);
    if (![frameCount, sourceWidth, sourceHeight].every((item) => Number.isSafeInteger(item) && item > 0)) {
      throw new Error('Prepared review dimensions and frame count must be positive integers.');
    }
    if (typeof record.durationUs !== 'string' || !/^\d+$/.test(record.durationUs)) {
      throw new Error('Prepared review duration must be a decimal integer string.');
    }
    return Object.freeze({
      cacheKey: record.cacheKey,
      cacheHit: record.cacheHit,
      frameCount,
      sourceWidth,
      sourceHeight,
      durationUs: BigInt(record.durationUs),
    });
  }
}
