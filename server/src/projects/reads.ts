import postgres from 'postgres';
import type { Sql, Tx } from '../db.js';
import type { z } from 'zod';
import type { project, projectField, ProjectListQuery } from './schemas.js';

// The project registry reads (docs/api/PROJECTS_API_CONTRACT.md §4.1). Unlike the housing reads,
// the answer depends on who asks: a visitor sees only projects in housing_public_project_keys()
// and public fields; an admin also sees private fields, and drafts where the contract allows
// (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, "Visibility"). A scoped
// editor gets that admin view only for its own projects (seesAsAdmin), and a visitor's elsewhere.

/**
 * Who is reading; both fields come only from a live session, never from request input. `admin`
 * decides only the caching headers. `drafts` is whose admin view the reader gets: 'all' for a main
 * admin, an admin and an editor with "all projects"; a scoped editor's project keys; [] for a visitor.
 */
export interface Viewer {
  admin: boolean;
  drafts: 'all' | string[];
}

/** The writes' own reads: every project, as the main admin sees it. Their scope check is requireProjectScope. */
export const ADMIN_VIEW: Viewer = { admin: true, drafts: 'all' };

/**
 * SQL that is true where the viewer gets the admin view of the project named by `key` (a column or
 * an expression): always for 'all', inside the keys for a scoped editor, never for a visitor.
 */
export function seesAsAdmin(sql: Sql | Tx, viewer: Viewer, key: postgres.PendingQuery<postgres.Row[]>) {
  if (viewer.drafts === 'all') return sql`true`;
  if (viewer.drafts.length === 0) return sql`false`;
  return sql`(${key} = any(${viewer.drafts}))`;
}

/** Whether the viewer may read this project at all: its admin view, or a published project. */
export function visibleTo(sql: Sql | Tx, viewer: Viewer, key: postgres.PendingQuery<postgres.Row[]>) {
  return sql`(${seesAsAdmin(sql, viewer, key)} or ${key} = any(public.housing_public_project_keys()))`;
}

/**
 * The roll-up functions' p_public_only for the project row in scope (`key`, `is_group`): false only
 * for 'all' or a leaf in the editor's scope. A group stays the visitor's total for a scoped editor,
 * so it never counts a child the editor can't see.
 */
export function publicOnly(sql: Sql | Tx, viewer: Viewer) {
  if (viewer.drafts === 'all') return sql`false`;
  return sql`not (not is_group and ${seesAsAdmin(sql, viewer, sql`key`)})`;
}

type Timestamps = { created_at: Date; updated_at: Date };

/** A field as read from the database: the response shape, with Date timestamps until JSON. */
export type ProjectFieldRow = Omit<z.infer<typeof projectField>, keyof Timestamps> & Timestamps;

/** A project as read from the database, with its fields when they were asked for. */
export type ProjectRow = Omit<z.infer<typeof project>, keyof Timestamps | 'fields'> & Timestamps & { fields?: ProjectFieldRow[] };

// Named, never `*` (DB-Q-05).
const PROJECT_COLUMNS = [
  'key', 'parent_key', 'is_group', 'slug', 'name_bn', 'name_en', 'summary_bn', 'summary_en', 'description_bn',
  'description_en', 'unit_bn', 'unit_en', 'photo_mode', 'prev_label_bn', 'prev_label_en', 'current_label_bn',
  'current_label_en', 'geo_depth', 'core_fields', 'stat_cards', 'display', 'file_prefix', 'icon', 'accent', 'cover_path',
  'sort_order', 'is_published', 'show_on_home', 'created_at', 'updated_at',
] as const satisfies readonly (keyof ProjectRow)[];

/** The registry is small and admin-made; this caps a list without paging. */
const MAX_PROJECTS = 200;

/** A field's response columns, for a select or a returning clause. */
export function fieldColumns(sql: Sql | Tx) {
  // min_value and max_value are numeric, which postgres.js returns as strings.
  return sql`
    id, project_key, key, label_bn, label_en, help_bn, help_en, type, options, required, visibility,
    show_in_table, show_in_card, show_in_detail, filterable, searchable, fill_down, max_length,
    min_value::float8 as min_value, max_value::float8 as max_value, import_aliases, sort_order, is_active,
    created_at, updated_at`;
}

function fieldsOf(sql: Sql, keys: string[], viewer: Viewer) {
  return sql<ProjectFieldRow[]>`
    select ${fieldColumns(sql)}
    from public.housing_project_fields
    where project_key = any(${keys}) and (visibility = 'public' or ${seesAsAdmin(sql, viewer, sql`project_key`)})
    order by project_key, sort_order, key`;
}

/** Projects in sort_order then key; drafts in the viewer's admin view, when asked for. */
export async function listProjects(sql: Sql, query: ProjectListQuery, viewer: Viewer): Promise<ProjectRow[]> {
  const drafts = query.drafts === '1' ? seesAsAdmin(sql, viewer, sql`key`) : sql`false`;
  const projects = await sql<ProjectRow[]>`
    select ${sql(PROJECT_COLUMNS)} from public.housing_projects
    where ${drafts} or key = any(public.housing_public_project_keys())
    order by sort_order, key
    limit ${MAX_PROJECTS}`;
  if (query.include !== 'fields') return projects;
  const fields = await fieldsOf(sql, projects.map((p) => p.key), viewer);
  return projects.map((p) => ({ ...p, fields: fields.filter((f) => f.project_key === p.key) }));
}

/** One project with its fields, or null when it doesn't exist or the viewer may not see it. */
export async function getProject(sql: Sql, key: string, viewer: Viewer): Promise<ProjectRow | null> {
  const [found] = await sql<ProjectRow[]>`
    select ${sql(PROJECT_COLUMNS)} from public.housing_projects
    where key = ${key} and ${visibleTo(sql, viewer, sql`key`)}`;
  if (!found) return null;
  return { ...found, fields: await fieldsOf(sql, [key], viewer) };
}

/** A project's fields, or null when the project doesn't exist or the viewer may not see it. */
export async function listProjectFields(sql: Sql, key: string, viewer: Viewer): Promise<ProjectFieldRow[] | null> {
  const [visible] = await sql`
    select 1 from public.housing_projects
    where key = ${key} and ${visibleTo(sql, viewer, sql`key`)}`;
  return visible ? fieldsOf(sql, [key], viewer) : null;
}

/** The field functions raise P0002 for a field the project doesn't have; the caller answers 404. */
export function nullWhenNoField(err: unknown): null {
  if (err instanceof postgres.PostgresError && err.code === 'P0002') return null;
  throw err;
}

export interface FieldUsage {
  count: number;
  values: { value: string; n: number }[];
}

/**
 * How many of the project's records hold a value for the field, with a public field's 100 most common
 * values; a private field's values are never listed. Null when the project has no such field.
 */
export async function fieldUsage(sql: Sql, projectKey: string, fieldKey: string): Promise<FieldUsage | null> {
  const rows = await sql<{ usage: FieldUsage }[]>`select public.housing_project_field_usage(${projectKey}, ${fieldKey}) as usage`.catch(nullWhenNoField);
  if (!rows) return null;
  if (!rows[0]) throw new Error('housing_project_field_usage returned no row');
  return rows[0].usage;
}

/**
 * A project's stats, or null when it doesn't exist or the viewer may not see it. A visitor's (and a
 * scoped editor's) stats of a group count only its published children (housing_project_stats'
 * p_public_only; see publicOnly).
 */
export async function projectStats(sql: Sql, key: string, light: boolean, viewer: Viewer): Promise<unknown | null> {
  const [row] = await sql<{ s: unknown }[]>`
    select public.housing_project_stats(key, ${light}, ${publicOnly(sql, viewer)}) as s
    from public.housing_projects
    where key = ${key} and ${visibleTo(sql, viewer, sql`key`)}`;
  return row ? row.s : null;
}

/** Every project the viewer may see with light stats; drafts only for a viewer of every project who asks. */
export async function projectsOverview(sql: Sql, drafts: boolean, viewer: Viewer): Promise<unknown> {
  // Its totals and photos span every project, so a scoped editor gets the visitor's overview and
  // finds its drafts through GET /projects?drafts=1.
  const [row] = await sql<{ o: unknown }[]>`select public.housing_projects_overview(${drafts && viewer.drafts === 'all'}) as o`;
  return row?.o;
}
