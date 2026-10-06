// housing_bulk_insert_records (server/db/migrations/0014_record_functions_v2.sql), as the runtime role meets it.
import type postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, insertField, insertProject, insertRecord, ownerDb, resetTestData } from '../support/db.js';

const app = appDb();
const owner = ownerDb();
const P = 'ins_p';

beforeEach(async () => {
  await resetTestData(owner);
  await insertProject(owner, { key: P, is_published: false });
  await insertField(owner, { project_key: P, key: 'amount', type: 'money' });
  await insertField(owner, { project_key: P, key: 'phone', type: 'phone', visibility: 'admin' });
});
afterAll(() => Promise.all([app.end(), owner.end()]));

const base = { year: 2024, name: 'নাম', division: 'রংপুর', district: 'কুড়িগ্রাম', upazila: 'উলিপুর' };

function insert(rows: unknown[], useGiven = false, key = P) {
  return app<{ n: number }[]>`
    select public.housing_bulk_insert_records(${key}, ${app.json(rows as postgres.JSONValue)}, ${useGiven}) as n`;
}

async function stored() {
  return app`select b.serial_no, b.union_name, b.extra, p.data as private
             from public.housing_beneficiaries b left join public.housing_beneficiary_private p on p.record_id = b.id
             where b.project_type = ${P} order by b.serial_no`;
}

describe('housing_bulk_insert_records', () => {
  it('assigns consecutive serials and splits private keys out of extra, in a draft project', async () => {
    const [res] = await insert([
      { ...base, union_name: 'ধামশ্রেণী', extra: { amount: 500, phone: '০১৭১১২২২৩৩৩' } },
      { ...base, extra: { amount: 700, phone: '' } },
    ]);
    expect(res?.n).toBe(2);
    expect(await stored()).toEqual([
      { serial_no: 1, union_name: 'ধামশ্রেণী', extra: { amount: 500 }, private: { phone: '01711222333' } },
      { serial_no: 2, union_name: '', extra: { amount: 700 }, private: null },
    ]);
  });

  it('keeps given serials and moves the counter past the highest', async () => {
    await insert([{ ...base, serial_no: 7 }, { ...base, serial_no: 3 }], true);
    expect((await stored()).map((r) => r.serial_no)).toEqual([3, 7]);
    const [next] = await app`select public.housing_next_serial(${P}) as n`;
    expect(next?.n).toBe(8);
  });

  it('refuses a serial already in the database with the row that had it', async () => {
    await insertRecord(app, { project_type: P, serial_no: 5 });
    const err = await insert([{ ...base, serial_no: 4 }, { ...base, serial_no: 5 }], true).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'HC409', detail: 'serial_no', hint: 'row_index=1' });
    expect((await stored()).map((r) => r.serial_no)).toEqual([5]);
  });

  it('refuses an invalid custom value with its row, and stores nothing', async () => {
    const err = await insert([{ ...base }, { ...base }, { ...base, extra: { amount: 1.5 } }]).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'HC400', detail: 'extra.amount', hint: 'row_index=2' });
    expect(await stored()).toEqual([]);
  });

  it('refuses a group or an unknown project without a row index', async () => {
    await insertProject(owner, { key: 'ins_g', is_group: true });
    for (const key of ['ins_g', 'nope']) {
      const err = await insert([base], false, key).catch((e: unknown) => e);
      expect(err).toMatchObject({ code: 'HC400', detail: 'project_type' });
      expect((err as { hint?: string }).hint).toBeUndefined();
    }
  });

  it('refuses more than 500 rows', async () => {
    await expect(insert(Array.from({ length: 501 }, () => base))).rejects.toMatchObject({ code: '22023' });
  });
});
