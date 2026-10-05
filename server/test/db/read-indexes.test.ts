import { afterAll, describe, expect, it } from 'vitest';
import { ownerDb } from '../support/db.js';

const owner = ownerDb();
afterAll(() => owner.end());

const indexedColumns = async () =>
  (
    await owner`
      select a.attname from pg_index i
      join pg_class t on t.oid = i.indrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = t.oid and a.attnum = i.indkey[0]
      where n.nspname = 'public' and t.relname = 'housing_beneficiaries' and i.indnatts = 1`
  ).map((r) => r.attname as string);

describe('housing_beneficiaries indexes', () => {
  it('index every single column the list filters or sorts on (DB-MIG-07)', async () => {
    expect(await indexedColumns()).toEqual(
      expect.arrayContaining(['serial_no', 'year', 'name', 'created_at', 'division', 'district', 'upazila']),
    );
  });
});
