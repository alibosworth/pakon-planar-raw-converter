// Minimal baseline-TIFF reader for tests: parses the first IFD and extracts the
// tags PPRC/atlas write, plus the single strip's 16-bit pixels. Handles both
// byte orders. Not a general TIFF reader — just enough to assert output shape.
import fs from 'node:fs';

export function readTiff(filePath) {
  const buf = fs.readFileSync(filePath);
  const le = buf.toString('ascii', 0, 2) === 'II';
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));

  const ifdOffset = u32(4);
  const entryCount = u16(ifdOffset);
  const tags = {};
  for (let i = 0; i < entryCount; i++) {
    const entry = ifdOffset + 2 + i * 12;
    tags[u16(entry)] = { type: u16(entry + 2), count: u32(entry + 4), valueOffset: entry + 8 };
  }

  const shortVal = (tag) => (tags[tag] ? u16(tags[tag].valueOffset) : undefined);
  const longVal = (tag) => (tags[tag] ? u32(tags[tag].valueOffset) : undefined);

  // BitsPerSample: inline when a single sample, else an offset to the values.
  let bitsPerSample;
  if (tags[258]) {
    bitsPerSample = tags[258].count === 1 ? u16(tags[258].valueOffset) : u16(u32(tags[258].valueOffset));
  }

  // Software (ASCII): inline when <= 4 bytes, else an offset. Trim the NUL.
  let software;
  if (tags[305]) {
    const n = tags[305].count;
    const off = n <= 4 ? tags[305].valueOffset : u32(tags[305].valueOffset);
    software = buf.toString('ascii', off, off + n).replace(/\0+$/, '');
  }

  // Single-strip 16-bit pixels, copied so the returned array is aligned.
  let pixels;
  if (tags[273] && tags[279]) {
    const start = longVal(273);
    const bytes = longVal(279);
    const copy = Buffer.from(buf.subarray(start, start + bytes));
    pixels = new Uint16Array(copy.buffer, copy.byteOffset, Math.floor(copy.length / 2));
    if (!le) {
      for (let i = 0; i < pixels.length; i++) pixels[i] = copy.readUInt16BE(i * 2);
    }
  }

  return {
    width: shortVal(256),
    height: shortVal(257),
    samplesPerPixel: shortVal(277),
    bitsPerSample,
    photometric: shortVal(262), // 1 = greyscale, 2 = RGB
    software,
    hasIcc: !!tags[34675],
    pixels,
  };
}
