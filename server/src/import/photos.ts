// Copying the photos the Supabase records point at into this server's storage, before the import
// transaction (DB-TX-02, NS-06; docs/plans/2026-10-06-1035-migrate-c7-cutover-plan.md).
// - Only URLs inside the public bucket prefix given as --photo-base are fetched, and redirects are
//   refused, so a stored URL can't make the importer reach any other address.
// - Each body is streamed to a private temp file (NS-04), fully decoded by sharp, and stored byte for
//   byte only when it is already a clean WebP (no metadata, nothing after its RIFF data). Anything
//   else is re-encoded exactly as an upload is.
// - A photo that is missing on Supabase leaves its slot empty and is reported; any other failure
//   stops the import, and every file already written is removed.
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, open, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import sharp from 'sharp';
import { CliError } from '../cli/prompt.js';
import { encodeVariant, MAX_INPUT_PIXELS, type PhotoVariant } from '../photos/process.js';
import { photoUrl } from '../photos/service.js';
import { sniffImage } from '../photos/sniff.js';
import type { StorageDriver } from '../storage/index.js';
import type { PhotoGap, PhotoSlotRef } from './report.js';
import type { SourceRecord, UrlColumn } from './source.js';
import type { ImportedFile, PhotoResult } from './target.js';

const BUCKET_PATH = '/storage/v1/object/public/housing-photos/';
const SUPABASE_HOST = /^[a-z0-9]+\.supabase\.co$/;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const MAX_BYTES = 5 * 1024 * 1024; // the Supabase bucket's own limit (supabase/sql/05_storage.sql)

const SLOTS: readonly { kind: 'prev' | 'current'; photo: UrlColumn; thumb: UrlColumn }[] = [
  { kind: 'prev', photo: 'prev_photo_url', thumb: 'prev_thumb_url' },
  { kind: 'current', photo: 'current_photo_url', thumb: 'current_thumb_url' },
];

/**
 * Checks --photo-base: exactly the public prefix of a project's housing-photos bucket, over https on
 * <ref>.supabase.co, or on a local Supabase stack for testing.
 */
export function parsePhotoBase(value: string): URL {
  const fail = () => new CliError(`--photo-base must look like https://<ref>.supabase.co${BUCKET_PATH}`);
  if (!URL.canParse(value)) throw fail();
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== BUCKET_PATH) throw fail();
  const supabase = url.protocol === 'https:' && SUPABASE_HOST.test(url.hostname) && url.port === '';
  const local = (url.protocol === 'http:' || url.protocol === 'https:') && LOCAL_HOSTS.has(url.hostname);
  if (!supabase && !local) throw fail();
  return url;
}

/**
 * The URL to fetch for a stored photo URL and the object's path in the bucket, or undefined when the
 * URL isn't plainly inside the bucket prefix: another origin or port, credentials, or any dot,
 * encoded dot or encoded slash segment that could climb out of it once decoded.
 */
export function photoSource(raw: string, base: URL): { url: string; objectPath: string } | undefined {
  if (!URL.canParse(raw) || /\.\.|%2e|%2f|%5c|\\/i.test(raw)) return undefined;
  const url = new URL(raw);
  if (url.username || url.password || url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return undefined;
  const objectPath = url.pathname.slice(base.pathname.length);
  if (!objectPath || objectPath.split('/').some((segment) => segment === '' || segment === '.')) return undefined;
  try {
    return { url: `${url.origin}${url.pathname}`, objectPath: decodeURIComponent(objectPath) };
  } catch {
    return undefined; // a malformed %-escape: not a plain bucket path either
  }
}

export interface PhotoCopyOptions {
  storage: StorageDriver;
  publicApiUrl: string;
  photoBase: URL;
  concurrency?: number;
  fetch?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

export interface PhotoCopy {
  result: PhotoResult;
  gaps: PhotoGap[];
  generated: PhotoSlotRef[];
  /** Every key written, so the caller can remove them if the import transaction fails. */
  writtenKeys: string[];
}

class NotFound extends Error {}

/** Reads a stream into `file`, failing once it passes `limit` bytes. */
async function saveCapped(body: Readable, file: string, limit: number): Promise<void> {
  let size = 0;
  const cap = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      callback(size > limit ? new CliError(`larger than ${limit} bytes`) : null, chunk);
    },
  });
  await pipeline(body, cap, createWriteStream(file, { mode: 0o600 }));
}

async function readHead(file: string): Promise<Buffer> {
  const handle = await open(file, 'r');
  try {
    const head = Buffer.alloc(12);
    await handle.read(head, 0, 12, 0);
    return head;
  } finally {
    await handle.close();
  }
}

/**
 * Copies every photo the records point at. Throws (after removing what it wrote) on anything but
 * a photo that is missing on Supabase or outside --photo-base, which are reported as gaps.
 */
export async function copyPhotos(records: readonly SourceRecord[], options: PhotoCopyOptions): Promise<PhotoCopy> {
  const { storage, publicApiUrl, photoBase, concurrency = 4, timeoutMs = 30_000, retries = 3, retryDelayMs = 500 } = options;
  const fetchFn = options.fetch ?? fetch;
  const decodeOptions = { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' as const };
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'housing-import-'));
  const copy: PhotoCopy = { result: { urls: new Map(), files: [] }, gaps: [], generated: [], writtenKeys: [] };

  async function download(url: string, file: string, where: string): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetchFn(url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
      } catch (err) {
        if (attempt < retries) {
          await sleep(retryDelayMs * 2 ** attempt);
          continue;
        }
        throw new CliError(`${where}: could not fetch the photo (${err instanceof Error ? err.message : String(err)})`);
      }
      // Supabase answers a missing public object with 400 and a "not found" body.
      if (res.status === 404) throw new NotFound();
      if (res.status === 400) {
        // The body is read here, so it must not be cancelled below.
        if (/not.?found/i.test(await res.text())) throw new NotFound();
        throw new CliError(`${where}: the photo answered HTTP 400`);
      }
      if (res.status >= 500 && attempt < retries) {
        await res.body?.cancel();
        await sleep(retryDelayMs * 2 ** attempt);
        continue;
      }
      if (res.status !== 200 || !res.body) {
        await res.body?.cancel();
        throw new CliError(`${where}: the photo answered HTTP ${res.status}`);
      }
      try {
        await saveCapped(Readable.fromWeb(res.body as WebReadableStream), file, MAX_BYTES);
      } catch (err) {
        throw new CliError(`${where}: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }
  }

  /**
   * True when `file` is already a clean WebP that can be stored byte for byte. Only the formats an
   * upload may be (sniffed from the bytes, NS-03) reach the decoder, and every pixel is decoded, so a
   * broken or foreign file fails here.
   */
  async function isCleanWebp(file: string, where: string): Promise<boolean> {
    const head = await readHead(file);
    const format = sniffImage(head);
    if (!format) throw new CliError(`${where}: not a JPEG, PNG or WebP image`);
    try {
      const meta = await sharp(file, decodeOptions).metadata();
      await sharp(file, decodeOptions).stats();
      return (
        format === 'webp' &&
        meta.format === 'webp' &&
        (meta.pages ?? 1) === 1 &&
        !meta.exif && !meta.xmp && !meta.iptc && !meta.icc &&
        head.readUInt32LE(4) + 8 === (await stat(file)).size // nothing rides along after the image
      );
    } catch {
      throw new CliError(`${where}: not a readable image`);
    }
  }

  /**
   * Stores `file` as `variant`: as it is when it's a clean WebP, re-encoded otherwise. `fromCheckedPhoto`
   * marks a file already checked as a photo, which only needs encoding (a thumb made from it).
   */
  async function store(file: string, variant: PhotoVariant, where: string, fromCheckedPhoto = false): Promise<{ key: string; size: number }> {
    let source = file;
    if (fromCheckedPhoto || !(await isCleanWebp(file, where))) {
      source = `${file}.${variant}.webp`;
      await encodeVariant(sharp(file, decodeOptions), variant).toFile(source);
    }
    const size = (await stat(source)).size;
    const key = `housing/${randomUUID()}.webp`;
    copy.writtenKeys.push(key);
    await storage.put(key, createReadStream(source), { contentType: 'image/webp', size });
    return { key, size };
  }

  async function copyRecord(record: SourceRecord): Promise<void> {
    const urls: Partial<Record<UrlColumn, string>> = {};
    const ref = (slot: UrlColumn): PhotoSlotRef => ({ record_id: record.id, project_type: record.project_type, serial_no: record.serial_no, slot });
    const addFile = (kind: 'prev' | 'current', variant: PhotoVariant, slot: UrlColumn, stored: { key: string; size: number }, name: string) => {
      const file: ImportedFile = {
        id: randomUUID(),
        record_id: record.id,
        kind,
        variant,
        storage_key: stored.key,
        storage_driver: storage.name,
        content_type: 'image/webp',
        size_bytes: stored.size,
        original_name: name.slice(0, 255),
      };
      copy.result.files.push(file);
      urls[slot] = photoUrl(publicApiUrl, file.id);
    };

    for (const { kind, photo, thumb } of SLOTS) {
      let photoFile: string | undefined;
      let photoName = '';
      for (const [slot, variant] of [[photo, 'photo'], [thumb, 'thumb']] as const) {
        const raw = record[slot];
        if (!raw) continue;
        const where = `record ${record.id} ${slot}`;
        const src = photoSource(raw, photoBase);
        if (!src) {
          copy.gaps.push({ ...ref(slot), reason: 'outside_base' });
          continue;
        }
        const file = path.join(tmp, randomUUID());
        try {
          await download(src.url, file, where);
        } catch (err) {
          if (err instanceof NotFound) {
            copy.gaps.push({ ...ref(slot), reason: 'not_found' });
            continue;
          }
          throw err;
        }
        addFile(kind, variant, slot, await store(file, variant, where), src.objectPath);
        if (variant === 'photo') {
          photoFile = file;
          photoName = src.objectPath;
        } else {
          await rm(file, { force: true });
        }
      }
      // A photo whose thumb is missing gets one made from it, as an upload would.
      if (photoFile && !urls[thumb]) {
        addFile(kind, 'thumb', thumb, await store(photoFile, 'thumb', `record ${record.id} ${thumb}`, true), photoName);
        copy.generated.push(ref(thumb));
      }
      if (photoFile) await rm(photoFile, { force: true });
    }
    if (Object.keys(urls).length > 0) copy.result.urls.set(record.id, urls);
  }

  // Workers stop taking records after the first failure, and cleanup waits for all of them, so no
  // write can land after the removal.
  const queue = [...records];
  let failure: unknown;
  const worker = async () => {
    for (let record = queue.shift(); record && failure === undefined; record = queue.shift()) {
      try {
        await copyRecord(record);
      } catch (err) {
        failure ??= err;
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
    if (failure !== undefined) {
      await removeAll(storage, copy.writtenKeys);
      throw failure;
    }
    return copy;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/** Removes stored files, reporting any it couldn't so the operator can remove them by hand. */
export async function removeAll(storage: StorageDriver, keys: readonly string[]): Promise<void> {
  const failed: string[] = [];
  for (const key of keys) {
    try {
      await storage.remove(key);
    } catch {
      failed.push(key);
    }
  }
  if (failed.length > 0) console.error(`could not remove ${failed.length} stored file(s); remove them by hand:\n  ${failed.join('\n  ')}`);
}
