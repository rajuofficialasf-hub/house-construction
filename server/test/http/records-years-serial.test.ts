// GET /projects/:key/years and /next-serial (docs/api/PROJECTS_API_CONTRACT.md §4.3) and
// POST /records/:id/serial (§4.4.9) through the real app and test database. A visitor sees only
// public projects; next-serial answers null rather than 404, so it can't tell a draft from an
// unknown key (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, "P3 decisions").
import { Writable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/logger.js';
import { projectRecord } from '../../src/records/schemas.js';
import { appDb, insertProject, insertRecord, ownerDb, resetTestData } from '../support/db.js';
import { loginAdmin, TEST_ORIGIN } from '../support/session.js';
import { testPhotoDeps } from '../support/storage.js';

const sql = appDb();
const owner = ownerDb();
const PARTNER = 'https://partner.example.org';
const silent = new Writable({ write: (_chunk, _enc, done) => done() });
const app = createApp({
  ...testPhotoDeps(),
  sql,
  logger: createLogger('info', silent),
  trustProxy: 0,
  allowedOrigins: [TEST_ORIGIN],
  publicReadOrigins: [PARTNER],
  cookieSecure: false,
});
const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const one = z.strictObject({ data: projectRecord });

let cookie = '';

beforeEach(async () => {
  await resetTestData(owner);
  cookie = (await loginAdmin(app, owner, { email: 'plain@example.org' })).cookie;
  await insertProject(owner, { key: 'ys_grp', is_group: true });
  await insertProject(owner, { key: 'ys_a', parent_key: 'ys_grp' });
  await insertProject(owner, { key: 'ys_b', parent_key: 'ys_grp', is_published: false });
  await insertProject(owner, { key: 'ys_draft', is_published: false });
});
afterAll(() => Promise.all([sql.end(), owner.end()]));

const get = (path: string, as?: string) => {
  const req = request(app).get(`/api/v1${path}`);
  if (as) req.set('cookie', as);
  return req;
};

describe('GET /api/v1/projects/:key/years', () => {
  beforeEach(async () => {
    for (const year of [2023, 2025, 2023]) await insertRecord(sql, { project_type: 'ys_a', year });
    await insertRecord(sql, { project_type: 'ys_b', year: 2021 });
    await insertRecord(sql, { project_type: 'ys_draft', year: 2022 });
  });

  it("lists a leaf's years once each, newest first", async () => {
    expect((await get('/projects/ys_a/years')).body).toEqual({ data: [2025, 2023] });
  });

  it("covers a group's children, leaving out a draft child for a visitor", async () => {
    expect((await get('/projects/ys_grp/years')).body.data).toEqual([2025, 2023]);
    const admin = await get('/projects/ys_grp/years', cookie);
    expect(admin.body.data).toEqual([2025, 2023, 2021]);
    expect(admin.headers['cache-control']).toBe('private, no-store');
  });

  it('answers 404 for a draft to a visitor or a disabled admin, and the years to an admin', async () => {
    expect((await get('/projects/ys_draft/years')).status).toBe(404);
    expect((await get('/projects/ys_draft/years', cookie)).body.data).toEqual([2022]);
    await owner`update public.housing_admins set disabled_at = now()`;
    expect((await get('/projects/ys_draft/years', cookie)).status).toBe(404);
  });

  it('answers 404 for an unknown key, 400 for a bad one, and [] with no records', async () => {
    await insertProject(owner, { key: 'ys_empty' });
    expect((await get('/projects/no_such/years')).status).toBe(404);
    expect((await get('/projects/Bad-Key/years')).status).toBe(400);
    expect((await get('/projects/ys_empty/years')).body).toEqual({ data: [] });
  });
});

describe('GET /api/v1/projects/:key/next-serial', () => {
  it('predicts the next serial of a published leaf', async () => {
    await insertRecord(sql, { project_type: 'ys_a' });
    await insertRecord(sql, { project_type: 'ys_a' });
    expect((await get('/projects/ys_a/next-serial')).body).toEqual({ data: { project_type: 'ys_a', next_serial: 3 } });
  });

  it('answers a draft with null to a visitor and a number to an admin', async () => {
    expect((await get('/projects/ys_draft/next-serial')).body.data.next_serial).toBeNull();
    expect((await get('/projects/ys_draft/next-serial', cookie)).body.data.next_serial).toBe(1);
  });

  it('answers null for a group and an unknown key, alike for a draft key to a visitor', async () => {
    expect((await get('/projects/ys_grp/next-serial', cookie)).body.data.next_serial).toBeNull();
    const unknown = await get('/projects/no_such/next-serial');
    const draft = await get('/projects/ys_draft/next-serial');
    expect(unknown.status).toBe(200);
    expect(draft.status).toBe(200);
    expect({ ...unknown.body.data, project_type: 'x' }).toEqual({ ...draft.body.data, project_type: 'x' });
    expect(unknown.headers['cache-control']).toBe(draft.headers['cache-control']);
  });

  it('answers an admin null for an unknown key, and 400 for a bad key', async () => {
    expect((await get('/projects/no_such/next-serial', cookie)).body).toEqual({ data: { project_type: 'no_such', next_serial: null } });
    expect((await get('/projects/Bad-Key/next-serial')).status).toBe(400);
  });
});

describe('POST /api/v1/records/:id/serial', () => {
  const move = (id: string, body: object) =>
    request(app).post(`/api/v1/records/${id}/serial`).set('origin', TEST_ORIGIN).set('cookie', cookie).send(body);

  it('moves a plain admin\'s record to a new serial, keeping its values, with the log and audit rows', async () => {
    const { id } = await insertRecord(sql, { project_type: 'ys_a', union_name: 'ধামশ্রেণী' });
    const res = await move(id, { serial_no: 40 });
    expect(res.status).toBe(200);
    expect(one.parse(res.body).data).toMatchObject({ serial_no: 40, union_name: 'ধামশ্রেণী' });
    expect(await owner`select action from public.housing_activity_log where record_id = ${id} and action = 'serial_change'`).toHaveLength(1);
    expect(await owner`select old_serial, new_serial from public.housing_serial_changes where record_id = ${id}`).toEqual([
      { old_serial: 1, new_serial: 40 },
    ]);
    expect((await get('/projects/ys_a/next-serial')).body.data.next_serial).toBe(41);
    const next = await insertRecord(sql, { project_type: 'ys_a' });
    expect(next.serial_no).toBe(41);
  });

  it('never reissues a serial a record moved away from', async () => {
    const ids = [];
    for (let i = 0; i < 5; i += 1) ids.push((await insertRecord(sql, { project_type: 'ys_a' })).id);
    await owner`delete from public.housing_beneficiaries where id = ${ids[1]!}`;
    expect((await move(ids[4]!, { serial_no: 2 })).status).toBe(200);
    expect((await get('/projects/ys_a/next-serial')).body.data.next_serial).toBe(6);
    expect((await insertRecord(sql, { project_type: 'ys_a' })).serial_no).toBe(6);
  });

  it('changes and logs nothing for the same serial', async () => {
    const { id, serial_no } = await insertRecord(sql, { project_type: 'ys_a' });
    const res = await move(id, { serial_no });
    expect(res.status).toBe(200);
    expect(res.body.data.serial_no).toBe(serial_no);
    expect(await owner`select 1 from public.housing_activity_log where action = 'serial_change'`).toHaveLength(0);
  });

  it('answers 409 for a taken serial and 404 for an unknown record', async () => {
    const { id } = await insertRecord(sql, { project_type: 'ys_a' });
    await insertRecord(sql, { project_type: 'ys_a' });
    expect((await move(id, { serial_no: 2 })).status).toBe(409);
    expect((await move(MISSING_ID, { serial_no: 9 })).status).toBe(404);
  });

  it.each([{ serial_no: 0 }, { serial_no: 1.5 }, { serial_no: '3' }, { serial_no: 3, name: 'x' }, {}])('answers 400 for %j', async (body) => {
    const { id } = await insertRecord(sql, { project_type: 'ys_a' });
    expect((await move(id, body)).status).toBe(400);
  });
});

describe('public-read CORS', () => {
  it.each(['/projects/ys_a/years', '/projects/ys_a/next-serial'])('lets a public-read origin GET %s without credentials', async (path) => {
    const res = await request(app).get(`/api/v1${path}`).set('origin', PARTNER);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(PARTNER);
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });
});
