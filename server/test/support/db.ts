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
 * Empties every housing table, restores the project registry to the rows the migrations seed and
 * zeroes their serial counters, so each test starts from the state of a fresh install. TRUNCATE
 * doesn't fire row triggers, so nothing is logged.
 */
export async function resetTestData(owner: Sql): Promise<void> {
  await owner`truncate public.housing_activity_log, public.housing_serial_changes, public.housing_files,
    public.housing_beneficiary_private, public.housing_beneficiaries, public.housing_project_fields,
    public.housing_projects, public.housing_admin_sessions, public.housing_admins restart identity`;
  await owner`select public.housing_seed_projects()`;
  await owner`delete from public.housing_serial_counters
    where project_type not in (select key from public.housing_projects)`;
  await owner`update public.housing_serial_counters set last_serial = 0`;
}

/** A project key; the seeded leaf projects are semi_pucca and tin. */
export type ProjectType = string;

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
  union_name?: string;
  extra?: Record<string, unknown>;
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
    union_name: input.union_name ?? '',
    extra: sql.json((input.extra ?? {}) as Parameters<typeof sql.json>[0]),
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
  role?: AdminRole;
}

export type AdminRole = 'admin' | 'main_admin';

export interface InsertedAdmin {
  id: string;
  email: string;
  name: string | null;
  role: AdminRole;
}

/** Inserts an admin as the owner, the way the admin CLI does. The default hash matches no password. */
export async function insertAdmin(owner: Sql, input: AdminInput = {}): Promise<InsertedAdmin> {
  const row = {
    email: input.email ?? 'admin@example.org',
    name: input.name === undefined ? 'এডমিন' : input.name,
    password_hash: input.passwordHash ?? 'not-a-hash',
    disabled_at: input.disabled ? new Date() : null,
    role: input.role ?? 'admin',
  };
  const [inserted] = await owner<InsertedAdmin[]>`
    insert into public.housing_admins ${owner(row)} returning id, email, name, role`;
  if (!inserted) throw new Error('insert returned no row');
  return inserted;
}

export interface ProjectInput {
  key: string;
  parent_key?: string | null;
  is_group?: boolean;
  slug?: string;
  name_bn?: string;
  name_en?: string;
  file_prefix?: string | null;
  is_published?: boolean;
  sort_order?: number;
  photo_mode?: 'before_after' | 'after_only' | 'none';
}

/**
 * Inserts a project as the owner, with a serial counter when it can hold records. Defaults make a
 * published, top-level project whose slug and file prefix derive from its key.
 */
export async function insertProject(owner: Sql, input: ProjectInput): Promise<void> {
  const isGroup = input.is_group ?? false;
  const row = {
    key: input.key,
    parent_key: input.parent_key ?? null,
    is_group: isGroup,
    slug: input.slug ?? input.key.replaceAll('_', '-'),
    name_bn: input.name_bn ?? `প্রকল্প ${input.key}`,
    name_en: input.name_en ?? `Project ${input.key}`,
    file_prefix: input.file_prefix === undefined ? (isGroup ? null : input.key.replaceAll('_', '').slice(0, 16)) : input.file_prefix,
    is_published: input.is_published ?? true,
    sort_order: input.sort_order ?? 100,
    photo_mode: input.photo_mode ?? 'after_only',
  };
  await owner`insert into public.housing_projects ${owner(row)}`;
  if (!isGroup) await owner`insert into public.housing_serial_counters (project_type) values (${input.key})`;
}

export interface FieldInput {
  project_key: string;
  key: string;
  label_bn?: string;
  type?: 'text' | 'long_text' | 'number' | 'money' | 'category' | 'date' | 'phone';
  visibility?: 'public' | 'admin';
  is_active?: boolean;
  sort_order?: number;
}

/** Inserts a project field as the owner and returns its id. */
export async function insertField(owner: Sql, input: FieldInput): Promise<string> {
  const row = {
    project_key: input.project_key,
    key: input.key,
    label_bn: input.label_bn ?? input.key,
    type: input.type ?? (input.visibility === 'admin' ? 'phone' : 'text'),
    visibility: input.visibility ?? 'public',
    is_active: input.is_active ?? true,
    sort_order: input.sort_order ?? 10,
  };
  const [inserted] = await owner<{ id: string }[]>`insert into public.housing_project_fields ${owner(row)} returning id`;
  if (!inserted) throw new Error('insert returned no row');
  return inserted.id;
}
