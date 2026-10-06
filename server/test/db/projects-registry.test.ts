// The project registry's schema rules (server/db/migrations/0011_projects_registry.sql), as the
// runtime role meets them.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, insertField, insertProject, insertRecord, ownerDb, resetTestData } from '../support/db.js';

const app = appDb();
const owner = ownerDb();

beforeEach(() => resetTestData(owner));
afterAll(() => Promise.all([app.end(), owner.end()]));

const publicKeys = async () => {
  const [row] = await app<{ keys: string[] }[]>`select public.housing_public_project_keys() as keys`;
  return row?.keys;
};

describe('seeded registry', () => {
  it('holds the housing group with semi_pucca and tin under it, all published', async () => {
    const rows = await app`
      select key, parent_key, is_group, slug, file_prefix, is_published, geo_depth
        from public.housing_projects order by sort_order, key`;
    expect(rows).toEqual([
      { key: 'housing', parent_key: null, is_group: true, slug: 'housing', file_prefix: null, is_published: true, geo_depth: 'upazila' },
      { key: 'semi_pucca', parent_key: 'housing', is_group: false, slug: 'semi-pucca', file_prefix: 'semi', is_published: true, geo_depth: 'union' },
      { key: 'tin', parent_key: 'housing', is_group: false, slug: 'tin', file_prefix: 'tin', is_published: true, geo_depth: 'union' },
    ]);
  });

  it('gives existing records empty union_name and extra', async () => {
    const { id } = await insertRecord(app);
    const [row] = await app`select union_name, extra from public.housing_beneficiaries where id = ${id}`;
    expect(row).toEqual({ union_name: '', extra: {} });
  });
});

describe('records belong to a registered project', () => {
  it('refuses an unknown project_type with an explicit serial through the foreign key', async () => {
    await expect(insertRecord(app, { project_type: 'nope', serial_no: 1 })).rejects.toMatchObject({ code: '23503' });
  });

  it('refuses an unknown project_type without a serial in the serial trigger first', async () => {
    await expect(insertRecord(app, { project_type: 'nope' })).rejects.toMatchObject({ code: '23514' });
  });

  it('accepts a record in a newly registered project', async () => {
    await insertProject(owner, { key: 'self_reliance' });
    expect((await insertRecord(app, { project_type: 'self_reliance' })).serial_no).toBe(1);
  });

  it('refuses extra that is not an object or is 16 KB or more', async () => {
    await expect(app`
      insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila, extra)
      values ('semi_pucca', 2024, 'নাম', 'রংপুর', 'কুড়িগ্রাম', 'উলিপুর', '[1]'::jsonb)`).rejects.toMatchObject({ code: '23514' });
    await expect(insertRecord(app, { extra: { note: 'x'.repeat(20_000) } })).rejects.toMatchObject({ code: '23514' });
  });
});

describe('project shape', () => {
  it.each([
    ['a key that breaks the format', { key: 'Bad-Key' }],
    ['a slug that is only digits', { key: 'digits', slug: '123' }],
    ['a slug with a trailing hyphen', { key: 'trail', slug: 'trail-' }],
    ['a file prefix that breaks the format', { key: 'prefix', file_prefix: '9x' }],
    ['a group with a file prefix', { key: 'grp', is_group: true, file_prefix: 'grp' }],
    ['a project without a file prefix', { key: 'noprefix', file_prefix: null }],
    ['a group inside a group', { key: 'nested', is_group: true, parent_key: 'housing' }],
  ])('refuses %s', async (_label, input) => {
    await expect(insertProject(owner, input)).rejects.toMatchObject({ code: '23514' });
  });

  it('refuses a duplicate slug or file prefix', async () => {
    await expect(insertProject(owner, { key: 'other', slug: 'tin' })).rejects.toMatchObject({ code: '23505' });
    await expect(insertProject(owner, { key: 'other', file_prefix: 'semi' })).rejects.toMatchObject({ code: '23505' });
  });

  it('refuses a field with a reserved key or a public phone field', async () => {
    await expect(insertField(owner, { project_key: 'tin', key: 'serial_no' })).rejects.toMatchObject({ code: '23514' });
    await expect(insertField(owner, { project_key: 'tin', key: 'prev_note' })).rejects.toMatchObject({ code: '23514' });
    await expect(insertField(owner, { project_key: 'tin', key: 'mobile', type: 'phone', visibility: 'public' })).rejects.toMatchObject({
      code: '23514',
    });
  });
});

describe('private values', () => {
  it('are written by the runtime role and go with their record', async () => {
    const { id } = await insertRecord(app);
    await app`insert into public.housing_beneficiary_private (record_id, data) values (${id}, ${app.json({ phone: '01711987654' })})`;
    await app`delete from public.housing_beneficiaries where id = ${id}`;
    const left = await owner`select 1 from public.housing_beneficiary_private where record_id = ${id}`;
    expect(left).toHaveLength(0);
  });
});

describe('housing_public_project_keys', () => {
  it('lists published projects whose group is published', async () => {
    expect(await publicKeys()).toEqual(['housing', 'semi_pucca', 'tin']);
  });

  it('leaves out a draft, and a published child of a draft group', async () => {
    await insertProject(owner, { key: 'draft_one', is_published: false });
    await insertProject(owner, { key: 'draft_group', is_group: true, is_published: false });
    await insertProject(owner, { key: 'child', parent_key: 'draft_group', is_published: true });
    expect(await publicKeys()).toEqual(['housing', 'semi_pucca', 'tin']);
  });
});
