import { describe, expect, it } from 'vitest';

import {
  BinaryFrameProtocol,
  BinaryFrameProtocolParser,
  FRAME_REVIEW_MAXIMUM_METADATA_BYTES,
} from '../../../src/frame-review/binary-frame-protocol.js';

describe('frame-review binary protocol', () => {
  it('parses split and adjacent messages without crossing payload boundaries', () => {
    const first = BinaryFrameProtocol.encode({ type: 'frame', requestId: '1' }, Buffer.from([1, 2, 3]));
    const second = BinaryFrameProtocol.encode({ type: 'status', requestId: '2' });
    const parser = new BinaryFrameProtocolParser();
    expect(parser.push(first.subarray(0, 9))).toEqual([]);
    const messages = parser.push(Buffer.concat([first.subarray(9), second]));
    expect(messages).toHaveLength(2);
    expect([...messages[0].payload]).toEqual([1, 2, 3]);
    parser.finish();
  });

  it('rejects oversized declarations and partial stream closure', () => {
    const oversized = Buffer.alloc(16);
    oversized.write('FVSP');
    oversized.writeUInt16LE(1, 4);
    oversized.writeUInt32LE(FRAME_REVIEW_MAXIMUM_METADATA_BYTES + 1, 8);
    expect(() => new BinaryFrameProtocolParser().push(oversized)).toThrow(/invalid length/i);

    const parser = new BinaryFrameProtocolParser();
    parser.push(BinaryFrameProtocol.encode({ type: 'status' }).subarray(0, 7));
    expect(() => parser.finish()).toThrow(/partially/i);
  });
});
