import { z } from 'zod';
import { AppError } from '../errors.js';
import {
  checkGivenSerials,
  DEFAULT_PAGE_SIZE,
  housingRecord,
  INT4_MAX,
  MAX_BULK_ROWS,
  MAX_PAGE_SIZE,
  MAX_SOURCE,
  recordFields,
  serialNo,
  writeText,
  year,
  YEAR_MAX,
  YEAR_MIN,
} from '../housing/schemas.js';
import { projectKey } from '../projects/schemas.js';

// Request and response shapes of the single-record routes (docs/api/PROJECTS_API_CONTRACT.md
// §3.3, §4.4). The routes parse with these and the OpenAPI document is built from them.

export { idParams, serialsQuery } from '../housing/schemas.js';

/** A custom field's key, as housing_project_fields_key_format allows (0011_projects_registry.sql). */
export const FIELD_KEY = /^[a-z][a-z0-9_]{0,39}$/;
export const MAX_FIELD_FILTERS = 10;
const MAX_TEXT = 100;

const digits = z.string().regex(/^[0-9]{1,10}$/, 'must be a whole number');
const intParam = (min: number, max: number) => digits.transform(Number).pipe(z.number().int().min(min).max(max));

// Trimmed and NFC'd, as stored text is; blank counts as absent.
const textParam = z
  .string()
  .trim()
  .max(MAX_TEXT)
  .transform((value) => (value === '' ? undefined : value.normalize('NFC')))
  .optional();

export const RECORD_SORTS = ['serial_no', 'year', 'name', 'created_at', 'union_name'] as const;

export const recordListQuery = z.object({
  serial_no: intParam(1, INT4_MAX).optional(),
  year: intParam(YEAR_MIN, YEAR_MAX).optional(),
  division: textParam,
  district: textParam,
  upazila: textParam,
  union_name: textParam,
  q: textParam,
  page: intParam(1, INT4_MAX).default(1),
  page_size: intParam(1, MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  // extra.<key> sorts by a public custom field; an unknown key falls back to serial_no.
  sort: z.union([z.enum(RECORD_SORTS), z.string().regex(/^extra\.[a-z][a-z0-9_]{0,39}$/)]).default('serial_no'),
  order: z.enum(['asc', 'desc']).default('asc'),
});
export type RecordListQuery = z.infer<typeof recordListQuery>;

/**
 * The f.<key>=<value> filters of a list query, before the project's fields are known. A key that
 * isn't a field-key shape can't name a field, so it's ignored like any other unknown key (§4.4.1).
 */
export function fieldFilters(query: Record<string, unknown>): Map<string, string> {
  const filters = new Map<string, string>();
  for (const [name, value] of Object.entries(query)) {
    if (!name.startsWith('f.')) continue;
    const key = name.slice(2);
    if (!FIELD_KEY.test(key)) continue;
    if (typeof value !== 'string' || value.length > MAX_TEXT) {
      throw new AppError('VALIDATION_ERROR', 'ফিল্টারের মান সঠিক নয়', { field: name, reason: 'invalid_type' });
    }
    filters.set(key, value);
  }
  if (filters.size > MAX_FIELD_FILTERS) {
    throw new AppError('VALIDATION_ERROR', `সর্বোচ্চ ${MAX_FIELD_FILTERS}টি ফিল্টার`, { field: 'f', reason: 'too_big' });
  }
  return filters;
}

export const projectRecordsParams = z.object({ key: projectKey });
export const projectSerialParams = z.object({ key: projectKey, n: intParam(1, INT4_MAX) });

// Responses. Strict, so a test that parses one also proves no other column leaks.

export const extraValues = z.record(z.string(), z.union([z.string(), z.number()]));

export const projectRecord = z.strictObject({
  ...housingRecord.shape,
  project_type: projectKey,
  union_name: z.string(),
  extra: extraValues,
});

// Write bodies (§4.4.4, §4.4.5). Strict: an unknown key is a 400, which keeps project_type,
// serial_no on a patch, and every photo URL and thumbnail out of a write, for every role. A photo
// is removed only through its own main_admin route
// (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, "P2 decisions").

const MAX_VALUE_TEXT = 2000;
const customValue = z.union([z.string().max(MAX_VALUE_TEXT), z.number(), z.null()]);

/** The raw-object check behind customValues; openapi.ts describes it, since JSON Schema can't. */
export const customValueKeys = z.custom<Record<string, unknown>>(
  (value) => typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).every((key) => FIELD_KEY.test(key)),
  { message: 'অচেনা ফিল্ড', params: { reason: 'invalid_key' } },
);

/**
 * A map of custom field keys to values. The keys are checked on the raw object before zod copies
 * it, so `__proto__` and other non-field keys are refused (NE-SEC-09) and the error names only the
 * map, never the key that was sent. The database checks each key and value against the project's
 * fields (0013_record_rules.sql).
 */
export const customValues = customValueKeys.pipe(z.record(z.string(), customValue));

const recordWriteFields = {
  ...recordFields,
  union_name: writeText(0, 100),
  extra: customValues,
};

export const recordCreateBody = z.strictObject({
  ...recordWriteFields,
  serial_no: serialNo.optional(),
  father_or_husband_name: recordFields.father_or_husband_name.default(''),
  address: recordFields.address.default(''),
  union_name: recordWriteFields.union_name.default(''),
  extra: recordWriteFields.extra.default({}),
  prev_photo_source: recordFields.prev_photo_source.default(null),
  current_photo_source: recordFields.current_photo_source.default(null),
});
export type RecordCreateBody = z.infer<typeof recordCreateBody>;

/** Any subset; a sent extra replaces the whole column (§4.4.5). */
export const recordPatchBody = z
  .strictObject(recordWriteFields)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'কোনো ফিল্ড দেওয়া হয়নি', params: { reason: 'empty' } });
export type RecordPatchBody = z.infer<typeof recordPatchBody>;

// Private values (§4.4.8): admin-only, replaced as a whole set, read in bulk for the CSV export.

export const MAX_PRIVATE_IDS = 100;

export const privateBody = z.strictObject({ data: customValues });
export type PrivateBody = z.infer<typeof privateBody>;

export const privateManyBody = z.strictObject({ ids: z.array(z.uuid()).max(MAX_PRIVATE_IDS) });

/** A record's private values have the same shape as its public custom values. */
export const privateValues = extraValues;

// Bulk (§4.4.7). The route answers more than MAX_BULK_ROWS rows with 413 before these run; max()
// is only a backstop. Keys of private fields may sit in extra: the bulk functions move them to the
// private table (0014_record_functions_v2.sql).

export const bulkCreateBody = z
  .strictObject({
    mode: z.enum(['assign_serial', 'use_given_serial']),
    rows: z.array(recordCreateBody).min(1).max(MAX_BULK_ROWS),
  })
  .superRefine(checkGivenSerials)
  .transform((body) =>
    body.mode === 'assign_serial' ? { ...body, rows: body.rows.map(({ serial_no: _ignored, ...rest }) => rest) } : body,
  );
export type BulkCreateBody = z.infer<typeof bulkCreateBody>;

/** What `_clear` may empty: optional columns and public custom fields, never a required one by name. */
const CLEARABLE = /^(father_or_husband_name|address|union_name|prev_photo_source|current_photo_source|extra\.[a-z][a-z0-9_]{0,39})$/;
const MAX_CLEAR = 50;

const bulkUpdateRow = z.strictObject({
  serial_no: serialNo,
  year: year.nullish(),
  name: writeText(0, 200).nullish(),
  father_or_husband_name: writeText(0, 200).nullish(),
  division: writeText(0, 100).nullish(),
  district: writeText(0, 100).nullish(),
  upazila: writeText(0, 100).nullish(),
  union_name: writeText(0, 100).nullish(),
  address: writeText(0, 1000).nullish(),
  prev_photo_source: z.string().trim().max(MAX_SOURCE).nullish(),
  current_photo_source: z.string().trim().max(MAX_SOURCE).nullish(),
  extra: customValues.optional(),
  _clear: z
    .array(z.string().regex(CLEARABLE, 'মোছা যায় না এমন ঘর'))
    .max(MAX_CLEAR)
    .transform((keys) => [...new Set(keys)])
    .optional(),
});

/** Leaves only values that change something: null and '' mean "unchanged", so only _clear empties a value. */
const filled = (value: unknown) => value !== null && value !== undefined && value !== '';

export const bulkUpdateBody = z
  .strictObject({ rows: z.array(bulkUpdateRow).min(1).max(MAX_BULK_ROWS) })
  .transform((body) => ({
    rows: body.rows.map((row) => {
      const kept = Object.fromEntries(Object.entries(row).filter(([, value]) => filled(value)));
      if (row.extra) kept.extra = Object.fromEntries(Object.entries(row.extra).filter(([, value]) => filled(value)));
      return kept as typeof row;
    }),
  }));
export type BulkUpdateBody = z.infer<typeof bulkUpdateBody>;
