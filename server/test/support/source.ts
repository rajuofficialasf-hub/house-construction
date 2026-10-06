import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { hash as bcryptHash } from '@node-rs/bcrypt';
import postgres from 'postgres';
import type { Sql } from '../../src/db.js';
import { assertLocalDatabaseUrl } from '../../scripts/local-db.js';

// A stand-in for the Supabase database the import reads: housing_source_test, rebuilt from
// test/fixtures/supabase-source.sql. Like the other test databases it must be local and named *_test
// (TS-03), so the import tests can never read real data.
const DEFAULT_URL = 'postgres://housing_owner:housing_owner_local@127.0.0.1:5432/housing_source_test?sslmode=disable';

export const testSourceUrl = (() => {
  const url = assertLocalDatabaseUrl('TEST_SOURCE_DATABASE_URL', process.env.TEST_SOURCE_DATABASE_URL ?? DEFAULT_URL);
  if (!new URL(url).pathname.endsWith('_test')) throw new Error('TEST_SOURCE_DATABASE_URL must name a database ending in _test');
  return url;
})();

const fixture = fileURLToPath(new URL('../fixtures/supabase-source.sql', import.meta.url));

/** Connects to the source stand-in as its owner, to build the data each test reads. */
export function sourceDb(): Sql {
  return postgres(testSourceUrl, { max: 1, onnotice: () => {} });
}

/** Rebuilds the source tables, empty, with both counters at 0. */
export async function resetSource(src: Sql): Promise<void> {
  try {
    await src`drop schema if exists auth cascade`;
  } catch (err) {
    if ((err as { code?: string }).code === '3D000') {
      throw new Error(
        'housing_source_test is missing; create it once: docker compose exec db createdb -U postgres -O housing_owner housing_source_test',
      );
    }
    throw err;
  }
  await src`drop schema if exists public cascade`;
  await src`create schema public`;
  await src.file(fixture);
}

export interface SourceRecordInput {
  id?: string;
  project_type?: 'semi_pucca' | 'tin';
  serial_no: number;
  name?: string;
  created_at?: string;
  updated_at?: string;
  photo_updated_at?: string | null;
  prev_photo_url?: string | null;
  prev_thumb_url?: string | null;
  current_photo_url?: string | null;
  current_thumb_url?: string | null;
}

export async function insertSourceRecord(src: Sql, input: SourceRecordInput): Promise<string> {
  const id = input.id ?? randomUUID();
  const row = {
    id,
    project_type: input.project_type ?? 'semi_pucca',
    serial_no: input.serial_no,
    year: 2024,
    name: input.name ?? `নাম ${input.serial_no}`,
    father_or_husband_name: 'পিতা',
    division: 'রংপুর',
    district: 'কুড়িগ্রাম',
    upazila: 'উলিপুর',
    address: 'গ্রাম',
    prev_photo_url: input.prev_photo_url ?? null,
    prev_thumb_url: input.prev_thumb_url ?? null,
    current_photo_url: input.current_photo_url ?? null,
    current_thumb_url: input.current_thumb_url ?? null,
    prev_photo_source: 'https://drive.example/prev',
    current_photo_source: null,
    photo_updated_at: input.photo_updated_at ?? null,
    created_at: input.created_at ?? '2025-01-02 03:04:05.123456+00',
    updated_at: input.updated_at ?? '2025-02-03 04:05:06.654321+00',
  };
  await src`insert into public.housing_beneficiaries ${src(row)}`;
  return id;
}

export async function setSourceCounter(src: Sql, projectType: 'semi_pucca' | 'tin', lastSerial: number): Promise<void> {
  await src`update public.housing_serial_counters set last_serial = ${lastSerial} where project_type = ${projectType}`;
}

export interface SourceUserInput {
  id?: string;
  email: string | null;
  password?: string;
  encrypted_password?: string | null;
  name?: string;
  deleted?: boolean;
  banned?: boolean;
  /** Also list the user in public.housing_admins (default true). */
  admin?: boolean;
}

/** Adds an auth.users row (bcrypt hash of `password`, as GoTrue stores it) and, by default, makes it an admin. */
export async function insertSourceUser(src: Sql, input: SourceUserInput): Promise<string> {
  const id = input.id ?? randomUUID();
  const encrypted =
    input.encrypted_password !== undefined ? input.encrypted_password : input.password ? await bcryptHash(input.password, 4) : null;
  await src`
    insert into auth.users (id, email, encrypted_password, raw_user_meta_data, created_at, deleted_at, banned_until)
    values (${id}, ${input.email}, ${encrypted}, ${src.json(input.name ? { name: input.name } : {})},
      '2024-06-07 08:09:10.111213+00',
      ${input.deleted ? '2025-01-01 00:00:00+00' : null},
      ${input.banned ? '2999-01-01 00:00:00+00' : null})`;
  if (input.admin ?? true) await src`insert into public.housing_admins (user_id, email) values (${id}, ${input.email})`;
  return id;
}
