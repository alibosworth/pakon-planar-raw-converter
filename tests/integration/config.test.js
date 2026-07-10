import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { makeRaw } from '../helpers/make-raw.js';
import { runCli } from '../helpers/run-cli.js';
import { tmpDir } from '../helpers/tmp.js';

// #5 — last_run_config.json is meant to be copied to reproduce a run, but a
// negative run omitted the colour spaces (and output dir / mode), so the copy
// did not reproduce the run. It should record the effective colour spaces.
test('last_run_config from a negative run records the colour spaces', () => {
  const dir = tmpDir();
  const home = path.join(dir, 'home');
  fs.mkdirSync(home);
  try {
    const inDir = path.join(dir, 'in');
    fs.mkdirSync(inDir);
    makeRaw(path.join(inDir, 'A.raw'), { frame: 0 });
    makeRaw(path.join(inDir, 'B.raw'), { frame: 1 });

    const { status, stderr } = runCli(
      ['--dir', inDir, '--dir-out', path.join(dir, 'out'), '--colorspace-working', 'adobergb'],
      { env: { HOME: home, USERPROFILE: home } },
    );
    assert.equal(status, 0, `negative run should succeed. stderr:\n${stderr}`);

    const cfg = JSON.parse(fs.readFileSync(path.join(home, '.pprc', 'last_run_config.json'), 'utf8'));
    assert.equal(cfg.colorspaceWorking, 'adobergb', 'working colour space should be recorded');
    assert.equal(cfg.colorspaceInput, 'srgb', 'input colour space should be recorded');
    assert.equal(cfg.colorspaceOutput, 'adobergb', 'output colour space should be recorded');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
