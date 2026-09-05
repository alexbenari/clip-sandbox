import { describe, expect, it } from 'vitest';

import { BackendError } from '../../src/model/backend-error.js';
import {
  BinaryProtocolParser,
  encodeProtocolMessage,
  MAXIMUM_METADATA_BYTES,
  WIRE_HEADER_BYTES,
} from '../../src/adapter/binary-frame-protocol.js';

describe('binary frame protocol', () => {
  it('parses a header, JSON metadata, and pixels split at every byte boundary', () => {
    const encoded = encodeProtocolMessage({ type: 'frame', requestId: '17' }, Buffer.from([1, 2, 3, 4]));
    const parser = new BinaryProtocolParser();
    const messages = [];

    for (const byte of encoded) messages.push(...parser.push(Buffer.from([byte])));
    parser.finish();

    expect(messages).toHaveLength(1);
    expect(messages[0]?.metadata).toEqual({ type: 'frame', requestId: '17' });
    expect([...messages[0]!.payload]).toEqual([1, 2, 3, 4]);
  });

  it('parses multiple messages delivered in one chunk', () => {
    const parser = new BinaryProtocolParser();
    const messages = parser.push(Buffer.concat([
      encodeProtocolMessage({ type: 'status', requestId: '1' }),
      encodeProtocolMessage({ type: 'status', requestId: '2' }),
    ]));

    expect(messages.map((message) => message.metadata.requestId)).toEqual(['1', '2']);
  });

  it('rejects an oversized declared metadata length before allocation', () => {
    const malicious = Buffer.alloc(WIRE_HEADER_BYTES);
    malicious.write('FVSP', 0, 'ascii');
    malicious.writeUInt16LE(1, 4);
    malicious.writeUInt32LE(MAXIMUM_METADATA_BYTES + 1, 8);
    const parser = new BinaryProtocolParser();

    expect(() => parser.push(malicious)).toThrow(BackendError);
  });

  it('rejects a partial message when the process closes', () => {
    const parser = new BinaryProtocolParser();
    parser.push(encodeProtocolMessage({ type: 'status', requestId: '1' }).subarray(0, 7));

    expect(() => parser.finish()).toThrow('partial message');
  });
});
