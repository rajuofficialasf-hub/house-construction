import { Writable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createDb } from '../../src/db.js';
import { bulkInsertResult, bulkUpdateResult } from '../../src/housing/schemas.js';
import { createLogger } from '../../src/logger.js';
import { insertRecord, ownerDb, resetTestData } from '../support/db.js';
import { testAppUrl } from '../support/env.js';
import { loginAdmin, TEST_ORIGIN } from '../support/session.js';
import { testPhotoDeps } from '../support/storage.js';

// POST and PUT /api/v1/housing/bulk through the real app and test database
// (docs/api/API_CONTRACT.md §4.9, §4.9খ): all-or-nothing import, update by serial, the 500-row cap
// and the bulk route's own 10 MB body limit, which only an admin session can reach.

// The API's own pool, with its 5 s statement timeout, so the largest batch is timed for real.
const sql = createDb(testAppUrl);
const owner = ownerDb();
const silent = new Writable({ write: (_chunk, _enc, done) => done() });
const app = createApp({ ...testPhotoDeps(), sql, logger: createLogger('info', silent), trustProxy: 0, allowedOrigins: [TEST_ORIGIN], cookieSecure: false });

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
  const session = await loginAdmin(app, owner);
  cookie = session.cookie;
  adminId = session.admin.id;
});
afterAll(() => Promise.all([sql.end(), owner.end()]));

const bulk = (method: 'post' | 'put', body: object, as = cookie, origin = TEST_ORIGIN) => {
  const req = request(app)[method]('/api/v1/housing/bulk').set('origin', origin);
  if (as) req.set('cookie', as);
  return req.send(body);
};
const total = async () => (await owner<{ n: number }[]>`select count(*)::int as n from public.housing_beneficiaries`)[0]!.n;
const serials = async (projectType = 'tin') =>
  (await owner<{ serial_no: number; name: string }[]>`
    select serial_no, name from public.housing_beneficiaries where project_type = ${projectType} order by serial_no`);

describe('POST /api/v1/housing/bulk', () => {
  it('assign_serial numbers the rows in order from the next serial', async () => {
    await insertRecord(sql, { project_type: 'tin' });
    const res = await bulk('post', { project_type: 'tin', mode: 'assign_serial', rows: [row({ name: 'ক' }), row({ name: 'খ', serial_no: 99 }), row({ name: 'গ' })] });
    expect(res.status).toBe(200);
    expect(bulkInsertResult.parse(res.body.data)).toEqual({ inserted: 3, failed: [] });
    expect((await serials()).slice(1)).toEqual([
      { serial_no: 2, name: 'ক' },
      { serial_no: 3, name: 'খ' },
      { serial_no: 4, name: 'গ' },
    ]);
  });

  it('use_given_serial keeps the serials and raises the counter past the largest', async () => {
    const res = await bulk('post', { project_type: 'tin', mode: 'use_given_serial', rows: [row({ serial_no: 100 }), row({ serial_no: 105 })] });
    expect(res.body.data).toEqual({ inserted: 2, failed: [] });
    expect((await request(app).get('/api/v1/housing/next-serial?project_type=tin')).body.data.next_serial).toBe(106);
  });

  it('refuses a serial already in the database with 409 naming the row, and writes nothing', async () => {
    await insertRecord(sql, { project_type: 'tin', serial_no: 7 });
    const res = await bulk('post', { project_type: 'tin', mode: 'use_given_serial', rows: [row({ serial_no: 6 }), row({ serial_no: 7 })] });
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      code: 'CONFLICT',
      message: 'serial_no 7 আগে থেকেই আছে',
      details: { row_index: 1, field: 'serial_no', reason: 'duplicate' },
    });
    expect(await total()).toBe(1);
  });

  it('refuses a serial repeated in the batch with 400 naming the row', async () => {
    const res = await bulk('post', { project_type: 'tin', mode: 'use_given_serial', rows: [row({ serial_no: 3 }), row({ serial_no: 3 })] });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual({ row_index: 1, field: 'serial_no', reason: 'duplicate' });
    expect(await total()).toBe(0);
  });

  it('refuses the whole batch for one invalid row', async () => {
    const res = await bulk('post', { project_type: 'tin', mode: 'assign_serial', rows: [row(), row({ year: 1999 }), row()] });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toMatchObject({ row_index: 1, field: 'year' });
    expect(await total()).toBe(0);
  });

  it('logs one create per row with the admin', async () => {
    await bulk('post', { project_type: 'tin', mode: 'assign_serial', rows: [row(), row()] });
    const log = await owner<{ action: string; actor_id: string }[]>`select action, actor_id from public.housing_activity_log order by id`;
    expect(log.filter((e) => e.action === 'create')).toEqual([
      { action: 'create', actor_id: adminId },
      { action: 'create', actor_id: adminId },
    ]);
  });

  it('refuses no rows with 400 and more than 500 with 413', async () => {
    expect((await bulk('post', { project_type: 'tin', mode: 'assign_serial', rows: [] })).status).toBe(400);
    const res = await bulk('post', { project_type: 'tin', mode: 'assign_serial', rows: Array.from({ length: 501 }, () => row()) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(await total()).toBe(0);
  });

  it('takes 500 rows with every field at its cap in Bangla (about 8.5 MB) within the statement timeout', async () => {
    const full = (n: number) => 'ক'.repeat(n);
    const rows = Array.from({ length: 500 }, () =>
      row({
        name: full(200),
        father_or_husband_name: full(200),
        division: full(100),
        district: full(100),
        upazila: full(100),
        address: full(1000),
        prev_photo_source: full(2000),
        current_photo_source: full(2000),
      }),
    );
    expect(Buffer.byteLength(JSON.stringify({ rows }))).toBeGreaterThan(8_000_000);
    const res = await bulk('post', { project_type: 'tin', mode: 'assign_serial', rows });
    expect(res.status).toBe(200);
    expect(res.body.data.inserted).toBe(500);
  }, 30_000);

  it('refuses a body over 10 MB with 413', async () => {
    const res = await bulk('post', { project_type: 'tin', mode: 'assign_serial', rows: [row({ name: 'x'.repeat(10.5 * 1024 * 1024) })] });
    expect(res.status).toBe(413);
  });

  it('keeps the 100kb limit on every other write', async () => {
    const res = await request(app)
      .post('/api/v1/housing')
      .set('origin', TEST_ORIGIN)
      .set('cookie', cookie)
      .send({ project_type: 'tin', ...row({ address: 'x'.repeat(200_000) }) });
    expect(res.status).toBe(413);
  });
});

describe('PUT /api/v1/housing/bulk', () => {
  it('updates the given fields, leaves the rest, and lists unknown serials as missing', async () => {
    await insertRecord(sql, { project_type: 'tin', address: 'অপরিবর্তিত', name: 'পুরনো' });
    const res = await bulk('put', { project_type: 'tin', rows: [{ serial_no: 1, name: 'নতুন', division: '  ' }, { serial_no: 900 }] });
    expect(res.status).toBe(200);
    expect(bulkUpdateResult.parse(res.body.data)).toEqual({ updated: 1, missing: [900] });
    const [rec] = await owner<{ name: string; address: string; division: string }[]>`
      select name, address, division from public.housing_beneficiaries`;
    expect(rec).toEqual({ name: 'নতুন', address: 'অপরিবর্তিত', division: 'রংপুর' });
  });

  it('leaves the address unchanged on an empty string', async () => {
    await insertRecord(sql, { project_type: 'tin', address: 'অপরিবর্তিত' });
    await bulk('put', { project_type: 'tin', rows: [{ serial_no: 1, address: '' }] });
    const [rec] = await owner<{ address: string }[]>`select address from public.housing_beneficiaries`;
    expect(rec?.address).toBe('অপরিবর্তিত');
  });

  it('refuses a row without serial_no with 400 naming it, and more than 500 rows with 413', async () => {
    const missing = await bulk('put', { project_type: 'tin', rows: [{ serial_no: 1 }, { name: 'x' }] });
    expect(missing.status).toBe(400);
    expect(missing.body.error.details).toMatchObject({ row_index: 1, field: 'serial_no' });
    const many = await bulk('put', { project_type: 'tin', rows: Array.from({ length: 501 }, (_, i) => ({ serial_no: i + 1 })) });
    expect(many.status).toBe(413);
  });
});

describe('who may bulk-write', () => {
  // Malformed JSON tells the order apart without uploading megabytes: a parser that ran first
  // would answer 400 invalid_json, while the admin check answers 401 before any byte is parsed.
  const malformed = (method: 'post' | 'put', as = '') => {
    const req = request(app)[method]('/api/v1/housing/bulk').set('origin', TEST_ORIGIN).set('content-type', 'application/json');
    if (as) req.set('cookie', as);
    return req.send('{"rows": [');
  };

  it.each(['post', 'put'] as const)('checks the session on %s before parsing the body', async (method) => {
    expect((await malformed(method)).status).toBe(401);
    // With a session the same body reaches the parser.
    expect((await malformed(method, cookie)).body.error.details).toEqual({ reason: 'invalid_json' });
  });

  it.each([
    ['disabled', () => owner`update public.housing_admins set disabled_at = now()`],
    ['expired', () => owner`update public.housing_admin_sessions set expires_at = now() - interval '1 second'`],
  ])('refuses a %s session before parsing the body', async (_state, end) => {
    await end();
    expect((await malformed('post', cookie)).status).toBe(401);
    expect((await malformed('put', cookie)).status).toBe(401);
  });

  it.each(['post', 'put'] as const)('refuses %s with an admin cookie but no or another Origin with 403', async (method) => {
    expect((await request(app)[method]('/api/v1/housing/bulk').set('cookie', cookie).send({ project_type: 'tin', mode: 'assign_serial', rows: [row()] })).status).toBe(403);
    expect((await bulk(method, { project_type: 'tin', mode: 'assign_serial', rows: [row()] }, cookie, 'https://partner.example.org')).status).toBe(403);
    expect(await total()).toBe(0);
  });

  it('reaches the bulk handler, not the /:id route', async () => {
    const res = await bulk('put', { project_type: 'tin', rows: [{ serial_no: 1 }] });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ updated: 0, missing: [1] });
  });
});
