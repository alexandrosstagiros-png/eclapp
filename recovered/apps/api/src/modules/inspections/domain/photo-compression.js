"use strict";

const { createHash } = require("node:crypto");
const sharp = require("sharp");

const MAX_INPUT_PIXELS = 40_000_000;
const MAX_OUTPUT_EDGE = 1600;
const OUTPUT_QUALITY = 55;
const MIME_BY_FORMAT = Object.freeze({ jpeg: "image/jpeg", png: "image/png", webp: "image/webp" });

function invalidImage(reason, cause) {
    const error = new Error("Фотографию не удалось безопасно сжать.", cause ? { cause } : undefined);
    error.code = "INSPECTION_PHOTO_INVALID_IMAGE";
    error.reason = reason;
    error.retryable = false;
    return error;
}

function result(content, mimeType, width, height, changed) {
    return {
        content,
        mimeType,
        sha256: createHash("sha256").update(content).digest("hex"),
        byteSize: content.length,
        width,
        height,
        changed,
    };
}

// APNG is decoded by some PNG loaders as its first frame only. Reject its animation
// control chunk explicitly so a multi-frame upload cannot silently lose frames.
function isAnimatedPng(content) {
    for (let offset = 8; offset + 12 <= content.length;) {
        const length = content.readUInt32BE(offset);
        const end = offset + 12 + length;
        if (end > content.length) return false; // The decoder validates malformed chunks.
        const type = content.toString("ascii", offset + 4, offset + 8);
        if (type === "acTL") return true;
        if (type === "IEND") return false;
        offset = end;
    }
    return false;
}

/**
 * Produce a smaller archival copy, without ever replacing the photo with a larger
 * file. The caller marks changed:false as processed too; repeated lossy encoding
 * is deliberately left to neither this helper nor the maintenance worker.
 * Malformed/unsupported images have retryable:false and must keep their originals.
 */
async function compressInspectionPhoto({ content, mimeType }) {
    if (!Buffer.isBuffer(content) || !content.length) throw invalidImage("empty_input");
    if (!Object.values(MIME_BY_FORMAT).includes(mimeType)) throw invalidImage("unsupported_format");

    const image = sharp(content, { failOn: "warning", limitInputPixels: MAX_INPUT_PIXELS, pages: 1, sequentialRead: true });
    let metadata;
    try {
        metadata = await image.metadata();
    } catch (cause) {
        throw invalidImage("invalid_metadata", cause);
    }
    if (MIME_BY_FORMAT[metadata.format] !== mimeType) throw invalidImage("format_mismatch");
    if (!Number.isInteger(metadata.width) || !Number.isInteger(metadata.height)
        || metadata.width < 1 || metadata.height < 1
        || metadata.width * metadata.height > MAX_INPUT_PIXELS) throw invalidImage("pixel_limit");
    if ((metadata.pages ?? 1) !== 1 || (metadata.format === "png" && isAnimatedPng(content))) throw invalidImage("multiple_frames");

    let output;
    try {
        // rotate() applies EXIF orientation; sharp strips EXIF/ICC/XMP by default.
        output = await image.rotate()
            .resize({ width: MAX_OUTPUT_EDGE, height: MAX_OUTPUT_EDGE, fit: "inside", withoutEnlargement: true })
            .webp({ quality: OUTPUT_QUALITY, effort: 6 })
            .timeout({ seconds: 20 })
            .toBuffer({ resolveWithObject: true });
    } catch (cause) {
        if (/timeout/i.test(cause.message)) {
            const error = new Error("Сжатие фотографии превысило допустимое время.", { cause });
            error.code = "INSPECTION_PHOTO_COMPRESSION_TIMEOUT";
            error.retryable = true;
            throw error;
        }
        throw invalidImage("decode_failed", cause);
    }
    if (output.data.length >= content.length) {
        // Dimensions describe the stored bytes, including their original orientation.
        return result(content, mimeType, metadata.width, metadata.height, false);
    }
    return result(output.data, "image/webp", output.info.width, output.info.height, true);
}

module.exports = { compressInspectionPhoto, MAX_INPUT_PIXELS, MAX_OUTPUT_EDGE, OUTPUT_QUALITY };
