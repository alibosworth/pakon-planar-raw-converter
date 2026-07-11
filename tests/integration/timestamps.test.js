import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { makeRaw } from '../helpers/make-raw.js';
import { runCli } from '../helpers/run-cli.js';
import { tmpDir } from '../helpers/tmp.js';

// Outputs are written asynchronously, so on-disk mtimes land in arbitrary order;
// downstream tools that fall back to file date then scramble the roll. Every run
// restamps outputs onto a synthetic timeline: strictly increasing in lexical
// name order, spaced by one second, and never in the future.
test('outputs are restamped in lexical order, one second apart, never future', () => {
  const dir = tmpDir();
  try {
    const inDir = path.join(dir, 'in');
    const outDir = path.join(dir, 'out');
    fs.mkdirSync(inDir);
    for (const name of ['A', 'B', 'C', 'D']) {
      makeRaw(path.join(inDir, `${name}.raw`), { frame: 0 });
    }

    const { status, stderr } = runCli(['--dir', inDir, '--dir-out', outDir, '--mode', 'raw']);
    assert.equal(status, 0, `should convert. stderr:\n${stderr}`);
    const now = Date.now();

    const names = fs.readdirSync(outDir).filter((f) => f.endsWith('.tif')).sort();
    assert.deepEqual(names, ['A.tif', 'B.tif', 'C.tif', 'D.tif']);

    const mtimes = names.map((n) => fs.statSync(path.join(outDir, n)).mtimeMs);
    for (let i = 1; i < mtimes.length; i++) {
      const step = mtimes[i] - mtimes[i - 1];
      assert.ok(step > 0, `mtime must strictly increase (${names[i - 1]} → ${names[i]})`);
      assert.ok(Math.abs(step - 1000) < 50, `frames should be ~1s apart, got ${step}ms`);
    }
    // Allow a small margin for filesystem second-rounding of the last frame.
    assert.ok(mtimes[mtimes.length - 1] <= now + 1000, 'no output should be dated in the future');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
