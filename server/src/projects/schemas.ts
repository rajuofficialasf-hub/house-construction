import { z } from 'zod';

// Request and response shapes of the project registry (docs/api/PROJECTS_API_CONTRACT.md §3.1,
// §3.2, §4.1, §4.2). The routes parse with the request schemas and the OpenAPI document is built
// from all of them, as for the housing routes. The write bodies mirror the CHECKs in
// 0011_projects_registry.sql, so a bad value is a 400 naming its field before the database sees
// it; the guards in 0015_project_guards.sql stay as the backstop. Every object is strict: an
// unknown key is refused without being echoed, and none reaches an insert or update.

/** A project's permanent key, as housing_projects_key_format allows (0011_projects_registry.sql). */
export const projectKey = z.string().regex(/^[a-z][a-z0-9_]{1,39}$/, 'not a project key');

export const projectKeyParams = z.object({ key: projectKey });

/** A custom field's key, as housing_project_fields_key_format allows (0011_projects_registry.sql). */
export const FIELD_KEY = /^[a-z][a-z0-9_]{0,39}$/;

/** Trimmed and NFC-normalized before the length check, so stored text compares exactly (contract §3.3). */
export function writeText(min: number, max: number) {
  return z
    .string()
    .transform((value) => value.trim().normalize('NFC'))
    .pipe(z.string().min(min).max(max));
}

export const projectListQuery = z.object({
  /** Embed each project's fields. */
  include: z.literal('fields').optional(),
  /** Include drafts; honoured only for an admin session. */
  drafts: z.literal('1').optional(),
});
export type ProjectListQuery = z.infer<typeof projectListQuery>;

/** `?light=1` leaves out by_union's entries and the category breakdowns (the home page's cards). */
/** `?drafts=1` adds drafts and the photo-less counts; honoured only for an admin session. */
export const overviewQuery = z.object({ drafts: z.literal('1').optional() });

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

// ---------------------------------------------------------------- write bodies

const fieldKey = z.string().regex(FIELD_KEY, 'not a field key');
const token = z.string().regex(/^[a-z0-9-]{1,40}$/, 'not a token');
// housing_projects_slug_format, after the guard's lower-case and trim.
const slug = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.string().max(60).regex(/^(?![0-9]+$)[a-z0-9]+(-[a-z0-9]+)*$/, 'not a slug'));
const filePrefix = z.string().regex(/^[a-z][a-z0-9]{0,15}$/, 'not a file prefix');
const sortOrder = z.number().int().min(0).max(1_000_000);

const coreFieldConfig = z.strictObject({
  label_bn: writeText(0, 60).optional(),
  label_en: writeText(0, 60).optional(),
  enabled: z.boolean().optional(),
  required: z.boolean().optional(),
});
/** CoreFieldsConfig in src/backend/interfaces/types.ts. */
export const coreFields = z.strictObject({
  year: coreFieldConfig.optional(),
  name: coreFieldConfig.optional(),
  father_or_husband_name: coreFieldConfig.optional(),
  division: coreFieldConfig.optional(),
  district: coreFieldConfig.optional(),
  upazila: coreFieldConfig.optional(),
  union_name: coreFieldConfig.optional(),
  address: coreFieldConfig.optional(),
});

/** StatCardDef in src/backend/interfaces/types.ts. Which kind needs a field or level is the guard's check. */
export const statCard = z.strictObject({
  id: z.string().trim().min(1).max(40),
  kind: z.enum(['count', 'geo', 'sum', 'distinct']),
  level: z.enum(['division', 'district', 'upazila', 'union']).optional(),
  field: fieldKey.optional(),
  label_bn: writeText(1, 60),
  label_en: writeText(0, 60),
  home_label_bn: writeText(0, 60).optional(),
  home_label_en: writeText(0, 60).optional(),
  icon: token.optional(),
  home: z.boolean().optional(),
  format: z.enum(['money', 'number']).optional(),
});

/** ProjectDisplay in src/backend/interfaces/types.ts. */
export const display = z.strictObject({
  show_map: z.boolean().optional(),
  geo_columns: z.enum(['split', 'merged']).optional(),
  breakdown_field: fieldKey.optional(),
});

// Every column an admin may set. key, cover_path, is_published and the timestamps are set elsewhere.
const projectColumns = {
  parent_key: projectKey.nullable(),
  is_group: z.boolean(),
  slug,
  name_bn: writeText(1, 120),
  name_en: writeText(1, 120),
  summary_bn: writeText(0, 300),
  summary_en: writeText(0, 300),
  description_bn: writeText(0, 2000),
  description_en: writeText(0, 2000),
  unit_bn: writeText(0, 40),
  unit_en: writeText(0, 40),
  photo_mode: z.enum(['before_after', 'after_only', 'none']),
  prev_label_bn: writeText(0, 60),
  prev_label_en: writeText(0, 60),
  current_label_bn: writeText(0, 60),
  current_label_en: writeText(0, 60),
  geo_depth: z.enum(['upazila', 'union']),
  core_fields: coreFields,
  stat_cards: z.array(statCard).max(8),
  display,
  file_prefix: filePrefix.nullable(),
  icon: token,
  accent: token,
  sort_order: sortOrder,
  show_on_home: z.boolean(),
};

// Every field column an admin may set; key, type and visibility are refused by the guard once values exist.
const fieldColumns = {
  label_bn: writeText(1, 120),
  label_en: writeText(0, 120),
  help_bn: writeText(0, 300),
  help_en: writeText(0, 300),
  type: z.enum(['text', 'long_text', 'number', 'money', 'category', 'date', 'phone']),
  options: z.array(z.string().max(100)).max(100),
  required: z.boolean(),
  visibility: z.enum(['public', 'admin']),
  show_in_table: z.boolean(),
  show_in_card: z.boolean(),
  show_in_detail: z.boolean(),
  filterable: z.boolean(),
  searchable: z.boolean(),
  fill_down: z.boolean(),
  max_length: z.number().int().min(1).max(2000).nullable(),
  min_value: z.number().finite().nullable(),
  max_value: z.number().finite().nullable(),
  import_aliases: z.array(writeText(1, 100)).max(20),
  sort_order: sortOrder,
};

/** A new field: key, label_bn and type are required (§4.2). */
export const fieldCreateBody = z
  .strictObject({ key: fieldKey, ...fieldColumns })
  .partial()
  .required({ key: true, label_bn: true, type: true });
export type FieldCreateBody = z.infer<typeof fieldCreateBody>;

const nonEmpty = (value: object) => Object.keys(value).length > 0;

/** Any non-empty subset of a field's columns; archive is { is_active: false }. */
export const fieldPatchBody = z
  .strictObject({ key: fieldKey, ...fieldColumns, is_active: z.boolean() })
  .partial()
  .refine(nonEmpty, { message: 'nothing to change', params: { reason: 'empty' } });
export type FieldPatchBody = z.infer<typeof fieldPatchBody>;

/**
 * A new project and its fields (§4.1.4). is_published is accepted and dropped: a project is always
 * created as a draft. A leaf needs a file prefix, a group has none (housing_projects_group_shape).
 */
export const projectCreateBody = z.strictObject({
  project: z
    .strictObject({ key: projectKey, ...projectColumns, is_published: z.boolean() })
    .partial()
    .required({ key: true, slug: true, name_bn: true, name_en: true })
    .superRefine((p, ctx) => {
      if (!p.is_group && !p.file_prefix) ctx.addIssue({ code: 'custom', path: ['file_prefix'], message: 'a project needs a file prefix', params: { reason: 'required' } });
      if (p.is_group && p.file_prefix) ctx.addIssue({ code: 'custom', path: ['file_prefix'], message: 'a group has no file prefix', params: { reason: 'group' } });
    })
    .transform(({ is_published: _ignored, ...p }) => p),
  fields: z.array(fieldCreateBody).max(40).default([]),
});
export type ProjectCreateBody = z.infer<typeof projectCreateBody>;

/** Any non-empty subset of a project's columns; publish is { is_published: true } (§4.1.5). */
export const projectPatchBody = z
  .strictObject({ ...projectColumns, is_published: z.boolean() })
  .partial()
  .refine(nonEmpty, { message: 'nothing to change', params: { reason: 'empty' } });
export type ProjectPatchBody = z.infer<typeof projectPatchBody>;

export const fieldIdParams = z.object({ id: z.uuid() });

export const fieldKeyParams = z.object({ key: projectKey, field_key: fieldKey });

/** from must match a stored value exactly; to is normalised by the database the way values are stored. */
export const renameValueBody = z.strictObject({ from: z.string().min(1).max(100), to: z.string().min(1).max(100) });

/** A project has at most 40 fields. */
export const fieldOrderBody = z.strictObject({ ids: z.array(z.uuid()).min(1).max(40) });

/** The registry is small; 200 matches the list cap in reads.ts. */
export const projectOrderBody = z.strictObject({ keys: z.array(projectKey).min(1).max(200) });

/** If-Match: the project's updated_at as last read, bare or in double quotes. */
export const ifMatch = z
  .string()
  .transform((value) => value.trim().replace(/^"(.*)"$/, '$1'))
  .pipe(z.iso.datetime({ offset: true }));

const counts = z.record(z.string(), z.number().int());

/** GET /projects/:key/stats, as src/backend/interfaces/types.ts ProjectStats describes it. */
export const projectStats = z.strictObject({
  total: z.number().int(),
  by_year: counts,
  by_division: counts,
  by_district: counts,
  by_upazila: counts,
  by_location: counts,
  distinct: z.strictObject({ divisions: z.number().int(), districts: z.number().int(), upazilas: z.number().int(), unions: z.number().int() }),
  by_project: counts,
  by_union: counts,
  // Present only on filtered stats (the list's filters were given): the by_ counts are then empty and categories carry no by_value.
  filtered: z.literal(true).optional(),
  fields: z.record(
    z.string(),
    z.union([
      z.strictObject({ type: z.enum(['money', 'number']), sum: z.number(), count: z.number().int() }),
      z.strictObject({
        type: z.literal('category'),
        distinct: z.number().int(),
        by_value: z.record(z.string(), z.strictObject({ n: z.number().int(), sums: z.record(z.string(), z.number()) })).optional(),
      }),
    ]),
  ),
});

/** GET /projects/overview, as src/backend/interfaces/types.ts ProjectOverview describes it. */
export const projectOverview = z.strictObject({
  projects: z.array(
    project
      .pick({
        key: true, parent_key: true, is_group: true, slug: true, name_bn: true, name_en: true, summary_bn: true,
        summary_en: true, unit_bn: true, unit_en: true, photo_mode: true, icon: true, accent: true, cover_path: true,
        sort_order: true, is_published: true, show_on_home: true, stat_cards: true,
      })
      .extend({
        stats: projectStats,
        featured: z
          .strictObject({
            project_type: projectKey,
            serial_no: z.number().int(),
            name: z.string(),
            thumb_url: z.string(),
            photo_updated_at: timestamp.nullable(),
          })
          .nullable(),
        without_photo: z.number().int().nullable(),
      }),
  ),
  global: z.strictObject({ projects: z.number().int(), total: z.number().int(), districts: z.number().int() }),
});
