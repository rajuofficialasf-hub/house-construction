// The project registry writes through the real app and test database: POST /projects,
// PATCH /projects/:key with If-Match, DELETE /projects/:key and PUT /projects/order
// (docs/api/PROJECTS_API_CONTRACT.md §4.1). The guards' rule matrix is tested in
// test/db/project-guards.test.ts; these tests prove what the routes add: status codes, the field
// in details, who may call, If-Match and the logged actor
// (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, U22).
import { Writable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { requireAdmin, requireMainAdmin, requireMainAdminForCovers } from '../../src/auth/middleware.js';
import { createLogger } from '../../src/logger.js';
import { project } from '../../src/projects/schemas.js';
import { projectsAdminRouter } from '../../src/routes/v1/projects-admin.js';
import { privateNoStore } from '../../src/routes/v1/shared.js';
import { appDb, insertField, insertProject, insertRecord, ownerDb, resetTestData } from '../support/db.js';
import { loginAdmin, TEST_ORIGIN } from '../support/session.js';
import { TEST_PUBLIC_API_URL, testStorage } from '../support/storage.js';

const sql = appDb();
const owner = ownerDb();
const silent = new Writable({ write: (_chunk, _enc, done) => done() });
const local = testStorage();
const app = createApp({
  sql,
  storage: local.storage,
  publicApiUrl: TEST_PUBLIC_API_URL,
  logger: createLogger('info', silent),
  trustProxy: 0,
  allowedOrigins: [TEST_ORIGIN],
  publicReadOrigins: [],
  cookieSecure: false,
});
const SENTINEL = 'zz-sentinel-93';
const P = 'new_p';

const one = z.strictObject({ data: project });
const newProject = {
  project: { key: P, slug: 'new-p', name_bn: 'নতুন প্রকল্প', name_en: 'New project', file_prefix: 'np', photo_mode: 'before_after' },
  fields: [
    { key: 'amount', label_bn: 'টাকা', type: 'money', required: true },
    { key: 'phone', label_bn: 'ফোন', type: 'phone', visibility: 'admin' },
  ],
};

let main = '';
let plain = '';

beforeEach(async () => {
  await resetTestData(owner);
  main = (await loginAdmin(app, owner, { role: 'main_admin', email: 'main@example.org' })).cookie;
  plain = (await loginAdmin(app, owner, { email: 'plain@example.org' })).cookie;
});
afterAll(async () => {
  await Promise.all([sql.end(), owner.end()]);
  await local.cleanup();
});

const send = (method: 'post' | 'patch' | 'put' | 'delete', path: string, body?: object, as: string | null = main, headers: Record<string, string> = {}) => {
  const req = request(app)[method](`/api/v1${path}`).set('origin', TEST_ORIGIN).set(headers);
  if (as) req.set('cookie', as);
  return body ? req.send(body) : req;
};
const get = (path: string, as: string | null = null) => {
  const req = request(app).get(`/api/v1${path}`);
  return as ? req.set('cookie', as) : req;
};
const logOf = (action: string) =>
  owner`select actor_email, project_type, record_id, details from public.housing_activity_log where action = ${action} order by id`;

describe('POST /projects', () => {
  it('creates a draft with its fields in order and a counter, logged as the admin', async () => {
    const res = await send('post', '/projects', { ...newProject, project: { ...newProject.project, is_published: true } }, plain);
    expect(res.status).toBe(201);
    const created = one.parse(res.body).data;
    expect(created).toMatchObject({ key: P, is_published: false, photo_mode: 'before_after', unit_bn: 'উপকারভোগী' });
    expect(created.fields?.map((f) => [f.key, f.sort_order, f.visibility])).toEqual([
      ['amount', 10, 'public'],
      ['phone', 20, 'admin'],
    ]);
    expect((await get(`/projects/${P}/next-serial`, plain)).body.data.next_serial).toBe(1);
    expect(await logOf('project_create')).toMatchObject([{ actor_email: 'plain@example.org', project_type: P, record_id: null }]);
    expect(await logOf('field_create')).toHaveLength(2);
  });

  it('refuses cover_path in the body', async () => {
    const res = await send('post', '/projects', { ...newProject, project: { ...newProject.project, cover_path: '/x' } });
    expect(res.status).toBe(400);
  });

  it.each([
    ['key', { key: 'semi_pucca' }],
    ['slug', { slug: 'tin' }],
    ['file_prefix', { file_prefix: 'tin' }],
  ])('answers a duplicate %s with 409 naming it', async (field, change) => {
    const res = await send('post', '/projects', { ...newProject, project: { ...newProject.project, ...change } });
    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual({ field });
  });

  it('passes a guard refusal through as 400 with its field, without echoing the slug', async () => {
    const res = await send('post', '/projects', { ...newProject, project: { ...newProject.project, slug: 'admin' } });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual({ field: 'slug' });
    expect(res.body.error.message).not.toContain('admin');
  });

  it('refuses an unknown stat-card key without echoing it', async () => {
    const card = { id: 'c', kind: 'count', label_bn: 'মোট', label_en: 'Total', [SENTINEL]: 1 };
    const res = await send('post', '/projects', { ...newProject, project: { ...newProject.project, stat_cards: [card] } });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain(SENTINEL);
  });

  it('creates nothing when a field is bad, naming the reserved key', async () => {
    const res = await send('post', '/projects', { ...newProject, fields: [...newProject.fields, { key: 'serial_no', label_bn: 'ক', type: 'text' }] });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual({ field: 'key' });
    expect(await owner`select key from public.housing_projects where key = ${P}`).toEqual([]);
  });
});

describe('PATCH /projects/:key', () => {
  const updatedAt = async () => one.parse((await get(`/projects/${P}`, main)).body).data.updated_at;
  beforeEach(() => insertProject(owner, { key: P, is_published: false }));

  it('changes a setting and logs old and new', async () => {
    const res = await send('patch', `/projects/${P}`, { name_bn: 'বদল' }, plain);
    expect(res.status).toBe(200);
    expect(one.parse(res.body).data.name_bn).toBe('বদল');
    expect((await logOf('project_update'))[0]?.details).toEqual({ changes: { name_bn: { old: `প্রকল্প ${P}`, new: 'বদল' } } });
  });

  it('accepts a matching If-Match, bare or quoted', async () => {
    expect((await send('patch', `/projects/${P}`, { name_bn: 'এক' }, main, { 'if-match': await updatedAt() })).status).toBe(200);
    expect((await send('patch', `/projects/${P}`, { name_bn: 'দুই' }, main, { 'if-match': `"${await updatedAt()}"` })).status).toBe(200);
  });

  it('refuses a stale If-Match with 409 and changes nothing', async () => {
    const stale = await updatedAt();
    await send('patch', `/projects/${P}`, { name_bn: 'অন্যজন' }, plain);
    const res = await send('patch', `/projects/${P}`, { name_bn: 'আমি' }, main, { 'if-match': stale });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('অন্য কেউ এর মধ্যে প্রকল্পটি বদলেছেন — পাতা রিফ্রেশ করে আবার চেষ্টা করুন');
    expect(one.parse((await get(`/projects/${P}`, main)).body).data.name_bn).toBe('অন্যজন');
  });

  it('refuses a malformed If-Match', async () => {
    const res = await send('patch', `/projects/${P}`, { name_bn: 'ক' }, main, { 'if-match': 'yesterday' });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual({ reason: 'if_match' });
  });

  it('answers 404 for an unknown project, with or without If-Match', async () => {
    expect((await send('patch', '/projects/nope', { name_bn: 'ক' })).status).toBe(404);
    expect((await send('patch', '/projects/nope', { name_bn: 'ক' }, main, { 'if-match': new Date().toISOString() })).status).toBe(404);
  });

  it.each([{}, { key: 'other' }, { cover_path: null }, { updated_at: new Date().toISOString() }])('refuses the body %j', async (body) => {
    expect((await send('patch', `/projects/${P}`, body)).status).toBe(400);
  });

  it('publishes and unpublishes, which visitors see and the log names', async () => {
    expect((await get(`/projects/${P}`)).status).toBe(404);
    expect((await send('patch', `/projects/${P}`, { is_published: true })).status).toBe(200);
    expect((await get(`/projects/${P}`)).status).toBe(200);
    expect((await send('patch', `/projects/${P}`, { is_published: false })).status).toBe(200);
    expect((await get(`/projects/${P}`)).status).toBe(404);
    expect(await logOf('project_publish')).toHaveLength(1);
    expect(await logOf('project_unpublish')).toHaveLength(1);
  });

  it('binds stat cards, core fields and display as JSON', async () => {
    const stat_cards = [{ id: 'total', kind: 'count', label_bn: 'মোট', label_en: 'Total', home: true }];
    const res = await send('patch', `/projects/${P}`, { stat_cards, core_fields: { union_name: { required: true } }, display: { show_map: true } });
    expect(res.status).toBe(200);
    expect(one.parse(res.body).data).toMatchObject({ stat_cards, core_fields: { union_name: { required: true } }, display: { show_map: true } });
  });
});

describe('DELETE /projects/:key', () => {
  it('lets the main admin delete a fresh draft created with fields', async () => {
    expect((await send('post', '/projects', newProject)).status).toBe(201);
    expect((await send('delete', `/projects/${P}`)).status).toBe(204);
    expect(await owner`select key from public.housing_projects where key = ${P}`).toEqual([]);
    expect(await logOf('project_delete')).toMatchObject([{ actor_email: 'main@example.org' }]);
  });

  it('refuses a plain admin with 403 and keeps the project', async () => {
    await insertProject(owner, { key: P });
    const res = await send('delete', `/projects/${P}`, undefined, plain);
    expect(res.status).toBe(403);
    expect(await owner`select key from public.housing_projects where key = ${P}`).toHaveLength(1);
  });

  it('refuses a project with records with 400', async () => {
    await insertRecord(sql, { project_type: 'tin' });
    const res = await send('delete', '/projects/tin');
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual({ field: 'key' });
  });

  it('answers 404 for an unknown project', async () => {
    expect((await send('delete', '/projects/nope')).status).toBe(404);
  });
});

describe('PUT /projects/order', () => {
  it('reorders what an admin lists, ignoring unknown keys, with no log row', async () => {
    const res = await send('put', '/projects/order', { keys: ['tin', 'nope', 'semi_pucca', 'housing'] }, plain);
    expect(res.status).toBe(204);
    const keys = z.object({ data: z.array(z.object({ key: z.string() })) }).parse((await get('/projects?drafts=1', plain)).body).data.map((p) => p.key);
    expect(keys).toEqual(['tin', 'semi_pucca', 'housing']);
    expect(await owner`select action from public.housing_activity_log where action like 'project_%'`).toEqual([]);
  });

  it.each([{ keys: ['Bad Key'] }, { keys: [] }, { keys: Array.from({ length: 201 }, (_, i) => `p${i}`) }])('refuses %#', async (body) => {
    expect((await send('put', '/projects/order', body)).status).toBe(400);
  });
});

describe('the router', () => {
  // Mounted at /api/v1 with no router-wide guard, so each route must carry its own.
  it('puts an admin guard before any work on every route', () => {
    const router = projectsAdminRouter({
      sql,
      storage: local.storage,
      publicApiUrl: TEST_PUBLIC_API_URL,
      receivePhoto: () => Promise.reject(new Error('unused')),
    });
    const routes = router.stack.flatMap((layer) => (layer.route ? [layer.route] : []));
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      const handlers = (route as unknown as { stack: { handle: unknown }[] }).stack.map((layer) => layer.handle);
      expect([requireAdmin, requireMainAdmin, requireMainAdminForCovers]).toContain(handlers.find((handle) => handle !== privateNoStore));
    }
  });

  it('keeps a field added to an existing project private from visitors', async () => {
    await insertField(owner, { project_key: 'tin', key: 'phone', visibility: 'admin' });
    const fields = one.parse((await get('/projects/tin')).body).data.fields ?? [];
    expect(fields.map((f) => f.key)).not.toContain('phone');
  });
});
