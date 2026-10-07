// GET and POST /api/v1/activity through the real app and test database
// (docs/api/PROJECTS_API_CONTRACT.md §4.5): admin-only, never cached, and a client may post only its
// own events (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, "P3 decisions").
import { Writable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { requireAdmin } from '../../src/auth/middleware.js';
import { activityEntry, pageMeta } from '../../src/housing/schemas.js';
import { createLogger } from '../../src/logger.js';
import { activityRouter } from '../../src/routes/v1/activity.js';
import { privateNoStore } from '../../src/routes/v1/shared.js';
import { appDb, insertAdmin, insertField, insertPrivate, insertProject, insertRecord, ownerDb, resetTestData } from '../support/db.js';
import { loginAdmin, TEST_ORIGIN } from '../support/session.js';
import { testPhotoDeps } from '../support/storage.js';

const sql = appDb();
const owner = ownerDb();
const silent = new Writable({ write: (_chunk, _enc, done) => done() });
const app = createApp({ ...testPhotoDeps(), sql, logger: createLogger('info', silent), trustProxy: 0, allowedOrigins: [TEST_ORIGIN], cookieSecure: false });
const page = z.strictObject({ data: z.array(activityEntry), meta: pageMeta });

let cookie = '';
let adminEmail = '';

beforeEach(async () => {
  await resetTestData(owner);
  const session = await loginAdmin(app, owner, { email: 'ops@example.org' });
  cookie = session.cookie;
  adminEmail = session.admin.email;
});
afterAll(() => Promise.all([sql.end(), owner.end()]));

const list = (query = '') => request(app).get(`/api/v1/activity${query}`).set('cookie', cookie);
const post = (body: object) => request(app).post('/api/v1/activity').set('origin', TEST_ORIGIN).set('cookie', cookie).send(body);

/** Writes a log row as the owner, at a given time, so filters can be tested on known rows. */
const logRow = (row: { action: string; project_type?: string; actor_email?: string; at?: string; record_id?: string }) =>
  owner`insert into public.housing_activity_log (action, project_type, actor_email, at, record_id)
        values (${row.action}, ${row.project_type ?? null}, ${row.actor_email ?? 'x@example.org'},
                ${row.at ?? '2026-01-01T00:00:00Z'}, ${row.record_id ?? null})`;

describe('GET /api/v1/activity', () => {
  it('filters by action, any project key, record, part of the email and time', async () => {
    await owner`delete from public.housing_activity_log`;
    const recordId = '11111111-1111-4111-8111-111111111111';
    await logRow({ action: 'import_run', project_type: 'cows_2025', actor_email: 'a%b@example.org', at: '2026-01-01T00:00:00Z' });
    await logRow({ action: 'update', project_type: 'tin', actor_email: 'axb@example.org', at: '2026-02-01T00:00:00Z', record_id: recordId });
    await logRow({ action: 'update', project_type: 'tin', actor_email: 'other@example.org', at: '2026-03-01T00:00:00Z' });

    const actions = async (query: string) => page.parse((await list(query)).body).data.map((e) => e.at);
    expect(await actions('?action=update')).toHaveLength(2);
    expect(await actions('?project_type=cows_2025')).toEqual(['2026-01-01T00:00:00.000Z']);
    expect(await actions(`?record_id=${recordId}`)).toEqual(['2026-02-01T00:00:00.000Z']);
    expect(await actions('?actor_email=a%25b')).toEqual(['2026-01-01T00:00:00.000Z']);
    expect(await actions('?from=2026-01-15T00:00:00Z&to=2026-02-15T00:00:00Z')).toEqual(['2026-02-01T00:00:00.000Z']);
  });

  it('pages newest first with the totals, and refuses a page too deep or too large', async () => {
    await owner`delete from public.housing_activity_log`;
    for (const day of ['01', '02', '03']) await logRow({ action: 'import_run', at: `2026-01-${day}T00:00:00Z` });
    const res = page.parse((await list('?page=2&page_size=2')).body);
    expect(res.data.map((e) => e.at)).toEqual(['2026-01-01T00:00:00.000Z']);
    expect(res.meta).toEqual({ page: 2, page_size: 2, total: 3, total_pages: 2 });
    expect((await list('?page_size=101')).status).toBe(400);
    expect((await list('?page=10001')).status).toBe(400);
  });

  it('shows a private change by field name only', async () => {
    await insertProject(owner, { key: 'act_p' });
    await insertField(owner, { project_key: 'act_p', key: 'phone', type: 'phone', visibility: 'admin' });
    const { id } = await insertRecord(sql, { project_type: 'act_p' });
    await insertPrivate(sql, id, { phone: '01799999999' });
    const res = await list('?action=private_update');
    const [entry] = page.parse(res.body).data;
    expect(entry?.details).toEqual({ fields: ['phone'], masked: true });
    expect(JSON.stringify(res.body)).not.toContain('01799999999');
  });

  it('shows an API write with the admin who made it, newest first, after their login', async () => {
    const { cookie: as, admin } = await loginAdmin(app, owner, { email: 'main@example.org', role: 'main_admin' });
    const write = (method: 'post' | 'patch' | 'delete', path: string, body?: object) =>
      request(app)[method](`/api/v1${path}`).set('origin', TEST_ORIGIN).set('cookie', as).send(body);
    const created = await write('post', '/projects/tin/records', { year: 2025, name: 'ক', division: 'ঢাকা', district: 'ঢাকা', upazila: 'সাভার' });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    expect((await write('patch', `/records/${id}`, { address: 'নতুন ঠিকানা' })).status).toBe(200);
    expect((await write('delete', `/records/${id}`)).status).toBe(204);
    const body = page.parse((await list('?actor_email=main@example.org')).body);
    expect(body.data.map((e) => e.action)).toEqual(['delete', 'update', 'create', 'login']);
    expect(body.data.every((e) => e.actor_id === admin.id && e.actor_email === 'main@example.org')).toBe(true);
    expect(body.data[1]!.details).toMatchObject({ changes: { address: { old: '', new: 'নতুন ঠিকানা' } } });
    expect(body.data.slice(0, 3).every((e) => e.record_id === id)).toBe(true);
  });

  it('matches part of the actor email in any case, with _ matched literally', async () => {
    await owner`delete from public.housing_activity_log`;
    await logRow({ action: 'import_run', actor_email: 'rahim@example.org' });
    await logRow({ action: 'import_run', actor_email: 'ra_im@example.org' });
    expect(page.parse((await list('?actor_email=RAHIM')).body).data.map((e) => e.actor_email)).toEqual(['rahim@example.org']);
    expect(page.parse((await list('?actor_email=a_i')).body).data.map((e) => e.actor_email)).toEqual(['ra_im@example.org']);
  });

  it('keeps entries between from and to, inclusive, with offsets', async () => {
    await owner`delete from public.housing_activity_log`;
    for (const day of ['01', '02', '03']) await logRow({ action: 'import_run', at: `2026-10-${day}T10:00:00Z` });
    const res = await list(`?from=${encodeURIComponent('2026-10-02T16:00:00+06:00')}&to=${encodeURIComponent('2026-10-03T10:00:00Z')}`);
    expect(page.parse(res.body).data.map((e) => e.at)).toEqual(['2026-10-03T10:00:00.000Z', '2026-10-02T10:00:00.000Z']);
  });

  it.each(['?from=2026-10-01T00:00:00', '?record_id=abc', '?action=Login'])('refuses %s', async (bad) => {
    expect((await list(bad)).status).toBe(400);
  });

  it('is never cached', async () => {
    expect((await list()).headers['cache-control']).toBe('private, no-store');
    expect((await request(app).get('/api/v1/activity')).headers['cache-control']).toBe('private, no-store');
  });
});

describe('POST /api/v1/activity', () => {
  it.each(['import_run', 'photo_bulk_run', 'records_export', 'category_merge'])('records a %s with the session\'s admin', async (action) => {
    const res = await post({ action, project_type: 'any_key', details: { rows: 3 } });
    expect(res.status).toBe(201);
    const [row] = await owner`select actor_email, project_type, details from public.housing_activity_log where id = ${res.body.data.id}`;
    expect(row).toEqual({ actor_email: adminEmail, project_type: 'any_key', details: { rows: 3 } });
  });

  it.each(['create', 'update', 'delete', 'photo_update', 'serial_change', 'private_update', 'login', 'logout', 'project_publish', 'field_delete', 'made_up_event', 'Bad Action'])(
    'refuses %j',
    async (action) => {
      const res = await post({ action });
      expect(res.status).toBe(400);
      expect(res.body.error.details).toMatchObject({ field: 'action' });
    },
  );

  it('refuses an actor in the body and logs nothing', async () => {
    const other = await insertAdmin(owner, { email: 'other@example.org' });
    expect((await post({ action: 'import_run', actor_id: other.id })).status).toBe(400);
    expect((await post({ action: 'import_run', actor_email: 'other@example.org' })).status).toBe(400);
    expect(page.parse((await list('?action=import_run')).body).meta.total).toBe(0);
  });

  it('refuses a bad project key and oversized details', async () => {
    expect((await post({ action: 'import_run', project_type: 'Bad-Key' })).status).toBe(400);
    expect((await post({ action: 'import_run', details: { pad: 'x'.repeat(9000) } })).status).toBe(400);
  });
});

describe('the activity router', () => {
  // It has no router-wide guard (it is mounted at /api/v1), so each route, reads included, must carry its own.
  it('puts the admin guard before any work on every route', () => {
    const routes = activityRouter({ sql }).stack.flatMap((layer) => (layer.route ? [layer.route] : []));
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      const handlers = (route as unknown as { stack: { handle: unknown }[] }).stack.map((layer) => layer.handle);
      expect(handlers.find((handle) => handle !== privateNoStore)).toBe(requireAdmin);
    }
  });
});
