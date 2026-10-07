// GET /api/v1/projects/:key/stats with the list's filters, through the real app and test database.
// The filtered cards must count exactly what the list shows, so most cases compare with
// GET /projects/:key/records under the same query
// (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, P8b decisions, U48).
import { Writable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/logger.js';
import { projectStats } from '../../src/projects/schemas.js';
import { appDb, insertField, insertPrivate, insertProject, insertRecord, ownerDb, resetTestData } from '../support/db.js';
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

const statsBody = z.strictObject({ data: projectStats });
const get = (path: string, cookie?: string) => {
  const req = request(app).get(`/api/v1${path}`);
  return cookie ? req.set('cookie', cookie) : req;
};
const statsOf = async (key: string, query: string, cookie?: string) => {
  const res = await get(`/projects/${key}/stats?${query}`, cookie);
  expect(res.status).toBe(200);
  return statsBody.parse(res.body).data;
};
const listed = async (key: string, query: string) => {
  const res = await get(`/projects/${key}/records?page_size=100&${query}`);
  expect(res.status).toBe(200);
  return res.body as { data: { extra: Record<string, unknown>; division: string }[]; meta: { total: number } };
};
const q = (params: Record<string, string>) => new URLSearchParams(params).toString();

const P = 'fstats';

beforeEach(async () => {
  await resetTestData(owner);
  await insertProject(owner, { key: P, geo_depth: 'union' });
  await insertField(owner, { project_key: P, key: 'trade', type: 'category', filterable: true, searchable: true });
  await insertField(owner, { project_key: P, key: 'amount', type: 'money', filterable: true });
  await insertField(owner, { project_key: P, key: 'note', type: 'text' });
  await insertField(owner, { project_key: P, key: 'phone', visibility: 'admin' });
  const rows = [
    { name: 'রহিমা', year: 2024, division: 'রংপুর', district: 'কুড়িগ্রাম', upazila: 'উলিপুর', union_name: 'দলদলিয়া', extra: { trade: 'দর্জি', amount: 1000, note: 'গোপন-নয়' } },
    { name: 'করিম', year: 2024, division: 'রংপুর', district: 'কুড়িগ্রাম', upazila: 'উলিপুর', union_name: 'থেতরাই', extra: { trade: 'মুদি', amount: 2500 } },
    { name: 'সালমা_৫%', year: 2025, division: 'খুলনা', district: 'সাতক্ষীরা', upazila: 'শ্যামনগর', extra: { trade: 'দর্জি', amount: 400 } },
    { name: 'নাসির', year: 2025, division: 'খুলনা', district: 'সাতক্ষীরা', upazila: 'শ্যামনগর', father_or_husband_name: 'মৃত রহিম', extra: { trade: 'হাঁস' } },
  ];
  for (const row of rows) {
    const rec = await insertRecord(sql, { project_type: P, ...row });
    await insertPrivate(sql, rec.id, { phone: '01700000000' });
  }
});
afterAll(() => Promise.all([sql.end(), owner.end()]));

describe('filtered stats agree with the list', () => {
  const cases: Record<string, string>[] = [
    { year: '2024' },
    { division: 'খুলনা' },
    { district: 'কুড়িগ্রাম' },
    { upazila: 'শ্যামনগর' },
    { union_name: 'দলদলিয়া' },
    { 'f.trade': 'দর্জি' },
    { 'f.amount': '2500' },
    { q: 'রহিম' },
    { q: 'হাঁস' },
    { year: '2025', district: 'সাতক্ষীরা', q: 'সালমা' },
  ];
  for (const params of cases) {
    it(`counts what the list shows for ${JSON.stringify(params)}`, async () => {
      const stats = await statsOf(P, q(params));
      const list = await listed(P, q(params));
      expect(stats.filtered).toBe(true);
      expect(stats.total).toBe(list.meta.total);
      const amounts = list.data.map((r) => r.extra.amount).filter((v): v is number => typeof v === 'number');
      expect(stats.fields.amount).toEqual({ type: 'money', sum: amounts.reduce((a, b) => a + b, 0), count: amounts.length });
      const trades = new Set(list.data.map((r) => r.extra.trade).filter((v) => typeof v === 'string' && v !== ''));
      expect(stats.fields.trade).toEqual({ type: 'category', distinct: trades.size });
      expect(stats.distinct.divisions).toBe(new Set(list.data.map((r) => r.division)).size);
      expect(stats.by_project).toEqual({ [P]: list.meta.total });
    });
  }

  it('has main\'s filtered shape: the by_ counts are empty and text fields are not counted', async () => {
    const stats = await statsOf(P, q({ year: '2024' }));
    expect(stats).toMatchObject({ by_year: {}, by_division: {}, by_district: {}, by_upazila: {}, by_location: {}, by_union: {} });
    expect(stats.distinct).toEqual({ divisions: 1, districts: 1, upazilas: 1, unions: 2 });
    expect(Object.keys(stats.fields).sort()).toEqual(['amount', 'trade']);
  });

  it('answers the unfiltered stats exactly as before when no filter is given, or only blanks', async () => {
    const plain = await get(`/projects/${P}/stats`);
    const blanks = await get(`/projects/${P}/stats?${q({ q: '  ', division: '', 'f.trade': ' ' })}`);
    expect(blanks.body).toEqual(plain.body);
    expect(plain.body.data).not.toHaveProperty('filtered');
  });
});

describe('filtered stats refuse what the list refuses', () => {
  it('is 400 for an invalid money filter, an out-of-range year, an over-long q and too many field filters', async () => {
    expect((await get(`/projects/${P}/stats?${q({ 'f.amount': 'বারো' })}`)).status).toBe(400);
    expect((await get(`/projects/${P}/stats?${q({ year: '1800' })}`)).status).toBe(400);
    expect((await get(`/projects/${P}/stats?${q({ q: 'ক'.repeat(101) })}`)).status).toBe(400);
    const many = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`f.k${i}`, 'x']));
    expect((await get(`/projects/${P}/stats?${q(many)}`)).status).toBe(400);
  });
});

describe('filtered stats never reveal what a visitor may not see', () => {
  it('ignores a private or non-filterable field filter, so the counts equal the unfiltered ones', async () => {
    const all = await statsOf(P, q({ year: '2024' }));
    expect(await statsOf(P, q({ year: '2024', 'f.phone': '01700000000' }))).toEqual(all);
    expect(await statsOf(P, q({ year: '2024', 'f.note': 'গোপন-নয়' }))).toEqual(all);
  });

  it('never searches a private value, and treats %, _ and \\ literally', async () => {
    expect((await statsOf(P, q({ q: '01700000000' }))).total).toBe(0);
    expect((await statsOf(P, q({ q: '_' }))).total).toBe(1);
    expect((await statsOf(P, q({ q: '%' }))).total).toBe(1);
    expect((await statsOf(P, q({ q: '\\' }))).total).toBe(0);
  });

  it('is 404 for a draft project to a visitor, and filters it for an admin', async () => {
    await insertProject(owner, { key: 'fdraft', is_published: false, file_prefix: 'fdraft' });
    await insertRecord(sql, { project_type: 'fdraft', year: 2024 });
    expect((await get(`/projects/fdraft/stats?${q({ year: '2024' })}`)).status).toBe(404);
    const cookie = (await loginAdmin(app, owner)).cookie;
    expect((await statsOf('fdraft', q({ year: '2024' }), cookie)).total).toBe(1);
  });

  describe('a group', () => {
    beforeEach(async () => {
      await insertProject(owner, { key: 'fgroup', is_group: true, file_prefix: null });
      await insertProject(owner, { key: 'fg_a', parent_key: 'fgroup', file_prefix: 'fga' });
      await insertProject(owner, { key: 'fg_b', parent_key: 'fgroup', file_prefix: 'fgb' });
      await insertProject(owner, { key: 'fg_draft', parent_key: 'fgroup', is_published: false, file_prefix: 'fgd' });
      for (const leaf of ['fg_a', 'fg_b', 'fg_draft']) {
        await insertField(owner, { project_key: leaf, key: 'kind', type: 'category', filterable: true });
      }
      // Public in one leaf, private in the other: the key must not narrow either.
      await insertField(owner, { project_key: 'fg_a', key: 'secret', type: 'category', filterable: true });
      await insertField(owner, { project_key: 'fg_b', key: 'secret', type: 'category', visibility: 'admin' });
      // The same key with different types in two leaves is ignored too.
      await insertField(owner, { project_key: 'fg_a', key: 'size', type: 'number', filterable: true });
      await insertField(owner, { project_key: 'fg_b', key: 'size', type: 'category', filterable: true });
      await insertRecord(sql, { project_type: 'fg_a', year: 2024, extra: { kind: 'ক', secret: 'হ্যাঁ', size: 3 } });
      const b = await insertRecord(sql, { project_type: 'fg_b', year: 2024, extra: { kind: 'খ', size: 'বড়' } });
      await insertPrivate(sql, b.id, { secret: 'হ্যাঁ' });
      await insertRecord(sql, { project_type: 'fg_draft', year: 2024, extra: { kind: 'গ' } });
    });

    it('counts only the published leaves for a visitor, even when the filter matches only the draft', async () => {
      expect((await statsOf('fgroup', q({ year: '2024' }))).by_project).toEqual({ fg_a: 1, fg_b: 1 });
      expect((await statsOf('fgroup', q({ 'f.kind': 'গ' }))).total).toBe(0);
      const cookie = (await loginAdmin(app, owner)).cookie;
      expect((await statsOf('fgroup', q({ 'f.kind': 'গ' }), cookie)).total).toBe(1);
    });

    it('uses a field only if every counted leaf has it public with the same type', async () => {
      const all = await statsOf('fgroup', q({ year: '2024' }));
      expect(all.total).toBe(2);
      expect(Object.keys(all.fields)).toEqual(['kind']);
      expect(await statsOf('fgroup', q({ year: '2024', 'f.secret': 'হ্যাঁ' }))).toEqual(all);
      expect(await statsOf('fgroup', q({ year: '2024', 'f.size': '3' }))).toEqual(all);
      expect((await statsOf('fgroup', q({ 'f.kind': 'ক' }))).total).toBe(1);
    });
  });
});

describe('filtered stats as a public read', () => {
  it('serves a partner origin without credentials, and an admin with no-store', async () => {
    const res = await get(`/projects/${P}/stats?${q({ year: '2024' })}`).set('origin', PARTNER);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(PARTNER);
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    const cookie = (await loginAdmin(app, owner)).cookie;
    expect((await get(`/projects/${P}/stats?${q({ year: '2024' })}`, cookie)).headers['cache-control']).toBe('private, no-store');
  });
});
