import type { Sql, Tx } from '../db.js';
import type { z } from 'zod';
import type { project, projectField, ProjectListQuery } from './schemas.js';

// The project registry reads (docs/api/PROJECTS_API_CONTRACT.md §4.1). Unlike the housing reads,
// the answer depends on who asks: a visitor sees only projects in housing_public_project_keys()
// and public fields; an admin also sees private fields, and drafts where the contract allows
// (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, "Visibility").

/** Who is reading. `admin` comes only from a live session, never from request input. */
export interface Viewer {
  admin: boolean;
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
    where project_key = any(${keys}) and (${viewer.admin} or visibility = 'public')
    order by project_key, sort_order, key`;
}

/** Projects in sort_order then key; drafts only for an admin who asks for them. */
export async function listProjects(sql: Sql, query: ProjectListQuery, viewer: Viewer): Promise<ProjectRow[]> {
  const withDrafts = viewer.admin && query.drafts === '1';
  const projects = await sql<ProjectRow[]>`
    select ${sql(PROJECT_COLUMNS)} from public.housing_projects
    where ${withDrafts} or key = any(public.housing_public_project_keys())
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
    where key = ${key} and (${viewer.admin} or key = any(public.housing_public_project_keys()))`;
  if (!found) return null;
  return { ...found, fields: await fieldsOf(sql, [key], viewer) };
}

/** A project's fields, or null when the project doesn't exist or the viewer may not see it. */
export async function listProjectFields(sql: Sql, key: string, viewer: Viewer): Promise<ProjectFieldRow[] | null> {
  const [visible] = await sql`
    select 1 from public.housing_projects
    where key = ${key} and (${viewer.admin} or key = any(public.housing_public_project_keys()))`;
  return visible ? fieldsOf(sql, [key], viewer) : null;
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
  const [found] = await sql`select 1 from public.housing_project_fields where project_key = ${projectKey} and key = ${fieldKey}`;
  if (!found) return null;
  const [row] = await sql<{ usage: FieldUsage }[]>`select public.housing_project_field_usage(${projectKey}, ${fieldKey}) as usage`;
  if (!row) throw new Error('housing_project_field_usage returned no row');
  return row.usage;
}
