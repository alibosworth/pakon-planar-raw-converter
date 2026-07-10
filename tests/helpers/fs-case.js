// Probe whether `dir` sits on a case-sensitive filesystem, at runtime. Case
// sensitivity is a per-volume/per-mount property, not a per-OS one (macOS APFS
// can be case-sensitive; Linux and Windows volumes can be either), so this must
// be tested where the files will actually live rather than inferred from
// process.platform. Returns true if `FOO` and `foo` are distinct entries.
import fs from 'node:fs';
import path from 'node:path';

export function isCaseSensitiveFS(dir) {
  const upper = path.join(dir, '.pprc-case-probe-UPPER');
  const lower = path.join(dir, '.pprc-case-probe-upper');
  fs.writeFileSync(upper, '');
  try {
    // If the lower-cased name resolves to the file we just wrote, the FS folds
    // case (case-insensitive); if not, the two names are distinct.
    return !fs.existsSync(lower);
  } finally {
    fs.rmSync(upper, { force: true });
  }
}
