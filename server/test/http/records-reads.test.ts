// The single-record reads through the real app and test database: GET /projects/:key/records,
// …/records/serial/:n, …/records/serials and /records/:id (docs/api/PROJECTS_API_CONTRACT.md
// §4.4.1–§4.4.3). Visitors reach only public projects and public fields' values; an admin session
// also reaches drafts (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, U9).
import { Writable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/logger.js';
import { pageMeta } from '../../src/housing/schemas.js';
import { projectRecord } from '../../src/records/schemas.js';
import { appDb, insertField, insertProject, insertRecord, ownerDb, resetTestData } from '../support/db.js';
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
    // A field made private after it had values; P4's guard will forbid this, but the read must not rely on it.
    await owner`update public.housing_project_fields set visibility = 'admin' where project_key = ${P} and key = 'quiet'`;
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
