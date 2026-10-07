// Only a main_admin may delete (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md,
// R6 and AE1): the role reaches the API through the session, and every delete route checks it.
import { Writable } from 'node:stream';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/logger.js';
import { appDb, insertProject, insertRecord, ownerDb, resetTestData } from '../support/db.js';
import { loginAdmin, TEST_ORIGIN, TEST_PASSWORD } from '../support/session.js';
import { testPhotoDeps } from '../support/storage.js';

const sql = appDb();
const owner = ownerDb();
const silent = new Writable({ write: (_chunk, _enc, done) => done() });
const app = createApp({ ...testPhotoDeps(), sql, logger: createLogger('info', silent), trustProxy: 0, allowedOrigins: [TEST_ORIGIN], cookieSecure: false });

let png: Buffer;
beforeAll(async () => {
  png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#357' } }).png().toBuffer();
});
beforeEach(() => resetTestData(owner));
afterAll(() => Promise.all([sql.end(), owner.end()]));

const plain = () => loginAdmin(app, owner, { email: 'plain@example.org', role: 'admin' });
const main = () => loginAdmin(app, owner, { email: 'main@example.org', role: 'main_admin' });
const del = (path: string, cookie?: string) => {
  const req = request(app).delete(`/api/v1/records/${path}`).set('origin', TEST_ORIGIN);
  return cookie ? req.set('cookie', cookie) : req;
};
const recordExists = async (id: string) => (await owner`select 1 from public.housing_beneficiaries where id = ${id}`).length === 1;

async function withPhoto(cookie: string): Promise<string> {
  const { id } = await insertRecord(sql);
  const res = await request(app)
    .put(`/api/v1/records/${id}/photos/current`)
    .set('origin', TEST_ORIGIN)
    .set('cookie', cookie)
    .attach('photo', png, 'photo.png');
  expect(res.status).toBe(200);
  return id;
}

describe('the role through the session', () => {
  it.each(['admin', 'main_admin'] as const)('login and /auth/me report a %s', async (role) => {
    const { cookie } = await loginAdmin(app, owner, { role });
    const me = await request(app).get('/api/v1/auth/me').set('cookie', cookie);
    expect(me.body.data.role).toBe(role);
  });
});

describe('the project scope through the session', () => {
  const me = async (cookie: string) => (await request(app).get('/api/v1/auth/me').set('cookie', cookie)).body.data;
  const login = (input: Parameters<typeof loginAdmin>[2]) =>
    request(app).post('/api/v1/auth/login').set('origin', TEST_ORIGIN).send({ email: input?.email, password: TEST_PASSWORD });

  it.each([
    ['a main admin', { role: 'main_admin' as const }],
    ['an admin', { role: 'admin' as const }],
    ['an editor with all projects', { role: 'editor' as const, allProjects: true, projects: ['tin'] }],
  ])('gives %s every project, with an empty list', async (_label, input) => {
    const { cookie } = await loginAdmin(app, owner, { email: 'x@example.org', ...input });
    expect(await me(cookie)).toMatchObject({ allProjects: true, projects: [] });
    expect((await login({ email: 'x@example.org' })).body.data.user).toMatchObject({ allProjects: true, projects: [] });
  });

  it("gives an editor with a group the group and its children, and nothing else", async () => {
    await insertProject(owner, { key: 'water' });
    const { cookie } = await loginAdmin(app, owner, { email: 'ed@example.org', role: 'editor', projects: ['housing'] });
    expect(await me(cookie)).toMatchObject({ role: 'editor', allProjects: false, projects: ['housing', 'semi_pucca', 'tin'] });
    expect((await login({ email: 'ed@example.org' })).body.data.user).toMatchObject({
      allProjects: false,
      projects: ['housing', 'semi_pucca', 'tin'],
    });
  });

  it('applies a change saved after login on the next request', async () => {
    const { admin, cookie } = await loginAdmin(app, owner, { email: 'ed@example.org', role: 'editor', projects: ['tin'] });
    expect(await me(cookie)).toMatchObject({ projects: ['housing', 'tin'] });
    await owner`delete from public.housing_admin_projects where admin_id = ${admin.id}`;
    await owner`insert into public.housing_admin_projects (admin_id, project_key) values (${admin.id}, 'semi_pucca')`;
    expect(await me(cookie)).toMatchObject({ allProjects: false, projects: ['housing', 'semi_pucca'] });
    await owner`update public.housing_admins set role = 'admin' where id = ${admin.id}`;
    expect(await me(cookie)).toMatchObject({ role: 'admin', allProjects: true, projects: [] });
  });

  it("answers 401 to a disabled editor's next request", async () => {
    const { admin, cookie } = await loginAdmin(app, owner, { email: 'ed@example.org', role: 'editor', projects: ['tin'] });
    await owner`update public.housing_admins set disabled_at = now() where id = ${admin.id}`;
    expect((await request(app).get('/api/v1/auth/me').set('cookie', cookie)).status).toBe(401);
  });
});

describe('record delete', () => {
  it('refuses a plain admin and keeps the record', async () => {
    const { cookie } = await plain();
    const { id } = await insertRecord(sql);
    const res = await del(id, cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(await recordExists(id)).toBe(true);
  });

  it('lets a main_admin delete', async () => {
    const { cookie } = await main();
    const { id } = await insertRecord(sql);
    expect((await del(id, cookie)).status).toBe(204);
    expect(await recordExists(id)).toBe(false);
  });

  it('answers 401 without a session', async () => {
    const { id } = await insertRecord(sql);
    expect((await del(id)).status).toBe(401);
  });

  it('refuses an admin demoted after logging in, on the next request', async () => {
    const { admin, cookie } = await main();
    await owner`update public.housing_admins set role = 'admin' where id = ${admin.id}`;
    const { id } = await insertRecord(sql);
    expect((await del(id, cookie)).status).toBe(403);
  });

  it('answers 401 to a disabled main_admin whose session is still open', async () => {
    const { admin, cookie } = await main();
    await owner`update public.housing_admins set disabled_at = now() where id = ${admin.id}`;
    const { id } = await insertRecord(sql);
    expect((await del(id, cookie)).status).toBe(401);
  });
});

describe('photo delete', () => {
  it('refuses a plain admin and keeps the photo, but lets a main_admin delete it', async () => {
    const { cookie: plainCookie } = await plain();
    const id = await withPhoto(plainCookie);
    const refused = await del(`${id}/photos/current`, plainCookie);
    expect(refused.status).toBe(403);
    const [kept] = await owner`select current_photo_url from public.housing_beneficiaries where id = ${id}`;
    expect(kept?.current_photo_url).not.toBeNull();

    const { cookie: mainCookie } = await main();
    const res = await del(`${id}/photos/current`, mainCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.current_photo_url).toBeNull();
  });
});
