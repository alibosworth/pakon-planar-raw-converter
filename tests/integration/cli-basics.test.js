import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeRaw } from '../helpers/make-raw.js';
import { runCli } from '../helpers/run-cli.js';
import { tmpDir } from '../helpers/tmp.js';

const pkg = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'));

test('--help exits 0 and lists options', () => {
  const { status, stdout } = runCli(['--help']);
  assert.equal(status, 0);
  assert.match(stdout, /--dir\b/);
  assert.match(stdout, /--mode\b/);
});

test('--version prints the package version', () => {
  const { status, stdout } = runCli(['--version']);
  assert.equal(status, 0);
  assert.equal(stdout.trim(), pkg.version);
});

test('a directory with no raw files errors and creates no output dir', () => {
  const dir = tmpDir();
  try {
    const inDir = path.join(dir, 'in');
    const outDir = path.join(dir, 'out');
    fs.mkdirSync(inDir);
    const { status } = runCli(['--dir', inDir, '--dir-out', outDir, '--mode', 'raw']);
    assert.notEqual(status, 0);
    assert.equal(fs.existsSync(outDir), false, 'no output dir when there is nothing to convert');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an existing absolute --dir-out is refused', () => {
  const dir = tmpDir();
  try {
    const inDir = path.join(dir, 'in');
    const outDir = path.join(dir, 'out');
    fs.mkdirSync(inDir);
    fs.mkdirSync(outDir); // already exists
    makeRaw(path.join(inDir, 'A.raw'), { frame: 0 });
    const { status, stderr } = runCli(['--dir', inDir, '--dir-out', outDir, '--mode', 'raw']);
    assert.notEqual(status, 0);
    assert.match(stderr, /already exists/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a default (relative) output directory auto-increments on reuse', () => {
  const dir = tmpDir();
  try {
    const inDir = path.join(dir, 'in');
    fs.mkdirSync(inDir);
    makeRaw(path.join(inDir, 'A.raw'), { frame: 0 });

    const first = runCli(['--dir', inDir, '--mode', 'raw']);
    const second = runCli(['--dir', inDir, '--mode', 'raw']);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);

    const outputDirs = fs.readdirSync(inDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    assert.equal(outputDirs.length, 2, `expected two auto-incremented output dirs, got ${outputDirs}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
