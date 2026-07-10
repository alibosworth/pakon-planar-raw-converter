import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { makeRaw } from '../helpers/make-raw.js';
import { runCli } from '../helpers/run-cli.js';
import { tmpDir } from '../helpers/tmp.js';

// A non-numeric tuning value (parsed to NaN) must fail early, before any output
// directory is created or the roll is decoded — a friendly guard ahead of
// atlas's authoritative range validation.
test('--clip with a non-number fails early without creating an output directory', () => {
  const dir = tmpDir();
  try {
    const inDir = path.join(dir, 'in');
    const outDir = path.join(dir, 'out');
    fs.mkdirSync(inDir);
    makeRaw(path.join(inDir, 'A.raw'), { frame: 0 });

    const { status, stderr } = runCli(['--dir', inDir, '--dir-out', outDir, '--clip', 'banana']);

    assert.equal(status, 1, `should exit 1. stderr:\n${stderr}`);
    assert.doesNotMatch(stderr, /node:internal|\n\s+at /, 'no raw stack trace');
    assert.match(stderr, /ERROR:/, 'concise ERROR: message');
    assert.equal(fs.existsSync(outDir), false, 'no output directory for an invalid option');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
