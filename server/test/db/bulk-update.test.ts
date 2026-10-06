// housing_bulk_update_by_serial, v2 since server/db/migrations/0014_record_functions_v2.sql.
import type postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, insertField, insertPrivate, insertProject, insertRecord, ownerDb, resetTestData } from '../support/db.js';

const app = appDb();
const owner = ownerDb();

beforeEach(async () => {
  await resetTestData(owner);
  await insertRecord(app, { name: 'প্রথম' });
  await insertRecord(app, { name: 'দ্বিতীয়' });
});
afterAll(() => Promise.all([app.end(), owner.end()]));

function bulk(rows: unknown[], projectType = 'semi_pucca') {
  return app<{ r: { updated: number; missing: number[] } }[]>`
    select public.housing_bulk_update_by_serial(${projectType}, ${app.json(rows as postgres.JSONValue)}) as r`;
}

async function names(): Promise<string[]> {
  return (await app`select name from public.housing_beneficiaries order by serial_no`).map((r) => r.name as string);
}

describe('housing_bulk_update_by_serial', () => {
  it('updates rows by serial and reports serials that do not exist', async () => {
    const [res] = await bulk([
      { serial_no: 1, name: 'নতুন প্রথম' },
      { serial_no: 9, name: 'নেই' },
    ]);
    expect(res?.r).toEqual({ updated: 1, missing: [9] });
    expect(await names()).toEqual(['নতুন প্রথম', 'দ্বিতীয়']);
  });

  it('leaves fields that are absent or empty unchanged', async () => {
    await bulk([{ serial_no: 2, name: '', year: 2025 }]);
    const [row] = await app`select name, year from public.housing_beneficiaries where serial_no = 2`;
    expect(row).toEqual({ name: 'দ্বিতীয়', year: 2025 });
  });

  it('changes nothing when any row lacks a serial', async () => {
    await expect(bulk([{ serial_no: 1, name: 'বদল' }, { name: 'সিরিয়াল নেই' }])).rejects.toMatchObject({ code: '23502' });
    expect(await names()).toEqual(['প্রথম', 'দ্বিতীয়']);
  });

  it('refuses more than 500 rows and an unknown project type', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({ serial_no: i + 1 }));
    await expect(bulk(rows)).rejects.toMatchObject({ code: '22023' });
    await expect(bulk([{ serial_no: 1 }], 'brick')).rejects.toMatchObject({ code: 'HC400', detail: 'project_type' });
  });

  it('leaves father_or_husband_name and address unchanged on an empty string', async () => {
    await app`update public.housing_beneficiaries set father_or_husband_name = 'বাবা', address = 'ঠিকানা' where serial_no = 1`;
    await bulk([{ serial_no: 1, father_or_husband_name: '', address: '' }]);
    const [row] = await app`select father_or_husband_name, address from public.housing_beneficiaries where serial_no = 1`;
    expect(row).toEqual({ father_or_husband_name: 'বাবা', address: 'ঠিকানা' });
  });
});

describe('housing_bulk_update_by_serial with custom and private fields', () => {
  const P = 'bulk_p';

  beforeEach(async () => {
    await resetTestData(owner);
    await insertProject(owner, { key: P, core_fields: { address: { required: true } } });
    await insertField(owner, { project_key: P, key: 'amount', type: 'money' });
    await insertField(owner, { project_key: P, key: 'item', type: 'text' });
    await insertField(owner, { project_key: P, key: 'size', type: 'number', required: true });
    await insertField(owner, { project_key: P, key: 'phone', type: 'phone', visibility: 'admin' });
    await insertField(owner, { project_key: P, key: 'nid', type: 'text', visibility: 'admin' });
  });

  const record = (serial: number, more: Parameters<typeof insertRecord>[1] = {}) =>
    insertRecord(app, { project_type: P, serial_no: serial, address: 'ঠিকানা', extra: { size: 3 }, ...more });
  const row = async (serial: number) =>
    (await app`select b.union_name, b.address, b.prev_photo_source, b.extra, p.data as private
               from public.housing_beneficiaries b left join public.housing_beneficiary_private p on p.record_id = b.id
               where b.project_type = ${P} and b.serial_no = ${serial}`)[0];

  it('merges extra, keeping keys the row does not send', async () => {
    await record(1, { extra: { size: 3, amount: 100 } });
    await bulk([{ serial_no: 1, extra: { item: 'ঢেউটিন', amount: '' } }], P);
    expect((await row(1))?.extra).toEqual({ size: 3, amount: 100, item: 'ঢেউটিন' });
  });

  it('empties the columns and extra keys listed in _clear', async () => {
    await record(1, { union_name: 'ধামশ্রেণী', extra: { size: 3, item: 'ঢেউটিন' } });
    await app`update public.housing_beneficiaries set prev_photo_source = 'link' where serial_no = 1 and project_type = ${P}`;
    await bulk([{ serial_no: 1, _clear: ['union_name', 'prev_photo_source', 'extra.item'] }], P);
    expect(await row(1)).toMatchObject({ union_name: '', prev_photo_source: null, extra: { size: 3 } });
  });

  it('refuses to clear a required field and names the failing row', async () => {
    await record(1);
    await record(2);
    for (const clear of [['address'], ['extra.size']]) {
      const err = await bulk([{ serial_no: 1, name: 'বদল' }, { serial_no: 2, _clear: clear }], P).catch((e: unknown) => e);
      expect(err).toMatchObject({ code: 'HC400', hint: 'row_index=1' });
    }
    expect((await app`select name from public.housing_beneficiaries where serial_no = 1 and project_type = ${P}`)[0]?.name).toBe('পরীক্ষা নাম');
  });

  it('sends private keys to the private table, never to extra', async () => {
    await record(1);
    await bulk([{ serial_no: 1, extra: { phone: '০১৭১১২২২৩৩৩', amount: 50 } }], P);
    expect(await row(1)).toMatchObject({ extra: { size: 3, amount: 50 }, private: { phone: '01711222333' } });
  });

  it('merges private keys into an existing private row', async () => {
    const { id } = await record(1);
    await insertPrivate(app, id, { phone: '01711222333' });
    await bulk([{ serial_no: 1, extra: { nid: '1234567890' } }], P);
    expect((await row(1))?.private).toEqual({ phone: '01711222333', nid: '1234567890' });
  });

  it('accepts an unchanged archived private key already stored, and refuses a new value for it', async () => {
    const { id } = await record(1);
    await insertPrivate(app, id, { phone: '01711222333' });
    await owner`update public.housing_project_fields set is_active = false where project_key = ${P} and key = 'phone'`;
    await bulk([{ serial_no: 1, extra: { phone: '01711222333', nid: '1234567890' } }], P);
    expect((await row(1))?.private).toEqual({ phone: '01711222333', nid: '1234567890' });
    await expect(bulk([{ serial_no: 1, extra: { phone: '01711999888' } }], P)).rejects.toMatchObject({
      code: 'HC400',
      detail: 'private.phone',
      hint: 'row_index=0',
    });
  });

  it('does not clear a private key named in _clear', async () => {
    const { id } = await record(1);
    await insertPrivate(app, id, { phone: '01711222333' });
    await bulk([{ serial_no: 1, _clear: ['extra.phone'] }], P);
    expect((await row(1))?.private).toEqual({ phone: '01711222333' });
  });

  it('refuses a group with no hint', async () => {
    await insertProject(owner, { key: 'bulk_g', is_group: true });
    const err = await bulk([{ serial_no: 1 }], 'bulk_g').catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'HC400', detail: 'project_type' });
    expect((err as { hint?: string }).hint).toBeUndefined();
  });

  it('rolls back earlier rows when a later row fails', async () => {
    await record(1);
    await record(2);
    await record(3);
    const err = await bulk(
      [{ serial_no: 1, extra: { amount: 10 } }, { serial_no: 2, extra: { amount: 20 } }, { serial_no: 3, extra: { amount: 1.5 } }],
      P,
    ).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'HC400', detail: 'extra.amount', hint: 'row_index=2' });
    expect((await row(1))?.extra).toEqual({ size: 3 });
    expect((await row(2))?.extra).toEqual({ size: 3 });
  });
});
