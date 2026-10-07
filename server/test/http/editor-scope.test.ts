// An editor writes only in its projects, and never changes a serial, a setting or a filled value
// (the P9b decisions in docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md).
// Every record write route is walked by name, inside and outside the editor's projects.
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { Writable } from 'node:stream';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import type { Tx } from '../../src/db.js';
import { createLogger } from '../../src/logger.js';
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
beforeEach(async () => {
  await resetTestData(owner);
  await insertField(owner, { project_key: 'tin', key: 'phone', type: 'phone', visibility: 'admin' });
  await insertField(owner, { project_key: 'semi_pucca', key: 'phone', type: 'phone', visibility: 'admin' });
  await insertField(owner, { project_key: 'tin', key: 'tribe' });
});
afterAll(async () => {
  await Promise.all([sql.end(), owner.end()]);
  await local.cleanup();
});

const PHONE = '01799999999';
const row = (over: Record<string, unknown> = {}) => ({ year: 2024, name: 'রহিমা খাতুন', division: 'রংপুর', district: 'কুড়িগ্রাম', upazila: 'উলিপুর', ...over });

let n = 0;
/** Logs in a fresh admin with this role and scope; returns its cookie. */
async function as(input: AdminInput): Promise<string> {
  n += 1;
  return (await loginAdmin(app, owner, { email: `u${n}@example.org`, ...input })).cookie;
}
const tinEditor = () => as({ role: 'editor', projects: ['tin'] });

/** A request with the site's origin and the given session. */
function send(cookie: string, method: 'get' | 'post' | 'put' | 'patch', url: string, body?: object) {
  const req = request(app)[method](`/api/v1${url}`).set('origin', TEST_ORIGIN).set('cookie', cookie);
  return body ? req.send(body) : req;
}
const photo = (cookie: string, id: string, slot = 'current') =>
  request(app).put(`/api/v1/records/${id}/photos/${slot}`).set('origin', TEST_ORIGIN).set('cookie', cookie).attach('photo', png, 'photo.png');

const recordRow = (id: string) => owner`select name, address, serial_no, extra, current_photo_url from public.housing_beneficiaries where id = ${id}`.then((r) => r[0]);
const privateOf = (id: string) => owner`select data from public.housing_beneficiary_private where record_id = ${id}`.then((r) => r[0]?.data);
const count = (key: string) => owner<{ n: number }[]>`select count(*)::int as n from public.housing_beneficiaries where project_type = ${key}`.then((r) => r[0]!.n);
const lastLogId = () => owner<{ id: string | null }[]>`select max(id)::text as id from public.housing_activity_log`.then((r) => r[0]?.id);
const storedFiles = async () => (await readdir(path.join(local.root, 'housing')).catch(() => [])).length;

/** Every record write route for one project key and one of its records, by name. */
function writeRoutes(key: string, id: string, serial: number) {
  return {
    'POST /projects/:key/records': (c: string) => send(c, 'post', `/projects/${key}/records`, row()),
    'POST /projects/:key/records/bulk': (c: string) => send(c, 'post', `/projects/${key}/records/bulk`, { mode: 'assign_serial', rows: [row()] }),
    'PUT /projects/:key/records/bulk': (c: string) => send(c, 'put', `/projects/${key}/records/bulk`, { rows: [{ serial_no: serial, address: 'নতুন ঠিকানা' }] }),
    'POST /projects/:key/records/private': (c: string) => send(c, 'post', `/projects/${key}/records/private`, { ids: [id] }),
    'PATCH /records/:id': (c: string) => send(c, 'patch', `/records/${id}`, { address: 'নতুন ঠিকানা' }),
    'PUT /records/:id/photos/:slot': (c: string) => photo(c, id),
    'GET /records/:id/private': (c: string) => send(c, 'get', `/records/${id}/private`),
    'PUT /records/:id/private': (c: string) => send(c, 'put', `/records/${id}/private`, { data: { phone: PHONE } }),
    'POST /activity': (c: string) => send(c, 'post', '/activity', { action: 'import_run', project_type: key }),
  };
}

describe('an editor inside its projects', () => {
  it.each(Object.keys(writeRoutes('tin', '', 1)))('may use %s', async (name) => {
    const rec = await insertRecord(sql, { project_type: 'tin' });
    const cookie = await tinEditor();
    const res = await writeRoutes('tin', rec.id, rec.serial_no)[name as keyof ReturnType<typeof writeRoutes>](cookie);
    expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
  });

  it('fills an empty value and changes a filled one with PATCH', async () => {
    const rec = await insertRecord(sql, { project_type: 'tin', extra: { tribe: 'ক' } });
    const cookie = await tinEditor();
    expect((await send(cookie, 'patch', `/records/${rec.id}`, { address: 'নতুন', name: 'অন্য নাম', extra: { tribe: 'খ' } })).status).toBe(200);
    expect(await recordRow(rec.id)).toMatchObject({ address: 'নতুন', name: 'অন্য নাম', extra: { tribe: 'খ' } });
  });

  it('writes in a child of its group added after the assignment', async () => {
    const cookie = await as({ role: 'editor', projects: ['housing'] });
    await insertProject(owner, { key: 'mud', parent_key: 'housing' });
    expect((await send(cookie, 'post', '/projects/mud/records', row())).status).toBe(201);
    expect((await send(cookie, 'post', '/projects/semi_pucca/records', row())).status).toBe(201);
  });

  it("can't create in its child's parent group, as no admin can, and nothing is written", async () => {
    const cookie = await tinEditor();
    const one = await send(cookie, 'post', '/projects/housing/records', row());
    expect(one.status).toBe(400);
    expect(one.body.error.details.reason).toBe('group');
    const bulk = await send(cookie, 'post', '/projects/housing/records/bulk', { mode: 'assign_serial', rows: [row()] });
    expect(bulk.status).toBe(400);
    expect(bulk.body.error.details.reason).toBe('group');
    expect(await count('housing')).toBe(0);
  });
});

describe('an editor outside its projects (TS-13)', () => {
  it.each(Object.keys(writeRoutes('semi_pucca', '', 1)))('is refused %s with 403, and nothing changes', async (name) => {
    const rec = await insertRecord(sql, { project_type: 'semi_pucca' });
    const before = await recordRow(rec.id);
    const cookie = await tinEditor();
    const logged = await lastLogId();
    const files = await storedFiles();
    const res = await writeRoutes('semi_pucca', rec.id, rec.serial_no)[name as keyof ReturnType<typeof writeRoutes>](cookie);
    expect(res.status).toBe(403);
    expect(res.body.error).toEqual({ code: 'FORBIDDEN', message: 'এই প্রকল্পে আপনার কাজের অনুমতি নেই' });
    expect(await recordRow(rec.id)).toEqual(before);
    expect(await count('semi_pucca')).toBe(1);
    expect(await privateOf(rec.id)).toBeUndefined();
    expect(await storedFiles()).toBe(files);
    expect(await lastLogId()).toBe(logged);
  });

  it.each(Object.keys(writeRoutes('tin', '', 1)))('with no projects and no "all projects" is refused %s', async (name) => {
    const rec = await insertRecord(sql, { project_type: 'tin' });
    const cookie = await as({ role: 'editor', projects: [] });
    const res = await writeRoutes('tin', rec.id, rec.serial_no)[name as keyof ReturnType<typeof writeRoutes>](cookie);
    expect(res.status).toBe(403);
  });

  it('answers 404 for an unknown record, as for an admin', async () => {
    const cookie = await tinEditor();
    const missing = '00000000-0000-4000-8000-ffffffffffff';
    expect((await send(cookie, 'patch', `/records/${missing}`, { address: 'ক' })).status).toBe(404);
    expect((await send(cookie, 'get', `/records/${missing}/private`)).status).toBe(404);
    expect((await photo(cookie, missing)).status).toBe(404);
  });
});

describe('every editor', () => {
  it('is refused a serial change, even in its project; an admin still changes it', async () => {
    const rec = await insertRecord(sql, { project_type: 'tin' });
    const editor = await as({ role: 'editor', allProjects: true });
    const res = await send(editor, 'post', `/records/${rec.id}/serial`, { serial_no: 50 });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('সিরিয়াল নম্বর বদলাতে পারেন শুধু মূল এডমিন ও এডমিন');
    expect((await recordRow(rec.id))?.serial_no).toBe(rec.serial_no);
    expect((await send(await as({ role: 'admin' }), 'post', `/records/${rec.id}/serial`, { serial_no: 50 })).status).toBe(200);
  });

  it('is refused a bulk update with _clear, naming the field; an admin still clears', async () => {
    const rec = await insertRecord(sql, { project_type: 'tin', address: 'পুরনো', extra: { tribe: 'ক' } });
    const editor = await tinEditor();
    const body = { rows: [{ serial_no: rec.serial_no, name: 'নতুন' }, { serial_no: rec.serial_no, _clear: ['extra.tribe', 'address'] }] };
    const res = await send(editor, 'put', '/projects/tin/records/bulk', body);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: 'FORBIDDEN', details: { field: 'extra.tribe' } });
    expect(await recordRow(rec.id)).toMatchObject({ name: 'পরীক্ষা নাম', address: 'পুরনো', extra: { tribe: 'ক' } });
    const admin = await as({ role: 'admin' });
    expect((await send(admin, 'put', '/projects/tin/records/bulk', { rows: [{ serial_no: rec.serial_no, _clear: ['address'] }] })).status).toBe(200);
    expect((await recordRow(rec.id))?.address).toBe('');
  });

  it('with "all projects" writes in any project', async () => {
    const cookie = await as({ role: 'editor', allProjects: true });
    expect((await send(cookie, 'post', '/projects/semi_pucca/records', row())).status).toBe(201);
    expect((await send(cookie, 'post', '/projects/tin/records', row())).status).toBe(201);
  });
});

describe('a change of rights mid-session', () => {
  it('applies to the scope on the very next write', async () => {
    const { admin, cookie } = await loginAdmin(app, owner, { email: 'ed@example.org', role: 'editor', projects: ['tin'] });
    expect((await send(cookie, 'post', '/projects/semi_pucca/records', row())).status).toBe(403);
    await owner`insert into public.housing_admin_projects (admin_id, project_key) values (${admin.id}, 'semi_pucca')`;
    expect((await send(cookie, 'post', '/projects/semi_pucca/records', row())).status).toBe(201);
    await owner`delete from public.housing_admin_projects where admin_id = ${admin.id} and project_key = 'tin'`;
    expect((await send(cookie, 'post', '/projects/tin/records', row())).status).toBe(403);
  });

  it('applies to the editor-only refusals on the very next write', async () => {
    const rec = await insertRecord(sql, { project_type: 'tin' });
    const { admin, cookie } = await loginAdmin(app, owner, { email: 'ed@example.org', role: 'editor', projects: ['tin'] });
    expect((await send(cookie, 'post', `/records/${rec.id}/serial`, { serial_no: 70 })).status).toBe(403);
    await owner`update public.housing_admins set role = 'admin' where id = ${admin.id}`;
    expect((await send(cookie, 'post', `/records/${rec.id}/serial`, { serial_no: 70 })).status).toBe(200);
    expect((await send(cookie, 'post', '/projects/semi_pucca/records', row())).status).toBe(201);
    await owner`update public.housing_admins set role = 'editor' where id = ${admin.id}`;
    expect((await send(cookie, 'post', `/records/${rec.id}/serial`, { serial_no: 71 })).status).toBe(403);
  });
});

describe('an editor never empties a filled value or replaces a photo', () => {
  it.each([
    ['a text column sent as ""', { address: '' }, 'address'],
    ['a text column sent as spaces', { union_name: '  ' }, 'union_name'],
    ['a photo source sent as null', { current_photo_source: null }, 'current_photo_source'],
    ['an extra key dropped', { extra: {} }, 'extra.tribe'],
    ['an extra key set to null', { extra: { tribe: null } }, 'extra.tribe'],
    ['an extra key set to ""', { extra: { tribe: '' } }, 'extra.tribe'],
  ])('refuses a PATCH with %s, and the record is unchanged', async (_label, patch, field) => {
    const rec = await insertRecord(sql, { project_type: 'tin', address: 'গ্রাম', union_name: 'ইউনিয়ন', extra: { tribe: 'ক' } });
    await owner`update public.housing_beneficiaries set current_photo_source = 'ফোন' where id = ${rec.id}`;
    const before = await recordRow(rec.id);
    const res = await send(await tinEditor(), 'patch', `/records/${rec.id}`, patch);
    expect(res.status).toBe(403);
    expect(res.body.error).toEqual({ code: 'FORBIDDEN', message: 'ভরা ঘর ফাঁকা করতে পারেন শুধু মূল এডমিন ও এডমিন', details: { field } });
    expect(await recordRow(rec.id)).toEqual(before);
  });

  it('lets an admin empty a filled value', async () => {
    const rec = await insertRecord(sql, { project_type: 'tin', address: 'গ্রাম', extra: { tribe: 'ক' } });
    expect((await send(await as({ role: 'admin' }), 'patch', `/records/${rec.id}`, { address: '', extra: {} })).status).toBe(200);
    expect(await recordRow(rec.id)).toMatchObject({ address: '', extra: {} });
  });

  it('refuses a private save that empties a value, naming the key; filling and changing pass', async () => {
    const rec = await insertRecord(sql, { project_type: 'tin' });
    const editor = await tinEditor();
    expect((await send(editor, 'put', `/records/${rec.id}/private`, { data: { phone: PHONE } })).status).toBe(200);
    for (const data of [{}, { phone: null }, { phone: '' }]) {
      const res = await send(editor, 'put', `/records/${rec.id}/private`, { data });
      expect(res.status).toBe(403);
      expect(res.body.error.details).toEqual({ field: 'extra.phone' });
    }
    expect(await privateOf(rec.id)).toEqual({ phone: PHONE });
    expect((await send(editor, 'put', `/records/${rec.id}/private`, { data: { phone: '01711111111' } })).status).toBe(200);
    expect((await send(await as({ role: 'admin' }), 'put', `/records/${rec.id}/private`, { data: {} })).status).toBe(200);
    expect(await privateOf(rec.id)).toEqual({});
  });

  it('refuses an upload into a filled slot before reading the body; an admin still replaces it', async () => {
    const rec = await insertRecord(sql, { project_type: 'tin' });
    const admin = await as({ role: 'admin' });
    expect((await photo(admin, rec.id)).status).toBe(200);
    const first = (await recordRow(rec.id))?.current_photo_url;
    const files = await storedFiles();
    const res = await photo(await tinEditor(), rec.id);
    expect(res.status).toBe(403);
    expect(res.body.error).toEqual({
      code: 'FORBIDDEN',
      message: 'আগে থেকে থাকা ছবি বদলাতে পারেন শুধু মূল এডমিন ও এডমিন',
      details: { field: 'current_photo_url' },
    });
    expect(await storedFiles()).toBe(files);
    expect((await recordRow(rec.id))?.current_photo_url).toBe(first);
    expect((await photo(admin, rec.id)).status).toBe(200);
    expect((await recordRow(rec.id))?.current_photo_url).not.toBe(first);
  });

  it('refuses an upload whose empty slot was filled while it was stored, and removes its files', async () => {
    const rec = await insertRecord(sql, { project_type: 'tin' });
    const editor = await tinEditor();
    const files = await storedFiles();
    // The owner holds the record's row, as a racing upload's transaction would, and fills the slot.
    let upload: Promise<request.Response> | undefined;
    await owner.begin(async (tx) => {
      await tx`select 1 from public.housing_beneficiaries where id = ${rec.id} for update`;
      upload = photo(editor, rec.id).then((res) => res);
      await waitForBlockedQuery(tx);
      await tx`update public.housing_beneficiaries set current_photo_url = ${`${TEST_PUBLIC_API_URL}/api/v1/photos/00000000-0000-4000-8000-000000000001`} where id = ${rec.id}`;
    });
    const res = await upload!;
    expect(res.status).toBe(403);
    expect(res.body.error.details).toEqual({ field: 'current_photo_url' });
    expect(await storedFiles()).toBe(files);
    expect(await owner`select count(*)::int as n from public.housing_files where record_id = ${rec.id}`).toEqual([{ n: 0 }]);
  });
});

/** Resolves once some query on the test database is waiting for a lock. */
async function waitForBlockedQuery(tx: Tx) {
  for (let i = 0; i < 300; i++) {
    const [row] = await tx<{ n: number }[]>`select count(*)::int as n from pg_locks where not granted`;
    if ((row?.n ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('no query blocked on a lock');
}
