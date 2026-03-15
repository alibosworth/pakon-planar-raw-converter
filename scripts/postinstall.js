#!/usr/bin/env node

if (process.env.npm_config_global !== 'true') return;

var pkg = require('../package.json');
var cyan = '\x1b[36m';
var reset = '\x1b[0m';

console.log('\n  PPRC (v' + pkg.version + ') installed globally. Run ' + cyan + 'pprc' + reset + ' within a folder of Pakon .raw files or ' + cyan + 'pprc --help' + reset + ' for info.');

if (process.platform === 'darwin') {
  console.log('  On macOS, run ' + cyan + 'pprc --install-quick-action' + reset + ' to add a right-click option in Finder.');
}

console.log('');
