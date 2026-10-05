import postgres from 'postgres';
import type { Sql, Tx } from '../../src/db.js';
import { testAppUrl, testOwnerUrl } from './env.js';

/** Connects as the runtime role, the way the API does. */
export function appDb(): Sql {
  return postgres(testAppUrl, { max: 2, onnotice: () => {} });
}

/** Connects as the schema owner, for resetting data and checking tables the app can't write. */
export function ownerDb(): Sql {
  return postgres(testOwnerUrl, { max: 1, onnotice: () => {} });
}

/**
 * Empties every housing table and zeroes the serial counters, so each test starts from the
 * state of a fresh install. TRUNCATE doesn't fire row triggers, so nothing is logged.
 */
export async function resetTestData(owner: Sql): Promise<void> {
  await owner`truncate public.housing_activity_log, public.housing_serial_changes, public.housing_beneficiaries restart identity`;
  await owner`update public.housing_serial_counters set last_serial = 0`;
}

export type ProjectType = 'semi_pucca' | 'tin';

export interface RecordInput {
  project_type?: ProjectType;
  serial_no?: number;
  year?: number;
  name?: string;
  division?: string;
  district?: string;
  upazila?: string;
}

export interface InsertedRecord {
  id: string;
  serial_no: number;
}

/** Inserts one record; serial_no is left to the trigger unless given. */
export async function insertRecord(sql: Sql | Tx, input: RecordInput = {}): Promise<InsertedRecord> {
  const row = {
    project_type: input.project_type ?? 'semi_pucca',
    year: input.year ?? 2024,
    name: input.name ?? 'পরীক্ষা নাম',
    division: input.division ?? 'রংপুর',
    district: input.district ?? 'কুড়িগ্রাম',
    upazila: input.upazila ?? 'উলিপুর',
    ...(input.serial_no !== undefined && { serial_no: input.serial_no }),
  };
  const [inserted] = await sql<InsertedRecord[]>`
    insert into public.housing_beneficiaries ${sql(row)} returning id, serial_no`;
  if (!inserted) throw new Error('insert returned no row');
  return inserted;
}
