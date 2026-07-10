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
