// Write a synthetic Pakon planar .raw file: 16-byte header (headerSize, width,
// height, bpp as uint32 LE) followed by RRR...GGG...BBB u16 LE, 14-bit values
// (max 16383), negative-like channel ordering R > G > B. Adapted from
// private/qa-scripts/make_test_raws.mjs.
import fs from 'node:fs';

export function makeRaw(filePath, { width = 120, height = 80, frame = 0 } = {}) {
  const pixelCount = width * height;

  const header = Buffer.alloc(16);
  header.writeUInt32LE(16, 0); // headerSize
  header.writeUInt32LE(width, 4);
  header.writeUInt32LE(height, 8);
  header.writeUInt32LE(48, 12); // 3 channels x 16 bit

  const planar = new Uint16Array(pixelCount * 3);
  for (let i = 0; i < pixelCount; i++) {
    const gradient = 0.3 + 0.6 * ((i % width) / width);
    planar[i] = Math.round(10000 * gradient + frame * 200); // R plane
    planar[pixelCount + i] = Math.round(6000 * gradient + frame * 150); // G plane
    planar[pixelCount * 2 + i] = Math.round(2800 * gradient + frame * 100); // B plane
  }

  fs.writeFileSync(filePath, Buffer.concat([header, Buffer.from(planar.buffer)]));
}
