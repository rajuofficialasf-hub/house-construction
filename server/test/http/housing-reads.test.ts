import { Writable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../../src/auth/password.js';
import { createApp, type AppDeps } from '../../src/app.js';
import { createDb } from '../../src/db.js';
import { filterOptions, housingRecord, housingStats, nextSerial, pageMeta } from '../../src/housing/schemas.js';
import { createLogger } from '../../src/logger.js';
import { z } from 'zod';
import { appDb, insertAdmin, insertRecord, ownerDb, resetTestData } from '../support/db.js';
import { testAppUrl } from '../support/env.js';
import { testPhotoDeps } from '../support/storage.js';

// The public reads under /api/v1/housing through the real app and test database
// (docs/api/API_CONTRACT.md §4). No request here sends an Origin or a cookie unless it says so.

const sql = appDb();
const owner = ownerDb();
const ORIGIN = 'http://localhost:5173';
const silent = new Writable({ write: (_chunk, _enc, done) => done() });

function makeApp(overrides: Partial<AppDeps> = {}) {
  return createApp({ ...testPhotoDeps(), sql, logger: createLogger('info', silent), trustProxy: 0, allowedOrigins: [ORIGIN], cookieSecure: false, ...overrides });
}

let app = makeApp();
let records: { id: string; serial_no: number }[] = [];

beforeEach(async () => {
  app = makeApp();
  await resetTestData(owner);
  records = [
    await insertRecord(sql, { year: 2023, name: 'রহিমা খাতুন', division: 'রংপুর', district: 'কুড়িগ্রাম', upazila: 'উলিপুর' }),
    await insertRecord(sql, { year: 2024, name: 'আব্দুল হালিম', division: 'খুলনা', district: 'বাগেরহাট', upazila: 'মোংলা' }),
    await insertRecord(sql, { project_type: 'tin', year: 2025, name: 'শেফালী বেগম', division: 'ঢাকা', district: 'গাজীপুর', upazila: 'সদর' }),
  ];
});
afterAll(() => Promise.all([sql.end(), owner.end()]));

const get = (path: string, target = app) => request(target).get(`/api/v1/housing${path}`);
const page = z.strictObject({ data: z.array(housingRecord), meta: pageMeta });
const one = z.strictObject({ data: housingRecord });
const many = z.strictObject({ data: z.array(housingRecord) });

describe('GET /api/v1/housing', () => {
  it('returns a page of contract records with meta', async () => {
    const res = await get('?page_size=2');
    expect(res.status).toBe(200);
    const body = page.parse(res.body);
    expect(body.meta).toEqual({ page: 1, page_size: 2, total: 3, total_pages: 2 });
    expect(body.data.map((r) => `${r.project_type}:${r.serial_no}`)).toEqual(['semi_pucca:1', 'tin:1']);
  });

  it('filters, searches and sorts from the query string', async () => {
    const res = await get(`?q=${encodeURIComponent('হালিম')}&division=${encodeURIComponent('খুলনা')}&sort=year&order=desc`);
    expect(page.parse(res.body).data.map((r) => r.name)).toEqual(['আব্দুল হালিম']);
  });

  it.each([
    ['page_size=101', 'page_size'],
    ['page_size=0', 'page_size'],
    ['page=1e3', 'page'],
    ['sort=address', 'sort'],
    ['order=up', 'order'],
    ['year=2024&year=2025', 'year'],
    ['project_type=brick', 'project_type'],
    [`q=${'a'.repeat(101)}`, 'q'],
  ])('refuses %s with a 400 naming the field', async (query, field) => {
    const res = await get(`?${query}`);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'VALIDATION_ERROR', details: { field } } });
  });

  it('ignores unknown query params', async () => {
    expect((await get('?_=12345')).status).toBe(200);
  });
});

describe('single records', () => {
  it('returns one record by id and by serial', async () => {
    const byId = one.parse((await get(`/${records[0]?.id}`)).body);
    expect(byId.data).toMatchObject({ id: records[0]?.id, serial_no: 1, name: 'রহিমা খাতুন' });
    const bySerial = one.parse((await get('/tin/serial/1')).body);
    expect(bySerial.data).toMatchObject({ id: records[2]?.id, project_type: 'tin' });
  });

  it('returns the found serials in order and omits missing ones', async () => {
    const body = many.parse((await get('/semi_pucca/serials?nos=2,99,1,2')).body);
    expect(body.data.map((r) => r.serial_no)).toEqual([1, 2]);
  });

  it('answers 404 for an unknown id or serial', async () => {
    for (const path of ['/00000000-0000-4000-8000-ffffffffffff', '/tin/serial/2']) {
      const res = await get(path);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'রেকর্ড পাওয়া যায়নি' } });
    }
  });

  it.each([
    ['/not-a-uuid', 'id'],
    ['/brick/serial/1', 'project_type'],
    ['/tin/serial/0', 'serial_no'],
    ['/tin/serials', 'nos'],
    ['/tin/serials?nos=1,a', 'nos'],
    [`/tin/serials?nos=${Array.from({ length: 101 }, (_, i) => i + 1).join(',')}`, 'nos'],
  ])('refuses %s with a 400 naming the field', async (path, field) => {
    const res = await get(path);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'VALIDATION_ERROR', details: { field } } });
  });
});

describe('aggregates', () => {
  it('reach their own handlers, not the /:id route', async () => {
    const stats = housingStats.parse((await get('/stats')).body.data);
    expect(stats).toMatchObject({ total: 3, by_year: { '2023': 1, '2024': 1, '2025': 1 } });
    expect((await get('/years')).body).toEqual({ data: [2025, 2024, 2023] });
    expect(nextSerial.parse((await get('/next-serial?project_type=semi_pucca')).body.data)).toEqual({ project_type: 'semi_pucca', next_serial: 3 });
    expect(filterOptions.parse((await get('/filter-options')).body.data)).toEqual({
      years: [2025, 2024, 2023],
      divisions: ['খুলনা', 'ঢাকা', 'রংপুর'],
      districts: ['কুড়িগ্রাম', 'গাজীপুর', 'বাগেরহাট'],
      upazilas: ['উলিপুর', 'মোংলা', 'সদর'],
    });
  });

  it('narrow to one project type', async () => {
    expect((await get('/stats?project_type=tin')).body.data).toMatchObject({ total: 1 });
    expect((await get('/years?project_type=semi_pucca')).body).toEqual({ data: [2024, 2023] });
    expect((await get('/filter-options?project_type=tin')).body.data).toMatchObject({ divisions: ['ঢাকা'] });
  });

  it.each(['/stats?project_type=x', '/years?project_type=x', '/filter-options?project_type=x', '/next-serial', '/next-serial?project_type=x'])(
    'refuses %s with a 400 on project_type',
    async (path) => {
      const res = await get(path);
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: { code: 'VALIDATION_ERROR', details: { field: 'project_type' } } });
    },
  );
});

describe('public access', () => {
  it('gives the same body with and without an admin session', async () => {
    const password = 'correct horse battery staple';
    await insertAdmin(owner, { passwordHash: await hashPassword(password) });
    const login = await request(app).post('/api/v1/auth/login').set('origin', ORIGIN).send({ email: 'admin@example.org', password });
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0]?.split(';')[0] as string;
    expect((await request(app).get('/api/v1/auth/me').set('cookie', cookie)).status).toBe(200);

    for (const path of ['', `/${records[0]?.id}`, '/tin/serial/1', '/semi_pucca/serials?nos=1,2', '/stats', '/years', '/filter-options', '/next-serial?project_type=tin']) {
      const anonymous = await get(path);
      const loggedIn = await get(path).set('cookie', cookie);
      expect(anonymous.status).toBe(200);
      expect(loggedIn.body).toEqual(anonymous.body);
    }
  });

  it('rate-limits reads per IP', async () => {
    const limited = makeApp({ readRateLimit: { windowMs: 60_000, limit: 3 } });
    for (let i = 0; i < 3; i++) expect((await get('/years', limited)).status).toBe(200);
    const res = await get('/years', limited);
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ error: { code: 'RATE_LIMITED' } });
  });
});

describe('database failures', () => {
  it('answer a generic 500 when the database is gone', async () => {
    const closed = createDb(testAppUrl);
    await closed.end();
    const res = await get('', makeApp({ sql: closed }));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'সার্ভারে সমস্যা হয়েছে' } });
  });

  it('cancel a query that passes the statement timeout instead of hanging', async () => {
    const quick = createDb(testAppUrl, { statementTimeoutMs: 100 });
    try {
      await expect(
        owner.begin(async (tx) => {
          // Holding this lock makes the list query wait, so the timeout fires without relying on timing.
          await tx`lock table public.housing_beneficiaries in access exclusive mode`;
          const res = await get('', makeApp({ sql: quick }));
          expect(res.status).toBe(500);
          expect(res.body).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
    } finally {
      await quick.end();
    }
  });

  it('use a 5 second statement timeout by default', async () => {
    const db = createDb(testAppUrl);
    try {
      expect(await db`show statement_timeout`).toEqual([{ statement_timeout: '5s' }]);
    } finally {
      await db.end();
    }
  });
});
