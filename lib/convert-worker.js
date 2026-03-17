import { workerData, parentPort } from 'worker_threads';
import fs from 'fs';

var name = workerData.name;
var width = workerData.width;
var height = workerData.height;
var channels = workerData.channels;
var headerOffset = workerData.headerOffset;
var destinationFile = workerData.destinationFile;
var applyGamma = workerData.applyGamma;
var mode = workerData.mode; // 'default', 'e6', 'bw', 'bw-rgb'
var software = workerData.software;

var rawBuffer = fs.readFileSync(name);
if (headerOffset > 0) {
  rawBuffer = rawBuffer.slice(headerOffset);
}

var pixelCount = width * height;
var rawU16 = new Uint16Array(rawBuffer.buffer, rawBuffer.byteOffset, pixelCount * channels);

// Build gamma LUT if needed
var gammaLUT = null;
if (applyGamma) {
  var invGamma = 1.0 / 2.2;
  gammaLUT = new Uint16Array(65536);
  for (var k = 0; k < 65536; k++) {
    gammaLUT[k] = Math.round(65535 * Math.pow(k / 65535, invGamma));
  }
}

// Deplanarize (RRRGGGBBB → RGBRGBRGB) and apply gamma in a single pass
var rgbData = new Uint16Array(pixelCount * 3);
var rOffset = 0;
var gOffset = pixelCount;
var bOffset = pixelCount * 2;
if (gammaLUT) {
  for (var i = 0; i < pixelCount; i++) {
    var idx = i * 3;
    rgbData[idx]     = gammaLUT[rawU16[rOffset + i]];
    rgbData[idx + 1] = gammaLUT[rawU16[gOffset + i]];
    rgbData[idx + 2] = gammaLUT[rawU16[bOffset + i]];
  }
} else {
  for (var i = 0; i < pixelCount; i++) {
    var idx = i * 3;
    rgbData[idx]     = rawU16[rOffset + i];
    rgbData[idx + 1] = rawU16[gOffset + i];
    rgbData[idx + 2] = rawU16[bOffset + i];
  }
}

// Mode-specific operations
if (mode === 'e6') {
  autoLevel(rgbData);
} else if (mode === 'bw' || mode === 'bw-rgb') {
  for (var j = 0; j < rgbData.length; j++) {
    rgbData[j] = 65535 - rgbData[j];
  }
  autoLevel(rgbData);
}

var outputChannels = 3;
var outputData = rgbData;

if (mode === 'bw') {
  var gray = new Uint16Array(pixelCount);
  for (var i = 0; i < pixelCount; i++) {
    gray[i] = Math.round(
      0.2126 * rgbData[i * 3] +
      0.7152 * rgbData[i * 3 + 1] +
      0.0722 * rgbData[i * 3 + 2]
    );
  }
  outputData = gray;
  outputChannels = 1;
}

if (workerData.returnBuffer) {
  // Return pixel buffer for direct handoff to negpro (no intermediate TIFF)
  var result = { pixels: outputData, width: width, height: height, channels: outputChannels, name: workerData.baseName };
  parentPort.postMessage(result, [outputData.buffer]);
} else {
  // Write TIFF to disk (--no-invert mode)
  writeTiff16(destinationFile, outputData, width, height, outputChannels, software);
  parentPort.postMessage(destinationFile);
}

function autoLevel(data) {
  var min = 65535, max = 0;
  for (var i = 0; i < data.length; i++) {
    if (data[i] < min) min = data[i];
    if (data[i] > max) max = data[i];
  }
  if (max > min) {
    var scale = 65535 / (max - min);
    for (var i = 0; i < data.length; i++) {
      data[i] = Math.round((data[i] - min) * scale);
    }
  }
}

function writeTiff16(filePath, pixelData, width, height, channels, software) {
  var pixelBytes = width * height * channels * 2;
  var bpsCount = channels;

  // Software string (tag 305) is null-terminated ASCII
  var softwareStr = software ? software + '\0' : null;

  var numEntries = softwareStr ? 13 : 12;
  var ifdOffset = 8;
  var ifdSize = 2 + numEntries * 12 + 4;

  var extraOffset = ifdOffset + ifdSize;
  var bpsValuesOffset = extraOffset;
  var bpsSize = bpsCount > 1 ? bpsCount * 2 : 0;
  var softwareOffset = extraOffset + bpsSize;
  var softwareSize = softwareStr ? softwareStr.length : 0;
  var xResOffset = extraOffset + bpsSize + softwareSize;
  var yResOffset = xResOffset + 8;
  var pixelDataOffset = yResOffset + 8;

  // Write header and pixel data separately to avoid duplicating the
  // pixel buffer (~36MB per image) into a single contiguous allocation.
  var headerBuf = Buffer.alloc(pixelDataOffset);

  headerBuf.write('II', 0);
  headerBuf.writeUInt16LE(42, 2);
  headerBuf.writeUInt32LE(ifdOffset, 4);

  var pos = ifdOffset;
  headerBuf.writeUInt16LE(numEntries, pos); pos += 2;

  function writeEntry(tag, type, count, value) {
    headerBuf.writeUInt16LE(tag, pos); pos += 2;
    headerBuf.writeUInt16LE(type, pos); pos += 2;
    headerBuf.writeUInt32LE(count, pos); pos += 4;
    if (type === 3 && count === 1) {
      headerBuf.writeUInt16LE(value, pos); pos += 4;
    } else {
      headerBuf.writeUInt32LE(value, pos); pos += 4;
    }
  }

  writeEntry(256, 3, 1, width);
  writeEntry(257, 3, 1, height);
  if (bpsCount === 1) {
    writeEntry(258, 3, 1, 16);
  } else {
    writeEntry(258, 3, bpsCount, bpsValuesOffset);
  }
  writeEntry(259, 3, 1, 1);
  writeEntry(262, 3, 1, channels === 1 ? 1 : 2);
  writeEntry(273, 4, 1, pixelDataOffset);
  writeEntry(274, 3, 1, 1);
  writeEntry(277, 3, 1, channels);
  writeEntry(278, 3, 1, height);
  writeEntry(279, 4, 1, pixelBytes);
  writeEntry(282, 5, 1, xResOffset);
  writeEntry(283, 5, 1, yResOffset);
  if (softwareStr) {
    writeEntry(305, 2, softwareStr.length, softwareStr.length <= 4 ? 0 : softwareOffset);
  }

  headerBuf.writeUInt32LE(0, pos);

  if (bpsCount > 1) {
    for (var i = 0; i < bpsCount; i++) {
      headerBuf.writeUInt16LE(16, bpsValuesOffset + i * 2);
    }
  }

  if (softwareStr) {
    headerBuf.write(softwareStr, softwareOffset, 'ascii');
  }

  headerBuf.writeUInt32LE(72, xResOffset);
  headerBuf.writeUInt32LE(1, xResOffset + 4);
  headerBuf.writeUInt32LE(72, yResOffset);
  headerBuf.writeUInt32LE(1, yResOffset + 4);

  var pixelBuf = Buffer.from(pixelData.buffer, pixelData.byteOffset, pixelData.byteLength);

  var fd = fs.openSync(filePath, 'w');
  fs.writeSync(fd, headerBuf);
  fs.writeSync(fd, pixelBuf);
  fs.closeSync(fd);
}
