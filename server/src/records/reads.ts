import type { Sql } from '../db.js';
import { AppError } from '../errors.js';
import { RECORD_COLUMNS, toPage, type HousingRecord, type Page } from '../housing/reads.js';
import type { PhotoKind } from '../photos/process.js';
import { seesAsAdmin, visibleTo, type Viewer } from '../projects/reads.js';
import { recordFilters } from './filters.js';
import type { RecordListQuery } from './schemas.js';

// The single-record reads (docs/api/PROJECTS_API_CONTRACT.md §4.4.1–§4.4.3). A visitor reaches only
// records of projects in housing_public_project_keys(), and sees only public fields' values in
// extra; an admin session sees every project and extra as stored
// (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, "P2 decisions"); a scoped
// editor gets that admin view only in its own projects (same plan, "P9b decisions").

// project_type is any registered project key here, not HousingRecord's two-value enum.
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

export const projectNotFound = () => new AppError('NOT_FOUND', 'প্রকল্প পাওয়া যায়নি');
export const recordNotFound = () => new AppError('NOT_FOUND', 'রেকর্ড পাওয়া যায়নি');

/** Every column of a record as an admin reads it, for a write's returning list (no table alias). */
export const ADMIN_RECORD_COLUMNS = [...RECORD_COLUMNS, 'union_name', 'extra'] as const;

/**
 * The record columns for this viewer. A visitor's extra keeps only keys of the project's public
 * fields (archived ones too), a whitelist, so a key with no public field never leaves the server;
 * so does a scoped editor's, outside its projects.
 */
function recordColumns(sql: Sql, viewer: Viewer) {
  return sql`${sql(RECORD_COLUMNS.map((column) => `b.${column}`))}, b.union_name, ${extraFor(sql, viewer)} as extra`;
}

/** extra as stored for the viewer's admin view, the public-field whitelist otherwise; decided per row for a scoped editor. */
function extraFor(sql: Sql, viewer: Viewer) {
  if (viewer.drafts === 'all') return sql`b.extra`;
  const publicExtra = sql`(select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(b.extra) e
           where exists (select from public.housing_project_fields f
                         where f.project_key = b.project_type and f.key = e.key and f.visibility = 'public'))`;
  if (viewer.drafts.length === 0) return publicExtra;
  return sql`case when ${seesAsAdmin(sql, viewer, sql`b.project_type`)} then b.extra else ${publicExtra} end`;
}

/**
 * A project the viewer may read records of, with its public active fields. Unknown and hidden
 * projects are both 404, so a visitor can't tell a draft from a key that doesn't exist; only then
 * is a group refused, since groups hold no records.
 */
export async function recordProject(sql: Sql, key: string, viewer: Viewer): Promise<RecordProject> {
  const [project, fields] = await Promise.all([
    visibleProject(sql, key, viewer),
    sql<{ key: string; type: string; filterable: boolean; searchable: boolean }[]>`
      select key, type, filterable, searchable from public.housing_project_fields
      where project_key = ${key} and visibility = 'public' and is_active`,
  ]);
  if (!project) throw projectNotFound();
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
  conditions.push(...recordFilters(sql, project, filters, query));
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
    where b.id = ${id} and ${visibleTo(sql, viewer, sql`b.project_type`)}`;
  return row ?? null;
}

/** The records of a visible project with these serials, in serial order; missing ones are left out. */
export async function getRecordsBySerials(sql: Sql, project: RecordProject, serialNos: number[], viewer: Viewer): Promise<ProjectRecord[]> {
  return sql<ProjectRecord[]>`
    select ${recordColumns(sql, viewer)} from public.housing_beneficiaries b
    where b.project_type = ${project.key} and b.serial_no in ${sql(serialNos)}
    order by b.serial_no`;
}

/**
 * Refuses a photo upload the record's project can't hold, before the body is read, so nothing is
 * stored (§4.4.10, AE3 in docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md).
 * An unknown record is 404. The record trigger (0013_record_rules.sql) checks the same rule again
 * when the URL is saved, in case the photo mode changes meanwhile. Says whether the slot already
 * holds a photo, which an editor may not replace.
 */
export async function checkPhotoSlot(sql: Sql, id: string, slot: PhotoKind): Promise<{ filled: boolean }> {
  const [record] = await sql<{ photo_mode: 'before_after' | 'after_only' | 'none'; filled: boolean }[]>`
    select p.photo_mode, (${sql(`${slot}_photo_url`)} is not null or ${sql(`${slot}_thumb_url`)} is not null) as filled
    from public.housing_beneficiaries b join public.housing_projects p on p.key = b.project_type
    where b.id = ${id}`;
  if (!record) throw recordNotFound();
  if (record.photo_mode === 'none') {
    throw new AppError('VALIDATION_ERROR', 'এই প্রকল্পে ছবি নেই', { field: `${slot}_photo_url`, reason: 'photo_mode' });
  }
  if (record.photo_mode === 'after_only' && slot === 'prev') {
    throw new AppError('VALIDATION_ERROR', 'এই প্রকল্পে আগের ছবি রাখা যায় না (ছবি মোড: শুধু পরের ছবি)', {
      field: 'prev_photo_url',
      reason: 'photo_mode',
    });
  }
  return { filled: record.filled };
}

/** A record's project key, or a 404. A record never changes project, so a later write can't race it. */
export async function recordProjectKey(sql: Sql, id: string): Promise<string> {
  const [record] = await sql<{ project_type: string }[]>`select project_type from public.housing_beneficiaries where id = ${id}`;
  if (!record) throw recordNotFound();
  return record.project_type;
}

/** Whether the project exists for this viewer, and if it is a group; null when unknown or hidden. */
export async function visibleProject(sql: Sql, key: string, viewer: Viewer): Promise<{ is_group: boolean } | null> {
  const [project] = await sql<{ is_group: boolean }[]>`
    select is_group from public.housing_projects
    where key = ${key} and ${visibleTo(sql, viewer, sql`key`)}`;
  return project ?? null;
}

/**
 * The years a project's records have, newest first; a group's cover its children. A visitor gets
 * only years of public projects, so a draft child adds none. Null when the project is unknown or
 * hidden (§4.3).
 */
export async function projectYears(sql: Sql, key: string, viewer: Viewer): Promise<number[] | null> {
  if (!(await visibleProject(sql, key, viewer))) return null;
  const rows = await sql<{ year: number }[]>`
    select distinct year from public.housing_beneficiaries
    where project_type = any(public.housing_project_leaf_keys(${key}))
      and ${visibleTo(sql, viewer, sql`project_type`)}
    order by year desc`;
  return rows.map((row) => row.year);
}

/**
 * The serial the project's next record will probably get. Null for a group, and for a key that is
 * unknown or hidden from the viewer, so a visitor can't tell a draft from a key that doesn't exist
 * (§4.3). The counter itself is housing_next_serial (0002_serial.sql).
 */
export async function projectNextSerial(sql: Sql, key: string, viewer: Viewer): Promise<number | null> {
  const project = await visibleProject(sql, key, viewer);
  if (!project || project.is_group) return null;
  const [row] = await sql<{ next: number | null }[]>`select public.housing_next_serial(${key}) as next`;
  return row?.next ?? null;
}
