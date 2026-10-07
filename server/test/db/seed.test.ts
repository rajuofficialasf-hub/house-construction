import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ownerDb, resetTestData } from '../support/db.js';
import { testOwnerUrl } from '../support/env.js';

const run = promisify(execFile);
const serverDir = fileURLToPath(new URL('../..', import.meta.url));
const tsx = fileURLToPath(new URL('../../node_modules/.bin/tsx', import.meta.url));
const owner = ownerDb();

// HOUSING_DEV_COMPOSE is always set, so a developer's shell or the compose container can't change a case.
function seed(url: string, args: string[] = [], env: Record<string, string> = {}) {
  return run(tsx, ['scripts/db-seed.ts', ...args], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_MIGRATION_URL: url, HOUSING_DEV_COMPOSE: '', ...env },
  });
}

async function counts() {
  return owner`
    select c.project_type, c.last_serial, (select count(*)::int from public.housing_beneficiaries b where b.project_type = c.project_type) as records
    from public.housing_serial_counters c order by c.project_type`;
}

beforeEach(() => resetTestData(owner));
afterAll(() => owner.end());

describe('db:seed', () => {
  it('loads 6 demo, 12 semi_pucca and 8 tin records and moves the counters past them', async () => {
    await seed(testOwnerUrl);
    expect(await counts()).toEqual([
      { project_type: 'demo', last_serial: 6, records: 6 },
      { project_type: 'semi_pucca', last_serial: 12, records: 12 },
      { project_type: 'tin', last_serial: 8, records: 8 },
    ]);
  });

  it('can run twice without duplicating records, fields or private values', async () => {
    await seed(testOwnerUrl);
    await seed(testOwnerUrl);
    expect((await counts()).map((r) => r.records)).toEqual([6, 12, 8]);
    const [n] = await owner`
      select (select count(*)::int from public.housing_project_fields where project_key = 'demo') as fields,
             (select count(*)::int from public.housing_beneficiary_private) as private`;
    expect(n).toEqual({ fields: 4, private: 6 });
  });

  it('makes demo a draft with public money, number and category fields and a private phone field', async () => {
    await seed(testOwnerUrl);
    const [project] = await owner`select is_published, photo_mode from public.housing_projects where key = 'demo'`;
    expect(project).toEqual({ is_published: false, photo_mode: 'after_only' });
    const fields = await owner`select key, type, visibility from public.housing_project_fields where project_key = 'demo' order by sort_order`;
    expect(fields).toEqual([
      { key: 'amount', type: 'money', visibility: 'public' },
      { key: 'family_size', type: 'number', visibility: 'public' },
      { key: 'trade', type: 'category', visibility: 'public' },
      { key: 'phone', type: 'phone', visibility: 'admin' },
    ]);
    const [extra] = await owner`select extra from public.housing_beneficiaries where project_type = 'demo' and serial_no = 1`;
    expect(extra?.extra).toEqual({ amount: 25000, family_size: 5, trade: 'দর্জি' });
  });

  it('keeps demo out of what a visitor sees', async () => {
    await seed(testOwnerUrl);
    const [row] = await owner`select public.housing_projects_overview(false) as o`;
    const overview = row?.o as { projects: { key: string }[]; global: { total: number } };
    expect(overview.projects.map((p) => p.key)).not.toContain('demo');
    expect(overview.global.total).toBe(20);
  });

  it('refuses a database that is not on this machine', async () => {
    await expect(seed('postgres://housing_owner:x@db.example.org:5432/housing')).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('must point at a local database'),
    });
    expect((await counts()).map((r) => r.records)).toEqual([0, 0]);
  });

  it('refuses the compose host db without HOUSING_DEV_COMPOSE=1', async () => {
    await expect(seed('postgres://housing_owner:x@db:5432/housing')).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('got host "db"'),
    });
  });

  it('accepts the compose host db with HOUSING_DEV_COMPOSE=1, and nothing else', async () => {
    // The host doesn't resolve here, so the run fails, but past the host check.
    const viaCompose = seed('postgres://housing_owner:x@db:5432/housing', [], { HOUSING_DEV_COMPOSE: '1' });
    await expect(viaCompose).rejects.toMatchObject({ code: 1 });
    await expect(viaCompose).rejects.not.toMatchObject({ stderr: expect.stringContaining('must point at a local database') });
    await expect(seed('postgres://housing_owner:x@example.com:5432/housing', [], { HOUSING_DEV_COMPOSE: '1' })).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('got host "example.com"'),
    });
  });

  it('refuses an unknown flag', async () => {
    await expect(seed(testOwnerUrl, ['--if-emtpy'])).rejects.toMatchObject({ code: 1 });
    expect((await counts()).map((r) => r.records)).toEqual([0, 0]);
  });

  it('rolls back both files when the seed fails partway', async () => {
    // The last statement of demo-project.sql writes private values; make it fail.
    await owner`create function public.seed_test_fail() returns trigger language plpgsql as $$ begin raise exception 'seed_test_fail'; end $$`;
    await owner`create trigger seed_test_fail before insert on public.housing_beneficiary_private for each row execute function public.seed_test_fail()`;
    try {
      await expect(seed(testOwnerUrl)).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('seed_test_fail') });
    } finally {
      await owner`drop trigger seed_test_fail on public.housing_beneficiary_private`;
      await owner`drop function public.seed_test_fail()`;
    }
    expect((await counts()).map((r) => r.records)).toEqual([0, 0]);
    const [demo] = await owner`select count(*)::int as n from public.housing_projects where key = 'demo'`;
    expect(demo?.n).toBe(0);
  });
});

describe('db:seed --if-empty', () => {
  it('seeds a fresh database', async () => {
    const { stdout } = await seed(testOwnerUrl, ['--if-empty']);
    expect(stdout).toContain('seeded:');
    expect((await counts()).map((r) => r.records)).toEqual([6, 12, 8]);
  });

  it('skips a database that has records', async () => {
    await seed(testOwnerUrl);
    await owner`delete from public.housing_beneficiaries where project_type = 'tin' and serial_no = 3`;
    const before = await counts();
    const { stdout } = await seed(testOwnerUrl, ['--if-empty']);
    expect(stdout).toContain('seed skipped');
    expect(await counts()).toEqual(before);
  });

  it('skips a database whose records were all deleted, because serials are never reused', async () => {
    await seed(testOwnerUrl);
    await owner`delete from public.housing_beneficiaries`;
    const { stdout } = await seed(testOwnerUrl, ['--if-empty']);
    expect(stdout).toContain('seed skipped');
    expect((await counts()).map((r) => r.records)).toEqual([0, 0, 0]);
  });
});

describe('resetTestData', () => {
  it('empties the records and restarts serials at 1', async () => {
    await seed(testOwnerUrl);
    await resetTestData(owner);
    expect(await counts()).toEqual([
      { project_type: 'semi_pucca', last_serial: 0, records: 0 },
      { project_type: 'tin', last_serial: 0, records: 0 },
    ]);
  });
});
