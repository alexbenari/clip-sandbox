import { stat } from 'node:fs/promises';
import path from 'node:path';

import { FRAME_REVIEW_PROTOCOL_VERSION } from '../binary-frame-protocol.js';
import { FRAME_REVIEW_PROXY_PROFILE_ID } from './ffmpeg-proxy-creator.js';
import type { IExactReviewProxyIdentity } from './exact-review-proxy-cache.js';
import { NativeCommandProcess } from './native-process-client.js';

export interface ISourceInspection {
  readonly sourcePath: string;
  readonly identity: IExactReviewProxyIdentity;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly durationUs: string;
  readonly selectedStream: number;
  readonly requiresTimestampNormalization: boolean;
}

// What the native tools report about a movie file; the inspection adds the tool versions it was read with.
export interface ISourceMeasurement {
  readonly sourceSampleDigest: string;
  readonly sourceBytes: string;
  readonly sourceDurationUs: string;
  readonly signatureProfileVersion: string;
  readonly selectedStream: number;
  readonly streamMetadataDigest: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly requiresTimestampNormalization: boolean;
}

export interface ISourceInspectorConfiguration {
  readonly sampleSignatureExecutable: string;
  readonly packetScanExecutable: string;
  readonly ffprobeExecutable: string;
  readonly bestSourceVersion: string;
  readonly ffmpegVersion: string;
  readonly environment?: NodeJS.ProcessEnv;
}

export class SourceInspector {
  private readonly process: NativeCommandProcess;

  constructor(private readonly configuration: ISourceInspectorConfiguration) {
    this.process = new NativeCommandProcess(configuration.environment);
  }

  async inspect(sourcePath: string, signal?: AbortSignal): Promise<ISourceInspection> {
    const source = this.absolutePath(sourcePath);
    return this.inspectionOf(source, await this.measure(source, signal));
  }

  async measure(sourcePath: string, signal?: AbortSignal): Promise<ISourceMeasurement> {
    const source = this.absolutePath(sourcePath);
    const details = await stat(source);
    if (!details.isFile()) throw new Error('Movie source is not a file.');
    const [signatureResult, scanResult, probeResult] = await Promise.all([
      this.process.run(this.configuration.sampleSignatureExecutable, [source, '--compact'], { signal }),
      this.process.run(this.configuration.packetScanExecutable, [source], { signal }),
      this.process.run(this.configuration.ffprobeExecutable, [
        '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', source,
      ], { signal, timeoutMs: 60_000 }),
    ]);
    const signature = this.event(signatureResult.stdout, 'sampled-packet-signature');
    const scan = this.event(scanResult.stdout, 'packet-scan');
    const probe = JSON.parse(probeResult.stdout.replace(/^\uFEFF/, '')) as { streams?: Array<{ width?: number; height?: number }> };
    const stream = probe.streams?.[0];
    return SourceInspector.parseMeasurement({
      sourceSampleDigest: signature.sampleDigest,
      sourceBytes: String(signature.sourceBytes),
      sourceDurationUs: String(signature.durationUs),
      signatureProfileVersion: signature.profileVersion,
      selectedStream: signature.streamIndex,
      streamMetadataDigest: signature.streamMetadataDigest,
      sourceWidth: stream?.width,
      sourceHeight: stream?.height,
      requiresTimestampNormalization: Number(scan.keyPacketCount) > 0 && Number(scan.keyPacketsWithPts) === 0,
    });
  }

  // A rebuilt tool can measure the same movie differently, so a remembered measurement holds only while this matches.
  async toolsVersion(): Promise<string> {
    const { sampleSignatureExecutable, packetScanExecutable, ffprobeExecutable } = this.configuration;
    const versions = await Promise.all([sampleSignatureExecutable, packetScanExecutable, ffprobeExecutable].map(async executable => {
      const { size, mtimeMs } = await stat(executable);
      return `${size}:${mtimeMs}`;
    }));
    return versions.join('|');
  }

  // Measurements come from the native tools or from an earlier app session's cache, so both are checked here.
  static parseMeasurement(value: unknown): ISourceMeasurement {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Source measurement is invalid.');
    const record = value as Record<string, unknown>;
    const sourceWidth = SourceInspector.positiveInteger(record.sourceWidth, 'source width');
    const sourceHeight = SourceInspector.positiveInteger(record.sourceHeight, 'source height');
    if (typeof record.requiresTimestampNormalization !== 'boolean') throw new Error('timestamp normalization is invalid.');
    return Object.freeze({
      sourceSampleDigest: SourceInspector.text(record.sourceSampleDigest, 'sample digest'),
      sourceBytes: SourceInspector.decimal(record.sourceBytes, 'source bytes'),
      sourceDurationUs: SourceInspector.decimal(record.sourceDurationUs, 'source duration'),
      signatureProfileVersion: SourceInspector.text(record.signatureProfileVersion, 'signature profile version'),
      selectedStream: SourceInspector.nonnegativeInteger(record.selectedStream, 'selected stream'),
      streamMetadataDigest: SourceInspector.text(record.streamMetadataDigest, 'stream metadata digest'),
      sourceWidth,
      sourceHeight,
      requiresTimestampNormalization: record.requiresTimestampNormalization,
    });
  }

  inspectionOf(sourcePath: string, measurement: ISourceMeasurement): ISourceInspection {
    const identity: IExactReviewProxyIdentity = Object.freeze({
      schemaVersion: 1,
      sourceSampleDigest: measurement.sourceSampleDigest,
      sourceBytes: measurement.sourceBytes,
      sourceDurationUs: measurement.sourceDurationUs,
      signatureProfileVersion: measurement.signatureProfileVersion,
      preparationContractVersion: 'prepared-review-v1',
      selectedStream: measurement.selectedStream,
      streamMetadataDigest: measurement.streamMetadataDigest,
      nativeProtocolVersion: FRAME_REVIEW_PROTOCOL_VERSION,
      bestSourceVersion: this.configuration.bestSourceVersion,
      ffmpegVersion: this.configuration.ffmpegVersion,
      proxyProfileId: FRAME_REVIEW_PROXY_PROFILE_ID,
      frameMapVersion: 'ordinal-identity-v1',
      indexingOptions: Object.freeze({ decoderInstances: 2, seekPreroll: 20, maxCacheBytes: 268_435_456 }),
    });
    return Object.freeze({
      sourcePath: this.absolutePath(sourcePath),
      identity,
      sourceWidth: measurement.sourceWidth,
      sourceHeight: measurement.sourceHeight,
      durationUs: identity.sourceDurationUs,
      selectedStream: measurement.selectedStream,
      requiresTimestampNormalization: measurement.requiresTimestampNormalization,
    });
  }

  private absolutePath(sourcePath: string): string {
    if (!path.isAbsolute(sourcePath)) throw new Error('Movie source path must be absolute.');
    return path.resolve(sourcePath);
  }

  private event(stdout: string, type: string): Record<string, unknown> {
    for (const line of stdout.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const value = JSON.parse(line) as Record<string, unknown>;
      if (value.type === type) return value;
    }
    throw new Error(`Native inspector produced no ${type} result.`);
  }

  private static nonnegativeInteger(value: unknown, label: string): number {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label} is invalid.`);
    return number;
  }

  private static positiveInteger(value: unknown, label: string): number {
    const number = SourceInspector.nonnegativeInteger(value, label);
    if (number < 1) throw new Error(`${label} is invalid.`);
    return number;
  }

  private static decimal(value: unknown, label: string): string {
    return String(SourceInspector.nonnegativeInteger(value, label));
  }

  private static text(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value) throw new Error(`${label} is invalid.`);
    return value;
  }
}
