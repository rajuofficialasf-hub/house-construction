import { Writable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { activityEntry, pageMeta } from '../../src/housing/schemas.js';
import { createLogger } from '../../src/logger.js';
import { appDb, insertAdmin, ownerDb, resetTestData } from '../support/db.js';
import { loginAdmin, TEST_ORIGIN } from '../support/session.js';
import { testPhotoDeps } from '../support/storage.js';

// GET and POST /api/v1/housing/activity through the real app and test database
// (docs/api/API_CONTRACT.md §4.9গ): admin-only, newest first, filtered and paged; the client may
// add only its own events, never the ones the server logs.

const sql = appDb();
const owner = ownerDb();
const silent = new Writable({ write: (_chunk, _enc, done) => done() });
const PARTNER = 'https://partner.example.org';
const app = createApp({ ...testPhotoDeps(),
  sql,
  logger: createLogger('info', silent),
  trustProxy: 0,
  allowedOrigins: [TEST_ORIGIN],
  publicReadOrigins: [PARTNER],
  cookieSecure: false,
});
const page = z.strictObject({ data: z.array(activityEntry), meta: pageMeta });

let cookie = '';
let adminId = '';

beforeEach(async () => {
  await resetTestData(owner);
  const session = await loginAdmin(app, owner, { role: 'main_admin' });
  cookie = session.cookie;
  adminId = session.admin.id;
});
afterAll(() => Promise.all([sql.end(), owner.end()]));

const list = (query = '', as = cookie) => {
  const req = request(app).get(`/api/v1/housing/activity${query}`);
  if (as) req.set('cookie', as);
  return req;
};
const post = (body: object, as = cookie) => {
  const req = request(app).post('/api/v1/housing/activity').set('origin', TEST_ORIGIN);
  if (as) req.set('cookie', as);
  return req.send(body);
};
const write = (method: 'post' | 'put' | 'delete', path: string, body?: object) =>
  request(app)[method](`/api/v1/housing${path}`).set('origin', TEST_ORIGIN).set('cookie', cookie).send(body);

/** A log row with a fixed time, written as the owner (the app role can't insert into the log). */
async function logAt(at: string, over: { action?: string; actor_email?: string; project_type?: string } = {}) {
  await owner`
    insert into public.housing_activity_log (at, action, actor_email, project_type)
    values (${at}, ${over.action ?? 'import_run'}, ${over.actor_email ?? 'someone@example.org'}, ${over.project_type ?? null})`;
}

describe('GET /api/v1/housing/activity', () => {
  it('lists the writes and the login newest first, with the admin and numeric ids', async () => {
    const created = await write('post', '', { project_type: 'tin', year: 2025, name: 'ক', division: 'ঢাকা', district: 'ঢাকা', upazila: 'সাভার' });
    const id = created.body.data.id as string;
    await write('put', `/${id}`, { address: 'নতুন ঠিকানা' });
    await write('delete', `/${id}`);
    const res = await list();
    expect(res.status).toBe(200);
    const body = page.parse(res.body);
    expect(body.data.map((e) => e.action)).toEqual(['delete', 'update', 'create', 'login']);
    expect(body.data.every((e) => e.actor_id === adminId && e.actor_email === 'admin@example.org')).toBe(true);
    expect(body.data[1]!.details).toMatchObject({ changes: { address: { old: '', new: 'নতুন ঠিকানা' } } });
    expect(body.meta).toEqual({ page: 1, page_size: 50, total: 4, total_pages: 1 });
  });

  it('filters by action, project type and record', async () => {
    const created = await write('post', '', { project_type: 'tin', year: 2025, name: 'ক', division: 'ঢাকা', district: 'ঢাকা', upazila: 'সাভার' });
    const id = created.body.data.id as string;
    expect(page.parse((await list('?action=create')).body).data.map((e) => e.record_id)).toEqual([id]);
    expect(page.parse((await list('?project_type=tin')).body).data.map((e) => e.action)).toEqual(['create']);
    expect(page.parse((await list(`?record_id=${id}`)).body).meta.total).toBe(1);
  });

  it('matches part of the actor email, with % and _ matched literally', async () => {
    await logAt('2026-10-01T00:00:00Z', { actor_email: 'rahim@example.org' });
    await logAt('2026-10-01T00:00:00Z', { actor_email: 'ra_im@example.org' });
    expect(page.parse((await list('?actor_email=RAHIM')).body).data.map((e) => e.actor_email)).toEqual(['rahim@example.org']);
    expect(page.parse((await list('?actor_email=a_i')).body).data.map((e) => e.actor_email)).toEqual(['ra_im@example.org']);
    expect(page.parse((await list('?actor_email=%25')).body).meta.total).toBe(0);
  });

  it('keeps entries between from and to, inclusive, with offsets', async () => {
    await owner`truncate public.housing_activity_log`;
    await logAt('2026-10-01T10:00:00Z');
    await logAt('2026-10-02T10:00:00Z');
    await logAt('2026-10-03T10:00:00Z');
    const res = await list(`?from=${encodeURIComponent('2026-10-02T16:00:00+06:00')}&to=${encodeURIComponent('2026-10-03T10:00:00Z')}`);
    expect(page.parse(res.body).data.map((e) => new Date(e.at).toISOString())).toEqual(['2026-10-03T10:00:00.000Z', '2026-10-02T10:00:00.000Z']);
  });

  it('pages without overlap and refuses bad filters', async () => {
    await owner`truncate public.housing_activity_log`;
    for (const day of ['01', '02', '03']) await logAt(`2026-10-${day}T00:00:00Z`);
    const first = page.parse((await list('?page_size=2')).body);
    const second = page.parse((await list('?page_size=2&page=2')).body);
    expect(first.meta).toEqual({ page: 1, page_size: 2, total: 3, total_pages: 2 });
    expect(new Set([...first.data, ...second.data].map((e) => e.id)).size).toBe(3);
    for (const bad of ['?page_size=101', '?from=2026-10-01T00:00:00', '?record_id=abc', '?action=Login']) {
      expect((await list(bad)).status, bad).toBe(400);
    }
  });

  it('answers 401 without a session', async () => {
    expect((await list('', '')).status).toBe(401);
  });

  it('gives a public-read origin no CORS grant on the log, but still on the reads', async () => {
    for (const path of ['/api/v1/housing/activity', '/api/v1/housing/ACTIVITY']) {
      const res = await request(app).get(path).set('origin', PARTNER);
      expect(res.headers['access-control-allow-origin'], path).toBeUndefined();
    }
    expect((await request(app).get('/api/v1/housing').set('origin', PARTNER)).headers['access-control-allow-origin']).toBe(PARTNER);
  });
});

describe('POST /api/v1/housing/activity', () => {
  it('records a client event for the admin, without a record', async () => {
    const res = await post({ action: 'import_run', project_type: 'tin', details: { mode: 'insert', rows: 3 } });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: { id: expect.any(Number) } });
    const [entry] = page.parse((await list('?action=import_run')).body).data;
    expect(entry).toMatchObject({
      id: res.body.data.id,
      actor_id: adminId,
      actor_email: 'admin@example.org',
      project_type: 'tin',
      record_id: null,
      details: { mode: 'insert', rows: 3 },
    });
  });

  it.each(['login', 'logout', 'create', 'serial_change', 'project_publish', 'field_delete'])('refuses %s, which the server logs itself', async (action) => {
    const res = await post({ action });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual({ field: 'action', reason: 'server_logged' });
  });

  it('refuses a malformed action, an actor in the body and details over 8 KB', async () => {
    const other = await insertAdmin(owner, { email: 'other@example.org' });
    expect((await post({ action: 'Bad-Action' })).status).toBe(400);
    expect((await post({ action: 'import_run', actor_id: other.id })).status).toBe(400);
    expect((await post({ action: 'import_run', details: { note: 'x'.repeat(8200) } })).body.error.details).toEqual({ field: 'details', reason: 'too_big' });
    expect(page.parse((await list('?action=import_run')).body).meta.total).toBe(0);
  });

  it('answers 401 without a session and logs nothing', async () => {
    expect((await post({ action: 'import_run' }, '')).status).toBe(401);
    expect(page.parse((await list('?action=import_run')).body).meta.total).toBe(0);
  });
});
