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

export class FrameReviewWire {
  static record(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`${label} must be an object.`);
    }
    return value as Record<string, unknown>;
  }

  static safeInteger(value: unknown, label: string): number {
    if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer.`);
    return value as number;
  }

  static nonnegativeInteger(value: unknown, label: string): number {
    const parsed = this.safeInteger(value, label);
    if (parsed < 0) throw new Error(`${label} must not be negative.`);
    return parsed;
  }

  static decimalBigInt(value: unknown, label: string): bigint {
    if (typeof value !== 'string' || !/^-?\d+$/.test(value)) {
      throw new Error(`${label} must be a decimal integer string.`);
    }
    return BigInt(value);
  }

  static nonemptyString(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${label} must be a nonempty string.`);
    }
    return value;
  }
}

export class SourceFrameIdentity {
  static fromWire(value: unknown): ISourceFrameIdentity {
    const record = FrameReviewWire.record(value, 'frame identity');
    const identity = {
      frameIndex: FrameReviewWire.nonnegativeInteger(record.frameIndex, 'frameIndex'),
      originalFrameIndex: FrameReviewWire.nonnegativeInteger(record.originalFrameIndex, 'originalFrameIndex'),
      pts: FrameReviewWire.decimalBigInt(record.pts, 'pts'),
      duration: FrameReviewWire.decimalBigInt(record.duration, 'duration'),
      timebaseNumerator: FrameReviewWire.decimalBigInt(record.timebaseNumerator, 'timebaseNumerator'),
      timebaseDenominator: FrameReviewWire.decimalBigInt(record.timebaseDenominator, 'timebaseDenominator'),
      frameInfoPts: FrameReviewWire.decimalBigInt(record.frameInfoPts, 'frameInfoPts'),
      frameInfoHash: FrameReviewWire.nonemptyString(record.frameInfoHash, 'frameInfoHash'),
    };
    if (identity.timebaseNumerator <= 0n || identity.timebaseDenominator <= 0n) {
      throw new Error('Frame identity timebase must be positive.');
    }
    return Object.freeze(identity);
  }

  static timeUs(identity: Pick<ISourceFrameIdentity, 'pts' | 'timebaseNumerator' | 'timebaseDenominator'>): bigint {
    return identity.pts * identity.timebaseNumerator * 1_000_000n / identity.timebaseDenominator;
  }
}
