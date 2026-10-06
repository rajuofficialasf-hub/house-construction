// The single-record writes through the real app and test database: POST /projects/:key/records,
// PATCH /records/:id and DELETE /records/:id (docs/api/PROJECTS_API_CONTRACT.md §4.4.4–§4.4.6).
// Every write needs an admin, every delete the main admin, and the record trigger's own errors
// reach the client without echoing input
// (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, U10).
import { Writable } from 'node:stream';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { requireAdmin, requireMainAdmin, requireMainAdminForPhotos } from '../../src/auth/middleware.js';
import { createLogger } from '../../src/logger.js';
import { privateNoStore } from '../../src/routes/v1/shared.js';
import { recordsAdminRouter } from '../../src/routes/v1/records-admin.js';
import { projectRecord } from '../../src/records/schemas.js';
import { StorageNotFoundError } from '../../src/storage/index.js';
import { appDb, insertField, insertPrivate, insertProject, insertRecord, ownerDb, resetTestData } from '../support/db.js';
import { loginAdmin, TEST_ORIGIN } from '../support/session.js';
import { TEST_PUBLIC_API_URL, testStorage } from '../support/storage.js';

const sql = appDb();
const owner = ownerDb();
const silent = new Writable({ write: (_chunk, _enc, done) => done() });
const local = testStorage();
const PARTNER = 'https://partner.example.org';
const app = createApp({
  sql,
  storage: local.storage,
  publicApiUrl: TEST_PUBLIC_API_URL,
  logger: createLogger('info', silent),
  trustProxy: 0,
  allowedOrigins: [TEST_ORIGIN],
  publicReadOrigins: [PARTNER],
  cookieSecure: false,
});
const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const SENTINEL = 'ZZ-SENTINEL-93';

const one = z.strictObject({ data: projectRecord });
const P = 'wr_p';
const input = { year: 2025, name: 'মমতাজ বেগম', division: 'ময়মনসিংহ', district: 'শেরপুর', upazila: 'নালিতাবাড়ী' };

let main = '';
let plain = '';
let mainId = '';
let png: Buffer;

beforeAll(async () => {
  png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#357' } }).png().toBuffer();
});
beforeEach(async () => {
  await resetTestData(owner);
  const session = await loginAdmin(app, owner, { role: 'main_admin', email: 'main@example.org' });
  main = session.cookie;
  mainId = session.admin.id;
  plain = (await loginAdmin(app, owner, { email: 'plain@example.org' })).cookie;
  await insertProject(owner, { key: P, geo_depth: 'union' });
  await insertField(owner, { project_key: P, key: 'amount', type: 'money', sort_order: 10 });
  await insertField(owner, { project_key: P, key: 'tribe', type: 'category', sort_order: 20 });
  await insertField(owner, { project_key: P, key: 'phone', type: 'phone', visibility: 'admin', sort_order: 30 });
});
afterAll(async () => {
  await Promise.all([sql.end(), owner.end()]);
  await local.cleanup();
});

const send = (method: 'post' | 'patch' | 'delete', path: string, body?: object, as: string | null = main, origin = TEST_ORIGIN) => {
  const req = request(app)[method](`/api/v1${path}`).set('origin', origin);
  if (as) req.set('cookie', as);
  return body ? req.send(body) : req;
};
const stored = async (id: string) =>
  (await owner<{ name: string; union_name: string; extra: Record<string, unknown>; current_photo_url: string | null }[]>`
    select name, union_name, extra, current_photo_url from public.housing_beneficiaries where id = ${id}`)[0];
const recordLog = (id: string) =>
  owner<{ action: string; actor_id: string }[]>`
    select action, actor_id from public.housing_activity_log where record_id = ${id} order by id`;
const fileRows = (id: string) =>
  owner<{ storage_key: string; deleted_at: Date | null }[]>`
    select storage_key, deleted_at from public.housing_files where record_id = ${id} order by variant`;
const inStorage = (key: string) =>
  local.storage.get(key).then(
    (stream) => (stream.destroy(), true),
    (err: unknown) => {
      if (err instanceof StorageNotFoundError) return false;
      throw err;
    },
  );
/** A tin record with an uploaded after photo, so a delete has files to tombstone. */
async function recordWithPhoto(): Promise<string> {
  const { id } = await insertRecord(sql, { project_type: 'tin' });
  const res = await request(app)
    .post(`/api/v1/housing/${id}/photo`)
    .set('origin', TEST_ORIGIN)
    .set('cookie', main)
    .field('kind', 'current')
    .attach('photo', png, 'photo.png');
  expect(res.status).toBe(200);
  return id;
}

describe('POST /api/v1/projects/:key/records', () => {
  it('creates with union_name and extra and the next serial, logged with the admin', async () => {
    const res = await send('post', `/projects/${P}/records`, { ...input, union_name: ' বজরা ', extra: { amount: 5000, tribe: ' সাঁওতাল ' } });
    expect(res.status).toBe(201);
    const rec = one.parse(res.body).data;
    expect(rec).toMatchObject({ project_type: P, serial_no: 1, union_name: 'বজরা', extra: { amount: 5000, tribe: 'সাঁওতাল' } });
    expect(await recordLog(rec.id)).toEqual([{ action: 'create', actor_id: mainId }]);
    const second = one.parse((await send('post', `/projects/${P}/records`, input)).body).data;
    expect(second.serial_no).toBe(2);
  });

  it('refuses a taken serial with 409', async () => {
    await send('post', `/projects/${P}/records`, { ...input, serial_no: 5 });
    expect((await send('post', `/projects/${P}/records`, { ...input, serial_no: 5 })).status).toBe(409);
  });

  it('accepts a record in a draft project from an admin', async () => {
    await insertProject(owner, { key: 'wr_draft', is_published: false });
    expect((await send('post', '/projects/wr_draft/records', input, plain)).status).toBe(201);
  });

  it('refuses a group with 400 and an unknown project with 404', async () => {
    expect((await send('post', '/projects/housing/records', input)).status).toBe(400);
    expect((await send('post', '/projects/wr_nothing/records', input)).status).toBe(404);
  });

  it('refuses project_type and every photo column in the body', async () => {
    for (const extra of [{ project_type: 'tin' }, { current_photo_url: '/x' }, { prev_thumb_url: null }]) {
      expect((await send('post', `/projects/${P}/records`, { ...input, ...extra })).status).toBe(400);
    }
  });
});

describe('guard errors end to end', () => {
  it('passes the trigger\'s message and field key for money over the limit', async () => {
    const res = await send('post', `/projects/${P}/records`, { ...input, extra: { amount: 10_000_000_001 } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', details: { field: 'extra.amount' } });
    expect(res.body.error.message).toContain('১০০০ কোটি');
  });

  it('refuses a malformed key in zod without echoing it', async () => {
    const res = await send('post', `/projects/${P}/records`, { ...input, extra: { 'Bad Key!': 1 } });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('Bad Key');
  });

  it('refuses __proto__ as a key', async () => {
    const body = `{"year":2025,"name":"নাম","division":"ক","district":"খ","upazila":"গ","extra":{"__proto__":{"x":1}}}`;
    const res = await request(app).post(`/api/v1/projects/${P}/records`).set('origin', TEST_ORIGIN).set('cookie', main).set('content-type', 'application/json').send(body);
    expect(res.status).toBe(400);
  });

  it('does not echo a malformed value', async () => {
    const res = await send('post', `/projects/${P}/records`, { ...input, extra: { amount: SENTINEL } });
    expect(res.status).toBe(400);
    expect(res.body.error.details.field).toBe('extra.amount');
    expect(JSON.stringify(res.body)).not.toContain(SENTINEL);
  });

  it('refuses a private field in extra, naming it', async () => {
    const res = await send('post', `/projects/${P}/records`, { ...input, extra: { phone: '01711222333' } });
    expect(res.status).toBe(400);
    expect(res.body.error.details.field).toBe('extra.phone');
  });
});

describe('PATCH /api/v1/records/:id', () => {
  let id = '';
  beforeEach(async () => {
    ({ id } = await insertRecord(sql, { project_type: P, extra: { amount: 100, tribe: 'ক' } }));
  });

  it('changes a field and returns the full record, logged with the admin', async () => {
    const res = await send('patch', `/records/${id}`, { name: 'নতুন নাম' }, plain);
    expect(res.status).toBe(200);
    expect(one.parse(res.body).data).toMatchObject({ name: 'নতুন নাম', extra: { amount: 100, tribe: 'ক' } });
    expect((await recordLog(id)).map((r) => r.action)).toEqual(['create', 'update']);
  });

  it('replaces the whole extra when extra is sent', async () => {
    expect((await send('patch', `/records/${id}`, { extra: { amount: 7 } })).status).toBe(200);
    expect((await stored(id))?.extra).toEqual({ amount: 7 });
  });

  it('keeps an unchanged value of a field archived since', async () => {
    await owner`update public.housing_project_fields set is_active = false where project_key = ${P} and key = 'tribe'`;
    const res = await send('patch', `/records/${id}`, { extra: { amount: 200, tribe: 'ক' } });
    expect(res.status).toBe(200);
    expect((await stored(id))?.extra).toEqual({ amount: 200, tribe: 'ক' });
  });

  it.each([
    ['an empty body', {}],
    ['project_type', { project_type: 'tin' }],
    ['serial_no', { serial_no: 9 }],
  ])('refuses %s with 400', async (_name, body) => {
    expect((await send('patch', `/records/${id}`, body)).status).toBe(400);
  });

  it('gives 404 for a missing record', async () => {
    expect((await send('patch', `/records/${MISSING_ID}`, { name: 'ক' })).status).toBe(404);
  });

  it('refuses a null photo URL from a plain admin and from the main admin, leaving the photo', async () => {
    const photoId = await recordWithPhoto();
    const before = await stored(photoId);
    expect(before?.current_photo_url).not.toBeNull();
    for (const as of [plain, main]) {
      expect((await send('patch', `/records/${photoId}`, { current_photo_url: null }, as)).status).toBe(400);
      expect((await send('patch', `/records/${photoId}`, { current_thumb_url: null }, as)).status).toBe(400);
    }
    expect((await stored(photoId))?.current_photo_url).toBe(before?.current_photo_url);
    const files = await fileRows(photoId);
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.deleted_at === null)).toBe(true);
  });
});

describe('DELETE /api/v1/records/:id', () => {
  it('lets the main admin delete: the record, its private row and its files go', async () => {
    const id = await recordWithPhoto();
    await insertField(owner, { project_key: 'tin', key: 'phone', type: 'phone', visibility: 'admin' });
    await insertPrivate(sql, id, { phone: '01711222333' });
    const keys = (await fileRows(id)).map((f) => f.storage_key);
    expect((await send('delete', `/records/${id}`)).status).toBe(204);
    expect(await stored(id)).toBeUndefined();
    expect(await owner`select 1 from public.housing_beneficiary_private where record_id = ${id}`).toHaveLength(0);
    for (const key of keys) expect(await inStorage(key)).toBe(false);
  });

  it('refuses a plain admin with 403 and leaves the record, private row and files', async () => {
    const id = await recordWithPhoto();
    await insertField(owner, { project_key: 'tin', key: 'phone', type: 'phone', visibility: 'admin' });
    await insertPrivate(sql, id, { phone: '01711222333' });
    expect((await send('delete', `/records/${id}`, undefined, plain)).status).toBe(403);
    expect(await stored(id)).toBeDefined();
    expect(await owner`select 1 from public.housing_beneficiary_private where record_id = ${id}`).toHaveLength(1);
    for (const file of await fileRows(id)) {
      expect(file.deleted_at).toBeNull();
      expect(await inStorage(file.storage_key)).toBe(true);
    }
  });

  it('gives 404 for a missing record', async () => {
    expect((await send('delete', `/records/${MISSING_ID}`)).status).toBe(404);
  });
});

describe('write limit', () => {
  it('counts every record write per admin and answers 429 past the limit, changing nothing', async () => {
    const limited = createApp({
      sql,
      storage: local.storage,
      publicApiUrl: TEST_PUBLIC_API_URL,
      logger: createLogger('info', silent),
      trustProxy: 0,
      allowedOrigins: [TEST_ORIGIN],
      cookieSecure: false,
      writeRateLimit: { windowMs: 60_000, limit: 1 },
    });
    const { cookie: as } = await loginAdmin(limited, owner, { email: 'limited@example.org' });
    const write = (method: 'post' | 'patch', path: string, body?: object) => {
      const req = request(limited)[method](`/api/v1${path}`).set('origin', TEST_ORIGIN).set('cookie', as);
      return body ? req.send(body) : req;
    };
    const created = await write('post', `/projects/${P}/records`, input);
    expect(created.status).toBe(201);
    const { id } = one.parse(created.body).data;
    const patched = await write('patch', `/records/${id}`, { name: 'বদল' });
    expect(patched.status).toBe(429);
    expect(patched.body.error.code).toBe('RATE_LIMITED');
    expect((await stored(id))?.name).toBe(input.name);
  });
});

describe('auth and origin', () => {
  // The router has no router-wide guard (it is mounted at /api/v1), so each route must carry its own.
  it('puts an admin guard before any work on every route of the admin router', () => {
    const router = recordsAdminRouter({
      sql,
      storage: local.storage,
      publicApiUrl: TEST_PUBLIC_API_URL,
      receivePhoto: () => Promise.reject(new Error('unused')),
    });
    const routes = router.stack.flatMap((layer) => (layer.route ? [layer.route] : []));
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      // privateNoStore only sets a header, so a refusal is never cached either.
      const handlers = (route as unknown as { stack: { handle: unknown }[] }).stack.map((layer) => layer.handle);
      expect([requireAdmin, requireMainAdmin, requireMainAdminForPhotos]).toContain(handlers.find((handle) => handle !== privateNoStore));
    }
  });

  it('refuses all three routes without a session', async () => {
    const { id } = await insertRecord(sql, { project_type: P });
    expect((await send('post', `/projects/${P}/records`, input, null)).status).toBe(401);
    expect((await send('patch', `/records/${id}`, { name: 'ক' }, null)).status).toBe(401);
    expect((await send('delete', `/records/${id}`, undefined, null)).status).toBe(401);
  });

  it('refuses a disabled admin\'s cookie', async () => {
    const { id } = await insertRecord(sql, { project_type: P });
    await owner`update public.housing_admins set disabled_at = now() where email = 'plain@example.org'`;
    expect((await send('patch', `/records/${id}`, { name: 'ক' }, plain)).status).toBe(401);
  });

  it('refuses a PATCH from an origin not on the list', async () => {
    const { id } = await insertRecord(sql, { project_type: P });
    expect((await send('patch', `/records/${id}`, { name: 'ক' }, main, 'https://evil.example.org')).status).toBe(403);
  });

  it('grants a PATCH preflight to the site, and none to a public-read origin', async () => {
    const preflight = (origin: string) =>
      request(app).options('/api/v1/records/x').set('origin', origin).set('access-control-request-method', 'PATCH');
    const site = await preflight(TEST_ORIGIN);
    expect(site.headers['access-control-allow-origin']).toBe(TEST_ORIGIN);
    expect(site.headers['access-control-allow-methods']).toContain('PATCH');
    expect((await preflight(PARTNER)).headers['access-control-allow-origin']).toBeUndefined();
  });
});
