import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { makeRaw } from '../helpers/make-raw.js';
import { runCli } from '../helpers/run-cli.js';
import { tmpDir } from '../helpers/tmp.js';

// #9 — a --save-profile run analyses and exits without image output, so it must
// not leave an empty output directory behind. The .pprc home is redirected into
// the test's temp dir (HOME/USERPROFILE) so nothing touches the real home.
test('a profile-only run does not leave an empty output directory', () => {
  const dir = tmpDir();
  const home = path.join(dir, 'home');
  fs.mkdirSync(home);
  try {
    const inDir = path.join(dir, 'in');
    const outDir = path.join(dir, 'out');
    fs.mkdirSync(inDir);
    makeRaw(path.join(inDir, 'A.raw'), { frame: 0 });
    makeRaw(path.join(inDir, 'B.raw'), { frame: 1 });

    const { status, stderr } = runCli(
      ['--dir', inDir, '--dir-out', outDir, '--save-profile', 'testprofile'],
      { env: { HOME: home, USERPROFILE: home } },
    );

    assert.equal(status, 0, `save-profile should succeed. stderr:\n${stderr}`);
    assert.ok(
      fs.existsSync(path.join(home, '.pprc', 'profiles', 'testprofile.json')),
      'the profile should actually be saved',
    );
    assert.equal(fs.existsSync(outDir), false, 'a profile-only run should not create an output directory');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
