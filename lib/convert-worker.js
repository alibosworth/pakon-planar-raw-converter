var { workerData, parentPort } = require('worker_threads');
var fs = require('fs');

var name = workerData.name;
var sizeParameter = workerData.sizeParameter;
var destinationFile = workerData.destinationFile;
var applyGamma = workerData.applyGamma;
var mode = workerData.mode; // 'default', 'e6', 'bw', 'bw-rgb'

// Parse "WxH" or "WxH+offset"
var parts = sizeParameter.split('+');
var dims = parts[0].split('x');
var width = parseInt(dims[0], 10);
var height = parseInt(dims[1], 10);
var headerOffset = parts.length > 1 ? parseInt(parts[1], 10) : 0;

var rawBuffer = fs.readFileSync(name);
if (headerOffset > 0) {
  rawBuffer = rawBuffer.slice(headerOffset);
}

var pixelCount = width * height;
var rawU16 = new Uint16Array(rawBuffer.buffer, rawBuffer.byteOffset, pixelCount * 3);

// Deplanarize: RRRGGGBBB → RGBRGBRGB
var interleaved = new Uint16Array(pixelCount * 3);
for (var i = 0; i < pixelCount; i++) {
  interleaved[i * 3]     = rawU16[i];
  interleaved[i * 3 + 1] = rawU16[pixelCount + i];
  interleaved[i * 3 + 2] = rawU16[pixelCount * 2 + i];
}

// Gamma 2.2 correction
if (applyGamma) {
  var invGamma = 1.0 / 2.2;
  for (var j = 0; j < interleaved.length; j++) {
    interleaved[j] = Math.round(65535 * Math.pow(interleaved[j] / 65535, invGamma));
  }
}

// Mode-specific operations
if (mode === 'e6') {
  autoLevel(interleaved);
} else if (mode === 'bw' || mode === 'bw-rgb') {
  for (var j = 0; j < interleaved.length; j++) {
    interleaved[j] = 65535 - interleaved[j];
  }
  autoLevel(interleaved);
}

var outputChannels = 3;
var outputData = interleaved;

if (mode === 'bw') {
  var gray = new Uint16Array(pixelCount);
  for (var i = 0; i < pixelCount; i++) {
    gray[i] = Math.round(
      0.2126 * interleaved[i * 3] +
      0.7152 * interleaved[i * 3 + 1] +
      0.0722 * interleaved[i * 3 + 2]
    );
  }
  outputData = gray;
  outputChannels = 1;
}

writeTiff16(destinationFile, outputData, width, height, outputChannels);
parentPort.postMessage(destinationFile);

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

function writeTiff16(filePath, pixelData, width, height, channels) {
  var pixelBytes = width * height * channels * 2;
  var bpsCount = channels;

  var numEntries = 12;
  var ifdOffset = 8;
  var ifdSize = 2 + numEntries * 12 + 4;

  var extraOffset = ifdOffset + ifdSize;
  var bpsValuesOffset = extraOffset;
  var bpsSize = bpsCount > 1 ? bpsCount * 2 : 0;
  var xResOffset = extraOffset + bpsSize;
  var yResOffset = xResOffset + 8;
  var pixelDataOffset = yResOffset + 8;

  var fileSize = pixelDataOffset + pixelBytes;
  var buf = Buffer.alloc(fileSize);

  buf.write('II', 0);
  buf.writeUInt16LE(42, 2);
  buf.writeUInt32LE(ifdOffset, 4);

  var pos = ifdOffset;
  buf.writeUInt16LE(numEntries, pos); pos += 2;

  function writeEntry(tag, type, count, value) {
    buf.writeUInt16LE(tag, pos); pos += 2;
    buf.writeUInt16LE(type, pos); pos += 2;
    buf.writeUInt32LE(count, pos); pos += 4;
    if (type === 3 && count === 1) {
      buf.writeUInt16LE(value, pos); pos += 4;
    } else {
      buf.writeUInt32LE(value, pos); pos += 4;
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

  buf.writeUInt32LE(0, pos);

  if (bpsCount > 1) {
    for (var i = 0; i < bpsCount; i++) {
      buf.writeUInt16LE(16, bpsValuesOffset + i * 2);
    }
  }

  buf.writeUInt32LE(72, xResOffset);
  buf.writeUInt32LE(1, xResOffset + 4);
  buf.writeUInt32LE(72, yResOffset);
  buf.writeUInt32LE(1, yResOffset + 4);

  var pixelBuf = Buffer.from(pixelData.buffer, pixelData.byteOffset, pixelData.byteLength);
  pixelBuf.copy(buf, pixelDataOffset);

  fs.writeFileSync(filePath, buf);
}
