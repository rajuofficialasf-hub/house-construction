// GET and PUT /api/v1/admin/users: the main admin lists the logins and saves an admin's role,
// projects and status (the P9b decisions in
// docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md).
import { Writable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/logger.js';
import { appDb, insertAdmin, ownerDb, resetTestData } from '../support/db.js';
import { loginAdmin, TEST_ORIGIN } from '../support/session.js';
import { testPhotoDeps } from '../support/storage.js';

const sql = appDb();
const owner = ownerDb();
const PARTNER = 'https://partner.example.org';
let logLines: string[] = [];
const logSink = new Writable({
  write(chunk, _enc, done) {
    logLines.push(String(chunk));
    done();
  },
});
const app = createApp({
  ...testPhotoDeps(),
  sql,
  logger: createLogger('info', logSink),
  trustProxy: 0,
  allowedOrigins: [TEST_ORIGIN],
  publicReadOrigins: [PARTNER],
  cookieSecure: false,
});

beforeEach(async () => {
  await resetTestData(owner);
  logLines = [];
});
afterAll(() => Promise.all([sql.end(), owner.end()]));

const main = () => loginAdmin(app, owner, { email: 'main@example.org', role: 'main_admin' });
const list = (cookie?: string) => {
  const req = request(app).get('/api/v1/admin/users');
  return cookie ? req.set('cookie', cookie) : req;
};
const save = (body: object, cookie?: string, origin: string | null = TEST_ORIGIN) => {
  const req = request(app).put('/api/v1/admin/users');
  if (origin) req.set('origin', origin);
  if (cookie) req.set('cookie', cookie);
  return req.send(body);
};
const editorBody = (over: object = {}) => ({ email: 'ed@example.org', role: 'editor', all_projects: false, projects: ['tin'], is_active: true, ...over });

describe('GET /api/v1/admin/users', () => {
  it('lists the main admin first, then by creation, with assigned keys only and no secrets', async () => {
    const { admin: m, cookie } = await main();
    const ed = await insertAdmin(owner, { email: 'ed@example.org', name: null, role: 'editor', projects: ['housing'] });
    const all = await insertAdmin(owner, { email: 'all@example.org', role: 'editor', allProjects: true, projects: ['tin'] });
    const plain = await insertAdmin(owner, { email: 'plain@example.org', disabled: true });
    const res = await list(cookie);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.body.data.map((u: { email: string }) => u.email)).toEqual([m.email, ed.email, all.email, plain.email]);
    const [mainRow, edRow, allRow, plainRow] = res.body.data;
    expect(Object.keys(mainRow).sort()).toEqual(['all_projects', 'created_at', 'email', 'id', 'is_active', 'last_seen_at', 'name', 'projects', 'role']);
    expect(mainRow).toMatchObject({ id: m.id, role: 'main_admin', all_projects: true, is_active: true, projects: [] });
    expect(mainRow.last_seen_at).toEqual(expect.any(String));
    expect(edRow).toMatchObject({ id: ed.id, name: null, role: 'editor', all_projects: false, is_active: true, projects: ['housing'], last_seen_at: null });
    expect(allRow).toMatchObject({ role: 'editor', all_projects: true, projects: [] });
    expect(plainRow).toMatchObject({ id: plain.id, role: 'admin', all_projects: true, is_active: false, projects: [] });
    expect(JSON.stringify(res.body)).not.toMatch(/argon|password|token/i);
  });
});

describe('PUT /api/v1/admin/users', () => {
  it('assigns leaves and a group, answering with the saved row and one activity row', async () => {
    const { admin: m, cookie } = await main();
    const ed = await insertAdmin(owner, { email: 'ed@example.org', role: 'editor' });
    const res = await save(editorBody({ projects: ['tin', 'semi_pucca'] }), cookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: ed.id, email: 'ed@example.org', role: 'editor', all_projects: false, is_active: true, projects: ['semi_pucca', 'tin'] });
    expect((await save(editorBody({ projects: ['housing'] }), cookie)).body.data.projects).toEqual(['housing']);
    expect(await owner`select actor_id, action from public.housing_activity_log where action <> 'login' order by id`).toEqual([
      { actor_id: m.id, action: 'admin_user_update' },
      { actor_id: m.id, action: 'admin_user_update' },
    ]);
  });

  it('gives "all projects", switches to admin and back, and disables and enables', async () => {
    const { cookie } = await main();
    await insertAdmin(owner, { email: 'ed@example.org', role: 'editor', projects: ['tin'] });
    expect((await save(editorBody({ all_projects: true }), cookie)).body.data).toMatchObject({ all_projects: true, projects: [] });
    expect((await save(editorBody({ role: 'admin' }), cookie)).body.data).toMatchObject({ role: 'admin', all_projects: true, projects: [] });
    expect((await save(editorBody(), cookie)).body.data).toMatchObject({ role: 'editor', all_projects: false, projects: ['tin'] });
    expect((await save(editorBody({ is_active: false }), cookie)).body.data).toMatchObject({ is_active: false });
    expect((await save(editorBody({ is_active: true }), cookie)).body.data).toMatchObject({ is_active: true });
  });

  it("ends a disabled login's sessions, so its next request is 401", async () => {
    const { cookie } = await main();
    const { cookie: edCookie } = await loginAdmin(app, owner, { email: 'ed@example.org', role: 'editor', projects: ['tin'] });
    await save(editorBody({ is_active: false }), cookie);
    expect((await request(app).get('/api/v1/auth/me').set('cookie', edCookie)).status).toBe(401);
  });

  it('writes a security-event line with ids, never emails', async () => {
    const { admin: m, cookie } = await main();
    const ed = await insertAdmin(owner, { email: 'ed@example.org', role: 'editor' });
    await save(editorBody(), cookie);
    const line = logLines.map((l) => JSON.parse(l)).find((l) => l.event === 'admin_user_update');
    expect(line).toMatchObject({ actor: m.id, target: ed.id, role: 'editor', all_projects: false, projects: ['tin'], active: true });
    expect(logLines.filter((l) => l.includes('admin_user_update')).join('')).not.toContain('ed@example.org');
  });

  describe('errors', () => {
    it.each([
      ['no email', { email: undefined }, 'email'],
      ['a bad email', { email: 'not-an-email' }, 'email'],
      ['the main_admin role', { role: 'main_admin' }, 'role'],
      ['a bad project key', { projects: ['Tin!'] }, 'projects.0'],
      ['a repeated key', { projects: ['tin', 'tin'] }, 'projects'],
      ['an unknown property', { extra: 1 }, undefined],
    ])('answers 400 to %s', async (_label, over, field) => {
      const { cookie } = await main();
      await insertAdmin(owner, { email: 'ed@example.org', role: 'editor' });
      const res = await save(editorBody(over), cookie);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      if (field) expect(res.body.error.details.field).toBe(field);
    });

    it('answers 400 naming the unknown project key', async () => {
      const { cookie } = await main();
      await insertAdmin(owner, { email: 'ed@example.org', role: 'editor' });
      const res = await save(editorBody({ projects: ['tin', 'nope'] }), cookie);
      expect(res.status).toBe(400);
      expect(res.body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'অচেনা প্রকল্প: nope', details: { field: 'projects' } });
    });

    it('answers 400 to an active editor with no projects', async () => {
      const { cookie } = await main();
      await insertAdmin(owner, { email: 'ed@example.org', role: 'editor', projects: ['tin'] });
      const res = await save(editorBody({ projects: [] }), cookie);
      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual({ field: 'projects' });
    });

    it('answers 404 with the CLI hint to an email with no login', async () => {
      const { cookie } = await main();
      const res = await save(editorBody({ email: 'nobody@example.org' }), cookie);
      expect(res.status).toBe(404);
      expect(res.body.error).toEqual({
        code: 'NOT_FOUND',
        message: 'এই ইমেইলে কোনো অ্যাকাউন্ট নেই — আগে সার্ভারের এডমিন CLI দিয়ে অ্যাকাউন্ট খুলুন',
        details: { field: 'email' },
      });
    });

    it.each(['main@example.org', 'MAIN@Example.org', '  main@example.org  '])("refuses the main admin's own row as %j with 403", async (email) => {
      const { admin: m, cookie } = await main();
      const res = await save(editorBody({ email, role: 'admin' }), cookie);
      expect(res.status).toBe(403);
      expect(res.body.error).toEqual({ code: 'FORBIDDEN', message: 'মূল এডমিনকে এখান থেকে বদলানো যায় না', details: { field: 'email' } });
      expect(await owner`select role, disabled_at from public.housing_admins where id = ${m.id}`).toEqual([{ role: 'main_admin', disabled_at: null }]);
    });
  });

  describe('refuses (TS-13)', () => {
    it.each([
      ['a plain admin', { role: 'admin' as const }],
      ['an editor', { role: 'editor' as const, allProjects: true }],
    ])('%s with 403 on both routes, and changes nothing', async (_label, input) => {
      await insertAdmin(owner, { email: 'ed@example.org', role: 'editor', projects: ['semi_pucca'] });
      const { cookie } = await loginAdmin(app, owner, { email: 'x@example.org', ...input });
      const got = await list(cookie);
      expect(got.status).toBe(403);
      expect(got.body.error).toEqual({ code: 'FORBIDDEN', message: 'ব্যবহারকারী সামলাতে পারেন শুধু মূল এডমিন' });
      expect((await save(editorBody(), cookie)).status).toBe(403);
      expect(await owner`select project_key from public.housing_admin_projects`).toEqual([{ project_key: 'semi_pucca' }]);
    });

    it('a visitor with 401', async () => {
      expect((await list()).status).toBe(401);
      expect((await save(editorBody())).status).toBe(401);
    });

    it("a disabled main admin's old cookie with 401", async () => {
      const { cookie } = await main();
      await owner`update public.housing_admins set disabled_at = now()`;
      expect((await list(cookie)).status).toBe(401);
      expect((await save(editorBody(), cookie)).status).toBe(401);
    });

    it('a public-read origin: no CORS grant, and the PUT fails the Origin check', async () => {
      const { cookie } = await main();
      await insertAdmin(owner, { email: 'ed@example.org', role: 'editor' });
      const got = await list(cookie).set('origin', PARTNER);
      expect(got.headers['access-control-allow-origin']).toBeUndefined();
      const put = await save(editorBody(), cookie, PARTNER);
      expect(put.status).toBe(403);
      expect(put.headers['access-control-allow-origin']).toBeUndefined();
      expect(await owner`select count(*)::int as n from public.housing_admin_projects`).toEqual([{ n: 0 }]);
    });
  });
});
