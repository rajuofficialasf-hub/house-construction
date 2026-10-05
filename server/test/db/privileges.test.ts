import { afterAll, beforeEach, describe, expect, it } from 'vitest';
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
    await expect(app`select count(*) from public.housing_activity_log`).resolves.toBeDefined();
    await expect(app`select count(*) from public.housing_serial_changes`).resolves.toBeDefined();
    await app`delete from public.housing_beneficiaries where id = ${rec.id}`;
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

describe('migrations', () => {
  it('leave nothing pending on the test database', async () => {
    expect(await dbmate(testOwnerUrl, 'status')).toMatch(/Pending: 0/);
  });
});
