#!/usr/bin/env node
var fs = require('fs');
var path = require('path');
var execSync = require('child_process').execSync;

var testsDir = __dirname;
var inDir = path.join(testsDir, 'in');
var refDir = path.join(testsDir, 'reference');
var pprc = path.join(testsDir, '..', 'index.js');
var tmpBase = path.join(require('os').tmpdir(), 'pprc-test-' + Date.now());

var modes = [
  { name: 'no-invert', flags: '--no-invert' },
  { name: 'gamma1', flags: '--gamma1 --no-invert' },
  { name: 'e6', flags: '--e6' },
  { name: 'bw', flags: '--bw' },
  { name: 'bw-rgb', flags: '--bw-rgb' },
  { name: 'default', flags: '' },
  { name: 'per-image-balancing', flags: '--per-image-balancing' },
];

var rawFiles = fs.readdirSync(inDir).filter(function(f) { return f.endsWith('.raw'); });
var failures = [];
var passed = 0;

fs.mkdirSync(tmpBase, { recursive: true });

modes.forEach(function(mode) {
  var outDir = path.join(tmpBase, mode.name);

  // Run pprc
  try {
    execSync(
      'node ' + pprc + ' ' + mode.flags + ' --output-dir ' + outDir,
      { cwd: inDir, stdio: 'pipe' }
    );
  } catch (e) {
    failures.push(mode.name + ': pprc failed - ' + e.stderr.toString().trim());
    return;
  }

  // Compare each output file against reference
  rawFiles.forEach(function(rawFile) {
    var baseName = rawFile.replace('.raw', '.tif');
    var refFile = path.join(refDir, mode.name, baseName);
    var outFile = path.join(outDir, baseName);

    if (!fs.existsSync(refFile)) {
      failures.push(mode.name + '/' + baseName + ': reference file missing');
      return;
    }
    if (!fs.existsSync(outFile)) {
      failures.push(mode.name + '/' + baseName + ': output file missing');
      return;
    }

    var refBuf = fs.readFileSync(refFile);
    var outBuf = fs.readFileSync(outFile);

    if (refBuf.equals(outBuf)) {
      passed++;
    } else {
      failures.push(mode.name + '/' + baseName + ': bytes differ (ref=' + refBuf.length + ' out=' + outBuf.length + ')');
    }
  });
});

// Cleanup
execSync('rm -rf ' + tmpBase);

// Report
console.log(passed + ' passed, ' + failures.length + ' failed');
if (failures.length > 0) {
  failures.forEach(function(f) { console.error('  FAIL: ' + f); });
  process.exit(1);
}
