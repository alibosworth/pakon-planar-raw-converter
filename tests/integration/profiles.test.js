import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { makeRaw } from '../helpers/make-raw.js';
import { runCli } from '../helpers/run-cli.js';
import { tmpDir } from '../helpers/tmp.js';

// Build an input directory with a couple of synthetic frames; returns { dir,
// inDir, home } with a redirected .pprc home. Caller removes `dir`.
function scratchRoll() {
  const dir = tmpDir();
  const inDir = path.join(dir, 'in');
  const home = path.join(dir, 'home');
  fs.mkdirSync(inDir);
  fs.mkdirSync(home);
  makeRaw(path.join(inDir, 'A.raw'), { frame: 0 });
  makeRaw(path.join(inDir, 'B.raw'), { frame: 1 });
  return { dir, inDir, home };
}

// #4 — contradictory profile-mode combinations must be rejected up front with a
// concise error, not analysed and then crashed on.
test('--save-profile conflicts with --per-image-balancing (no analysis crash)', () => {
  const { dir, inDir, home } = scratchRoll();
  try {
    const { status, stderr } = runCli(
      ['--dir', inDir, '--dir-out', path.join(dir, 'out'), '--save-profile', 'p', '--per-image-balancing'],
      { env: { HOME: home, USERPROFILE: home } },
    );
    assert.equal(status, 1, `should exit 1. stderr:\n${stderr}`);
    assert.doesNotMatch(stderr, /Cannot convert undefined or null/, 'no cryptic post-analysis crash');
    assert.match(stderr, /--per-image-balancing/, 'names the conflicting flag');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--save-profile conflicts with --profile', () => {
  const { dir, inDir, home } = scratchRoll();
  try {
    const { status, stderr } = runCli(
      ['--dir', inDir, '--dir-out', path.join(dir, 'out'), '--save-profile', 'p', '--profile', 'q'],
      { env: { HOME: home, USERPROFILE: home } },
    );
    assert.equal(status, 1, `should exit 1. stderr:\n${stderr}`);
    assert.match(stderr, /--save-profile.*--profile|--profile.*--save-profile/, 'names both flags');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--save-profile without negative mode is rejected, not silently ignored', () => {
  const { dir, inDir, home } = scratchRoll();
  try {
    const { status, stderr } = runCli(
      ['--dir', inDir, '--dir-out', path.join(dir, 'out'), '--mode', 'e6', '--save-profile', 'p'],
      { env: { HOME: home, USERPROFILE: home } },
    );
    assert.equal(status, 1, `should exit 1. stderr:\n${stderr}`);
    assert.match(stderr, /negative mode/, 'explains that save-profile needs negative mode');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--profile without negative mode is rejected before loading it', () => {
  const { dir, inDir, home } = scratchRoll();
  try {
    const { status, stderr } = runCli(
      ['--dir', inDir, '--dir-out', path.join(dir, 'out'), '--mode', 'e6', '--profile', 'missing'],
      { env: { HOME: home, USERPROFILE: home } },
    );
    assert.equal(status, 1, `should exit 1. stderr:\n${stderr}`);
    assert.match(stderr, /negative mode/, 'rejected for the mode, not for being missing');
    assert.doesNotMatch(stderr, /not found/, 'should not attempt to load the profile');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

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
