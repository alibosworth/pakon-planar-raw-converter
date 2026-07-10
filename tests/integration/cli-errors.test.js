import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { runCli } from '../helpers/run-cli.js';
import { tmpDir } from '../helpers/tmp.js';

// #7 — a file passed to --dir must produce a concise error, not a raw Node
// ENOTDIR stack trace (readdirSync used to run before the error funnel).
test('a file passed to --dir produces a concise error, not a stack trace', () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'not-a-dir.raw');
    fs.writeFileSync(file, 'x');

    const { status, stderr } = runCli(['--dir', file, '--mode', 'raw']);

    assert.equal(status, 1, 'should exit 1 for a user/input error');
    assert.doesNotMatch(stderr, /ENOTDIR|node:internal|\n\s+at /, `no raw stack trace. stderr:\n${stderr}`);
    assert.match(stderr, /ERROR:/, 'concise ERROR: message');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
