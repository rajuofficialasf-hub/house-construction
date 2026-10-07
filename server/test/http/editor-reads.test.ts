// A scoped editor's reads give the admin view only inside its projects, and a visitor's view
// everywhere else; group roll-ups and the overview are always the visitor's (the P9b decisions,
// "An editor's admin view of reads is scoped too", in
// docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md).
import type { Request } from 'express';
import { Writable } from 'node:stream';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import type { AdminPrincipal } from '../../src/auth/types.js';
import { createLogger } from '../../src/logger.js';
import { viewerOf } from '../../src/routes/v1/projects.js';
import { appDb, insertField, insertProject, insertRecord, ownerDb, resetTestData, type AdminInput } from '../support/db.js';
import { loginAdmin, TEST_ORIGIN } from '../support/session.js';
import { TEST_PUBLIC_API_URL, testStorage } from '../support/storage.js';

const sql = appDb();
const owner = ownerDb();
const local = testStorage();
const silent = new Writable({ write: (_chunk, _enc, done) => done() });
const app = createApp({
  storage: local.storage,
  publicApiUrl: TEST_PUBLIC_API_URL,
  sql,
  logger: createLogger('info', silent),
  trustProxy: 0,
  allowedOrigins: [TEST_ORIGIN],
  cookieSecure: false,
});

let png: Buffer;
beforeAll(async () => {
  png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#357' } }).png().toBuffer();
});
afterAll(async () => {
  await Promise.all([sql.end(), owner.end()]);
  await local.cleanup();
});

// demo and other are top-level drafts; kid and kid2 are draft children of the published housing group.
const ids: Record<string, string> = {};
const photoIds: Record<string, string> = {};
let main = '';

/** Stores a field as visibility 'admin' with a value already in extra, past the guard that would refuse it. */
async function adminKeyInExtra(project: string) {
  await owner.begin(async (tx) => {
    await tx`alter table public.housing_project_fields disable trigger housing_project_fields_guard`;
    await tx`update public.housing_project_fields set visibility = 'admin' where project_key = ${project} and key = 'quiet'`;
    await tx`alter table public.housing_project_fields enable trigger housing_project_fields_guard`;
  });
}

beforeEach(async () => {
  await resetTestData(owner);
  await insertProject(owner, { key: 'demo', is_published: false });
  await insertProject(owner, { key: 'other', is_published: false });
  await insertProject(owner, { key: 'kid', parent_key: 'housing', is_published: false });
  await insertProject(owner, { key: 'kid2', parent_key: 'housing', is_published: false });
  for (const key of ['demo', 'other', 'tin', 'kid', 'kid2']) {
    await insertField(owner, { project_key: key, key: 'tribe', type: 'category', filterable: true, searchable: true });
    await insertField(owner, { project_key: key, key: 'quiet', type: 'text' });
    await insertField(owner, { project_key: key, key: 'phone', type: 'phone', visibility: 'admin' });
    ids[key] = (await insertRecord(sql, { project_type: key, year: 2023, extra: { tribe: 'সাঁওতাল', quiet: 'চুপ' } })).id;
    await adminKeyInExtra(key);
  }
  main = (await loginAdmin(app, owner, { email: 'main@example.org', role: 'main_admin' })).cookie;
  for (const key of ['demo', 'other', 'kid2']) {
    const res = await request(app).put(`/api/v1/records/${ids[key]}/photos/current`).set('origin', TEST_ORIGIN).set('cookie', main).attach('photo', png, 'p.png');
    expect(res.status).toBe(200);
    photoIds[key] = String(res.body.data.current_photo_url).split('/').pop() as string;
  }
});

let n = 0;
async function as(input: AdminInput): Promise<string> {
  n += 1;
  return (await loginAdmin(app, owner, { email: `r${n}@example.org`, ...input })).cookie;
}
const scoped = () => as({ role: 'editor', projects: ['demo', 'kid'] });
const get = (url: string, cookie?: string) => {
  const req = request(app).get(`/api/v1${url}`);
  return cookie ? req.set('cookie', cookie) : req;
};
const keysOf = (res: request.Response) => (res.body.data as { key: string }[]).map((p) => p.key);

describe('inside its scope', () => {
  it.each([
    '/projects/demo',
    '/projects/demo/fields',
    '/projects/demo/records',
    '/projects/demo/years',
    '/projects/demo/next-serial',
    '/projects/demo/stats',
    '/projects/demo/stats?year=2023',
    '/projects/kid/stats',
    '/projects/kid/records/serial/1',
  ])('answers %s as for the main admin', async (url) => {
    const asEditor = await get(url, await scoped());
    expect(asEditor.status).toBe(200);
    expect(asEditor.body).toEqual((await get(url, main)).body);
  });

  it("gives the draft's admin fields and extra keys, and its record by id", async () => {
    const editor = await scoped();
    expect((await get('/projects/demo/fields', editor)).body.data.map((f: { key: string }) => f.key)).toContain('phone');
    expect((await get(`/records/${ids.demo}`, editor)).body.data.extra).toEqual({ tribe: 'সাঁওতাল', quiet: 'চুপ' });
  });

  it("serves the draft's photo", async () => {
    const res = await get(`/photos/${photoIds.demo}`, await scoped());
    expect(res.status).toBe(200);
  });
});

describe('outside its scope (TS-13)', () => {
  it('leaves the other drafts out of the project list', async () => {
    const editor = await scoped();
    const listed = keysOf(await get('/projects?drafts=1', editor));
    expect(listed).toEqual(expect.arrayContaining(['demo', 'kid', 'housing', 'tin']));
    expect(listed).not.toContain('other');
    expect(listed).not.toContain('kid2');
  });

  it.each(['/projects/other', '/projects/other/fields', '/projects/other/records', '/projects/other/stats', '/projects/other/stats?year=2023', '/projects/other/years'])(
    'answers 404 to %s',
    async (url) => {
      expect((await get(url, await scoped())).status).toBe(404);
    },
  );

  it('gives no next serial, no record and no photo of another draft', async () => {
    const editor = await scoped();
    expect((await get('/projects/other/next-serial', editor)).body.data.next_serial).toBeNull();
    expect((await get(`/records/${ids.other}`, editor)).status).toBe(404);
    expect((await get(`/photos/${photoIds.other}`, editor)).status).toBe(404);
    expect((await get(`/photos/${photoIds.kid2}`, editor)).status).toBe(404);
  });

  it('shows a published project outside its scope as a visitor sees it', async () => {
    const editor = await scoped();
    expect((await get('/projects/tin/fields', editor)).body.data.map((f: { key: string }) => f.key)).not.toContain('phone');
    expect((await get('/projects/tin', editor)).body).toEqual((await get('/projects/tin')).body);
    expect((await get(`/records/${ids.tin}`, editor)).body.data.extra).toEqual({ tribe: 'সাঁওতাল' });
    expect((await get('/projects/tin/records', editor)).body.data[0].extra).toEqual({ tribe: 'সাঁওতাল' });
    expect((await get('/projects?include=fields', editor)).body).toEqual((await get('/projects?include=fields')).body);
  });
});

describe('group roll-ups and the overview', () => {
  it.each([
    ['a child', ['kid']],
    ['the group itself', ['housing']],
  ])("give an editor assigned %s the visitor's group stats", async (_label, projects) => {
    const editor = await as({ role: 'editor', projects });
    for (const url of ['/projects/housing/stats', '/projects/housing/stats?year=2023', '/projects/housing/stats?light=1']) {
      expect((await get(url, editor)).body, url).toEqual((await get(url)).body);
    }
    expect((await get('/projects/housing/stats', main)).body).not.toEqual((await get('/projects/housing/stats')).body);
  });

  it("give a scoped editor the visitor's overview, with no draft's photo", async () => {
    const editor = await scoped();
    const overview = await get('/projects/overview?drafts=1', editor);
    expect(overview.body).toEqual((await get('/projects/overview?drafts=1')).body);
    for (const id of Object.values(photoIds)) expect(JSON.stringify(overview.body)).not.toContain(id);
  });
});

describe('search and filters', () => {
  it.each(['q=চুপ', 'f.quiet=চুপ', 'f.phone=017'])('ignore an admin field for %s, in and out of scope, as for an admin', async (query) => {
    const editor = await scoped();
    for (const key of ['demo', 'tin']) {
      const url = `/projects/${key}/records?${query}`;
      expect((await get(url, editor)).body.meta).toEqual((await get(url, main)).body.meta);
    }
  });
});

describe('who sees every draft', () => {
  it.each([
    ['an editor with "all projects"', { role: 'editor' as const, allProjects: true }],
    ['an admin', { role: 'admin' as const }],
  ])('%s, as before', async (_label, input) => {
    const cookie = await as(input);
    expect(keysOf(await get('/projects?drafts=1', cookie)).sort()).toEqual(keysOf(await get('/projects?drafts=1', main)).sort());
    expect((await get('/projects/overview?drafts=1', cookie)).body).toEqual((await get('/projects/overview?drafts=1', main)).body);
    expect((await get(`/records/${ids.other}`, cookie)).status).toBe(200);
  });

  it('follows a scope change on the next read', async () => {
    const { admin, cookie } = await loginAdmin(app, owner, { email: 'ed@example.org', role: 'editor', projects: ['demo'] });
    expect((await get('/projects/other', cookie)).status).toBe(404);
    await owner`insert into public.housing_admin_projects (admin_id, project_key) values (${admin.id}, 'other')`;
    expect((await get('/projects/other', cookie)).status).toBe(200);
  });
});

describe('viewerOf', () => {
  const principal = (over: Partial<AdminPrincipal>) =>
    ({ admin: { id: 'x', email: 'x@example.org', name: null, role: 'editor', allProjects: false, projects: ['demo'], ...over } }) as unknown as Request;

  it('gives every draft only for an exact allProjects true', () => {
    expect(viewerOf(principal({ allProjects: true }))).toEqual({ admin: true, drafts: 'all' });
    expect(viewerOf(principal({ allProjects: 'true' as unknown as boolean }))).toEqual({ admin: true, drafts: ['demo'] });
  });

  it('fails closed on a principal with no projects array, and gives a visitor nothing', () => {
    expect(viewerOf(principal({ projects: undefined as unknown as string[] }))).toEqual({ admin: true, drafts: [] });
    expect(viewerOf({} as Request)).toEqual({ admin: false, drafts: [] });
  });
});
