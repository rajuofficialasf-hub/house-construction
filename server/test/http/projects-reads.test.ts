// The project registry reads through the real app and test database: GET /api/v1/projects,
// /projects/:key and /projects/:key/fields (docs/api/PROJECTS_API_CONTRACT.md §4.1, §5.2).
// Visitors see only published projects and public fields; an admin session also sees drafts and
// private fields (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, R7, AE2).
import { Writable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/logger.js';
import { project, projectField } from '../../src/projects/schemas.js';
import { appDb, insertField, insertProject, ownerDb, resetTestData } from '../support/db.js';
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

const list = z.strictObject({ data: z.array(project) });
const one = z.strictObject({ data: project });
const fields = z.strictObject({ data: z.array(projectField) });

beforeEach(async () => {
  await resetTestData(owner);
  // A published project with one public and one private field, an archived field, and a draft.
  await insertProject(owner, { key: 'self_reliance', sort_order: 30 });
  await insertField(owner, { project_key: 'self_reliance', key: 'amount', type: 'money', sort_order: 10 });
  await insertField(owner, { project_key: 'self_reliance', key: 'phone', visibility: 'admin', sort_order: 20 });
  await insertField(owner, { project_key: 'self_reliance', key: 'old_note', is_active: false, sort_order: 30 });
  await insertProject(owner, { key: 'draft_one', is_published: false, sort_order: 40 });
  await insertField(owner, { project_key: 'draft_one', key: 'secret_count', type: 'number' });
});
afterAll(() => Promise.all([sql.end(), owner.end()]));

const get = (path: string, cookie?: string) => {
  const req = request(app).get(`/api/v1${path}`);
  return cookie ? req.set('cookie', cookie) : req;
};
const keysOf = (body: unknown) => list.parse(body).data.map((p) => p.key);
const adminCookie = async (input = {}) => (await loginAdmin(app, owner, input)).cookie;

describe('GET /api/v1/projects as a visitor', () => {
  it('lists published projects by sort_order then key, without fields unless asked', async () => {
    const res = await get('/projects');
    expect(res.status).toBe(200);
    // housing, semi_pucca (10) and tin (20) are seeded; the group and semi_pucca tie on 10.
    expect(keysOf(res.body)).toEqual(['housing', 'semi_pucca', 'tin', 'self_reliance']);
    expect(list.parse(res.body).data.every((p) => p.fields === undefined)).toBe(true);
  });

  it('leaves out drafts even with drafts=1', async () => {
    expect(keysOf((await get('/projects?drafts=1')).body)).not.toContain('draft_one');
  });

  it('leaves out a published sub-project of a draft group', async () => {
    await insertProject(owner, { key: 'hidden_group', is_group: true, is_published: false });
    await insertProject(owner, { key: 'hidden_child', parent_key: 'hidden_group', is_published: true });
    const keys = keysOf((await get('/projects?include=fields&drafts=1')).body);
    expect(keys).not.toContain('hidden_group');
    expect(keys).not.toContain('hidden_child');
  });

  it('embeds only public fields, archived ones included, in sort_order', async () => {
    const res = await get('/projects?include=fields');
    const selfReliance = list.parse(res.body).data.find((p) => p.key === 'self_reliance');
    expect(selfReliance?.fields?.map((f) => [f.key, f.is_active])).toEqual([
      ['amount', true],
      ['old_note', false],
    ]);
    expect(JSON.stringify(res.body)).not.toContain('phone');
  });

  it('gets a published project with its public fields, and 404s a draft', async () => {
    const res = await get('/projects/self_reliance');
    expect(res.status).toBe(200);
    expect(one.parse(res.body).data.fields?.map((f) => f.key)).toEqual(['amount', 'old_note']);
    expect((await get('/projects/draft_one')).status).toBe(404);
    expect((await get('/projects/draft_one/fields')).status).toBe(404);
  });

  it('lists a published project\'s public fields', async () => {
    const res = await get('/projects/self_reliance/fields');
    expect(fields.parse(res.body).data.map((f) => f.key)).toEqual(['amount', 'old_note']);
  });

  it('answers 404 for an unknown key and 400 for a malformed one', async () => {
    expect((await get('/projects/nope')).status).toBe(404);
    const bad = await get('/projects/Not-A-Key');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('answers 400 for an unknown include or drafts value', async () => {
    expect((await get('/projects?include=records')).status).toBe(400);
    expect((await get('/projects?drafts=yes')).status).toBe(400);
  });

  it('returns the contract shape, with numbers as numbers', async () => {
    await owner`update public.housing_project_fields set min_value = 0, max_value = 1000000 where key = 'amount'`;
    const res = await get('/projects/self_reliance');
    const amount = one.parse(res.body).data.fields?.find((f) => f.key === 'amount');
    expect(amount).toMatchObject({ min_value: 0, max_value: 1000000, type: 'money', visibility: 'public' });
  });
});

describe('GET /api/v1/projects with an admin session', () => {
  it('leaves out drafts from the list unless drafts=1', async () => {
    const cookie = await adminCookie();
    expect(keysOf((await get('/projects', cookie)).body)).not.toContain('draft_one');
    expect(keysOf((await get('/projects?drafts=1', cookie)).body)).toContain('draft_one');
  });

  it('includes private fields', async () => {
    const cookie = await adminCookie();
    const res = await get('/projects?include=fields', cookie);
    const selfReliance = list.parse(res.body).data.find((p) => p.key === 'self_reliance');
    expect(selfReliance?.fields?.map((f) => f.key)).toEqual(['amount', 'phone', 'old_note']);
  });

  it('gets a draft and its fields without a flag', async () => {
    const cookie = await adminCookie();
    const res = await get('/projects/draft_one', cookie);
    expect(res.status).toBe(200);
    expect(one.parse(res.body).data).toMatchObject({ key: 'draft_one', is_published: false });
    expect(fields.parse((await get('/projects/draft_one/fields', cookie)).body).data.map((f) => f.key)).toEqual(['secret_count']);
  });

  it('marks its answers private and uncacheable', async () => {
    const cookie = await adminCookie();
    for (const path of ['/projects', '/projects/self_reliance', '/projects/self_reliance/fields']) {
      expect((await get(path, cookie)).headers['cache-control']).toBe('private, no-store');
    }
  });

  it('treats a disabled admin\'s open session as a visitor', async () => {
    const { admin, cookie } = await loginAdmin(app, owner);
    await owner`update public.housing_admins set disabled_at = now() where id = ${admin.id}`;
    const res = await get('/projects?include=fields&drafts=1', cookie);
    expect(keysOf(res.body)).not.toContain('draft_one');
    expect(JSON.stringify(res.body)).not.toContain('phone');
    expect((await get('/projects/draft_one', cookie)).status).toBe(404);
  });
});

describe('caching for visitors', () => {
  it('varies on the cookie, since an admin gets a different body', async () => {
    const res = await get('/projects');
    expect(res.headers.vary).toMatch(/Cookie/);
    expect(res.headers['cache-control']).toBeUndefined();
  });
});

describe('public-read CORS', () => {
  it.each(['/projects', '/projects/self_reliance', '/projects/self_reliance/fields'])(
    'lets a public-read origin GET %s without credentials',
    async (path) => {
      const res = await request(app).get(`/api/v1${path}`).set('origin', PARTNER);
      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe(PARTNER);
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    },
  );

  it('gives it no grant for a path outside the list', async () => {
    const res = await request(app).get('/api/v1/projects/self_reliance/records').set('origin', PARTNER);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
