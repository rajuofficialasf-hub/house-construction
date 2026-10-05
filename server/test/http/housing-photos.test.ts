// Photo upload and delete through the real app, test database and a NAS driver on a temp folder
// (docs/api/API_CONTRACT.md §4.8, §4.10, §4.11; docs/plans/2026-10-05-1722-migrate-c5-photos-plan.md).
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { Writable } from 'node:stream';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { housingRecord } from '../../src/housing/schemas.js';
import { createLogger } from '../../src/logger.js';
import { createS3Driver } from '../../src/storage/drivers/s3.js';
import { StorageNotFoundError, type StorageDriver } from '../../src/storage/index.js';
import { appDb, insertRecord, ownerDb, resetTestData } from '../support/db.js';
import { testS3 } from '../support/env.js';
import { loginAdmin, TEST_ORIGIN } from '../support/session.js';
import { TEST_PUBLIC_API_URL, testStorage } from '../support/storage.js';

const sql = appDb();
const owner = ownerDb();
const silent = new Writable({ write: (_chunk, _enc, done) => done() });
const local = testStorage();
const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const one = z.strictObject({ data: housingRecord });

function appWith(storage: StorageDriver) {
  return createApp({
    sql,
    logger: createLogger('info', silent),
    trustProxy: 0,
    allowedOrigins: [TEST_ORIGIN],
    cookieSecure: false,
    storage,
    publicApiUrl: TEST_PUBLIC_API_URL,
  });
}
const app = appWith(local.storage);

let cookie = '';
let adminId = '';
let png: Buffer;

beforeAll(async () => {
  png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#357' } }).png().toBuffer();
});
beforeEach(async () => {
  await resetTestData(owner);
  const session = await loginAdmin(app, owner);
  cookie = session.cookie;
  adminId = session.admin.id;
});
afterAll(async () => {
  await Promise.all([sql.end(), owner.end()]);
  await local.cleanup();
});

const upload = (id: string, kind: string, target = app, as = cookie) => {
  const req = request(target).post(`/api/v1/housing/${id}/photo`).set('origin', TEST_ORIGIN);
  if (as) req.set('cookie', as);
  return req.field('kind', kind).attach('photo', png, 'photo.png');
};
const remove = (id: string, query: string, target = app) =>
  request(target).delete(`/api/v1/housing/${id}/photo${query}`).set('origin', TEST_ORIGIN).set('cookie', cookie);

const fileRows = (recordId: string) =>
  owner<{ id: string; kind: string; variant: string; storage_key: string; storage_driver: string; created_by: string; deleted_at: Date | null }[]>`
    select id, kind, variant, storage_key, storage_driver, created_by, deleted_at from public.housing_files
    where record_id = ${recordId} order by created_at, variant`;
const photoLog = (recordId: string) =>
  owner<{ actor_id: string; actor_email: string; details: { photo_kinds: string[] } }[]>`
    select actor_id, actor_email, details from public.housing_activity_log
    where record_id = ${recordId} and action = 'photo_update' order by id`;
const exists = async (storage: StorageDriver, key: string) =>
  storage.get(key).then(
    (stream) => (stream.destroy(), true),
    (err: unknown) => {
      if (err instanceof StorageNotFoundError) return false;
      throw err;
    },
  );
const storedCount = async () => (await readdir(path.join(local.root, 'housing')).catch(() => [])).length;

describe('POST /api/v1/housing/:id/photo', () => {
  it('stores the photo and thumb, sets their URLs and photo_updated_at, and logs the admin', async () => {
    const { id } = await insertRecord(sql);
    const res = await upload(id, 'current');
    expect(res.status).toBe(200);
    const rec = one.parse(res.body).data;
    const files = await fileRows(id);
    expect(files).toHaveLength(2);
    const byVariant = Object.fromEntries(files.map((f) => [f.variant, f]));
    expect(rec.current_photo_url).toBe(`${TEST_PUBLIC_API_URL}/api/v1/photos/${byVariant.photo!.id}`);
    expect(rec.current_thumb_url).toBe(`${TEST_PUBLIC_API_URL}/api/v1/photos/${byVariant.thumb!.id}`);
    expect(rec).toMatchObject({ prev_photo_url: null, prev_thumb_url: null });
    expect(rec.photo_updated_at).not.toBeNull();
    for (const file of files) {
      expect(file).toMatchObject({ kind: 'current', storage_driver: 'nas', created_by: adminId, deleted_at: null });
      expect(await exists(local.storage, file.storage_key)).toBe(true);
    }
    expect(await photoLog(id)).toEqual([
      expect.objectContaining({ actor_id: adminId, actor_email: 'admin@example.org', details: expect.objectContaining({ photo_kinds: ['current'] }) }),
    ]);
  });

  it('replaces the photo: new URLs, the old files leave storage and the table, and each upload is logged', async () => {
    const { id } = await insertRecord(sql);
    const first = one.parse((await upload(id, 'prev')).body).data;
    const oldKeys = (await fileRows(id)).map((f) => f.storage_key);
    const second = one.parse((await upload(id, 'prev')).body).data;
    expect(second.prev_photo_url).not.toBe(first.prev_photo_url);
    expect(second.prev_thumb_url).not.toBe(first.prev_thumb_url);
    const files = await fileRows(id);
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.storage_key)).not.toEqual(expect.arrayContaining(oldKeys));
    for (const key of oldKeys) expect(await exists(local.storage, key)).toBe(false);
    expect((await photoLog(id)).map((e) => e.details.photo_kinds)).toEqual([['prev'], ['prev']]);
  });

  it('answers 404 for an unknown record and leaves nothing in storage', async () => {
    const before = await storedCount();
    const res = await upload(MISSING_ID, 'prev');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(await storedCount()).toBe(before);
    expect(await owner`select count(*)::int as n from public.housing_files`).toEqual([{ n: 0 }]);
  });

  it('answers 400 for a bad id or kind', async () => {
    expect((await upload('not-a-uuid', 'prev')).status).toBe(400);
    const { id } = await insertRecord(sql);
    expect((await upload(id, 'side')).status).toBe(400);
  });

  // A large body answered early resets the connection now and then, so a small one proves the
  // order instead: no storage write means the upload was never parsed.
  it('refuses without a session before the upload is read', async () => {
    const puts: string[] = [];
    const watched = appWith({ ...local.storage, name: 'nas', put: async (key) => void puts.push(key) });
    const { id } = await insertRecord(sql);
    const res = await upload(id, 'prev', watched, '');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(puts).toEqual([]);
  });

  it.each([
    ['a foreign Origin', 'https://evil.example'],
    ['no Origin', undefined],
  ])('refuses an upload and a delete with a valid admin cookie but %s (CSRF)', async (_name, origin) => {
    const { id } = await insertRecord(sql);
    const post = request(app).post(`/api/v1/housing/${id}/photo`).set('cookie', cookie);
    const del = request(app).delete(`/api/v1/housing/${id}/photo?kind=prev`).set('cookie', cookie);
    if (origin) {
      post.set('origin', origin);
      del.set('origin', origin);
    }
    expect((await post.field('kind', 'prev').attach('photo', png, 'x.png')).status).toBe(403);
    expect((await del).status).toBe(403);
    expect(await fileRows(id)).toEqual([]);
  });

  it('keeps the old row as a tombstone and still answers 200 when removing a replaced file fails', async () => {
    const failingRemove: StorageDriver = { ...local.storage, name: 'nas', remove: () => Promise.reject(new Error('NAS offline')) };
    const flaky = appWith(failingRemove);
    const { id } = await insertRecord(sql);
    expect((await upload(id, 'prev', flaky)).status).toBe(200);
    expect((await upload(id, 'prev', flaky)).status).toBe(200);
    const files = await fileRows(id);
    expect(files.filter((f) => f.deleted_at === null)).toHaveLength(2);
    expect(files.filter((f) => f.deleted_at !== null)).toHaveLength(2);
  });

  it('leaves exactly one live photo and thumb when two uploads race for the same slot', async () => {
    const { id } = await insertRecord(sql);
    const results = await Promise.all([upload(id, 'current'), upload(id, 'current')]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const files = await fileRows(id);
    expect(files.map((f) => f.variant).sort()).toEqual(['photo', 'thumb']);
    const [rec] = await owner<{ current_photo_url: string }[]>`select current_photo_url from public.housing_beneficiaries where id = ${id}`;
    expect(rec!.current_photo_url).toBe(`${TEST_PUBLIC_API_URL}/api/v1/photos/${files.find((f) => f.variant === 'photo')!.id}`);
    expect(await storedCount()).toBeGreaterThanOrEqual(2);
  });
});

describe('DELETE /api/v1/housing/:id/photo', () => {
  it('clears the kind, removes its files and logs it; a second delete is a 200 with no new log row', async () => {
    const { id } = await insertRecord(sql);
    await upload(id, 'prev');
    await upload(id, 'current');
    const keys = (await fileRows(id)).filter((f) => f.kind === 'prev').map((f) => f.storage_key);
    const res = await remove(id, '?kind=prev');
    expect(res.status).toBe(200);
    const rec = one.parse(res.body).data;
    expect(rec).toMatchObject({ prev_photo_url: null, prev_thumb_url: null });
    expect(rec.current_photo_url).not.toBeNull();
    for (const key of keys) expect(await exists(local.storage, key)).toBe(false);
    expect((await fileRows(id)).map((f) => f.kind)).toEqual(['current', 'current']);
    const logged = (await photoLog(id)).length;
    const again = await remove(id, '?kind=prev');
    expect(again.status).toBe(200);
    expect(one.parse(again.body).data.photo_updated_at).toBe(rec.photo_updated_at);
    expect(await photoLog(id)).toHaveLength(logged);
  });

  it('answers 404 for an unknown record and 400 for a missing, wrong or repeated kind', async () => {
    expect((await remove(MISSING_ID, '?kind=prev')).status).toBe(404);
    const { id } = await insertRecord(sql);
    expect((await remove(id, '')).status).toBe(400);
    expect((await remove(id, '?kind=side')).status).toBe(400);
    expect((await remove(id, '?kind=prev&kind=current')).status).toBe(400);
  });
});

describe('DELETE /api/v1/housing/:id with photos', () => {
  it('removes every photo file after the delete commits', async () => {
    const { id } = await insertRecord(sql);
    await upload(id, 'prev');
    await upload(id, 'current');
    const keys = (await fileRows(id)).map((f) => f.storage_key);
    expect(keys).toHaveLength(4);
    const res = await request(app).delete(`/api/v1/housing/${id}`).set('origin', TEST_ORIGIN).set('cookie', cookie);
    expect(res.status).toBe(204);
    for (const key of keys) expect(await exists(local.storage, key)).toBe(false);
    expect(await owner`select count(*)::int as n from public.housing_files`).toEqual([{ n: 0 }]);
  });

  it('still answers 204 when storage fails, leaving tombstones for the sweep', async () => {
    const failingRemove: StorageDriver = { ...local.storage, name: 'nas', remove: () => Promise.reject(new Error('NAS offline')) };
    const flaky = appWith(failingRemove);
    const { id } = await insertRecord(sql);
    await upload(id, 'prev');
    const res = await request(flaky).delete(`/api/v1/housing/${id}`).set('origin', TEST_ORIGIN).set('cookie', cookie);
    expect(res.status).toBe(204);
    const rows = await owner<{ record_id: string | null; deleted_at: Date | null }[]>`select record_id, deleted_at from public.housing_files`;
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row).toMatchObject({ record_id: null, deleted_at: expect.any(Date) });
  });
});

// TEMP: S3 smoke test; runs only with a real test bucket (server/test/support/env.ts).
describe.skipIf(!testS3)('photos on the s3 driver', () => {
  it('uploads and deletes a photo', async () => {
    const s3 = createS3Driver(testS3!);
    const s3App = appWith(s3);
    const { id } = await insertRecord(sql);
    expect((await upload(id, 'prev', s3App)).status).toBe(200);
    const keys = (await fileRows(id)).map((f) => f.storage_key);
    for (const key of keys) expect(await exists(s3, key)).toBe(true);
    expect((await remove(id, '?kind=prev', s3App)).status).toBe(200);
    for (const key of keys) expect(await exists(s3, key)).toBe(false);
  });
});
