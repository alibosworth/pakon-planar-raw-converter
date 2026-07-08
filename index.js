#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';

var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);

import pkg from './package.json' with { type: 'json' };
import atlasPkg from '@alibosworth/atlas-node/package.json' with { type: 'json' };

// Handle --postinstall before loading heavy dependencies
if (process.argv.includes('--postinstall')) {
  var cyan = '\x1b[36m';
  var reset = '\x1b[0m';
  var lines = [
    '   pprc  v' + pkg.version,
    '   Pakon Raw → 16-bit TIFF',
  ];
  var width = Math.max.apply(null, lines.map(function(l) { return l.length; })) + 2;
  console.log(cyan + '╔' + '═'.repeat(width) + '╗');
  lines.forEach(function(l) { console.log('║' + l + ' '.repeat(width - l.length) + '║'); });
  console.log('╚' + '═'.repeat(width) + '╝' + reset);
  console.log('\n  Installed globally. Run ' + cyan + 'pprc' + reset + ' within a folder of Pakon .raw files.');
  console.log('  ' + cyan + 'pprc --help' + reset + ' for command reference or ' + cyan + 'pprc --examples' + reset + ' for examples.');
  if (process.platform === 'darwin') {
    console.log('  On macOS, run ' + cyan + 'pprc --install-quick-action' + reset + ' to add a right-click option in Finder.');
  }
  console.log('');
  process.exit(0);
}

var processStart = Date.now();
var DEBUG = process.env.DEBUG === 'pprc';

// Check for updates in the background (respects alpha/beta channels)
import updateNotifier from 'update-notifier';
var distTag = pkg.version.includes('alpha') ? 'alpha'
            : pkg.version.includes('beta') ? 'beta'
            : 'latest';
var updateCheckInterval = distTag === 'alpha' ? 1000 * 60 * 60
                        : distTag === 'beta'  ? 1000 * 60 * 60 * 12
                        : 1000 * 60 * 60 * 24;
updateNotifier({ pkg, distTag, updateCheckInterval }).notify({ isGlobal: true });

var [{ Worker }, { processBuffers, saveProfile, loadProfile, contrastStretch }, { Command, Help, Option }, { writeTiff16 }] = await Promise.all([
  import('worker_threads'),
  import('@alibosworth/atlas-node'),
  import('commander'),
  import('./lib/write-tiff.js')
]);

var bannerLines = [
  `   pprc  v${pkg.version}`,
  '   Pakon Raw → 16-bit TIFF',
  '   Inverts images and removes orange mask',
  '   Run this tool within a folder of .raw files',
  '   Run pprc --help for options'
];
var bannerWidth = Math.max(...bannerLines.map(l => l.length)) + 2;
console.log(`\x1b[36m╔${'═'.repeat(bannerWidth)}╗`);
bannerLines.forEach(l => console.log(`║${l.padEnd(bannerWidth)}║`));
console.log(`╚${'═'.repeat(bannerWidth)}╝\x1b[0m`);

var OUTPUT_DIR = "out";

var STANDARD_DIMENSIONS = ["3000x2000", "2250x1500", "1500x1000"];

var BYTE_SIZE_TO_DIMENSIONS = { // Fallback map of file size to dimensions for headerless files
  "36000000": "3000x2000",     // "Base 16"
  "20250000": "2250x1500",     // "Base 8"
  "9000000" : "1500x1000"      // "Base 4"
};

var HEADER_SIZE = 16;
var BYTES_PER_CHANNEL = 2; // 16-bit

var GROUP_HEADERS = {
  '--dir': 'Input/Output:',
  '--mode': 'Processing Mode:',
  '--per-image-balancing': 'Tuning:',
  '--save-profile': 'Profiles:',
  '--save-config': 'Utility:',
  '--no-negfix': 'Deprecated:',
  '-V': '',
  '-h': '',
};

var program = new Command();
program
  .name('pprc')
  .option('--dir <dir>', 'Directory containing .raw files to process (default: current directory)')
  .option('--dir-out <dir>', `Output directory (use INPUT_DIR for input folder name, start with '../' to place beside input)`, OUTPUT_DIR)
  .addOption(new Option('--output-dir <dir>', `Specify the output directory name`).hideHelp())
  .addOption(new Option('--mode <modes>', 'Processing mode(s) — comma-separated, e.g. --mode raw,e6').argParser(function(val, acc) {
    return (Array.isArray(acc) ? acc : []).concat(val.split(',').map(function(s) { return s.trim(); }).filter(Boolean));
  }).default([], 'negative'))
  .option('--per-image-balancing', 'Compute a separate inversion profile for each image instead of sharing')
  .option('--no-frame-rejection', 'Disable outlier frame rejection when computing shared inversion profile')
  .addOption(new Option('--exclude-files-from-profile <list>', 'Comma-separated input file names to hold out of the shared profile (bypasses automatic frame rejection)').hideHelp())
  .addOption(new Option('--black-point-mode <mode>', 'EXPERIMENT: black-point pedestal derivation (A/B for the inherited 0.95 constant)').choices(['current', 'floor', 'zero']).hideHelp())
  .addOption(new Option('--min-anchor <mode>', 'Shared white-side (channel-mins) anchor — median (default) fixes the per-channel floor deficit; extreme = legacy absolute-min').choices(['median', 'extreme', 'second', 'p10']).hideHelp())
  .addOption(new Option('--slope-source <mode>', 'EXPERIMENT: cross-channel slope-ratio estimator — composite endpoints vs median of per-frame implied gammas (orange-mask/gamma color numbers)').choices(['endpoints', 'median']).hideHelp())
  .option('--clip-black <percent>', 'Clip darkest N% to black during contrast stretch (default: 0.001)', parseFloat)
  .option('--clip-white <percent>', 'Clip brightest N% to white during contrast stretch (default: 0.001)', parseFloat)
  .option('--clip <percent>', 'Clip both black and white ends by N% during contrast stretch', parseFloat)
  .option('--output-gamma <value>', 'Output tone gamma applied to the inverted image (default: 2.15)', parseFloat)
  .option('--no-stretch', 'Disable contrast stretch during inversion (default: enabled)')
  .option('--border-exclude <percent>', 'Exclude outer N% of image from profiling and contrast stretch (default: 2)', parseFloat)
  .option('--pixel-rejection-percentage <percent>', 'Ignore brightest/darkest N% of pixels when profiling (default: 0.1)', parseFloat)
  .addOption(new Option('--colorspace-input <space>', 'Input RGB primaries (default: adobergb)').choices(['srgb', 'adobergb', 'rec2020', 'prophoto', 'acescg']))
  .addOption(new Option('--colorspace-working <space>', 'Working RGB primaries used during processing (default: adobergb)').choices(['srgb', 'adobergb', 'rec2020', 'prophoto', 'acescg']))
  .addOption(new Option('--colorspace-output <space>', 'Output RGB primaries written to TIFFs (default: adobergb)').choices(['srgb', 'adobergb', 'rec2020', 'prophoto', 'acescg']))
  .option('--save-profile <name>', 'Analyze input files, save inversion profile to ~/.pprc/, then exit')
  .option('--profile <name>', 'Use a previously saved inversion profile from ~/.pprc/')
  .option('--save-config [name]', 'Save current options to ~/.pprc/configs/default.json (or <name>.json) and exit')
  .option('--use-config <name>', 'Use a named config from ~/.pprc/configs/<name>.json instead of default')
  .addOption(new Option('--install-quick-action', 'Install macOS Finder right-click Quick Action for folders').hideHelp(process.platform !== 'darwin'))
  .addOption(new Option('--uninstall-quick-action', 'Remove the macOS Finder Quick Action').hideHelp(process.platform !== 'darwin'))
  .option('--examples', 'Show usage examples')
  .addOption(new Option('--debug-srgb-encode-output', 'Debug: pass srgbEncodeOutput=true to atlas').hideHelp())
  .option('--no-negfix', '[deprecated: use --mode raw] Skip negative inversion')
  .option('--dimensions <widthxheight>', '[deprecated] Manually specify pixel dimensions for headerless raw files (e.g. "4000x2000")')
  .option('--e6', '[deprecated: use --mode e6] Process slide film')
  .option('--bw', '[deprecated: use --mode bw] Black & white greyscale')
  .option('--bw-rgb', '[deprecated: use --mode bw-rgb] Black & white RGB')
  .version(pkg.version)
  .helpOption('-h, --help', 'Display this help screen')
  .configureHelp({
    formatHelp(cmd, helper) {
      var defaultFormat = Help.prototype.formatHelp.call(helper, cmd, helper);
      var lines = defaultFormat.split('\n');
      var result = [];
      var printedHeaders = {};
      for (var line of lines) {
        var trimmed = line.trim();
        for (var flag of Object.keys(GROUP_HEADERS)) {
          if (trimmed.startsWith(flag)) {
            var header = GROUP_HEADERS[flag];
            if (!printedHeaders[header]) {
              result.push('');
              result.push(`  ${header}`);
              printedHeaders[header] = true;
            }
            break;
          }
        }
        result.push(line);
        // Add mode descriptions after the --mode line
        if (trimmed.startsWith('--mode')) {
          var pad = '                                                  ';
          result.push(pad + 'negative  Invert color negative, remove orange mask (default)');
          result.push(pad + 'raw       Output linear raw tiffs for processing with another tool');
          result.push(pad + 'e6        Slide film — no inversion, apply contrast stretch');
          result.push(pad + 'bw        Black & white — invert, contrast stretch, greyscale output');
          result.push(pad + 'bw-rgb    Black & white — invert, contrast stretch, RGB output');
        }
      }
      return result.join('\n');
    },
  })
  .addHelpText('before', 'Converts 16-bit Planar Raw files from TLXClientDemo into inverted TIFF images\nwith the orange mask removed. Process a whole roll together for best results.\nIn TLXClientDemo, save with "Planar" format and "Add File Header" enabled to \nproduce .raw files to process.\n')
  .addHelpText('after', '\nRun pprc --examples for usage examples.')
  .parse(process.argv);

var opts = program.opts();

// Support deprecated --output-dir as alias for --dir-out
if (opts.outputDir) {
  opts.dirOut = opts.outputDir;
}

// Output files are written asynchronously (workers + atlas), so their on-disk
// timestamps land in arbitrary order. Downstream tools (Lightroom, Capture One)
// that carry no EXIF capture time fall back to the file date, so we always
// restamp outputs in frame order after writing. 1s spacing is a synthetic
// timeline decoupled from wall-clock, so a 3s run still yields cleanly spaced
// mtimes. See applySequentialTimestamps().
var SEQUENCE_STEP_SECONDS = 1;

// Load pprc config (~/.pprc/configs/default.json or named config)
var pprcConfigDir   = path.join(os.homedir(), '.pprc');
var pprcProfilesDir = path.join(pprcConfigDir, 'profiles');
var pprcConfigsDir  = path.join(pprcConfigDir, 'configs');
var defaultConfigPath = path.join(pprcConfigsDir, 'default.json');


// Reject invalid flag combinations before any config path resolution or file I/O
if (opts.useConfig && opts.saveConfig) {
  exitWithError('--use-config and --save-config cannot be used together.\n  To load a config: pprc --use-config <name>\n  To save a config: pprc --save-config [name]');
}

// Validate --use-config name before any filesystem use
if (opts.useConfig) validateProfileName(opts.useConfig, '--use-config');

var pprcConfigPath = opts.useConfig
  ? path.join(pprcConfigsDir, opts.useConfig + '.json')
  : defaultConfigPath;
var pprcConfig = {};

if (opts.useConfig && !fs.existsSync(pprcConfigPath)) {
  exitWithError(
    `Config '${opts.useConfig}' not found.\n` +
    `Expected: ${pprcConfigPath}\n` +
    `Run pprc with \x1b[1m--save-config ${opts.useConfig}\x1b[0m to create it.`
  );
}

if (fs.existsSync(pprcConfigPath)) {
  try {
    var { metadata, ...parsedConfig } = JSON.parse(fs.readFileSync(pprcConfigPath, 'utf8'));
    pprcConfig = parsedConfig;
  } catch (e) {
    var isUtilityCommand = opts.saveConfig || opts.examples || opts.installQuickAction || opts.uninstallQuickAction;
    if (isUtilityCommand) {
      console.warn(`Warning: Could not parse config file ${pprcConfigPath}: ${e.message} (ignored)`);
    } else {
      var repairCmd = opts.useConfig ? `pprc --save-config ${opts.useConfig}` : `pprc --save-config`;
      exitWithError(
        `Could not parse config file ${pprcConfigPath}: ${e.message}\n` +
        `Run \x1b[1m${repairCmd}\x1b[0m to regenerate a valid config.`
      );
    }
  }

  // Map of config keys to their commander option names and CLI flag names
  // Each entry: [commander option name, CLI flag string]
  var CONFIG_KEYS = {
    dirOut:            ['dirOut',            '--dir-out'],
    mode:              ['mode',              '--mode'],
    perImageBalancing: ['perImageBalancing',  '--per-image-balancing'],
    noFrameRejection:  ['frameRejection',    '--no-frame-rejection'],
    clip:              ['clip',              '--clip'],
    clipBlack:         ['clipBlack',         '--clip-black'],
    clipWhite:         ['clipWhite',         '--clip-white'],
    outputGamma:       ['outputGamma',       '--output-gamma'],
    noStretch:         ['stretch',           '--no-stretch'],
    borderExclude:     ['borderExclude',     '--border-exclude'],
    pixelRejectionPercentage: ['pixelRejectionPercentage', '--pixel-rejection-percentage'],
    colorspaceInput:   ['colorspaceInput',   '--colorspace-input'],
    colorspaceWorking: ['colorspaceWorking', '--colorspace-working'],
    colorspaceOutput:  ['colorspaceOutput',  '--colorspace-output'],
    profile:                  ['profile',                  '--profile'],
  };

  // Boolean flags where config key is the negated form (noInvert -> invert=false)
  var NEGATED_BOOLEANS = { noFrameRejection: 'frameRejection', noStretch: 'stretch' };

  var activeLines = [];
  var overriddenLines = [];

  for (var [configKey, [optName, cliFlag]] of Object.entries(CONFIG_KEYS)) {
    if (pprcConfig[configKey] === undefined) continue;

    var configVal = pprcConfig[configKey];

    // Check if CLI explicitly set this option
    var isFromCli = program.getOptionValueSource(optName) === 'cli';
    if (configKey === 'dirOut' && opts.outputDir) isFromCli = true;

    if (!isFromCli) {
      // Apply config value
      if (NEGATED_BOOLEANS[configKey]) {
        opts[NEGATED_BOOLEANS[configKey]] = !configVal;
      } else {
        opts[optName] = configVal;
      }
      activeLines.push(`  ${configKey}: ${configVal}`);
    } else {
      var currentVal = NEGATED_BOOLEANS[configKey] ? !opts[NEGATED_BOOLEANS[configKey]] : opts[optName];
      overriddenLines.push(`  ${configKey}: ${configVal} \x1b[2m(overridden by ${cliFlag} ${currentVal})\x1b[0m`);
    }
  }

  if (activeLines.length > 0 || overriddenLines.length > 0) {
    var configLabel = opts.useConfig
      ? `\x1b[3mUsing pprc config '${opts.useConfig}' (${pprcConfigPath}):`
      : `\x1b[3mUsing pprc default config (${pprcConfigPath}):`;
    var configLines = [configLabel];
    configLines.push(...activeLines, ...overriddenLines);
    console.log(configLines.join('\n') + '\x1b[0m');
  }
}

if (opts.installQuickAction) {
  var macosService = await import('./lib/macos-service.js');
  macosService.install();
  process.exit(0);
}

if (opts.uninstallQuickAction) {
  var macosService = await import('./lib/macos-service.js');
  macosService.uninstall();
  process.exit(0);
}

if (opts.examples) {
  console.log(`
Examples:

  Basic usage — run from a folder of .raw files (output: out/):
    pprc

  Process a specific directory of .raw files (output: /path/to/raw/files/out/):
    pprc --dir /path/to/raw/files

  Custom output name with template (output: /path/to/raw/files/files_inverted/):
    pprc --dir /path/to/raw/files --dir-out INPUT_DIR_inverted

  Output beside the input folder instead of inside it:
    pprc --dir-out ../INPUT_DIR_pprc_out

  Output to an absolute path:
    pprc --dir-out /path/to/output

  Skip inversion — useful if you want to invert with another tool:
    pprc --mode raw

  Process slide film (E6) scans — no inversion needed, apply contrast stretch:
    pprc --mode e6

  Process black and white film — invert and apply contrast stretch in greyscale:
    pprc --mode bw

  Per-image balancing — useful when frames on a roll have very different exposures:
    pprc --per-image-balancing

  Reduce contrast stretch clipping — for rolls with low-density frames:
    pprc --clip 0.01

  Aggressive clipping for a punchier, minilab-style look:
    pprc --clip 2.5

  Clip shadows and highlights separately:
    pprc --clip-black 0.5 --clip-white 0.1

  Custom output gamma (default 2.15):
    pprc --output-gamma 2.5

  Disable contrast stretch:
    pprc --no-stretch

  Exclude outer 5% of image from profiling:
    pprc --border-exclude 5

  Include all frames in color balancing, even outliers:
    pprc --no-frame-rejection

  Analyze a roll and save its profile for reuse:
    pprc --save-profile portra400

  Use a previously saved profile:
    pprc --profile portra400

  Save current options as global defaults:
    pprc --clip 2.5 --save-config

  Save options as a named config (e.g. for black & white shooting):
    pprc --mode bw --clip 1.0 --save-config bw

  Use a named config:
    pprc --use-config bw

  Install macOS Finder Quick Action — right-click folders to process:
    pprc --install-quick-action

  Remove the Finder Quick Action:
    pprc --uninstall-quick-action
`);
  process.exit(0);
}

// Normalize --mode into an array. It may arrive as an array (CLI flags),
// a string (config file value), or undefined.
if (typeof opts.mode === 'string') {
  opts.mode = opts.mode.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
}
if (!Array.isArray(opts.mode)) opts.mode = [];

// Handle deprecated flags — each maps to the equivalent mode
if (opts.negfix === false) {
  console.warn("Warning: --no-negfix is deprecated, use --mode raw instead");
  opts.mode = opts.mode.concat('raw');
}
if (opts.invert === false && program.getOptionValueSource('invert') !== 'default') {
  console.warn("Warning: --no-invert is deprecated, use --mode raw instead");
  opts.mode = opts.mode.concat('raw');
}
if (opts.e6 && program.getOptionValueSource('e6') !== 'default') {
  console.warn("Warning: --e6 is deprecated, use --mode e6 instead");
  opts.mode = opts.mode.concat('e6');
}
if (opts.bw && program.getOptionValueSource('bw') !== 'default') {
  console.warn("Warning: --bw is deprecated, use --mode bw instead");
  opts.mode = opts.mode.concat('bw');
}
if (opts.bwRgb && program.getOptionValueSource('bwRgb') !== 'default') {
  console.warn("Warning: --bw-rgb is deprecated, use --mode bw-rgb instead");
  opts.mode = opts.mode.concat('bw-rgb');
}

// Resolve the final, deduped, validated list of modes to run
var VALID_MODES = ['negative', 'raw', 'e6', 'bw', 'bw-rgb'];
var modes = opts.mode.length ? opts.mode.slice() : ['negative'];
modes = modes.filter(function(m, i) { return modes.indexOf(m) === i; });
modes.forEach(function(m) {
  if (VALID_MODES.indexOf(m) === -1) {
    exitWithError(`Unknown mode '${m}'. Valid modes: ${VALID_MODES.join(', ')}.`);
  }
});
var multiMode = modes.length > 1;
var hasNegative = modes.indexOf('negative') !== -1;
// raw-only run: let the workers write TIFFs directly and skip returning the
// (large) decoded buffers to the main thread. Any other mode — including
// multi-mode that involves raw — needs the buffer to feed its transform.
var rawWriteThrough = modes.length === 1 && modes[0] === 'raw';

if (modes.length === 1 && modes[0] === 'raw') {
  var ignoredInRaw = [];
  if (opts.outputGamma !== undefined)               ignoredInRaw.push('--output-gamma');
  if (opts.clip !== undefined)                      ignoredInRaw.push('--clip');
  if (opts.clipBlack !== undefined)                 ignoredInRaw.push('--clip-black');
  if (opts.clipWhite !== undefined)                 ignoredInRaw.push('--clip-white');
  if (opts.borderExclude !== undefined)             ignoredInRaw.push('--border-exclude');
  if (opts.pixelRejectionPercentage !== undefined)  ignoredInRaw.push('--pixel-rejection-percentage');
  if (opts.perImageBalancing)                       ignoredInRaw.push('--per-image-balancing');
  if (opts.frameRejection === false)                ignoredInRaw.push('--no-frame-rejection');
  if (opts.stretch === false)                       ignoredInRaw.push('--no-stretch');
  if (opts.colorspaceInput !== undefined)           ignoredInRaw.push('--colorspace-input');
  if (opts.colorspaceWorking !== undefined)         ignoredInRaw.push('--colorspace-working');
  if (opts.colorspaceOutput !== undefined)          ignoredInRaw.push('--colorspace-output');
  if (opts.profile)                                 ignoredInRaw.push('--profile');
  if (opts.saveProfile)                             ignoredInRaw.push('--save-profile');
  if (ignoredInRaw.length > 0) {
    var verb = ignoredInRaw.length === 1 ? 'is' : 'are';
    console.warn(`\x1b[33mWarning: ${ignoredInRaw.join(', ')} ${verb} ignored with --mode raw (raw mode writes linear sensor data unmodified).\x1b[0m`);
  }
}

function validateProfileName(name, flag) {
  if (!name || /[/\\:*?"<>|\x00\s]/.test(name) || name === '.' || name === '..') {
    exitWithError(`Invalid profile name '${name}' for ${flag}. Use a simple name with no path separators or special characters (e.g. portra400).`);
  }
}

// Parse the (undocumented) --exclude-files-from-profile list into file-name
// stems (directory and extension stripped) for extension-insensitive matching
// against the input .raw set. atlas matches the same way on its side.
function parseExcludeFromProfile(str) {
  if (!str) return [];
  return str.split(',')
    .map(function(s) { return s.trim(); })
    .filter(Boolean)
    .map(function(s) { return path.parse(s.replace(/\\/g, '/')).name; });
}

if (opts.saveProfile) validateProfileName(opts.saveProfile, '--save-profile');
if (opts.profile)     validateProfileName(opts.profile,     '--profile');

// --exclude-files-from-profile only makes sense for a shared profile. In
// per-image mode each frame gets its own profile, so there is nothing to
// exclude from.
if (opts.excludeFilesFromProfile && opts.perImageBalancing) {
  exitWithError('--exclude-files-from-profile cannot be combined with --per-image-balancing (per-image mode computes a separate profile per frame, so there is no shared profile to exclude from).');
}

var loadedProfile = null;
if (opts.profile) {
  loadedProfile = loadProfile(opts.profile, pprcProfilesDir);
  if (!loadedProfile) {
    exitWithError(`Profile '${opts.profile}' not found.\nExpected: ${path.join(pprcProfilesDir, opts.profile + '.json')}\nRun pprc on a set of scans with \x1b[1m--save-profile ${opts.profile}\x1b[0m to create it.`);
  }
  console.log(`\x1b[3mUsing profile '${opts.profile}'\x1b[0m`);
}

if (opts.saveConfig) {
  var saveConfigName = typeof opts.saveConfig === 'string' ? opts.saveConfig : null;
  if (saveConfigName) validateProfileName(saveConfigName, '--save-config');
  var saveConfigPath = saveConfigName
    ? path.join(pprcConfigsDir, saveConfigName + '.json')
    : defaultConfigPath;

  var config = {
    metadata: {
      pprcVersion: pkg.version,
      createdAt: new Date().toISOString(),
      _note: saveConfigName
        ? `pprc named config '${saveConfigName}'. Load with --use-config ${saveConfigName}. CLI flags override these values.`
        : 'pprc default config. CLI flags override these values.',
    },
  };

  if (opts.dirOut !== OUTPUT_DIR)     config.dirOut = opts.dirOut;
  if (!(modes.length === 1 && modes[0] === 'negative')) config.mode = modes;
  if (opts.perImageBalancing)          config.perImageBalancing = true;
  if (opts.frameRejection === false)   config.noFrameRejection = true;
  if (opts.clip !== undefined)         config.clip = opts.clip;
  if (opts.clipBlack !== undefined)    config.clipBlack = opts.clipBlack;
  if (opts.clipWhite !== undefined)    config.clipWhite = opts.clipWhite;
  if (opts.outputGamma !== undefined)  config.outputGamma = opts.outputGamma;
  if (opts.stretch === false)          config.noStretch = true;
  if (opts.borderExclude !== undefined) config.borderExclude = opts.borderExclude;
  if (opts.pixelRejectionPercentage !== undefined) config.pixelRejectionPercentage = opts.pixelRejectionPercentage;
  if (opts.colorspaceInput !== undefined)   config.colorspaceInput   = opts.colorspaceInput;
  if (opts.colorspaceWorking !== undefined) config.colorspaceWorking = opts.colorspaceWorking;
  if (opts.colorspaceOutput !== undefined)  config.colorspaceOutput  = opts.colorspaceOutput;
  if (opts.profile)                    config.profile = opts.profile;

  if (!fs.existsSync(pprcConfigsDir)) {
    fs.mkdirSync(pprcConfigsDir, { recursive: true });
  }
  fs.writeFileSync(saveConfigPath, JSON.stringify(config, null, 2) + '\n');
  var savedLabel = saveConfigName
    ? `Config '${saveConfigName}' saved to ${saveConfigPath}`
    : `Default config saved to ${saveConfigPath}`;
  console.log(savedLabel);
  if (opts.profile) {
    var runsScope = saveConfigName
      ? `all runs using the '${saveConfigName}' config`
      : 'all future runs';
    console.warn(`\x1b[33mWarning: inversion profile '${opts.profile}' will be applied to ${runsScope}. Remove it from the config to use dynamic per-run analysis in the future.\x1b[0m`);
  }
  process.exit(0);
}

// True when no requested mode needs ATLAS inversion (drives the convert label
// and whether the run log records the inversion engine).
var noInvert = !hasNegative;

// Resolve input directory and output paths
var inputDir = opts.dir ? path.resolve(opts.dir) : process.cwd();
var dirBaseName = path.basename(inputDir);
var outputDir;

// Replace INPUT_DIR template in --dir-out value
var dirOutValue = opts.dirOut.replace(/INPUT_DIR/g, dirBaseName);

// Normalize backslashes to forward slashes for cross-platform support (Windows ..\)
dirOutValue = dirOutValue.replace(/\\/g, '/');

// Catch likely typo: "..foo" instead of "../foo" would create a hidden directory
if (/^\.\.(?!\.)/.test(dirOutValue) && !dirOutValue.startsWith('../')) {
  exitWithError(`--dir-out '${opts.dirOut}' would create a hidden directory '${dirOutValue}'. Did you mean '../${dirOutValue.slice(2)}'?`);
}

if (path.isAbsolute(dirOutValue)) {
  // Absolute path — use as-is
  outputDir = dirOutValue;
} else {
  // Relative path — resolve from inside the input dir
  outputDir = path.resolve(inputDir, dirOutValue);
}

// Auto-increment output dir if it already exists (not for absolute paths)
var usingAbsoluteOutputDir = path.isAbsolute(dirOutValue);
if (!usingAbsoluteOutputDir && fs.existsSync(outputDir)) {
  var baseOutputDir = outputDir;
  var n = 2;
  while (fs.existsSync(outputDir)) {
    outputDir = baseOutputDir + '_' + n;
    n++;
  }
  console.log(`Output directory exists, using '${path.basename(outputDir)}' instead.`);
}

// Validate input directory exists (and is a directory) before creating any output dirs
if (opts.dir && !fs.existsSync(inputDir)) {
  exitWithError(`Directory not found: '${inputDir}'`);
}
if (opts.dir && !fs.statSync(inputDir).isDirectory()) {
  exitWithError(`Not a directory: '${inputDir}'`);
}

(function() {
  var startTime = Date.now();
  var startupMs = startTime - processStart;
  if (multiMode) {
    console.log(`Multiple modes requested (${modes.join(', ')}) — each mode will go in its own subdirectory in the output directory.`);
  }
  var rawFiles = scanDirectoryForFiles();
  var usableRawFiles = checkRawFiles(rawFiles);

  // Validate --exclude-files-from-profile against the actual input set up front
  // (before the expensive conversion). Any name that matches no input file is a
  // typo — hard-error rather than silently exclude nothing.
  var excludeFromProfileStems = parseExcludeFromProfile(opts.excludeFilesFromProfile);
  if (excludeFromProfileStems.length > 0) {
    var inputStems = new Set(Object.keys(usableRawFiles).map(function(n) { return path.parse(n).name; }));
    var unmatched = excludeFromProfileStems.filter(function(s) { return !inputStems.has(s); });
    if (unmatched.length > 0) {
      exitWithError(`--exclude-files-from-profile: no input file matches ${unmatched.map(function(s) { return `'${s}'`; }).join(', ')}.\n  Listed names are matched against input .raw files by name (extension optional). Check for typos.`);
    }
  }

  // Inputs are validated — only now create the output dir (or error if an
  // explicit absolute path already exists), so failed runs don't leave empty
  // auto-incremented directories behind.
  // A --save-profile negative run analyses and exits without image output, so it
  // needs no output directory — don't create (or auto-increment) one for it.
  var profileOnlyRun = opts.saveProfile && hasNegative;
  if (fs.existsSync(outputDir)){
    if (usingAbsoluteOutputDir) {
      exitWithError(`Output directory '${outputDir}' already exists. Please remove or rename it before running again.`);
    }
  } else if (!profileOnlyRun) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  var scanTime = Date.now();
  var convertTime;
  convertRawFilesToTiff(usableRawFiles).then(function(buffers){
    process.stdout.write("\n");
    convertTime = Date.now();

    // --save-profile is a negative-inversion concept; honor it only when the
    // negative mode is in play (matches pre-multi-mode behavior), then exit.
    if (opts.saveProfile && hasNegative) {
      return saveProfileFromBuffers(buffers);
    }

    // raw-only: the workers already wrote the TIFFs (write-through), so `buffers`
    // is an array of output paths — no main-thread transform to run.
    if (rawWriteThrough) {
      console.log(`\n✨ Completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s!`);
      console.log(`${buffers.length} ${buffers.length === 1 ? "file" : "files"} saved to '${outputDir}' as raw TIFF.`);
      if (DEBUG) console.log(`\x1b[2m  Timing: startup ${startupMs}ms, scan ${scanTime - startTime}ms, convert ${convertTime - scanTime}ms\x1b[0m`);
      applySequentialTimestamps(outputDir, Date.now());
      saveLastRunConfig();
      var rawImages = Object.keys(usableRawFiles).map(function(n) { return { name: path.basename(n, '.raw') }; });
      writeRunLog(rawImages, null, null, Date.now() - startTime);
      return;
    }

    // Run each requested mode in turn, writing to its own subdirectory when
    // more than one mode runs. Negative goes last because its ATLAS pass may
    // consume the shared buffers, so the cheaper per-image modes read first.
    var orderedModes = modes.filter(function(m) { return m !== 'negative'; });
    if (hasNegative) orderedModes.push('negative');

    var savedLines = [];
    var loggingAtlasOpts = null;
    var negResult = null;
    var negImages = null;
    var outputDirs = [];

    var chain = Promise.resolve();
    orderedModes.forEach(function(mode) {
      chain = chain.then(function() {
        var outDir = outDirForMode(mode);
        if (outputDirs.indexOf(outDir) === -1) outputDirs.push(outDir);
        if (mode === 'negative') {
          return invertBuffers(buffers, outDir).then(function(r) {
            loggingAtlasOpts = r.atlasOpts;
            negResult = r.result;
            negImages = r.images;
            savedLines.push(`${r.fileCount} ${r.fileCount === 1 ? "file" : "files"} saved to '${outDir}' as processed TIFF.`);
          });
        }
        writeStretchMode(buffers, mode, outDir);
        savedLines.push(`${buffers.length} ${buffers.length === 1 ? "file" : "files"} saved to '${outDir}' as ${verbForMode(mode)} TIFF.`);
        return Promise.resolve();
      });
    });

    return chain.then(function() {
      console.log(`\n✨ Completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s!`);
      savedLines.forEach(function(l) { console.log(l); });
      if (DEBUG) console.log(`\x1b[2m  Timing: startup ${startupMs}ms, scan ${scanTime - startTime}ms, convert ${convertTime - scanTime}ms\x1b[0m`);
      var stampRef = Date.now();
      outputDirs.forEach(function(d) { applySequentialTimestamps(d, stampRef); });
      saveLastRunConfig(loggingAtlasOpts);
      writeRunLog(negImages || buffers, negResult, loggingAtlasOpts, Date.now() - startTime);
    });
  }).catch(function(err) {
    // Single failure funnel for the whole pipeline (worker errors other than
    // the overflow sentinel, atlas rejections, TIFF write failures). Without
    // it these surface as unhandled rejections with a raw stack trace.
    exitWithError(err && err.message ? err.message : String(err));
  });

  // Resolve the output directory for a mode: a per-mode subdirectory when more
  // than one mode runs, otherwise the output dir itself (flat — unchanged for
  // single-mode runs).
  function outDirForMode(mode) {
    var d = multiMode ? path.join(outputDir, mode) : outputDir;
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    return d;
  }

  // Human-readable description of a non-negative mode's output, for the summary.
  function verbForMode(mode) {
    if (mode === 'e6') return 'contrast-stretched';
    if (mode === 'bw') return 'inverted and contrast-stretched greyscale';
    if (mode === 'bw-rgb') return 'inverted and contrast-stretched RGB';
    return 'raw';
  }

  // Write the per-image (non-negative) modes from the shared linear buffer.
  // raw  → linear sensor data unchanged; e6 → contrast stretch; bw/bw-rgb →
  // invert then contrast stretch (bw also collapses to a single grey channel).
  // Renders a progress bar — these run synchronously on the main thread and can
  // take several seconds across a full roll.
  function writeStretchMode(buffers, mode, outDir) {
    var software = `PPRC v${pkg.version}`;
    var labels = {
      raw: 'Writing raw TIFFs',
      e6: 'Contrast stretching',
      bw: 'Inverting and contrast stretching (greyscale)',
      'bw-rgb': 'Inverting and contrast stretching',
    };
    console.log(`\n${labels[mode]} (mode:${mode})`);

    var total = buffers.length;
    function renderBar(done) {
      var bar = Array.from({length: total}, function(_, i) { return i < done ? '▰' : '▱'; }).join(' ');
      process.stdout.write('\r' + bar);
    }
    renderBar(0);

    var atlasOpts = mode === 'raw' ? null : buildAtlasOpts();
    buffers.forEach(function(buf, idx) {
      if (mode === 'raw') {
        writeTiff16(path.join(outDir, buf.name + '.tif'), buf.pixels, buf.width, buf.height, 3, software);
        renderBar(idx + 1);
        return;
      }

      var src = buf.pixels;
      if (mode === 'bw' || mode === 'bw-rgb') {
        src = new Uint16Array(buf.pixels.length);
        for (var k = 0; k < src.length; k++) src[k] = 65535 - buf.pixels[k];
      }

      var stretched = opts.stretch === false
        ? src
        : contrastStretch(src, buf.width, buf.height, atlasOpts.clipBlackPct, atlasOpts.clipWhitePct, atlasOpts.borderExcludePct, atlasOpts.toneGamma, atlasOpts.srgbEncodeOutput);

      var finalPixels = stretched;
      var finalChannels = 3;
      if (mode === 'bw') {
        var pixelCount = buf.width * buf.height;
        var gray = new Uint16Array(pixelCount);
        for (var gi = 0; gi < pixelCount; gi++) {
          gray[gi] = Math.round((stretched[gi * 3] + stretched[gi * 3 + 1] + stretched[gi * 3 + 2]) / 3);
        }
        finalPixels = gray;
        finalChannels = 1;
      }

      writeTiff16(path.join(outDir, buf.name + '.tif'), finalPixels, buf.width, buf.height, finalChannels, software);
      renderBar(idx + 1);
    });
    process.stdout.write('\n');
  }

  function saveProfileFromBuffers(buffers) {
    var images = buffers.map(function(buf) {
      return { pixels: buf.pixels, width: buf.width, height: buf.height, name: buf.name };
    });

    console.log("Analyzing images to compute inversion profile");

    var atlasOpts = buildAtlasOpts();

    return processBuffers(images, atlasOpts, function(event) {
      if (event.type === 'analyze') {
        var bar = Array.from({length: event.total}, function(_, i) { return i < event.done ? '▰' : '▱'; });
        process.stdout.write('\r' + bar.join(' '));
      }
    }).then(function(result) {
      process.stdout.write("\n");

      if (result.frameRejection && result.frameRejection.rejected.length > 0) {
        var rej = result.frameRejection;
        var lines = ['\x1b[33mRejected ' + rej.rejected.length + ' frame(s) from profile (use --no-frame-rejection to include all):'];
        rej.rejected.forEach(function(i) { lines.push('  ' + images[i].name + '.raw'); });
        console.log(lines.join('\n') + '\x1b[0m');
      }

      saveProfile(opts.saveProfile, result.sharedProfile, pprcProfilesDir);
      console.log(`\n✨ Profile saved as '${opts.saveProfile}'`);
    });
  }

  // Runs the ATLAS negative-inversion pass, writing TIFFs to outDir. Prints its
  // own analysis progress and warnings, but leaves the final completion summary,
  // last-run config, and run log to the orchestrator (so a multi-mode run reports
  // once). Resolves with everything the orchestrator needs to log.
  function invertBuffers(buffers, outDir) {
    var images = buffers.map(function(buf) {
      return { pixels: buf.pixels, width: buf.width, height: buf.height, name: buf.name + '.tiff' };
    });

    var totalFiles = images.length;
    var analyzeLabelPrinted = false;
    var invertLabelPrinted = false;
    // Whether the "Analysing images…" progress bar's line has been terminated
    // with a newline. Emitted by whichever event fires first: the 'profile'
    // event (shared-profile runs) or the first 'process' event (per-image runs,
    // where atlas fires no 'profile' event — see pipeline.rs per-image branch).
    var analyzeBarEnded = false;
    function endAnalyzeBar() {
      if (analyzeLabelPrinted && !analyzeBarEnded) {
        process.stdout.write("\n");
        analyzeBarEnded = true;
      }
    }

    var atlasOpts = buildAtlasOpts();
    atlasOpts.outputDir = path.resolve(outDir);
    atlasOpts.software = `PPRC v${pkg.version}`;

    return processBuffers(images, atlasOpts, function(event) {
      if (event.type === 'analyze') {
        if (!analyzeLabelPrinted) {
          analyzeLabelPrinted = true;
          console.log("Analysing images for inversion and orange mask removal");
        }
        var bar = Array.from({length: event.total}, function(_, i) { return i < event.done ? '▰' : '▱'; });
        process.stdout.write('\r' + bar.join(' '));
        return;
      }

      if (event.type === 'profile') {
        endAnalyzeBar();
        return;
      }

      if (event.type === 'process') {
        if (!invertLabelPrinted) {
          invertLabelPrinted = true;
          // Per-image runs skip the 'profile' event, so the analyse bar may not
          // be newline-terminated yet — do it here before the header prints.
          endAnalyzeBar();
          console.log(atlasOpts.perImage ? "Inverting images (per-image balancing)" : "Inverting images");
        }
        var bar = Array.from({length: event.total}, function(_, i) { return i < event.done ? '▰' : '▱'; });
        process.stdout.write('\r' + bar.join(' '));
        return;
      }
    }).then(function(result) {
      process.stdout.write("\n");

      if (result.frameRejection && result.frameRejection.rejected.length > 0) {
        var rej = result.frameRejection;
        var manualExclusion = rej.disabledReason === 'manual_exclusion';
        var rejLines = manualExclusion
          ? [`\x1b[33mℹ️  ${rej.rejected.length} of ${totalFiles} frames held out of the shared color profile (--exclude-files-from-profile):`]
          : [`\x1b[33mℹ️  ${rej.rejected.length} of ${totalFiles} frames were excluded from shared color profile due to differing color characteristics:`];
        rej.rejected.forEach(function(i) { rejLines.push(`  ${images[i].name.replace(/\.tiff$/, '.raw')}`); });
        if (!manualExclusion) rejLines.push(`Use --no-frame-rejection to include all frames.`);
        rejLines[rejLines.length - 1] += '\x1b[0m';
        console.log(rejLines.join('\n'));
      }

      if (result.clippingRiskFrames && result.clippingRiskFrames.length > 0) {
        var riskNames = result.clippingRiskFrames.map(function(i) { return images[i].name.replace(/\.tiff$/, '.raw'); });
        var msg = riskNames.length > totalFiles * 0.5
          ? `${riskNames.length} of ${totalFiles} images have narrow density range. Contrast stretch clipping may be too aggressive — consider using --clip 0.01.`
          : `${riskNames.length} image(s) have narrow density range (${riskNames.join(', ')}). Clipping may be too aggressive for these frames — consider using --clip 0.01.`;
        console.log(`\n\x1b[33m⚠️  ${msg}\x1b[0m`);
      }

      if (result.sharedProfile) {
        try {
          var acceptedNames = result.frameRejection
            ? result.frameRejection.included.map(function(i) { return images[i].name.replace(/\.tiff$/, '.raw'); })
            : images.map(function(img) { return img.name.replace(/\.tiff$/, '.raw'); });
          var profileJson = Object.assign({}, result.sharedProfile, {
            metadata: {
              pprcVersion: pkg.version,
              createdAt: new Date().toISOString(),
              inputDir: inputDir,
              inputFiles: acceptedNames,
              inputSettings: {
                toneGamma: atlasOpts.toneGamma,
                contrastStretch: atlasOpts.contrastStretch,
                clipBlackPct: atlasOpts.clipBlackPct,
                clipWhitePct: atlasOpts.clipWhitePct,
                outlierRejectionPct: atlasOpts.outlierRejectionPct,
                borderExcludePct: atlasOpts.borderExcludePct,
              },
              _note: 'Profile from the last pprc run. Copy to ~/.pprc/profiles/<name>.json and use with --profile <name>.',
            },
          });
          fs.mkdirSync(pprcProfilesDir, { recursive: true });
          fs.writeFileSync(path.join(pprcProfilesDir, 'last_run.json'), JSON.stringify(profileJson, null, 2) + '\n');
        } catch(e) {
          if (DEBUG) console.error('Failed to write last_run_profile:', e);
        }
      }

      return { atlasOpts: atlasOpts, result: result, images: images, fileCount: result.frames.length };
    });
  }

  function buildAtlasOpts() {
    var atlasOpts = {
      toneGamma: 2.15,
      srgbEncodeOutput: false,
      contrastStretch: true,
      clipBlackPct: 0.001,
      clipWhitePct: 0.001,
      borderExcludePct: 2.0,
      outlierRejectionPct: 0.1,
      perImage: false,
      frameRejection: true,
      inputTrc: 'linear',
      inputSpace: 'adobergb',
      workingSpace: 'adobergb',
      outputSpace: 'adobergb',
    };
    if (opts.colorspaceInput   !== undefined) atlasOpts.inputSpace   = opts.colorspaceInput;
    if (opts.colorspaceWorking !== undefined) atlasOpts.workingSpace = opts.colorspaceWorking;
    if (opts.colorspaceOutput  !== undefined) atlasOpts.outputSpace  = opts.colorspaceOutput;
    if (opts.perImageBalancing) atlasOpts.perImage = true;
    if (opts.frameRejection === false) atlasOpts.frameRejection = false;
    // Manual frame exclusion (undocumented). When set, atlas bypasses its
    // automatic outlier pass and holds out exactly these frames.
    if (excludeFromProfileStems.length > 0) atlasOpts.excludeFromProfile = excludeFromProfileStems;
    // Black-point pedestal A/B (undocumented experiment). Default 'current' is
    // the shipping behavior; only forward a non-default choice.
    if (opts.blackPointMode && opts.blackPointMode !== 'current') atlasOpts.blackPointMode = opts.blackPointMode;
    // White-side anchor. atlas now defaults to 'median' (fixes the per-channel
    // floor deficit); forward ANY explicit choice — incl. 'extreme', the legacy
    // absolute-min — so it isn't dropped. Only affects the shared profile
    // (per-image computes a single-frame profile, where all modes collapse).
    if (opts.minAnchor) atlasOpts.minAnchor = opts.minAnchor;
    // Slope-ratio estimator A/B (undocumented experiment). Default 'endpoints'
    // is the shipping composite two-point estimate; 'median' derives the ratios
    // from the median of per-frame implied gammas. Only affects the shared
    // profile (per-image: a single-frame median is just that frame's gamma).
    if (opts.slopeSource && opts.slopeSource !== 'endpoints') atlasOpts.slopeSource = opts.slopeSource;
    if (opts.clip !== undefined) {
      atlasOpts.clipBlackPct = parseFloat(opts.clip);
      atlasOpts.clipWhitePct = parseFloat(opts.clip);
    }
    if (opts.clipBlack !== undefined) atlasOpts.clipBlackPct = parseFloat(opts.clipBlack);
    if (opts.clipWhite !== undefined) atlasOpts.clipWhitePct = parseFloat(opts.clipWhite);
    if (opts.outputGamma !== undefined) atlasOpts.toneGamma = opts.outputGamma;
    if (opts.stretch === false) atlasOpts.contrastStretch = false;
    if (opts.borderExclude !== undefined) atlasOpts.borderExcludePct = opts.borderExclude;
    if (opts.pixelRejectionPercentage !== undefined) atlasOpts.outlierRejectionPct = opts.pixelRejectionPercentage;
    if (loadedProfile) atlasOpts.useProfile = loadedProfile;
    if (opts.debugSrgbEncodeOutput) atlasOpts.srgbEncodeOutput = true;
    return atlasOpts;
  }

  function writeRunLog(images, result, atlasOpts, elapsedMs) {
    try {
      var p = result && result.sharedProfile;
      var rej = result && result.frameRejection;

      var lines = [
        `pprc v${pkg.version}`,
        `date: ${new Date().toISOString()}`,
        ``,
        `settings:`,
        `  mode: ${modes.join(', ')}`,
        ...(atlasOpts ? [
          `  tone-gamma: ${atlasOpts.toneGamma}`,
          `  contrast stretch: ${atlasOpts.contrastStretch}`,
          `  clip-black: ${atlasOpts.clipBlackPct}%`,
          `  clip-white: ${atlasOpts.clipWhitePct}%`,
          `  pixel-rejection-percentage: ${atlasOpts.outlierRejectionPct}%`,
          `  border-exclude: ${atlasOpts.borderExcludePct}%`,
          `  profile: ${atlasOpts.perImage ? 'per-image' : 'shared (all images)'}`,
          `  frame-rejection: ${atlasOpts.excludeFromProfile ? `manual (${atlasOpts.excludeFromProfile.join(', ')})` : atlasOpts.frameRejection}`,
          ...(atlasOpts.blackPointMode ? [`  black-point-mode: ${atlasOpts.blackPointMode} (EXPERIMENT)`] : []),
          `  min-anchor: ${atlasOpts.minAnchor || 'median (default)'}`,
          ...(atlasOpts.slopeSource ? [`  slope-source: ${atlasOpts.slopeSource} (EXPERIMENT)`] : []),
          `  colorspace-input: ${atlasOpts.inputSpace}`,
          `  colorspace-working: ${atlasOpts.workingSpace}`,
          `  colorspace-output: ${atlasOpts.outputSpace}`,
        ] : []),
        `  input: ${inputDir}`,
        `  output: ${outputDir}`,
        ``,
        ...(!noInvert ? [`inversion engine: ATLAS v${atlasPkg.version}`, ``] : []),
      ];

      if (p) {
        var channelNames = ['R', 'G', 'B'];
        lines.push(`profile values:`);
        lines.push(`  min: [${p.channelMins.map(function(v) { return v.toFixed(6); }).join(', ')}]`);
        if (p.channelMinIndices) {
          lines.push(`  min frames: [${p.channelMinIndices.map(function(i, c) {
            var name = images[i] ? images[i].name.replace(/\.tiff$/, '.raw') : `frame ${i}`;
            return `${channelNames[c]}:${name}`;
          }).join(', ')}]`);
        }
        if (p.channelMaxes) {
          lines.push(`  max: [${p.channelMaxes.map(function(v) { return v.toFixed(6); }).join(', ')}]`);
        }
        if (p.channelMaxIndices) {
          lines.push(`  max frames: [${p.channelMaxIndices.map(function(i, c) {
            var name = images[i] ? images[i].name.replace(/\.tiff$/, '.raw') : `frame ${i}`;
            return `${channelNames[c]}:${name}`;
          }).join(', ')}]`);
        }
        lines.push(
          `  blackPoint: ${p.blackPoint.toFixed(1)}`,
          `  channelSlopeRatioG: ${p.channelSlopeRatioG.toFixed(4)}`,
          `  channelSlopeRatioB: ${p.channelSlopeRatioB.toFixed(4)}`,
          ``,
        );
      }

      if (rej) {
        // The engine reports why rejection didn't run via `disabledReason`
        // (null when it ran). Without it, a disabled pass is indistinguishable
        // from a clean roll — both have rejected=[] — so we rely on the explicit
        // field rather than sniffing the [-Inf, Inf] range sentinels.
        if (rej.disabledReason === 'manual_exclusion') {
          lines.push(`frame rejection: MANUAL — ${rej.rejected.length} of ${images.length} frames held out via --exclude-files-from-profile`);
          lines.push(`  automatic outlier rejection was bypassed; only the listed frames were excluded.`);
          rej.rejected.forEach(function(frameIdx) {
            lines.push(`  ${images[frameIdx].name.replace(/\.tiff$/, '.raw')}`);
          });
        } else if (rej.rejected.length > 0) {
          lines.push(`frame rejection: rejected ${rej.rejected.length} of ${images.length} frames`);
          rej.rejected.forEach(function(frameIdx, rejIdx) {
            lines.push(`  ${images[frameIdx].name.replace(/\.tiff$/, '.raw')}:`);
            (rej.rejectionReasons[rejIdx] || []).forEach(function(r) { lines.push(`    - ${r}`); });
          });
        } else if (rej.disabledReason === 'too_many_flagged') {
          lines.push(`frame rejection: DISABLED by engine safety valve — outlier fences flagged >50% of frames`);
          lines.push(`  the IQR fences would have rejected more than half the roll, so the engine accepted`);
          lines.push(`  all ${images.length} frames rather than over-reject. acceptable ranges below are unset ([-Inf, Inf]).`);
          lines.push(`  (the exact flagged count is not surfaced by the engine; inspect the diagnostics below.)`);
        } else if (rej.disabledReason === 'too_few_frames') {
          lines.push(`frame rejection: skipped — too few frames (<6) to compute outlier fences`);
        } else {
          lines.push(`frame rejection: enabled (no outliers detected)`);
        }
        lines.push(
          `  acceptable gammaG range: [${rej.rangeG[0].toFixed(4)}, ${rej.rangeG[1].toFixed(4)}]`,
          `  acceptable gammaB range: [${rej.rangeB[0].toFixed(4)}, ${rej.rangeB[1].toFixed(4)}]`,
          `  acceptable R density range: [${rej.rangeDensity[0].toFixed(2)}x, ${rej.rangeDensity[1].toFixed(2)}x]`,
          `  acceptable minR/minG ratio: [${rej.rangeRgRatio[0].toFixed(4)}, ${rej.rangeRgRatio[1].toFixed(4)}]`,
          `  acceptable minR/minB ratio: [${rej.rangeRbRatio[0].toFixed(4)}, ${rej.rangeRbRatio[1].toFixed(4)}]`,
          `  acceptable maxR range: [${rej.rangeMaxR[0].toFixed(4)}, ${rej.rangeMaxR[1].toFixed(4)}]`,
          ``,
        );

        if (rej.diagnostics && rej.diagnostics.length > 0) {
          lines.push(`frame diagnostics:`);
          rej.diagnostics.slice().sort(function(a, b) { return a.index - b.index; }).forEach(function(d) {
            var name = images[d.index] ? images[d.index].name.replace(/\.tiff$/, '.raw') : `frame ${d.index}`;
            var status = d.accepted ? 'accepted' : 'rejected';
            var closeness = d.closeness !== undefined ? `  closeness=${d.closeness.toFixed(4)}` : '';
            lines.push(`  ${name}: ${status}${closeness}`);
            lines.push(`    gammaG=${d.impliedGammaG.toFixed(4)} gammaB=${d.impliedGammaB.toFixed(4)} densityR=${d.densityRangeR.toFixed(2)} minRatioRG=${d.minRatioRg.toFixed(4)} minRatioRB=${d.minRatioRb.toFixed(4)} maxRatioRG=${d.maxRatioRg.toFixed(4)} maxRatioRB=${d.maxRatioRb.toFixed(4)} maxR=${d.maxR.toFixed(4)}`);
            if (d.reasons.length > 0) {
              d.reasons.forEach(function(r) { lines.push(`    - ${r}`); });
            }
          });
          lines.push(``);
        }
      }

      lines.push(`files:`);
      if (result && result.frames) {
        var sortedFrames = result.frames.slice().sort(function(a, b) {
          return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
        });
        sortedFrames.forEach(function(frame) {
          var inputName = frame.name.replace(/\.tiff$/, '.raw');
          var outputName = path.basename(frame.outputPath || frame.name);
          var profileStr = p
            ? `min=[${p.channelMins.map(function(v) { return v.toFixed(6); }).join(', ')}] blackPoint=${p.blackPoint.toFixed(1)} gammaG=${p.channelSlopeRatioG.toFixed(4)} gammaB=${p.channelSlopeRatioB.toFixed(4)}`
            : 'per-image';
          lines.push(`  ${inputName} → ${outputName}`, `    profile: ${profileStr}`);
        });
      } else {
        images.forEach(function(img) {
          var inputName = (img.name || img).replace(/\.tiff$/, '') + '.raw';
          lines.push(`  ${inputName}`);
        });
      }

      lines.push(``, `processing time: ${elapsedMs}ms`);

      fs.writeFileSync(path.join(outputDir, 'pprc_log.txt'), lines.join('\n') + '\n');
    } catch(e) {
      if (DEBUG) console.error('Failed to write log:', e);
    }
  }
})();

// Restamp the output TIFFs in a directory so their modification times increase
// in frame order. atlas and the worker threads write files asynchronously, so
// on-disk mtimes otherwise land in arbitrary order and downstream tools that
// sort by file date scramble the roll. We assign a synthetic, evenly-spaced
// timeline: the last frame gets `referenceMs` (run completion) and earlier
// frames step backwards by SEQUENCE_STEP_SECONDS each, so every timestamp is
// <= now (no future-dated files) and strictly increasing in name order. Sort is
// lexical to match the run-log's file ordering; Pakon output is zero-padded so
// lexical == numeric. Best-effort: a failure to stamp never fails the run.
function applySequentialTimestamps(dir, referenceMs) {
  var names;
  try {
    names = fs.readdirSync(dir).filter(function(f) { return /\.tiff?$/i.test(f); });
  } catch (e) {
    if (DEBUG) console.error('Sequential timestamps: could not read ' + dir + ':', e);
    return;
  }
  names.sort(function(a, b) { return a < b ? -1 : a > b ? 1 : 0; });
  var stepMs = SEQUENCE_STEP_SECONDS * 1000;
  var lastIndex = names.length - 1;
  names.forEach(function(name, i) {
    var whenSec = (referenceMs - (lastIndex - i) * stepMs) / 1000;
    try {
      fs.utimesSync(path.join(dir, name), whenSec, whenSec);
    } catch (e) {
      if (DEBUG) console.error('Sequential timestamps: could not stamp ' + name + ':', e);
    }
  });
}

function saveLastRunConfig(resolvedOpts) {
  try {
    if (!fs.existsSync(pprcConfigDir)) {
      fs.mkdirSync(pprcConfigDir, { recursive: true });
    }
    var lastRun = {
      metadata: {
        pprcVersion: pkg.version,
        createdAt: new Date().toISOString(),
        _note: process.platform === 'win32'
          ? `Copy this file to configs/default.json to reuse these settings: copy "%USERPROFILE%\\.pprc\\last_run_config.json" "%USERPROFILE%\\.pprc\\configs\\default.json"`
          : 'Copy this file to configs/default.json to reuse these settings: cp ~/.pprc/last_run_config.json ~/.pprc/configs/default.json'
      },
    };

    if (resolvedOpts) {
      lastRun.outputGamma = resolvedOpts.toneGamma;
      lastRun.noStretch = !resolvedOpts.contrastStretch;
      lastRun.clipBlack = resolvedOpts.clipBlackPct;
      lastRun.clipWhite = resolvedOpts.clipWhitePct;
      lastRun.pixelRejectionPercentage = resolvedOpts.outlierRejectionPct;
      lastRun.borderExclude = resolvedOpts.borderExcludePct;
      lastRun.perImageBalancing = resolvedOpts.perImage;
      lastRun.noFrameRejection = !resolvedOpts.frameRejection;
      if (opts.profile) lastRun.profile = opts.profile;
    } else {
      if (opts.dirOut !== OUTPUT_DIR)     lastRun.dirOut = opts.dirOut;
      if (!(modes.length === 1 && modes[0] === 'negative')) lastRun.mode = modes;
    }

    fs.writeFileSync(path.join(pprcConfigDir, 'last_run_config.json'), JSON.stringify(lastRun, null, 2) + '\n');
  } catch (e) {
    // Non-critical, don't interrupt the user
  }
}

function scanDirectoryForFiles () {
  var rawFiles = fs.readdirSync(inputDir).filter(function(f) { return /\.raw$/i.test(f); });

  if (!rawFiles.length) {
    exitWithError(`No .raw files found in ${opts.dir ? "'" + inputDir + "'" : "the current directory"}\nPlease run this script from the same directory where you have saved your planar .raw files from TLXClientDemo, or use --dir to specify the directory.`);
  } else {
    console.log(`Found ${rawFiles.length} raw files in ${opts.dir ? "'" + inputDir + "'" : "current directory"}...`);
    return rawFiles;
  }
}

function tryReadHeader(filePath, fileSize) {
  var fd = fs.openSync(filePath, 'r');
  var headerBuf = Buffer.alloc(HEADER_SIZE);
  var bytesRead = fs.readSync(fd, headerBuf, 0, HEADER_SIZE, 0);
  fs.closeSync(fd);

  if (bytesRead < HEADER_SIZE) return null;

  var headerSize = headerBuf.readUInt32LE(0);
  var width = headerBuf.readUInt32LE(4);
  var height = headerBuf.readUInt32LE(8);
  var bpp = headerBuf.readUInt32LE(12);

  // Validate: header size must be 16, dimensions must be reasonable,
  // and bpp must be a multiple of 16 (16-bit per channel)
  if (headerSize !== HEADER_SIZE) return null;
  // 65535 is the max the output TIFF's 16-bit SHORT width/height tags can hold
  // (real Pakon scans are a few thousand px, so this is only a sanity bound).
  if (width === 0 || height === 0 || width > 65535 || height > 65535) return null;
  if (bpp % 16 !== 0 || bpp === 0) return null;

  var channels = bpp / 16;
  // Only the 3-channel (RGB planar) Pakon format is supported. The worker always
  // reads R, G, and B planes, so a header claiming 1 or 2 channels would convert
  // with the missing planes silently zeroed; reject it here instead.
  if (channels !== 3) return null;
  var expectedPixelBytes = width * height * channels * BYTES_PER_CHANNEL;
  if (fileSize !== HEADER_SIZE + expectedPixelBytes) return null;

  return { width: width, height: height, channels: channels, headerOffset: HEADER_SIZE };
}

function checkRawFiles(rawFiles){
  var currentDir = inputDir;
  var data = {};
  var badFiles = [];
  var dimensionsNeeded = []; // files that actually required --dimensions to resolve
  rawFiles.forEach(function(rawFile){
    var filePath = currentDir + "/" + rawFile;
    var sizeInBytes = fs.statSync(filePath).size;
    var fileInfo = null;

    // 1. Try reading header from the file
    var header = tryReadHeader(filePath, sizeInBytes);
    if (header) {
      fileInfo = {
        width: header.width,
        height: header.height,
        channels: header.channels,
        headerOffset: header.headerOffset
      };
    }

    // 2. Fall back to --dimensions flag
    if (!fileInfo && opts.dimensions && opts.dimensions.split("x").length === 2) {
      var splitDimensions = opts.dimensions.split("x"),
          width = parseInt(splitDimensions[0], 10),
          height = parseInt(splitDimensions[1], 10);
      var channels = 3;
      var expectedPixelBytes = width * height * channels * BYTES_PER_CHANNEL;

      if (sizeInBytes === expectedPixelBytes) {
        fileInfo = { width: width, height: height, channels: channels, headerOffset: 0 };
        dimensionsNeeded.push(rawFile);
      } else if (sizeInBytes === HEADER_SIZE + expectedPixelBytes) {
        fileInfo = { width: width, height: height, channels: channels, headerOffset: HEADER_SIZE };
        dimensionsNeeded.push(rawFile);
      }
    }

    // 3. Fall back to size lookup table (headerless files only)
    if (!fileInfo) {
      var dims = BYTE_SIZE_TO_DIMENSIONS[sizeInBytes.toString()];
      if (dims) {
        var parts = dims.split("x");
        fileInfo = {
          width: parseInt(parts[0], 10),
          height: parseInt(parts[1], 10),
          channels: 3,
          headerOffset: 0
        };
      }
    }

    if (!fileInfo) {
      badFiles.push(rawFile);
      console.error(`${rawFile} is not recognized - please export via TLXClientDemo in "SaveToMemory -> Planar" with "Add File Header" enabled (or specify dimensions via --dimensions option)`);
    } else {
      data[rawFile] = fileInfo;
    }
  });

  var validFileCount = Object.keys(data).length;
  var nonStandard = Object.keys(data).filter(function(file) {
    var info = data[file];
    return STANDARD_DIMENSIONS.indexOf(info.width + "x" + info.height) === -1;
  });

  if (validFileCount === 0) {
    exitWithError("Sorry, no .raw files in the current directory could be read.");
  } else if (validFileCount === rawFiles.length) {
    var msg = `All ${validFileCount} files are valid`;
    if (nonStandard.length > 0) {
      msg += ` - \x1b[3m${nonStandard.length} ${nonStandard.length === 1 ? "file" : "files"} noted to have interesting dimensions\x1b[0m`;
    }
    console.log(msg + "...");
  } else {
    console.log(`${validFileCount} files will be converted but ${rawFiles.length-validFileCount} (${badFiles.join(",")}) ${badFiles.length === 1 ? "is" : "are"} not recognized...`);
  }

  if (nonStandard.length > 0) {
    nonStandard.forEach(function(file) {
      var info = data[file];
      console.log(`  ${file}: ${info.width}x${info.height}`);
    });
  }

  if (opts.dimensions) {
    if (dimensionsNeeded.length === 0) {
      console.log('\x1b[3mTip: --dimensions was not necessary — all files have embedded headers.\x1b[0m');
    } else {
      console.log(`\x1b[3mTip: Export with "Add File Header" enabled in TLXClientDemo to avoid needing --dimensions.\x1b[0m`);
    }
  }

  return data;
}

function convertRawFilesToTiff (data) {
  var label = "Converting raw files to tiff files";

  if (noInvert) label += " (no inversion)";

  console.log(label);

  var items = Object.keys(data);
  var convertDone = items.map(function() { return false; });

  function renderConvertProgress() {
    var bar = convertDone.map(function(done) { return done ? '▰' : '▱'; }).join(' ');
    process.stdout.write(`\r${bar}`);
  }

  renderConvertProgress();

  // Limit concurrent workers to CPU count to reduce peak memory
  var maxConcurrency = Math.max(1, os.cpus().length - 1);
  var results = new Array(items.length);
  var nextIndex = 0;

  function runNext() {
    var index = nextIndex++;
    if (index >= items.length) return Promise.resolve();
    return convertRawToTiff(items[index], data[items[index]]).then(function(result) {
      results[index] = result;
      convertDone[index] = true;
      renderConvertProgress();
      return runNext();
    });
  }

  var workers = [];
  for (var w = 0; w < Math.min(maxConcurrency, items.length); w++) {
    workers.push(runNext());
  }

  return Promise.all(workers).then(function() { return results; });
}

function convertRawToTiff (name, fileInfo) {
  var baseName = path.basename(name, ".raw");
  // For a raw-only run, let the worker write the TIFF directly and return just
  // its path — this avoids retaining every decoded RGB16 buffer in the main
  // thread. For all other runs (including multi-mode that involves raw), the
  // worker returns a neutral linear buffer (deplanarize + <<2 only) so one
  // decode can feed each mode's main-thread transform.
  var destinationFile = rawWriteThrough ? path.join(outputDir, baseName + '.tif') : null;
  var returnBuffer = !rawWriteThrough;
  var mode = 'default';

  return new Promise(function(resolve, reject) {
    var worker = new Worker(path.join(__dirname, 'lib', 'convert-worker.js'), {
      workerData: {
        name: path.resolve(inputDir, name),
        width: fileInfo.width,
        height: fileInfo.height,
        channels: fileInfo.channels,
        headerOffset: fileInfo.headerOffset,
        destinationFile: destinationFile ? path.resolve(destinationFile) : null,
        mode: mode,
        software: `PPRC v${pkg.version}`,
        returnBuffer: returnBuffer,
        baseName: baseName
      }
    });
    worker.on('message', function(result) {
      resolve(result);
    });
    worker.on('error', function(err) {
      if (err && err.message && err.message.indexOf('PPRC_RAW_OVERFLOW:') === 0) {
        exitWithError(err.message.slice('PPRC_RAW_OVERFLOW:'.length).trim());
      }
      reject(err);
    });
  });
}

function exitWithError (message) {
  console.error("ERROR: "+ message);
  process.exit(1);
}
