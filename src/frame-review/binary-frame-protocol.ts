import { BackendError } from './model/backend-error.js';
import { FrameReviewWireValue } from './model/source-frame-identity.js';

const MAGIC = Buffer.from('FVSP', 'ascii');
export const FRAME_REVIEW_PROTOCOL_VERSION = 1;
export const FRAME_REVIEW_WIRE_HEADER_BYTES = 16;
export const FRAME_REVIEW_MAXIMUM_METADATA_BYTES = 1024 * 1024;
export const FRAME_REVIEW_MAXIMUM_PAYLOAD_BYTES = 256 * 1024 * 1024;

export interface IBinaryProtocolMessage {
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly payload: Buffer;
}

export class BinaryFrameProtocol {
  static encode(metadata: Readonly<Record<string, unknown>>, payload = Buffer.alloc(0)): Buffer {
    const encodedMetadata = Buffer.from(JSON.stringify(metadata), 'utf8');
    if (encodedMetadata.length === 0 || encodedMetadata.length > FRAME_REVIEW_MAXIMUM_METADATA_BYTES) {
      throw new BackendError('protocol-error', 'Protocol metadata length is invalid.', false);
    }
    if (payload.length > FRAME_REVIEW_MAXIMUM_PAYLOAD_BYTES) {
      throw new BackendError('protocol-error', 'Protocol payload length is invalid.', false);
    }
    const header = Buffer.alloc(FRAME_REVIEW_WIRE_HEADER_BYTES);
    MAGIC.copy(header, 0);
    header.writeUInt16LE(FRAME_REVIEW_PROTOCOL_VERSION, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt32LE(encodedMetadata.length, 8);
    header.writeUInt32LE(payload.length, 12);
    return Buffer.concat([header, encodedMetadata, payload]);
  }
}

export class BinaryFrameProtocolParser {
  private readonly chunks: Buffer[] = [];
  private headOffset = 0;
  private bufferedBytes = 0;

  push(chunk: Buffer | Uint8Array): IBinaryProtocolMessage[] {
    const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (next.length > 0) { this.chunks.push(next); this.bufferedBytes += next.length; }
    const messages: IBinaryProtocolMessage[] = [];
    while (this.bufferedBytes >= FRAME_REVIEW_WIRE_HEADER_BYTES) {
      const header = this.peek(FRAME_REVIEW_WIRE_HEADER_BYTES);
      this.validateHeader(header);
      const metadataLength = header.readUInt32LE(8);
      const payloadLength = header.readUInt32LE(12);
      if (metadataLength === 0 || metadataLength > FRAME_REVIEW_MAXIMUM_METADATA_BYTES
        || payloadLength > FRAME_REVIEW_MAXIMUM_PAYLOAD_BYTES) {
        throw new BackendError('protocol-error', 'Protocol message declares an invalid length.', false);
      }
      const messageLength = FRAME_REVIEW_WIRE_HEADER_BYTES + metadataLength + payloadLength;
      if (this.bufferedBytes < messageLength) break;
      this.consume(FRAME_REVIEW_WIRE_HEADER_BYTES);
      let metadata: Record<string, unknown>;
      try {
        metadata = FrameReviewWireValue.record(JSON.parse(this.read(metadataLength).toString('utf8')), 'protocol metadata');
      } catch (error) {
        throw new BackendError('protocol-error', `Protocol metadata is invalid JSON: ${String(error)}`, false);
      }
      messages.push(Object.freeze({ metadata: Object.freeze(metadata), payload: this.read(payloadLength) }));
    }
    return messages;
  }

  finish(): void {
    if (this.bufferedBytes !== 0) throw new BackendError('protocol-error', 'Protocol stream ended partially.', false);
  }

  private validateHeader(header: Buffer): void {
    if (!header.subarray(0, 4).equals(MAGIC)) throw new BackendError('protocol-error', 'Protocol magic is invalid.', false);
    if (header.readUInt16LE(4) !== FRAME_REVIEW_PROTOCOL_VERSION) {
      throw new BackendError('protocol-error', 'Protocol version is unsupported.', false);
    }
  }

  private peek(length: number): Buffer {
    const head = this.chunks[0];
    return head && head.length - this.headOffset >= length
      ? head.subarray(this.headOffset, this.headOffset + length)
      : this.copy(length, false);
  }

  private read(length: number): Buffer {
    if (length === 0) return Buffer.alloc(0);
    const head = this.chunks[0];
    if (head && head.length - this.headOffset >= length) {
      const result = head.subarray(this.headOffset, this.headOffset + length);
      this.consume(length);
      return result;
    }
    return this.copy(length, true);
  }

  private copy(length: number, consume: boolean): Buffer {
    const result = Buffer.allocUnsafe(length);
    let copied = 0;
    let chunkIndex = 0;
    let offset = this.headOffset;
    while (copied < length) {
      const chunk = this.chunks[chunkIndex];
      if (!chunk) throw new BackendError('protocol-error', 'Protocol parser underflow.', false);
      const available = Math.min(chunk.length - offset, length - copied);
      chunk.copy(result, copied, offset, offset + available);
      copied += available;
      chunkIndex += 1;
      offset = 0;
    }
    if (consume) this.consume(length);
    return result;
  }

  private consume(length: number): void {
    this.bufferedBytes -= length;
    while (length > 0) {
      const head = this.chunks[0];
      if (!head) throw new BackendError('protocol-error', 'Protocol parser underflow.', false);
      const available = head.length - this.headOffset;
      if (length < available) { this.headOffset += length; return; }
      length -= available;
      this.chunks.shift();
      this.headOffset = 0;
    }
  }
}
