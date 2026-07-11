import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { makeRaw } from '../helpers/make-raw.js';
import { runCli } from '../helpers/run-cli.js';
import { tmpDir } from '../helpers/tmp.js';
import { readTiff } from '../helpers/read-tiff.js';

// Render `modeArgs` over `frames` synthetic frames; return the CLI result, the
// sorted output .tif names, their parsed TIFFs, and a cleanup fn.
function render(modeArgs, frames = 1) {
  const dir = tmpDir();
  const inDir = path.join(dir, 'in');
  const outDir = path.join(dir, 'out');
  fs.mkdirSync(inDir);
  for (let f = 0; f < frames; f++) makeRaw(path.join(inDir, `F${f}.raw`), { frame: f });
  const res = runCli(['--dir', inDir, '--dir-out', outDir, ...modeArgs]);
  const names = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((f) => f.endsWith('.tif')).sort() : [];
  const tiffs = names.map((n) => readTiff(path.join(outDir, n)));
  return { res, names, tiffs, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

// Colour-space flags only affect the negative-inversion output. E6/BW modes
// ignore them, so setting one without a negative mode must warn rather than
// silently do nothing (which contradicted the documented behaviour).
test('colour-space flags warn when the selected mode ignores them (E6)', () => {
  const dir = tmpDir();
  try {
    const inDir = path.join(dir, 'in');
    const outDir = path.join(dir, 'out');
    fs.mkdirSync(inDir);
    makeRaw(path.join(inDir, 'A.raw'), { frame: 0 });

    const { status, stderr } = runCli(
      ['--dir', inDir, '--dir-out', outDir, '--mode', 'e6', '--colorspace-working', 'prophoto'],
    );

    assert.equal(status, 0, `e6 should still succeed. stderr:\n${stderr}`);
    assert.match(stderr, /--colorspace-working[\s\S]*ignored/i, 'should warn the flag is ignored');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Raw mode is a pure deplanarize + <<2 shift, so the output is exactly
// predictable: 3-channel 16-bit RGB, the Software tag, no ICC, exact pixels.
test('raw mode output is 3-channel 16-bit RGB with exact pixels', () => {
  const { res, names, tiffs, cleanup } = render(['--mode', 'raw'], 1);
  try {
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(names, ['F0.tif']);
    const t = tiffs[0];
    assert.equal(t.width, 120);
    assert.equal(t.height, 80);
    assert.equal(t.samplesPerPixel, 3);
    assert.equal(t.bitsPerSample, 16);
    assert.equal(t.photometric, 2, 'RGB');
    assert.match(t.software, /^PPRC v/);
    assert.equal(t.hasIcc, false, 'raw writes no colour profile');
    // First pixel at gradient 0.3: round(10000/6000/2800 * 0.3) << 2.
    assert.deepEqual([t.pixels[0], t.pixels[1], t.pixels[2]], [12000, 7200, 3360]);
  } finally {
    cleanup();
  }
});

test('e6 mode output is 3-channel 16-bit RGB (no colour management)', () => {
  const { res, names, tiffs, cleanup } = render(['--mode', 'e6'], 1);
  try {
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(names, ['F0.tif']);
    assert.equal(tiffs[0].samplesPerPixel, 3);
    assert.equal(tiffs[0].bitsPerSample, 16);
    assert.equal(tiffs[0].photometric, 2);
    assert.equal(tiffs[0].hasIcc, false);
  } finally {
    cleanup();
  }
});

test('bw mode output is single-channel greyscale; bw-rgb keeps three', () => {
  const bw = render(['--mode', 'bw'], 1);
  try {
    assert.equal(bw.res.status, 0, bw.res.stderr);
    assert.equal(bw.tiffs[0].samplesPerPixel, 1, 'bw collapses to one channel');
    assert.equal(bw.tiffs[0].photometric, 1, 'greyscale');
    assert.equal(bw.tiffs[0].bitsPerSample, 16);
  } finally {
    bw.cleanup();
  }
  const rgb = render(['--mode', 'bw-rgb'], 1);
  try {
    assert.equal(rgb.res.status, 0, rgb.res.stderr);
    assert.equal(rgb.tiffs[0].samplesPerPixel, 3, 'bw-rgb keeps three channels');
    assert.equal(rgb.tiffs[0].photometric, 2);
  } finally {
    rgb.cleanup();
  }
});

test('negative mode output is 3-channel 16-bit RGB with an embedded ICC profile', () => {
  const { res, names, tiffs, cleanup } = render([], 2); // default mode is negative
  try {
    assert.equal(res.status, 0, res.stderr);
    assert.equal(names.length, 2);
    assert.equal(tiffs[0].samplesPerPixel, 3);
    assert.equal(tiffs[0].bitsPerSample, 16);
    assert.equal(tiffs[0].photometric, 2);
    assert.equal(tiffs[0].hasIcc, true, 'negative output is colour-managed');
  } finally {
    cleanup();
  }
});
