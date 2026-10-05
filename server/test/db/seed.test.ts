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
  it('loads 12 semi_pucca and 8 tin records and moves the counters past them', async () => {
    await seed(testOwnerUrl);
    expect(await counts()).toEqual([
      { project_type: 'semi_pucca', last_serial: 12, records: 12 },
      { project_type: 'tin', last_serial: 8, records: 8 },
    ]);
  });

  it('can run twice without duplicating records', async () => {
    await seed(testOwnerUrl);
    await seed(testOwnerUrl);
    expect((await counts()).map((r) => r.records)).toEqual([12, 8]);
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
