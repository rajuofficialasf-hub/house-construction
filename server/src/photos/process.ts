import busboy from 'busboy';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';
import { AppError } from '../errors.js';
import { photoKind, type PhotoKind } from '../housing/schemas.js';
import type { StorageDriver } from '../storage/index.js';
import { imageGate, UnsupportedImageError } from './sniff.js';

/**
 * Turns a photo upload (contract §4.10: multipart kind, photo, optional thumb) into two WebP files
 * in storage: the full photo (≤1600 px wide) and a 400 px thumbnail, both decoded and re-encoded
 * by sharp, which writes no EXIF, GPS or other metadata (roadmap R12). The client's own thumb is
 * read and discarded so its metadata never gets in. Bytes stream from the request through sharp to
 * storage (NS-04); nothing here touches the database. On any failure both keys are removed and the
 * rest of the request is drained before the error is thrown, so the client reads the error status.
 * Design: docs/plans/2026-10-05-1722-migrate-c5-photos-plan.md.
 */

export type { PhotoKind };
export type PhotoVariant = 'photo' | 'thumb';

export interface StoredPhotoFile {
  variant: PhotoVariant;
  key: string;
  sizeBytes: number;
  contentType: 'image/webp';
  originalName: string | null;
}

export interface PhotoUpload {
  kind: PhotoKind;
  files: StoredPhotoFile[];
}

export interface PhotoReceiverOptions {
  storage: StorageDriver;
  /** Uploads decoded at once; the rest wait with their request unread. */
  maxConcurrent?: number;
  maxPhotoBytes?: number;
  maxThumbBytes?: number;
  maxInputPixels?: number;
  /** After an early error, how much of the remaining body to read before giving up on the connection. */
  drainLimitBytes?: number;
  drainTimeoutMs?: number;
}

const MB = 1024 * 1024;
const FULL_WIDTH = 1600;
const THUMB_WIDTH = 400;
const WEBP_QUALITY = 80;
const OUTPUTS: readonly { variant: PhotoVariant; width: number }[] = [
  { variant: 'photo', width: FULL_WIDTH },
  { variant: 'thumb', width: THUMB_WIDTH },
];

// libvips holds decoded pixels itself; keep its cache off so memory follows the uploads in flight.
sharp.cache(false);

class StorageWriteError extends Error {
  constructor(override readonly cause: unknown) {
    super('storage write failed');
  }
}

const tooLarge = () => new AppError('PAYLOAD_TOO_LARGE', 'ছবি ৫ MB এর বেশি বড়');
const invalid = (reason: string, field?: string) =>
  new AppError('VALIDATION_ERROR', 'ছবিটি গ্রহণযোগ্য নয়', { reason, ...(field && { field }) });

/** A FIFO counting semaphore: no dependency for a dozen lines. */
function createLimiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return {
    async acquire(): Promise<() => void> {
      if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
      else active++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const next = waiting.shift();
        if (next) next();
        else active--;
      };
    },
  };
}

/** Control characters out, at most 255 characters: the name is data only, never a path (NS-01). */
function cleanName(name: string | undefined): string | null {
  // eslint-disable-next-line no-control-regex
  const cleaned = (name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255);
  return cleaned === '' ? null : cleaned;
}

/**
 * Reads and discards what is left of the request, up to a limit and a time. Past either, the
 * response is marked Connection: close so the socket ends once the error is sent.
 */
function drain(req: IncomingMessage, limitBytes: number, timeoutMs: number): Promise<void> {
  if (req.readableEnded || req.destroyed) return Promise.resolve();
  return new Promise((resolve) => {
    let bytes = 0;
    const done = (keepAlive: boolean) => {
      clearTimeout(timer);
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('close', onEnd);
      if (!keepAlive) {
        req.pause();
        // Express links the response to the request; the error response then closes the socket.
        const res = (req as IncomingMessage & { res?: ServerResponse }).res;
        if (res && !res.headersSent) res.setHeader('Connection', 'close');
      }
      resolve();
    };
    const onData = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > limitBytes) done(false);
    };
    const onEnd = () => done(true);
    const timer = setTimeout(() => done(false), timeoutMs);
    req.on('data', onData);
    req.once('end', onEnd);
    req.once('close', onEnd);
    req.resume();
  });
}

/** Builds the upload reader for one app. Call it once; its concurrency limit is shared by every request. */
export function createPhotoReceiver(options: PhotoReceiverOptions): (req: IncomingMessage) => Promise<PhotoUpload> {
  const {
    storage,
    maxConcurrent = 2,
    maxPhotoBytes = 5 * MB,
    maxThumbBytes = 500 * 1024,
    maxInputPixels = 40_000_000,
    drainLimitBytes = 10 * MB,
    drainTimeoutMs = 10_000,
  } = options;
  const limiter = createLimiter(maxConcurrent);

  /** Decodes one photo stream and writes the full image and the thumb to storage in parallel. */
  async function storePhoto(input: Readable, originalName: string | null, keys: string[], signal: AbortSignal): Promise<StoredPhotoFile[]> {
    const decoder = sharp({ limitInputPixels: maxInputPixels, failOn: 'error' });
    // The first failure on the image side (refused signature, bad pixels, input cut off). A storage
    // failure is told apart from it because it never sets this.
    let imageError: unknown;
    const encoders: Readable[] = [];

    const writes = OUTPUTS.map(async ({ variant, width }) => {
      const key = `housing/${randomUUID()}.webp`;
      keys.push(key);
      let sizeBytes = 0;
      const counter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          sizeBytes += chunk.length;
          callback(null, chunk);
        },
      });
      // A driver may attach to the body only after an await (the NAS driver creates the folder
      // first). The failure is reported through imageError or put's rejection, so a destroy before
      // then must not surface as an unhandled stream error.
      counter.on('error', () => undefined);
      const encoded = decoder.clone().rotate().resize({ width, withoutEnlargement: true }).webp({ quality: WEBP_QUALITY });
      encoders.push(encoded);
      // pipe, not pipeline: a storage failure must not reach back and make the encoder report an error.
      encoded.on('error', (err) => {
        imageError ??= err;
        counter.destroy(err);
      });
      encoded.pipe(counter);
      try {
        await storage.put(key, counter, { contentType: 'image/webp' });
      } catch (err) {
        encoded.unpipe(counter);
        encoded.destroy();
        throw imageError ? imageError : new StorageWriteError(err);
      }
      return { variant, key, sizeBytes, contentType: 'image/webp' as const, originalName };
    });

    // The upload stream belongs to busboy, which stalls if it is destroyed, so on a failure it is
    // unpiped and drained instead. The clones would wait forever for pixels, so they get the error.
    const gate = imageGate();
    input.pipe(gate);
    // The request failed elsewhere (size limit, a bad field): stop reading this photo too.
    signal.addEventListener('abort', () => gate.destroy(signal.reason as Error), { once: true });
    const feeding = pipeline(gate, decoder).catch((err: unknown) => {
      imageError ??= err;
      input.unpipe(gate);
      input.resume();
      for (const encoder of encoders) encoder.destroy(err as Error);
    });
    const results = await Promise.allSettled([feeding, ...writes]);
    if (signal.aborted) throw signal.reason;
    if (imageError instanceof UnsupportedImageError) throw invalid('unsupported_type', 'photo');
    if (imageError) throw invalid('invalid_image', 'photo');
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) throw failed.reason instanceof StorageWriteError ? failed.reason.cause : failed.reason;
    return results.slice(1).map((r) => (r as PromiseFulfilledResult<StoredPhotoFile>).value);
  }

  return async function receivePhotoUpload(req) {
    const keys: string[] = [];
    const release = await limiter.acquire();
    try {
      return await parse(req, keys);
    } catch (err) {
      await Promise.allSettled(keys.map((key) => storage.remove(key)));
      await drain(req, drainLimitBytes, drainTimeoutMs);
      throw err;
    } finally {
      release();
    }
  };

  function parse(req: IncomingMessage, keys: string[]): Promise<PhotoUpload> {
    if (!/^multipart\/form-data\b/i.test(req.headers['content-type'] ?? '')) {
      return Promise.reject(invalid('not_multipart'));
    }
    return new Promise<PhotoUpload>((resolve, reject) => {
      let parser: busboy.Busboy;
      try {
        parser = busboy({
          headers: req.headers,
          defParamCharset: 'utf8',
          limits: { files: 2, fields: 2, parts: 4, fieldSize: 64, fileSize: maxPhotoBytes },
        });
      } catch {
        reject(invalid('malformed_multipart'));
        return;
      }

      let kind: string | undefined;
      let photo: Promise<StoredPhotoFile[]> | undefined;
      let thumbSeen = false;
      let failure: AppError | undefined;
      let settled = false;
      const abort = new AbortController();

      const fail = (err: AppError) => {
        failure ??= err;
        finish();
      };
      const finish = () => {
        if (settled) return;
        settled = true;
        req.unpipe(parser);
        if (failure) abort.abort(failure);
        // Wait for the photo's writes to stop before the caller removes their keys.
        const stored = photo ?? Promise.resolve([]);
        // Errors in the order a client would fix them: the request's shape, then the image.
        void Promise.allSettled([stored]).then(([result]) => {
          if (failure) return reject(failure);
          if (kind === undefined) return reject(invalid('required', 'kind'));
          const parsedKind = photoKind.safeParse(kind);
          if (!parsedKind.success) return reject(invalid('invalid_enum_value', 'kind'));
          if (!photo) return reject(invalid('required', 'photo'));
          if (result!.status === 'rejected') return reject(result!.reason);
          resolve({ kind: parsedKind.data, files: result!.value });
        });
      };

      parser.on('field', (name, value, info) => {
        if (name !== 'kind' || kind !== undefined) return fail(invalid('unexpected_field', name));
        if (info.valueTruncated) return fail(invalid('too_long', 'kind'));
        kind = value;
      });

      parser.on('file', (name, stream, info) => {
        if (name === 'photo' && !photo) {
          stream.once('limit', () => fail(tooLarge()));
          photo = storePhoto(stream, cleanName(info.filename), keys, abort.signal);
          // finish() handles a rejection; this only stops an unhandled-rejection warning meanwhile.
          photo.catch(() => undefined);
          return;
        }
        if (name === 'thumb' && !thumbSeen) {
          thumbSeen = true;
          let bytes = 0;
          stream.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > maxThumbBytes) fail(tooLarge());
          });
          stream.once('limit', () => fail(tooLarge()));
          return;
        }
        stream.resume();
        fail(invalid('unexpected_file', name));
      });

      parser.on('partsLimit', () => fail(invalid('too_many_parts')));
      parser.on('filesLimit', () => fail(invalid('too_many_parts')));
      parser.on('fieldsLimit', () => fail(invalid('too_many_parts')));
      parser.on('error', () => fail(invalid('malformed_multipart')));
      parser.on('close', finish);
      req.on('aborted', () => fail(invalid('aborted')));
      req.pipe(parser);
    });
  }
}
