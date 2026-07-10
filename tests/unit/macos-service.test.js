import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildShellCommand } from '../../lib/macos-service.js';

// #1 — the generated Quick Action script must pass the selected folder path to
// pprc without letting apostrophes, spaces, or shell metacharacters in the name
// break the command or inject into it.
test('the Quick Action script quotes the folder path safely', () => {
  const cmd = buildShellCommand('pprc');

  // A quoted heredoc so the shell expands nothing into the AppleScript source.
  assert.match(cmd, /<<'APPLESCRIPT'/, 'uses a quoted heredoc');
  // The path is handed to osascript as an argument, not spliced into the source.
  assert.match(cmd, /osascript - "\$f"/, 'passes the path as an osascript argument');
  // AppleScript shell-quotes it safely before running it in Terminal.
  assert.match(cmd, /quoted form of/, 'uses AppleScript quoted form of');
  // The old unsafe interpolation into single quotes is gone.
  assert.doesNotMatch(cmd, /'\$f'/, 'does not wrap the raw path in single quotes');
});
