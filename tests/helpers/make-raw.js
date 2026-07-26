// Write a synthetic Pakon planar .raw file: 16-byte header (headerSize, width,
// height, bpp as uint32 LE) followed by RRR...GGG...BBB u16 LE, 14-bit values
// (max 16383), negative-like channel ordering R > G > B. Adapted from
// private/qa-scripts/make_test_raws.mjs.
import fs from 'node:fs';

// `channels` defaults to 3 (the real Pakon format); pass 1/2/4 to build a
// malformed/unsupported header for validation tests. The 3-channel output is
// unchanged.
const CHANNEL_BASE = [10000, 6000, 2800];
const CHANNEL_FRAME_STEP = [200, 150, 100];

export function makeRaw(filePath, { width = 120, height = 80, frame = 0, channels = 3 } = {}) {
  const pixelCount = width * height;

  const header = Buffer.alloc(16);
  header.writeUInt32LE(16, 0); // headerSize
  header.writeUInt32LE(width, 4);
  header.writeUInt32LE(height, 8);
  header.writeUInt32LE(channels * 16, 12); // bits per pixel = channels x 16-bit

  const planar = new Uint16Array(pixelCount * channels);
  for (let i = 0; i < pixelCount; i++) {
    const gradient = 0.3 + 0.6 * ((i % width) / width);
    for (let c = 0; c < channels; c++) {
      planar[pixelCount * c + i] = Math.round(CHANNEL_BASE[c % 3] * gradient + frame * CHANNEL_FRAME_STEP[c % 3]);
    }
  }

  fs.writeFileSync(filePath, Buffer.concat([header, Buffer.from(planar.buffer)]));
}
