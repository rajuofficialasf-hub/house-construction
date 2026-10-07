// PUT and DELETE /api/v1/records/:id/photos/:slot through the real app, test database and a NAS
// driver on a temp folder (docs/api/PROJECTS_API_CONTRACT.md §4.4.10, §4.4.11). The project's
// photo mode is checked before anything is stored (AE3 in
// docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md).
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { Writable } from 'node:stream';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/logger.js';
import { projectRecord } from '../../src/records/schemas.js';
import { createS3Driver } from '../../src/storage/drivers/s3.js';
import { StorageNotFoundError, type StorageDriver } from '../../src/storage/index.js';
import { appDb, insertProject, insertRecord, ownerDb, resetTestData } from '../support/db.js';
import { testS3 } from '../support/env.js';
import { loginAdmin, TEST_ORIGIN } from '../support/session.js';
import { TEST_PUBLIC_API_URL, testStorage } from '../support/storage.js';

const sql = appDb();
const owner = ownerDb();
const silent = new Writable({ write: (_chunk, _enc, done) => done() });
const local = testStorage();
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
const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const one = z.strictObject({ data: projectRecord });

let mainCookie = '';
let plainCookie = '';
let mainId = '';
let png: Buffer;

beforeAll(async () => {
  png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#357' } }).png().toBuffer();
});
beforeEach(async () => {
  await resetTestData(owner);
  // Each test counts the files it leaves, so it starts from an empty folder.
  await rm(path.join(local.root, 'housing'), { recursive: true, force: true });
  const main = await loginAdmin(app, owner, { role: 'main_admin' });
  mainCookie = main.cookie;
  mainId = main.admin.id;
  plainCookie = (await loginAdmin(app, owner, { email: 'plain@example.org' })).cookie;
  await insertProject(owner, { key: 'ph_both', photo_mode: 'before_after', is_published: false });
  await insertProject(owner, { key: 'ph_after', photo_mode: 'after_only' });
  await insertProject(owner, { key: 'ph_none', photo_mode: 'none' });
});
afterAll(async () => {
  await Promise.all([sql.end(), owner.end()]);
  await local.cleanup();
});

const put = (id: string, slot: string, as = plainCookie, target = app) => {
  const req = request(target).put(`/api/v1/records/${id}/photos/${slot}`).set('origin', TEST_ORIGIN);
  if (as) req.set('cookie', as);
  return req.attach('photo', png, 'photo.png');
};
const del = (id: string, slot: string, as = mainCookie, target = app) =>
  request(target).delete(`/api/v1/records/${id}/photos/${slot}`).set('origin', TEST_ORIGIN).set('cookie', as);
const deleteRecord = (id: string, target = app) =>
  request(target).delete(`/api/v1/records/${id}`).set('origin', TEST_ORIGIN).set('cookie', mainCookie);
const failingRemove = (): StorageDriver => ({ ...local.storage, name: 'nas', remove: () => Promise.reject(new Error('NAS offline')) });
const fileRows = (recordId: string) =>
  owner<{ variant: string; storage_key: string; deleted_at: Date | null; id: string }[]>`
    select id, variant, storage_key, deleted_at from public.housing_files where record_id = ${recordId} order by created_at, variant`;
const exists = async (storage: StorageDriver, key: string) =>
  storage.get(key).then(
    (stream) => (stream.destroy(), true),
    (err: unknown) => {
      if (err instanceof StorageNotFoundError) return false;
      throw err;
    },
  );

const storedCount = async () => (await readdir(path.join(local.root, 'housing')).catch(() => [])).length;
const liveFiles = async (recordId: string) =>
  (await owner<{ n: number }[]>`
    select count(*)::int as n from public.housing_files where record_id = ${recordId} and deleted_at is null`)[0]!.n;
const photoLog = (recordId: string) =>
  owner<{ actor_id: string; details: { photo_kinds: string[] } }[]>`
    select actor_id, details from public.housing_activity_log where record_id = ${recordId} and action = 'photo_update' order by id`;
const stored = (recordId: string) =>
  owner`select prev_photo_url, current_photo_url, current_thumb_url, photo_updated_at
        from public.housing_beneficiaries where id = ${recordId}`.then((rows) => rows[0]);

describe('PUT /api/v1/records/:id/photos/:slot', () => {
  it('stores either slot on a before_after project and returns the full record', async () => {
    const { id } = await insertRecord(sql, { project_type: 'ph_both', union_name: 'ধামশ্রেণী' });
    for (const slot of ['prev', 'current']) {
      const res = await put(id, slot);
      expect(res.status).toBe(200);
      const record = one.parse(res.body).data;
      expect(record[`${slot}_photo_url` as 'prev_photo_url']).toMatch(new RegExp(`^${TEST_PUBLIC_API_URL}/api/v1/photos/[0-9a-f-]{36}$`));
      expect(record.union_name).toBe('ধামশ্রেণী');
    }
    expect(await liveFiles(id)).toBe(4);
    expect((await photoLog(id)).map((e) => e.details.photo_kinds)).toEqual([['prev'], ['current']]);
  });

  it('replaces a photo, tombstoning the old files, and logs the admin', async () => {
    const { id } = await insertRecord(sql, { project_type: 'ph_after' });
    const first = one.parse((await put(id, 'current', mainCookie)).body).data;
    const second = one.parse((await put(id, 'current', mainCookie)).body).data;
    expect(second.current_photo_url).not.toBe(first.current_photo_url);
    expect(await liveFiles(id)).toBe(2);
    expect(await storedCount()).toBe(2);
    expect((await photoLog(id)).map((e) => e.actor_id)).toEqual([mainId, mainId]);
  });

  it('refuses a before photo on an after-only project before storing anything (AE3)', async () => {
    const { id } = await insertRecord(sql, { project_type: 'ph_after' });
    const res = await put(id, 'prev');
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual({ field: 'prev_photo_url', reason: 'photo_mode' });
    expect(await storedCount()).toBe(0);
    expect(await liveFiles(id)).toBe(0);
    expect((await stored(id))?.prev_photo_url).toBeNull();
  });

  it.each(['prev', 'current'])('refuses %s on a project with no photos, storing nothing', async (slot) => {
    const { id } = await insertRecord(sql, { project_type: 'ph_none' });
    const res = await put(id, slot);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ message: 'এই প্রকল্পে ছবি নেই', details: { field: `${slot}_photo_url` } });
    expect(await storedCount()).toBe(0);
  });

  it('answers 404 for an unknown record and stores nothing', async () => {
    const res = await put(MISSING_ID, 'current');
    expect(res.status).toBe(404);
    expect(await storedCount()).toBe(0);
  });

  it('answers 400 for a bad slot or id, a non-image, and a kind field', async () => {
    const { id } = await insertRecord(sql, { project_type: 'ph_both' });
    expect((await put(id, 'side')).status).toBe(400);
    expect((await put('not-a-uuid', 'prev')).status).toBe(400);
    const text = await request(app)
      .put(`/api/v1/records/${id}/photos/prev`)
      .set('origin', TEST_ORIGIN)
      .set('cookie', plainCookie)
      .attach('photo', Buffer.from('not an image'), 'x.png');
    expect(text.status).toBe(400);
    const kind = await request(app)
      .put(`/api/v1/records/${id}/photos/prev`)
      .set('origin', TEST_ORIGIN)
      .set('cookie', plainCookie)
      .field('kind', 'current')
      .attach('photo', png, 'photo.png');
    expect(kind.status).toBe(400);
    expect(kind.body.error.details).toMatchObject({ field: 'kind', reason: 'unexpected_field' });
    expect(await storedCount()).toBe(0);
  });

  // A large body answered early resets the connection now and then, so a small one proves the
  // order instead: no storage write means the upload was never parsed.
  it('refuses without a session before the upload is read', async () => {
    const puts: string[] = [];
    const watched = appWith({ ...local.storage, name: 'nas', put: async (key) => void puts.push(key) });
    const { id } = await insertRecord(sql, { project_type: 'ph_both' });
    const res = await put(id, 'prev', '', watched);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(puts).toEqual([]);
  });

  it('keeps the old row as a tombstone and still answers 200 when removing a replaced file fails', async () => {
    const flaky = appWith(failingRemove());
    const { id } = await insertRecord(sql, { project_type: 'ph_both' });
    expect((await put(id, 'prev', plainCookie, flaky)).status).toBe(200);
    expect((await put(id, 'prev', plainCookie, flaky)).status).toBe(200);
    const files = await fileRows(id);
    expect(files.filter((f) => f.deleted_at === null)).toHaveLength(2);
    expect(files.filter((f) => f.deleted_at !== null)).toHaveLength(2);
  });

  it('leaves exactly one live photo and thumb when two uploads race for the same slot', async () => {
    const { id } = await insertRecord(sql, { project_type: 'ph_both' });
    const results = await Promise.all([put(id, 'current'), put(id, 'current')]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const files = await fileRows(id);
    expect(files.map((f) => f.variant).sort()).toEqual(['photo', 'thumb']);
    const [rec] = await owner<{ current_photo_url: string }[]>`select current_photo_url from public.housing_beneficiaries where id = ${id}`;
    expect(rec!.current_photo_url).toBe(`${TEST_PUBLIC_API_URL}/api/v1/photos/${files.find((f) => f.variant === 'photo')!.id}`);
    // The losing upload's files were replaced and removed: only the live pair is left in storage.
    expect(await storedCount()).toBe(2);
  });

  it('answers 413 for a photo over 5 MB', async () => {
    const { id } = await insertRecord(sql, { project_type: 'ph_both' });
    const big = Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024 + 1, 7)]);
    const res = await request(app)
      .put(`/api/v1/records/${id}/photos/current`)
      .set('origin', TEST_ORIGIN)
      .set('cookie', plainCookie)
      .attach('photo', big, 'x.png');
    expect(res.status).toBe(413);
    expect(await storedCount()).toBe(0);
  });
});

describe('DELETE /api/v1/records/:id/photos/:slot', () => {
  it('clears the slot for the main admin; a second delete is a 200 with no new log row', async () => {
    const { id } = await insertRecord(sql, { project_type: 'ph_after' });
    await put(id, 'current');
    const res = await del(id, 'current');
    expect(res.status).toBe(200);
    expect(one.parse(res.body).data).toMatchObject({ current_photo_url: null, current_thumb_url: null });
    expect((await stored(id))?.photo_updated_at).not.toBeNull();
    expect(await liveFiles(id)).toBe(0);
    expect(await storedCount()).toBe(0);
    expect((await del(id, 'current')).status).toBe(200);
    expect(await photoLog(id)).toHaveLength(2);
  });

  it('refuses a plain admin with the photo message and leaves the photo stored', async () => {
    const { id } = await insertRecord(sql, { project_type: 'ph_after' });
    const record = one.parse((await put(id, 'current')).body).data;
    const res = await del(id, 'current', plainCookie);
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('শুধু মূল এডমিন ছবি মুছতে পারেন');
    expect((await stored(id))?.current_photo_url).toBe(record.current_photo_url);
    expect(await liveFiles(id)).toBe(2);
    const [file] = await owner<{ storage_key: string }[]>`
      select storage_key from public.housing_files where record_id = ${id} and variant = 'photo'`;
    const stream = await local.storage.get(file!.storage_key).catch((err: unknown) => err);
    expect(stream).not.toBeInstanceOf(StorageNotFoundError);
    (stream as { destroy: () => void }).destroy();
  });

  it('answers 404 for an unknown record and 400 for a bad slot', async () => {
    expect((await del(MISSING_ID, 'current')).status).toBe(404);
    expect((await del(MISSING_ID, 'side')).status).toBe(400);
  });
});

describe('DELETE /api/v1/records/:id with photos', () => {
  it('tombstones the files of an upload that commits while the delete waits for the record lock', async () => {
    const { id } = await insertRecord(sql, { project_type: 'ph_both' });
    await put(id, 'prev');
    const [uploadRes, deleteRes] = await Promise.all([put(id, 'current'), deleteRecord(id)]);
    expect(deleteRes.status).toBe(204);
    expect([200, 404]).toContain(uploadRes.status);
    // Whichever ran first, no live file is left behind without its record.
    expect(await owner`select count(*)::int as n from public.housing_files where deleted_at is null`).toEqual([{ n: 0 }]);
  });

  it('still answers 204 when storage fails, leaving tombstones for the sweep', async () => {
    const flaky = appWith(failingRemove());
    const { id } = await insertRecord(sql, { project_type: 'ph_both' });
    await put(id, 'prev');
    expect((await deleteRecord(id, flaky)).status).toBe(204);
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
    const { id } = await insertRecord(sql, { project_type: 'ph_both' });
    expect((await put(id, 'prev', plainCookie, s3App)).status).toBe(200);
    const keys = (await fileRows(id)).map((f) => f.storage_key);
    for (const key of keys) expect(await exists(s3, key)).toBe(true);
    expect((await del(id, 'prev', mainCookie, s3App)).status).toBe(200);
    for (const key of keys) expect(await exists(s3, key)).toBe(false);
  });
});
