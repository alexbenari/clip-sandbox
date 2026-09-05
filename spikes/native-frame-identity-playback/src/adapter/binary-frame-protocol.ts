import { BackendError } from '../model/backend-error.js';
import { objectRecord } from '../model/source-frame-identity.js';

const MAGIC = Buffer.from('FVSP', 'ascii');
export const PROTOCOL_VERSION = 1;
export const WIRE_HEADER_BYTES = 16;
export const MAXIMUM_METADATA_BYTES = 1024 * 1024;
export const MAXIMUM_PAYLOAD_BYTES = 256 * 1024 * 1024;

export interface BinaryProtocolMessage {
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly payload: Buffer;
}

export function encodeProtocolMessage(metadata: Readonly<Record<string, unknown>>, payload = Buffer.alloc(0)): Buffer {
  const encodedMetadata = Buffer.from(JSON.stringify(metadata), 'utf8');
  if (encodedMetadata.length === 0 || encodedMetadata.length > MAXIMUM_METADATA_BYTES) {
    throw new BackendError('protocol-error', 'Protocol metadata length is invalid.', false);
  }
  if (payload.length > MAXIMUM_PAYLOAD_BYTES) {
    throw new BackendError('protocol-error', 'Protocol payload length is invalid.', false);
  }
  const header = Buffer.alloc(WIRE_HEADER_BYTES);
  MAGIC.copy(header, 0);
  header.writeUInt16LE(PROTOCOL_VERSION, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt32LE(encodedMetadata.length, 8);
  header.writeUInt32LE(payload.length, 12);
  return Buffer.concat([header, encodedMetadata, payload]);
}

export class BinaryProtocolParser {
  readonly #chunks: Buffer<ArrayBufferLike>[] = [];
  #headOffset = 0;
  #bufferedBytes = 0;

  push(chunk: Buffer | Uint8Array): BinaryProtocolMessage[] {
    const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (next.length > 0) {
      this.#chunks.push(next);
      this.#bufferedBytes += next.length;
    }
    const messages: BinaryProtocolMessage[] = [];
    while (this.#bufferedBytes >= WIRE_HEADER_BYTES) {
      const header = this.#peek(WIRE_HEADER_BYTES);
      this.#validateHeader(header);
      const metadataLength = header.readUInt32LE(8);
      const payloadLength = header.readUInt32LE(12);
      if (metadataLength === 0 || metadataLength > MAXIMUM_METADATA_BYTES ||
          payloadLength > MAXIMUM_PAYLOAD_BYTES) {
        throw new BackendError('protocol-error', 'Protocol message declares an invalid length.', false);
      }
      const messageLength = WIRE_HEADER_BYTES + metadataLength + payloadLength;
      if (this.#bufferedBytes < messageLength) break;
      this.#consume(WIRE_HEADER_BYTES);
      const metadataBytes = this.#read(metadataLength);
      let metadata: Record<string, unknown>;
      try {
        metadata = objectRecord(JSON.parse(metadataBytes.toString('utf8')), 'protocol metadata');
      } catch (error) {
        throw new BackendError('protocol-error', `Protocol metadata is invalid JSON: ${String(error)}`, false);
      }
      const payload = this.#read(payloadLength);
      messages.push(Object.freeze({ metadata: Object.freeze(metadata), payload }));
    }
    if (this.#bufferedBytes > WIRE_HEADER_BYTES + MAXIMUM_METADATA_BYTES + MAXIMUM_PAYLOAD_BYTES) {
      throw new BackendError('protocol-error', 'Buffered protocol data exceeds the maximum message size.', false);
    }
    return messages;
  }

  finish(): void {
    if (this.#bufferedBytes !== 0) {
      throw new BackendError('protocol-error', 'Protocol stream ended with a partial message.', false);
    }
  }

  #validateHeader(header: Buffer): void {
    if (!header.subarray(0, 4).equals(MAGIC)) {
      throw new BackendError('protocol-error', 'Protocol magic is invalid.', false);
    }
    if (header.readUInt16LE(4) !== PROTOCOL_VERSION) {
      throw new BackendError('protocol-error', 'Protocol version is unsupported.', false);
    }
  }

  #peek(length: number): Buffer {
    const head = this.#chunks[0];
    if (head && head.length - this.#headOffset >= length) {
      return head.subarray(this.#headOffset, this.#headOffset + length);
    }
    return this.#copy(length, false);
  }

  #read(length: number): Buffer {
    if (length === 0) return Buffer.alloc(0);
    const head = this.#chunks[0];
    if (head && head.length - this.#headOffset >= length) {
      const result = head.subarray(this.#headOffset, this.#headOffset + length);
      this.#consume(length);
      return result;
    }
    return this.#copy(length, true);
  }

  #copy(length: number, consume: boolean): Buffer {
    const result = Buffer.allocUnsafe(length);
    let copied = 0;
    let chunkIndex = 0;
    let offset = this.#headOffset;
    while (copied < length) {
      const chunk = this.#chunks[chunkIndex];
      if (!chunk) throw new BackendError('protocol-error', 'Protocol parser underflow.', false);
      const available = Math.min(chunk.length - offset, length - copied);
      chunk.copy(result, copied, offset, offset + available);
      copied += available;
      ++chunkIndex;
      offset = 0;
    }
    if (consume) this.#consume(length);
    return result;
  }

  #consume(length: number): void {
    this.#bufferedBytes -= length;
    while (length > 0) {
      const head = this.#chunks[0];
      if (!head) throw new BackendError('protocol-error', 'Protocol parser underflow.', false);
      const available = head.length - this.#headOffset;
      if (length < available) {
        this.#headOffset += length;
        return;
      }
      length -= available;
      this.#chunks.shift();
      this.#headOffset = 0;
    }
  }
}
