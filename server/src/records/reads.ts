import type { Sql } from '../db.js';
import { AppError } from '../errors.js';
import { likePattern, RECORD_COLUMNS, toPage, type HousingRecord, type Page } from '../housing/reads.js';
import type { Viewer } from '../projects/reads.js';
import type { RecordListQuery } from './schemas.js';

// The single-record reads (docs/api/PROJECTS_API_CONTRACT.md §4.4.1–§4.4.3). A visitor reaches only
// records of projects in housing_public_project_keys(), and sees only public fields' values in
// extra; an admin session sees every project and extra as stored
// (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, "P2 decisions").

export type ProjectRecord = Omit<HousingRecord, 'project_type'> & {
  project_type: string;
  union_name: string;
  extra: Record<string, string | number>;
};

/** A project as the record routes need it, with its public fields by what they allow. */
export interface RecordProject {
  key: string;
  filterable: Map<string, string>;
  searchable: string[];
  sortable: Set<string>;
}

const notFound = () => new AppError('NOT_FOUND', 'প্রকল্প পাওয়া যায়নি');

/**
 * The record columns for this viewer. A visitor's extra keeps only keys of the project's public
 * fields (archived ones too), a whitelist, so a key with no public field never leaves the server.
 */
function recordColumns(sql: Sql, viewer: Viewer) {
  const extra = viewer.admin
    ? sql`b.extra`
    : sql`(select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(b.extra) e
           where exists (select from public.housing_project_fields f
                         where f.project_key = b.project_type and f.key = e.key and f.visibility = 'public'))`;
  return sql`${sql(RECORD_COLUMNS.map((column) => `b.${column}`))}, b.union_name, ${extra} as extra`;
}

const visibleTo = (sql: Sql, viewer: Viewer) =>
  sql`(${viewer.admin} or b.project_type = any(public.housing_public_project_keys()))`;

/**
 * A project the viewer may read records of, with its public active fields. Unknown and hidden
 * projects are both 404, so a visitor can't tell a draft from a key that doesn't exist; only then
 * is a group refused, since groups hold no records.
 */
export async function recordProject(sql: Sql, key: string, viewer: Viewer): Promise<RecordProject> {
  const [[project], fields] = await Promise.all([
    sql<{ is_group: boolean }[]>`
      select is_group from public.housing_projects
      where key = ${key} and (${viewer.admin} or key = any(public.housing_public_project_keys()))`,
    sql<{ key: string; type: string; filterable: boolean; searchable: boolean }[]>`
      select key, type, filterable, searchable from public.housing_project_fields
      where project_key = ${key} and visibility = 'public' and is_active`,
  ]);
  if (!project) throw notFound();
  if (project.is_group) {
    throw new AppError('VALIDATION_ERROR', 'প্রকল্প-গ্রুপে সরাসরি রেকর্ড নেই; উপ-প্রকল্প বাছুন', { field: 'key', reason: 'group' });
  }
  return {
    key,
    filterable: new Map(fields.filter((f) => f.filterable).map((f) => [f.key, f.type])),
    searchable: fields.filter((f) => f.searchable).map((f) => f.key),
    sortable: new Set(fields.map((f) => f.key)),
  };
}

/** A filter value as the trigger stores it, so it matches exactly (0013_record_rules.sql). */
function filterValue(key: string, type: string, raw: string): string | number {
  if (type === 'number' || type === 'money') {
    if (!/^-?[0-9]{1,15}(\.[0-9]{1,2})?$/.test(raw.trim())) {
      throw new AppError('VALIDATION_ERROR', 'শুধু সংখ্যা দিন', { field: `f.${key}`, reason: 'invalid_type' });
    }
    return Number(raw);
  }
  const text = raw.trim().normalize('NFC');
  return type === 'category' ? text.replace(/\s+/g, ' ') : text;
}

/** One page of a project's records after filters, search and sort, with the filtered total. */
export async function listProjectRecords(
  sql: Sql,
  project: RecordProject,
  query: RecordListQuery,
  filters: Map<string, string>,
  viewer: Viewer,
): Promise<Page<ProjectRecord>> {
  const conditions = [sql`b.project_type = ${project.key}`];
  if (query.serial_no !== undefined) conditions.push(sql`b.serial_no = ${query.serial_no}`);
  if (query.year !== undefined) conditions.push(sql`b.year = ${query.year}`);
  if (query.division) conditions.push(sql`b.division = ${query.division}`);
  if (query.district) conditions.push(sql`b.district = ${query.district}`);
  if (query.upazila) conditions.push(sql`b.upazila = ${query.upazila}`);
  if (query.union_name) conditions.push(sql`b.union_name = ${query.union_name}`);
  // Only public, active, filterable fields filter; any other f.<key> is ignored (§4.4.1). Keys and
  // values are bound, never spliced into the SQL.
  for (const [key, raw] of filters) {
    const type = project.filterable.get(key);
    if (type === undefined || raw.trim() === '') continue;
    conditions.push(sql`b.extra @> ${sql.json({ [key]: filterValue(key, type, raw) })}`);
  }
  if (query.q) {
    const pattern = likePattern(query.q);
    const custom = project.searchable.map((key) => sql`or b.extra ->> ${key}::text ilike ${pattern} escape '\\'`);
    conditions.push(sql`(b.name ilike ${pattern} escape '\\'
      or b.father_or_husband_name ilike ${pattern} escape '\\'
      or b.address ilike ${pattern} escape '\\'
      ${custom.reduce((all, one) => sql`${all} ${one}`, sql``)})`);
  }
  const where = conditions.reduce((all, condition) => sql`${all} and ${condition}`);

  // A column sort comes from the zod enum; extra.<key> sorts only by a public active field, by its
  // jsonb value (numbers as numbers), with records lacking it last. Serial and id complete the order.
  const direction = query.order === 'desc' ? sql`desc` : sql`asc`;
  const extraKey = query.sort.startsWith('extra.') ? query.sort.slice('extra.'.length) : undefined;
  const sortBy =
    extraKey === undefined
      ? sql`${sql(`b.${query.sort}`)} ${direction}`
      : project.sortable.has(extraKey)
        ? sql`b.extra -> ${extraKey}::text ${direction} nulls last`
        : sql`b.serial_no asc`;

  const [rows, [count]] = await Promise.all([
    sql<ProjectRecord[]>`
      select ${recordColumns(sql, viewer)} from public.housing_beneficiaries b where ${where}
      order by ${sortBy}, b.serial_no asc, b.id asc
      limit ${query.page_size} offset ${(query.page - 1) * query.page_size}`,
    sql<{ total: number }[]>`select count(*)::int as total from public.housing_beneficiaries b where ${where}`,
  ]);
  return toPage(rows, query, count?.total ?? 0);
}

/** One record, or null when it doesn't exist or its project is hidden from the viewer. */
export async function getRecord(sql: Sql, id: string, viewer: Viewer): Promise<ProjectRecord | null> {
  const [row] = await sql<ProjectRecord[]>`
    select ${recordColumns(sql, viewer)} from public.housing_beneficiaries b
    where b.id = ${id} and ${visibleTo(sql, viewer)}`;
  return row ?? null;
}

/** The records of a visible project with these serials, in serial order; missing ones are left out. */
export async function getRecordsBySerials(sql: Sql, project: RecordProject, serialNos: number[], viewer: Viewer): Promise<ProjectRecord[]> {
  return sql<ProjectRecord[]>`
    select ${recordColumns(sql, viewer)} from public.housing_beneficiaries b
    where b.project_type = ${project.key} and b.serial_no in ${sql(serialNos)}
    order by b.serial_no`;
}
