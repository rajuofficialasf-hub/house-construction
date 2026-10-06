// Project creation, the reorders, field usage, category rename and the config log
// (server/db/migrations/0015_project_guards.sql), called as the runtime role.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { withActor, type Sql } from '../../src/db.js';
import { appDb, insertField, insertPrivate, insertProject, insertRecord, ownerDb, resetTestData } from '../support/db.js';

const app = appDb();
const owner = ownerDb();
const admin = { id: '22222222-2222-4222-8222-222222222222', email: 'admin@example.org' };

beforeEach(() => resetTestData(owner));
afterAll(() => Promise.all([app.end(), owner.end()]));

const P = 'fn_p';

const create = (sql: Sql, project: Record<string, unknown>, fields: unknown[] = []) =>
  sql<{ key: string }[]>`select public.housing_project_create(${sql.json(project as never)}, ${sql.json(fields as never)}) as key`;

const baseProject = { key: P, slug: 'fn-p', name_bn: 'প্রকল্প', name_en: 'Project', file_prefix: 'fnp' };

const logActions = async () =>
  (await app<{ action: string }[]>`select action from public.housing_activity_log order by id`).map((r) => r.action);

describe('housing_project_create', () => {
  it('makes a draft with its fields in order and a counter, even when asked to publish', async () => {
    const [row] = await create(app, { ...baseProject, is_published: true }, [
      { key: 'amount', label_bn: 'টাকা', type: 'money', required: true },
      { key: 'tribe', label_bn: 'গোষ্ঠী', type: 'category' },
    ]);
    expect(row).toEqual({ key: P });
    const [p] = await app`select is_published, photo_mode, geo_depth, unit_bn, unit_en, icon, accent, show_on_home
                          from public.housing_projects where key = ${P}`;
    expect(p).toEqual({ is_published: false, photo_mode: 'after_only', geo_depth: 'upazila', unit_bn: 'উপকারভোগী',
      unit_en: 'beneficiaries', icon: 'hands-heart', accent: 'brand', show_on_home: true });
    const fields = await app`select key, sort_order, visibility, show_in_detail, is_active from public.housing_project_fields
                             where project_key = ${P} order by sort_order`;
    expect(fields).toEqual([
      { key: 'amount', sort_order: 10, visibility: 'public', show_in_detail: true, is_active: true },
      { key: 'tribe', sort_order: 20, visibility: 'public', show_in_detail: true, is_active: true },
    ]);
    expect(await app`select last_serial from public.housing_serial_counters where project_type = ${P}`).toEqual([{ last_serial: 0 }]);
  });

  it('sorts a new project after the last one', async () => {
    await create(app, baseProject);
    const [row] = await app<{ sort_order: number }[]>`select sort_order from public.housing_projects where key = ${P}`;
    const [max] = await app<{ m: number }[]>`select max(sort_order) as m from public.housing_projects where key <> ${P}`;
    expect(row!.sort_order).toBe(max!.m + 10);
  });

  it('creates nothing when the third field is bad', async () => {
    await expect(
      create(app, baseProject, [
        { key: 'a', label_bn: 'ক', type: 'text' },
        { key: 'b', label_bn: 'খ', type: 'text' },
        { key: 'serial_no', label_bn: 'গ', type: 'text' },
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    expect(await app`select count(*)::int as n from public.housing_projects where key = ${P}`).toEqual([{ n: 0 }]);
    expect(await app`select count(*)::int as n from public.housing_serial_counters where project_type = ${P}`).toEqual([{ n: 0 }]);
  });

  it('refuses more than 40 fields', async () => {
    const fields = Array.from({ length: 41 }, (_, i) => ({ key: `f${i}`, label_bn: 'ক', type: 'text' }));
    await expect(create(app, baseProject, fields)).rejects.toMatchObject({ code: '22023' });
  });

  it('logs the project and each field with the actor', async () => {
    await withActor(app, admin, (tx) => create(tx as unknown as Sql, baseProject, [{ key: 'a', label_bn: 'ক', type: 'text' }]));
    const rows = await app`select action, actor_email, project_type, record_id, details from public.housing_activity_log order by id`;
    expect(rows.map((r) => [r.action, r.actor_email, r.project_type, r.record_id])).toEqual([
      ['project_create', admin.email, P, null],
      ['field_create', admin.email, P, null],
    ]);
    expect(rows[1]?.details).toMatchObject({ field_key: 'a', snapshot: { key: 'a', label_bn: 'ক' } });
  });
});

describe('reorders', () => {
  it('orders projects 10, 20, ... ignoring unknown keys, unchanged rows and the log', async () => {
    await owner`truncate public.housing_activity_log`;
    const [first] = await app`select public.housing_projects_reorder(array['tin', 'nope', 'semi_pucca', 'housing']) as n`;
    const rows = await app`select key, sort_order from public.housing_projects order by sort_order, key`;
    expect(rows).toEqual([
      { key: 'tin', sort_order: 10 },
      { key: 'semi_pucca', sort_order: 30 },
      { key: 'housing', sort_order: 40 },
    ]);
    expect(first!.n).toBeGreaterThan(0);
    expect(await app`select public.housing_projects_reorder(array['tin', 'nope', 'semi_pucca', 'housing']) as n`).toEqual([{ n: 0 }]);
    expect(await logActions()).toEqual([]);
  });

  it('orders one project\'s fields and ignores another project\'s ids', async () => {
    await insertProject(owner, { key: P });
    await insertProject(owner, { key: 'other_p' });
    const a = await insertField(owner, { project_key: P, key: 'a', sort_order: 10 });
    const b = await insertField(owner, { project_key: P, key: 'b', sort_order: 20 });
    const foreign = await insertField(owner, { project_key: 'other_p', key: 'c', sort_order: 5 });
    await owner`truncate public.housing_activity_log`;
    await app`select public.housing_project_fields_reorder(${P}, ${[b, foreign, a]}::uuid[])`;
    const rows = await app`select key, sort_order from public.housing_project_fields order by project_key, key`;
    expect(rows).toEqual([
      { key: 'a', sort_order: 30 },
      { key: 'b', sort_order: 10 },
      { key: 'c', sort_order: 5 },
    ]);
    expect(await logActions()).toEqual([]);
  });
});

describe('housing_project_field_usage', () => {
  beforeEach(async () => {
    await insertProject(owner, { key: P });
    await insertField(owner, { project_key: P, key: 'tribe', type: 'category' });
    await insertField(owner, { project_key: P, key: 'phone', visibility: 'admin' });
    for (const tribe of ['গরু', 'গাভি', 'গরু']) await insertRecord(app, { project_type: P, extra: { tribe } });
  });

  it('counts a public category by value, most first', async () => {
    const [row] = await app`select public.housing_project_field_usage(${P}, 'tribe') as u`;
    expect(row!.u).toEqual({ count: 3, values: [{ value: 'গরু', n: 2 }, { value: 'গাভি', n: 1 }] });
  });

  it('gives only the count for a private field', async () => {
    const rec = await insertRecord(app, { project_type: P });
    await insertPrivate(app, rec.id, { phone: '01799999999' });
    const [row] = await app`select public.housing_project_field_usage(${P}, 'phone') as u`;
    expect(row!.u).toEqual({ count: 1, values: [] });
  });

  it('is P0002 for an unknown field', async () => {
    await expect(app`select public.housing_project_field_usage(${P}, 'nope')`).rejects.toMatchObject({ code: 'P0002' });
  });
});

describe('housing_project_field_rename_value', () => {
  const rename = (from: string, to: string, project = P, key = 'tribe') =>
    app<{ n: number }[]>`select public.housing_project_field_rename_value(${project}, ${key}, ${from}, ${to}) as n`;
  const tribes = async (project = P) =>
    (await app<{ t: string }[]>`select extra ->> 'tribe' as t from public.housing_beneficiaries where project_type = ${project} order by serial_no`).map((r) => r.t);

  beforeEach(async () => {
    await insertProject(owner, { key: P });
    await insertField(owner, { project_key: P, key: 'tribe', type: 'category' });
    for (const tribe of ['গাভি', 'গরু', 'গাভি ']) await insertRecord(app, { project_type: P, extra: { tribe } });
  });

  it('renames exact matches only and logs each record as an update', async () => {
    await owner`truncate public.housing_activity_log`;
    const [row] = await withActor(app, admin, (tx) => tx<{ n: number }[]>`
      select public.housing_project_field_rename_value(${P}, 'tribe', 'গাভি', 'গরু') as n`);
    // The record trigger stored 'গাভি ' trimmed, so it matches too.
    expect(row).toEqual({ n: 2 });
    expect(await tribes()).toEqual(['গরু', 'গরু', 'গরু']);
    const rows = await app`select action, actor_email, details from public.housing_activity_log order by id`;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ action: 'update', actor_email: admin.email, details: { changes: { 'extra.tribe': { old: 'গাভি', new: 'গরু' } } } });
  });

  it('leaves another project\'s same-keyed field alone', async () => {
    await insertProject(owner, { key: 'other_p' });
    await insertField(owner, { project_key: 'other_p', key: 'tribe', type: 'category' });
    await insertRecord(app, { project_type: 'other_p', extra: { tribe: 'গাভি' } });
    await rename('গাভি', 'গরু');
    expect(await tribes('other_p')).toEqual(['গাভি']);
    const [u] = await app`select public.housing_project_field_usage('other_p', 'tribe') as u`;
    expect(u!.u).toEqual({ count: 1, values: [{ value: 'গাভি', n: 1 }] });
  });

  it('stores the new value trimmed, collapsed and NFC', async () => {
    await rename('গরু', `  নতুন   ${'কো'.normalize('NFD')} `);
    expect((await tribes())[1]).toBe(`নতুন ${'কো'.normalize('NFC')}`);
  });

  it('refuses a value of only spaces, and one over the field\'s limit', async () => {
    await expect(rename('গরু', '   ')).rejects.toMatchObject({ code: 'HC400', detail: 'to' });
    await expect(rename('গরু', 'ক'.repeat(101))).rejects.toMatchObject({ code: 'HC400', detail: 'to' });
    await owner`update public.housing_project_fields set max_length = 5 where project_key = ${P} and key = 'tribe'`;
    await expect(rename('গরু', 'কখগঘঙচ')).rejects.toMatchObject({ code: 'HC400', detail: 'to' });
  });

  it('refuses a non-category or private field', async () => {
    await insertField(owner, { project_key: P, key: 'amount', type: 'number' });
    await insertField(owner, { project_key: P, key: 'phone', visibility: 'admin' });
    await expect(rename('1', '2', P, 'amount')).rejects.toMatchObject({ code: 'HC400', detail: 'type' });
    await expect(rename('1', '2', P, 'phone')).rejects.toMatchObject({ code: 'HC400', detail: 'type' });
  });

  it('refuses an archived field before touching any record', async () => {
    await owner`update public.housing_project_fields set is_active = false where project_key = ${P} and key = 'tribe'`;
    await expect(rename('গাভি', 'গরু')).rejects.toMatchObject({ code: 'HC400', detail: 'is_active' });
    expect(await tribes()).toEqual(['গাভি', 'গরু', 'গাভি']);
  });
});

describe('config log', () => {
  it('names each project and field change, with the actor and no record', async () => {
    await withActor(app, admin, async (tx) => {
      await create(tx as unknown as Sql, baseProject, [{ key: 'a', label_bn: 'ক', type: 'text' }]);
      await tx`update public.housing_projects set name_bn = 'নতুন' where key = ${P}`;
      await tx`update public.housing_projects set is_published = true where key = ${P}`;
      await tx`update public.housing_projects set is_published = false where key = ${P}`;
      await tx`update public.housing_project_fields set label_bn = 'খ' where project_key = ${P}`;
      await tx`update public.housing_project_fields set is_active = false where project_key = ${P}`;
      await tx`update public.housing_project_fields set is_active = true where project_key = ${P}`;
      await tx`delete from public.housing_projects where key = ${P}`;
    });
    const rows = await app`select action, actor_email, project_type, record_id, details from public.housing_activity_log order by id`;
    expect(rows.map((r) => r.action)).toEqual([
      'project_create', 'field_create', 'project_update', 'project_publish', 'project_unpublish',
      'field_update', 'field_archive', 'field_restore', 'field_delete', 'project_delete',
    ]);
    expect(rows.every((r) => r.actor_email === admin.email && r.project_type === P && r.record_id === null)).toBe(true);
    expect(rows[2]?.details).toEqual({ changes: { name_bn: { old: 'প্রকল্প', new: 'নতুন' } } });
    expect(rows[5]?.details).toEqual({ changes: { label_bn: { old: 'ক', new: 'খ' } }, field_key: 'a' });
  });

  it('logs nothing for a change of order or timestamps alone', async () => {
    await insertProject(owner, { key: P });
    await owner`truncate public.housing_activity_log`;
    await app`update public.housing_projects set sort_order = 999 where key = ${P}`;
    await app`update public.housing_projects set updated_at = now() - interval '1 day' where key = ${P}`;
    expect(await logActions()).toEqual([]);
  });
});
