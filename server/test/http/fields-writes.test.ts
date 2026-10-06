// A project's field writes through the real app and test database: POST /projects/:key/fields,
// PATCH and DELETE /fields/:id and PUT /projects/:key/fields/order (docs/api/PROJECTS_API_CONTRACT.md
// §4.2). The field guard's rule matrix is tested in test/db/project-guards.test.ts; these tests prove
// what the routes add (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, U23).
import { Writable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/logger.js';
import { project, projectField } from '../../src/projects/schemas.js';
import { appDb, insertField, insertProject, insertRecord, ownerDb, resetTestData } from '../support/db.js';
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
const SENTINEL = 'zz_sentinel_93';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const P = 'fld_p';

const oneField = z.strictObject({ data: projectField });
const oneProject = z.strictObject({ data: project });

let main = '';
let plain = '';

beforeEach(async () => {
  await resetTestData(owner);
  main = (await loginAdmin(app, owner, { role: 'main_admin', email: 'main@example.org' })).cookie;
  plain = (await loginAdmin(app, owner, { email: 'plain@example.org' })).cookie;
  await insertProject(owner, { key: P, is_published: false });
});
afterAll(() => Promise.all([sql.end(), owner.end()]));

const send = (method: 'post' | 'patch' | 'put' | 'delete', path: string, body?: object, as: string | null = main) => {
  const req = request(app)[method](`/api/v1${path}`).set('origin', TEST_ORIGIN);
  if (as) req.set('cookie', as);
  return body ? req.send(body) : req;
};
const fieldsOf = async (as: string | null) => {
  const req = request(app).get(`/api/v1/projects/${P}`);
  if (as) req.set('cookie', as);
  return oneProject.parse((await req).body).data.fields ?? [];
};
const logOf = (action: string) =>
  owner`select actor_email, project_type, details from public.housing_activity_log where action = ${action} order by id`;

describe('POST /projects/:key/fields', () => {
  it('adds a field with the contract defaults after the last one, logged with its key', async () => {
    await insertField(owner, { project_key: P, key: 'first', sort_order: 30 });
    const res = await send('post', `/projects/${P}/fields`, { key: 'amount', label_bn: 'টাকা', type: 'money' }, plain);
    expect(res.status).toBe(201);
    expect(oneField.parse(res.body).data).toMatchObject({
      project_key: P, key: 'amount', visibility: 'public', show_in_detail: true, is_active: true, sort_order: 40, options: [],
    });
    expect(await logOf('field_create')).toMatchObject([{}, { actor_email: 'plain@example.org', project_type: P, details: { field_key: 'amount' } }]);
  });

  it('answers a duplicate key with 409 naming it', async () => {
    await insertField(owner, { project_key: P, key: 'amount' });
    const res = await send('post', `/projects/${P}/fields`, { key: 'amount', label_bn: 'টাকা', type: 'money' });
    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual({ field: 'key' });
  });

  it('answers a reserved key with 400 naming it', async () => {
    const res = await send('post', `/projects/${P}/fields`, { key: 'serial_no', label_bn: 'ক', type: 'text' });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual({ field: 'key' });
  });

  it('refuses an unknown body key without echoing it', async () => {
    const res = await send('post', `/projects/${P}/fields`, { key: 'a', label_bn: 'ক', type: 'text', [SENTINEL]: true });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain(SENTINEL);
  });

  it('answers 404 for an unknown project', async () => {
    expect((await send('post', '/projects/nope/fields', { key: 'a', label_bn: 'ক', type: 'text' })).status).toBe(404);
  });

  it('keeps a new private field from visitors', async () => {
    await send('patch', `/projects/${P}`, { is_published: true });
    await send('post', `/projects/${P}/fields`, { key: 'phone', label_bn: 'ফোন', type: 'phone', visibility: 'admin' });
    expect((await fieldsOf(null)).map((f) => f.key)).not.toContain('phone');
    expect((await fieldsOf(main)).map((f) => f.key)).toContain('phone');
  });
});

describe('PATCH /fields/:id', () => {
  let id = '';
  beforeEach(async () => {
    id = await insertField(owner, { project_key: P, key: 'amount', type: 'money', label_bn: 'টাকা' });
  });

  it('changes a label, and archives and restores, each logged by name', async () => {
    const res = await send('patch', `/fields/${id}`, { label_bn: 'পরিমাণ' }, plain);
    expect(res.status).toBe(200);
    expect(oneField.parse(res.body).data.label_bn).toBe('পরিমাণ');
    expect((await send('patch', `/fields/${id}`, { is_active: false })).status).toBe(200);
    expect((await send('patch', `/fields/${id}`, { is_active: true })).status).toBe(200);
    expect((await logOf('field_update'))[0]?.details).toEqual({ changes: { label_bn: { old: 'টাকা', new: 'পরিমাণ' } }, field_key: 'amount' });
    expect(await logOf('field_archive')).toHaveLength(1);
    expect(await logOf('field_restore')).toHaveLength(1);
  });

  it('refuses a type change once a record holds a value, naming the field', async () => {
    await insertRecord(sql, { project_type: P, extra: { amount: 500 } });
    const res = await send('patch', `/fields/${id}`, { type: 'number' });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual({ field: 'type' });
  });

  it('answers a key change onto another field\'s key with 409 naming it', async () => {
    await insertField(owner, { project_key: P, key: 'tribe' });
    const res = await send('patch', `/fields/${id}`, { key: 'tribe' });
    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual({ field: 'key' });
  });

  it.each([{}, { project_key: 'tin' }, { id: MISSING_ID }])('refuses the body %j', async (body) => {
    expect((await send('patch', `/fields/${id}`, body)).status).toBe(400);
  });

  it('answers 404 for an unknown id and 400 for a bad one', async () => {
    expect((await send('patch', `/fields/${MISSING_ID}`, { label_bn: 'ক' })).status).toBe(404);
    expect((await send('patch', '/fields/nope', { label_bn: 'ক' })).status).toBe(400);
  });
});

describe('DELETE /fields/:id', () => {
  let id = '';
  beforeEach(async () => {
    id = await insertField(owner, { project_key: P, key: 'amount', type: 'money' });
  });

  it('lets the main admin delete an unused field, logged', async () => {
    expect((await send('delete', `/fields/${id}`)).status).toBe(204);
    expect(await owner`select id from public.housing_project_fields where id = ${id}`).toEqual([]);
    expect(await logOf('field_delete')).toMatchObject([{ actor_email: 'main@example.org' }]);
  });

  it('refuses a used field with 400 and the archive message', async () => {
    await insertRecord(sql, { project_type: P, extra: { amount: 500 } });
    const res = await send('delete', `/fields/${id}`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('আর্কাইভ করুন');
  });

  it('refuses a plain admin with 403 and keeps the field', async () => {
    expect((await send('delete', `/fields/${id}`, undefined, plain)).status).toBe(403);
    expect(await owner`select id from public.housing_project_fields where id = ${id}`).toHaveLength(1);
  });

  it('answers 404 for an unknown id', async () => {
    expect((await send('delete', `/fields/${MISSING_ID}`)).status).toBe(404);
  });
});

describe('PUT /projects/:key/fields/order', () => {
  it('orders the fields, ignoring another project\'s, with no log row', async () => {
    const a = await insertField(owner, { project_key: P, key: 'a', sort_order: 10 });
    const b = await insertField(owner, { project_key: P, key: 'b', sort_order: 20 });
    const foreign = await insertField(owner, { project_key: 'tin', key: 'c', sort_order: 5 });
    await owner`truncate public.housing_activity_log`;
    expect((await send('put', `/projects/${P}/fields/order`, { ids: [b, foreign, a] }, plain)).status).toBe(204);
    expect((await fieldsOf(main)).map((f) => f.key)).toEqual(['b', 'a']);
    expect(await owner`select sort_order from public.housing_project_fields where id = ${foreign}`).toEqual([{ sort_order: 5 }]);
    expect(await owner`select action from public.housing_activity_log`).toEqual([]);
  });

  it('refuses 41 ids and answers 404 for an unknown project', async () => {
    const ids = Array.from({ length: 41 }, () => MISSING_ID);
    expect((await send('put', `/projects/${P}/fields/order`, { ids })).status).toBe(400);
    expect((await send('put', '/projects/nope/fields/order', { ids: [MISSING_ID] })).status).toBe(404);
  });
});
