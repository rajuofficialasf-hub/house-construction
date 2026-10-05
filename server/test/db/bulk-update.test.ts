import type postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, insertRecord, ownerDb, resetTestData } from '../support/db.js';

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
    await expect(bulk([{ serial_no: 1 }], 'brick')).rejects.toMatchObject({ code: '23514' });
  });
});
