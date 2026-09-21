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
    if (!path.isAbsolute(sourcePath)) throw new Error('Movie source path must be absolute.');
    const source = path.resolve(sourcePath);
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
    const sourceWidth = Number(stream?.width);
    const sourceHeight = Number(stream?.height);
    if (!Number.isSafeInteger(sourceWidth) || sourceWidth < 1 || !Number.isSafeInteger(sourceHeight) || sourceHeight < 1) {
      throw new Error('FFprobe returned invalid source dimensions.');
    }
    const selectedStream = this.nonnegativeInteger(signature.streamIndex, 'selected stream');
    const identity: IExactReviewProxyIdentity = Object.freeze({
      schemaVersion: 1,
      sourceSampleDigest: this.string(signature.sampleDigest, 'sample digest'),
      sourceBytes: String(this.nonnegativeInteger(signature.sourceBytes, 'source bytes')),
      sourceDurationUs: String(this.nonnegativeInteger(signature.durationUs, 'source duration')),
      signatureProfileVersion: this.string(signature.profileVersion, 'signature profile version'),
      preparationContractVersion: 'prepared-review-v1',
      selectedStream,
      streamMetadataDigest: this.string(signature.streamMetadataDigest, 'stream metadata digest'),
      nativeProtocolVersion: FRAME_REVIEW_PROTOCOL_VERSION,
      bestSourceVersion: this.configuration.bestSourceVersion,
      ffmpegVersion: this.configuration.ffmpegVersion,
      proxyProfileId: FRAME_REVIEW_PROXY_PROFILE_ID,
      frameMapVersion: 'ordinal-identity-v1',
      indexingOptions: Object.freeze({ decoderInstances: 2, seekPreroll: 20, maxCacheBytes: 268_435_456 }),
    });
    return Object.freeze({
      sourcePath: source,
      identity,
      sourceWidth,
      sourceHeight,
      durationUs: identity.sourceDurationUs,
      selectedStream,
      requiresTimestampNormalization: Number(scan.keyPacketCount) > 0 && Number(scan.keyPacketsWithPts) === 0,
    });
  }

  private event(stdout: string, type: string): Record<string, unknown> {
    for (const line of stdout.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const value = JSON.parse(line) as Record<string, unknown>;
      if (value.type === type) return value;
    }
    throw new Error(`Native inspector produced no ${type} result.`);
  }

  private nonnegativeInteger(value: unknown, label: string): number {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label} is invalid.`);
    return number;
  }

  private string(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value) throw new Error(`${label} is invalid.`);
    return value;
  }
}
