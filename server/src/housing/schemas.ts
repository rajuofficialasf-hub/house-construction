import { z } from 'zod';
import { projectKey } from '../projects/schemas.js';

// Request and response shapes of the public housing reads (docs/api/API_CONTRACT.md §3, §4).
// The routes parse with the request schemas, and the OpenAPI document is built from all of them,
// so the spec can't describe a shape the server doesn't use.

/** The largest value Postgres int4 holds. Bigger ids or serials would make the query fail with a 500. */
export const INT4_MAX = 2147483647;

export const PROJECT_TYPES = ['semi_pucca', 'tin'] as const;
export const SORT_FIELDS = ['serial_no', 'year', 'name', 'created_at'] as const;
export const DEFAULT_PAGE_SIZE = 50;
// The table's CHECK range for year (db/migrations/0001_housing_schema.sql).
export const YEAR_MIN = 2000;
export const YEAR_MAX = 2100;
export const MAX_PAGE_SIZE = 100;
export const MAX_SERIALS = 100;
const MAX_TEXT = 100;

export const projectType = z.enum(PROJECT_TYPES);
export type ProjectType = z.infer<typeof projectType>;

// Decimal digits only. z.coerce.number would also accept "", "1e3", "0x10" and "1.0".
const digits = z.string().regex(/^[0-9]{1,10}$/, 'must be a whole number');

function intParam(min: number, max: number) {
  return digits.transform(Number).pipe(z.number().int().min(min).max(max));
}

// Trimmed and NFC-normalized, because stored text is NFC and filters compare exactly (contract §3.3).
// A blank value counts as absent, so a form's empty field doesn't filter everything out.
const textParam = z
  .string()
  .trim()
  .max(MAX_TEXT)
  .transform((value) => (value === '' ? undefined : value.normalize('NFC')))
  .optional();

export const listQuery = z.object({
  project_type: projectType.optional(),
  serial_no: intParam(1, INT4_MAX).optional(),
  // The table only holds 2000-2100, so a year outside it is a mistake, not an empty filter.
  year: intParam(YEAR_MIN, YEAR_MAX).optional(),
  division: textParam,
  district: textParam,
  upazila: textParam,
  q: textParam,
  page: intParam(1, INT4_MAX).default(1),
  page_size: intParam(1, MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sort: z.enum(SORT_FIELDS).default('serial_no'),
  order: z.enum(['asc', 'desc']).default('asc'),
});
export type ListQuery = z.infer<typeof listQuery>;

export const idParams = z.object({ id: z.uuid() });

// The before and after photo of a record (contract §4.10).
export const PHOTO_KINDS = ['prev', 'current'] as const;
export const photoKind = z.enum(PHOTO_KINDS);
export type PhotoKind = z.infer<typeof photoKind>;

// A repeated ?kind= arrives as an array, which the enum refuses (contract §1).
export const deletePhotoQuery = z.object({ kind: photoKind });

export const serialParams = z.object({
  project_type: projectType,
  serial_no: intParam(1, INT4_MAX),
});

export const serialsParams = serialParams.pick({ project_type: true });

// "1,2,3": one to 100 whole numbers. Returned deduped and ascending, the order the response uses.
export const serialsQuery = z.object({
  nos: z
    .string()
    .regex(new RegExp(`^[0-9]{1,10}(,[0-9]{1,10}){0,${MAX_SERIALS - 1}}$`), `must be 1-${MAX_SERIALS} comma-separated whole numbers`)
    .transform((value) => value.split(',').map(Number))
    .pipe(z.array(z.number().int().min(1).max(INT4_MAX)))
    .transform((nos) => [...new Set(nos)].sort((a, b) => a - b)),
});

export const projectTypeQuery = z.object({ project_type: projectType.optional() });
export const nextSerialQuery = z.object({ project_type: projectType });

// Write bodies (contract §3.3). Strict objects: an unknown key is a 400, which is what keeps
// serial_no and project_type out of an update and the photo columns out of every write.

export const MAX_BULK_ROWS = 500;
export const MAX_DETAILS_BYTES = 8192;
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
]);

/**
 * The only events a client may post to /api/v1/activity (contract §4.5): summaries of work the
 * browser did. An allowlist, so a server action nobody remembered to list can't be forged; login
 * and logout are logged by the server itself (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md,
 * "P3 decisions").
 */
export const CLIENT_EVENT_ACTIONS = ['import_run', 'photo_bulk_run', 'records_export', 'category_merge'] as const;

/** How deep the activity list may page; past it a filter is the way in, not a long OFFSET scan. */
export const MAX_ACTIVITY_PAGE = 10_000;

/** Trimmed and NFC-normalized before the length check, so stored text compares exactly (contract §3.3). */
export function writeText(min: number, max: number) {
  return z
    .string()
    .transform((value) => value.trim().normalize('NFC'))
    .pipe(z.string().min(min).max(max));
}

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

/** One record without its project type: a bulk row, and the base of createBody. */
const createRow = z.strictObject({
  ...recordFields,
  serial_no: serialNo.optional(),
  father_or_husband_name: recordFields.father_or_husband_name.default(''),
  address: recordFields.address.default(''),
  prev_photo_source: photoSource.default(null),
  current_photo_source: photoSource.default(null),
});

export const createBody = createRow.extend({ project_type: projectType });
export type CreateBody = z.infer<typeof createBody>;

export const updateBody = z
  .strictObject(recordFields)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'কোনো ফিল্ড দেওয়া হয়নি', params: { reason: 'empty' } });
export type UpdateBody = z.infer<typeof updateBody>;

export const changeSerialBody = z.strictObject({ serial_no: serialNo });

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

export const bulkInsertBody = z
  .strictObject({
    project_type: projectType,
    mode: z.enum(['assign_serial', 'use_given_serial']),
    // The route answers more than MAX_BULK_ROWS with 413 before this runs; max() is only a backstop.
    rows: z.array(createRow).min(1).max(MAX_BULK_ROWS),
  })
  .superRefine(checkGivenSerials)
  .transform(dropSerialsWhenAssigned);
export type BulkInsertBody = z.infer<typeof bulkInsertBody>;

// Bulk update leaves absent or null fields unchanged, and also blank required text. The function
// (0014_record_functions_v2.sql) also leaves '' unchanged in every field.
function keepIfFilled(max: number) {
  return writeText(0, max)
    .transform((value) => value || undefined)
    .nullish();
}

const bulkUpdateRow = z.strictObject({
  serial_no: serialNo,
  year: year.nullish(),
  name: keepIfFilled(200),
  father_or_husband_name: writeText(0, 200).nullish(),
  division: keepIfFilled(100),
  district: keepIfFilled(100),
  upazila: keepIfFilled(100),
  address: writeText(0, 1000).nullish(),
  prev_photo_source: z.string().trim().max(MAX_SOURCE).nullish(),
  current_photo_source: z.string().trim().max(MAX_SOURCE).nullish(),
});

export const bulkUpdateBody = z
  .strictObject({ project_type: projectType, rows: z.array(bulkUpdateRow).min(1).max(MAX_BULK_ROWS) })
  .transform((body) => ({
    ...body,
    // Absent and null mean the same to the SQL function; dropping them keeps the jsonb small.
    rows: body.rows.map((row) => Object.fromEntries(Object.entries(row).filter(([, value]) => value != null)) as typeof row),
  }));
export type BulkUpdateBody = z.infer<typeof bulkUpdateBody>;

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

const counts = z.record(z.string(), z.number().int());

export const housingStats = z.strictObject({
  total: z.number().int(),
  by_year: counts,
  by_division: counts,
  by_district: counts,
  by_upazila: counts,
  distinct: z.strictObject({ divisions: z.number().int(), districts: z.number().int(), upazilas: z.number().int() }),
  by_location: counts,
});

export const filterOptions = z.strictObject({
  years: z.array(z.number().int()),
  divisions: z.array(z.string()),
  districts: z.array(z.string()),
  upazilas: z.array(z.string()),
});

export const nextSerial = z.strictObject({ project_type: projectType, next_serial: z.number().int() });

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
