#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';

var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);

var pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

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

// Check for updates in the background (respects alpha/beta channels)
import updateNotifier from 'update-notifier';
var distTag = pkg.version.includes('alpha') ? 'alpha'
            : pkg.version.includes('beta') ? 'beta'
            : 'latest';
var updateCheckInterval = distTag === 'alpha' ? 1000 * 60 * 60
                        : distTag === 'beta'  ? 1000 * 60 * 60 * 12
                        : 1000 * 60 * 60 * 24;
updateNotifier({ pkg, distTag, updateCheckInterval }).notify({ isGlobal: true });

var { Worker } = await import('worker_threads');
var { default: Promise } = await import('bluebird');
var { default: negpro, processImages } = await import('negpro');
var { Command, Help, Option } = await import('commander');

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
  '--no-invert': 'Processing Mode:',
  '--per-image-balancing': 'Tuning:',
  '--no-negfix': 'Deprecated:',
  '--install-quick-action': 'Utility:',
};

var program = new Command();
program
  .name('pprc')
  .option('--dir [dir]', 'Directory containing .raw files to process (default: current directory)')
  .option('--dir-out [dir]', `Specify the output directory name`, OUTPUT_DIR)
  .addOption(new Option('--output-dir [dir]', `Specify the output directory name`).hideHelp())
  .option('--no-invert', 'Skip negative inversion, output raw tiffs for processing with another tool')
  .option('--e6', 'Skip negative inversion, apply auto-level (for "Film Color: Positive" scans)')
  .option('--bw', 'Invert, auto-level, and save in grey-scale colorspace')
  .option('--bw-rgb', 'Invert, auto-level, and save in RGB colorspace')
  .option('--per-image-balancing', 'Compute a separate inversion profile for each image instead of sharing')
  .option('--no-frame-rejection', 'Disable outlier frame rejection when computing shared inversion profile')
  .option('--clip-black <percent>', 'Clip darkest N% to black during contrast stretch (negpro default: 0.1)')
  .option('--clip-white <percent>', 'Clip brightest N% to white during contrast stretch (negpro default: 0.1)')
  .option('--clip <percent>', 'Clip both black and white ends by N% during contrast stretch')
  .option('--gamma1', 'Skip 2.2 gamma correction, leaving the raw file linear (gamma 1.0)')
  .option('--no-negfix', '[deprecated: use --no-invert] Skip negative inversion')
  .option('--dimensions [width]x[height]', '[deprecated] Manually specify pixel dimensions for headerless raw files (e.g. "4000x2000")')
  .addOption(new Option('--install-quick-action', 'Install macOS Finder right-click Quick Action for folders').hideHelp(process.platform !== 'darwin'))
  .addOption(new Option('--uninstall-quick-action', 'Remove the macOS Finder Quick Action').hideHelp(process.platform !== 'darwin'))
  .option('--examples', 'Show usage examples')
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

  Process a specific directory of .raw files (output: /path/to/raw/files_pprc_out/):
    pprc --dir /path/to/raw/files

  Process a directory, writing output to a specific folder:
    pprc --dir /path/to/raw/files --dir-out /path/to/output

  Skip inversion — useful if you want to invert with another tool:
    pprc --no-invert

  Process slide film (E6) scans — no inversion needed, just auto-levels:
    pprc --e6

  Process black and white film — invert and auto-level in greyscale:
    pprc --bw

  Per-image balancing — useful when frames on a roll have very different exposures:
    pprc --per-image-balancing

  Reduce contrast stretch clipping — for rolls with low-density frames:
    pprc --clip 0.01

  Aggressive clipping for a punchier, minilab-style look:
    pprc --clip 2.5

  Clip shadows and highlights separately:
    pprc --clip-black 0.5 --clip-white 0.1

  Skip gamma correction — output linear data for manual processing:
    pprc --gamma1

  Include all frames in color balancing, even outliers:
    pprc --no-frame-rejection

  Install macOS Finder Quick Action — right-click folders to process:
    pprc --install-quick-action

  Remove the Finder Quick Action:
    pprc --uninstall-quick-action
`);
  process.exit(0);
}

// Handle deprecated --no-negfix flag
if (opts.negfix === false) {
  console.warn("Warning: --no-negfix is deprecated, use --no-invert instead");
  opts.invert = false;
}

var noInvert = opts.invert === false || opts.e6 || opts.bw || opts.bwRgb;

// Resolve input directory and sibling output paths
var inputDir = opts.dir ? path.resolve(opts.dir) : process.cwd();
var parentDir, dirBaseName, outputDir, tiffDir;

if (opts.dir) {
  parentDir = path.dirname(inputDir);
  dirBaseName = path.basename(inputDir);
  outputDir = opts.dirOut !== OUTPUT_DIR
    ? opts.dirOut
    : path.join(parentDir, dirBaseName + "_pprc_out");
} else {
  outputDir = opts.dirOut;
}

// Auto-increment output dir if it already exists (only for default naming)
var usingDefaultOutputDir = opts.dirOut === OUTPUT_DIR;
if (usingDefaultOutputDir && fs.existsSync(outputDir)) {
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

// Check output dir for existing tiffs
(function() {
  if (fs.existsSync(outputDir)){
    var existingFiles = fs.readdirSync(outputDir).filter(function(f) { return /\.tiff?$/i.test(f); });
    if (existingFiles.length > 0) {
      exitWithError(`Output directory '${outputDir}' already contains ${existingFiles.length} TIFF file${existingFiles.length === 1 ? '' : 's'}. Please remove or rename it before running again.`);
    }
  } else if (!noInvert) {
    fs.mkdirSync(outputDir);
  }

  // Create the tiff directory (only needed for --no-invert)
  if (noInvert && !fs.existsSync(tiffDir)) {
    fs.mkdirSync(tiffDir);
  }

  var startTime = Date.now();
  var rawFiles = scanDirectoryForFiles();
  var usableRawFiles = checkRawFiles(rawFiles);
  convertRawFilesToTiff(usableRawFiles).then(function(buffers){
    process.stdout.write("\n");

    if (noInvert) {
      // buffers are actually file paths in --no-invert mode
      var verb;
      if (opts.e6) {
        verb = "auto-leveled";
      } else if (opts.bw) {
        verb = "inverted and auto-leveled greyscale";
      } else if (opts.bwRgb) {
        verb = "inverted and auto-leveled RGB";
      } else {
        verb = "raw";
      }
      console.log(`\n✨ Completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s!`);
      console.log(`${buffers.length} ${buffers.length === 1 ? "file" : "files"} saved to '${tiffDir}' as ${verb} TIFF.`);
    } else {
      invertBuffersWithNegpro(buffers);
    }
  });

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

    processImages(images, negproOpts).then(function(results) {
      process.stdout.write("\n");

      console.log(`\n✨ Completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s!`);
      console.log(`${results.length} ${results.length === 1 ? "file" : "files"} saved to '${outputDir}' as processed TIFF.`);

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

function scanDirectoryForFiles () {
  var rawFiles = fs.readdirSync(inputDir).filter(function(f) { return /\.raw$/i.test(f); });

  if (!rawFiles.length) {
    exitWithError(`No .raw files found in ${opts.dir ? "'" + inputDir + "'" : "the current directory"}\nPlease run this script from the same directory where you have saved your planar .raw files from TLXClientDemo, or use --dir to specify the directory.`);
  } else {
    console.log(`Found ${rawFiles.length} raw files in ${opts.dir ? "'" + inputDir + "'" : "current directory"}...`);
    return rawFiles;
  }
}

function tryReadHeader(filePath) {
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
  var fileSize = fs.statSync(filePath).size;
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
    var header = tryReadHeader(filePath);
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

  var qualifiers = [];
  if (noInvert) qualifiers.push("no inversion");
  if (opts.gamma1) qualifiers.push("without gamma adjustment");
  if (qualifiers.length) label += " (" + qualifiers.join(", ") + ")";

  console.log(label);

  var items = Object.keys(data);
  var convertDone = items.map(function() { return false; });

  function renderConvertProgress() {
    var bar = convertDone.map(function(done) { return done ? '▰' : '▱'; }).join(' ');
    process.stdout.write(`\r${bar}`);
  }

  renderConvertProgress();

  var promises = items.map(function(item, index) {
    return convertRawToTiff(item, data[item]).then(function(result) {
      convertDone[index] = true;
      renderConvertProgress();
      return result;
    });
  });

  return Promise.all(promises);
}

function convertRawToTiff (name, fileInfo) {
  var baseName = path.basename(name, ".raw");
  var destinationFile = noInvert ? path.join(tiffDir, `${baseName}.tif`) : null;
  var returnBuffer = !noInvert;

  var mode = 'default';
  if (opts.e6) mode = 'e6';
  else if (opts.bw) mode = 'bw';
  else if (opts.bwRgb) mode = 'bw-rgb';

  return new Promise(function(resolve, reject) {
    var worker = new Worker(path.join(__dirname, 'lib', 'convert-worker.js'), {
      workerData: {
        name: path.resolve(inputDir, name),
        width: fileInfo.width,
        height: fileInfo.height,
        channels: fileInfo.channels,
        headerOffset: fileInfo.headerOffset,
        destinationFile: destinationFile ? path.resolve(destinationFile) : null,
        applyGamma: !opts.gamma1,
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
