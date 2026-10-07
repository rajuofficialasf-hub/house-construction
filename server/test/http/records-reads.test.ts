// The single-record reads through the real app and test database: GET /projects/:key/records,
// …/records/serial/:n, …/records/serials and /records/:id (docs/api/PROJECTS_API_CONTRACT.md
// §4.4.1–§4.4.3). Visitors reach only public projects and public fields' values; an admin session
// also reaches drafts (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, U9).
import { Writable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { createDb, type Sql } from '../../src/db.js';
import { createLogger } from '../../src/logger.js';
import { pageMeta } from '../../src/housing/schemas.js';
import { projectRecord } from '../../src/records/schemas.js';
import { appDb, insertField, insertProject, insertRecord, ownerDb, resetTestData, type RecordInput } from '../support/db.js';
import { testAppUrl } from '../support/env.js';
import { loginAdmin, TEST_ORIGIN } from '../support/session.js';
import { testPhotoDeps } from '../support/storage.js';

const sql = appDb();
const owner = ownerDb();
const silent = new Writable({ write: (_chunk, _enc, done) => done() });
const PARTNER = 'https://partner.example.org';
const app = createApp({
  ...testPhotoDeps(),
  sql,
  logger: createLogger('info', silent),
  trustProxy: 0,
  allowedOrigins: [TEST_ORIGIN],
  publicReadOrigins: [PARTNER],
  cookieSecure: false,
});

const page = z.strictObject({ data: z.array(projectRecord), meta: pageMeta });
const one = z.strictObject({ data: projectRecord });
const many = z.strictObject({ data: z.array(projectRecord) });

const P = 'pub';
const ids: Record<string, string> = {};

beforeEach(async () => {
  await resetTestData(owner);
  await insertProject(owner, { key: P, geo_depth: 'union' });
  await insertField(owner, { project_key: P, key: 'tribe', type: 'category', filterable: true, searchable: true, sort_order: 10 });
  await insertField(owner, { project_key: P, key: 'amount', type: 'money', filterable: true, sort_order: 20 });
  await insertField(owner, { project_key: P, key: 'quiet', type: 'text', sort_order: 30 });
  await insertField(owner, { project_key: P, key: 'phone', type: 'phone', visibility: 'admin', sort_order: 40 });
  await insertField(owner, { project_key: P, key: 'gone', type: 'text', filterable: true, is_active: false, sort_order: 50 });

  ids.a = (await insertRecord(sql, { project_type: P, name: 'আলম', union_name: 'বজরা', extra: { tribe: 'সাঁওতাল', amount: 5000, quiet: 'চুপ' } })).id;
  ids.b = (await insertRecord(sql, { project_type: P, name: 'বকুল', union_name: 'থেতরাই', address: 'নদীর ধার', extra: { tribe: 'ওঁরাও', amount: 120000 } })).id;
  ids.c = (await insertRecord(sql, { project_type: P, name: 'চম্পা', father_or_husband_name: 'রহিম_%', extra: {} })).id;

  await insertProject(owner, { key: 'drafty', is_published: false });
  ids.draft = (await insertRecord(sql, { project_type: 'drafty' })).id;
  await insertProject(owner, { key: 'dgroup', is_group: true, is_published: false });
  await insertProject(owner, { key: 'dchild', parent_key: 'dgroup' });
  ids.child = (await insertRecord(sql, { project_type: 'dchild' })).id;
});
afterAll(() => Promise.all([sql.end(), owner.end()]));

const get = (path: string, cookie?: string) => {
  const req = request(app).get(`/api/v1${path}`);
  return cookie ? req.set('cookie', cookie) : req;
};
const namesOf = (body: unknown) => page.parse(body).data.map((r) => r.name);
const adminCookie = async () => (await loginAdmin(app, owner)).cookie;

describe('as a visitor', () => {
  it('lists a published project\'s records with union_name and extra, by serial', async () => {
    const res = await get(`/projects/${P}/records`);
    expect(res.status).toBe(200);
    const body = page.parse(res.body);
    expect(body.data.map((r) => r.name)).toEqual(['আলম', 'বকুল', 'চম্পা']);
    expect(body.data[0]).toMatchObject({ project_type: P, union_name: 'বজরা', extra: { tribe: 'সাঁওতাল', amount: 5000, quiet: 'চুপ' } });
    expect(body.meta).toEqual({ page: 1, page_size: 50, total: 3, total_pages: 1 });
    expect(res.headers.vary).toMatch(/Cookie/);
    expect(res.headers['cache-control']).toBeUndefined();
  });

  it.each([
    ['a draft', 'drafty', 'draft'],
    ['a published child of a draft group', 'dchild', 'child'],
  ])('gets 404 for every read of %s', async (_name, key, id) => {
    expect((await get(`/projects/${key}/records`)).status).toBe(404);
    expect((await get(`/projects/${key}/records/serial/1`)).status).toBe(404);
    expect((await get(`/projects/${key}/records/serials?nos=1`)).status).toBe(404);
    expect((await get(`/records/${ids[id]}`)).status).toBe(404);
  });

  it('gets 404, not 400, for a draft group, so it looks like an unknown key', async () => {
    expect((await get('/projects/dgroup/records')).status).toBe(404);
    expect((await get('/projects/nothing_here/records')).status).toBe(404);
  });

  it('gets 400 for a published group, which holds no records', async () => {
    const res = await get('/projects/housing/records');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('as an admin', () => {
  it('reads a draft\'s records, and the answer is never cached', async () => {
    const cookie = await adminCookie();
    const res = await get('/projects/drafty/records', cookie);
    expect(res.status).toBe(200);
    expect(page.parse(res.body).data).toHaveLength(1);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect((await get(`/records/${ids.child}`, cookie)).status).toBe(200);
    expect((await get('/projects/dchild/records/serial/1', cookie)).status).toBe(200);
  });
});

describe('extra for visitors holds only public fields', () => {
  beforeEach(async () => {
    // A private key stored in extra: the field guard refuses this change once values exist, so the
    // owner switches it off for the one update. The read must hide the key without relying on the guard.
    await owner.begin(async (tx) => {
      await tx`alter table public.housing_project_fields disable trigger housing_project_fields_guard`;
      await tx`update public.housing_project_fields set visibility = 'admin' where project_key = ${P} and key = 'quiet'`;
      await tx`alter table public.housing_project_fields enable trigger housing_project_fields_guard`;
    });
  });

  it('drops the key on the list, by id and by serial for a visitor, and keeps it for an admin', async () => {
    expect(page.parse((await get(`/projects/${P}/records`)).body).data[0]?.extra).toEqual({ tribe: 'সাঁওতাল', amount: 5000 });
    expect(one.parse((await get(`/records/${ids.a}`)).body).data.extra).toEqual({ tribe: 'সাঁওতাল', amount: 5000 });
    expect(many.parse((await get(`/projects/${P}/records/serials?nos=1`)).body).data[0]?.extra).not.toHaveProperty('quiet');
    expect(one.parse((await get(`/projects/${P}/records/serial/1`)).body).data.extra).not.toHaveProperty('quiet');
    const cookie = await adminCookie();
    expect(one.parse((await get(`/records/${ids.a}`, cookie)).body).data.extra).toHaveProperty('quiet', 'চুপ');
  });
});

describe('filters', () => {
  it('matches union_name exactly', async () => {
    expect(namesOf((await get(`/projects/${P}/records?union_name=${encodeURIComponent(' বজরা ')}`)).body)).toEqual(['আলম']);
  });

  it('matches a category value sent with extra spaces', async () => {
    const res = await get(`/projects/${P}/records?f.tribe=${encodeURIComponent('  ওঁরাও  ')}`);
    expect(namesOf(res.body)).toEqual(['বকুল']);
  });

  it('matches a money value as a number', async () => {
    expect(namesOf((await get(`/projects/${P}/records?f.amount=120000`)).body)).toEqual(['বকুল']);
  });

  it.each(['f.quiet=x', 'f.phone=017', 'f.gone=x', 'f.unknown=x', 'f.Bad-Key=x'])('ignores %s', async (filter) => {
    expect(namesOf((await get(`/projects/${P}/records?${filter}`)).body)).toEqual(['আলম', 'বকুল', 'চম্পা']);
  });

  it('refuses a non-number for a money filter, naming the filter', async () => {
    const res = await get(`/projects/${P}/records?f.amount=abc`);
    expect(res.status).toBe(400);
    expect(res.body.error.details.field).toBe('f.amount');
  });

  it('refuses more than 10 filters, and a repeated one', async () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `f.k${i}=x`).join('&');
    expect((await get(`/projects/${P}/records?${eleven}`)).status).toBe(400);
    expect((await get(`/projects/${P}/records?f.tribe=a&f.tribe=b`)).status).toBe(400);
  });
});

describe('search', () => {
  it('matches name, father\'s name and address', async () => {
    expect(namesOf((await get(`/projects/${P}/records?q=${encodeURIComponent('বকু')}`)).body)).toEqual(['বকুল']);
    expect(namesOf((await get(`/projects/${P}/records?q=${encodeURIComponent('রহিম')}`)).body)).toEqual(['চম্পা']);
    expect(namesOf((await get(`/projects/${P}/records?q=${encodeURIComponent('নদীর')}`)).body)).toEqual(['বকুল']);
  });

  it('matches a searchable field but not one that isn\'t', async () => {
    expect(namesOf((await get(`/projects/${P}/records?q=${encodeURIComponent('সাঁওতাল')}`)).body)).toEqual(['আলম']);
    expect(namesOf((await get(`/projects/${P}/records?q=${encodeURIComponent('চুপ')}`)).body)).toEqual([]);
  });

  it('matches % and _ literally', async () => {
    expect(namesOf((await get(`/projects/${P}/records?q=${encodeURIComponent('_%')}`)).body)).toEqual(['চম্পা']);
    expect(namesOf((await get(`/projects/${P}/records?q=${encodeURIComponent('%')}`)).body)).toEqual(['চম্পা']);
  });

  it('refuses a search over 100 characters', async () => {
    expect((await get(`/projects/${P}/records?q=${'x'.repeat(101)}`)).status).toBe(400);
  });
});

describe('sort', () => {
  it('sorts by a money field numerically with missing values last, both ways', async () => {
    expect(namesOf((await get(`/projects/${P}/records?sort=extra.amount`)).body)).toEqual(['আলম', 'বকুল', 'চম্পা']);
    expect(namesOf((await get(`/projects/${P}/records?sort=extra.amount&order=desc`)).body)).toEqual(['বকুল', 'আলম', 'চম্পা']);
  });

  it('falls back to serial_no for an unknown or private field', async () => {
    expect(namesOf((await get(`/projects/${P}/records?sort=extra.nope&order=desc`)).body)).toEqual(['আলম', 'বকুল', 'চম্পা']);
    expect(namesOf((await get(`/projects/${P}/records?sort=extra.phone&order=desc`)).body)).toEqual(['আলম', 'বকুল', 'চম্পা']);
  });

  it('sorts by union_name and name', async () => {
    // Unions: চম্পা has none, বকুল is in থেতরাই, আলম in বজরা; an empty union sorts first.
    expect(namesOf((await get(`/projects/${P}/records?sort=union_name`)).body)).toEqual(['চম্পা', 'বকুল', 'আলম']);
    // Names follow the database collation, so check the two directions mirror each other.
    const asc = namesOf((await get(`/projects/${P}/records?sort=name`)).body);
    expect(namesOf((await get(`/projects/${P}/records?sort=name&order=desc`)).body)).toEqual([...asc].reverse());
  });

  it('refuses a sort that is neither a column nor extra.<key>', async () => {
    expect((await get(`/projects/${P}/records?sort=password`)).status).toBe(400);
  });
});

describe('paging', () => {
  it('pages with the right meta, and an empty result has one page', async () => {
    const body = page.parse((await get(`/projects/${P}/records?page=2&page_size=2`)).body);
    expect(body.data.map((r) => r.name)).toEqual(['চম্পা']);
    expect(body.meta).toEqual({ page: 2, page_size: 2, total: 3, total_pages: 2 });
    expect(page.parse((await get('/projects/tin/records')).body).meta.total_pages).toBe(1);
  });

  it('refuses page_size 101', async () => {
    expect((await get(`/projects/${P}/records?page_size=101`)).status).toBe(400);
  });
});

describe('serials', () => {
  it('returns one record by serial, and 404 for a missing serial', async () => {
    expect(one.parse((await get(`/projects/${P}/records/serial/2`)).body).data.name).toBe('বকুল');
    expect((await get(`/projects/${P}/records/serial/99`)).status).toBe(404);
  });

  it('returns serials deduped in serial order, leaving out missing ones', async () => {
    const body = many.parse((await get(`/projects/${P}/records/serials?nos=3,1,3,99`)).body);
    expect(body.data.map((r) => r.serial_no)).toEqual([1, 3]);
  });

  it('refuses 101 serials', async () => {
    const nos = Array.from({ length: 101 }, (_, i) => i + 1).join(',');
    expect((await get(`/projects/${P}/records/serials?nos=${nos}`)).status).toBe(400);
  });
});

describe('errors', () => {
  it.each([
    ['a bad project key', '/projects/Bad-Key/records'],
    ['a bad uuid', '/records/not-a-uuid'],
    ['a serial that isn\'t a whole number', `/projects/${P}/records/serial/1.5`],
  ])('gives 400 for %s', async (_name, path) => {
    expect((await get(path)).status).toBe(400);
  });

  it('gives 404 for a record that doesn\'t exist', async () => {
    expect((await get('/records/00000000-0000-0000-0000-000000000000')).status).toBe(404);
  });
});

describe('read limit', () => {
  it('answers 429 past the per-IP limit across the record reads', async () => {
    const limited = createApp({
      ...testPhotoDeps(),
      sql,
      logger: createLogger('info', silent),
      trustProxy: 0,
      allowedOrigins: [TEST_ORIGIN],
      cookieSecure: false,
      readRateLimit: { windowMs: 60_000, limit: 1 },
    });
    expect((await request(limited).get(`/api/v1/projects/${P}/records`)).status).toBe(200);
    const over = await request(limited).get(`/api/v1/records/${ids.a}`);
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('mounting', () => {
  it('leaves an unknown path under /api/v1 a 404', async () => {
    expect((await get('/nothing')).status).toBe(404);
    expect((await request(app).post('/api/v1/nothing').set('origin', TEST_ORIGIN)).status).toBe(404);
  });
});

describe('public-read CORS', () => {
  it.each([`/projects/${P}/records`, `/projects/${P}/records/serial/1`, `/projects/${P}/records/serials?nos=1`, '/records/{a}'])(
    'lets a public-read origin GET %s without credentials',
    async (path) => {
      const res = await request(app).get(`/api/v1${path.replace('{a}', ids.a ?? '')}`).set('origin', PARTNER);
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe(PARTNER);
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    },
  );

  it('gives it no grant on a record\'s private values', async () => {
    const res = await request(app).get(`/api/v1/records/${ids.a}/private`).set('origin', PARTNER);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

// The base filters, search and query rules on a seeded project's list, as the old /housing list had them.
describe('the base filters and search', () => {
  const S = '/projects/semi_pucca/records';
  const serials = async (query: string) => page.parse((await get(`${S}?${query}`)).body).data.map((r) => r.serial_no);
  const insertMany = async (...inputs: RecordInput[]) => {
    for (const input of inputs) await insertRecord(sql, input);
  };

  it('filters by each place field and by several at once', async () => {
    await insertMany(
      { year: 2023, division: 'রংপুর', district: 'কুড়িগ্রাম', upazila: 'উলিপুর' },
      { year: 2024, division: 'রংপুর', district: 'লালমনিরহাট', upazila: 'সদর' },
      { year: 2024, division: 'ঢাকা', district: 'গাজীপুর', upazila: 'সদর' },
    );
    const enc = encodeURIComponent;
    expect(await serials('serial_no=2')).toEqual([2]);
    expect(await serials('year=2024')).toEqual([2, 3]);
    expect(await serials(`division=${enc('রংপুর')}`)).toEqual([1, 2]);
    expect(await serials(`district=${enc('গাজীপুর')}`)).toEqual([3]);
    expect(await serials(`upazila=${enc('সদর')}&year=2024&division=${enc('রংপুর')}`)).toEqual([2]);
    expect(page.parse((await get(`${S}?upazila=${enc('সদর')}`)).body).meta.total).toBe(2);
  });

  it('matches a filter typed in either Unicode form', async () => {
    // NFC keeps ড় as ড plus nukta; U+09DC is the single code point a keyboard may send instead.
    const stored = 'কুড়িগ্রাম'.normalize('NFC');
    const typed = stored.replace('\u09a1\u09bc', '\u09dc');
    expect(typed).not.toBe(stored);
    await insertRecord(sql, { district: stored });
    expect(await serials(`district=${encodeURIComponent(typed)}`)).toEqual([1]);
  });

  it('searches name, parent name and address, case-insensitively', async () => {
    await insertMany(
      { name: 'Rahima Khatun' },
      { name: 'অন্য', father_or_husband_name: 'Abdul RAHIM' },
      { name: 'অন্য', address: 'গ্রাম: rahimpur' },
      { name: 'কেউ না' },
    );
    expect(await serials('q=rahim')).toEqual([1, 2, 3]);
    expect(await serials(`q=${encodeURIComponent('রহিম')}`)).toEqual([]);
  });

  it('applies serial_no and q together', async () => {
    await insertMany({ name: 'করিম' }, { name: 'করিম' });
    expect(await serials(`q=${encodeURIComponent('করিম')}&serial_no=2`)).toEqual([2]);
  });

  it('matches a backslash in q literally', async () => {
    await insertMany({ name: 'a_b' }, { name: 'a\\b' }, { name: 'aXb' });
    expect(await serials(`q=${encodeURIComponent('a\\b')}`)).toEqual([2]);
  });

  it('sorts by year and created_at in both orders', async () => {
    await insertMany(
      { year: 2025, name: 'খ', created_at: new Date('2026-01-03T00:00:00Z') },
      { year: 2023, name: 'গ', created_at: new Date('2026-01-01T00:00:00Z') },
      { year: 2024, name: 'ক', created_at: new Date('2026-01-02T00:00:00Z') },
    );
    expect(await serials('order=desc')).toEqual([3, 2, 1]);
    expect(await serials('sort=year')).toEqual([2, 3, 1]);
    expect(await serials('sort=year&order=desc')).toEqual([1, 3, 2]);
    expect(await serials('sort=created_at')).toEqual([2, 3, 1]);
    expect(await serials('sort=created_at&order=desc')).toEqual([1, 3, 2]);
  });

  it('returns no rows past the end, with the real total', async () => {
    await insertMany({}, {}, {});
    expect(page.parse((await get(`${S}?page_size=2&page=9`)).body)).toEqual({ data: [], meta: { page: 9, page_size: 2, total: 3, total_pages: 2 } });
  });

  it.each([
    ['page_size=0', 'page_size'],
    ['page=1e3', 'page'],
    ['order=up', 'order'],
    ['year=2024&year=2025', 'year'],
  ])('refuses %s with a 400 naming the field', async (query, field) => {
    const res = await get(`${S}?${query}`);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'VALIDATION_ERROR', details: { field } } });
  });

  it('ignores unknown query params', async () => {
    expect((await get(`${S}?_=12345`)).status).toBe(200);
  });
});

describe('not found and bad serials', () => {
  it('answers 404 with the record message for an unknown id or serial', async () => {
    await insertRecord(sql, { project_type: 'tin' });
    for (const path of ['/records/00000000-0000-4000-8000-ffffffffffff', '/projects/tin/records/serial/2']) {
      const res = await get(path);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'রেকর্ড পাওয়া যায়নি' } });
    }
  });

  it.each(['/projects/tin/records/serials', '/projects/tin/records/serials?nos=1,a'])('refuses %s with a 400 naming nos', async (path) => {
    const res = await get(path);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'VALIDATION_ERROR', details: { field: 'nos' } } });
  });
});

describe('database failures', () => {
  const appWith = (db: Sql) =>
    createApp({ ...testPhotoDeps(), sql: db, logger: createLogger('info', silent), trustProxy: 0, allowedOrigins: [TEST_ORIGIN], cookieSecure: false });

  it('answer a generic 500 when the database is gone', async () => {
    const closed = createDb(testAppUrl);
    await closed.end();
    const res = await request(appWith(closed)).get('/api/v1/projects/semi_pucca/records');
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
          const res = await request(appWith(quick)).get('/api/v1/projects/semi_pucca/records');
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
