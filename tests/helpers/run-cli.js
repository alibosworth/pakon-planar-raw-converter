// Run the pprc CLI (index.js) in a child process and capture its result.
// Returns { status, stdout, stderr }. Update-notifier is disabled so its
// network check and output never interfere with assertions.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const INDEX = path.resolve(fileURLToPath(new URL('../../index.js', import.meta.url)));

export function runCli(args, opts = {}) {
  const result = spawnSync('node', [INDEX, ...args], {
    encoding: 'utf8',
    ...opts,
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1', ...(opts.env || {}) },
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}
