import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { makeRaw } from '../helpers/make-raw.js';
import { runCli } from '../helpers/run-cli.js';
import { tmpDir } from '../helpers/tmp.js';

// Run pprc with `args` over two synthetic frames and return stdout+stderr.
// `config`, when given, is written to an isolated HOME as the default config so
// a value can arrive from configuration rather than the command line.
function warnings(args, config) {
  const dir = tmpDir();
  try {
    const inDir = path.join(dir, 'in');
    fs.mkdirSync(inDir);
    makeRaw(path.join(inDir, 'F0.raw'), { frame: 0 });
    makeRaw(path.join(inDir, 'F1.raw'), { frame: 1 });

    const home = path.join(dir, 'home');
    fs.mkdirSync(home);
    if (config) {
      const configsDir = path.join(home, '.pprc', 'configs');
      fs.mkdirSync(configsDir, { recursive: true });
      fs.writeFileSync(path.join(configsDir, 'default.json'), JSON.stringify(config, null, 2));
    }

    const res = runCli(['--dir', inDir, '--dir-out', path.join(dir, 'out'), ...args], {
      env: { HOME: home, USERPROFILE: home },
    });
    return { status: res.status, output: res.stdout + res.stderr };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// These options are consumed only by the ATLAS negative pass. When no negative
// mode is selected nothing reads them, so they must be reported rather than
// silently dropped. The old raw-only check was gated on there being exactly one
// mode, so adding any second mode disabled the warning entirely.
for (const flag of [
  ['--per-image-balancing'],
  ['--no-frame-rejection'],
  ['--pixel-rejection-percentage', '0.5'],
]) {
  test(`${flag[0]} warns when no negative mode is selected`, () => {
    const { status, output } = warnings(['--mode', 'raw,e6', ...flag]);
    assert.equal(status, 0, 'the run itself should still succeed');
    assert.match(output, new RegExp(`${flag[0]}[\\s\\S]*ignored`), `${flag[0]} should be reported`);
    assert.match(output, /negative-inversion output/, 'and should say why');
  });
}

// The same options are honoured when negative is in the set, even alongside
// modes that ignore them, so warning there would be wrong.
test('negative-only options stay quiet when negative is among the modes', () => {
  const { status, output } = warnings(['--mode', 'negative,e6', '--per-image-balancing']);
  assert.equal(status, 0, `should succeed. output:\n${output}`);
  assert.doesNotMatch(output, /--per-image-balancing[\s\S]*ignored/, 'the flag is applied, not ignored');
});

// The contrast-stretch family is consumed by negative, e6, bw and bw-rgb, so it
// is only inapplicable when raw is the only mode.
test('--clip warns when raw is the only mode', () => {
  const { status, output } = warnings(['--mode', 'raw', '--clip', '1']);
  assert.equal(status, 0, `should succeed. output:\n${output}`);
  assert.match(output, /--clip[\s\S]*ignored/, 'raw alone ignores the stretch options');
});

test('--clip stays quiet when a stretch mode is also requested', () => {
  const { status, output } = warnings(['--mode', 'raw,e6', '--clip', '1']);
  assert.equal(status, 0, `should succeed. output:\n${output}`);
  assert.doesNotMatch(output, /--clip[\s\S]*ignored/, 'e6 consumes --clip');
});

// The negative-only and raw-only checks overlap for a raw-only run: both would
// fire for --per-image-balancing. It should be reported once.
test('a raw-only run reports an inapplicable option exactly once', () => {
  const { output } = warnings(['--mode', 'raw', '--per-image-balancing']);
  const hits = output.split('\n').filter((l) => l.includes('--per-image-balancing') && l.includes('ignored'));
  assert.equal(hits.length, 1, `expected one warning line, got:\n${hits.join('\n')}`);
});

// --profile and --save-profile hard-error without a negative mode, so listing
// them in a warning as well produced a warning and an error for one flag.
test('--profile without a negative mode errors without also warning', () => {
  const { status, output } = warnings(['--mode', 'raw', '--profile', 'somename']);
  assert.equal(status, 1, 'should exit non-zero');
  assert.match(output, /--profile requires negative mode/, 'should hard-error');
  assert.doesNotMatch(output, /--profile[\s\S]*is ignored/, 'and not also warn about it');
});
