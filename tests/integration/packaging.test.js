import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const pkg = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

// `npm pack` decides what actually ships. The published tarball must carry the
// runnable code and both bin entry points while leaving private working notes,
// tests, and other local scaffolding out.
test('npm pack ships the code and excludes private/test scaffolding', () => {
  // Run through a shell: on Windows npm is npm.cmd, and Node refuses to spawn
  // .cmd/.bat directly (EINVAL) unless shell:true.
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: repoRoot, encoding: 'utf8', shell: true });
  const files = JSON.parse(out)[0].files.map((f) => f.path);

  // The runnable pieces are present.
  assert.ok(files.includes('index.js'), 'index.js must ship');
  assert.ok(files.some((f) => f.startsWith('lib/')), 'lib/ must ship');
  assert.ok(files.includes('package.json'), 'package.json must ship');

  // Both bin names resolve to a file that is actually in the tarball.
  for (const target of Object.values(pkg.bin)) {
    assert.ok(files.includes(target), `bin target ${target} must be packaged`);
  }

  // Local-only scaffolding stays out.
  assert.ok(!files.some((f) => f.startsWith('private/')), 'private/ must not ship');
  assert.ok(!files.some((f) => f.startsWith('tests/')), 'tests/ must not ship');
  assert.ok(!files.some((f) => f === 'AGENTS.md' || f.endsWith('/AGENTS.md')), 'AGENTS.md must not ship');
});
