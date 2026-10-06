import { z } from 'zod';

// Request and response shapes of the project registry reads (docs/api/PROJECTS_API_CONTRACT.md
// §3.1, §3.2, §4.1). The routes parse with the request schemas and the OpenAPI document is built
// from all of them, as for the housing routes.

/** A project's permanent key, as housing_projects_key_format allows (0011_projects_registry.sql). */
export const projectKey = z.string().regex(/^[a-z][a-z0-9_]{1,39}$/, 'not a project key');

export const projectKeyParams = z.object({ key: projectKey });

export const projectListQuery = z.object({
  /** Embed each project's fields. */
  include: z.literal('fields').optional(),
  /** Include drafts; honoured only for an admin session. */
  drafts: z.literal('1').optional(),
});
export type ProjectListQuery = z.infer<typeof projectListQuery>;

const timestamp = z.iso.datetime({ offset: true });
const jsonObject = z.record(z.string(), z.unknown());

export const projectField = z.strictObject({
  id: z.uuid(),
  project_key: z.string(),
  key: z.string(),
  label_bn: z.string(),
  label_en: z.string(),
  help_bn: z.string(),
  help_en: z.string(),
  type: z.enum(['text', 'long_text', 'number', 'money', 'category', 'date', 'phone']),
  options: z.array(z.unknown()),
  required: z.boolean(),
  visibility: z.enum(['public', 'admin']),
  show_in_table: z.boolean(),
  show_in_card: z.boolean(),
  show_in_detail: z.boolean(),
  filterable: z.boolean(),
  searchable: z.boolean(),
  fill_down: z.boolean(),
  max_length: z.number().int().nullable(),
  min_value: z.number().nullable(),
  max_value: z.number().nullable(),
  import_aliases: z.array(z.string()),
  sort_order: z.number().int(),
  is_active: z.boolean(),
  created_at: timestamp,
  updated_at: timestamp,
});

export const project = z.strictObject({
  key: z.string(),
  parent_key: z.string().nullable(),
  is_group: z.boolean(),
  slug: z.string(),
  name_bn: z.string(),
  name_en: z.string(),
  summary_bn: z.string(),
  summary_en: z.string(),
  description_bn: z.string(),
  description_en: z.string(),
  unit_bn: z.string(),
  unit_en: z.string(),
  photo_mode: z.enum(['before_after', 'after_only', 'none']),
  prev_label_bn: z.string(),
  prev_label_en: z.string(),
  current_label_bn: z.string(),
  current_label_en: z.string(),
  geo_depth: z.enum(['upazila', 'union']),
  core_fields: jsonObject,
  stat_cards: z.array(jsonObject),
  display: jsonObject,
  file_prefix: z.string().nullable(),
  icon: z.string(),
  accent: z.string(),
  cover_path: z.string().nullable(),
  sort_order: z.number().int(),
  is_published: z.boolean(),
  show_on_home: z.boolean(),
  created_at: timestamp,
  updated_at: timestamp,
  /** Present on GET /projects/:key, and on the list with include=fields. */
  fields: z.array(projectField).optional(),
});
