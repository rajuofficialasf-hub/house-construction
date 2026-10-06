import { Writable } from 'node:stream';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { errorBody, housingRecord } from '../../src/housing/schemas.js';
import { createLogger } from '../../src/logger.js';
import { appDb, insertRecord, ownerDb, resetTestData } from '../support/db.js';
import { loginAdmin, TEST_ORIGIN } from '../support/session.js';
import { testPhotoDeps } from '../support/storage.js';

// The record writes under /api/v1/housing through the real app and test database
// (docs/api/API_CONTRACT.md §4.5খ–§4.8): create, update, delete and change serial, each only for
// an admin, each logged with that admin.

const sql = appDb();
const owner = ownerDb();
const silent = new Writable({ write: (_chunk, _enc, done) => done() });
const app = createApp({ ...testPhotoDeps(), sql, logger: createLogger('info', silent), trustProxy: 0, allowedOrigins: [TEST_ORIGIN], cookieSecure: false });
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

const one = z.strictObject({ data: housingRecord });
const input = {
  project_type: 'tin',
  year: 2025,
  name: 'মমতাজ বেগম',
  division: 'ময়মনসিংহ',
  district: 'শেরপুর',
  upazila: 'নালিতাবাড়ী',
};

let cookie = '';
let adminId = '';

beforeEach(async () => {
  await resetTestData(owner);
  const session = await loginAdmin(app, owner, { role: 'main_admin' });
  cookie = session.cookie;
  adminId = session.admin.id;
});
afterAll(() => Promise.all([sql.end(), owner.end()]));

const send = (method: 'post' | 'put' | 'delete', path: string, body?: object, as = cookie) => {
  const req = request(app)[method](`/api/v1/housing${path}`).set('origin', TEST_ORIGIN);
  if (as) req.set('cookie', as);
  return body ? req.send(body) : req;
};
const total = async () => (await owner<{ n: number }[]>`select count(*)::int as n from public.housing_beneficiaries`)[0]!.n;
const recordLog = (recordId: string) =>
  owner<{ action: string; actor_id: string; actor_email: string }[]>`
    select action, actor_id, actor_email from public.housing_activity_log where record_id = ${recordId} order by id`;
const nextSerial = async (projectType = 'tin') =>
  (await request(app).get(`/api/v1/housing/next-serial?project_type=${projectType}`)).body.data.next_serial as number;

describe('POST /api/v1/housing', () => {
  it('creates with the next serial and the contract defaults, logged with the admin', async () => {
    const res = await send('post', '', input);
    expect(res.status).toBe(201);
    const rec = one.parse(res.body).data;
    expect(rec).toMatchObject({ serial_no: 1, father_or_husband_name: '', address: '', prev_photo_url: null, photo_updated_at: null });
    expect(await recordLog(rec.id)).toEqual([{ action: 'create', actor_id: adminId, actor_email: 'admin@example.org' }]);
  });

  it('keeps an explicit serial and raises the counter past it; the same serial again is a 409', async () => {
    const res = await send('post', '', { ...input, serial_no: 41 });
    expect(one.parse(res.body).data.serial_no).toBe(41);
    expect(await nextSerial()).toBe(42);
    const again = await send('post', '', { ...input, serial_no: 41 });
    expect(again.status).toBe(409);
    expect(errorBody.parse(again.body).error).toEqual({ code: 'CONFLICT', message: 'এই সিরিয়াল আগে থেকেই আছে' });
    expect(await total()).toBe(1);
  });

  it.each([
    ['year', { year: 1999 }],
    ['name', { name: '   ' }],
    ['division', { division: '' }],
    ['serial_no', { serial_no: 0 }],
    ['', { actor_email: 'someone@example.org' }],
  ])('refuses invalid %s with 400 and writes nothing', async (field, over) => {
    const res = await send('post', '', { ...input, ...over });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    if (field) expect(res.body.error.details.field).toBe(field);
    expect(await total()).toBe(0);
  });
});

describe('PUT /api/v1/housing/:id', () => {
  it('changes only the given fields and moves updated_at', async () => {
    const rec = one.parse((await send('post', '', { ...input, address: 'আগের' })).body).data;
    const res = await send('put', `/${rec.id}`, { name: ' নতুন নাম ' });
    expect(res.status).toBe(200);
    const upd = one.parse(res.body).data;
    expect(upd).toMatchObject({ name: 'নতুন নাম', address: 'আগের', serial_no: rec.serial_no });
    expect(new Date(upd.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(rec.updated_at).getTime());
    expect((await recordLog(rec.id)).map((e) => e.action)).toEqual(['create', 'update']);
  });

  it('logs nothing for an update that changes no field', async () => {
    const rec = one.parse((await send('post', '', input)).body).data;
    expect((await send('put', `/${rec.id}`, { name: input.name })).status).toBe(200);
    expect((await recordLog(rec.id)).map((e) => e.action)).toEqual(['create']);
  });

  it.each([{ serial_no: 99 }, { project_type: 'semi_pucca' }, { current_photo_url: 'https://x' }, {}])(
    'refuses %o with 400 and leaves the record unchanged',
    async (patch) => {
      const rec = one.parse((await send('post', '', input)).body).data;
      expect((await send('put', `/${rec.id}`, patch)).status).toBe(400);
      expect(one.parse((await request(app).get(`/api/v1/housing/${rec.id}`)).body).data).toEqual(rec);
    },
  );

  it('answers 404 for an unknown id and 400 for one that is not a uuid', async () => {
    expect((await send('put', `/${MISSING_ID}`, { name: 'x' })).status).toBe(404);
    expect((await send('put', '/abc', { name: 'x' })).status).toBe(400);
  });
});

describe('DELETE /api/v1/housing/:id', () => {
  it('deletes with 204, then 404s, and the serial is never handed out again', async () => {
    const rec = one.parse((await send('post', '', input)).body).data;
    expect((await send('delete', `/${rec.id}`)).status).toBe(204);
    expect((await request(app).get(`/api/v1/housing/${rec.id}`)).status).toBe(404);
    expect((await send('delete', `/${rec.id}`)).status).toBe(404);
    const next = one.parse((await send('post', '', input)).body).data;
    expect(next.serial_no).toBe(rec.serial_no + 1);
    expect((await recordLog(rec.id)).map((e) => e.action)).toEqual(['create', 'delete']);
  });
});

describe('POST /api/v1/housing/:id/serial', () => {
  it('moves the record, keeps its photo urls, logs the change and never reuses the old serial', async () => {
    const { id } = await insertRecord(sql, { project_type: 'tin' });
    await owner`update public.housing_beneficiaries set prev_photo_url = 'https://cdn/tin/0001/prev.webp' where id = ${id}`;
    const res = await send('post', `/${id}/serial`, { serial_no: 30 });
    expect(res.status).toBe(200);
    expect(one.parse(res.body).data).toMatchObject({ serial_no: 30, prev_photo_url: 'https://cdn/tin/0001/prev.webp' });
    expect((await request(app).get('/api/v1/housing/tin/serial/1')).status).toBe(404);
    expect(await nextSerial()).toBe(31);
    const log = await recordLog(id);
    expect(log.at(-1)).toEqual({ action: 'serial_change', actor_id: adminId, actor_email: 'admin@example.org' });
  });

  it('refuses a taken serial with 409 from the database function, changing neither record', async () => {
    const a = await insertRecord(sql, { project_type: 'tin' });
    const b = await insertRecord(sql, { project_type: 'tin' });
    const res = await send('post', `/${a.id}/serial`, { serial_no: b.serial_no });
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ code: 'CONFLICT', message: 'এই সিরিয়াল আগে থেকেই আছে' });
    const serials = await owner<{ serial_no: number }[]>`select serial_no from public.housing_beneficiaries order by serial_no`;
    expect(serials.map((r) => r.serial_no)).toEqual([1, 2]);
  });

  it('returns the record unchanged for its own serial', async () => {
    const { id, serial_no } = await insertRecord(sql);
    const res = await send('post', `/${id}/serial`, { serial_no });
    expect(res.status).toBe(200);
    expect(res.body.data.serial_no).toBe(serial_no);
  });

  it('answers 400 for serial 0 and 404 for an unknown id', async () => {
    const { id } = await insertRecord(sql);
    expect((await send('post', `/${id}/serial`, { serial_no: 0 })).status).toBe(400);
    expect((await send('post', `/${MISSING_ID}/serial`, { serial_no: 5000 })).status).toBe(404);
  });
});

describe('who may write', () => {
  it.each([
    ['post', ''],
    ['put', `/${MISSING_ID}`],
    ['delete', `/${MISSING_ID}`],
    ['post', `/${MISSING_ID}/serial`],
    ['post', `/${MISSING_ID}/photo`],
    ['delete', `/${MISSING_ID}/photo?kind=prev`],
    ['post', '/no-such-route'],
  ] as const)('refuses %s %s without a session with 401, before validation', async (method, path) => {
    const res = await send(method, path, {}, '');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('writes nothing for a create without a session', async () => {
    expect((await send('post', '', input, '')).status).toBe(401);
    expect(await total()).toBe(0);
  });

  it('refuses a disabled admin’s session', async () => {
    await owner`update public.housing_admins set disabled_at = now()`;
    expect((await send('post', '', input)).status).toBe(401);
    expect(await total()).toBe(0);
  });

  it('refuses an expired session', async () => {
    await owner`update public.housing_admin_sessions set expires_at = now() - interval '1 second'`;
    expect((await send('post', '', input)).status).toBe(401);
  });

  it('refuses a write with no Origin, or another origin, with 403 even for an admin', async () => {
    expect((await request(app).post('/api/v1/housing').set('cookie', cookie).send(input)).status).toBe(403);
    expect((await request(app).post('/api/v1/housing').set('origin', 'https://evil.example').set('cookie', cookie).send(input)).status).toBe(403);
    expect(await total()).toBe(0);
  });

  it('still serves the reads without a session', async () => {
    const { id } = await insertRecord(sql);
    expect((await request(app).get(`/api/v1/housing/${id}`)).status).toBe(200);
    expect((await request(app).get('/api/v1/housing')).status).toBe(200);
  });
});

describe('write rate limit', () => {
  // A fresh app per test, so each starts with an empty in-memory counter.
  const limitedApp = () =>
    createApp({
      ...testPhotoDeps(),
      sql,
      logger: createLogger('info', silent),
      trustProxy: 0,
      allowedOrigins: [TEST_ORIGIN],
      cookieSecure: false,
      writeRateLimit: { windowMs: 60_000, limit: 3 },
    });
  const write = (target: Express, method: 'post' | 'put' | 'delete', path: string, as: string, body?: object) => {
    const req = request(target)[method](`/api/v1/housing${path}`).set('origin', TEST_ORIGIN).set('cookie', as);
    return body ? req.send(body) : req;
  };

  it('allows the limit, then answers 429 RATE_LIMITED and changes nothing', async () => {
    const target = limitedApp();
    const { cookie: as } = await loginAdmin(target, owner, { email: 'limited@example.org' });
    for (let i = 0; i < 3; i++) expect((await write(target, 'post', '', as, input)).status).toBe(201);
    const over = await write(target, 'post', '', as, input);
    expect(over.status).toBe(429);
    expect(errorBody.parse(over.body).error.code).toBe('RATE_LIMITED');
    expect(await total()).toBe(3);
    const logged = await owner<{ n: number }[]>`select count(*)::int as n from public.housing_activity_log where action = 'create'`;
    expect(logged[0]!.n).toBe(3);
  });

  it('counts per admin, not per IP', async () => {
    const target = limitedApp();
    const { cookie: first } = await loginAdmin(target, owner, { email: 'first@example.org' });
    const { cookie: second } = await loginAdmin(target, owner, { email: 'second@example.org' });
    for (let i = 0; i < 3; i++) await write(target, 'post', '', first, input);
    expect((await write(target, 'post', '', first, input)).status).toBe(429);
    expect((await write(target, 'post', '', second, input)).status).toBe(201);
  });

  it('counts a bulk request as one write and covers the photo routes', async () => {
    const target = limitedApp();
    // The session from beforeEach: the only main admin, who may delete, with no writes yet.
    const as = cookie;
    const { project_type: _type, ...row } = input;
    const bulk = { project_type: 'tin', mode: 'assign_serial', rows: [row, row, row, row] };
    expect((await write(target, 'post', '/bulk', as, bulk)).status).toBe(200);
    const { id } = await insertRecord(sql);
    expect((await write(target, 'delete', `/${id}/photo?kind=prev`, as)).status).toBe(200);
    expect((await write(target, 'put', `/${id}`, as, { name: 'নতুন নাম' })).status).toBe(200);
    expect((await write(target, 'delete', `/${id}/photo?kind=prev`, as)).status).toBe(429);
  });

  it('never counts reads or the activity log', async () => {
    const target = limitedApp();
    const { cookie: as } = await loginAdmin(target, owner, { email: 'reader@example.org' });
    for (let i = 0; i < 5; i++) {
      expect((await request(target).get('/api/v1/housing').set('cookie', as)).status).toBe(200);
      expect((await write(target, 'post', '/activity', as, { action: 'export', details: {} })).status).toBe(201);
    }
    // Express routes these to the activity log too, so they aren't counted either.
    for (const path of ['/activity/', '/Activity']) {
      expect((await write(target, 'post', path, as, { action: 'export', details: {} })).status).toBe(201);
    }
    expect((await write(target, 'post', '', as, input)).status).toBe(201);
  });

  it('still answers 401 without a session, whatever the count', async () => {
    const target = limitedApp();
    for (let i = 0; i < 5; i++) expect((await request(target).post('/api/v1/housing').set('origin', TEST_ORIGIN).send(input)).status).toBe(401);
  });
});
