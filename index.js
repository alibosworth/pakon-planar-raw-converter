#!/usr/bin/env node
var fs = require( 'fs' );
var path = require( 'path' );
var process = require( "process" );
var glob = require('glob');
var { Worker } = require('worker_threads');
var Promise = require("bluebird");
var negpro = require('negpro');
var program = require('commander');
var pkg = require('./package.json');

console.log(`pprc v${pkg.version}`);

var OUTPUT_DIR = "out";

var BYTE_SIZE_TO_DIMENSIONS = { // Fallback map of file size to dimensions for headerless files
  "36000000": "3000x2000",     // "Base 16"
  "20250000": "2250x1500",     // "Base 8"
  "9000000" : "1500x1000"      // "Base 4"
};

var HEADER_SIZE = 16;
var BYTES_PER_CHANNEL = 2; // 16-bit

program
  .version(pkg.version)
  .option('--dir [dir]', 'Directory containing .raw files to process (default: current directory)')
  .option('--output-dir [dir]', `Override the default output directory name "${OUTPUT_DIR}"`, OUTPUT_DIR)
  .option('--no-invert', 'Skip negative inversion, leaving you with raw .tiff files for further processing with another tool')
  .option('--e6', 'Skip negative inversion, apply auto-level on files.  Useful when scanning "Film Color: Positive" in TLXClientDemo')
  .option('--bw', 'Skip negative inversion, instead: invert, auto-level, and save in grey-scale colorspace')
  .option('--bw-rgb', 'Skip negative inversion, instead: invert, auto-level, and save in RGB colorspace')
  .option('--per-image-balancing', 'Compute a separate inversion profile for each image instead of sharing one across all files')
  .option('--no-frame-rejection', 'Disable rejection of outlier frames when computing shared inversion profile')
  .option('--keep-intermediate-tiffs', 'Keep the intermediate tiff files instead of deleting them after inversion')
  .option('--gamma1', 'Do not apply a 2.2 gamma correction when converting the raw file, instead leaving it "linear", with a 1.0 gamma')
  .option('--no-negfix', '[deprecated: use --no-invert] Skip negative inversion')
  .option('--dimensions [width]x[height]', '[deprecated: save files with "Add File Header" selected] Manually specify pixel dimensions for headerless raw files (e.g. "3000x2000"). Not needed when "Add File Header" is enabled in TLXClientDemo.  Also not needed if your headerless files did not use custom sizing (eg you aren\'t doing half-frame or XPan scans)') 
  .parse(process.argv);

// Handle deprecated --no-negfix flag
if (program.negfix === false) {
  console.warn("Warning: --no-negfix is deprecated, use --no-invert instead");
  program.invert = false;
}

var noInvert = program.invert === false || program.e6 || program.bw || program.bwRgb;

// Resolve input directory and sibling output paths
var inputDir = program.dir ? path.resolve(program.dir) : process.cwd();
var parentDir, dirBaseName, outputDir, tiffDir;

if (program.dir) {
  parentDir = path.dirname(inputDir);
  dirBaseName = path.basename(inputDir);
  outputDir = program.outputDir !== OUTPUT_DIR
    ? program.outputDir
    : path.join(parentDir, dirBaseName + "_pprc_out");
} else {
  outputDir = program.outputDir;
}

if (noInvert) {
  // When skipping inversion, tiffs are the final output — put them in the output dir
  tiffDir = outputDir;
} else if (program.keepIntermediateTiffs) {
  tiffDir = program.dir
    ? path.join(parentDir, dirBaseName + "_pprc_tiffs")
    : "tiffs";
} else {
  tiffDir = program.dir
    ? path.join(parentDir, dirBaseName + "_pprc_temp_tiffs_" + Date.now())
    : "temp_tiffs_" + Date.now();
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

  // Create the tiff directory
  if (!fs.existsSync(tiffDir)) {
    fs.mkdirSync(tiffDir);
  }

  var rawFiles = scanDirectoryForFiles();
  var usableRawFiles = checkRawFiles(rawFiles);
  convertRawFilesToTiff(usableRawFiles).then(function(tifs){
    process.stdout.write("\n");

    if (noInvert) {
      var verb;
      if (program.e6) {
        verb = "auto-leveled";
      } else if (program.bw) {
        verb = "inverted and auto-leveled greyscale";
      } else if (program.bwRgb) {
        verb = "inverted and auto-leveled RGB";
      } else {
        verb = "raw";
      }
      console.log(`Done. ${tifs.length} ${tifs.length === 1 ? "file" : "files"} saved to '${tiffDir}' as a ${verb} TIFF.`);
    } else {
      adjustTifsWithNegpro(tifs).then(function(convertedFiles) {
        process.stdout.write("\n");
        // Clean up temp tiff directory unless --keep-tiffs
        if (!program.keepIntermediateTiffs) {
          tifs.forEach(function(tif) {
            try { fs.unlinkSync(tif); } catch (e) {}
          });
          try { fs.rmdirSync(tiffDir); } catch (e) {}
          console.log("Deleted temporary tiffs, use --keep-intermediate-tiffs to disable deleting.");
        }
        console.log(`Done. ${convertedFiles.length} ${convertedFiles.length === 1 ? "file" : "files"} saved to '${outputDir}' as processed TIFF.`);
        if (program.keepIntermediateTiffs) {
          console.log(`Intermediate tiff files kept in '${tiffDir}'.`);
        }
        if (convertedFiles.rejectedFramesEvent) {
          var evt = convertedFiles.rejectedFramesEvent;
          console.log(`\nNote: ${evt.rejected.length} of ${evt.total} frames were not used when calculating shared color balance due to differing color characteristics:`);
          evt.rejected.forEach(function(filePath) {
            console.log(`  ${path.basename(filePath)}`);
          });
          console.log("Use --no-frame-rejection to include all frames in color balancing.");
        }
      });
    }
  });
})();

function scanDirectoryForFiles () {
  var rawFiles = glob.sync('*.raw', { cwd: inputDir });

  if (!rawFiles.length) {
    exitWithError(`No .raw files found in ${program.dir ? "'" + inputDir + "'" : "the current directory"}\nPlease run this script from the same directory where you have saved your planar .raw files from TLXClientDemo, or use --dir to specify the directory.`);
  } else {
    console.log(`Found ${rawFiles.length} raw files in ${program.dir ? "'" + inputDir + "'" : "current directory"}...`);
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
    if (!fileInfo && program.dimensions && program.dimensions.split("x").length === 2) {
      var splitDimensions = program.dimensions.split("x"),
          width = parseInt(splitDimensions[0], 10),
          height = parseInt(splitDimensions[1], 10);
      var channels = 3;
      var expectedPixelBytes = width * height * channels * BYTES_PER_CHANNEL;

      if (sizeInBytes === expectedPixelBytes) {
        fileInfo = { width: width, height: height, channels: channels, headerOffset: 0 };
      } else if (sizeInBytes === HEADER_SIZE + expectedPixelBytes) {
        fileInfo = { width: width, height: height, channels: channels, headerOffset: HEADER_SIZE };
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
  if (validFileCount === 0) {
    exitWithError("Sorry, no .raw files in the current directory could be read.");
  } else if (validFileCount === rawFiles.length) {
    console.log(`All ${validFileCount} files are valid...`);
  } else {
    console.log(`${validFileCount} files will be converted but ${rawFiles.length-validFileCount} (${badFiles.join(",")}) ${badFiles.length === 1 ? "is" : "are"} not recognized...`);
  }

  return data;
}

function convertRawFilesToTiff (data) {
  var label = "Converting raw files to tiff files";

  if (program.gamma1) {
    label = label + " (without gamma adjustment)";
  }

  console.log(label);

  var items = Object.keys(data);
  var convertDone = items.map(function() { return false; });

  function renderConvertProgress() {
    var bar = convertDone.map(function(done) { return done ? '✓' : '▢'; }).join(' ');
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
  var destinationFile = path.join(tiffDir, `${baseName}.tif`);

  var mode = 'default';
  if (program.e6) mode = 'e6';
  else if (program.bw) mode = 'bw';
  else if (program.bwRgb) mode = 'bw-rgb';

  return new Promise(function(resolve, reject) {
    var worker = new Worker(path.join(__dirname, 'lib', 'convert-worker.js'), {
      workerData: {
        name: path.resolve(inputDir, name),
        width: fileInfo.width,
        height: fileInfo.height,
        channels: fileInfo.channels,
        headerOffset: fileInfo.headerOffset,
        destinationFile: path.resolve(destinationFile),
        applyGamma: !program.gamma1,
        mode: mode
      }
    });
    worker.on('message', function(result) {
      resolve(result);
    });
    worker.on('error', reject);
  });
}

function adjustTifsWithNegpro(tifs) {
  var tifPaths = tifs.map(function(tif) {
    return path.resolve(tif);
  });

  var totalFiles = tifPaths.length;
  var analysisDone = [];
  var adjustDone = [];
  for (var i = 0; i < totalFiles; i++) {
    analysisDone.push(false);
    adjustDone.push(false);
  }

  var resolvedPerImage = false;
  var analyzeLabelPrinted = false;
  var invertLabelPrinted = false;
  var rejectedFramesEvent = null;

  function renderProgress(completed) {
    var bar = completed.map(function(done) { return done ? '✓' : '▢'; }).join(' ');
    process.stdout.write(`\r${bar}`);
  }

  var options = {
    outputDir: path.resolve(outputDir),
    onProgress: function(event) {
      if (event.type === 'config') {
        resolvedPerImage = event.config.perImage;
        if (resolvedPerImage) {
          console.log("Inverting tiff files with negpro (per-image balancing)");
        }
        return;
      }

      if (event.type === 'frames-rejected') {
        rejectedFramesEvent = event;
        return;
      }

      if (resolvedPerImage) {
        // In per-image mode, analyze+invert are interleaved per file,
        // so just track completion with a single progress bar
        if (event.type === 'done') {
          adjustDone[event.index] = true;
          renderProgress(adjustDone);
        }
      } else {
        if (event.type === 'analyzing') {
          if (!analyzeLabelPrinted) {
            analyzeLabelPrinted = true;
            console.log("Analysing tiff files to determine average image data for inversion");
          }
          analysisDone[event.index] = true;
          renderProgress(analysisDone);
        } else if (event.type === 'profile-computed') {
          process.stdout.write("\n");
        } else if (event.type === 'processing' && !invertLabelPrinted) {
          invertLabelPrinted = true;
          console.log("Inverting tiff files with negpro");
        } else if (event.type === 'done') {
          adjustDone[event.index] = true;
          renderProgress(adjustDone);
        }
      }
    }
  };

  // Only pass these options when explicitly set via CLI, so negpro's
  // own config.json defaults are respected otherwise
  if (program.perImageBalancing) {
    options.perImage = true;
  }
  if (program.frameRejection === false) {
    options.rejectOutliers = false;
  }

  return negpro.processFiles(tifPaths, options).then(function(results) {
    results.rejectedFramesEvent = rejectedFramesEvent;
    return results;
  });
}

function exitWithError (message) {
  console.error("ERROR: "+ message);
  process.exit(1);
}
