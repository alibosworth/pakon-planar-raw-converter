import fs from 'fs';

export function writeTiff16(filePath, pixelData, width, height, channels, software) {
  var pixelBytes = width * height * channels * 2;
  var bpsCount = channels;

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
  try {
    writeFully(fd, headerBuf);
    writeFully(fd, pixelBuf);
  } finally {
    // Always release the descriptor, even if a write throws.
    fs.closeSync(fd);
  }
}

// fs.writeSync may write fewer bytes than requested (a short write); loop until
// the whole buffer is committed rather than assuming one call suffices.
function writeFully(fd, buffer) {
  var offset = 0;
  while (offset < buffer.length) {
    offset += fs.writeSync(fd, buffer, offset, buffer.length - offset);
  }
}
