export const FRAME_WIDTH = 320;
export const FRAME_HEIGHT = 180;
export const CODE_BITS = 24;
const CELL_SIZE = 8;
const CELL_GAP = 2;
const CODE_X = 8;
const CODE_Y = 8;
const PREAMBLE = [1, 0, 1, 0];

const SEGMENTS = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
  5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};

export function createCodedRgbFrame(frameIndex, width = FRAME_WIDTH, height = FRAME_HEIGHT) {
  assertFrameIndex(frameIndex);
  const pixels = Buffer.alloc(width * height * 3);
  const base = 30 + (frameIndex * 37) % 100;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      pixels[offset] = (base + x) % 180;
      pixels[offset + 1] = (base + y * 2) % 180;
      pixels[offset + 2] = (base + x + y) % 180;
    }
  }

  const bits = encodeFrameCode(frameIndex);
  bits.forEach((bit, index) => {
    fillRect(
      pixels,
      width,
      CODE_X + index * (CELL_SIZE + CELL_GAP),
      CODE_Y,
      CELL_SIZE,
      CELL_SIZE,
      bit ? [255, 255, 255] : [0, 0, 0],
    );
  });

  drawDecimalNumber(pixels, width, height, String(frameIndex).padStart(4, '0'));
  return pixels;
}

export function encodeFrameCode(frameIndex) {
  assertFrameIndex(frameIndex);
  const valueBits = Array.from({ length: 16 }, (_, shift) => (frameIndex >> (15 - shift)) & 1);
  const parity = [0, 1, 2, 3].map((group) =>
    valueBits.filter((_, index) => index % 4 === group).reduce((sum, bit) => sum ^ bit, 0));
  return [...PREAMBLE, ...valueBits, ...parity];
}

export function decodeFrameCodeFromRgba(rgba, width, height) {
  if (width < CODE_X + CODE_BITS * (CELL_SIZE + CELL_GAP) || height < CODE_Y + CELL_SIZE) {
    throw new Error('Decoded frame is too small to contain the frame code.');
  }
  const bits = Array.from({ length: CODE_BITS }, (_, index) => {
    const x = CODE_X + index * (CELL_SIZE + CELL_GAP) + Math.floor(CELL_SIZE / 2);
    const y = CODE_Y + Math.floor(CELL_SIZE / 2);
    const offset = (y * width + x) * 4;
    const luminance = rgba[offset] + rgba[offset + 1] + rgba[offset + 2];
    return luminance >= 384 ? 1 : 0;
  });

  if (!PREAMBLE.every((bit, index) => bits[index] === bit)) {
    throw new Error('Frame-code preamble is invalid.');
  }
  const valueBits = bits.slice(4, 20);
  const expectedParity = bits.slice(20);
  const actualParity = [0, 1, 2, 3].map((group) =>
    valueBits.filter((_, index) => index % 4 === group).reduce((sum, bit) => sum ^ bit, 0));
  if (!actualParity.every((bit, index) => bit === expectedParity[index])) {
    throw new Error('Frame-code parity is invalid.');
  }
  return valueBits.reduce((value, bit) => (value << 1) | bit, 0);
}

export function rgbToRgba(rgb) {
  const rgba = Buffer.alloc((rgb.length / 3) * 4);
  for (let source = 0, target = 0; source < rgb.length; source += 3, target += 4) {
    rgba[target] = rgb[source];
    rgba[target + 1] = rgb[source + 1];
    rgba[target + 2] = rgb[source + 2];
    rgba[target + 3] = 255;
  }
  return rgba;
}

function drawDecimalNumber(pixels, width, height, value) {
  const scale = 8;
  const digitWidth = 4 * scale;
  const totalWidth = value.length * digitWidth + (value.length - 1) * scale;
  const startX = Math.floor((width - totalWidth) / 2);
  const startY = Math.floor((height - 7 * scale) / 2);
  value.split('').forEach((digit, index) => {
    drawDigit(pixels, width, startX + index * (digitWidth + scale), startY, scale, digit);
  });
}

function drawDigit(pixels, width, x, y, scale, digit) {
  const active = SEGMENTS[digit];
  const segments = {
    a: [x + scale, y, 2 * scale, scale],
    b: [x + 3 * scale, y + scale, scale, 2 * scale],
    c: [x + 3 * scale, y + 4 * scale, scale, 2 * scale],
    d: [x + scale, y + 6 * scale, 2 * scale, scale],
    e: [x, y + 4 * scale, scale, 2 * scale],
    f: [x, y + scale, scale, 2 * scale],
    g: [x + scale, y + 3 * scale, 2 * scale, scale],
  };
  for (const [name, rect] of Object.entries(segments)) {
    fillRect(pixels, width, ...rect, active.includes(name) ? [255, 255, 255] : [18, 18, 18]);
  }
}

function fillRect(pixels, width, x, y, rectWidth, rectHeight, color) {
  for (let row = y; row < y + rectHeight; row += 1) {
    for (let column = x; column < x + rectWidth; column += 1) {
      const offset = (row * width + column) * 3;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
    }
  }
}

function assertFrameIndex(frameIndex) {
  if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex > 0xffff) {
    throw new Error('Frame index must be an integer between 0 and 65535.');
  }
}

