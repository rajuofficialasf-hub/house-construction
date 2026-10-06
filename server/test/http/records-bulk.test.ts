// POST and PUT /api/v1/projects/:key/records/bulk through the real app and test database
// (docs/api/PROJECTS_API_CONTRACT.md §4.4.7). The behaviour of the bulk functions themselves (merge,
// _clear, private routing, all-or-nothing) is proven in test/db/bulk-*.test.ts; these tests cover
// what the routes add: the body schemas, the limits, the project lookup and the error body.
import { Writable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createDb } from '../../src/db.js';
import { createLogger } from '../../src/logger.js';
import { insertField, insertProject, insertRecord, ownerDb, resetTestData } from '../support/db.js';
import { testAppUrl } from '../support/env.js';
import { loginAdmin, TEST_ORIGIN } from '../support/session.js';
import { testPhotoDeps } from '../support/storage.js';

// The API's own pool, with its 5 s statement timeout, so the largest batch is timed for real.
const sql = createDb(testAppUrl);
const owner = ownerDb();
const logLines: string[] = [];
const capture = new Writable({
  write: (chunk, _enc, done) => {
    logLines.push(String(chunk));
    done();
  },
});
const app = createApp({ ...testPhotoDeps(), sql, logger: createLogger('debug', capture), trustProxy: 0, allowedOrigins: [TEST_ORIGIN], cookieSecure: false });

const P = 'bulk_http';
const PHONE = '01799999999';
const SENTINEL = 'ZZ-SENTINEL-93';

const row = (over: Record<string, unknown> = {}) => ({
  year: 2024,
  name: 'রহিমা খাতুন',
  division: 'রংপুর',
  district: 'কুড়িগ্রাম',
  upazila: 'উলিপুর',
  ...over,
});

let cookie = '';
let adminId = '';

beforeEach(async () => {
  await resetTestData(owner);
  logLines.length = 0;
  const session = await loginAdmin(app, owner);
  cookie = session.cookie;
  adminId = session.admin.id;
  await insertProject(owner, { key: P, is_published: false });
  await insertField(owner, { project_key: P, key: 'amount', type: 'money' });
  await insertField(owner, { project_key: P, key: 'size', type: 'number' });
  await insertField(owner, { project_key: P, key: 'phone', type: 'phone', visibility: 'admin' });
});
afterAll(() => Promise.all([sql.end(), owner.end()]));

const bulk = (method: 'post' | 'put', body: object, key = P) =>
  request(app)[method](`/api/v1/projects/${key}/records/bulk`).set('origin', TEST_ORIGIN).set('cookie', cookie).send(body);
const total = async () => (await owner<{ n: number }[]>`select count(*)::int as n from public.housing_beneficiaries where project_type = ${P}`)[0]!.n;

/** Nothing about the phone reaches the response, a log line or the activity log. */
async function expectNoPhone(body: unknown) {
  expect(JSON.stringify(body)).not.toContain(PHONE);
  expect(logLines.join('')).not.toContain(PHONE);
  const [{ hits } = { hits: -1 }] = await owner<{ hits: number }[]>`
    select count(*)::int as hits from public.housing_activity_log where details::text like ${'%' + PHONE + '%'}`;
  expect(hits).toBe(0);
}

describe('POST /api/v1/projects/:key/records/bulk', () => {
  it('inserts custom and private values into a draft project, logging each create with the admin', async () => {
    const rows = Array.from({ length: 200 }, (_, i) => row({ union_name: 'ধামশ্রেণী', extra: { amount: i + 1, phone: '01711222333' } }));
    const res = await bulk('post', { mode: 'assign_serial', rows });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { inserted: 200, failed: [] } });

    const [first] = await owner`select id, union_name, extra from public.housing_beneficiaries where project_type = ${P} and serial_no = 1`;
    expect(first).toMatchObject({ union_name: 'ধামশ্রেণী', extra: { amount: 1 } });
    const priv = await request(app).get(`/api/v1/records/${first!.id}/private`).set('cookie', cookie);
    expect(priv.body).toEqual({ data: { phone: '01711222333' } });
    const creates = await owner`select actor_id from public.housing_activity_log where action = 'create' and project_type = ${P}`;
    expect(creates).toHaveLength(200);
    expect(creates.every((e) => e.actor_id === adminId)).toBe(true);
  });

  it('refuses a serial already in the database with 409 naming the row', async () => {
    await insertRecord(sql, { project_type: P, serial_no: 7 });
    const res = await bulk('post', { mode: 'use_given_serial', rows: [row({ serial_no: 6 }), row({ serial_no: 7 })] });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'CONFLICT', details: { row_index: 1, field: 'serial_no' } });
    expect(await total()).toBe(1);
  });

  it('refuses a serial repeated in the batch, or missing under use_given_serial, with 400 naming the row', async () => {
    const dup = await bulk('post', { mode: 'use_given_serial', rows: [row({ serial_no: 3 }), row({ serial_no: 3 })] });
    expect(dup.status).toBe(400);
    expect(dup.body.error.details).toEqual({ row_index: 1, field: 'serial_no', reason: 'duplicate' });
    const missing = await bulk('post', { mode: 'use_given_serial', rows: [row({ serial_no: 3 }), row()] });
    expect(missing.body.error.details).toEqual({ row_index: 1, field: 'serial_no', reason: 'required' });
    expect(await total()).toBe(0);
  });

  it('names the row and field a database guard refused, and stores nothing', async () => {
    const rows = [row(), row(), row(), row({ extra: { amount: 10000000001 } })];
    const res = await bulk('post', { mode: 'assign_serial', rows });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', details: { row_index: 3, field: 'extra.amount' } });
    expect(await total()).toBe(0);
  });
});

describe('PUT /api/v1/projects/:key/records/bulk', () => {
  it('updates by serial, merges extra and lists unknown serials', async () => {
    await insertRecord(sql, { project_type: P, extra: { size: 3 } });
    const res = await bulk('put', { rows: [{ serial_no: 1, extra: { amount: 50 } }, { serial_no: 9 }] });
    expect(res.body).toEqual({ data: { updated: 1, missing: [9] } });
    const [rec] = await owner`select extra from public.housing_beneficiaries where project_type = ${P}`;
    expect(rec?.extra).toEqual({ size: 3, amount: 50 });
  });

  it('refuses clearing a required field with 400 naming the row', async () => {
    await owner`update public.housing_project_fields set required = true where project_key = ${P} and key = 'size'`;
    await insertRecord(sql, { project_type: P, extra: { size: 3 } });
    await insertRecord(sql, { project_type: P, extra: { size: 4 } });
    const res = await bulk('put', { rows: [{ serial_no: 1, name: 'নতুন' }, { serial_no: 2, _clear: ['extra.size'] }] });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual({ row_index: 1, field: 'extra.size' });
  });

  it.each([['name'], ['extra.Bad Key'], ['serial_no']])('refuses %j in _clear without echoing it', async (entry) => {
    const res = await bulk('put', { rows: [{ serial_no: 1, _clear: [entry] }] });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toMatchObject({ row_index: 0 });
    expect(JSON.stringify(res.body)).not.toContain('Bad Key');
  });

  it('treats an empty string as unchanged, so only _clear empties a value', async () => {
    await insertRecord(sql, { project_type: P, address: 'ঠিকানা', union_name: 'ধামশ্রেণী' });
    await bulk('put', { rows: [{ serial_no: 1, address: '', union_name: '', extra: { amount: '' } }] });
    const [rec] = await owner`select address, union_name, extra from public.housing_beneficiaries where project_type = ${P}`;
    expect(rec).toEqual({ address: 'ঠিকানা', union_name: 'ধামশ্রেণী', extra: {} });
  });
});

/** A body for either route: POST imports `rows` new, PUT updates them by serial. */
const bodyFor = (method: 'post' | 'put', rows: object[]) => (method === 'post' ? { mode: 'assign_serial', rows } : { rows });
const oneRow = (method: 'post' | 'put', extra: Record<string, unknown>) => bodyFor(method, [method === 'post' ? row({ extra }) : { serial_no: 1, extra }]);

describe('both bulk routes', () => {
  it.each(['post', 'put'] as const)('%s answers more than 500 rows with 413', async (method) => {
    const rows = Array.from({ length: 501 }, (_, i) => (method === 'post' ? row() : { serial_no: i + 1 }));
    const res = await bulk(method, bodyFor(method, rows));
    expect(res.status).toBe(413);
  });

  it('takes 500 rows with custom values within the statement timeout', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => row({ address: 'ক'.repeat(1000), extra: { amount: i, phone: '01711222333' } }));
    const res = await bulk('post', { mode: 'assign_serial', rows });
    expect(res.status).toBe(200);
    expect(res.body.data.inserted).toBe(500);
  }, 30_000);

  it('refuses a body over 10 MB with 413', async () => {
    const res = await bulk('post', { mode: 'assign_serial', rows: [row({ name: 'x'.repeat(10.5 * 1024 * 1024) })] });
    expect(res.status).toBe(413);
  });

  it('keeps the 100kb limit on the other project record writes', async () => {
    const res = await request(app)
      .post(`/api/v1/projects/${P}/records/private`)
      .set('origin', TEST_ORIGIN)
      .set('cookie', cookie)
      .send({ ids: [], pad: 'x'.repeat(200_000) });
    expect(res.status).toBe(413);
  });

  it.each(['post', 'put'] as const)('%s refuses an unknown extra key without echoing it', async (method) => {
    const res = await bulk(method, oneRow(method, { 'Bad Key!': 1 }));
    expect(res.status).toBe(400);
    expect(res.body.error.details).toMatchObject({ row_index: 0, field: 'extra' });
    expect(JSON.stringify(res.body)).not.toContain('Bad Key');
  });

  it('does not echo a malformed number value', async () => {
    const res = await bulk('post', { mode: 'assign_serial', rows: [row({ extra: { size: SENTINEL } })] });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain(SENTINEL);
  });

  it('keeps a private value out of the body, the logs and the activity log when a batch fails', async () => {
    const post = await bulk('post', {
      mode: 'assign_serial',
      rows: [row({ extra: { phone: PHONE } }), row({ extra: { phone: `${PHONE}x` } }), row({ extra: { amount: 1.5 } })],
    });
    expect(post.status).toBe(400);
    await expectNoPhone(post.body);

    await insertRecord(sql, { project_type: P });
    await insertRecord(sql, { project_type: P });
    const put = await bulk('put', { rows: [{ serial_no: 1, extra: { phone: PHONE } }, { serial_no: 2, extra: { amount: 1.5 } }] });
    expect(put.status).toBe(400);
    await expectNoPhone(put.body);
  });

  it.each(['post', 'put'] as const)('%s refuses a group with 400 and an unknown project with 404', async (method) => {
    await insertProject(owner, { key: 'bulk_grp', is_group: true });
    const body = bodyFor(method, [method === 'post' ? row() : { serial_no: 1 }]);
    expect((await bulk(method, body, 'bulk_grp')).status).toBe(400);
    expect((await bulk(method, body, 'no_such')).status).toBe(404);
  });

  it.each(['post', 'put'] as const)('%s checks the session before parsing the body', async (method) => {
    const malformed = (as?: string) => {
      const req = request(app)[method](`/api/v1/projects/${P}/records/bulk`).set('origin', TEST_ORIGIN).set('content-type', 'application/json');
      if (as) req.set('cookie', as);
      return req.send('{"rows": [');
    };
    expect((await malformed()).status).toBe(401);
    expect((await malformed(cookie)).body.error.details).toEqual({ reason: 'invalid_json' });
  });

  it('lets a plain admin bulk write', async () => {
    const plain = await loginAdmin(app, owner, { email: 'plain@example.org' });
    const res = await request(app)
      .post(`/api/v1/projects/${P}/records/bulk`)
      .set('origin', TEST_ORIGIN)
      .set('cookie', plain.cookie)
      .send({ mode: 'assign_serial', rows: [row()] });
    expect(res.status).toBe(200);
  });
});
