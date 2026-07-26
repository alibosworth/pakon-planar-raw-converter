import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { makeRaw } from '../helpers/make-raw.js';
import { runCli } from '../helpers/run-cli.js';
import { tmpDir } from '../helpers/tmp.js';
import { readTiff } from '../helpers/read-tiff.js';

// Build `frames` synthetic raws and run pprc over them with `args`.
function run(args, frames = 2) {
  const dir = tmpDir();
  const inDir = path.join(dir, 'in');
  const outDir = path.join(dir, 'out');
  fs.mkdirSync(inDir);
  for (let f = 0; f < frames; f++) makeRaw(path.join(inDir, `F${f}.raw`), { frame: f });
  const res = runCli(['--dir', inDir, '--dir-out', outDir, ...args]);
  return { res, inDir, outDir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function tifsIn(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.tif')).sort();
}

// More than one mode writes each mode's output into its own subdirectory, so the
// per-mode files can't collide on `<baseName>.tif`. The base output directory
// holds only those subdirectories and the run log.
test('two modes each write into their own subdirectory', () => {
  const { res, outDir, cleanup } = run(['--mode', 'negative,raw']);
  try {
    assert.equal(res.status, 0, `should succeed. stderr:\n${res.stderr}`);

    assert.deepEqual(tifsIn(path.join(outDir, 'negative')), ['F0.tif', 'F1.tif']);
    assert.deepEqual(tifsIn(path.join(outDir, 'raw')), ['F0.tif', 'F1.tif']);
    assert.deepEqual(tifsIn(outDir), [], 'no TIFFs should land loose in the base output dir');

    const baseEntries = fs.readdirSync(outDir).sort();
    assert.deepEqual(baseEntries, ['negative', 'pprc_log.txt', 'raw']);
  } finally {
    cleanup();
  }
});

// The subdirectory layout must apply only when it's needed. A single mode keeps
// writing flat into the output directory, unchanged from pre-multi-mode runs.
test('a single mode writes flat, with no per-mode subdirectory', () => {
  const { res, outDir, cleanup } = run(['--mode', 'raw']);
  try {
    assert.equal(res.status, 0, `should succeed. stderr:\n${res.stderr}`);
    assert.deepEqual(tifsIn(outDir), ['F0.tif', 'F1.tif']);
    assert.ok(!fs.existsSync(path.join(outDir, 'raw')), 'must not create a raw/ subdirectory');
  } finally {
    cleanup();
  }
});

// Modes are deduped before the multi-mode decision, so a repeated mode is still
// a single-mode run and must stay flat rather than nesting into a subdirectory.
test('a repeated mode collapses to a single flat run', () => {
  const { res, outDir, cleanup } = run(['--mode', 'raw,raw']);
  try {
    assert.equal(res.status, 0, `should succeed. stderr:\n${res.stderr}`);
    assert.deepEqual(tifsIn(outDir), ['F0.tif', 'F1.tif']);
    assert.ok(!fs.existsSync(path.join(outDir, 'raw')), 'dedupe should leave a flat single-mode run');
  } finally {
    cleanup();
  }
});

// Every value in the list is validated, not just the first, and the error names
// the offending one so a typo in a long list is findable.
test('an unknown mode inside a list is rejected and named', () => {
  const { res, outDir, cleanup } = run(['--mode', 'raw,bogus']);
  try {
    assert.equal(res.status, 1, 'should exit non-zero');
    assert.match(res.stderr, /bogus/, 'error should name the invalid mode');
    assert.deepEqual(tifsIn(outDir), [], 'nothing should be written');
    assert.deepEqual(tifsIn(path.join(outDir, 'raw')), [], 'no partial raw output');
  } finally {
    cleanup();
  }
});

// Modes that need no inversion engine still compose with each other.
test('two non-negative modes compose', () => {
  const { res, outDir, cleanup } = run(['--mode', 'raw,e6']);
  try {
    assert.equal(res.status, 0, `should succeed. stderr:\n${res.stderr}`);
    assert.deepEqual(tifsIn(path.join(outDir, 'raw')), ['F0.tif', 'F1.tif']);
    assert.deepEqual(tifsIn(path.join(outDir, 'e6')), ['F0.tif', 'F1.tif']);

    // raw is the untouched linear buffer; e6 is contrast-stretched, so the two
    // modes must not have produced identical pixels.
    const rawTiff = readTiff(path.join(outDir, 'raw', 'F0.tif'));
    const e6Tiff = readTiff(path.join(outDir, 'e6', 'F0.tif'));
    assert.equal(rawTiff.samplesPerPixel, 3);
    assert.equal(e6Tiff.samplesPerPixel, 3);
    assert.notDeepEqual(
      [e6Tiff.pixels[0], e6Tiff.pixels[1], e6Tiff.pixels[2]],
      [rawTiff.pixels[0], rawTiff.pixels[1], rawTiff.pixels[2]],
      'e6 should differ from untouched raw',
    );
  } finally {
    cleanup();
  }
});

// Timestamp restamping runs per output directory, so each mode's subdirectory
// gets its own increasing-in-frame-order timeline rather than only the first.
test('each mode subdirectory is restamped in frame order', () => {
  const { res, outDir, cleanup } = run(['--mode', 'raw,e6'], 3);
  try {
    assert.equal(res.status, 0, `should succeed. stderr:\n${res.stderr}`);
    const now = Date.now();

    for (const mode of ['raw', 'e6']) {
      const modeDir = path.join(outDir, mode);
      const names = tifsIn(modeDir);
      assert.deepEqual(names, ['F0.tif', 'F1.tif', 'F2.tif'], `${mode} should have all frames`);

      const mtimes = names.map((n) => fs.statSync(path.join(modeDir, n)).mtimeMs);
      for (let i = 1; i < mtimes.length; i++) {
        const step = mtimes[i] - mtimes[i - 1];
        assert.ok(step > 0, `${mode}: mtime must increase (${names[i - 1]} → ${names[i]})`);
        assert.ok(Math.abs(step - 1000) < 50, `${mode}: frames should be ~1s apart, got ${step}ms`);
      }
      assert.ok(mtimes[mtimes.length - 1] <= now + 1000, `${mode}: no future-dated output`);
    }
  } finally {
    cleanup();
  }
});
