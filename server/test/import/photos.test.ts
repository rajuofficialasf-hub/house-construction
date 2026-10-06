import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { mapAdmins } from '../../src/import/admins.js';
import { copyPhotos, parsePhotoBase, photoSource, type PhotoCopyOptions } from '../../src/import/photos.js';
import { checkSource, openSource, readSnapshot, type SourceRecord } from '../../src/import/source.js';
import { writeImport } from '../../src/import/target.js';
import { createLogger } from '../../src/logger.js';
import { createNasDriver } from '../../src/storage/drivers/nas.js';
import type { StorageDriver } from '../../src/storage/index.js';
import { appDb, ownerDb, resetTestData } from '../support/db.js';
import { importCli } from '../support/import-cli.js';
import { TEST_PUBLIC_API_URL } from '../support/storage.js';
import { insertSourceRecord, resetSource, setSourceCounter, sourceDb, testSourceUrl } from '../support/source.js';

// The photo half of the Supabase import (docs/plans/2026-10-06-1035-migrate-c7-cutover-plan.md):
// a local server plays the public housing-photos bucket.

const BUCKET = '/storage/v1/object/public/housing-photos/';
const app = appDb();
const owner = ownerDb();
const src = sourceDb();

type Handler = (res: import('node:http').ServerResponse) => void | Promise<void>;
const routes = new Map<string, Handler>();
let hits: string[] = [];
let inFlight = 0;
let maxInFlight = 0;
let bucket: Server;
let elsewhere: Server;
let elsewhereHits = 0;
let base = '';
let elsewhereUrl = '';

let cleanWebp: Buffer;
let exifWebp: Buffer;
let gpsJpeg: Buffer;

let work = '';
let storage: StorageDriver;

beforeAll(async () => {
  const image = () => sharp({ create: { width: 800, height: 600, channels: 3, background: '#3a7' } });
  cleanWebp = await image().webp().toBuffer();
  exifWebp = await image().webp().withExif({ IFD0: { Copyright: 'someone' } }).toBuffer();
  gpsJpeg = await image()
    .jpeg()
    .withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '23/1 48/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '90/1 24/1 0/1' } })
    .toBuffer();

  bucket = createServer(async (req, res) => {
    hits.push(req.url ?? '');
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      const handler = routes.get((req.url ?? '').slice(BUCKET.length));
      if (handler) await handler(res);
      else res.writeHead(404).end();
    } finally {
      inFlight--;
    }
  });
  elsewhere = createServer((_req, res) => {
    elsewhereHits++;
    res.writeHead(200, { 'content-type': 'image/webp' }).end(cleanWebp);
  });
  bucket.listen(0, '127.0.0.1');
  elsewhere.listen(0, '127.0.0.1');
  await Promise.all([once(bucket, 'listening'), once(elsewhere, 'listening')]);
  base = `http://127.0.0.1:${(bucket.address() as AddressInfo).port}${BUCKET}`;
  elsewhereUrl = `http://127.0.0.1:${(elsewhere.address() as AddressInfo).port}`;
});

beforeEach(async () => {
  await Promise.all([resetTestData(owner), resetSource(src)]);
  routes.clear();
  hits = [];
  maxInFlight = 0;
  elsewhereHits = 0;
  work = await mkdtemp(path.join(os.tmpdir(), 'housing-photo-import-'));
  storage = createNasDriver({ STORAGE_ROOT: path.join(work, 'storage') });
});
afterEach(() => rm(work, { recursive: true, force: true }));
afterAll(async () => {
  bucket.close();
  elsewhere.close();
  await Promise.all([app.end(), owner.end(), src.end()]);
});

const serve = (objectPath: string, body: Buffer, type = 'image/webp') =>
  routes.set(objectPath, (res) => void res.writeHead(200, { 'content-type': type }).end(body));
const url = (objectPath: string) => `${base}${objectPath}?v=1730000000`;
const options = (extra: Partial<PhotoCopyOptions> = {}): PhotoCopyOptions => ({
  storage,
  publicApiUrl: TEST_PUBLIC_API_URL,
  photoBase: parsePhotoBase(base),
  retryDelayMs: 1,
  ...extra,
});
const record = (serial: number, urls: Partial<Record<'prev_photo_url' | 'prev_thumb_url' | 'current_photo_url' | 'current_thumb_url', string>>) =>
  ({ id: randomUUID(), project_type: 'semi_pucca', serial_no: serial, photo_updated_at: null, prev_photo_url: null, prev_thumb_url: null, current_photo_url: null, current_thumb_url: null, ...urls }) as SourceRecord;
const storedFiles = async () => (await readdir(path.join(work, 'storage', 'housing')).catch(() => [])).filter((f) => f.endsWith('.webp'));
const read = async (key: string) => {
  const chunks: Buffer[] = [];
  for await (const chunk of await storage.get(key)) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
};

describe('copyPhotos', () => {
  it('stores a clean WebP byte for byte and re-encodes anything with metadata or another format', async () => {
    serve('housing/semi_pucca/0001/prev.webp', cleanWebp);
    serve('housing/semi_pucca/0001/prev_thumb.webp', Buffer.concat([cleanWebp, Buffer.from('trailing bytes')]));
    serve('housing/semi_pucca/0001/current.webp', exifWebp);
    serve('housing/semi_pucca/0001/current_thumb.webp', gpsJpeg, 'image/jpeg');
    const rec = record(1, {
      prev_photo_url: url('housing/semi_pucca/0001/prev.webp'),
      prev_thumb_url: url('housing/semi_pucca/0001/prev_thumb.webp'),
      current_photo_url: url('housing/semi_pucca/0001/current.webp'),
      current_thumb_url: url('housing/semi_pucca/0001/current_thumb.webp'),
    });
    const copy = await copyPhotos([rec], options());

    expect(copy.gaps).toEqual([]);
    expect(copy.generated).toEqual([]);
    expect(copy.result.files).toHaveLength(4);
    const file = (kind: string, variant: string) => copy.result.files.find((f) => f.kind === kind && f.variant === variant)!;
    expect(await read(file('prev', 'photo').storage_key)).toEqual(cleanWebp);
    for (const [kind, variant] of [['prev', 'thumb'], ['current', 'photo'], ['current', 'thumb']]) {
      const bytes = await read(file(kind!, variant!).storage_key);
      const meta = await sharp(bytes).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.exif).toBeUndefined();
      expect(bytes.readUInt32LE(4) + 8).toBe(bytes.length);
    }
    expect(file('current', 'thumb')).toMatchObject({ original_name: 'housing/semi_pucca/0001/current_thumb.webp', storage_driver: 'nas', content_type: 'image/webp' });
    expect(copy.result.urls.get(rec.id)).toEqual({
      prev_photo_url: `${TEST_PUBLIC_API_URL}/api/v1/photos/${file('prev', 'photo').id}`,
      prev_thumb_url: `${TEST_PUBLIC_API_URL}/api/v1/photos/${file('prev', 'thumb').id}`,
      current_photo_url: `${TEST_PUBLIC_API_URL}/api/v1/photos/${file('current', 'photo').id}`,
      current_thumb_url: `${TEST_PUBLIC_API_URL}/api/v1/photos/${file('current', 'thumb').id}`,
    });
    expect(hits.every((h) => !h.includes('?'))).toBe(true);
  });

  it('makes a missing thumb from its photo and reports it', async () => {
    serve('housing/tin/0002/prev.webp', cleanWebp);
    const rec = record(2, { prev_photo_url: url('housing/tin/0002/prev.webp') });
    const copy = await copyPhotos([rec], options());
    expect(copy.generated).toEqual([{ record_id: rec.id, project_type: 'semi_pucca', serial_no: 2, slot: 'prev_thumb_url' }]);
    const thumb = copy.result.files.find((f) => f.variant === 'thumb')!;
    expect((await sharp(await read(thumb.storage_key)).metadata()).width).toBe(400);
  });

  it('reports a photo missing on Supabase or outside the bucket as a gap and goes on', async () => {
    routes.set('housing/semi_pucca/0003/current.webp', (res) => void res.writeHead(400).end('{"statusCode":"404","error":"not_found","message":"Object not found"}'));
    serve('housing/semi_pucca/0003/current_thumb.webp', cleanWebp);
    const rec = record(3, {
      prev_photo_url: url('housing/semi_pucca/0003/prev.webp'), // 404
      prev_thumb_url: 'https://example.com/photos/prev_thumb.webp',
      current_photo_url: url('housing/semi_pucca/0003/current.webp'),
      current_thumb_url: url('housing/semi_pucca/0003/current_thumb.webp'),
    });
    const copy = await copyPhotos([rec], options());
    expect(copy.gaps.map((g) => [g.slot, g.reason])).toEqual([
      ['prev_photo_url', 'not_found'],
      ['prev_thumb_url', 'outside_base'],
      ['current_photo_url', 'not_found'],
    ]);
    expect(Object.keys(copy.result.urls.get(rec.id) ?? {})).toEqual(['current_thumb_url']);
  });

  it('never follows a stored URL away from the bucket', async () => {
    const port = new URL(base).port;
    const tricks = [
      `${base}housing/../../../../evil`,
      `${base}housing/%2e%2e/%2e%2e/evil`,
      `${base}housing%2f..%2fevil`,
      `http://user:pw@127.0.0.1:${port}${BUCKET}housing/a.webp`,
      `${elsewhereUrl}${BUCKET}housing/a.webp`,
      `http://localhost:${port}${BUCKET}housing/a.webp`,
    ];
    for (const trick of tricks) expect(photoSource(trick, parsePhotoBase(base)), trick).toBeUndefined();

    routes.set('housing/redirect.webp', (res) => void res.writeHead(302, { location: `${elsewhereUrl}/latest/meta-data` }).end());
    await expect(copyPhotos([record(4, { prev_photo_url: url('housing/redirect.webp') })], options())).rejects.toThrow(/HTTP 302/);
    expect(elsewhereHits).toBe(0);
  });

  it.each([
    'https://evil.example/storage/v1/object/public/housing-photos/',
    'https://abc.supabase.co/storage/v1/object/public/other-bucket/',
    'https://abc.supabase.co:8443/storage/v1/object/public/housing-photos/',
    'http://abc.supabase.co/storage/v1/object/public/housing-photos/',
    'https://abc.supabase.co/storage/v1/object/public/housing-photos/?x=1',
  ])('refuses the photo base %s', (value) => {
    expect(() => parsePhotoBase(value)).toThrow(/--photo-base/);
  });

  it.each([
    ['a server error after retries', (res: import('node:http').ServerResponse) => void res.writeHead(503).end(), /HTTP 503/],
    ['a body over 5 MB', (res: import('node:http').ServerResponse) => void res.writeHead(200).end(Buffer.alloc(6 * 1024 * 1024, 1)), /larger than/],
    ['a body that is not an image', (res: import('node:http').ServerResponse) => void res.writeHead(200).end('<html>hi</html>'), /not a readable image/],
  ])('stops on %s and removes every file it wrote', async (_what, handler, message) => {
    serve('housing/ok.webp', cleanWebp);
    routes.set('housing/bad.webp', handler);
    const records = [record(5, { prev_photo_url: url('housing/ok.webp') }), record(6, { prev_photo_url: url('housing/bad.webp') })];
    await expect(copyPhotos(records, options({ concurrency: 1 }))).rejects.toThrow(message);
    expect(await storedFiles()).toEqual([]);
  });

  it('fetches at most 4 photos at a time', async () => {
    routes.set('housing/slow.webp', async (res) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      res.writeHead(200).end(cleanWebp);
    });
    const records = Array.from({ length: 12 }, (_, i) => record(i + 10, { prev_photo_url: url('housing/slow.webp'), prev_thumb_url: url('housing/slow.webp') }));
    await copyPhotos(records, options());
    expect(hits).toHaveLength(24);
    expect(maxInFlight).toBe(4);
  });
});

describe('imported photos', () => {
  it('are served by the photo route, and an unknown id is not', async () => {
    serve('housing/semi_pucca/0001/prev.webp', cleanWebp);
    await insertSourceRecord(src, { serial_no: 1, prev_photo_url: url('housing/semi_pucca/0001/prev.webp') });
    await setSourceCounter(src, 'semi_pucca', 1);
    const source = openSource(testSourceUrl, undefined);
    try {
      await checkSource(source, owner);
      const snapshot = await readSnapshot(source);
      const copy = await copyPhotos(snapshot.records, options());
      const opts = { replace: false, discardNewWrites: false, sourceActivityMaxAt: snapshot.activityMaxAt };
      await writeImport(owner, { snapshot, admins: mapAdmins([], { withoutPasswords: false, now: new Date() }).admins, photos: copy.result }, opts);
    } finally {
      await source.end();
    }
    const [row] = await owner<{ prev_photo_url: string; prev_thumb_url: string }[]>`select prev_photo_url, prev_thumb_url from public.housing_beneficiaries`;
    const api = createApp({
      sql: app,
      logger: createLogger('silent'),
      trustProxy: 0,
      allowedOrigins: [],
      publicReadOrigins: [],
      cookieSecure: false,
      storage,
      publicApiUrl: TEST_PUBLIC_API_URL,
    });
    const photo = await request(api).get(row!.prev_photo_url.slice(TEST_PUBLIC_API_URL.length));
    expect(photo.status).toBe(200);
    expect(photo.headers['content-type']).toBe('image/webp');
    expect(Buffer.from(photo.body as Buffer)).toEqual(cleanWebp);
    expect((await request(api).get(row!.prev_thumb_url.slice(TEST_PUBLIC_API_URL.length))).status).toBe(200);
    expect((await request(api).get(`/api/v1/photos/${randomUUID()}`)).status).toBe(404);
  });

  it('are removed from storage when the import transaction fails', async () => {
    serve('housing/semi_pucca/0001/prev.webp', cleanWebp);
    await insertSourceRecord(src, { serial_no: 1, prev_photo_url: url('housing/semi_pucca/0001/prev.webp') });
    await insertSourceRecord(src, { serial_no: 2, name: '  ' }); // the target's name check refuses it
    await setSourceCounter(src, 'semi_pucca', 2);
    const res = await importCli(['import', '--report', path.join(work, 'report.json'), '--photo-base', base], `${testSourceUrl}\n`, {
      STORAGE_ROOT: path.join(work, 'storage'),
    });
    expect(res.code).not.toBe(0);
    expect(hits).toHaveLength(1);
    expect(await storedFiles()).toEqual([]);
    expect(await owner`select 1 from public.housing_beneficiaries`).toHaveLength(0);
  });
});
