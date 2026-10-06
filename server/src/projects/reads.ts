import type { Sql } from '../db.js';
import type { ProjectListQuery } from './schemas.js';

// The project registry reads (docs/api/PROJECTS_API_CONTRACT.md §4.1). Unlike the housing reads,
// the answer depends on who asks: a visitor sees only projects in housing_public_project_keys()
// and public fields; an admin also sees private fields, and drafts where the contract allows
// (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, "Visibility").

/** Who is reading. `admin` comes only from a live session, never from request input. */
export interface Viewer {
  admin: boolean;
}

export interface ProjectFieldRow {
  id: string;
  project_key: string;
  key: string;
  label_bn: string;
  label_en: string;
  help_bn: string;
  help_en: string;
  type: string;
  options: unknown[];
  required: boolean;
  visibility: 'public' | 'admin';
  show_in_table: boolean;
  show_in_card: boolean;
  show_in_detail: boolean;
  filterable: boolean;
  searchable: boolean;
  fill_down: boolean;
  max_length: number | null;
  min_value: number | null;
  max_value: number | null;
  import_aliases: string[];
  sort_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ProjectRow {
  key: string;
  parent_key: string | null;
  is_group: boolean;
  slug: string;
  name_bn: string;
  name_en: string;
  summary_bn: string;
  summary_en: string;
  description_bn: string;
  description_en: string;
  unit_bn: string;
  unit_en: string;
  photo_mode: string;
  prev_label_bn: string;
  prev_label_en: string;
  current_label_bn: string;
  current_label_en: string;
  geo_depth: string;
  core_fields: Record<string, unknown>;
  stat_cards: Record<string, unknown>[];
  display: Record<string, unknown>;
  file_prefix: string | null;
  icon: string;
  accent: string;
  cover_path: string | null;
  sort_order: number;
  is_published: boolean;
  show_on_home: boolean;
  created_at: Date;
  updated_at: Date;
  fields?: ProjectFieldRow[];
}

// Named, never `*` (DB-Q-05).
const PROJECT_COLUMNS = [
  'key', 'parent_key', 'is_group', 'slug', 'name_bn', 'name_en', 'summary_bn', 'summary_en', 'description_bn',
  'description_en', 'unit_bn', 'unit_en', 'photo_mode', 'prev_label_bn', 'prev_label_en', 'current_label_bn',
  'current_label_en', 'geo_depth', 'core_fields', 'stat_cards', 'display', 'file_prefix', 'icon', 'accent', 'cover_path',
  'sort_order', 'is_published', 'show_on_home', 'created_at', 'updated_at',
] as const satisfies readonly (keyof ProjectRow)[];

/** The registry is small and admin-made; this caps a list without paging. */
const MAX_PROJECTS = 200;

function fieldsOf(sql: Sql, keys: string[], viewer: Viewer) {
  // min_value and max_value are numeric, which postgres.js returns as strings.
  return sql<ProjectFieldRow[]>`
    select id, project_key, key, label_bn, label_en, help_bn, help_en, type, options, required, visibility,
      show_in_table, show_in_card, show_in_detail, filterable, searchable, fill_down, max_length,
      min_value::float8 as min_value, max_value::float8 as max_value, import_aliases, sort_order, is_active,
      created_at, updated_at
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
  const found = await getProject(sql, key, viewer);
  return found ? (found.fields ?? []) : null;
}
