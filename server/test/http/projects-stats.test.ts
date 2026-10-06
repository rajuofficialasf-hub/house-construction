// GET /api/v1/projects/:key/stats and /projects/overview through the real app and test database
// (docs/api/PROJECTS_API_CONTRACT.md §4.1.2, §4.3). Visitors see published projects only, and a
// published group's stats and photo leave out its draft children; an admin session sees drafts
// (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, "P5 decisions").
import { Writable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/logger.js';
import { projectOverview, projectStats } from '../../src/projects/schemas.js';
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

const statsBody = z.strictObject({ data: projectStats });
const overviewBody = z.strictObject({ data: projectOverview });
const DRAFT_THUMB = 'http://api.test/api/v1/photos/draft-thumb';

beforeEach(async () => {
  await resetTestData(owner);
  await insertField(owner, { project_key: 'semi_pucca', key: 'amount', type: 'money' });
  await insertField(owner, { project_key: 'semi_pucca', key: 'trade', type: 'category' });
  await insertRecord(sql, { union_name: 'দলদলিয়া', extra: { amount: 5000, trade: 'দর্জি' } });
  await insertRecord(sql, { project_type: 'tin', extra: {} });
  // A draft child of the published housing group, holding the newest photo.
  await insertProject(owner, { key: 'draft_child', parent_key: 'housing', is_published: false, file_prefix: 'draftchild' });
  const draft = await insertRecord(sql, { project_type: 'draft_child', name: 'খসড়া' });
  await owner`update public.housing_beneficiaries
    set current_thumb_url = ${DRAFT_THUMB}, created_at = '2030-01-01T00:00:00Z' where id = ${draft.id}`;
  await insertProject(owner, { key: 'draft_one', is_published: false, file_prefix: 'draftone' });
});
afterAll(() => Promise.all([sql.end(), owner.end()]));

const get = (path: string, cookie?: string) => {
  const req = request(app).get(`/api/v1${path}`);
  return cookie ? req.set('cookie', cookie) : req;
};
const adminCookie = async () => (await loginAdmin(app, owner)).cookie;

describe('GET /api/v1/projects/:key/stats', () => {
  it('gives a visitor a published leaf\'s full stats, with unions and the category breakdown', async () => {
    const res = await get('/projects/semi_pucca/stats');
    expect(res.status).toBe(200);
    const { data } = statsBody.parse(res.body);
    expect(data.total).toBe(1);
    expect(data.by_union).toEqual({ 'কুড়িগ্রাম|উলিপুর|দলদলিয়া': 1 });
    expect(data.fields.trade).toEqual({ type: 'category', distinct: 1, by_value: { দর্জি: { n: 1, sums: { amount: 5000 } } } });
  });

  it('light=1 empties by_union and drops by_value', async () => {
    const { data } = statsBody.parse((await get('/projects/semi_pucca/stats?light=1')).body);
    expect(data.by_union).toEqual({});
    expect(data.fields.trade).toEqual({ type: 'category', distinct: 1 });
  });

  it('counts only a published group\'s published children for a visitor, and all of them for an admin', async () => {
    const visitor = statsBody.parse((await get('/projects/housing/stats')).body).data;
    expect(visitor.by_project).toEqual({ semi_pucca: 1, tin: 1 });
    const admin = statsBody.parse((await get('/projects/housing/stats', await adminCookie())).body).data;
    expect(admin.by_project).toEqual({ draft_child: 1, semi_pucca: 1, tin: 1 });
  });

  it('answers a draft and an unknown key the same 404 for a visitor', async () => {
    const draft = await get('/projects/draft_one/stats');
    const unknown = await get('/projects/no_such/stats');
    expect(draft.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(draft.body).toEqual(unknown.body);
  });

  it('gives an admin a draft\'s stats, never cached', async () => {
    const res = await get('/projects/draft_one/stats', await adminCookie());
    expect(res.status).toBe(200);
    expect(statsBody.parse(res.body).data.total).toBe(0);
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('refuses a bad light value or key with 400', async () => {
    expect((await get('/projects/semi_pucca/stats?light=yes')).status).toBe(400);
    expect((await get('/projects/Bad-Key/stats')).status).toBe(400);
  });
});

describe('GET /api/v1/projects/overview', () => {
  it('lists the published projects with light stats, ignoring drafts=1 for a visitor', async () => {
    const res = await get('/projects/overview?drafts=1');
    expect(res.status).toBe(200);
    const { data } = overviewBody.parse(res.body);
    expect(data.projects.map((p) => p.key)).toEqual(['housing', 'semi_pucca', 'tin']);
    expect(data.projects.every((p) => p.without_photo === null)).toBe(true);
    expect(data.projects.find((p) => p.key === 'semi_pucca')!.stats.by_union).toEqual({});
    expect(data.global).toEqual({ projects: 2, total: 2, districts: 1 });
  });

  it('never gives a visitor a draft child\'s photo through its published group', async () => {
    const res = await get('/projects/overview');
    expect(JSON.stringify(res.body)).not.toContain(DRAFT_THUMB);
    expect(overviewBody.parse(res.body).data.projects.find((p) => p.key === 'housing')!.featured).toBeNull();
  });

  it('shows an admin with drafts=1 the drafts, their photo and the photo-less counts', async () => {
    const res = await get('/projects/overview?drafts=1', await adminCookie());
    const { data } = overviewBody.parse(res.body);
    expect(data.projects.map((p) => p.key)).toEqual(expect.arrayContaining(['draft_child', 'draft_one']));
    const housing = data.projects.find((p) => p.key === 'housing')!;
    expect(housing.featured?.thumb_url).toBe(DRAFT_THUMB);
    expect(housing.without_photo).toBe(3);
    expect(data.global).toEqual({ projects: 2, total: 2, districts: 1 });
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('gives an admin without drafts=1 the visitor\'s view', async () => {
    const { data } = overviewBody.parse((await get('/projects/overview', await adminCookie())).body);
    expect(data.projects.map((p) => p.key)).toEqual(['housing', 'semi_pucca', 'tin']);
  });

  it('refuses an unknown drafts value with 400', async () => {
    expect((await get('/projects/overview?drafts=yes')).status).toBe(400);
  });
});

describe('public reads from another site', () => {
  it.each(['/projects/overview', '/projects/semi_pucca/stats'])('%s gets credential-less CORS and varies on the cookie', async (path) => {
    const res = await request(app).get(`/api/v1${path}`).set('origin', PARTNER);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(PARTNER);
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    expect(res.headers.vary).toMatch(/cookie/i);
  });

  it('never lets a partner page read a credentialed answer: an admin cookie sent from a partner origin gets no Access-Control-Allow-Credentials', async () => {
    const res = await request(app).get('/api/v1/projects/overview?drafts=1').set('origin', PARTNER).set('cookie', await adminCookie());
    // The session is read whatever the origin, so this body is the admin's. What keeps it from the partner page
    // is the browser: a credentialed request needs Access-Control-Allow-Credentials, which a public-read origin
    // never gets (and the session cookie is SameSite=Lax, so a cross-site fetch doesn't carry it).
    expect(res.headers['access-control-allow-origin']).toBe(PARTNER);
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });
});
