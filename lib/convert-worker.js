import { workerData, parentPort } from 'worker_threads';
import fs from 'fs';
import { writeTiff16 } from './write-tiff.js';

var name = workerData.name;
var width = workerData.width;
var height = workerData.height;
var channels = workerData.channels;
var headerOffset = workerData.headerOffset;
var destinationFile = workerData.destinationFile;
var mode = workerData.mode; // 'default', 'e6', 'bw', 'bw-rgb', 'raw'
var software = workerData.software;

var rawBuffer = fs.readFileSync(name);
if (headerOffset > 0) {
  rawBuffer = rawBuffer.subarray(headerOffset);
}

var pixelCount = width * height;
var rawU16 = new Uint16Array(rawBuffer.buffer, rawBuffer.byteOffset, pixelCount * channels);

// Deplanarize (RRRGGGBBB → RGBRGBRGB) and find max in one pass so we can
// left-shift Pakon's 14-bit values into the high bits of the 16-bit container.
// Without this, downstream consumers (atlas inversion, bw inversion against
// 65535, raw-mode TIFF write) all see data stuck at ~25% brightness.
var rgbData = new Uint16Array(pixelCount * 3);
var rOffset = 0;
var gOffset = pixelCount;
var bOffset = pixelCount * 2;
var rawMax = 0;
for (var i = 0; i < pixelCount; i++) {
  var idx = i * 3;
  var rv = rawU16[rOffset + i];
  var gv = rawU16[gOffset + i];
  var bv = rawU16[bOffset + i];
  rgbData[idx]     = rv;
  rgbData[idx + 1] = gv;
  rgbData[idx + 2] = bv;
  if (rv > rawMax) rawMax = rv;
  if (gv > rawMax) rawMax = gv;
  if (bv > rawMax) rawMax = bv;
}

if (rawMax > 16383) {
  throw new Error(
    'PPRC_RAW_OVERFLOW: expected 14-bit data from ' + workerData.baseName +
    '.raw but found values up to ' + rawMax +
    ' (max for 14-bit is 16383). Refusing to process to avoid clipping the top bits.'
  );
}
for (var s = 0; s < rgbData.length; s++) {
  rgbData[s] = rgbData[s] << 2;
}

// Invert for bw modes (contrast stretch applied later in main thread)
if (mode === 'bw' || mode === 'bw-rgb') {
  for (var j = 0; j < rgbData.length; j++) {
    rgbData[j] = 65535 - rgbData[j];
  }
}

// Always return RGB — greyscale conversion happens after contrast stretch in main thread
var outputChannels = 3;
var outputData = rgbData;

if (workerData.returnBuffer) {
  var result = { pixels: outputData, width: width, height: height, channels: outputChannels, name: workerData.baseName };
  parentPort.postMessage(result, [outputData.buffer]);
} else {
  // raw mode — write TIFF directly, no contrast stretch.
  writeTiff16(destinationFile, outputData, width, height, outputChannels, software);
  parentPort.postMessage(destinationFile);
}
