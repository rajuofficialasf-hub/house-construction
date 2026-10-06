import { z } from 'zod';
import { AppError } from '../errors.js';
import { DEFAULT_PAGE_SIZE, housingRecord, INT4_MAX, MAX_PAGE_SIZE, serialsQuery, YEAR_MAX, YEAR_MIN } from '../housing/schemas.js';
import { projectKey } from '../projects/schemas.js';

// Request and response shapes of the single-record routes (docs/api/PROJECTS_API_CONTRACT.md
// §3.3, §4.4). The routes parse with these and the OpenAPI document is built from them.

export { idParams } from '../housing/schemas.js';
export { serialsQuery };

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
