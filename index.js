#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';

var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);

import pkg from './package.json' with { type: 'json' };

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

var [{ Worker }, { default: negpro, processImages, saveProfile, core }, { Command, Help, Option }] = await Promise.all([
  import('worker_threads'),
  import('negpro'),
  import('commander')
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
  .option('--dir [dir]', 'Directory containing .raw files to process (default: current directory)')
  .option('--dir-out [dir]', `Output directory (use DIR_NAME for input folder name, start with '../' to place beside input)`, OUTPUT_DIR)
  .addOption(new Option('--output-dir [dir]', `Specify the output directory name`).hideHelp())
  .addOption(new Option('--mode <mode>', 'Processing mode').choices(['negative', 'raw', 'e6', 'bw', 'bw-rgb']).default('negative'))
  .option('--per-image-balancing', 'Compute a separate inversion profile for each image instead of sharing')
  .option('--no-frame-rejection', 'Disable outlier frame rejection when computing shared inversion profile')
  .option('--clip-black <percent>', 'Clip darkest N% to black during contrast stretch (default: 0.1)', parseFloat)
  .option('--clip-white <percent>', 'Clip brightest N% to white during contrast stretch (default: 0.1)', parseFloat)
  .option('--clip <percent>', 'Clip both black and white ends by N% during contrast stretch', parseFloat)
  .option('--gamma <value>', 'Gamma correction applied during negative inversion (default: 2.15)', parseFloat)
  .option('--no-stretch', 'Disable contrast stretch during inversion (default: enabled)')
  .option('--border-exclude <percent>', 'Exclude outer N% of image from profiling and contrast stretch (default: 2)', parseFloat)
  .option('--pixel-rejection-percentage <percent>', 'Ignore brightest/darkest N% of pixels when profiling (default: 0.1)', parseFloat)
  .option('--save-profile <name>', 'Analyze input files, save inversion profile to ~/.negpro/, then exit')
  .option('--profile <name>', 'Use a previously saved inversion profile from ~/.negpro/')
  .option('--save-config', 'Save current options as defaults in ~/.pprc/config.json and exit')
  .addOption(new Option('--install-quick-action', 'Install macOS Finder right-click Quick Action for folders').hideHelp(process.platform !== 'darwin'))
  .addOption(new Option('--uninstall-quick-action', 'Remove the macOS Finder Quick Action').hideHelp(process.platform !== 'darwin'))
  .option('--examples', 'Show usage examples')
  .option('--no-negfix', '[deprecated: use --mode raw] Skip negative inversion')
  .option('--dimensions [width]x[height]', '[deprecated] Manually specify pixel dimensions for headerless raw files (e.g. "4000x2000")')
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
          result.push(pad + 'raw       Output unconverted tiffs for processing with another tool');
          result.push(pad + 'e6        Slide film — no inversion, apply auto-level');
          result.push(pad + 'bw        Black & white — invert, auto-level, greyscale output');
          result.push(pad + 'bw-rgb    Black & white — invert, auto-level, RGB output');
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

// Load pprc config (~/.pprc/config.json)
var pprcConfigDir = path.join(os.homedir(), '.pprc');
var pprcConfigPath = path.join(pprcConfigDir, 'config.json');
var pprcConfig = {};

if (fs.existsSync(pprcConfigPath)) {
  try {
    var { metadata, ...parsedConfig } = JSON.parse(fs.readFileSync(pprcConfigPath, 'utf8'));
    pprcConfig = parsedConfig;
  } catch (e) {
    console.warn(`Warning: Could not parse ${pprcConfigPath}: ${e.message}`);
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
    gamma:       ['gamma',       '--gamma'],
    noStretch:         ['stretch',           '--no-stretch'],
    borderExclude:     ['borderExclude',     '--border-exclude'],
    pixelRejectionPercentage: ['pixelRejectionPercentage', '--pixel-rejection-percentage'],
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
    var configLines = [`\x1b[3mUsing pprc global config (${pprcConfigPath}):`];
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
    pprc --dir /path/to/raw/files --dir-out DIR_NAME_inverted

  Output beside the input folder instead of inside it:
    pprc --dir-out ../DIR_NAME_pprc_out

  Output to an absolute path:
    pprc --dir-out /path/to/output

  Skip inversion — useful if you want to invert with another tool:
    pprc --mode raw

  Process slide film (E6) scans — no inversion needed, just auto-levels:
    pprc --mode e6

  Process black and white film — invert and auto-level in greyscale:
    pprc --mode bw

  Per-image balancing — useful when frames on a roll have very different exposures:
    pprc --per-image-balancing

  Reduce contrast stretch clipping — for rolls with low-density frames:
    pprc --clip 0.01

  Aggressive clipping for a punchier, minilab-style look:
    pprc --clip 2.5

  Clip shadows and highlights separately:
    pprc --clip-black 0.5 --clip-white 0.1

  Custom inversion gamma (default 2.15):
    pprc --gamma 2.5

  Disable contrast stretch:
    pprc --no-stretch

  Exclude outer 5% of image from profiling:
    pprc --border-exclude 5

  Include all frames in color balancing, even outliers:
    pprc --no-frame-rejection

  Analyze a roll and save its profile for reuse:
    pprc --save-profile portra400

  Use a previously saved negpro profile:
    pprc --profile portra400

  Save current options as global defaults:
    pprc --clip 2.5 --save-config

  Install macOS Finder Quick Action — right-click folders to process:
    pprc --install-quick-action

  Remove the Finder Quick Action:
    pprc --uninstall-quick-action
`);
  process.exit(0);
}

// Handle deprecated flags
if (opts.negfix === false) {
  console.warn("Warning: --no-negfix is deprecated, use --mode raw instead");
  opts.mode = 'raw';
}
if (opts.invert === false && program.getOptionValueSource('invert') !== 'default') {
  console.warn("Warning: --no-invert is deprecated, use --mode raw instead");
  opts.mode = 'raw';
}
if (opts.e6 && program.getOptionValueSource('e6') !== 'default') {
  console.warn("Warning: --e6 is deprecated, use --mode e6 instead");
  opts.mode = 'e6';
}
if (opts.bw && program.getOptionValueSource('bw') !== 'default') {
  console.warn("Warning: --bw is deprecated, use --mode bw instead");
  opts.mode = 'bw';
}
if (opts.bwRgb && program.getOptionValueSource('bwRgb') !== 'default') {
  console.warn("Warning: --bw-rgb is deprecated, use --mode bw-rgb instead");
  opts.mode = 'bw-rgb';
}

if (opts.profile) {
  var profilePath = path.join(os.homedir(), '.negpro', `${opts.profile}.json`);
  if (!fs.existsSync(profilePath)) {
    exitWithError(`Profile '${opts.profile}' not found. Expected file: ${profilePath}\nUse --save-profile ${opts.profile} to create it.`);
  }
}

if (opts.saveConfig) {
  var config = {
    metadata: {
      pprcVersion: pkg.version,
      createdAt: new Date().toISOString(),
      _note: 'pprc global config. CLI flags override these values.',
    },
  };

  if (opts.dirOut !== OUTPUT_DIR)     config.dirOut = opts.dirOut;
  if (opts.mode !== 'negative')       config.mode = opts.mode;
  if (opts.perImageBalancing)          config.perImageBalancing = true;
  if (opts.frameRejection === false)   config.noFrameRejection = true;
  if (opts.clip !== undefined)         config.clip = opts.clip;
  if (opts.clipBlack !== undefined)    config.clipBlack = opts.clipBlack;
  if (opts.clipWhite !== undefined)    config.clipWhite = opts.clipWhite;
  if (opts.gamma !== undefined)        config.gamma = opts.gamma;
  if (opts.stretch === false)          config.noStretch = true;
  if (opts.borderExclude !== undefined) config.borderExclude = opts.borderExclude;
  if (opts.pixelRejectionPercentage !== undefined) config.pixelRejectionPercentage = opts.pixelRejectionPercentage;
  if (opts.profile)                    config.profile = opts.profile;

  if (!fs.existsSync(pprcConfigDir)) {
    fs.mkdirSync(pprcConfigDir, { recursive: true });
  }
  fs.writeFileSync(pprcConfigPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`Config saved to ${pprcConfigPath}`);
  process.exit(0);
}

var noInvert = opts.mode === 'raw' || opts.mode === 'e6' || opts.mode === 'bw' || opts.mode === 'bw-rgb';

// Resolve input directory and output paths
var inputDir = opts.dir ? path.resolve(opts.dir) : process.cwd();
var dirBaseName = path.basename(inputDir);
var outputDir, tiffDir;

// Replace DIR_NAME template in --dir-out value
var dirOutValue = opts.dirOut.replace(/DIR_NAME/g, dirBaseName);

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
  console.log(`Previous output exists, using '${path.basename(outputDir)}' instead.`);
}

if (noInvert) {
  // When skipping inversion, tiffs are the final output — put them in the output dir
  tiffDir = outputDir;
}

// Validate input directory exists before creating any output dirs
if (opts.dir && !fs.existsSync(inputDir)) {
  exitWithError(`Directory not found: '${inputDir}'`);
}

// Create output dir or error if explicit path already exists
(function() {
  if (fs.existsSync(outputDir)){
    if (usingAbsoluteOutputDir) {
      exitWithError(`Output directory '${outputDir}' already exists. Please remove or rename it before running again.`);
    }
  } else {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  var startTime = Date.now();
  var startupMs = startTime - processStart;
  var rawFiles = scanDirectoryForFiles();
  var usableRawFiles = checkRawFiles(rawFiles);
  var scanTime = Date.now();
  var convertTime;
  convertRawFilesToTiff(usableRawFiles).then(function(buffers){
    process.stdout.write("\n");
    convertTime = Date.now();

    if (noInvert) {
      // buffers are actually file paths in non-negative modes
      var verb;
      if (opts.mode === 'e6') {
        verb = "auto-leveled";
      } else if (opts.mode === 'bw') {
        verb = "inverted and auto-leveled greyscale";
      } else if (opts.mode === 'bw-rgb') {
        verb = "inverted and auto-leveled RGB";
      } else {
        verb = "raw";
      }
      console.log(`\n✨ Completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s!`);
      console.log(`${buffers.length} ${buffers.length === 1 ? "file" : "files"} saved to '${tiffDir}' as ${verb} TIFF.`);
      if (DEBUG) console.log(`\x1b[2m  Timing: startup ${startupMs}ms, scan ${scanTime - startTime}ms, convert ${convertTime - scanTime}ms\x1b[0m`);
      saveLastRunConfig();
    } else if (opts.saveProfile) {
      saveProfileFromBuffers(buffers);
    } else {
      invertBuffersWithNegpro(buffers);
    }
  });

  function saveProfileFromBuffers(buffers) {
    var images = buffers.map(function(buf) {
      return { pixels: buf.pixels, width: buf.width, height: buf.height, name: buf.name };
    });

    var totalFiles = images.length;
    var gamma = opts.gamma !== undefined ? opts.gamma : 2.15;
    var outlierRejection = opts.pixelRejectionPercentage !== undefined ? opts.pixelRejectionPercentage : 0.1;
    var frameRejectionEnabled = opts.frameRejection !== false;

    console.log("Analyzing images to compute inversion profile");

    // Analyze each image
    var allStats = images.map(function(img, i) {
      var stats = core.analyzePixels(img.pixels, img.width * img.height, outlierRejection);
      process.stdout.write(`\r${images.slice(0, i + 1).map(function() { return '▰'; }).join(' ')}${images.slice(i + 1).map(function() { return '▱'; }).join(' ')}`);
      return stats;
    });
    process.stdout.write("\n");

    // Frame rejection
    var statsForProfile = allStats;
    if (frameRejectionEnabled && totalFiles > 2) {
      var rejection = core.rejectOutlierFrames(allStats);
      if (rejection.rejected.length > 0) {
        statsForProfile = rejection.included.map(function(i) { return allStats[i]; });
        var lines = [`\x1b[33mRejected ${rejection.rejected.length} frame(s) from profile (use --no-frame-rejection to include all):`];
        rejection.rejected.forEach(function(i) {
          lines.push(`  ${images[i].name}.raw`);
        });
        console.log(lines.join('\n') + '\x1b[0m');
      }
    }

    var profile = core.computeProfile(statsForProfile, gamma);
    saveProfile(opts.saveProfile, profile);
    console.log(`\n✨ Profile saved as '${opts.saveProfile}'`);
  }

  function invertBuffersWithNegpro(buffers) {
    // Build InputBuffer array for negpro's processImages
    var images = buffers.map(function(buf) {
      return { pixels: buf.pixels, width: buf.width, height: buf.height, name: buf.name };
    });

    var totalFiles = images.length;
    var analyzeLabelPrinted = false;
    var invertLabelPrinted = false;
    var rejectedFramesEvent = null;
    var processWarnings = [];

    function renderProgress(completed, total) {
      var bar = [];
      for (var i = 0; i < total; i++) {
        bar.push(completed[i] ? '▰' : '▱');
      }
      process.stdout.write(`\r${bar.join(' ')}`);
    }

    var analysisDone = new Array(totalFiles).fill(false);
    var adjustDone = new Array(totalFiles).fill(false);
    var resolvedPerImage = false;

    var negproOpts = {
      outputDir: path.resolve(outputDir),
      callerName: `PPRC v${pkg.version}`,
      onProgress: function(event) {
        if (event.type === 'config') {
          resolvedPerImage = event.config.perImage;

          // Show settings coming from negpro global config
          var fromConfig = event.sources ? Object.keys(event.sources).filter(function(key) {
            return event.sources[key] === 'config';
          }) : [];
          if (fromConfig.length > 0 && event.configPath) {
            var lines = ["Using negpro global config (" + event.configPath + "):"];
            fromConfig.forEach(function(key) {
              lines.push("  " + key + ": " + event.config[key]);
            });
            console.log(lines.join("\n"));
          }

          if (resolvedPerImage) {
            console.log("Inverting images with negpro (per-image balancing)");
          }
          return;
        }

        if (event.type === 'analyzing') {
          if (!analyzeLabelPrinted) {
            analyzeLabelPrinted = true;
            console.log("Analysing images to determine average data for inversion");
          }
          analysisDone[event.index] = true;
          renderProgress(analysisDone, totalFiles);
          return;
        }

        if (event.type === 'profile-computed') {
          process.stdout.write("\n");
          return;
        }

        if (event.type === 'frames-rejected') {
          rejectedFramesEvent = event;
          return;
        }

        if (event.type === 'processing') {
          if (!invertLabelPrinted && !resolvedPerImage) {
            invertLabelPrinted = true;
            console.log("Inverting images with negpro");
          }
          return;
        }

        if (event.type === 'done') {
          adjustDone[event.index] = true;
          renderProgress(adjustDone, totalFiles);
          return;
        }

        if (event.type === 'complete') {
          processWarnings = event.warnings || [];
          return;
        }
      }
    };

    // Pass through CLI options
    if (opts.perImageBalancing) {
      negproOpts.perImage = true;
    }
    if (opts.frameRejection === false) {
      negproOpts.noFrameRejection = true;
    }
    if (opts.clip !== undefined) {
      negproOpts.clipBlack = parseFloat(opts.clip);
      negproOpts.clipWhite = parseFloat(opts.clip);
    }
    if (opts.clipBlack !== undefined) {
      negproOpts.clipBlack = parseFloat(opts.clipBlack);
    }
    if (opts.clipWhite !== undefined) {
      negproOpts.clipWhite = parseFloat(opts.clipWhite);
    }
    if (opts.gamma !== undefined) {
      negproOpts.gamma = opts.gamma;
    }
    if (opts.stretch === false) {
      negproOpts.contrastStretch = false;
    }
    if (opts.borderExclude !== undefined) {
      negproOpts.borderExclude = opts.borderExclude;
    }
    if (opts.pixelRejectionPercentage !== undefined) {
      negproOpts.outlierRejection = opts.pixelRejectionPercentage;
    }
    if (opts.profile) {
      negproOpts.useProfile = opts.profile;
    }

    processImages(images, negproOpts).then(function(results) {
      process.stdout.write("\n");

      var negproTime = Date.now();
      console.log(`\n✨ Completed in ${((negproTime - startTime) / 1000).toFixed(1)}s!`);
      console.log(`${results.length} ${results.length === 1 ? "file" : "files"} saved to '${outputDir}' as processed TIFF.`);
      if (DEBUG) console.log(`\x1b[2m  Timing: startup ${startupMs}ms, scan ${scanTime - startTime}ms, convert ${convertTime - scanTime}ms, negpro ${negproTime - convertTime}ms\x1b[0m`);
      saveLastRunConfig();

      // Frame rejection notice
      if (rejectedFramesEvent) {
        var evt = rejectedFramesEvent;
        var lines = [`\nℹ️ Note: ${evt.rejected.length} of ${evt.total} frames were not used when calculating shared color balance due to differing color characteristics:`];
        evt.rejected.forEach(function(name) {
          lines.push(`  ${path.basename(name)}.raw`);
        });
        lines.push("Use --no-frame-rejection to include all frames in color balancing.");
        console.log(`\x1b[33m${lines.join('\n')}\x1b[0m`);
      }

      // Clipping risk warnings
      if (processWarnings.length > 0) {
        processWarnings.forEach(function(w) {
          if (w.code === 'CLIPPING_RISK') {
            var affected = w.affectedFiles.map(function(f) { return path.basename(f); });
            var msg;
            if (affected.length > totalFiles * 0.5) {
              msg = `${affected.length} of ${totalFiles} images have narrow density range. Contrast stretch clipping may be too aggressive — consider using --clip 0.01 (or --clip-black / --clip-white individually).`;
            } else {
              msg = `${affected.length} image(s) have narrow density range (${affected.join(', ')}). Contrast stretch clipping may be too aggressive for these frames — consider using --clip 0.01 (or --clip-black / --clip-white individually).`;
            }
            console.log(`\n\x1b[33m⚠️ Warning: ${msg}\x1b[0m`);
          } else {
            console.log(`\n\x1b[33m⚠️ Warning: ${w.message}\x1b[0m`);
          }
        });
      }
    });
  }
})();

function saveLastRunConfig() {
  try {
    if (!fs.existsSync(pprcConfigDir)) {
      fs.mkdirSync(pprcConfigDir, { recursive: true });
    }
    var lastRun = {
      metadata: {
        pprcVersion: pkg.version,
        createdAt: new Date().toISOString(),
        note: process.platform === 'win32'
          ? `Copy this file to config.json to reuse these settings: copy "%USERPROFILE%\\.pprc\\last_run_config.json" "%USERPROFILE%\\.pprc\\config.json"`
          : 'Copy this file to config.json to reuse these settings: cp ~/.pprc/last_run_config.json ~/.pprc/config.json'
      },
    };

    // Save all non-default option values
    if (opts.dirOut !== OUTPUT_DIR)     lastRun.dirOut = opts.dirOut;
    if (opts.mode !== 'negative')       lastRun.mode = opts.mode;
    if (opts.perImageBalancing)          lastRun.perImageBalancing = true;
    if (opts.frameRejection === false)   lastRun.noFrameRejection = true;
    if (opts.clip !== undefined)         lastRun.clip = opts.clip;
    if (opts.clipBlack !== undefined)    lastRun.clipBlack = opts.clipBlack;
    if (opts.clipWhite !== undefined)    lastRun.clipWhite = opts.clipWhite;
    if (opts.gamma !== undefined)  lastRun.gamma = opts.gamma;
    if (opts.stretch === false)          lastRun.noStretch = true;
    if (opts.borderExclude !== undefined) lastRun.borderExclude = opts.borderExclude;
    if (opts.pixelRejectionPercentage !== undefined) lastRun.pixelRejectionPercentage = opts.pixelRejectionPercentage;
    if (opts.profile)                   lastRun.profile = opts.profile;

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
  if (width === 0 || height === 0 || width > 100000 || height > 100000) return null;
  if (bpp % 16 !== 0 || bpp === 0) return null;

  var channels = bpp / 16;
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
  var destinationFile = noInvert ? path.join(tiffDir, `${baseName}.tif`) : null;
  var returnBuffer = !noInvert;

  var mode = opts.mode === 'negative' ? 'default' : opts.mode;

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
    worker.on('error', reject);
  });
}

function exitWithError (message) {
  console.error("ERROR: "+ message);
  process.exit(1);
}
