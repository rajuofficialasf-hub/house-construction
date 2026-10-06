// A record's private values through the real app and test database: GET/PUT /records/:id/private
// and POST /projects/:key/records/private (docs/api/PROJECTS_API_CONTRACT.md §4.4.8). Admin-only,
// never cached, and the values never reach a log line or an error body
// (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, U11).
import { Writable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/logger.js';
import { privateValues } from '../../src/records/schemas.js';
import { appDb, insertField, insertPrivate, insertProject, insertRecord, ownerDb, resetTestData } from '../support/db.js';
import { loginAdmin, TEST_ORIGIN } from '../support/session.js';
import { testPhotoDeps } from '../support/storage.js';

const sql = appDb();
const owner = ownerDb();
const logLines: string[] = [];
const capture = new Writable({
  write: (chunk, _enc, done) => {
    logLines.push(String(chunk));
    done();
  },
});
const PARTNER = 'https://partner.example.org';
const app = createApp({
  ...testPhotoDeps(),
  sql,
  logger: createLogger('debug', capture),
  trustProxy: 0,
  allowedOrigins: [TEST_ORIGIN],
  publicReadOrigins: [PARTNER],
  cookieSecure: false,
});
const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const PHONE = '01799999999';

const one = z.strictObject({ data: privateValues });
const many = z.strictObject({ data: z.record(z.uuid(), privateValues) });
const P = 'pv_p';

let cookie = '';
let adminId = '';
let id = '';

beforeEach(async () => {
  await resetTestData(owner);
  logLines.length = 0;
  const session = await loginAdmin(app, owner);
  cookie = session.cookie;
  adminId = session.admin.id;
  await insertProject(owner, { key: P });
  await insertField(owner, { project_key: P, key: 'note', type: 'text', sort_order: 10 });
  await insertField(owner, { project_key: P, key: 'phone', type: 'phone', visibility: 'admin', sort_order: 20 });
  await insertField(owner, { project_key: P, key: 'nid', type: 'text', visibility: 'admin', sort_order: 30 });
  ({ id } = await insertRecord(sql, { project_type: P }));
});
afterAll(() => Promise.all([sql.end(), owner.end()]));

const get = (path: string, as: string | null = cookie, origin = TEST_ORIGIN) => {
  const req = request(app).get(`/api/v1${path}`).set('origin', origin);
  return as ? req.set('cookie', as) : req;
};
const send = (method: 'put' | 'post', path: string, body: object, as: string | null = cookie) => {
  const req = request(app)[method](`/api/v1${path}`).set('origin', TEST_ORIGIN);
  if (as) req.set('cookie', as);
  return req.send(body);
};
const events = (event: string) =>
  logLines.map((line) => JSON.parse(line) as Record<string, unknown>).filter((entry) => entry.event === event);

describe('GET and PUT /api/v1/records/:id/private', () => {
  it('round-trips a phone typed in Bangla digits, stored in ASCII', async () => {
    const put = await send('put', `/records/${id}/private`, { data: { phone: '০১৭৯৯৯৯৯৯৯৯', nid: '1234' } });
    expect(put.status).toBe(200);
    expect(one.parse(put.body).data).toEqual({ phone: PHONE, nid: '1234' });
    expect(one.parse((await get(`/records/${id}/private`)).body).data).toEqual({ phone: PHONE, nid: '1234' });
  });

  it('answers {} for a record with no values', async () => {
    expect(one.parse((await get(`/records/${id}/private`)).body).data).toEqual({});
  });

  it('replaces the set: a key left out is removed, an empty or null value is not stored', async () => {
    await send('put', `/records/${id}/private`, { data: { phone: PHONE, nid: '1234' } });
    const res = await send('put', `/records/${id}/private`, { data: { phone: PHONE, nid: '' } });
    expect(one.parse(res.body).data).toEqual({ phone: PHONE });
    expect(one.parse((await send('put', `/records/${id}/private`, { data: { phone: null } })).body).data).toEqual({});
  });

  it('keeps an unchanged value of a field archived since', async () => {
    await send('put', `/records/${id}/private`, { data: { phone: PHONE, nid: '1234' } });
    await owner`update public.housing_project_fields set is_active = false where project_key = ${P} and key = 'nid'`;
    const res = await send('put', `/records/${id}/private`, { data: { phone: '01711222333', nid: '1234' } });
    expect(res.status).toBe(200);
    expect(one.parse(res.body).data).toEqual({ phone: '01711222333', nid: '1234' });
    expect((await send('put', `/records/${id}/private`, { data: { nid: '9999' } })).status).toBe(400);
  });

  it('refuses a public field\'s key, naming it, without the value', async () => {
    const res = await send('put', `/records/${id}/private`, { data: { note: PHONE } });
    expect(res.status).toBe(400);
    expect(res.body.error.details.field).toBe('private.note');
    expect(JSON.stringify(res.body)).not.toContain(PHONE);
  });

  it('refuses an unknown key without echoing it', async () => {
    const res = await send('put', `/records/${id}/private`, { data: { zz_secret_key: PHONE } });
    expect(res.status).toBe(400);
    expect(res.body.error.message).not.toContain('zz_secret_key');
    expect(JSON.stringify(res.body)).not.toContain(PHONE);
  });

  it('gives 404 for a missing record', async () => {
    expect((await get(`/records/${MISSING_ID}/private`)).status).toBe(404);
    expect((await send('put', `/records/${MISSING_ID}/private`, { data: { phone: PHONE } })).status).toBe(404);
  });

  it('logs a save with the actor and the key names only', async () => {
    await send('put', `/records/${id}/private`, { data: { phone: PHONE } });
    expect(events('private_update')).toEqual([expect.objectContaining({ actor: adminId, record_id: id, keys: ['phone'] })]);
  });

  it('logs a single read with the actor and the record id, and no value', async () => {
    await insertPrivate(sql, id, { phone: PHONE });
    await get(`/records/${id}/private`);
    const [event] = events('private_read');
    expect(event).toEqual(expect.objectContaining({ actor: adminId, record_id: id }));
    expect(JSON.stringify(event)).not.toContain(PHONE);
  });
});

describe('POST /api/v1/projects/:key/records/private', () => {
  it('returns values by id for this project\'s records that have some', async () => {
    const empty = await insertRecord(sql, { project_type: P });
    await insertPrivate(sql, id, { phone: PHONE });
    await insertField(owner, { project_key: 'tin', key: 'phone', type: 'phone', visibility: 'admin' });
    const other = await insertRecord(sql, { project_type: 'tin' });
    await insertPrivate(sql, other.id, { phone: '01711222333' });
    const res = await send('post', `/projects/${P}/records/private`, { ids: [id, empty.id, other.id, MISSING_ID] });
    expect(res.status).toBe(200);
    expect(many.parse(res.body).data).toEqual({ [id]: { phone: PHONE } });
    expect(events('private_read_many')).toEqual([expect.objectContaining({ actor: adminId, project_key: P, count: 1 })]);
  });

  it('refuses 101 ids and a non-uuid', async () => {
    const ids = Array.from({ length: 101 }, () => MISSING_ID);
    expect((await send('post', `/projects/${P}/records/private`, { ids })).status).toBe(400);
    expect((await send('post', `/projects/${P}/records/private`, { ids: ['x'] })).status).toBe(400);
  });

  it('gives 404 for an unknown project', async () => {
    expect((await send('post', '/projects/pv_nothing/records/private', { ids: [id] })).status).toBe(404);
  });
});

describe('write limit', () => {
  it('counts the bulk read and saves per admin, and answers 429 past the limit', async () => {
    const limited = createApp({
      ...testPhotoDeps(),
      sql,
      logger: createLogger('info', capture),
      trustProxy: 0,
      allowedOrigins: [TEST_ORIGIN],
      cookieSecure: false,
      writeRateLimit: { windowMs: 60_000, limit: 1 },
    });
    const { cookie: as } = await loginAdmin(limited, owner, { email: 'limited@example.org' });
    const post = () => request(limited).post(`/api/v1/projects/${P}/records/private`).set('origin', TEST_ORIGIN).set('cookie', as).send({ ids: [id] });
    expect((await post()).status).toBe(200);
    const over = await post();
    expect(over.status).toBe(429);
    expect(over.headers['cache-control']).toBe('private, no-store');
    const put = await request(limited).put(`/api/v1/records/${id}/private`).set('origin', TEST_ORIGIN).set('cookie', as).send({ data: { phone: PHONE } });
    expect(put.status).toBe(429);
    expect(one.parse((await get(`/records/${id}/private`)).body).data).toEqual({});
  });
});

describe('who may read them', () => {
  beforeEach(() => insertPrivate(sql, id, { phone: PHONE }));

  it('refuses a visitor on all three, with no value in the body', async () => {
    for (const res of [
      await get(`/records/${id}/private`, null),
      await send('put', `/records/${id}/private`, { data: { phone: PHONE } }, null),
      await send('post', `/projects/${P}/records/private`, { ids: [id] }, null),
    ]) {
      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body)).not.toContain(PHONE);
    }
  });

  it('refuses a disabled admin\'s cookie', async () => {
    await owner`update public.housing_admins set disabled_at = now() where id = ${adminId}`;
    expect((await get(`/records/${id}/private`)).status).toBe(401);
  });

  it('gives a public-read origin no CORS grant', async () => {
    const res = await get(`/records/${id}/private`, null, PARTNER);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('marks every answer, refusals included, private and no-store', async () => {
    const answers = [
      await get(`/records/${id}/private`),
      await get(`/records/${id}/private`, null),
      await get(`/records/${MISSING_ID}/private`),
      await send('put', `/records/${id}/private`, { data: { phone: PHONE } }),
      await send('put', `/records/${id}/private`, { data: { note: 'x' } }),
      await send('post', `/projects/${P}/records/private`, { ids: [id] }),
      await send('post', `/projects/${P}/records/private`, { ids: [id] }, null),
    ];
    for (const res of answers) expect(res.headers['cache-control']).toBe('private, no-store');
  });
});

describe('no leak', () => {
  it('keeps the phone out of every log line across a save, a read, a bulk read and a refused save', async () => {
    await send('put', `/records/${id}/private`, { data: { phone: PHONE } });
    await get(`/records/${id}/private`);
    await send('post', `/projects/${P}/records/private`, { ids: [id] });
    const refused = await send('put', `/records/${id}/private`, { data: { phone: PHONE, note: PHONE } });
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).not.toContain(PHONE);
    expect(logLines.length).toBeGreaterThan(0);
    for (const line of logLines) expect(line).not.toContain(PHONE);
  });
});
