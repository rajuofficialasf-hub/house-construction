// PUT and DELETE /api/v1/projects/:key/cover through the real app, test database and a NAS driver
// on a temp folder (docs/api/PROJECTS_API_CONTRACT.md §4.1.8), and who may then fetch the cover
// from GET /api/v1/photos/:id (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, U25).
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { Writable } from 'node:stream';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/logger.js';
import { project } from '../../src/projects/schemas.js';
import { appDb, insertProject, insertRecord, ownerDb, resetTestData } from '../support/db.js';
import { loginAdmin, TEST_ORIGIN } from '../support/session.js';
import { TEST_PUBLIC_API_URL, testStorage } from '../support/storage.js';

const sql = appDb();
const owner = ownerDb();
const silent = new Writable({ write: (_chunk, _enc, done) => done() });
const local = testStorage();
const app = createApp({
  sql,
  logger: createLogger('info', silent),
  trustProxy: 0,
  allowedOrigins: [TEST_ORIGIN],
  cookieSecure: false,
  storage: local.storage,
  publicApiUrl: TEST_PUBLIC_API_URL,
});
const one = z.strictObject({ data: project });
const P = 'cov_p';
const COVER_URL = new RegExp(`^${TEST_PUBLIC_API_URL}/api/v1/photos/[0-9a-f-]{36}$`);

let main = '';
let plain = '';
let png: Buffer;

beforeAll(async () => {
  png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#357' } }).png().toBuffer();
});
beforeEach(async () => {
  await resetTestData(owner);
  // Each test counts the files it leaves, so it starts from an empty folder.
  await rm(path.join(local.root, 'housing'), { recursive: true, force: true });
  main = (await loginAdmin(app, owner, { role: 'main_admin' })).cookie;
  plain = (await loginAdmin(app, owner, { email: 'plain@example.org' })).cookie;
  await insertProject(owner, { key: P, is_published: false });
});
afterAll(async () => {
  await Promise.all([sql.end(), owner.end()]);
  await local.cleanup();
});

const put = (key = P, as = plain) =>
  request(app).put(`/api/v1/projects/${key}/cover`).set('origin', TEST_ORIGIN).set('cookie', as).attach('photo', png, 'cover.png');
const del = (key = P, as = main) => request(app).delete(`/api/v1/projects/${key}/cover`).set('origin', TEST_ORIGIN).set('cookie', as);
const fetchPhoto = (url: string, as: string | null = null) => {
  const req = request(app).get(new URL(url).pathname);
  return as ? req.set('cookie', as) : req;
};
const storedCount = async () => (await readdir(path.join(local.root, 'housing')).catch(() => [])).length;
const coverRows = (key = P) =>
  owner`select kind, variant, record_id, deleted_at from public.housing_files where project_key = ${key} order by variant`;
const coverPath = async (key = P) => (await owner<{ cover_path: string | null }[]>`select cover_path from public.housing_projects where key = ${key}`)[0]?.cover_path;

/** Uploads a cover and returns its URL. */
async function upload(key = P): Promise<string> {
  const res = await put(key);
  expect(res.status).toBe(200);
  return one.parse(res.body).data.cover_path!;
}

describe('PUT /projects/:key/cover', () => {
  it('stores a re-encoded cover, sets cover_path and updated_at, and logs the admin', async () => {
    const before = (await owner<{ updated_at: Date }[]>`select updated_at from public.housing_projects where key = ${P}`)[0]!.updated_at;
    const res = await put();
    expect(res.status).toBe(200);
    const saved = one.parse(res.body).data;
    expect(saved.cover_path).toMatch(COVER_URL);
    expect(new Date(saved.updated_at).getTime()).toBeGreaterThan(before.getTime());
    expect(await coverRows()).toMatchObject([
      { kind: 'cover', variant: 'photo', record_id: null, deleted_at: null },
      { kind: 'cover', variant: 'thumb', record_id: null, deleted_at: null },
    ]);
    const served = await fetchPhoto(saved.cover_path!, main);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/webp');
    const [entry] = await owner`select actor_email, details from public.housing_activity_log where action = 'project_update'`;
    expect(entry).toMatchObject({ actor_email: 'plain@example.org', details: { changes: { cover_path: { old: null, new: saved.cover_path } } } });
  });

  it('replaces the old cover, whose URL then answers 404', async () => {
    const first = await upload();
    const second = await upload();
    expect(second).not.toBe(first);
    expect((await fetchPhoto(first, main)).status).toBe(404);
    expect(await storedCount()).toBe(2);
  });

  it('takes a cover on a group too', async () => {
    expect(await upload('housing')).toMatch(COVER_URL);
  });

  it('answers 404 for an unknown project and stores nothing', async () => {
    expect((await put('nope')).status).toBe(404);
    expect(await storedCount()).toBe(0);
    expect(await owner`select id from public.housing_files`).toEqual([]);
  });

  it('refuses a non-image and a multipart kind field with 400, and a photo over 5 MB with 413', async () => {
    const notImage = await request(app).put(`/api/v1/projects/${P}/cover`).set('origin', TEST_ORIGIN).set('cookie', plain)
      .attach('photo', Buffer.from('not an image at all'), 'x.png');
    expect(notImage.status).toBe(400);
    const withKind = await request(app).put(`/api/v1/projects/${P}/cover`).set('origin', TEST_ORIGIN).set('cookie', plain)
      .field('kind', 'prev').attach('photo', png, 'cover.png');
    expect(withKind.status).toBe(400);
    const big = await request(app).put(`/api/v1/projects/${P}/cover`).set('origin', TEST_ORIGIN).set('cookie', plain)
      .attach('photo', Buffer.alloc(5 * 1024 * 1024 + 1, 1), 'big.png');
    expect(big.status).toBe(413);
    expect(await coverPath()).toBeNull();
    expect(await storedCount()).toBe(0);
  });
});

describe('DELETE /projects/:key/cover', () => {
  it('refuses a plain admin with the cover message, and the cover stays', async () => {
    const url = await upload();
    const res = await del(P, plain);
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('শুধু মূল এডমিন কভার ছবি মুছতে পারেন');
    expect(await coverPath()).toBe(url);
    expect(await storedCount()).toBe(2);
  });

  it('lets the main admin remove it, files included; a second delete changes and logs nothing', async () => {
    await upload();
    const res = await del();
    expect(res.status).toBe(200);
    expect(one.parse(res.body).data.cover_path).toBeNull();
    expect(await coverRows()).toEqual([]);
    expect(await storedCount()).toBe(0);
    const logged = async () => (await owner`select 1 from public.housing_activity_log where action = 'project_update'`).length;
    const count = await logged();
    expect((await del()).status).toBe(200);
    expect(await logged()).toBe(count);
  });

  it('answers 404 for an unknown project', async () => {
    expect((await del('nope')).status).toBe(404);
  });
});

describe('a cover on GET /photos/:id', () => {
  it('is 404 to a visitor while the project is a draft, never cached, and served to an admin uncached', async () => {
    const url = await upload();
    for (const method of ['get', 'head'] as const) {
      const res = await request(app)[method](new URL(url).pathname);
      expect(res.status).toBe(404);
      expect(res.headers['cache-control']).toBe('no-store');
    }
    const admin = await fetchPhoto(url, main);
    expect(admin.status).toBe(200);
    expect(admin.headers['cache-control']).toBe('private, no-store');
  });

  it('is 404 to a visitor for a published child of a draft group', async () => {
    await insertProject(owner, { key: 'grp', is_group: true, is_published: false });
    await insertProject(owner, { key: 'child', parent_key: 'grp' });
    expect((await fetchPhoto(await upload('child'))).status).toBe(404);
  });

  it('is served to a visitor with the public cache once published, until unpublished', async () => {
    await owner`update public.housing_projects set is_published = true where key = ${P}`;
    const url = await upload();
    const res = await fetchPhoto(url);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
    await owner`update public.housing_projects set is_published = false where key = ${P}`;
    expect((await fetchPhoto(url)).status).toBe(404);
  });
});

describe('deleting the project', () => {
  it('removes a fresh project\'s cover files with it', async () => {
    await upload();
    expect((await request(app).delete(`/api/v1/projects/${P}`).set('origin', TEST_ORIGIN).set('cookie', main)).status).toBe(204);
    expect(await owner`select id from public.housing_files`).toEqual([]);
    expect(await storedCount()).toBe(0);
  });

  it('keeps the cover live when the delete is refused', async () => {
    const url = await upload();
    await insertRecord(sql, { project_type: P });
    expect((await request(app).delete(`/api/v1/projects/${P}`).set('origin', TEST_ORIGIN).set('cookie', main)).status).toBe(400);
    expect(await coverPath()).toBe(url);
    expect((await fetchPhoto(url, main)).status).toBe(200);
  });
});
