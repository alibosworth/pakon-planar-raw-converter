import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { makeRaw } from '../helpers/make-raw.js';
import { runCli } from '../helpers/run-cli.js';
import { tmpDir } from '../helpers/tmp.js';

// #6 — the .raw extension must be stripped case-insensitively when deriving the
// output name, so an uppercase `.RAW` input does not produce `NAME.RAW.tif`.
test('uppercase .RAW input produces a normalized .tif output name', () => {
  const dir = tmpDir();
  try {
    const inDir = path.join(dir, 'in');
    const outDir = path.join(dir, 'out');
    fs.mkdirSync(inDir);
    makeRaw(path.join(inDir, 'TEST01.RAW'));

    const { status, stderr } = runCli(['--dir', inDir, '--dir-out', outDir, '--mode', 'raw']);
    assert.equal(status, 0, `CLI should exit 0. stderr:\n${stderr}`);

    const outputs = fs.readdirSync(outDir).filter((f) => f.endsWith('.tif'));
    assert.deepEqual(outputs, ['TEST01.tif'], 'output should be TEST01.tif, not TEST01.RAW.tif');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
