// SPDX-License-Identifier: MIT
"use strict";
function isWebm(bytes) {
  return bytes.length >= 16 && bytes.readUInt32BE(0) === 0x1a45dfa3 && bytes.subarray(4, Math.min(bytes.length, 4096)).includes(Buffer.from('webm'));
}
function isMp4(bytes) {
  return bytes.length >= 16 && bytes.toString('ascii', 4, 8) === 'ftyp' && bytes.readUInt32BE(0) >= 16 && bytes.readUInt32BE(0) <= bytes.length;
}
function mediaMatches(kind, mimeType, bytes) {
  if (kind === 'file') return true;
  if (kind === 'image') {
    if (mimeType === 'image/jpeg') return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (mimeType === 'image/png') return bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) &&
      bytes.readUInt32BE(8) === 13 && bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0;
    if (mimeType === 'image/webp') return bytes.length >= 16 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' &&
      ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16));
    return false;
  }
  if (kind === 'video' || kind === 'round') return (mimeType === 'video/webm' && isWebm(bytes)) || (mimeType === 'video/mp4' && isMp4(bytes));
  if (kind === 'audio') {
    if (mimeType === 'audio/webm') return isWebm(bytes);
    if (mimeType === 'audio/mp4') return isMp4(bytes);
    if (mimeType === 'audio/ogg') return bytes.length >= 27 && bytes.toString('ascii', 0, 4) === 'OggS' && bytes[4] === 0;
    if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav') return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE';
    if (mimeType === 'audio/mpeg') return (bytes.length >= 10 && bytes.toString('ascii', 0, 3) === 'ID3' && bytes.subarray(6, 10).every(value => value < 128)) ||
      (bytes.length >= 4 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 0x06) !== 0 &&
        (bytes[2] & 0x0c) !== 0x0c && (bytes[2] & 0xf0) !== 0xf0);
  }
  return false;
}
module.exports = { mediaMatches };
