// The housing_files table (server/db/migrations/0009_housing_files.sql), exercised as the runtime role.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Sql } from '../../src/db.js';
import { appDb, insertAdmin, insertRecord, ownerDb, resetTestData } from '../support/db.js';

const app = appDb();
const owner = ownerDb();

beforeEach(() => resetTestData(owner));
afterAll(() => Promise.all([app.end(), owner.end()]));

let n = 0;
function fileRow(recordId: string | null, overrides: Record<string, unknown> = {}) {
  return {
    record_id: recordId,
    kind: 'prev',
    variant: 'photo',
    storage_key: `housing/test-${n++}.webp`,
    storage_driver: 'nas',
    content_type: 'image/webp',
    size_bytes: 1234,
    ...overrides,
  };
}

async function insertFile(sql: Sql, row: Record<string, unknown>): Promise<string> {
  const [inserted] = await sql<{ id: string }[]>`insert into public.housing_files ${sql(row)} returning id`;
  return inserted!.id;
}

describe('housing_files', () => {
  it('lets housing_app insert, read, update and delete file rows', async () => {
    const rec = await insertRecord(app);
    const admin = await insertAdmin(owner);
    const id = await insertFile(app, fileRow(rec.id, { created_by: admin.id, original_name: 'ছবি.jpg' }));
    const [row] = await app`select record_id, created_by, deleted_at, created_at from public.housing_files where id = ${id}`;
    expect(row).toMatchObject({ record_id: rec.id, created_by: admin.id, deleted_at: null });
    expect(row!.created_at).toBeInstanceOf(Date);
    await app`update public.housing_files set deleted_at = now() where id = ${id}`;
    await app`delete from public.housing_files where id = ${id}`;
    expect(await app`select count(*)::int as n from public.housing_files`).toEqual([{ n: 0 }]);
  });

  it('allows one live file per record slot, plus any number of tombstones', async () => {
    const rec = await insertRecord(app);
    const first = await insertFile(app, fileRow(rec.id));
    await expect(insertFile(app, fileRow(rec.id))).rejects.toMatchObject({ code: '23505' });
    await insertFile(app, fileRow(rec.id, { variant: 'thumb' }));
    await insertFile(app, fileRow(rec.id, { kind: 'current' }));
    await app`update public.housing_files set deleted_at = now() where id = ${first}`;
    await insertFile(app, fileRow(rec.id));
    await insertFile(app, fileRow(rec.id, { deleted_at: new Date() }));
    expect(await app`select count(*)::int as n from public.housing_files where record_id = ${rec.id}`).toEqual([{ n: 5 }]);
  });

  it('keeps file rows when their record is deleted, detached from it', async () => {
    const rec = await insertRecord(app);
    const id = await insertFile(app, fileRow(rec.id));
    await app`delete from public.housing_beneficiaries where id = ${rec.id}`;
    expect(await app`select record_id from public.housing_files where id = ${id}`).toEqual([{ record_id: null }]);
  });

  it('refuses a duplicate storage key', async () => {
    await insertFile(app, fileRow(null, { storage_key: 'housing/same.webp' }));
    await expect(insertFile(app, fileRow(null, { storage_key: 'housing/same.webp' }))).rejects.toMatchObject({ code: '23505' });
  });

  it.each([
    { kind: 'side' },
    { variant: 'large' },
    { storage_driver: 'ftp' },
    { size_bytes: -1 },
    { original_name: 'x'.repeat(256) },
  ])('refuses %j', async (overrides) => {
    await expect(insertFile(app, fileRow(null, overrides))).rejects.toMatchObject({ code: '23514' });
  });

  it('gives housing_app exactly select, insert, update and delete', async () => {
    const rows = await owner<{ privilege_type: string }[]>`
      select privilege_type from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'housing_files' and grantee = 'housing_app'
      order by privilege_type`;
    expect(rows.map((r) => r.privilege_type)).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
  });
});
