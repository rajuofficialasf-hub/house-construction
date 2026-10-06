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

function seed(url: string) {
  return run(tsx, ['scripts/db-seed.ts'], { cwd: serverDir, env: { ...process.env, DATABASE_MIGRATION_URL: url } });
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
