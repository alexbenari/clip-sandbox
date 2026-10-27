const fs = require('node:fs/promises');

const BOX_HEADER_BYTES = 8;
const LARGE_BOX_HEADER_BYTES = 16;
const FULL_BOX_PREFIX_BYTES = 4;
const KEYS_PREFIX_BYTES = 8;
const DATA_PREFIX_BYTES = 8;
const MAX_METADATA_BYTES = 64 * 1024;

class Mp4MetadataTagReader {
  async read(filePath, key) {
    const handle = await fs.open(filePath, 'r');
    try {
      const { size } = await handle.stat();
      const moov = await this.findFileBox(handle, 0, size, 'moov');
      const udta = moov && await this.findFileBox(handle, moov.bodyStart, moov.end, 'udta');
      const meta = udta && await this.findFileBox(handle, udta.bodyStart, udta.end, 'meta');
      if (!meta || meta.end - meta.bodyStart > MAX_METADATA_BYTES) return null;
      const body = Buffer.alloc(meta.end - meta.bodyStart);
      const { bytesRead } = await handle.read(body, 0, body.length, meta.bodyStart);
      return bytesRead === body.length ? new Mp4MetadataBody(body).textStoredUnder(key) : null;
    } finally {
      await handle.close();
    }
  }

  async findFileBox(handle, start, end, type) {
    const header = Buffer.alloc(LARGE_BOX_HEADER_BYTES);
    for (let offset = start; offset + BOX_HEADER_BYTES <= end;) {
      const { bytesRead } = await handle.read(header, 0, Math.min(LARGE_BOX_HEADER_BYTES, end - offset), offset);
      const box = Mp4Box.parse(header.subarray(0, bytesRead), 0, end - offset)?.movedBy(offset);
      if (!box) return null;
      if (box.type === type) return box;
      offset = box.end;
    }
    return null;
  }
}

class Mp4Box {
  constructor(type, start, bodyStart, end) {
    this.type = type;
    this.start = start;
    this.bodyStart = bodyStart;
    this.end = end;
  }

  // A box whose declared size runs past its parent is truncated or malformed.
  static parse(bytes, start, parentEnd) {
    if (bytes.length - start < BOX_HEADER_BYTES) return null;
    const declaredSize = bytes.readUInt32BE(start);
    const type = bytes.toString('latin1', start + 4, start + 8);
    let headerSize = BOX_HEADER_BYTES;
    let size = declaredSize;
    if (declaredSize === 1) {
      if (bytes.length - start < LARGE_BOX_HEADER_BYTES) return null;
      size = Number(bytes.readBigUInt64BE(start + 8));
      headerSize = LARGE_BOX_HEADER_BYTES;
    } else if (declaredSize === 0) {
      size = parentEnd - start;
    }
    if (!Number.isSafeInteger(size) || size < headerSize || start + size > parentEnd) return null;
    return new Mp4Box(type, start, start + headerSize, start + size);
  }

  movedBy(offset) {
    return new Mp4Box(this.type, this.start + offset, this.bodyStart + offset, this.end + offset);
  }
}

class Mp4MetadataBody {
  constructor(bytes) {
    this.bytes = bytes;
  }

  textStoredUnder(key) {
    const children = this.boxesIn(this.childrenStart(), this.bytes.length);
    const keys = children?.find(box => box.type === 'keys');
    const items = children?.find(box => box.type === 'ilst');
    if (!keys || !items) return null;
    const keyIndex = this.keyNames(keys)?.indexOf(key) ?? -1;
    if (keyIndex < 0) return null;
    const data = this.dataBoxOf(this.itemFor(items, keyIndex));
    return data ? this.dataText(data) : null;
  }

  // An MP4 metadata box starts with version and flags; the QuickTime form starts directly with its handler box.
  childrenStart() {
    return this.bytes.length >= BOX_HEADER_BYTES && this.bytes.toString('latin1', 4, 8) === 'hdlr' ? 0 : FULL_BOX_PREFIX_BYTES;
  }

  keyNames(keys) {
    const entriesStart = keys.bodyStart + KEYS_PREFIX_BYTES;
    if (entriesStart > keys.end) return null;
    const names = [];
    for (let offset = entriesStart; offset + BOX_HEADER_BYTES <= keys.end;) {
      const size = this.bytes.readUInt32BE(offset);
      if (size < BOX_HEADER_BYTES || offset + size > keys.end) return null;
      names.push(this.bytes.toString('utf8', offset + BOX_HEADER_BYTES, offset + size));
      offset += size;
    }
    return names;
  }

  // Each item's box type field holds the one-based index of its key.
  itemFor(items, keyIndex) {
    return this.boxesIn(items.bodyStart, items.end)?.find(box => this.bytes.readUInt32BE(box.start + 4) === keyIndex + 1) ?? null;
  }

  dataBoxOf(item) {
    return item ? this.boxesIn(item.bodyStart, item.end)?.find(box => box.type === 'data') ?? null : null;
  }

  dataText(data) {
    const textStart = data.bodyStart + DATA_PREFIX_BYTES;
    return textStart <= data.end ? this.bytes.toString('utf8', textStart, data.end) : null;
  }

  boxesIn(start, end) {
    const boxes = [];
    for (let offset = start; offset + BOX_HEADER_BYTES <= end;) {
      const box = Mp4Box.parse(this.bytes.subarray(0, end), offset, end);
      if (!box) return null;
      boxes.push(box);
      offset = box.end;
    }
    return boxes;
  }
}

module.exports = { Mp4MetadataTagReader };
