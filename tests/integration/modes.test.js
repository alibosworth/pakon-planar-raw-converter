import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { makeRaw } from '../helpers/make-raw.js';
import { runCli } from '../helpers/run-cli.js';
import { tmpDir } from '../helpers/tmp.js';

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
