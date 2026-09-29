export interface ISourceFingerprint {
  readonly fingerprintVersion: 1;
  readonly sourceSampleDigest: string;
  readonly sourceBytes: string;
  readonly sourceDurationUs: string;
  readonly signatureProfileVersion: string;
  readonly selectedStream: number;
  readonly streamMetadataDigest: string;
}

export class SourceFingerprint {
  static fromInspection(value: Omit<ISourceFingerprint, 'fingerprintVersion'>): ISourceFingerprint {
    return this.parse({ fingerprintVersion: 1, ...value });
  }

  static parse(value: unknown): ISourceFingerprint {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Movie fingerprint must be an object.');
    const record = value as Record<string, unknown>;
    if (record.fingerprintVersion !== 1) throw new Error('Movie fingerprint version is unsupported.');
    const digest = (field: string): string => {
      const item = record[field];
      if (typeof item !== 'string' || !/^[a-f0-9]{64}$/.test(item)) throw new Error(`${field} must be a SHA-256 digest.`);
      return item;
    };
    const decimal = (field: string): string => {
      const item = record[field];
      if (typeof item !== 'string' || !/^(0|[1-9]\d{0,19})$/.test(item)) throw new Error(`${field} must be a bounded decimal integer.`);
      return item;
    };
    if (typeof record.signatureProfileVersion !== 'string'
      || !/^[a-zA-Z0-9._-]{1,100}$/.test(record.signatureProfileVersion)) {
      throw new Error('Sampling profile version is invalid.');
    }
    if (!Number.isSafeInteger(record.selectedStream) || (record.selectedStream as number) < 0) {
      throw new Error('Selected video stream is invalid.');
    }
    return Object.freeze({
      fingerprintVersion: 1,
      sourceSampleDigest: digest('sourceSampleDigest'),
      sourceBytes: decimal('sourceBytes'),
      sourceDurationUs: decimal('sourceDurationUs'),
      signatureProfileVersion: record.signatureProfileVersion,
      selectedStream: record.selectedStream as number,
      streamMetadataDigest: digest('streamMetadataDigest'),
    });
  }

  static same(left: ISourceFingerprint, right: ISourceFingerprint): boolean {
    return left.fingerprintVersion === right.fingerprintVersion
      && left.sourceSampleDigest === right.sourceSampleDigest
      && left.sourceBytes === right.sourceBytes
      && left.sourceDurationUs === right.sourceDurationUs
      && left.signatureProfileVersion === right.signatureProfileVersion
      && left.selectedStream === right.selectedStream
      && left.streamMetadataDigest === right.streamMetadataDigest;
  }
}
