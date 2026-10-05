import type { Sql } from '../db.js';
import type { ListQuery } from './schemas.js';

// The public housing reads (docs/api/API_CONTRACT.md §4). Every function takes only the pool and
// already-parsed input, never the request or the admin, so being logged in can't change a result.

export type ProjectType = 'semi_pucca' | 'tin';

export interface HousingRecord {
  id: string;
  project_type: ProjectType;
  serial_no: number;
  year: number;
  name: string;
  father_or_husband_name: string;
  division: string;
  district: string;
  upazila: string;
  address: string;
  prev_photo_url: string | null;
  prev_thumb_url: string | null;
  current_photo_url: string | null;
  current_thumb_url: string | null;
  prev_photo_source: string | null;
  current_photo_source: string | null;
  photo_updated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// Exactly the contract §3.2 fields. Named, never `*`, so a column added later stays private
// until someone decides to publish it (DB-Q-05).
const RECORD_COLUMNS = [
  'id', 'project_type', 'serial_no', 'year', 'name', 'father_or_husband_name', 'division', 'district', 'upazila',
  'address', 'prev_photo_url', 'prev_thumb_url', 'current_photo_url', 'current_thumb_url', 'prev_photo_source',
  'current_photo_source', 'photo_updated_at', 'created_at', 'updated_at',
] as const satisfies readonly (keyof HousingRecord)[];

export interface Page<T> {
  data: T[];
  meta: { page: number; page_size: number; total: number; total_pages: number };
}

/** Escapes LIKE wildcards so `%`, `_` and `\` in a search match themselves. */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;

/** One page of records after filters and search, with the filtered total. */
export async function listRecords(sql: Sql, query: ListQuery): Promise<Page<HousingRecord>> {
  const conditions = [sql`true`];
  if (query.project_type) conditions.push(sql`project_type = ${query.project_type}`);
  if (query.serial_no !== undefined) conditions.push(sql`serial_no = ${query.serial_no}`);
  if (query.year !== undefined) conditions.push(sql`year = ${query.year}`);
  if (query.division) conditions.push(sql`division = ${query.division}`);
  if (query.district) conditions.push(sql`district = ${query.district}`);
  if (query.upazila) conditions.push(sql`upazila = ${query.upazila}`);
  if (query.q) {
    const pattern = likePattern(query.q);
    conditions.push(sql`(name ilike ${pattern} escape '\\'
      or father_or_husband_name ilike ${pattern} escape '\\'
      or address ilike ${pattern} escape '\\')`);
  }
  const where = conditions.reduce((all, condition) => sql`${all} and ${condition}`);

  // sort is a zod enum, so sql() only ever names one of the four allowed columns. Serial numbers
  // repeat across the two project types, so project_type and id complete a total order and pages
  // can't overlap or skip.
  const direction = query.order === 'desc' ? sql`desc` : sql`asc`;
  const [rows, [count]] = await Promise.all([
    sql<HousingRecord[]>`
      select ${sql(RECORD_COLUMNS)} from public.housing_beneficiaries where ${where}
      order by ${sql(query.sort)} ${direction}, serial_no asc, project_type asc, id asc
      limit ${query.page_size} offset ${(query.page - 1) * query.page_size}`,
    sql<{ total: number }[]>`select count(*)::int as total from public.housing_beneficiaries where ${where}`,
  ]);
  const total = count?.total ?? 0;
  return {
    data: rows,
    meta: { page: query.page, page_size: query.page_size, total, total_pages: Math.max(1, Math.ceil(total / query.page_size)) },
  };
}

export async function getRecordById(sql: Sql, id: string): Promise<HousingRecord | null> {
  const [row] = await sql<HousingRecord[]>`
    select ${sql(RECORD_COLUMNS)} from public.housing_beneficiaries where id = ${id}`;
  return row ?? null;
}

export async function getRecordBySerial(sql: Sql, projectType: ProjectType, serialNo: number): Promise<HousingRecord | null> {
  const [row] = await sql<HousingRecord[]>`
    select ${sql(RECORD_COLUMNS)} from public.housing_beneficiaries
    where project_type = ${projectType} and serial_no = ${serialNo}`;
  return row ?? null;
}

/** The records of one project with these serials, in serial order. Missing serials are left out. */
export async function getRecordsBySerials(sql: Sql, projectType: ProjectType, serialNos: number[]): Promise<HousingRecord[]> {
  return sql<HousingRecord[]>`
    select ${sql(RECORD_COLUMNS)} from public.housing_beneficiaries
    where project_type = ${projectType} and serial_no in ${sql(serialNos)}
    order by serial_no`;
}

/** The housing_stats() jsonb as Postgres builds it; the contract §4.4 shape. */
export async function getStats(sql: Sql, projectType?: ProjectType): Promise<unknown> {
  const [row] = await sql<{ stats: unknown }[]>`select public.housing_stats(${projectType ?? null}::text) as stats`;
  return row?.stats;
}

export async function getYears(sql: Sql, projectType?: ProjectType): Promise<number[]> {
  const rows = await sql<{ year: number }[]>`select year from public.housing_years(${projectType ?? null}::text)`;
  return rows.map((r) => r.year);
}

export async function getNextSerial(sql: Sql, projectType: ProjectType): Promise<number> {
  const [row] = await sql<{ next: number }[]>`select public.housing_next_serial(${projectType}) as next`;
  if (row?.next == null) throw new Error(`no serial counter for project type ${projectType}`);
  return row.next;
}

export interface FilterOptions {
  years: number[];
  divisions: string[];
  districts: string[];
  upazilas: string[];
}

// Bengali alphabetical order, the same order the Supabase adapter gives with localeCompare(…, 'bn'),
// so the filter lists read the same on both backends.
const bengali = new Intl.Collator('bn');

/** The distinct years and places present, for filter dropdowns. */
export async function getFilterOptions(sql: Sql, projectType?: ProjectType): Promise<FilterOptions> {
  const scope = projectType ? sql`where project_type = ${projectType}` : sql``;
  const [row] = await sql<FilterOptions[]>`
    select
      array(select distinct year from public.housing_beneficiaries ${scope} order by year desc) as years,
      array(select distinct division from public.housing_beneficiaries ${scope}) as divisions,
      array(select distinct district from public.housing_beneficiaries ${scope}) as districts,
      array(select distinct upazila from public.housing_beneficiaries ${scope}) as upazilas`;
  if (!row) throw new Error('filter options query returned no row');
  return {
    years: row.years,
    divisions: row.divisions.sort(bengali.compare),
    districts: row.districts.sort(bengali.compare),
    upazilas: row.upazilas.sort(bengali.compare),
  };
}
