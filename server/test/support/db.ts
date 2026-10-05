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
  await owner`truncate public.housing_activity_log, public.housing_serial_changes, public.housing_files,
    public.housing_beneficiaries, public.housing_admin_sessions, public.housing_admins restart identity`;
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
  father_or_husband_name?: string;
  address?: string;
  created_at?: Date;
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
    father_or_husband_name: input.father_or_husband_name ?? '',
    address: input.address ?? '',
    ...(input.serial_no !== undefined && { serial_no: input.serial_no }),
    ...(input.created_at && { created_at: input.created_at }),
  };
  const [inserted] = await sql<InsertedRecord[]>`
    insert into public.housing_beneficiaries ${sql(row)} returning id, serial_no`;
  if (!inserted) throw new Error('insert returned no row');
  return inserted;
}

export interface AdminInput {
  email?: string;
  name?: string | null;
  passwordHash?: string;
  disabled?: boolean;
}

export interface InsertedAdmin {
  id: string;
  email: string;
  name: string | null;
}

/** Inserts an admin as the owner, the way the admin CLI does. The default hash matches no password. */
export async function insertAdmin(owner: Sql, input: AdminInput = {}): Promise<InsertedAdmin> {
  const row = {
    email: input.email ?? 'admin@example.org',
    name: input.name === undefined ? 'এডমিন' : input.name,
    password_hash: input.passwordHash ?? 'not-a-hash',
    disabled_at: input.disabled ? new Date() : null,
  };
  const [inserted] = await owner<InsertedAdmin[]>`
    insert into public.housing_admins ${owner(row)} returning id, email, name`;
  if (!inserted) throw new Error('insert returned no row');
  return inserted;
}
