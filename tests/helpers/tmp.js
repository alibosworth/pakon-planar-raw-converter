// Create a uniquely named temporary directory owned by the calling test.
// Callers should remove it (fs.rmSync(dir, { recursive: true, force: true }))
// in a finally block.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function tmpDir(prefix = 'pprc-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
