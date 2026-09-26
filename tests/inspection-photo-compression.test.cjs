'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const sharp = require('../recovered/node_modules/sharp');
const { compressInspectionPhoto, MAX_INPUT_PIXELS, MAX_OUTPUT_EDGE } = require('../recovered/apps/api/src/modules/inspections/domain/photo-compression');

function raster(width, height) {
  const content = Buffer.alloc(width * height * 3);
  let random = 42;
  for (let offset = 0; offset < content.length; offset += 3) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    const x = (offset / 3) % width;
    const y = Math.floor(offset / 3 / width);
    content[offset] = (x / width * 180 + (random & 31)) & 255;
    content[offset + 1] = (y / height * 180 + ((random >>> 8) & 31)) & 255;
    content[offset + 2] = ((x + y) / (width + height) * 180 + ((random >>> 16) & 31)) & 255;
  }
  return sharp(content, { raw: { width, height, channels: 3 } });
}

function crc32(content) {
  let crc = 0xffffffff;
  for (const byte of content) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 'ascii');
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, chunk.length - 4)), chunk.length - 4);
  return chunk;
}

async function assertCompressed(input, mimeType, expectedWidth, expectedHeight) {
  const original = Buffer.from(input);
  const output = await compressInspectionPhoto({ content: input, mimeType });
  assert.equal(output.changed, true);
  assert.equal(output.mimeType, 'image/webp');
  assert.equal(output.byteSize, output.content.length);
  assert.ok(output.byteSize < input.length * 0.4, `${output.byteSize} must be far smaller than ${input.length}`);
  assert.equal(output.sha256, createHash('sha256').update(output.content).digest('hex'));
  assert.equal(output.width, expectedWidth);
  assert.equal(output.height, expectedHeight);
  const metadata = await sharp(output.content).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, expectedWidth);
  assert.equal(metadata.height, expectedHeight);
  assert.equal(metadata.pages ?? 1, 1);
  assert.ok(Math.max(metadata.width, metadata.height) <= MAX_OUTPUT_EDGE);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.equal(metadata.xmp, undefined);
  assert.deepEqual(input, original, 'the caller input is never mutated');
  return output;
}

test('large JPEG becomes much smaller WebP while preserving aspect ratio', async () => {
  const input = await raster(2400, 1800).jpeg({ quality: 97 }).toBuffer();
  await assertCompressed(input, 'image/jpeg', 1600, 1200);
});

test('large PNG becomes much smaller WebP and never crops the inspection photo', async () => {
  const input = await raster(2100, 1400).png().toBuffer();
  await assertCompressed(input, 'image/png', 1600, 1067);
});

test('phone EXIF orientation is applied before resize and camera metadata is removed', async () => {
  const input = await raster(1800, 2400)
    .withMetadata({ orientation: 6 })
    .withExifMerge({ IFD0: { Artist: 'Inspection fixture', Copyright: 'Internal fixture' } })
    .jpeg({ quality: 95 }).toBuffer();
  const metadata = await sharp(input).metadata();
  assert.equal(metadata.orientation, 6);
  assert.ok(metadata.exif);
  assert.ok(metadata.icc);
  await assertCompressed(input, 'image/jpeg', 1600, 1200);
});

test('smaller photos are compressed without enlargement', async () => {
  const input = await raster(160, 100).png().toBuffer();
  await assertCompressed(input, 'image/png', 160, 100);
});

test('an already tiny photo is retained byte for byte when compression would enlarge it', async () => {
  const input = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'black' } }).webp({ lossless: true }).toBuffer();
  const output = await compressInspectionPhoto({ content: input, mimeType: 'image/webp' });
  assert.equal(output.changed, false);
  assert.strictEqual(output.content, input);
  assert.equal(output.mimeType, 'image/webp');
  assert.equal(output.byteSize, input.length);
  assert.equal(output.width, 1);
  assert.equal(output.height, 1);
  assert.equal(output.sha256, createHash('sha256').update(input).digest('hex'));
});

test('corrupt, empty and incorrectly labelled input yields terminal errors without changing bytes', async () => {
  const png = await raster(20, 20).png().toBuffer();
  const jpeg = await raster(100, 100).jpeg().toBuffer();
  for (const [content, mimeType] of [
    [Buffer.alloc(0), 'image/jpeg'],
    [Buffer.from('not an image'), 'image/jpeg'],
    [png, 'image/jpeg'],
    [png, 'image/svg+xml'],
    [jpeg.subarray(0, jpeg.length - 30), 'image/jpeg'],
  ]) {
    const original = Buffer.from(content);
    await assert.rejects(compressInspectionPhoto({ content, mimeType }), error =>
      error.code === 'INSPECTION_PHOTO_INVALID_IMAGE' && error.retryable === false && typeof error.reason === 'string');
    assert.deepEqual(content, original);
  }
});

test('images declaring more than forty million pixels are rejected before raster allocation', async () => {
  const png = await raster(1, 1).png().toBuffer();
  const header = Buffer.from(png.subarray(16, 29));
  header.writeUInt32BE(6400, 0);
  header.writeUInt32BE(6251, 4);
  assert.ok(6400 * 6251 > MAX_INPUT_PIXELS);
  const oversized = Buffer.concat([png.subarray(0, 8), pngChunk('IHDR', header), png.subarray(33)]);
  await assert.rejects(compressInspectionPhoto({ content: oversized, mimeType: 'image/png' }), error =>
    error.code === 'INSPECTION_PHOTO_INVALID_IMAGE' && error.retryable === false);
});

test('animated WebP and APNG cannot be silently flattened into a single photo', async () => {
  const pixels = Buffer.concat([Buffer.alloc(10 * 10 * 3, 0), Buffer.alloc(10 * 10 * 3, 255)]);
  const webp = await sharp(pixels, { raw: { width: 10, height: 20, pageHeight: 10, channels: 3 } }).webp({ loop: 0 }).toBuffer();
  assert.equal((await sharp(webp).metadata()).pages, 2);
  const png = await raster(20, 20).png().toBuffer();
  const animationControl = Buffer.alloc(8);
  animationControl.writeUInt32BE(2, 0);
  const apng = Buffer.concat([png.subarray(0, 33), pngChunk('acTL', animationControl), png.subarray(33)]);
  for (const [content, mimeType] of [[webp, 'image/webp'], [apng, 'image/png']]) {
    await assert.rejects(compressInspectionPhoto({ content, mimeType }), error =>
      error.code === 'INSPECTION_PHOTO_INVALID_IMAGE' && error.reason === 'multiple_frames' && error.retryable === false);
  }
});
