import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { makeRaw } from '../helpers/make-raw.js';
import { runCli } from '../helpers/run-cli.js';
import { tmpDir } from '../helpers/tmp.js';

// #8 — the worker unconditionally reads R, G, and B planes, so a header claiming
// fewer than three channels must be rejected rather than accepted and silently
// converted with zeroed channels.
for (const channels of [1, 2]) {
  test(`a raw header claiming ${channels} channel(s) is rejected, not silently zeroed`, () => {
    const dir = tmpDir();
    try {
      const inDir = path.join(dir, 'in');
      const outDir = path.join(dir, 'out');
      fs.mkdirSync(inDir);
      makeRaw(path.join(inDir, 'bad.raw'), { channels });

      const { status } = runCli(['--dir', inDir, '--dir-out', outDir, '--mode', 'raw']);

      assert.notEqual(status, 0, `a ${channels}-channel file should not process successfully`);
      const outputs = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((f) => f.endsWith('.tif')) : [];
      assert.deepEqual(outputs, [], 'no TIFF should be written for an unsupported channel count');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

// #12 — the TIFF writer stores width/height as 16-bit SHORT (max 65535), so a
// header claiming a larger dimension must be rejected rather than reaching the
// writer and throwing.
test('a raw header with a dimension over 65535 is rejected', () => {
  const dir = tmpDir();
  try {
    const inDir = path.join(dir, 'in');
    const outDir = path.join(dir, 'out');
    fs.mkdirSync(inDir);
    makeRaw(path.join(inDir, 'huge.raw'), { width: 70000, height: 1 });

    const { status, stderr } = runCli(['--dir', inDir, '--dir-out', outDir, '--mode', 'raw']);

    assert.notEqual(status, 0, 'an over-large dimension should not process');
    assert.doesNotMatch(stderr, /RangeError|out of range/, 'rejected at validation, not a writer crash');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// A normal three-channel raw still converts fine (guards against over-rejecting).
test('a valid 3-channel raw still converts', () => {
  const dir = tmpDir();
  try {
    const inDir = path.join(dir, 'in');
    const outDir = path.join(dir, 'out');
    fs.mkdirSync(inDir);
    makeRaw(path.join(inDir, 'good.raw'));

    const { status } = runCli(['--dir', inDir, '--dir-out', outDir, '--mode', 'raw']);

    assert.equal(status, 0, 'a valid 3-channel file should convert');
    assert.deepEqual(fs.readdirSync(outDir).filter((f) => f.endsWith('.tif')), ['good.tif']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a truncated header is rejected cleanly', () => {
  const dir = tmpDir();
  try {
    const inDir = path.join(dir, 'in');
    fs.mkdirSync(inDir);
    fs.writeFileSync(path.join(inDir, 'trunc.raw'), Buffer.alloc(8)); // < 16-byte header
    const { status, stderr } = runCli(['--dir', inDir, '--dir-out', path.join(dir, 'out'), '--mode', 'raw']);
    assert.notEqual(status, 0);
    assert.doesNotMatch(stderr, /RangeError|node:internal|\n\s+at /, 'clean error, no stack');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('truncated pixel data (size mismatch) is rejected', () => {
  const dir = tmpDir();
  try {
    const inDir = path.join(dir, 'in');
    fs.mkdirSync(inDir);
    const header = Buffer.alloc(16);
    header.writeUInt32LE(16, 0);
    header.writeUInt32LE(64, 4); // width
    header.writeUInt32LE(64, 8); // height
    header.writeUInt32LE(48, 12); // 3ch x 16-bit
    fs.writeFileSync(path.join(inDir, 'short.raw'), Buffer.concat([header, Buffer.alloc(100)])); // far too little pixel data
    const { status } = runCli(['--dir', inDir, '--dir-out', path.join(dir, 'out'), '--mode', 'raw']);
    assert.notEqual(status, 0, 'a size-mismatched file should not convert');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('values over the 14-bit maximum are refused', () => {
  const dir = tmpDir();
  try {
    const inDir = path.join(dir, 'in');
    fs.mkdirSync(inDir);
    const w = 8, h = 8, pc = w * h;
    const header = Buffer.alloc(16);
    header.writeUInt32LE(16, 0);
    header.writeUInt32LE(w, 4);
    header.writeUInt32LE(h, 8);
    header.writeUInt32LE(48, 12);
    const planar = new Uint16Array(pc * 3).fill(20000); // > 14-bit max (16383)
    fs.writeFileSync(path.join(inDir, 'hot.raw'), Buffer.concat([header, Buffer.from(planar.buffer)]));
    const { status, stderr } = runCli(['--dir', inDir, '--dir-out', path.join(dir, 'out'), '--mode', 'raw']);
    assert.notEqual(status, 0);
    assert.match(stderr, /14-bit|16383|overflow/i, 'explains the 14-bit overflow');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a headerless raw converts when --dimensions is given', () => {
  const dir = tmpDir();
  try {
    const inDir = path.join(dir, 'in');
    const outDir = path.join(dir, 'out');
    fs.mkdirSync(inDir);
    const w = 16, h = 16;
    const planar = new Uint16Array(w * h * 3).fill(5000); // no header, raw planar
    fs.writeFileSync(path.join(inDir, 'headerless.raw'), Buffer.from(planar.buffer));
    const { status, stderr } = runCli(['--dir', inDir, '--dir-out', outDir, '--dimensions', `${w}x${h}`, '--mode', 'raw']);
    assert.equal(status, 0, `should convert. stderr:\n${stderr}`);
    assert.deepEqual(fs.readdirSync(outDir).filter((f) => f.endsWith('.tif')), ['headerless.tif']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
