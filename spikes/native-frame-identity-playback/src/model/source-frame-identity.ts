export interface ISourceFrameIdentity {
  readonly frameIndex: number;
  readonly originalFrameIndex: number;
  readonly pts: bigint;
  readonly duration: bigint;
  readonly timebaseNumerator: bigint;
  readonly timebaseDenominator: bigint;
  readonly frameInfoPts: bigint;
  readonly frameInfoHash: string;
}

export function sourceFrameIdentityFromWire(value: unknown): ISourceFrameIdentity {
  const record = objectRecord(value, 'frame identity');
  const identity = {
    frameIndex: safeInteger(record.frameIndex, 'frameIndex'),
    originalFrameIndex: safeInteger(record.originalFrameIndex, 'originalFrameIndex'),
    pts: decimalBigInt(record.pts, 'pts'),
    duration: decimalBigInt(record.duration, 'duration'),
    timebaseNumerator: decimalBigInt(record.timebaseNumerator, 'timebaseNumerator'),
    timebaseDenominator: decimalBigInt(record.timebaseDenominator, 'timebaseDenominator'),
    frameInfoPts: decimalBigInt(record.frameInfoPts, 'frameInfoPts'),
    frameInfoHash: nonemptyString(record.frameInfoHash, 'frameInfoHash'),
  };
  if (identity.timebaseNumerator <= 0n || identity.timebaseDenominator <= 0n) {
    throw new Error('Frame identity timebase must be positive.');
  }
  return Object.freeze(identity);
}

export function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function safeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer.`);
  return value as number;
}

export function decimalBigInt(value: unknown, label: string): bigint {
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) {
    throw new Error(`${label} must be a decimal integer string.`);
  }
  return BigInt(value);
}

export function nonemptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a nonempty string.`);
  return value;
}

export function sourceFrameTimeUs(identity: ISourceFrameIdentity): bigint {
  return identity.pts * identity.timebaseNumerator * 1_000_000n / identity.timebaseDenominator;
}
