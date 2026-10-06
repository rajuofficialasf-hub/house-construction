// The record rules (server/db/migrations/0013_record_rules.sql), as the runtime role meets them.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, insertField, insertPrivate, insertProject, insertRecord, ownerDb, resetTestData } from '../support/db.js';

const app = appDb();
const owner = ownerDb();

beforeEach(() => resetTestData(owner));
afterAll(() => Promise.all([app.end(), owner.end()]));

const P = 'rules_p';
const SENTINEL = 'ZZ-SENTINEL-93';
// What every guard's DETAIL must look like: a column, or extra./private. plus a field key.
const FIELD_KEY = /^[a-z_]+(\.[a-z][a-z0-9_]*)?$/;

interface PgError {
  code: string;
  message: string;
  detail?: string;
}

/** Runs a write that must fail, and returns the error after checking it carries no sent input. */
async function refused(write: Promise<unknown>): Promise<PgError> {
  const err = (await write.then(
    () => {
      throw new Error('write was accepted');
    },
    (e: unknown) => e,
  )) as PgError;
  expect(err.code).toBe('HC400');
  expect(err.detail).toMatch(FIELD_KEY);
  expect(err.message).not.toContain(SENTINEL);
  expect(err.detail).not.toContain(SENTINEL);
  return err;
}

const recordIn = (extra: Record<string, unknown>, more: Parameters<typeof insertRecord>[1] = {}) =>
  insertRecord(app, { project_type: P, extra, ...more });

const extraOf = async (id: string) =>
  (await app<{ extra: Record<string, unknown> }[]>`select extra from public.housing_beneficiaries where id = ${id}`)[0]?.extra;

describe('normalisation', () => {
  beforeEach(async () => {
    await insertProject(owner, { key: P });
    await insertField(owner, { project_key: P, key: 'tribe', type: 'category' });
    await insertField(owner, { project_key: P, key: 'note', type: 'text' });
    await insertField(owner, { project_key: P, key: 'phone', type: 'phone', visibility: 'admin' });
  });

  it('trims and NFCs the text columns', async () => {
    const decomposed = 'কো'.normalize('NFD');
    const { id } = await recordIn({}, { name: `  ${decomposed}  `, upazila: ' উলিপুর ', address: ' ঠিকানা ' });
    const [row] = await app`select name, upazila, address from public.housing_beneficiaries where id = ${id}`;
    expect(row).toEqual({ name: 'কো'.normalize('NFC'), upazila: 'উলিপুর', address: 'ঠিকানা' });
  });

  it('collapses spaces in a category, and drops null and empty values', async () => {
    const { id } = await recordIn({ tribe: '  সাঁওতাল   পাড়া ', note: '', gone: null });
    expect(await extraOf(id)).toEqual({ tribe: 'সাঁওতাল পাড়া' });
  });

  it('stores a phone typed in Bangla digits in ASCII', async () => {
    const { id } = await recordIn({});
    expect(await insertPrivate(app, id, { phone: '০১৭১১-২২২৩৩৩' })).toEqual({ phone: '01711-222333' });
  });
});

describe('custom values by type', () => {
  beforeEach(async () => {
    await insertProject(owner, { key: P });
    await insertField(owner, { project_key: P, key: 'note', type: 'text' });
    await insertField(owner, { project_key: P, key: 'short', type: 'text', max_length: 5 });
    await insertField(owner, { project_key: P, key: 'size', type: 'number' });
    await insertField(owner, { project_key: P, key: 'amount', type: 'money' });
    await insertField(owner, { project_key: P, key: 'rooms', type: 'number', min_value: 1, max_value: 9 });
    await insertField(owner, { project_key: P, key: 'built', type: 'date' });
  });

  it.each([
    ['a text field given a number', 'note', 5],
    ['text over max_length', 'short', '123456'],
    ['text over the default limit', 'note', 'x'.repeat(501)],
    ['a number with 3 decimals', 'size', 1.234],
    ['a number given as text', 'size', SENTINEL],
    ['money with a fraction', 'amount', 10.5],
    ['negative money', 'amount', -1],
    ['money over the limit', 'amount', 10_000_000_001],
    ['a number below min_value', 'rooms', 0],
    ['a number above max_value', 'rooms', 10],
    ['a date in another format', 'built', '06/10/2026'],
    ['an impossible date', 'built', '2026-02-30'],
  ])('refuses %s', async (_name, key, value) => {
    const err = await refused(recordIn({ [key]: value }));
    expect(err.detail).toBe(`extra.${key}`);
  });

  it('accepts money at the limit and a number with 2 decimals', async () => {
    const { id } = await recordIn({ amount: 10_000_000_000, size: 1.25, built: '2026-02-28' });
    expect(await extraOf(id)).toEqual({ amount: 10_000_000_000, size: 1.25, built: '2026-02-28' });
  });

  it('refuses a bad phone', async () => {
    await insertField(owner, { project_key: P, key: 'phone', type: 'phone', visibility: 'admin' });
    const { id } = await recordIn({});
    const err = await refused(insertPrivate(app, id, { phone: `abc ${SENTINEL}` }));
    expect(err.detail).toBe('private.phone');
  });
});

describe('record rules', () => {
  it('refuses a record in a group project', async () => {
    const err = await refused(insertRecord(app, { project_type: 'housing', serial_no: 1 }));
    expect(err.detail).toBe('project_type');
  });

  it('refuses an unknown project without echoing it', async () => {
    const err = await refused(insertRecord(app, { project_type: 'zz_sentinel_93', serial_no: 1 }));
    expect(err.detail).toBe('project_type');
    expect(err.message).not.toContain('zz_sentinel_93');
  });

  it('refuses an empty name and an empty upazila', async () => {
    expect((await refused(insertRecord(app, { name: '   ' }))).detail).toBe('name');
    expect((await refused(insertRecord(app, { upazila: '' }))).detail).toBe('upazila');
  });

  it('enforces required core fields from core_fields', async () => {
    await insertProject(owner, {
      key: P,
      core_fields: { father_or_husband_name: { required: true }, address: { required: true } },
    });
    expect((await refused(recordIn({}, { address: 'ঠিকানা' }))).detail).toBe('father_or_husband_name');
    expect((await refused(recordIn({}, { father_or_husband_name: 'পিতা' }))).detail).toBe('address');
    await recordIn({}, { father_or_husband_name: 'পিতা', address: 'ঠিকানা' });
  });

  it('requires union_name only when geo_depth is union and core_fields asks for it', async () => {
    await insertProject(owner, { key: P, geo_depth: 'union', core_fields: { union_name: { required: true } } });
    await insertProject(owner, { key: 'rules_q', geo_depth: 'upazila', core_fields: { union_name: { required: true } } });
    expect((await refused(recordIn({}))).detail).toBe('union_name');
    await insertRecord(app, { project_type: 'rules_q' });
    // The seeded projects are union-deep but don't require it.
    await insertRecord(app, { project_type: 'tin', union_name: '' });
    await insertRecord(app, { project_type: 'semi_pucca', union_name: '' });
  });

  it('checks a required core field on update only if it had a value', async () => {
    await insertProject(owner, { key: P });
    const before = await recordIn({});
    const after = await recordIn({}, { address: 'ঠিকানা' });
    await owner`update public.housing_projects set core_fields = '{"address": {"required": true}}' where key = ${P}`;
    await app`update public.housing_beneficiaries set year = 2025 where id = ${before.id}`;
    await refused(app`update public.housing_beneficiaries set address = '' where id = ${after.id}`);
  });
});

describe('extra keys', () => {
  beforeEach(async () => {
    await insertProject(owner, { key: P });
    await insertField(owner, { project_key: P, key: 'note', type: 'text' });
    await insertField(owner, { project_key: P, key: 'phone', type: 'phone', visibility: 'admin' });
    await insertField(owner, { project_key: P, key: 'old', type: 'text', is_active: false });
  });

  it('refuses an extra that is not an object', async () => {
    expect((await refused(app`
      insert into public.housing_beneficiaries (project_type, year, name, division, district, upazila, extra)
      values (${P}, 2024, 'নাম', 'বিভাগ', 'জেলা', 'উপজেলা', '[1]'::jsonb)`)).detail).toBe('extra');
  });

  it('refuses an unknown key with a fixed message', async () => {
    const err = await refused(recordIn({ zz_sentinel: 1 }));
    expect(err.detail).toBe('extra.zz_sentinel');
    expect(err.message).not.toContain('zz_sentinel');
  });

  it('leaves a malformed key out of DETAIL and the message', async () => {
    const err = await refused(recordIn({ 'Bad Key!': 1 }));
    expect(err.detail).toBe('extra');
    expect(err.message).not.toContain('Bad Key');
  });

  it('refuses a private field in extra', async () => {
    expect((await refused(recordIn({ phone: '01711222333' }))).detail).toBe('extra.phone');
  });

  it('refuses a new value for an archived field and keeps an unchanged one', async () => {
    expect((await refused(recordIn({ old: 'x' }))).detail).toBe('extra.old');
    await owner`update public.housing_project_fields set is_active = true where project_key = ${P} and key = 'old'`;
    const { id } = await recordIn({ old: 'আগের' });
    await owner`update public.housing_project_fields set is_active = false where project_key = ${P} and key = 'old'`;
    await app`update public.housing_beneficiaries set extra = ${app.json({ old: 'আগের', note: 'নতুন' })} where id = ${id}`;
    expect(await extraOf(id)).toEqual({ old: 'আগের', note: 'নতুন' });
    await refused(app`update public.housing_beneficiaries set extra = ${app.json({ old: 'বদল' })} where id = ${id}`);
  });

  it('enforces a required field on insert, and on update only once it had a value', async () => {
    await insertField(owner, { project_key: P, key: 'must', type: 'text', required: true });
    expect((await refused(recordIn({}))).detail).toBe('extra.must');
    const { id } = await recordIn({ must: 'আছে' });
    await refused(app`update public.housing_beneficiaries set extra = '{}' where id = ${id}`);
    await owner`update public.housing_project_fields set required = false where key = 'must'`;
    const plain = await recordIn({});
    await owner`update public.housing_project_fields set required = true where key = 'must'`;
    await app`update public.housing_beneficiaries set year = 2025 where id = ${plain.id}`;
  });
});

describe('photo mode', () => {
  const setPhoto = (id: string, column: 'prev_photo_url' | 'current_photo_url') =>
    app`update public.housing_beneficiaries set ${app(column)} = '/api/v1/photos/x' where id = ${id}`;

  it('refuses a before photo in an after-only project, and any photo in a no-photo project', async () => {
    await insertProject(owner, { key: P, photo_mode: 'after_only' });
    await insertProject(owner, { key: 'rules_n', photo_mode: 'none' });
    const after = await recordIn({});
    const none = await insertRecord(app, { project_type: 'rules_n' });
    expect((await refused(setPhoto(after.id, 'prev_photo_url'))).detail).toBe('prev_photo_url');
    expect((await refused(setPhoto(none.id, 'current_photo_url'))).detail).toBe('current_photo_url');
    await setPhoto(after.id, 'current_photo_url');
  });

  it('accepts both photos in a before-and-after project', async () => {
    const { id } = await insertRecord(app, { project_type: 'tin' });
    await setPhoto(id, 'prev_photo_url');
    await setPhoto(id, 'current_photo_url');
  });
});

describe('private values', () => {
  let id: string;
  beforeEach(async () => {
    await insertProject(owner, { key: P });
    await insertField(owner, { project_key: P, key: 'note', type: 'text' });
    await insertField(owner, { project_key: P, key: 'phone', type: 'phone', visibility: 'admin' });
    await insertField(owner, { project_key: P, key: 'nid', type: 'text', visibility: 'admin' });
    ({ id } = await recordIn({}));
  });

  it('refuses a public field and an unknown key', async () => {
    expect((await refused(insertPrivate(app, id, { note: SENTINEL }))).detail).toBe('private.note');
    const err = await refused(insertPrivate(app, id, { zz_sentinel: SENTINEL }));
    expect(err.detail).toBe('private.zz_sentinel');
    expect(err.message).not.toContain('zz_sentinel');
    expect((await refused(insertPrivate(app, id, { 'Bad Key!': 1 }))).detail).toBe('private');
  });

  it('keeps an unchanged archived key on update and refuses it when new or on insert', async () => {
    await insertPrivate(app, id, { nid: '123' });
    await owner`update public.housing_project_fields set is_active = false where key = 'nid'`;
    const [kept] = await app`
      update public.housing_beneficiary_private set data = ${app.json({ nid: '123', phone: '01711222333' })}
      where record_id = ${id} returning data`;
    expect(kept?.data).toEqual({ nid: '123', phone: '01711222333' });
    await refused(app`update public.housing_beneficiary_private set data = ${app.json({ nid: '456' })} where record_id = ${id}`);
    const other = await recordIn({});
    expect((await refused(insertPrivate(app, other.id, { nid: '123' }))).detail).toBe('private.nid');
  });

  it('refuses a non-object data and an unknown record', async () => {
    expect((await refused(app`
      insert into public.housing_beneficiary_private (record_id, data) values (${id}, '"x"'::jsonb)`)).detail).toBe('data');
    expect((await refused(insertPrivate(app, '00000000-0000-0000-0000-000000000000', {}))).detail).toBe('record_id');
  });
});
