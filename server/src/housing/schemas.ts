import { z } from 'zod';
import { projectKey, writeText } from '../projects/schemas.js';

export { writeText };

// The shared base of the record and activity schemas (docs/api/PROJECTS_API_CONTRACT.md §3.4, §4.4.1, §4.5): the
// record fields, ids, serials, photo kinds and the activity log's query and body, which src/records/
// and src/routes/v1/ build on. The OpenAPI document is built from them, so the spec can't describe a
// shape the server doesn't use.

/** The largest value Postgres int4 holds. Bigger ids or serials would make the query fail with a 500. */
export const INT4_MAX = 2147483647;

const PROJECT_TYPES = ['semi_pucca', 'tin'] as const;
export const DEFAULT_PAGE_SIZE = 50;
// The table's CHECK range for year (db/migrations/0001_housing_schema.sql).
export const YEAR_MIN = 2000;
export const YEAR_MAX = 2100;
export const MAX_PAGE_SIZE = 100;
const MAX_SERIALS = 100;

export const projectType = z.enum(PROJECT_TYPES);
export type ProjectType = z.infer<typeof projectType>;

// Decimal digits only. z.coerce.number would also accept "", "1e3", "0x10" and "1.0".
const digits = z.string().regex(/^[0-9]{1,10}$/, 'must be a whole number');

function intParam(min: number, max: number) {
  return digits.transform(Number).pipe(z.number().int().min(min).max(max));
}

export const idParams = z.object({ id: z.uuid() });

// The before and after photo of a record (docs/api/PROJECTS_API_CONTRACT.md §4.4.10).
const PHOTO_KINDS = ['prev', 'current'] as const;
export const photoKind = z.enum(PHOTO_KINDS);
export type PhotoKind = z.infer<typeof photoKind>;

// "1,2,3": one to 100 whole numbers. Returned deduped and ascending, the order the response uses.
export const serialsQuery = z.object({
  nos: z
    .string()
    .regex(new RegExp(`^[0-9]{1,10}(,[0-9]{1,10}){0,${MAX_SERIALS - 1}}$`), `must be 1-${MAX_SERIALS} comma-separated whole numbers`)
    .transform((value) => value.split(',').map(Number))
    .pipe(z.array(z.number().int().min(1).max(INT4_MAX)))
    .transform((nos) => [...new Set(nos)].sort((a, b) => a - b)),
});

export const MAX_BULK_ROWS = 500;
const MAX_DETAILS_BYTES = 8192;
export const MAX_SOURCE = 2000;
const ACTION = /^[a-z_]{1,40}$/;
/** Actions the server logs itself (activity triggers, login, logout); a client may not post them. */
export const SERVER_LOGGED_ACTIONS: ReadonlySet<string> = new Set([
  'login',
  'logout',
  'create',
  'update',
  'delete',
  'photo_update',
  'serial_change',
  'private_update',
  'project_create',
  'project_update',
  'project_publish',
  'project_unpublish',
  'project_delete',
  'field_create',
  'field_update',
  'field_archive',
  'field_restore',
  'field_delete',
]);

/**
 * The only events a client may post to /api/v1/activity (docs/api/PROJECTS_API_CONTRACT.md §4.5): summaries of work the
 * browser did. An allowlist, so a server action nobody remembered to list can't be forged; login
 * and logout are logged by the server itself (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md,
 * "P3 decisions").
 */
export const CLIENT_EVENT_ACTIONS = ['import_run', 'photo_bulk_run', 'records_export', 'category_merge'] as const;

/** How deep the activity list may page; past it a filter is the way in, not a long OFFSET scan. */
export const MAX_ACTIVITY_PAGE = 10_000;

export const year = z.number().int().min(YEAR_MIN).max(YEAR_MAX);
export const serialNo = z.number().int().min(1).max(INT4_MAX);
// The sheet's original link, kept only as a reference; the UI never renders it as a link.
const photoSource = z
  .string()
  .trim()
  .max(MAX_SOURCE)
  .transform((value) => value || null)
  .nullable();

export const recordFields = {
  year,
  name: writeText(1, 200),
  father_or_husband_name: writeText(0, 200),
  division: writeText(1, 100),
  district: writeText(1, 100),
  upazila: writeText(1, 100),
  address: writeText(0, 1000),
  prev_photo_source: photoSource,
  current_photo_source: photoSource,
};

/** With use_given_serial every row needs a serial, each only once; the issue names the row. */
export function checkGivenSerials(body: { mode: string; rows: { serial_no?: number | undefined }[] }, ctx: z.RefinementCtx): void {
  if (body.mode !== 'use_given_serial') return;
  const seen = new Set<number>();
  body.rows.forEach((row, i) => {
    const path = ['rows', i, 'serial_no'];
    if (row.serial_no === undefined) ctx.addIssue({ code: 'custom', path, message: 'serial_no আবশ্যক', params: { reason: 'required' } });
    else if (seen.has(row.serial_no)) ctx.addIssue({ code: 'custom', path, message: 'ব্যাচে একই serial_no দুবার', params: { reason: 'duplicate' } });
    else seen.add(row.serial_no);
  });
}

/** Under assign_serial the server numbers the rows, so any serial_no sent is dropped. */
export function dropSerialsWhenAssigned<T extends { mode: string; rows: { serial_no?: number | undefined }[] }>(body: T): T {
  return body.mode === 'assign_serial' ? { ...body, rows: body.rows.map(({ serial_no: _ignored, ...rest }) => rest) } : body;
}

const actionName = z.string().regex(ACTION, 'action: a-z and _ only, at most 40');

export const activityQuery = z.object({
  action: actionName.optional(),
  project_type: projectType.optional(),
  record_id: z.uuid().optional(),
  actor_email: z
    .string()
    .trim()
    .max(254)
    .transform((value) => value || undefined)
    .optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  page: intParam(1, INT4_MAX).default(1),
  page_size: intParam(1, MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type ActivityQuery = z.infer<typeof activityQuery>;

export const activityBody = z.strictObject({
  action: actionName.refine((action) => !SERVER_LOGGED_ACTIONS.has(action), {
    message: 'এই action সার্ভার নিজেই লগ করে',
    params: { reason: 'server_logged' },
  }),
  project_type: projectType.optional(),
  // The body came from JSON.parse, so any value inside is JSON already; z.unknown() also keeps
  // the OpenAPI schema free of the $defs that z.json() emits.
  details: z
    .record(z.string(), z.unknown())
    .refine((details) => Buffer.byteLength(JSON.stringify(details)) <= MAX_DETAILS_BYTES, {
      message: 'details অনেক বড়',
      params: { reason: 'too_big' },
    })
    .default({}),
});
export type ActivityBody = z.infer<typeof activityBody>;

/** The /api/v1/activity query: any registry key for project_type, and a bounded page. */
export const projectActivityQuery = activityQuery.extend({
  project_type: projectKey.optional(),
  page: intParam(1, MAX_ACTIVITY_PAGE).default(1),
});

/** The /api/v1/activity body: a client event from CLIENT_EVENT_ACTIONS, for any registry key. */
export const projectActivityBody = activityBody.extend({
  action: z.enum(CLIENT_EVENT_ACTIONS, { message: 'এই action ক্লায়েন্ট পাঠাতে পারে না' }),
  project_type: projectKey.optional(),
});

// Responses. Strict objects, so a test that parses a response also proves no extra column leaks.

const timestamp = z.iso.datetime({ offset: true });

export const housingRecord = z.strictObject({
  id: z.uuid(),
  project_type: projectType,
  serial_no: z.number().int(),
  year: z.number().int(),
  name: z.string(),
  father_or_husband_name: z.string(),
  division: z.string(),
  district: z.string(),
  upazila: z.string(),
  address: z.string(),
  prev_photo_url: z.string().nullable(),
  prev_thumb_url: z.string().nullable(),
  current_photo_url: z.string().nullable(),
  current_thumb_url: z.string().nullable(),
  prev_photo_source: z.string().nullable(),
  current_photo_source: z.string().nullable(),
  photo_updated_at: timestamp.nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});

export const pageMeta = z.strictObject({
  page: z.number().int(),
  page_size: z.number().int(),
  total: z.number().int(),
  total_pages: z.number().int(),
});

export const errorBody = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    details: z.strictObject({ field: z.string().optional(), reason: z.string().optional(), row_index: z.number().int().optional() }).optional(),
  }),
});

export const activityEntry = z.strictObject({
  id: z.number().int(),
  at: timestamp,
  actor_id: z.uuid().nullable(),
  actor_email: z.string().nullable(),
  action: z.string(),
  project_type: z.string().nullable(),
  record_id: z.uuid().nullable(),
  serial_no: z.number().int().nullable(),
  record_name: z.string().nullable(),
  details: z.record(z.string(), z.unknown()),
});

export const bulkInsertResult = z.strictObject({
  inserted: z.number().int(),
  failed: z.array(z.strictObject({ row_index: z.number().int(), error: z.strictObject({ code: z.string(), message: z.string() }) })),
});

export const bulkUpdateResult = z.strictObject({ updated: z.number().int(), missing: z.array(z.number().int()) });
