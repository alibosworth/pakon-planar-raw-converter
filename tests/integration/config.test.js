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

// Copying last_run_config.json into the default config must reproduce the run.
test('copying last_run_config to the default config reproduces the run', () => {
  const dir = tmpDir();
  const home = path.join(dir, 'home');
  fs.mkdirSync(home);
  try {
    const inDir = path.join(dir, 'in');
    fs.mkdirSync(inDir);
    makeRaw(path.join(inDir, 'A.raw'), { frame: 0 });
    makeRaw(path.join(inDir, 'B.raw'), { frame: 1 });
    const env = { HOME: home, USERPROFILE: home };

    const first = runCli(['--dir', inDir, '--dir-out', path.join(dir, 'out1'), '--clip', '0.05'], { env });
    assert.equal(first.status, 0, first.stderr);

    // Reuse the recorded settings via the default config; the CLI --dir-out wins.
    fs.mkdirSync(path.join(home, '.pprc', 'configs'), { recursive: true });
    fs.copyFileSync(
      path.join(home, '.pprc', 'last_run_config.json'),
      path.join(home, '.pprc', 'configs', 'default.json'),
    );
    const second = runCli(['--dir', inDir, '--dir-out', path.join(dir, 'out2')], { env });
    assert.equal(second.status, 0, second.stderr);

    const a = fs.readFileSync(path.join(dir, 'out1', 'A.tif'));
    const b = fs.readFileSync(path.join(dir, 'out2', 'A.tif'));
    assert.ok(a.equals(b), 'reproduced output should be byte-identical');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --save-config then --use-config must reproduce the same explicit flags.
test('--save-config / --use-config round-trips', () => {
  const dir = tmpDir();
  const home = path.join(dir, 'home');
  fs.mkdirSync(home);
  try {
    const inDir = path.join(dir, 'in');
    fs.mkdirSync(inDir);
    makeRaw(path.join(inDir, 'A.raw'), { frame: 0 });
    const env = { HOME: home, USERPROFILE: home };

    const saved = runCli(['--dir', inDir, '--mode', 'e6', '--clip', '2', '--save-config', 'e6cfg'], { env });
    assert.equal(saved.status, 0, saved.stderr);
    const cfg = JSON.parse(fs.readFileSync(path.join(home, '.pprc', 'configs', 'e6cfg.json'), 'utf8'));
    assert.equal(cfg.clip, 2);
    assert.deepEqual(cfg.mode, ['e6']);

    const viaConfig = runCli(['--dir', inDir, '--use-config', 'e6cfg', '--dir-out', path.join(dir, 'out-cfg')], { env });
    const viaFlags = runCli(['--dir', inDir, '--mode', 'e6', '--clip', '2', '--dir-out', path.join(dir, 'out-flags')], { env });
    assert.equal(viaConfig.status, 0, viaConfig.stderr);
    assert.equal(viaFlags.status, 0, viaFlags.stderr);

    const c = fs.readFileSync(path.join(dir, 'out-cfg', 'A.tif'));
    const f = fs.readFileSync(path.join(dir, 'out-flags', 'A.tif'));
    assert.ok(c.equals(f), '--use-config should reproduce the explicit flags');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
