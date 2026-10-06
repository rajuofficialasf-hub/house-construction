import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Sql, Tx } from '../../src/db.js';
import { appDb, insertRecord, ownerDb, resetTestData } from '../support/db.js';
import { testOwnerUrl } from '../support/env.js';
import { dbmate } from '../support/migrate.js';

const app = appDb();
const owner = ownerDb();

beforeEach(() => resetTestData(owner));
afterAll(() => Promise.all([app.end(), owner.end()]));

const INSUFFICIENT_PRIVILEGE = { code: '42501' };

describe('runtime role housing_app', () => {
  it('reads and writes records and reads the history tables', async () => {
    const rec = await insertRecord(app);
    await app`update public.housing_beneficiaries set address = 'নতুন' where id = ${rec.id}`;
    expect(await app`select address from public.housing_beneficiaries where id = ${rec.id}`).toEqual([{ address: 'নতুন' }]);
    await app`delete from public.housing_beneficiaries where id = ${rec.id}`;
    expect(await app`select count(*)::int as n from public.housing_beneficiaries`).toEqual([{ n: 0 }]);
    expect((await app`select action from public.housing_activity_log order by id`).map((r) => r.action as string)).toEqual(['create', 'update', 'delete']);
    expect(await app`select count(*)::int as n from public.housing_serial_changes`).toEqual([{ n: 0 }]);
  });

  it('cannot unlock a direct serial change by setting the session flag itself', async () => {
    const rec = await insertRecord(app);
    await expect(
      app.begin(async (tx) => {
        await tx`select set_config('housing.allow_serial_change', 'on', true)`;
        await tx`update public.housing_beneficiaries set serial_no = 99 where id = ${rec.id}`;
      }),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('cannot change the schema', async () => {
    await expect(app`create table public.x (id int)`).rejects.toMatchObject(INSUFFICIENT_PRIVILEGE);
    await expect(app`alter table public.housing_beneficiaries add column x int`).rejects.toMatchObject(INSUFFICIENT_PRIVILEGE);
  });

  it('cannot edit or delete history, or set counters directly', async () => {
    await insertRecord(app);
    await expect(app`update public.housing_activity_log set actor_email = 'someone'`).rejects.toMatchObject(INSUFFICIENT_PRIVILEGE);
    await expect(app`delete from public.housing_activity_log`).rejects.toMatchObject(INSUFFICIENT_PRIVILEGE);
    await expect(app`insert into public.housing_activity_log (action) values ('fake')`).rejects.toMatchObject(INSUFFICIENT_PRIVILEGE);
    await expect(app`update public.housing_serial_counters set last_serial = 0`).rejects.toMatchObject(INSUFFICIENT_PRIVILEGE);
    await expect(app`delete from public.housing_serial_changes`).rejects.toMatchObject(INSUFFICIENT_PRIVILEGE);
  });

  it('cannot read the migration bookkeeping', async () => {
    await expect(app`select * from public.schema_migrations`).rejects.toMatchObject(INSUFFICIENT_PRIVILEGE);
  });
});

describe('table privileges', () => {
  it('grants no table to PUBLIC', async () => {
    const rows = await owner`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'v', 'S')
        and exists (select from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a where a.grantee = 0)`;
    expect(rows).toEqual([]);
  });
});

describe('function privileges', () => {
  const publicExecutable = (tx: Sql | Tx) => tx`
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and exists (select from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                  where a.grantee = 0 and a.privilege_type = 'EXECUTE')`;

  it('grants no function to PUBLIC', async () => {
    expect(await publicExecutable(owner)).toEqual([]);
  });

  it('lets housing_app run the custom-value check the record triggers call', async () => {
    const [row] = await app`
      select has_function_privilege('public.housing_field_value(public.housing_project_fields, jsonb)', 'execute') as ok`;
    expect(row).toEqual({ ok: true });
  });

  it('lets housing_app run the bulk insert and the leaf-keys lookup', async () => {
    const [row] = await app`
      select has_function_privilege('public.housing_bulk_insert_records(text, jsonb, boolean)', 'execute') as insert,
             has_function_privilege('public.housing_project_leaf_keys(text)', 'execute') as leaves`;
    expect(row).toEqual({ insert: true, leaves: true });
  });

  it('runs the log triggers as the owner with a fixed search_path', async () => {
    const rows = await owner`
      select proname, prosecdef, proconfig from pg_proc
      where proname in ('housing_log_record_change', 'housing_log_private_change') order by proname`;
    expect(rows).toEqual([
      { proname: 'housing_log_private_change', prosecdef: true, proconfig: ['search_path=public'] },
      { proname: 'housing_log_record_change', prosecdef: true, proconfig: ['search_path=public'] },
    ]);
  });

  it('keeps functions added by later migrations away from PUBLIC', async () => {
    await expect(
      owner.begin(async (tx) => {
        await tx`create function public.housing_probe() returns int language sql as 'select 1'`;
        expect(await publicExecutable(tx)).toEqual([]);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
  });
});

describe('migrations', () => {
  it('leave nothing pending on the test database', async () => {
    expect(await dbmate(testOwnerUrl, 'status')).toMatch(/Pending: 0/);
  });
});
