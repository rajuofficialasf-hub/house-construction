// Field usage and category value rename through the real app and test database
// (docs/api/PROJECTS_API_CONTRACT.md §4.2). The rename's rule matrix is tested in
// test/db/project-functions.test.ts; these tests prove what the routes add
// (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, U24).
import { Writable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/logger.js';
import { appDb, insertField, insertPrivate, insertProject, insertRecord, ownerDb, resetTestData } from '../support/db.js';
import { loginAdmin, TEST_ORIGIN } from '../support/session.js';
import { testPhotoDeps } from '../support/storage.js';

const sql = appDb();
const owner = ownerDb();
const silent = new Writable({ write: (_chunk, _enc, done) => done() });
const app = createApp({
  ...testPhotoDeps(),
  sql,
  logger: createLogger('info', silent),
  trustProxy: 0,
  allowedOrigins: [TEST_ORIGIN],
  publicReadOrigins: [],
  cookieSecure: false,
});
const P = 'use_p';
const PHONE = '01799999999';

let plain = '';

beforeEach(async () => {
  await resetTestData(owner);
  plain = (await loginAdmin(app, owner, { email: 'plain@example.org' })).cookie;
  await insertProject(owner, { key: P, is_published: false });
  await insertField(owner, { project_key: P, key: 'tribe', type: 'category' });
  await insertField(owner, { project_key: P, key: 'amount', type: 'number' });
  await insertField(owner, { project_key: P, key: 'phone', visibility: 'admin' });
  for (const tribe of ['গরু', 'গাভি', 'গরু']) await insertRecord(sql, { project_type: P, extra: { tribe } });
});
afterAll(() => Promise.all([sql.end(), owner.end()]));

const usage = (path: string, as: string | null = plain) => {
  const req = request(app).get(`/api/v1/projects/${path}/usage`);
  return as ? req.set('cookie', as) : req;
};
const rename = (path: string, body: object, as: string | null = plain) => {
  const req = request(app).post(`/api/v1/projects/${path}/rename-value`).set('origin', TEST_ORIGIN).send(body);
  return as ? req.set('cookie', as) : req;
};
const tribes = async (project = P) =>
  (await owner<{ t: string }[]>`select extra ->> 'tribe' as t from public.housing_beneficiaries where project_type = ${project} order by serial_no`).map((r) => r.t);

describe('GET /projects/:key/fields/:field_key/usage', () => {
  it('counts a category by value, most first, never cached', async () => {
    const res = await usage(`${P}/fields/tribe`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { count: 3, values: [{ value: 'গরু', n: 2 }, { value: 'গাভি', n: 1 }] } });
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('gives a private field only its count, and no stored value', async () => {
    const rec = await insertRecord(sql, { project_type: P });
    await insertPrivate(sql, rec.id, { phone: PHONE });
    const res = await usage(`${P}/fields/phone`);
    expect(res.body).toEqual({ data: { count: 1, values: [] } });
    expect(JSON.stringify(res.body)).not.toContain(PHONE);
  });

  it('answers 404 for an unknown field or project, and 400 for a bad key', async () => {
    expect((await usage(`${P}/fields/nope`)).status).toBe(404);
    expect((await usage('nope/fields/tribe')).status).toBe(404);
    expect((await usage(`${P}/fields/Bad-Key`)).status).toBe(400);
  });

  it('refuses a visitor with 401, never cached', async () => {
    const res = await usage(`${P}/fields/tribe`, null);
    expect(res.status).toBe(401);
    expect(res.headers['cache-control']).toBe('private, no-store');
  });
});

describe('POST /projects/:key/fields/:field_key/rename-value', () => {
  it('lets a plain admin merge a spelling, logging each record with the actor', async () => {
    const res = await rename(`${P}/fields/tribe`, { from: 'গাভি', to: 'গরু' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { updated: 1 } });
    expect(await tribes()).toEqual(['গরু', 'গরু', 'গরু']);
    const rows = await owner`select actor_email, details from public.housing_activity_log where action = 'update'`;
    expect(rows).toEqual([{ actor_email: 'plain@example.org', details: { changes: { 'extra.tribe': { old: 'গাভি', new: 'গরু' } }, photo_kinds: [] } }]);
  });

  it('changes nothing and logs nothing when no value matches', async () => {
    expect((await rename(`${P}/fields/tribe`, { from: 'মহিষ', to: 'গরু' })).body).toEqual({ data: { updated: 0 } });
    expect(await owner`select 1 from public.housing_activity_log where action = 'update'`).toEqual([]);
  });

  it('leaves another project\'s same-keyed field alone', async () => {
    await insertField(owner, { project_key: 'tin', key: 'tribe', type: 'category' });
    await insertRecord(sql, { project_type: 'tin', extra: { tribe: 'গাভি' } });
    await rename(`${P}/fields/tribe`, { from: 'গাভি', to: 'গরু' });
    expect(await tribes('tin')).toEqual(['গাভি']);
  });

  it('refuses a number field with 400 naming type', async () => {
    const res = await rename(`${P}/fields/amount`, { from: '1', to: '2' });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual({ field: 'type' });
  });

  it('refuses a bad body, and answers 404 for an unknown field', async () => {
    expect((await rename(`${P}/fields/tribe`, { from: 'গাভি' })).status).toBe(400);
    expect((await rename(`${P}/fields/tribe`, { from: 'গাভি', to: 'গরু', extra: 1 })).status).toBe(400);
    expect((await rename(`${P}/fields/nope`, { from: 'ক', to: 'খ' })).status).toBe(404);
  });
});
