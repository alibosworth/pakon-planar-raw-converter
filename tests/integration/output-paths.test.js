import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { makeRaw } from '../helpers/make-raw.js';
import { runCli } from '../helpers/run-cli.js';
import { tmpDir } from '../helpers/tmp.js';
import { isCaseSensitiveFS } from '../helpers/fs-case.js';

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

// Two inputs differing only in extension case (FRAME.raw / FRAME.RAW) strip to
// the same output name and would clobber each other. They can only coexist on a
// case-sensitive filesystem, so this skips where they cannot be created.
test('input files differing only in case are rejected before writing', (t) => {
  const dir = tmpDir();
  try {
    const inDir = path.join(dir, 'in');
    fs.mkdirSync(inDir);

    if (!isCaseSensitiveFS(inDir)) {
      t.skip('case-insensitive filesystem: FRAME.raw and FRAME.RAW cannot coexist here');
      return;
    }

    makeRaw(path.join(inDir, 'FRAME.raw'));
    makeRaw(path.join(inDir, 'FRAME.RAW'));

    const { status, stderr } = runCli(['--dir', inDir, '--dir-out', path.join(dir, 'out'), '--mode', 'raw']);

    assert.notEqual(status, 0, 'colliding output names should be rejected');
    assert.match(stderr, /same output name/i, 'explains the collision');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
