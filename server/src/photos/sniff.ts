import { Transform, type TransformCallback } from 'node:stream';

/** The image formats a photo upload may be (contract §4.10), identified by their first bytes. */
export type SniffedFormat = 'jpeg' | 'png' | 'webp';

export const SNIFF_BYTES = 12;

/**
 * The format the leading bytes say, or undefined. Never trusts a Content-Type or file name (NS-03).
 * Three fixed signatures instead of the file-type package: sharp then decodes the whole image, so
 * this only has to turn away anything that isn't one of the allowed formats before decoding.
 */
export function sniffImage(head: Buffer): SniffedFormat | undefined {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (head.length >= 12 && head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return undefined;
}

export class UnsupportedImageError extends Error {
  override name = 'UnsupportedImageError';
}

/**
 * Passes bytes through once the first SNIFF_BYTES are a JPEG, PNG or WebP signature; otherwise it
 * fails with UnsupportedImageError before anything reaches the decoder.
 */
export function imageGate(): Transform {
  let head: Buffer | undefined = Buffer.alloc(0);
  const check = (stream: Transform): Error | undefined => {
    if (!head) return undefined;
    if (!sniffImage(head)) return new UnsupportedImageError('not a JPEG, PNG or WebP image');
    stream.push(head);
    head = undefined;
    return undefined;
  };
  return new Transform({
    transform(chunk: Buffer, _encoding, callback: TransformCallback) {
      if (!head) return callback(null, chunk);
      head = Buffer.concat([head, chunk]);
      if (head.length < SNIFF_BYTES) return callback();
      callback(check(this));
    },
    flush(callback: TransformCallback) {
      callback(check(this));
    },
  });
}
